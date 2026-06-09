/**
 * Scenario Engine Service
 * Manages Base / Upside / Downside / Custom scenarios
 * Stores scenario history and allows comparison
 */

const { detectAnomalies } = require('./anomaly-detector');
const { recalculateDCF } = require('./chart-engine');

// ============================================
// PRE-DEFINED SCENARIOS
// ============================================
const SCENARIO_TEMPLATES = {
    base: {
        name: 'Base Case',
        description: 'Management guidance, consensus estimates',
        icon: '⏺',
        color: '#2563EB',
        adjustments: {}
    },
    upside: {
        name: 'Bull Case',
        description: 'Stronger growth, margin expansion, multiple expansion',
        icon: '🚀',
        color: '#10B981',
        adjustments: {
            revenue_growth: { multiplier: 1.20, add: 0.02 },
            ebitda_margin: { multiplier: 1.08, add: 0.01 },
            wacc: { multiplier: 0.95, add: -0.005 },
            terminal_growth_rate: { multiplier: 1.15, add: 0.003 }
        }
    },
    downside: {
        name: 'Bear Case',
        description: 'Slower growth, margin compression, multiple contraction',
        icon: '🐻',
        color: '#EF4444',
        adjustments: {
            revenue_growth: { multiplier: 0.75, add: -0.01 },
            ebitda_margin: { multiplier: 0.92, add: -0.02 },
            wacc: { multiplier: 1.10, add: 0.008 },
            terminal_growth_rate: { multiplier: 0.80, add: -0.002 }
        }
    },
    stress: {
        name: 'Stress Test',
        description: 'Severe downturn, recession scenario',
        icon: '⚡',
        color: '#F59E0B',
        adjustments: {
            revenue_growth: { multiplier: 0.50, add: -0.03 },
            ebitda_margin: { multiplier: 0.80, add: -0.05 },
            wacc: { multiplier: 1.20, add: 0.015 },
            terminal_growth_rate: { multiplier: 0.60, add: -0.005 }
        }
    }
};

// ============================================
// APPLY SCENARIO TO MODEL
// ============================================
function applyScenario(model, scenarioKey) {
    const template = SCENARIO_TEMPLATES[scenarioKey];
    if (!template) return null;
    
    const newAssumptions = { ...model.assumptions };
    
    // Apply adjustments
    for (const [field, adj] of Object.entries(template.adjustments)) {
        if (newAssumptions[field] !== undefined) {
            newAssumptions[field] = newAssumptions[field] * adj.multiplier + adj.add;
            // Ensure constraints
            if (field === 'wacc' && newAssumptions.terminal_growth_rate >= newAssumptions.wacc) {
                newAssumptions.terminal_growth_rate = newAssumptions.wacc * 0.85;
            }
            if (field === 'terminal_growth_rate' && newAssumptions.terminal_growth_rate >= newAssumptions.wacc) {
                newAssumptions.terminal_growth_rate = newAssumptions.wacc * 0.85;
            }
            if (field === 'tax_rate') {
                newAssumptions[field] = Math.max(0, Math.min(0.60, newAssumptions[field]));
            }
            if (field === 'revenue_growth') {
                newAssumptions[field] = Math.max(-0.50, Math.min(2.0, newAssumptions[field]));
            }
        }
    }
    
    // Recalculate DCF
    const dcfValue = recalculateDCF(newAssumptions);
    
    // Run anomaly detection
    const testModel = { ...model, assumptions: newAssumptions };
    const anomalies = detectAnomalies(testModel);
    
    return {
        scenario: scenarioKey,
        name: template.name,
        description: template.description,
        color: template.color,
        assumptions: newAssumptions,
        intrinsic_value_per_share: dcfValue,
        anomalies,
        vs_base: model.dcf?.intrinsic_value_per_share 
            ? ((dcfValue - model.dcf.intrinsic_value_per_share) / model.dcf.intrinsic_value_per_share * 100).toFixed(1)
            : null
    };
}

// ============================================
// GENERATE ALL SCENARIOS FOR COMPARISON
// ============================================
function generateScenarioComparison(model) {
    const scenarios = ['base', 'upside', 'downside', 'stress'];
    const results = [];
    
    for (const key of scenarios) {
        const applied = applyScenario(model, key);
        if (applied) {
            results.push({
                key,
                name: applied.name,
                color: applied.color,
                value_per_share: applied.intrinsic_value_per_share,
                vs_base: applied.vs_base,
                anomalies_count: applied.anomalies.length,
                wacc: applied.assumptions.wacc,
                terminal_growth: applied.assumptions.terminal_growth_rate,
                revenue_growth: applied.assumptions.revenue_growth,
                ebitda_margin: applied.assumptions.ebitda_margin
            });
        }
    }
    
    // Calculate probability-weighted expected value
    const weights = { base: 0.50, upside: 0.25, downside: 0.20, stress: 0.05 };
    let expectedValue = 0;
    results.forEach(r => {
        expectedValue += r.value_per_share * (weights[r.key] || 0);
    });
    
    // Implied share price range
    const values = results.map(r => r.value_per_share).sort((a, b) => a - b);
    
    return {
        scenarios: results,
        expected_value: Math.round(expectedValue * 100) / 100,
        price_range: {
            low: values[0],
            high: values[values.length - 1],
            base: results.find(r => r.key === 'base')?.value_per_share
        },
        recommendation: generateRecommendation(results, model.market_data?.current_price)
    };
}

