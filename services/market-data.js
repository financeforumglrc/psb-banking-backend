/**
 * Market Data Service
 * Fetches real-time and historical stock data
 * Uses Yahoo Finance proxy (free, no API key needed)
 */

const axios = require('axios');

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_QUOTE_BASE = 'https://query1.finance.yahoo.com/v7/finance/quote';

const MOCK_QUOTES = {
    'NIFTY50': { price: 22450.50, change: 76.20, changePercent: 0.34, name: 'NIFTY 50' },
    'SENSEX':  { price: 73890.00, change: 205.40, changePercent: 0.28, name: 'BSE SENSEX' },
    'RELIANCE.NS': { price: 2845.60, change: -3.40, changePercent: -0.12, name: 'Reliance Industries' },
    'TCS.NS':  { price: 3924.15, change: 17.60, changePercent: 0.45, name: 'Tata Consultancy Services' },
    'HDFCBANK.NS': { price: 1612.30, change: 3.55, changePercent: 0.22, name: 'HDFC Bank' },
    'INFY.NS': { price: 1478.90, change: -1.20, changePercent: -0.08, name: 'Infosys' },
};

// ============================================
// REAL-TIME QUOTE WITH FALLBACK CHAIN
// Source 1: Yahoo Finance v7
// Source 2: Alpha Vantage (if ALPHA_VANTAGE_KEY set)
// Source 3: Mock fallback (always works)
// ============================================
async function getQuoteWithFallback(ticker) {
    // Source 1: Yahoo Finance (unofficial)
    try {
        const url = `${YAHOO_QUOTE_BASE}?symbols=${encodeURIComponent(ticker)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,trailingPE,forwardPE,priceToBook,enterpriseToEbitda,dividendYield,bookValue,sharesOutstanding,shortName,longName,sector,industry`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error('Yahoo returned ' + res.status);
        const data = await res.json();
        const result = data?.quoteResponse?.result?.[0];
        if (!result || result.regularMarketPrice == null) throw new Error('No result in Yahoo response');
        return {
            ticker: result.symbol,
            name: result.shortName || result.longName,
            price: result.regularMarketPrice,
            change: result.regularMarketChange,
            change_percent: result.regularMarketChangePercent,
            day_high: result.regularMarketDayHigh,
            day_low: result.regularMarketDayLow,
            volume: result.regularMarketVolume,
            high_52w: result.fiftyTwoWeekHigh,
            low_52w: result.fiftyTwoWeekLow,
            market_cap: result.marketCap,
            pe_trailing: result.trailingPE,
            pe_forward: result.forwardPE,
            pb: result.priceToBook,
            ev_ebitda: result.enterpriseToEbitda,
            dividend_yield: result.dividendYield,
            book_value: result.bookValue,
            shares_outstanding: result.sharesOutstanding,
            sector: result.sector,
            industry: result.industry,
            currency: result.currency || 'INR',
            source: 'yahoo',
            timestamp: new Date().toISOString()
        };
    } catch (e1) {
        console.warn(`[market] Yahoo failed for ${ticker}:`, e1.message);
    }

    // Source 2: Alpha Vantage free tier
    const avKey = process.env.ALPHA_VANTAGE_KEY;
    if (avKey) {
        try {
            const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${avKey}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await res.json();
            const q = data?.['Global Quote'];
            if (q?.['05. price']) {
                return {
                    ticker,
                    name: ticker,
                    price: parseFloat(q['05. price']),
                    change: parseFloat(q['09. change'] || '0'),
                    change_percent: parseFloat((q['10. change percent'] || '0').replace('%', '')),
                    day_high: null,
                    day_low: null,
                    volume: parseInt(q['06. volume'] || '0', 10),
                    high_52w: null,
                    low_52w: null,
                    market_cap: null,
                    pe_trailing: null,
                    pe_forward: null,
                    pb: null,
                    ev_ebitda: null,
                    dividend_yield: null,
                    book_value: null,
                    shares_outstanding: null,
                    sector: null,
                    industry: null,
                    currency: 'INR',
                    source: 'alphavantage',
                    timestamp: new Date().toISOString()
                };
            }
        } catch (e2) {
            console.warn(`[market] Alpha Vantage failed for ${ticker}:`, e2.message);
        }
    }

    // Source 3: Mock fallback — always works
    const mock = MOCK_QUOTES[ticker] || { price: 1000, change: 0, changePercent: 0, name: ticker };
    return {
        ticker,
        name: mock.name,
        price: mock.price,
        change: mock.change,
        change_percent: mock.changePercent,
        day_high: null,
        day_low: null,
        volume: 0,
        high_52w: null,
        low_52w: null,
        market_cap: null,
        pe_trailing: null,
        pe_forward: null,
        pb: null,
        ev_ebitda: null,
        dividend_yield: null,
        book_value: null,
        shares_outstanding: null,
        sector: null,
        industry: null,
        currency: 'INR',
        source: 'mock',
        timestamp: new Date().toISOString()
    };
}

