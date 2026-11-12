/**
 * Financial Modelling API Routes
 * AI-Powered Financial Modelling and Valuation
 */

const express = require('express');
const router = express.Router();
const { calculationDb } = require('../services/database');
const { computeDCFFromParams } = require('../services/dcf-engine');

/**
 * @route   POST /api/v1/financial-model/generate
 * @desc    Generate comprehensive financial model (unlevered FCFF DCF)
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
            terminalGrowthRate,
            currentPrice,
        } = req.body;

        // Validate and sanitize inputs (preserve explicit 0 for growth rates)
        const revenue = parseFloat(baseRevenue) || 100;
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
                code: 'INVALID_INPUT',
            });
        }

        const g1raw = parseFloat(growthRateYear1);
        const g2raw = parseFloat(growthRateYear2);
        const g1 = isNaN(g1raw) ? 25 : g1raw / 100;   // preserve explicit 0
        const g2 = isNaN(g2raw) ? 18 : g2raw / 100;
        const growthRates = [g1, g1, g2, g2, g2];

        // ---- Precise unlevered-FCFF DCF (same core as the modelling workspace) ----
        const netDebt = debt - cashBal;
        const result = computeDCFFromParams({
            baseRevenue: revenue,
            growthRates,
            ebitdaMargin: ebitdaMgn / 100,
            taxRate: tax / 100,
            daPct: 0.03,
            capexPct: 0.05,
            wcPct: 0.03,
            wacc: waccVal / 100,
            terminalGrowth: tgr / 100,
            horizon: 5,
            netDebt,
            shares,
        });

        if (!result.valid) {
            return res.status(400).json({
                success: false,
                error: 'Terminal growth rate must be less than WACC',
                code: 'INVALID_INPUT',
            });
        }

        // ---- 5-year projections (fcf = unlevered FCFF from the engine) ----
        const projections = [];
        let currentDebtBal = debt;
        for (let i = 0; i < 5; i++) {
            const rev = result.forecast[i].revenue;
            const ebitda = rev * (ebitdaMgn / 100);
            const depreciation = rev * 0.03;
            const ebit = ebitda - depreciation;
            const interest = currentDebtBal * (cod / 100);
            const ebt = ebit - interest;
            const taxExpense = Math.max(0, ebt * (tax / 100));
            const netIncome = ebt - taxExpense;
            const equity = rev * 1.2 - currentDebtBal;

            projections.push({
                year: i + 1,
                revenue: Math.round(rev * 10) / 10,
                ebitda: Math.round(ebitda * 10) / 10,
                ebit: Math.round(ebit * 10) / 10,
                netIncome: Math.round(netIncome * 10) / 10,
                fcf: Math.round(result.forecast[i].fcff * 100) / 100,
                debt: Math.round(currentDebtBal * 10) / 10,
                equity: Math.round(equity * 10) / 10,
                roe: Math.round((netIncome / equity) * 1000) / 10,
            });
            currentDebtBal *= 1.05;
        }

        // ---- Valuation (precise) ----
        const enterpriseValue = result.enterpriseValue;
        const equityValue = result.equityValue;
        const fairValuePerShare = result.perShareValue;
        const terminalValue = result.terminalValue;
        const pvTerminal = result.pvTerminal;
        const pvFCF = result.pvFcff;

        // Comparable multiples
        const peMultiple = projections[4].netIncome !== 0 ? equityValue / projections[4].netIncome : 0;
        const evEbitdaMultiple = projections[4].ebitda !== 0 ? enterpriseValue / projections[4].ebitda : 0;
        const pbMultiple = projections[4].equity !== 0 ? equityValue / projections[4].equity : 0;

        // Growth rates — revenue uses the 5-span (base→year5) exponent, EBITDA/NI
        // use the 4-span (year1→year5) exponent.
        const revenueCAGR = (Math.pow(projections[4].revenue / revenue, 0.2) - 1) * 100;
        const ebitdaCAGR = (Math.pow(projections[4].ebitda / projections[0].ebitda, 0.25) - 1) * 100;
        const netIncomeCAGR = projections[0].netIncome !== 0
            ? (Math.pow(projections[4].netIncome / projections[0].netIncome, 0.25) - 1) * 100
            : 0;

        // Recommendation based on upside vs current price (null when absent)
        let recommendation = null;
        if (currentPrice !== undefined && currentPrice !== null && currentPrice !== '') {
            const price = parseFloat(currentPrice);
            if (!isNaN(price) && price > 0) {
                const upside = ((fairValuePerShare - price) / price) * 100;
                recommendation = upside > 10 ? 'BUY' : upside < -10 ? 'SELL' : 'HOLD';
            }
        }

        const responseData = {
            companyName,
            industry,
            projections,
            valuation: {
                enterpriseValue: Math.round(enterpriseValue * 100) / 100,
                equityValue: Math.round(equityValue * 100) / 100,
                fairValuePerShare: Math.round(fairValuePerShare * 100) / 100,
                terminalValue: Math.round(terminalValue * 100) / 100,
                wacc: waccVal,
                terminalGrowthRate: tgr,
                pvFCF: Math.round(pvFCF * 100) / 100,
                pvTerminalValue: Math.round(pvTerminal * 100) / 100,
            },
            multiples: {
                pe: Math.round(peMultiple * 10) / 10,
                evEbitda: Math.round(evEbitdaMultiple * 10) / 10,
                pb: Math.round(pbMultiple * 10) / 10,
            },
            metrics: {
                revenueCAGR: Math.round(revenueCAGR * 10) / 10,
                ebitdaCAGR: Math.round(ebitdaCAGR * 10) / 10,
                netIncomeCAGR: Math.round(netIncomeCAGR * 10) / 10,
                finalNetMargin: Math.round((projections[4].netIncome / projections[4].revenue) * 1000) / 10,
                finalROE: projections[4].roe,
            },
            recommendation,
            confidence: 85,
            aiInsights: generateAIInsights(projections, enterpriseValue, equityValue),
        };

        // Save to DB if authenticated
        if (req.user && req.user.id) {
            calculationDb.create({
                userId: req.user.id,
                type: 'financial_model',
                inputData: JSON.stringify(req.body),
                resultData: JSON.stringify(responseData),
            });
        }

        res.json({
            success: true,
            data: responseData,
        });
    } catch (error) {
        console.error('Financial model error:', error);
        res.status(500).json({
            success: false,
            error: 'Financial model generation failed',
            code: 'MODEL_ERROR',
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
            description: `Revenue projected to grow ${(revenueGrowth * 100 - 100).toFixed(0)}% over 5 years, indicating robust business expansion.`,
        });
    }

    const marginImprovement = (projections[4].netIncome / projections[4].revenue) - (projections[0].netIncome / projections[0].revenue);
    if (marginImprovement > 2) {
        insights.push({
            type: 'positive',
            title: 'Margin Expansion',
            description: `Net profit margins projected to improve by ${marginImprovement.toFixed(1)} percentage points, driven by operating leverage.`,
        });
    }

    if (projections[4].roe > 20) {
        insights.push({
            type: 'positive',
            title: 'Strong Returns',
            description: `Projected ROE of ${projections[4].roe}% by Year 5 indicates efficient capital utilization.`,
        });
    }

    insights.push({
        type: 'risk',
        title: 'Key Risks to Monitor',
        description: 'Execution risk on growth assumptions, competitive pressures, and interest rate exposure should be closely monitored.',
    });

    return insights;
}

module.exports = router;
