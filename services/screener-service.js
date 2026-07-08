/**
 * Screener.in Data Service
 * Scrapes fundamental financial data for Indian stocks:
 *   P&L · Balance Sheet · Cash Flow · Ratios · Shareholding
 *
 * Strategy:
 *   1. Fetch the company HTML page from screener.in/company/{TICKER}/
 *   2. Parse tables by known section IDs via targeted regex
 *   3. Build structured JSON + DCF-ready inputs
 *   4. Cache results 15 min per ticker (in-memory Map)
 *
 * No external HTML-parsing deps needed beyond what's in package.json.
 */

const axios = require('axios');

// ── In-memory cache ───────────────────────────────────────────────────────────
const cache      = new Map();
const CACHE_TTL  = 15 * 60 * 1000; // 15 minutes

function fromCache(key) {
    const e = cache.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
    return e.data;
}
function toCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

// ── HTTP client ───────────────────────────────────────────────────────────────
const http = axios.create({
    timeout: 25000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Referer': 'https://www.screener.in/',
        'DNT': '1'
    }
});

// ── Parse a number from Indian-formatted string (1,234.56 Cr / 45.3% / etc.) ─
function num(s) {
    if (s == null || s === '' || s === '--' || s.toLowerCase() === 'n/a') return null;
    const cleaned = String(s)
        .replace(/,/g, '')
        .replace(/[₹$%]/g, '')
        .replace(/Cr\.?/gi, '')
        .replace(/\s+/g, '')
        .trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
}

// ── Extract <table> following a section with a given id ───────────────────────
function extractTable(html, sectionId) {
    const si = html.indexOf(`id="${sectionId}"`);
    if (si === -1) return null;
    const ti = html.indexOf('<table', si);
    if (ti === -1) return null;
    const te = html.indexOf('</table>', ti) + 8;
    const tbl = html.slice(ti, te);

    const rows = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(tbl)) !== null) {
        const cells = [];
        const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let td;
        while ((td = tdRe.exec(tr[1])) !== null) {
            cells.push(
                td[1]
                    .replace(/<[^>]+>/g, '')
                    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
                    .replace(/\s+/g, ' ').trim()
            );
        }
        if (cells.length > 0) rows.push(cells);
    }
    return rows.length > 1 ? rows : null;
}

// ── Match rows by label patterns → { key: [yr1, yr2, ...] } ──────────────────
function matchRows(rows, labelMap) {
    if (!rows) return {};
    const header = rows[0];
    const body   = rows.slice(1);
    const result = {};
    for (const row of body) {
        const label = (row[0] || '').toLowerCase();
        for (const [key, patterns] of Object.entries(labelMap)) {
            if (patterns.some(p => label.includes(p.toLowerCase()))) {
                if (!result[key]) result[key] = row.slice(1).map(num);
            }
        }
    }
    return { _header: header, ...result };
}

