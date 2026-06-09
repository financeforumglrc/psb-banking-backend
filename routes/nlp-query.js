/**
 * Natural Language Query API Routes
 * "What if" analysis via plain English
 */

const express = require('express');
const router = express.Router();
const { parseQuery, executeQuery } = require('../services/nlp-query');

// POST /api/v1/query
// Parse and execute natural language query
router.post('/', (req, res) => {
    try {
        const { query, model } = req.body;
        
        if (!query) {
            return res.status(400).json({ success: false, error: 'Query text required' });
        }
        if (!model || !model.assumptions) {
            return res.status(400).json({ success: false, error: 'Model data required' });
        }
        
        const parsed = parseQuery(query);
        const result = executeQuery(parsed, model);
        
        res.json({
            success: true,
            data: {
                query,
                parsed,
                result,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('NLP query error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            hint: 'Try: "What if WACC increases by 1%?" or "Show me the bull case"'
        });
    }
});

// POST /api/v1/query/parse
// Just parse the query (for debugging)
router.post('/parse', (req, res) => {
    try {
        const { query } = req.body;
        
        if (!query) {
            return res.status(400).json({ success: false, error: 'Query text required' });
        }
        
        const parsed = parseQuery(query);
        
        res.json({
            success: true,
            data: {
                query,
                parsed,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('NLP parse error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
