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

module.exports = router;
