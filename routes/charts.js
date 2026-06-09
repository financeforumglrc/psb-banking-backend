/**
 * Charts API Routes
 * Interactive valuation chart data endpoints
 */

const express = require('express');
const router = express.Router();
const { 
    generateFootballField, 
    generateWaterfallBridge, 
    generateTornadoChart, 
    runMonteCarlo,
    generateSensitivityMatrix 
} = require('../services/chart-engine');

// POST /api/v1/charts/football-field
// Generate football field valuation chart data
router.post('/football-field', (req, res) => {
    try {
        const { model } = req.body;
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        const data = generateFootballField(model);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Football field error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/v1/charts/waterfall
// Generate waterfall bridge chart data
router.post('/waterfall', (req, res) => {
    try {
        const { model } = req.body;
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        const data = generateWaterfallBridge(model);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Waterfall error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/v1/charts/tornado
// Generate tornado sensitivity chart data
router.post('/tornado', (req, res) => {
    try {
        const { model } = req.body;
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        const data = generateTornadoChart(model);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Tornado error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/v1/charts/monte-carlo
// Run Monte Carlo simulation
router.post('/monte-carlo', (req, res) => {
    try {
        const { model, iterations = 10000 } = req.body;
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        // Cap iterations for performance
        const cappedIterations = Math.min(iterations, 50000);
        const data = runMonteCarlo(model, cappedIterations);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Monte Carlo error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/v1/charts/sensitivity-matrix
// Generate 2-way sensitivity matrix
router.post('/sensitivity-matrix', (req, res) => {
    try {
        const { model } = req.body;
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        const data = generateSensitivityMatrix(model);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Sensitivity matrix error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/v1/charts/all
// Generate all charts at once
router.post('/all', (req, res) => {
    try {
        const { model, monte_iterations = 5000 } = req.body;
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        const data = {
            football_field: generateFootballField(model),
            waterfall: generateWaterfallBridge(model),
            tornado: generateTornadoChart(model),
            monte_carlo: runMonteCarlo(model, Math.min(monte_iterations, 20000)),
            sensitivity_matrix: generateSensitivityMatrix(model)
        };
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('All charts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
