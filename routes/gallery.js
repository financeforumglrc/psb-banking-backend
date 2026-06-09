/**
 * Public Model Gallery Routes for dsFinancial Phase 2 v2
 * GET /api/v1/gallery — list public models
 * GET /api/v1/gallery/:slug — get one public model
 */

const express = require('express');
const { modelDb } = require('../services/database');
const { computeDCF } = require('../services/dcf-engine');
const router = express.Router();

/**
 * @route   GET /api/v1/gallery
 * @desc    List all public gallery models
 * @access  Public
 */
router.get('/', (req, res) => {
    try {
        const models = modelDb.getPublic();
        const list = models.map((m) => ({
            slug: m.slug,
            company_name: m.company_name,
            ticker: m.ticker,
            exchange: m.exchange,
            updated_at: m.updated_at,
        }));

        res.json({ success: true, data: list });
    } catch (error) {
        console.error('Gallery list error:', error);
        res.status(500).json({ success: false, error: 'Failed to load gallery' });
    }
});

/**
 * @route   GET /api/v1/gallery/:slug
 * @desc    Get a single public model by slug
 * @access  Public
 */
router.get('/:slug', (req, res) => {
    try {
        const model = modelDb.findBySlug(req.params.slug);
        if (!model) {
            return res.status(404).json({ success: false, error: 'Model not found' });
        }

        const parsed = JSON.parse(model.model_json);

        // Compute DCF outputs at runtime from model inputs
        const dcfResult = computeDCF(parsed);
        if (parsed.dcf) {
            parsed.dcf.outputs = dcfResult;
        }

        res.json({
            success: true,
            data: {
                slug: model.slug,
                company_name: model.company_name,
                ticker: model.ticker,
                exchange: model.exchange,
                ...parsed,
                updated_at: model.updated_at,
            },
        });
    } catch (error) {
        console.error('Gallery detail error:', error);
        res.status(500).json({ success: false, error: 'Failed to load model' });
    }
});

module.exports = router;
