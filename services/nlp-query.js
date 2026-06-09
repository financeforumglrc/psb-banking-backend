/**
 * Natural Language Query Service
 * Parses "What if" questions and translates to model adjustments
 * Examples:
 *   "What if WACC increases by 1%?"
 *   "Show me the upside case with 15% revenue growth"
 *   "What happens if EBITDA margin drops to 18%?"
 *   "Compare base vs bull case"
 */

// ============================================
// QUERY PARSER
// ============================================
function parseQuery(query) {
    const normalized = query.toLowerCase().trim();
    
    // Pattern 1: "What if [variable] [increases/decreases] by [amount]?"
    const changePattern = /what if (\w+(?:\s+\w+)?)\s+(increases?|decreases?|goes up|goes down|rises?|falls?)\s+by\s+([\d.]+)\s*(%|percent|percentage points?|pp|bps)?/i;
    
    // Pattern 2: "Show me [scenario] with [variable] at [value]"
    const scenarioPattern = /show me (?:the\s+)?(\w+)\s+(?:case\s+)?(?:with\s+)?(\w+(?:\s+\w+)*)\s+(?:at|of|=)\s+([\d.]+)\s*(%|percent)?/i;
    
    // Pattern 3: "What happens if [variable] [is/drops to/rises to] [value]?"
    const whatIfPattern = /what happens if (\w+(?:\s+\w+)?)\s+(?:is\s+|drops?\s+to|rises?\s+to|falls?\s+to|goes\s+to)\s+([\d.]+)\s*(%|percent)?/i;
    
    // Pattern 4: "Compare [scenario1] vs [scenario2]"
    const comparePattern = /compare\s+(\w+)\s+(?:vs?|versus)\s+(\w+)/i;
    
    // Pattern 5: "Run Monte Carlo with [iterations] iterations"
    const montePattern = /run\s+(?:a\s+)?monte\s+carlo(?:\s+with\s+([\d,]+)\s+iterations?)?/i;
    
    // Pattern 6: "Show football field" / "Show waterfall" / "Show tornado"
    const chartPattern = /show\s+(?:me\s+)?(?:the\s+)?(football field|waterfall|tornado|sensitivity matrix|monte carlo)/i;
    
    // Try each pattern
    let match;
    
    if ((match = normalized.match(changePattern))) {
        return {
            type: 'what_if_change',
            variable: normalizeVariable(match[1]),
            direction: match[2].includes('increas') || match[2].includes('up') || match[2].includes('rise') ? 'increase' : 'decrease',
            amount: parseFloat(match[3]),
            unit: normalizeUnit(match[4])
        };
    }
    
    if ((match = normalized.match(scenarioPattern))) {
        return {
            type: 'scenario_with_value',
            scenario: match[1].toLowerCase(),
            variable: normalizeVariable(match[2]),
            value: parseFloat(match[3]),
            unit: normalizeUnit(match[4])
        };
    }
    
    if ((match = normalized.match(whatIfPattern))) {
        return {
            type: 'what_if_value',
            variable: normalizeVariable(match[1]),
            value: parseFloat(match[2]),
            unit: normalizeUnit(match[3])
        };
    }
    
    if ((match = normalized.match(comparePattern))) {
        return {
            type: 'compare_scenarios',
            scenario1: match[1].toLowerCase(),
            scenario2: match[2].toLowerCase()
        };
    }
    
    if ((match = normalized.match(montePattern))) {
        return {
            type: 'run_monte_carlo',
            iterations: match[1] ? parseInt(match[1].replace(/,/g, '')) : 10000
        };
    }
    
    if ((match = normalized.match(chartPattern))) {
        return {
            type: 'show_chart',
            chart: match[1].toLowerCase().replace(/\s+/g, '_')
        };
    }
    
    // Fallback: keyword search
    return {
        type: 'unknown',
        keywords: extractKeywords(normalized)
    };
}

// ============================================
// EXECUTE QUERY AGAINST MODEL
// ============================================
function executeQuery(parsed, model) {
    const { type } = parsed;
    const { assumptions } = model;
    
    switch (type) {
        case 'what_if_change':
            return executeWhatIfChange(parsed, model);
        case 'what_if_value':
            return executeWhatIfValue(parsed, model);
        case 'scenario_with_value':
            return executeScenarioWithValue(parsed, model);
        case 'compare_scenarios':
            return executeCompareScenarios(parsed, model);
        case 'run_monte_carlo':
            return { type: 'monte_carlo', iterations: parsed.iterations };
        case 'show_chart':
            return { type: 'show_chart', chart: parsed.chart };
        default:
            return { type: 'unknown', message: 'I did not understand that question. Try asking: "What if WACC increases by 1%?" or "Show me the bull case"' };
    }
}