// ── Extract key ratio tiles (top-ratios section) ──────────────────────────────
function extractTopRatios(html) {
    const metrics = {};
    const start = html.indexOf('id="top-ratios"');
    if (start === -1) return metrics;
    const block = html.slice(start, start + 5000);
    // Each <li> contains a span.name and a span.number/value
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let li;
    while ((li = liRe.exec(block)) !== null) {
        const inner = li[1];
        const nm = inner.match(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        const vl = inner.match(/<span[^>]*(?:class="[^"]*(?:value|number)[^"]*"|id="[^"]*")[^>]*>([\s\S]*?)<\/span>/i);
        if (nm && vl) {
            const k = nm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            const v = vl[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            if (k) metrics[k] = v;
        }
    }
    return metrics;
}

// ── Extract company name, CMP, ISIN, sector ───────────────────────────────────
function extractInfo(html, ticker) {
    const info = { ticker };
    // Name from <h1>
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) info.name = h1[1].replace(/<[^>]+>/g, '').trim();
    // CMP
    const cmp = html.match(/id="current-price"[^>]*>([\s\S]*?)<\/span>/i)
             || html.match(/class="[^"]*price-value[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (cmp) info.price = num(cmp[1]);
    // ISIN
    const isin = html.match(/([A-Z]{2}[A-Z0-9]{10})/);
    if (isin) info.isin = isin[1];
    // Sector (from breadcrumbs)
    const sec = html.match(/\/stocks\/([^\/\"\']+)\//i);
    if (sec) info.sector = decodeURIComponent(sec[1]).replace(/-/g, ' ');
    info.screener_url = `https://www.screener.in/company/${ticker}/`;
    return info;
}

// ── Last non-null value helper ────────────────────────────────────────────────
const last = arr => arr ? [...arr].reverse().find(v => v != null) ?? null : null;

// ── CAGR over n periods ───────────────────────────────────────────────────────
const cagr = (arr, n) => {
    if (!arr || arr.length < 2 || !arr[0] || !last(arr) || arr[0] <= 0) return null;
    return (Math.pow(last(arr) / arr[0], 1 / n) - 1) * 100;
};

// ── YoY growth ───────────────────────────────────────────────────────────────
const yoy = arr => {
    if (!arr || arr.length < 2) return null;
    const a = arr[arr.length - 2], b = arr[arr.length - 1];
    return (!a || !b) ? null : ((b - a) / Math.abs(a)) * 100;
};

// ── Main scraper ──────────────────────────────────────────────────────────────
async function scrapeCompany(ticker) {
    const clean = ticker.replace(/\.NS$/i, '').replace(/\.BO$/i, '').toUpperCase();
    const cKey  = `company:${clean}`;
    const hit   = fromCache(cKey);
    if (hit) return { ...hit, cached: true };

    const url = `https://www.screener.in/company/${clean}/`;
    let html;
    try {
        const r = await http.get(url);
        html    = r.data;
    } catch (err) {
        if (err.response?.status === 404) throw new Error(`"${clean}" not found on Screener.in. Check ticker symbol.`);
        if (err.response?.status === 429) throw new Error('Screener.in rate limit hit — retry in 60 s');
        throw new Error(`Screener.in fetch failed: ${err.message}`);
    }

    // ── Parse tables ────────────────────────────────────────────────────────
    const plRows  = extractTable(html, 'profit-loss');
    const bsRows  = extractTable(html, 'balance-sheet');
    const cfRows  = extractTable(html, 'cash-flow');
    const ratRows = extractTable(html, 'ratios');
    const shRows  = extractTable(html, 'shareholding');

    const plYears    = plRows  ? plRows[0].slice(1)  : [];
    const ratYears   = ratRows ? ratRows[0].slice(1) : [];
    const shYears    = shRows  ? shRows[0].slice(1)  : [];

    const pl = matchRows(plRows, {
        revenue:       ['sales', 'revenue from operations', 'net sales'],
        expenses:      ['expenses', 'total expenses'],
        ebitda:        ['operating profit', 'ebitda'],
        ebitdaMargin:  ['opm %', 'ebitda margin', 'operating profit margin'],
        otherIncome:   ['other income'],
        depreciation:  ['depreciation', 'amortization'],
        ebit:          ['ebit'],
        interest:      ['interest', 'finance costs'],
        pbt:           ['profit before tax', 'pbt'],
        tax:           ['tax %'],
        netProfit:     ['net profit', 'pat', 'profit after tax'],
        eps:           ['eps in rs', 'earnings per share'],
        dividendPayout:['dividend payout %']
    });

    const bs = matchRows(bsRows, {
        equity:        ['equity capital', 'share capital'],
        reserves:      ['reserves'],
        longTermDebt:  ['borrowings', 'long term borrowings'],
        totalLiab:     ['total liabilities'],
        fixedAssets:   ['fixed assets', 'tangible assets', 'net block'],
        cwip:          ['cwip', 'capital work in progress'],
        investments:   ['investments'],
        totalAssets:   ['total assets'],
        cash:          ['cash', 'cash and cash equivalents']
    });

    const cf = matchRows(cfRows, {
        cfo:     ['cash from operating', 'operating activities'],
        cfi:     ['cash from investing', 'investing activities'],
        cff:     ['cash from financing', 'financing activities'],
        netCash: ['net cash']
    });

    const ratios = matchRows(ratRows, {
        debtEquity:    ['debt / equity', 'debt to equity'],
        currentRatio:  ['current ratio'],
        roe:           ['return on equity', 'roe %'],
        roce:          ['roce', 'return on capital'],
        roa:           ['return on assets', 'roa'],
        interestCover: ['interest coverage'],
        peRatio:       ['price to earning', 'p/e'],
        pbRatio:       ['price to book', 'p/b'],
        evEbitda:      ['ev / ebitda'],
        dividendYield: ['dividend yield']
    });

    const sh = matchRows(shRows, {
        promoters: ['promoters'],
        fii:       ['fii', 'foreign institutional'],
        dii:       ['dii', 'domestic institutional'],
        public:    ['public']
    });

    // ── Derived / summary metrics ────────────────────────────────────────────
    const n = plYears.length || 1;
    const derived = {
        revenueCagr:        cagr(pl.revenue, n - 1),
        profitCagr:         cagr(pl.netProfit, n - 1),
        ebitdaCagr:         cagr(pl.ebitda, n - 1),
        revenueGrowthYoy:   yoy(pl.revenue),
        profitGrowthYoy:    yoy(pl.netProfit),
        latestRevenue:      last(pl.revenue),
        latestEbitda:       last(pl.ebitda),
        latestEbitdaMargin: last(pl.ebitdaMargin),
        latestNetProfit:    last(pl.netProfit),
        latestEps:          last(pl.eps),
        latestCfo:          last(cf.cfo),
        latestCfi:          last(cf.cfi),
        netDebt:            (last(bs.longTermDebt) || 0) - (last(bs.cash) || 0),
        latestRoe:          last(ratios.roe),
        latestRoce:         last(ratios.roce),
        latestDebtEquity:   last(ratios.debtEquity),
        latestCurrentRatio: last(ratios.currentRatio),
        promoterHolding:    last(sh.promoters)
    };

    const result = {
        info:     extractInfo(html, clean),
        topRatios:extractTopRatios(html),
        years:    { pl: plYears, ratios: ratYears, sh: shYears },
        pl, bs, cf, ratios, sh, derived,
        fetchedAt: new Date().toISOString()
    };

    toCache(cKey, result);
    return result;
}

// ── Screener.in autocomplete API ──────────────────────────────────────────────
async function searchCompanies(query) {
    const cKey = `search:${query.toLowerCase().trim()}`;
    const hit  = fromCache(cKey);
    if (hit) return { ...hit, cached: true };

    try {
        const r = await http.get(
            `https://www.screener.in/api/company/search/?q=${encodeURIComponent(query)}&v=3`
        );
        const results = (Array.isArray(r.data) ? r.data : []).slice(0, 15).map(x => ({
            name:   x.name   || '',
            ticker: (x.url || '').replace(/.*\/company\//i, '').replace(/\//g, '').toUpperCase() || x.short_name || '',
            isin:   x.isin   || '',
            url:    x.url    || ''
        }));
        const out = { query, results };
        toCache(cKey, out);
        return out;
    } catch (err) {
        throw new Error(`Screener.in search failed: ${err.message}`);
    }
}

// ── Build DCF-ready input object ──────────────────────────────────────────────
function buildDCFInputs(data) {
    const { pl, bs, derived, info } = data;

    // Avg revenue growth last 5 years
    const revs = (pl.revenue || []).slice(-6);
    let growthSum = 0, growthCnt = 0;
    for (let i = 1; i < revs.length; i++) {
        if (revs[i - 1] && revs[i] && revs[i - 1] > 0) {
            growthSum += ((revs[i] - revs[i - 1]) / revs[i - 1]) * 100;
            growthCnt++;
        }
    }
    const avgGrowth = growthCnt > 0 ? growthSum / growthCnt : 10;

    // Tax rate: average of last 3 periods from P&L tax %
    const taxes  = (pl.tax || []).filter(Boolean).slice(-3);
    const taxAvg = taxes.length > 0 ? taxes.reduce((a, b) => a + b, 0) / taxes.length : 25.17;

    return {
        company:      info.name    || info.ticker,
        ticker:       info.ticker,
        price:        info.price   || 0,
        shares:       derived.latestRevenue && derived.latestEps
                        ? (derived.latestNetProfit / derived.latestEps).toFixed(2)
                        : null,
        baseRev:      derived.latestRevenue    || 0,
        ebitdaMargin: derived.latestEbitdaMargin || 15,
        netDebt:      Math.max(0, derived.netDebt || 0),
        taxRate:      Math.max(10, Math.min(40, parseFloat(taxAvg.toFixed(2)))),
        growth1:      parseFloat(Math.max(2, Math.min(50, avgGrowth)).toFixed(1)),
        growth2:      parseFloat(Math.max(2, Math.min(30, avgGrowth * 0.65)).toFixed(1)),
        wacc:         10.5,
        tgr:          3.0,
        roe:          derived.latestRoe  || null,
        roce:         derived.latestRoce || null,
        eps:          derived.latestEps  || null
    };
}

module.exports = { scrapeCompany, searchCompanies, buildDCFInputs };
