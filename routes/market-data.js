/**
 * Market Data API Routes
 * Real-time stock quotes, historical data, comparables
 */

const express = require('express');
const router = express.Router();
const { 
    getQuote, 
    getHistoricalData, 
    getComparableCompanies,
    getPrecedentTransactions,
    getIndustryBenchmarks
} = require('../services/market-data');

// GET /api/v1/market/quote/:ticker
// Real-time stock quote
router.get('/quote/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        const data = await getQuote(ticker);
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: `Unable to fetch data for ${ticker}. Try adding .NS for NSE (e.g., RELIANCE.NS)` 
            });
        }
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Quote error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch market data' });
    }
});

// GET /api/v1/market/historical/:ticker
// Historical price data
router.get('/historical/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        const { range = '1y', interval = '1d' } = req.query;
        
        const data = await getHistoricalData(ticker, range, interval);
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: `Unable to fetch historical data for ${ticker}` 
            });
        }
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Historical error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch historical data' });
    }
});

// GET /api/v1/market/comparables/:ticker
// Comparable company analysis
router.get('/comparables/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        const data = await getComparableCompanies(ticker);
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: `No peer set found for ${ticker}. Available: RELIANCE.NS, TCS.NS, INFY.NS` 
            });
        }
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Comparables error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch comparable data' });
    }
});

// GET /api/v1/market/precedent-transactions/:sector
// Precedent M&A transactions
router.get('/precedent-transactions/:sector', (req, res) => {
    try {
        const { sector } = req.params;
        const data = getPrecedentTransactions(decodeURIComponent(sector));
        
        res.json({ 
            success: true, 
            data: {
                sector: decodeURIComponent(sector),
                transactions: data,
                count: data.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Precedent transactions error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch transaction data' });
    }
});

// GET /api/v1/market/benchmarks/:sector
// Industry benchmark metrics
router.get('/benchmarks/:sector', (req, res) => {
    try {
        const { sector } = req.params;
        const data = getIndustryBenchmarks(decodeURIComponent(sector));
        
        if (!data.benchmarks) {
            return res.status(404).json({ 
                success: false, 
                error: `No benchmarks found for sector: ${sector}. Available: IT Services, Conglomerate, Banking` 
            });
        }
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Benchmarks error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch benchmark data' });
    }
});

/**
 * @route   GET /api/v1/market/macro-signals
 * @desc    Mock macro-economic signal tower + auto-triggered recommendations
 * @access  Public
 */
router.get('/macro-signals', (req, res) => {
    try {
        const signals = [
            { indicator: 'RBI Repo Rate', value: '6.75%', trend: 'up', change: '+0.25 bps', note: 'Hawkish pause' },
            { indicator: 'CPI Inflation', value: '7.40%', trend: 'up', change: '+0.30%', note: 'Above RBI comfort zone' },
            { indicator: 'USD/INR', value: '₹84.50', trend: 'up', change: '+0.20', note: 'Rupee under pressure' },
            { indicator: 'Gold (10g)', value: '₹77,800', trend: 'up', change: '+1.20%', note: 'Near all-time high' },
            { indicator: 'Crude Oil', value: '$78.40', trend: 'flat', change: '0.00%', note: 'Range-bound' },
            { indicator: 'US 10Y Yield', value: '4.25%', trend: 'down', change: '-0.05%', note: 'FPI flows positive' },
        ];

        const recommendations = [
            {
                id: 'macro-001',
                title: 'Sell gold, shift to FD',
                description: 'Gold is near an all-time high and real rates are rising. Book partial profits and sweep into a 91-day Corporate FD for 7.4%.',
                trigger: 'Gold up + repo rising',
                impact: 'high',
                action: 'Rebalance now',
                icon: 'fa-coins',
            },
            {
                id: 'macro-002',
                title: 'Switch to floating-rate FD / prepay loan',
                description: 'RBI repo is in an upward cycle. Lock into floating-rate deposits or prepay high-cost floating loans before the next EMI reset.',
                trigger: 'Repo rising',
                impact: 'medium',
                action: 'Check FD rates',
                icon: 'fa-percent',
            },
            {
                id: 'macro-003',
                title: 'Reduce debt duration, increase equity SIP',
                description: 'Inflation is above 6%. Shorten gilt/duration funds and add ₹2,000 to a Nifty 50 index SIP to beat inflation.',
                trigger: 'Inflation > 6%',
                impact: 'medium',
                action: 'Top-up SIP',
                icon: 'fa-chart-line',
            },
            {
                id: 'macro-004',
                title: 'Hedge INR exposure',
                description: 'Rupee is weakening. Consider international equity / remit NRE funds now before further depreciation.',
                trigger: 'USD/INR rising',
                impact: 'low',
                action: 'Explore NRI options',
                icon: 'fa-globe',
            },
        ];

        res.json({
            success: true,
            data: {
                // Scalar fields matching the frontend MarketData type
                niftyPe: 26.4,
                repoRate: 6.5,
                inflation: 5.2,
                goldPrice: 75800,
                usdInr: 86.7,
                fdRate: 7.25,
                signals,
                recommendations,
                lastUpdated: new Date().toISOString(),
            }
        });
    } catch (error) {
        console.error('Macro signals error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch macro signals' });
    }
});

// GET /api/v1/market/summary/:ticker
// Full market summary (quote + comparables + benchmarks)
router.get('/summary/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        
        const [quote, comparables] = await Promise.all([
            getQuote(ticker),
            getComparableCompanies(ticker)
        ]);
        
        if (!quote) {
            return res.status(404).json({ 
                success: false, 
                error: `Unable to fetch data for ${ticker}` 
            });
        }
        
        const benchmarks = comparables?.sector 
            ? getIndustryBenchmarks(comparables.sector)
            : null;
        
        res.json({
            success: true,
            data: {
                quote,
                comparables,
                benchmarks,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Summary error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch market summary' });
    }
});

// GET /api/v1/market/snapshot
// Aggregated live snapshot: indices, watchlist, nifty chart
router.get('/snapshot', async (req, res) => {
    try {
        const indicesSymbols = ['^NSEI', '^BSESN', '^GSPC', '^FTSE', '^N225', '^GDAXI', '^HSI'];
        const watchlistSymbols = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS'];

        const indices = (await Promise.all(
            indicesSymbols.map(async (sym) => {
                try {
                    const q = await getQuote(sym);
                    return {
                        symbol: sym,
                        name: q.name || sym,
                        value: q.price,
                        change: q.change_percent,
                        currency: q.currency || 'INR',
                    };
                } catch (e) {
                    return null;
                }
            })
        )).filter(Boolean);

        const watchlist = (await Promise.all(
            watchlistSymbols.map(async (sym) => {
                try {
                    const q = await getQuote(sym);
                    const hist = await getHistoricalData(sym, '1mo', '1d');
                    const spark = hist?.data?.map((d) => d.price).filter((p) => p != null) || [];
                    return {
                        symbol: q.ticker.replace('.NS', ''),
                        name: q.name || q.ticker,
                        price: q.price,
                        change: q.change_percent,
                        spark,
                    };
                } catch (e) {
                    return null;
                }
            })
        )).filter(Boolean);

        const niftyHistory = await getHistoricalData('^NSEI', '1y', '1d');

        res.json({
            success: true,
            data: {
                indices,
                watchlist,
                niftyHistory: niftyHistory?.data || [],
                timestamp: new Date().toISOString(),
            }
        });
    } catch (error) {
        console.error('Snapshot error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch market snapshot' });
    }
});

// GET /api/v1/market/news
// Today-only curated news feed
router.get('/news', (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const allNews = [
            { title: 'RBI keeps repo rate unchanged at 6.5%', source: 'RBI', time: '09:30', category: 'policy' },
            { title: 'NIFTY hits new intraday high on FII buying', source: 'Markets', time: '10:15', category: 'markets' },
            { title: 'India CPI inflation cools to 5.1% in May', source: 'Economy', time: '11:00', category: 'economy' },
            { title: 'US Fed signals one rate cut later this year', source: 'Global', time: '12:45', category: 'global' },
            { title: 'Rupee firms to 83.15 against US dollar', source: 'Forex', time: '14:20', category: 'markets' },
        ];
        res.json({
            success: true,
            data: {
                date: today,
                news: allNews,
            }
        });
    } catch (error) {
        console.error('News error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch news' });
    }
});