async function getQuote(ticker) {
    const quote = await getQuoteWithFallback(ticker);
    return quote || null;
}

// ============================================
// HISTORICAL PRICE DATA (for charts)
// ============================================
async function getHistoricalData(ticker, range = '1y', interval = '1d') {
    try {
        const url = `${YAHOO_FINANCE_BASE}/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&includeAdjustedClose=true`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const result = response.data?.chart?.result?.[0];
        if (!result) return null;
        
        const timestamps = result.timestamp || [];
        const quotes = result.indicators?.quote?.[0] || {};
        const closes = quotes.close || [];
        const volumes = quotes.volume || [];
        const adjcloses = result.indicators?.adjclose?.[0]?.adjclose || [];
        
        const data = timestamps.map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            price: closes[i],
            volume: volumes[i],
            adj_close: adjcloses[i] || closes[i]
        })).filter(d => d.price !== null);
        
        return {
            ticker,
            range,
            interval,
            data,
            meta: {
                currency: result.meta?.currency,
                exchange: result.meta?.exchangeName,
                instrument_type: result.meta?.instrumentType
            }
        };
    } catch (error) {
        console.error(`Historical data fetch failed for ${ticker}:`, error.message);
        return null;
    }
}

// ============================================
// COMPARABLE COMPANY DATA
// Pre-loaded peer sets for major Indian companies
// ============================================
const PEER_SETS = {
    'RELIANCE.NS': {
        peers: ['RELIANCE.NS', 'TATAMOTORS.NS', 'HDFCBANK.NS', 'TCS.NS'],
        sector: 'Conglomerate',
        name: 'Reliance Industries'
    },
    'TCS.NS': {
        peers: ['TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS'],
        sector: 'IT Services',
        name: 'Tata Consultancy Services'
    },
    'INFY.NS': {
        peers: ['INFY.NS', 'TCS.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS'],
        sector: 'IT Services',
        name: 'Infosys'
    }
};

async function getComparableCompanies(ticker) {
    const peerSet = PEER_SETS[ticker];
    if (!peerSet) return null;
    
    const companies = [];
    for (const peer of peerSet.peers) {
        const quote = await getQuote(peer);
        if (quote) {
            companies.push({
                ticker: quote.ticker,
                name: quote.name,
                price: quote.price,
                market_cap: quote.market_cap,
                pe: quote.pe_trailing,
                forward_pe: quote.pe_forward,
                ev_ebitda: quote.ev_ebitda,
                pb: quote.pb,
                dividend_yield: quote.dividend_yield,
                change_percent: quote.change_percent,
                sector: quote.sector
            });
        }
    }
    
    // Calculate sector medians
    const medians = {
        pe: median(companies.map(c => c.pe).filter(Boolean)),
        ev_ebitda: median(companies.map(c => c.ev_ebitda).filter(Boolean)),
        pb: median(companies.map(c => c.pb).filter(Boolean)),
        dividend_yield: median(companies.map(c => c.dividend_yield).filter(Boolean))
    };
    
    return {
        target: ticker,
        sector: peerSet.sector,
        companies,
        medians,
        timestamp: new Date().toISOString()
    };
}