// ============================================
// CUSTOM SCENARIO
// Allow user to specify custom adjustments
// ============================================
function createCustomScenario(model, name, adjustments) {
    const newAssumptions = { ...model.assumptions };
    
    for (const [field, value] of Object.entries(adjustments)) {
        if (newAssumptions[field] !== undefined) {
            newAssumptions[field] = value;
        }
    }
    
    // Validate constraints
    if (newAssumptions.terminal_growth_rate >= newAssumptions.wacc) {
        newAssumptions.terminal_growth_rate = newAssumptions.wacc * 0.85;
    }
    
    const dcfValue = recalculateDCF(newAssumptions);
    const testModel = { ...model, assumptions: newAssumptions };
    const anomalies = detectAnomalies(testModel);
    
    return {
        scenario: 'custom',
        name: name || 'Custom Scenario',
        color: '#8B5CF6',
        assumptions: newAssumptions,
        intrinsic_value_per_share: dcfValue,
        anomalies,
        vs_base: model.dcf?.intrinsic_value_per_share
            ? ((dcfValue - model.dcf.intrinsic_value_per_share) / model.dcf.intrinsic_value_per_share * 100).toFixed(1)
            : null
    };
}

// ============================================
// RECOMMENDATION ENGINE
// ============================================
function generateRecommendation(scenarios, currentPrice) {
    if (!currentPrice || scenarios.length === 0) return { text: 'Insufficient data', action: 'hold' };
    
    const baseValue = scenarios.find(s => s.key === 'base')?.value_per_share;
    const upsideValue = scenarios.find(s => s.key === 'upside')?.value_per_share;
    const downsideValue = scenarios.find(s => s.key === 'downside')?.value_per_share;
    
    if (!baseValue) return { text: 'Insufficient data', action: 'hold' };
    
    const upsidePct = (upsideValue - currentPrice) / currentPrice;
    const downsidePct = (downsideValue - currentPrice) / currentPrice;
    const riskReward = upsidePct / Math.abs(downsidePct);
    
    if (baseValue > currentPrice * 1.15 && riskReward > 2) {
        return { text: 'Strong value opportunity with favorable risk/reward', action: 'strong_buy' };
    } else if (baseValue > currentPrice * 1.05) {
        return { text: 'Modest upside potential, consider accumulation', action: 'buy' };
    } else if (baseValue < currentPrice * 0.90) {
        return { text: 'Significant downside risk, exercise caution', action: 'sell' };
    } else {
        return { text: 'Fairly valued, hold current position', action: 'hold' };
    }
}

// ============================================
// LBO SCENARIO ANALYSIS
// ============================================
function generateLBOSenarios(baseLBO) {
    const scenarios = {
        base: { ...baseLBO },
        aggressive: {
            ...baseLBO,
            entry_multiple: baseLBO.entry_multiple * 1.1,
            leverage: Math.min(baseLBO.leverage * 1.2, 7.0),
            interest_rate: baseLBO.interest_rate * 1.15
        },
        conservative: {
            ...baseLBO,
            entry_multiple: baseLBO.entry_multiple * 0.9,
            leverage: baseLBO.leverage * 0.8,
            interest_rate: baseLBO.interest_rate * 0.9
        }
    };
    
    // Calculate returns for each
    const results = [];
    for (const [key, params] of Object.entries(scenarios)) {
        const equityInvested = params.purchase_price / (1 + params.leverage);
        const debt = params.purchase_price - equityInvested;
        const annualInterest = debt * params.interest_rate;
        const ebitdaExit = params.entry_ebitda * Math.pow(1 + params.revenue_growth, params.hold_period);
        const exitEV = ebitdaExit * params.exit_multiple;
        const exitDebt = debt * Math.pow(1 - params.amortization, params.hold_period);
        const exitEquity = exitEV - exitDebt;
        const moic = exitEquity / equityInvested;
        const irr = Math.pow(moic, 1 / params.hold_period) - 1;
        
        results.push({
            key,
            name: key === 'base' ? 'Base Case' : key === 'aggressive' ? 'Aggressive' : 'Conservative',
            moic: Math.round(moic * 100) / 100,
            irr: (irr * 100).toFixed(1),
            entry_multiple: params.entry_multiple,
            exit_multiple: params.exit_multiple,
            leverage: params.leverage,
            equity_invested: Math.round(equityInvested),
            exit_equity: Math.round(exitEquity)
        });
    }
    
    return results;
}

module.exports = {
    SCENARIO_TEMPLATES,
    applyScenario,
    generateScenarioComparison,
    createCustomScenario,
    generateLBOSenarios
};
