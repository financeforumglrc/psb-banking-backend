/**
 * Scenario Manager API Routes
 * Base / Upside / Downside / Custom scenario analysis
 */

const express = require('express');
const router = express.Router();
const { 
    applyScenario, 
    generateScenarioComparison, 
    createCustomScenario,
    generateLBOSenarios
} = require('../services/scenario-engine');

// POST /api/v1/scenarios/compare
// Generate all scenarios for side-by-side comparison
router.post('/compare', (req, res) => {
    try {
        const { model } = req.body;
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        const data = generateScenarioComparison(model);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Scenario compare error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/v1/scenarios/:scenarioKey
// Apply a specific scenario
router.post('/:scenarioKey', (req, res) => {
    try {
        const { scenarioKey } = req.params;
        const { model } = req.body;
        
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        const data = applyScenario(model, scenarioKey);
        if (!data) {
            return res.status(400).json({ success: false, error: `Unknown scenario: ${scenarioKey}` });
        }
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Scenario apply error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/v1/scenarios/custom
// Create a custom scenario
router.post('/custom', (req, res) => {
    try {
        const { model, name, adjustments } = req.body;
        
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        if (!adjustments || Object.keys(adjustments).length === 0) {
            return res.status(400).json({ success: false, error: 'Adjustments required' });
        }
        
        const data = createCustomScenario(model, name, adjustments);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Custom scenario error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/v1/scenarios/lbo
// LBO scenario analysis
router.post('/lbo', (req, res) => {
    try {
        const { lbo_params } = req.body;
        
        if (!lbo_params) {
            return res.status(400).json({ success: false, error: 'LBO parameters required' });
        }
        
        const data = generateLBOSenarios(lbo_params);
        res.json({ success: true, data });
    } catch (error) {
        console.error('LBO scenario error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