function executeWhatIfChange(parsed, model) {
    const { variable, direction, amount, unit } = parsed;
    const { assumptions } = model;
    
    const currentValue = assumptions[variable];
    if (currentValue === undefined) {
        return { error: `Variable "${variable}" not found in model` };
    }
    
    let newValue;
    if (unit === 'percent' || unit === 'pct') {
        // Amount is in percentage points (e.g., 1% = 0.01)
        const delta = amount / 100;
        newValue = direction === 'increase' ? currentValue + delta : currentValue - delta;
    } else if (unit === 'bps') {
        // Basis points (1 bps = 0.0001)
        const delta = amount / 10000;
        newValue = direction === 'increase' ? currentValue + delta : currentValue - delta;
    } else {
        // Absolute change
        newValue = direction === 'increase' ? currentValue + amount : currentValue - amount;
    }
    
    // Apply constraint
    newValue = applyConstraint(variable, newValue, assumptions);
    
    // Recalculate
    const { recalculateDCF } = require('./chart-engine');
    const newAssumptions = { ...assumptions, [variable]: newValue };
    const newDCF = recalculateDCF(newAssumptions);
    
    const oldDCF = model.dcf?.intrinsic_value_per_share || recalculateDCF(assumptions);
    const change = ((newDCF - oldDCF) / oldDCF * 100).toFixed(1);
    
    return {
        type: 'what_if_result',
        variable,
        old_value: currentValue,
        new_value: newValue,
        old_dcf: oldDCF,
        new_dcf: newDCF,
        change_percent: change,
        direction: parseFloat(change) > 0 ? 'up' : 'down',
        message: `If ${variable} ${direction}s by ${amount}${unit || ''} (from ${formatValue(currentValue, variable)} to ${formatValue(newValue, variable)}), the intrinsic value ${parseFloat(change) > 0 ? 'rises' : 'falls'} by ${Math.abs(change)}% to ₹${newDCF.toFixed(0)} per share.`
    };
}

function executeWhatIfValue(parsed, model) {
    const { variable, value, unit } = parsed;
    const { assumptions } = model;
    
    let newValue = value;
    if (unit === 'percent' || unit === 'pct') {
        newValue = value / 100;
    }
    
    newValue = applyConstraint(variable, newValue, assumptions);
    
    const { recalculateDCF } = require('./chart-engine');
    const newAssumptions = { ...assumptions, [variable]: newValue };
    const newDCF = recalculateDCF(newAssumptions);
    
    const oldDCF = model.dcf?.intrinsic_value_per_share || recalculateDCF(assumptions);
    const change = ((newDCF - oldDCF) / oldDCF * 100).toFixed(1);
    
    return {
        type: 'what_if_result',
        variable,
        old_value: assumptions[variable],
        new_value: newValue,
        old_dcf: oldDCF,
        new_dcf: newDCF,
        change_percent: change,
        direction: parseFloat(change) > 0 ? 'up' : 'down',
        message: `With ${variable} at ${formatValue(newValue, variable)}, the intrinsic value is ₹${newDCF.toFixed(0)} per share (${change > 0 ? '+' : ''}${change}%).`
    };
}

function executeScenarioWithValue(parsed, model) {
    const { scenario, variable, value, unit } = parsed;
    const { SCENARIO_TEMPLATES, applyScenario } = require('./scenario-engine');
    
    if (!SCENARIO_TEMPLATES[scenario]) {
        return { error: `Unknown scenario "${scenario}". Available: base, upside, downside, stress` };
    }
    
    let newValue = value;
    if (unit === 'percent' || unit === 'pct') {
        newValue = value / 100;
    }
    
    // Start with scenario template
    const baseScenario = applyScenario(model, scenario);
    
    // Override with custom variable
    const customAssumptions = { ...baseScenario.assumptions, [variable]: newValue };
    const { recalculateDCF } = require('./chart-engine');
    const newDCF = recalculateDCF(customAssumptions);
    
    return {
        type: 'scenario_result',
        scenario: baseScenario.name,
        variable,
        value: newValue,
        intrinsic_value: newDCF,
        vs_base: model.dcf?.intrinsic_value_per_share
            ? ((newDCF - model.dcf.intrinsic_value_per_share) / model.dcf.intrinsic_value_per_share * 100).toFixed(1)
            : null,
        message: `${baseScenario.name} with ${variable} at ${formatValue(newValue, variable)}: intrinsic value = ₹${newDCF.toFixed(0)}/share.`
    };
}

