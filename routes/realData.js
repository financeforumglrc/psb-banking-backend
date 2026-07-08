/**
 * Real-world data endpoints.
 *
 * Exposes RBI macro indicators, market instruments/prices, forex rates,
 * and external dataset metadata ingested from public sources.
 */

const express = require('express');
const router = express.Router();
const { marketDb } = require('../services/database');
const { authMiddleware } = require('../middleware/auth');
const dataIngestion = require('../services/dataIngestion');

router.get('/instruments', authMiddleware, (req, res) => {
    try {
        const instruments = marketDb.getInstruments(req.query);
        res.json({ success: true, count: instruments.length, data: instruments });
    } catch (error) {
        console.error('[realData] instruments error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch instruments' });
    }
});

router.get('/instruments/:symbol/prices', authMiddleware, (req, res) => {
    try {
        const instrument = marketDb.findInstrumentBySymbol(req.params.symbol);
        if (!instrument) {
            return res.status(404).json({ success: false, error: 'Instrument not found' });
        }
        const limit = parseInt(req.query.limit) || 30;
        const prices = marketDb.getPrices(instrument.id, limit);
        const latest = marketDb.getLatestPrice(instrument.id);
        res.json({ success: true, instrument, latest, prices });
    } catch (error) {
        console.error('[realData] prices error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch prices' });
    }
});

router.get('/rbi-macro', authMiddleware, (req, res) => {
    try {
        const indicator = req.query.indicator;
        const limit = parseInt(req.query.limit) || 12;
        let data;
        if (indicator) {
            data = marketDb.getRBIMacro(indicator, limit);
        } else {
            data = require('../services/database').db.prepare('SELECT * FROM rbi_macro_data ORDER BY data_date DESC, indicator LIMIT ?').all(limit);
        }
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('[realData] rbi-macro error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch RBI macro data' });
    }
});

router.get('/forex', authMiddleware, (req, res) => {
    try {
        const base = req.query.base || 'USD';
        const quote = req.query.quote || 'INR';
        const rate = marketDb.getForexRate(base, quote);
        if (!rate) {
            return res.status(404).json({ success: false, error: 'Forex rate not found' });
        }
        res.json({ success: true, data: rate });
    } catch (error) {
        console.error('[realData] forex error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch forex rate' });
    }
});

router.get('/datasets', authMiddleware, (req, res) => {
    try {
        const datasets = require('../services/database').db.prepare('SELECT * FROM external_datasets ORDER BY source_name, dataset_key').all();
        res.json({ success: true, count: datasets.length, data: datasets });
    } catch (error) {
        console.error('[realData] datasets error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch datasets' });
    }
});

router.post('/refresh', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        const summary = await dataIngestion.ingestAllRealData();
        res.json({ success: true, message: 'Real-world data refreshed', summary });
    } catch (error) {
        console.error('[realData] refresh error:', error);
        res.status(500).json({ success: false, error: 'Failed to refresh data' });
    }
});

module.exports = router;
