/**
 * Financial Modelling API Routes
 * AI-Powered Financial Modelling and Valuation
 */

const express = require('express');
const router = express.Router();
const { calculationDb } = require('../services/database');

/**
 * @route   POST /api/v1/financial-model/generate
 * @desc    Generate comprehensive financial model
 * @access  Private
 */
router.post('/generate', (req, res) => {
    try {
        const {
            companyName,
            industry,
            baseRevenue,
            growthRateYear1,
            growthRateYear2,
            ebitdaMargin,
            taxRate,
            currentDebt,
            cash,
            costOfDebt,
            sharesOutstanding,
            wacc,
            terminalGrowthRate
        } = req.body;

        // Validate and sanitize inputs
        const revenue = parseFloat(baseRevenue) || 100;
        const growth1 = parseFloat(growthRateYear1) || 25;
        const growth2 = parseFloat(growthRateYear2) || 18;
        const ebitdaMgn = parseFloat(ebitdaMargin) || 20;
        const tax = parseFloat(taxRate) || 25;
        const debt = parseFloat(currentDebt) || 15;
        const cashBal = parseFloat(cash) || 10;
        const cod = parseFloat(costOfDebt) || 8.5;
        let shares = parseFloat(sharesOutstanding);
        if (isNaN(shares) || shares <= 0) shares = 10;
        let waccVal = parseFloat(wacc);
        if (isNaN(waccVal) || waccVal <= 0) waccVal = 10.5;
        let tgr = parseFloat(terminalGrowthRate);
        if (isNaN(tgr) || tgr < 0) tgr = 3;
        if (tgr >= waccVal) {
            return res.status(400).json({
                success: false,
                error: 'Terminal growth rate must be less than WACC',
                code: 'INVALID_INPUT'
            });
        }

        // Generate 5-year projections
        const projections = [];
        let currentRevenue = revenue;
        let currentDebtBal = debt;

        for (let year = 1; year <= 5; year++) {
            const growth = year <= 2 ? growth1 / 100 : growth2 / 100;
            currentRevenue *= (1 + growth);

            const ebitda = currentRevenue * (ebitdaMgn / 100);
            const depreciation = currentRevenue * 0.03;
            const ebit = ebitda - depreciation;
            const interest = currentDebtBal * (cod / 100);
            const ebt = ebit - interest;
            const taxExpense = Math.max(0, ebt * (tax / 100));
            const netIncome = ebt - taxExpense;

            const ocf = netIncome + depreciation;
            const capex = currentRevenue * 0.05;
            const fcf = ocf - capex;

            const currentAssets = currentRevenue * 0.5;
            const fixedAssets = currentRevenue * 0.7;
            const totalAssets = currentAssets + fixedAssets;
            const equity = totalAssets - currentDebtBal;

            projections.push({
                year,
                revenue: Math.round(currentRevenue * 10) / 10,
                ebitda: Math.round(ebitda * 10) / 10,
                ebit: Math.round(ebit * 10) / 10,
                netIncome: Math.round(netIncome * 10) / 10,
                fcf: Math.round(fcf * 10) / 10,
                debt: Math.round(currentDebtBal * 10) / 10,
                equity: Math.round(equity * 10) / 10,
                roe: Math.round((netIncome / equity) * 1000) / 10
            });

            currentDebtBal *= 1.05;
        }

        // DCF Valuation
        let pvFCF = 0;
        projections.forEach((proj, i) => {
            pvFCF += proj.fcf / Math.pow(1 + waccVal / 100, i + 1);
        });

        const terminalFCF = projections[4].fcf * (1 + tgr / 100);
        const terminalValue = terminalFCF / ((waccVal - tgr) / 100);
        const pvTerminal = terminalValue / Math.pow(1 + waccVal / 100, 5);

        const enterpriseValue = pvFCF + pvTerminal;
        const equityValue = enterpriseValue - debt + cashBal;
        const fairValuePerShare = equityValue / shares;

        // Comparable multiples
        const peMultiple = projections[4].netIncome !== 0 ? equityValue / projections[4].netIncome : 0;
        const evEbitdaMultiple = projections[4].ebitda !== 0 ? enterpriseValue / projections[4].ebitda : 0;
        const pbMultiple = projections[4].equity !== 0 ? equityValue / projections[4].equity : 0;

        // Growth rates
        const revenueCAGR = (Math.pow(projections[4].revenue / revenue, 0.2) - 1) * 100;
        const ebitdaCAGR = (Math.pow(projections[4].ebitda / projections[0].ebitda, 0.2) - 1) * 100;
        const netIncomeCAGR = (Math.pow(projections[4].netIncome / projections[0].netIncome, 0.2) - 1) * 100;

        const responseData = {
            companyName,
            industry,
            projections,
            valuation: {
                enterpriseValue: Math.round(enterpriseValue * 10) / 10,
                equityValue: Math.round(equityValue * 10) / 10,
                fairValuePerShare: Math.round(fairValuePerShare * 100) / 100,
                wacc: waccVal,
                terminalGrowthRate: tgr,
                pvFCF: Math.round(pvFCF * 10) / 10,
                pvTerminalValue: Math.round(pvTerminal * 10) / 10
            },
            multiples: {
                pe: Math.round(peMultiple * 10) / 10,
                evEbitda: Math.round(evEbitdaMultiple * 10) / 10,
                pb: Math.round(pbMultiple * 10) / 10
            },
            metrics: {
                revenueCAGR: Math.round(revenueCAGR * 10) / 10,
                ebitdaCAGR: Math.round(ebitdaCAGR * 10) / 10,
                netIncomeCAGR: Math.round(netIncomeCAGR * 10) / 10,
                finalNetMargin: Math.round((projections[4].netIncome / projections[4].revenue) * 1000) / 10,
                finalROE: projections[4].roe
            },
            recommendation: fairValuePerShare > 100 ? 'BUY' : fairValuePerShare > 80 ? 'HOLD' : 'SELL',
            confidence: 85,
            aiInsights: generateAIInsights(projections, enterpriseValue, equityValue)
        };

        // Save to DB if authenticated
        if (req.user && req.user.id) {
            calculationDb.create({
                userId: req.user.id,
                type: 'financial_model',
                inputData: JSON.stringify(req.body),
                resultData: JSON.stringify(responseData)
            });
        }

        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('Financial model error:', error);
        res.status(500).json({
            success: false,
            error: 'Financial model generation failed',
            code: 'MODEL_ERROR'
        });
    }
});

function generateAIInsights(projections, ev, equity) {
    const insights = [];

    const revenueGrowth = projections[4].revenue / projections[0].revenue;
    if (revenueGrowth > 2) {
        insights.push({
            type: 'positive',
            title: 'Strong Revenue Growth',
            description: `Revenue projected to grow ${(revenueGrowth * 100 - 100).toFixed(0)}% over 5 years, indicating robust business expansion.`
        });
    }

    const marginImprovement = (projections[4].netIncome / projections[4].revenue) - (projections[0].netIncome / projections[0].revenue);
    if (marginImprovement > 2) {
        insights.push({
            type: 'positive',
            title: 'Margin Expansion',
            description: `Net profit margins projected to improve by ${marginImprovement.toFixed(1)} percentage points, driven by operating leverage.`
        });
    }

    if (projections[4].roe > 20) {
        insights.push({
            type: 'positive',
            title: 'Strong Returns',
            description: `Projected ROE of ${projections[4].roe}% by Year 5 indicates efficient capital utilization.`
        });
    }

    insights.push({
        type: 'risk',
        title: 'Key Risks to Monitor',
        description: 'Execution risk on growth assumptions, competitive pressures, and interest rate exposure should be closely monitored.'
    });

    return insights;
}

module.exports = router;