// GET /api/v1/market/calendar
// Economic calendar
router.get('/calendar', (req, res) => {
    try {
        const today = new Date();
        const fmt = (d) => d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        const calendar = [
            { date: fmt(today), event: 'RBI MPC Decision', impact: 'high', forecast: 'Repo rate unchanged at 6.5%' },
            { date: fmt(new Date(today.getTime() + 2 * 86400000)), event: 'US Fed Chair Speech', impact: 'medium', forecast: 'Rate guidance expected' },
            { date: fmt(new Date(today.getTime() + 5 * 86400000)), event: 'GDP Q1 Data (India)', impact: 'high', forecast: 'Growth ~6.8% YoY' },
            { date: fmt(new Date(today.getTime() + 9 * 86400000)), event: 'Auto Sales Data', impact: 'medium', forecast: 'PV sales +8% MoM' },
            { date: fmt(new Date(today.getTime() + 12 * 86400000)), event: 'FOMC Minutes', impact: 'medium', forecast: 'Hawkish tone likely' },
        ];
        res.json({ success: true, data: calendar });
    } catch (error) {
        console.error('Calendar error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch calendar' });
    }
});

// GET /api/v1/market/holidays
// Trading and banking holidays (India 2026)
router.get('/holidays', (req, res) => {
    try {
        const holidays = [
            { date: '2026-01-26', name: 'Republic Day', type: 'banking' },
            { date: '2026-03-17', name: 'Holi', type: 'trading' },
            { date: '2026-04-02', name: 'Mahavir Jayanti', type: 'trading' },
            { date: '2026-04-03', name: 'Good Friday', type: 'banking' },
            { date: '2026-04-14', name: 'Dr. Ambedkar Jayanti', type: 'trading' },
            { date: '2026-05-01', name: 'Maharashtra Day / Labour Day', type: 'trading' },
            { date: '2026-08-15', name: 'Independence Day', type: 'banking' },
            { date: '2026-08-17', name: 'Parsi New Year', type: 'trading' },
            { date: '2026-09-17', name: 'Ganesh Chaturthi', type: 'trading' },
            { date: '2026-10-02', name: 'Gandhi Jayanti / Dussehra', type: 'banking' },
            { date: '2026-11-09', name: 'Diwali Laxmi Puja', type: 'trading' },
            { date: '2026-11-25', name: 'Guru Nanak Jayanti', type: 'trading' },
            { date: '2026-12-25', name: 'Christmas', type: 'banking' },
        ];
        res.json({ success: true, data: holidays });
    } catch (error) {
        console.error('Holidays error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch holidays' });
    }
});

module.exports = router;
