/**
 * Screener.in API Routes
 *
 * GET /api/v1/screener/search?q=reliance          — autocomplete search
 * GET /api/v1/screener/company/:ticker            — full financial data
 * GET /api/v1/screener/dcf-inputs/:ticker         — DCF-ready model inputs
 * GET /api/v1/screener/peer-compare?tickers=A,B,C — multi-company comparison
 */

const express    = require('express');
const router     = express.Router();
const rateLimit  = require('express-rate-limit');
const { scrapeCompany, searchCompanies, buildDCFInputs } = require('../services/screener-service');

// Be polite: 30 scrape reqs / 5 min per IP
const scraperLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 30,
    message: { success: false, error: 'Screener.in rate limit reached — wait 5 minutes.' }
});

// ── Search ────────────────────────────────────────────────────────────────────
// GET /api/v1/screener/search?q=tata
router.get('/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
        return res.status(400).json({ success: false, error: 'Query must be ≥ 2 characters' });
    }
    try {
        const data = await searchCompanies(q);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[screener/search]', err.message);
        res.status(502).json({ success: false, error: err.message });
    }
});

// ── Full company data ─────────────────────────────────────────────────────────
// GET /api/v1/screener/company/RELIANCE
router.get('/company/:ticker', scraperLimiter, async (req, res) => {
    try {
        const data = await scrapeCompany(req.params.ticker);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[screener/company]', err.message);
        const status = err.message.includes('not found') ? 404
                     : err.message.includes('rate limit')  ? 429 : 502;
        res.status(status).json({ success: false, error: err.message });
    }
});

// ── DCF-ready inputs ──────────────────────────────────────────────────────────
// GET /api/v1/screener/dcf-inputs/TCS
router.get('/dcf-inputs/:ticker', scraperLimiter, async (req, res) => {
    try {
        const data   = await scrapeCompany(req.params.ticker);
        const inputs = buildDCFInputs(data);
        res.json({
            success: true,
            data: {
                inputs,
                meta: {
                    name:      data.info.name,
                    ticker:    data.info.ticker,
                    sector:    data.info.sector,
                    price:     data.info.price,
                    isin:      data.info.isin,
                    fetchedAt: data.fetchedAt,
                    cached:    data.cached || false
                },
                // Include raw P&L years for chart display
                plYears:    data.years.pl,
                revenue:    data.pl.revenue    || [],
                ebitda:     data.pl.ebitda     || [],
                netProfit:  data.pl.netProfit  || [],
                eps:        data.pl.eps        || [],
                cfo:        data.cf.cfo        || [],
                roe:        data.ratios.roe    || [],
                roce:       data.ratios.roce   || [],
                topRatios:  data.keyMetrics || {},
                derived:    data.derived
            }
        });
    } catch (err) {
        console.error('[screener/dcf-inputs]', err.message);
        const status = err.message.includes('not found') ? 404 : 502;
        res.status(status).json({ success: false, error: err.message });
    }
});

// ── Peer comparison ───────────────────────────────────────────────────────────
// GET /api/v1/screener/peer-compare?tickers=TCS,INFY,WIPRO
router.get('/peer-compare', scraperLimiter, async (req, res) => {
    const raw = (req.query.tickers || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    if (raw.length < 2 || raw.length > 6) {
        return res.status(400).json({ success: false, error: 'Provide 2–6 ticker symbols' });
    }
    try {
        const results = await Promise.allSettled(raw.map(t => scrapeCompany(t)));
        const companies = results
            .filter(r => r.status === 'fulfilled')
            .map(r => {
                const d = r.value;
                return {
                    name:          d.info.name,
                    ticker:        d.info.ticker,
                    price:         d.info.price,
                    revenue:       d.derived.latestRevenue,
                    ebitdaMargin:  d.derived.latestEbitdaMargin,
                    netProfit:     d.derived.latestNetProfit,
                    roe:           d.derived.latestRoe,
                    roce:          d.derived.latestRoce,
                    debtEquity:    d.derived.latestDebtEquity,
                    revenueCagr:   d.derived.revenueCagr,
                    profitCagr:    d.derived.profitCagr,
                    promoterHolding: d.derived.promoterHolding,
                    topRatios:     d.topRatios
                };
            });
        const failed = results
            .filter(r => r.status === 'rejected')
            .map((r, i) => ({ ticker: raw[i], error: r.reason?.message }));
        res.json({ success: true, data: { companies, failed } });
    } catch (err) {
        console.error('[screener/peer-compare]', err.message);
        res.status(502).json({ success: false, error: err.message });
    }
});

module.exports = router;