function executeCompareScenarios(parsed, model) {
    const { scenario1, scenario2 } = parsed;
    const { applyScenario } = require('./scenario-engine');
    
    const s1 = applyScenario(model, scenario1);
    const s2 = applyScenario(model, scenario2);
    
    if (!s1 || !s2) {
        return { error: 'One or both scenarios not found' };
    }
    
    const diff = s1.intrinsic_value_per_share - s2.intrinsic_value_per_share;
    const diffPct = ((diff / s2.intrinsic_value_per_share) * 100).toFixed(1);
    
    return {
        type: 'comparison_result',
        scenario1: { name: s1.name, value: s1.intrinsic_value_per_share },
        scenario2: { name: s2.name, value: s2.intrinsic_value_per_share },
        difference: diff,
        difference_percent: diffPct,
        message: `${s1.name} (₹${s1.intrinsic_value_per_share.toFixed(0)}) vs ${s2.name} (₹${s2.intrinsic_value_per_share.toFixed(0)}): ${diff > 0 ? '+' : ''}₹${Math.abs(diff).toFixed(0)} (${diffPct > 0 ? '+' : ''}${diffPct}%)`
    };
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function normalizeVariable(raw) {
    const mappings = {
        'wacc': 'wacc',
        'weighted average cost of capital': 'wacc',
        'cost of capital': 'wacc',
        'discount rate': 'wacc',
        'terminal growth': 'terminal_growth_rate',
        'terminal growth rate': 'terminal_growth_rate',
        'g terminal': 'terminal_growth_rate',
        'perpetuity growth': 'terminal_growth_rate',
        'revenue growth': 'revenue_growth',
        'sales growth': 'revenue_growth',
        'top line growth': 'revenue_growth',
        'ebitda margin': 'ebitda_margin',
        'margin': 'ebitda_margin',
        'operating margin': 'ebitda_margin',
        'tax rate': 'tax_rate',
        'tax': 'tax_rate',
        'effective tax': 'tax_rate',
        'capex': 'capex_pct_revenue',
        'capital expenditure': 'capex_pct_revenue',
        'capital spending': 'capex_pct_revenue',
        'working capital': 'working_capital_pct_revenue',
        'wc': 'working_capital_pct_revenue',
        'net debt': 'net_debt',
        'debt': 'net_debt',
        'shares': 'shares_outstanding',
        'shares outstanding': 'shares_outstanding',
        'share count': 'shares_outstanding'
    };
    
    const normalized = raw.toLowerCase().trim();
    return mappings[normalized] || normalized.replace(/\s+/g, '_');
}

function normalizeUnit(unit) {
    if (!unit) return 'absolute';
    const u = unit.toLowerCase().trim();
    if (u.includes('%') || u.includes('percent')) return 'percent';
    if (u.includes('bp') || u.includes('basis')) return 'bps';
    if (u.includes('pp') || u.includes('point')) return 'percent';
    return 'absolute';
}

function applyConstraint(variable, value, assumptions) {
    switch (variable) {
        case 'wacc':
            return Math.max(0.03, Math.min(0.30, value));
        case 'terminal_growth_rate':
            return Math.max(0.005, Math.min(assumptions.wacc * 0.95, value));
        case 'tax_rate':
            return Math.max(0, Math.min(0.60, value));
        case 'revenue_growth':
            return Math.max(-0.50, Math.min(2.0, value));
        case 'ebitda_margin':
            return Math.max(0.01, Math.min(0.90, value));
        case 'capex_pct_revenue':
            return Math.max(0, Math.min(0.50, value));
        case 'working_capital_pct_revenue':
            return Math.max(-0.20, Math.min(0.50, value));
        case 'net_debt':
            return Math.max(0, value);
        case 'shares_outstanding':
            return Math.max(1, value);
        default:
            return Math.max(0, value);
    }
}

function formatValue(value, variable) {
    if (variable.includes('growth') || variable.includes('rate') || variable.includes('margin') || variable === 'wacc') {
        return (value * 100).toFixed(2) + '%';
    }
    if (variable === 'net_debt') {
        return '₹' + (value / 1e7).toFixed(0) + ' Cr';
    }
    if (variable === 'shares_outstanding') {
        return (value / 1e6).toFixed(0) + 'M';
    }
    return value.toFixed(2);
}

function extractKeywords(text) {
    const keywords = ['wacc', 'growth', 'ebitda', 'margin', 'dcf', 'value', 'price', 'scenario', 'compare', 'monte carlo'];
    return keywords.filter(k => text.includes(k));
}

module.exports = {
    parseQuery,
    executeQuery,
    normalizeVariable,
    normalizeUnit
};