// ============================================
// PRESEDENT TRANSACTIONS (Mock data for demo)
// In production, this would come from a data provider
// ============================================
function getPrecedentTransactions(sector) {
    const transactions = {
        'IT Services': [
            { acquirer: 'HCL Tech', target: 'IBM Products', date: '2018-12', ev_usd_bn: 1.8, ev_ebitda: 8.5, premium_pct: 12 },
            { acquirer: 'L&T Infotech', target: 'Mindtree', date: '2019-06', ev_usd_bn: 2.2, ev_ebitda: 12.3, premium_pct: 65 },
            { acquirer: 'Infosys', target: 'GuideVision', date: '2020-10', ev_usd_bn: 0.03, ev_ebitda: 15.0, premium_pct: 0 },
            { acquirer: 'Wipro', target: 'Capco', date: '2021-03', ev_usd_bn: 1.5, ev_ebitda: 18.2, premium_pct: 0 },
            { acquirer: 'Infosys', target: 'InSemi', date: '2024-01', ev_usd_bn: 0.033, ev_ebitda: 14.0, premium_pct: 0 }
        ],
        'Conglomerate': [
            { acquirer: 'Birla Group', target: 'Century Textiles', date: '2018-05', ev_usd_bn: 0.4, ev_ebitda: 6.2, premium_pct: 8 },
            { acquirer: 'Reliance', target: 'Future Group Retail', date: '2020-08', ev_usd_bn: 3.4, ev_ebitda: 11.5, premium_pct: 0 },
            { acquirer: 'Tata Group', target: 'Air India', date: '2021-10', ev_usd_bn: 2.4, ev_ebitda: null, premium_pct: 0 }
        ]
    };
    
    return transactions[sector] || [];
}

// ============================================
// INDUSTRY BENCHMARKS
// ============================================
const INDUSTRY_BENCHMARKS = {
    'IT Services': {
        revenue_growth: { p25: 0.08, p50: 0.12, p75: 0.18, mean: 0.13 },
        ebitda_margin: { p25: 0.18, p50: 0.24, p75: 0.30, mean: 0.24 },
        net_margin: { p25: 0.12, p50: 0.16, p75: 0.20, mean: 0.16 },
        roe: { p25: 0.22, p50: 0.28, p75: 0.35, mean: 0.28 },
        debt_equity: { p25: 0.05, p50: 0.10, p75: 0.20, mean: 0.12 },
        current_ratio: { p25: 1.8, p50: 2.5, p75: 3.5, mean: 2.6 }
    },
    'Conglomerate': {
        revenue_growth: { p25: 0.05, p50: 0.10, p75: 0.15, mean: 0.10 },
        ebitda_margin: { p25: 0.12, p50: 0.16, p75: 0.22, mean: 0.16 },
        net_margin: { p25: 0.08, p50: 0.12, p75: 0.16, mean: 0.12 },
        roe: { p25: 0.10, p50: 0.14, p75: 0.18, mean: 0.14 },
        debt_equity: { p25: 0.30, p50: 0.50, p75: 0.80, mean: 0.55 },
        current_ratio: { p25: 1.2, p50: 1.5, p75: 2.0, mean: 1.5 }
    },
    'Banking': {
        revenue_growth: { p25: 0.08, p50: 0.14, p75: 0.20, mean: 0.14 },
        ebitda_margin: { p25: 0.35, p50: 0.45, p75: 0.55, mean: 0.45 },
        net_margin: { p25: 0.15, p50: 0.20, p75: 0.25, mean: 0.20 },
        roe: { p25: 0.12, p50: 0.15, p75: 0.18, mean: 0.15 },
        debt_equity: { p25: 5.0, p50: 8.0, p75: 12.0, mean: 8.5 },
        current_ratio: { p25: null, p50: null, p75: null, mean: null }
    }
};

function getIndustryBenchmarks(sector) {
    return {
        sector,
        benchmarks: INDUSTRY_BENCHMARKS[sector] || null,
        timestamp: new Date().toISOString()
    };
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function median(arr) {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

module.exports = {
    getQuote,
    getHistoricalData,
    getComparableCompanies,
    getPrecedentTransactions,
    getIndustryBenchmarks,
    PEER_SETS
};
