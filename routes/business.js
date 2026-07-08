/**
 * Business / SME Banking Routes
 * Cash flow, surplus fund advisor, and working capital health
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Demo mode support
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const { DEMO_USER } = require('../services/demoData');

function isDemoUser(req) {
    return DEMO_MODE && req.user?.id === 'demo-001';
}

/**
 * Middleware that requires a valid Bearer token in normal mode, but falls back
 * to the demo user when DEMO_MODE is enabled. This lets hackathon judges explore
 * the SME module without logging in, while keeping auth in production/test.
 */
function businessAuthMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);
    let resolved = false;

    res.json = function(body) {
        if (!resolved && res.statusCode === 401 && DEMO_MODE && DEMO_USER) {
            resolved = true;
            res.json = originalJson;
            res.status(200);
            req.user = DEMO_USER;
            return next();
        }
        resolved = true;
        res.json = originalJson;
        return originalJson(body);
    };

    authMiddleware(req, res, (err) => {
        if (resolved) return;
        resolved = true;
        res.json = originalJson;
        if (err) return next(err);
        next();
    });
}

/**
 * @route   GET /api/v1/business/sme-dashboard
 * @desc    SME dashboard summary
 * @access  Private (demo fallback)
 */
router.get('/sme-dashboard', businessAuthMiddleware, (req, res) => {
    try {
        if (isDemoUser(req)) {
            return res.json({
                success: true,
                data: {
                    businessName: 'Arora Traders Pvt Ltd',
                    turnover: 24500000,
                    avgMonthlyInflow: 2041667,
                    avgMonthlyOutflow: 1895000,
                    surplusThisMonth: 146667,
                    workingCapitalScore: 78,
                    pendingInvoices: 12,
                    upcomingPayables: 8,
                }
            });
        }

        res.json({
            success: true,
            data: {
                businessName: req.user.businessName || 'Your Business',
                turnover: 0,
                avgMonthlyInflow: 0,
                avgMonthlyOutflow: 0,
                surplusThisMonth: 0,
                workingCapitalScore: 0,
                pendingInvoices: 0,
                upcomingPayables: 0,
            }
        });
    } catch (error) {
        console.error('SME dashboard error:', error);
        res.status(500).json({ success: false, error: 'Failed to load SME dashboard' });
    }
});

/**
 * @route   GET /api/v1/business/cash-flow
 * @desc    12-month cash flow timeline
 * @access  Private (demo fallback)
 */
router.get('/cash-flow', businessAuthMiddleware, (req, res) => {
    try {
        const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
        const data = months.map((month, i) => {
            const baseInflow = 1800000 + (i % 3 === 0 ? 450000 : 0);
            const baseOutflow = 1650000 + (i % 4 === 0 ? 300000 : 0);
            return {
                month,
                inflow: baseInflow + Math.round(Math.random() * 200000),
                outflow: baseOutflow + Math.round(Math.random() * 150000),
                net: 0,
            };
        }).map(d => ({ ...d, net: d.inflow - d.outflow }));

        res.json({ success: true, data });
    } catch (error) {
        console.error('Cash flow error:', error);
        res.status(500).json({ success: false, error: 'Failed to load cash flow' });
    }
});

/**
 * @route   GET /api/v1/business/surplus
 * @desc    Surplus fund advisor recommendations
 * @access  Private (demo fallback)
 */
router.get('/surplus', businessAuthMiddleware, (req, res) => {
    try {
        const surplus = 550000;
        res.json({
            success: true,
            data: {
                currentSurplus: surplus,
                projections: [
                    { action: 'Sweep to 91-day Corporate FD', allocation: 300000, returnRate: 7.4, tenure: '3 months', projectedValue: 305550, risk: 'low' },
                    { action: 'Liquid Mutual Fund', allocation: 150000, returnRate: 6.8, tenure: 'Liquid', projectedValue: 152550, risk: 'low' },
                    { action: 'Prepay high-cost vendor credit', allocation: 100000, returnRate: 14.0, tenure: 'Immediate', projectedValue: 114000, risk: 'zero' },
                ]
            }
        });
    } catch (error) {
        console.error('Surplus advisor error:', error);
        res.status(500).json({ success: false, error: 'Failed to load surplus advisor' });
    }
});

/**
 * @route   GET /api/v1/business/working-capital
 * @desc    Working capital health metrics
 * @access  Private (demo fallback)
 */
router.get('/working-capital', businessAuthMiddleware, (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                score: 78,
                status: 'Healthy',
                grade: 'B+',
                currentRatio: 1.42,
                quickRatio: 1.18,
                receivableDays: 38,
                payableDays: 32,
                inventoryDays: 24,
                cashConversionCycle: 30,
                alerts: [
                    { severity: 'medium', message: '3 invoices are overdue by >45 days — consider follow-up or invoice discounting.' },
                    { severity: 'low', message: 'Vendor payment due in 5 days; ₹2.1L required.' },
                ]
            }
        });
    } catch (error) {
        console.error('Working capital error:', error);
        res.status(500).json({ success: false, error: 'Failed to load working capital health' });
    }
});

module.exports = router;
