/**
 * Tax API Routes - Patent-Protected Endpoints
 * PATENT #4: Multi-Regime Tax Optimizer
 */

const express = require('express');
const router = express.Router();

// Import tax optimizer
const { optimizeTaxes, calculateOldRegimeTax, calculateNewRegimeTax, generateRecommendations, calculateHRA } = require('../algorithms/taxOptimizer');

/**
 * @route   POST /api/v1/tax/calculate-income-tax
 * @desc    Calculate income tax under both regimes
 * @patent  PATENT #4: Multi-Regime Tax Optimizer
 * @access  Private
 */
router.post('/calculate-income-tax', (req, res) => {
    try {
        const profile = req.body;

        // Validate required fields
        if (!profile.income || profile.income <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid income is required',
                code: 'INCOME_MISSING'
            });
        }

        // Validate and sanitize inputs
        const income = parseFloat(profile.income);
        if (isNaN(income) || income <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid numeric income is required',
                code: 'INVALID_INCOME'
            });
        }

        const completeProfile = {
            age: profile.age || 35,
            gender: profile.gender || 'male',
            employmentType: profile.employmentType || 'salaried',
            cityType: profile.cityType || 'metro',
            income: income,
            basicSalary: parseFloat(profile.basicSalary) || income * 0.5,
            hraReceived: parseFloat(profile.hraReceived) || income * 0.2,
            currentInvestments: parseFloat(profile.currentInvestments) || 0,
            total80C: parseFloat(profile.total80C) || profile.currentInvestments || 0,
            rent: parseFloat(profile.rent) || 0,
            livingArrangement: profile.livingArrangement || 'rented',
            homeLoanInterest: parseFloat(profile.homeLoanInterest) || 0,
            nps: parseFloat(profile.nps) || 0,
            employerNPS: parseFloat(profile.employerNPS) || 0,
            healthInsuranceSelf: parseFloat(profile.healthInsuranceSelf) || 0,
            healthInsuranceParents: parseFloat(profile.healthInsuranceParents) || 0,
            educationLoan: parseFloat(profile.educationLoan) || 0,
            donations: parseFloat(profile.donations) || 0,
            taxRegime: profile.taxRegime || 'auto',
            priority: profile.priority || 'balanced',
            investmentHorizon: profile.investmentHorizon || 'medium'
        };

        // Calculate both regimes
        const oldRegime = calculateOldRegimeTax(completeProfile);
        const newRegime = calculateNewRegimeTax(completeProfile);

        // Determine optimal
        const optimal = oldRegime.totalTax < newRegime.totalTax 
            ? { ...oldRegime, regime: 'Old Regime' }
            : { ...newRegime, regime: 'New Regime' };

        // Generate recommendations
        const recommendations = generateRecommendations(completeProfile, optimal);

        // Calculate savings
        const savings = recommendations.reduce((total, rec) => total + (rec.savings || 0), 0);

        // Calculate confidence
        let confidence = 85;
        if (completeProfile.rent > 0) confidence += 3;
        if (completeProfile.currentInvestments > 0) confidence += 3;
        if (recommendations.length >= 6) confidence += 5;
        if (completeProfile.income >= 500000 && completeProfile.income <= 2000000) confidence += 4;
        confidence = Math.min(100, confidence);

        const results = {
            profile: completeProfile,
            oldRegime,
            newRegime,
            optimal,
            recommendations,
            potentialSavings: savings,
            confidence,
            comparison: {
                difference: Math.abs(oldRegime.totalTax - newRegime.totalTax),
                savingsPercentage: ((Math.abs(oldRegime.totalTax - newRegime.totalTax) / completeProfile.income) * 100).toFixed(2),
                recommendedRegime: optimal.regime
            }
        };

        res.json({
            success: true,
            patent: 'PAT-004',
            api_version: '2.0',
            processed_at: new Date().toISOString(),
            data: results
        });
    } catch (error) {
        console.error('Tax calculation error:', error);
        res.status(500).json({
            success: false,
            error: 'Tax calculation error',
            code: 'CALCULATION_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/tax/optimize
 * @desc    Run full tax optimization with recommendations
 * @patent  PATENT #4: Multi-Regime Tax Optimizer
 * @access  Private (Premium)
 */
router.post('/optimize', (req, res) => {
    try {
        const profile = req.body;

        if (!profile.income || profile.income <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid income is required',
                code: 'INCOME_MISSING'
            });
        }

        // Run full optimization
        const results = optimizeTaxes(profile);

        res.json({
            success: true,
            patent: 'PAT-004',
            api_version: '2.0',
            processed_at: new Date().toISOString(),
            data: results
        });
    } catch (error) {
        console.error('Tax optimization error:', error);
        res.status(500).json({
            success: false,
            error: 'Optimization error',
            code: 'OPTIMIZATION_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/tax/calculate-hra
 * @desc    Calculate House Rent Allowance exemption
 * @access  Private
 */
router.post('/calculate-hra', (req, res) => {
    try {
        const { basicSalary, hraReceived, rentPaid, cityType } = req.body;

        if (!basicSalary || !hraReceived || !rentPaid) {
            return res.status(400).json({
                success: false,
                error: 'Basic salary, HRA received, and rent paid are required',
                code: 'FIELDS_MISSING'
            });
        }

        const profile = {
            income: basicSalary * 12,
            basicSalary: basicSalary * 12,
            hraReceived: hraReceived * 12,
            rent: rentPaid * 12,
            cityType: cityType || 'metro'
        };

        const hraExemption = calculateHRA(profile);

        res.json({
            success: true,
            data: {
                monthly: {
                    basicSalary,
                    hraReceived,
                    rentPaid,
                    hraExemption: Math.round(hraExemption / 12)
                },
                annual: {
                    basicSalary: basicSalary * 12,
                    hraReceived: hraReceived * 12,
                    rentPaid: rentPaid * 12,
                    hraExemption: Math.round(hraExemption)
                },
                taxableHRA: Math.round((hraReceived * 12) - hraExemption),
                cityType: profile.cityType
            }
        });
    } catch (error) {
        console.error('HRA calculation error:', error);
        res.status(500).json({
            success: false,
            error: 'HRA calculation error',
            code: 'CALCULATION_ERROR'
        });
    }
});

/**
 * @route   GET /api/v1/tax/slabs/:year
 * @desc    Get tax slabs for a financial year
 * @access  Private
 */
router.get('/slabs/:year?', (req, res) => {
    const year = req.params.year || '2025-26';

    const slabs = {
        '2025-26': {
            newRegime: [
                { limit: 300000, rate: 0, label: 'Up to ₹3,00,000' },
                { limit: 700000, rate: 0.05, label: '₹3,00,001 - ₹7,00,000' },
                { limit: 1000000, rate: 0.10, label: '₹7,00,001 - ₹10,00,000' },
                { limit: 1200000, rate: 0.15, label: '₹10,00,001 - ₹12,00,000' },
                { limit: 1500000, rate: 0.20, label: '₹12,00,001 - ₹15,00,000' },
                { limit: Infinity, rate: 0.30, label: 'Above ₹15,00,000' }
            ],
            oldRegime: [
                { limit: 250000, rate: 0, label: 'Up to ₹2,50,000' },
                { limit: 500000, rate: 0.05, label: '₹2,50,001 - ₹5,00,000' },
                { limit: 1000000, rate: 0.20, label: '₹5,00,001 - ₹10,00,000' },
                { limit: Infinity, rate: 0.30, label: 'Above ₹10,00,000' }
            ]
        }
    };

    res.json({
        success: true,
        data: {
            financialYear: year,
            slabs: slabs[year] || slabs['2025-26']
        }
    });
});

module.exports = router;
