/**
 * Chart Engine Service
 * Generates data for interactive valuation charts
 * Football Field, Waterfall Bridge, Tornado, Monte Carlo
 */

const { detectAnomalies } = require('./anomaly-detector');

// ============================================
// FOOTBALL FIELD VALUATION CHART
// The signature chart of investment banking
// ============================================
function generateFootballField(model) {
    const { assumptions, dcf, comps, precedent_transactions } = model;
    const shares = assumptions.shares_outstanding;
    
    const ranges = [];
    
    // DCF Range (base ± sensitivity)
    if (dcf && dcf.intrinsic_value_per_share) {
        const base = dcf.intrinsic_value_per_share;
        ranges.push({
            method: 'DCF Analysis',
            low: base * 0.85,
            high: base * 1.15,
            midpoint: base,
            color: '#2563EB',
            weight: 0.35
        });
    }
    
    // Trading Comps
    if (comps && comps.comparable_companies) {
        const medians = calculateCompsMedians(comps.comparable_companies);
        const ev_ebitda = medians.ev_ebitda ? (medians.ev_ebitda * assumptions.ebitda_margin * assumptions.revenue_growth * shares) / shares : null;
        const ev_sales = medians.ev_sales ? (medians.ev_sales * assumptions.revenue_growth * shares) / shares : null;
        const pe = medians.pe ? (medians.pe * assumptions.net_income_margin * assumptions.revenue_growth * shares) / shares : null;
        
        if (ev_ebitda) {
            ranges.push({
                method: 'Trading Comps (EV/EBITDA)',
                low: ev_ebitda * 0.90,
                high: ev_ebitda * 1.10,
                midpoint: ev_ebitda,
                color: '#10B981',
                weight: 0.25
            });
        }
        if (ev_sales) {
            ranges.push({
                method: 'Trading Comps (EV/Sales)',
                low: ev_sales * 0.85,
                high: ev_sales * 1.15,
                midpoint: ev_sales,
                color: '#34D399',
                weight: 0.15
            });
        }
        if (pe) {
            ranges.push({
                method: 'Trading Comps (P/E)',
                low: pe * 0.90,
                high: pe * 1.10,
                midpoint: pe,
                color: '#6EE7B7',
                weight: 0.10
            });
        }
    }
    
    // Precedent Transactions
    if (precedent_transactions && precedent_transactions.transactions) {
        const txMedians = calculateTransactionMedians(precedent_transactions.transactions);
        if (txMedians.ev_ebitda) {
            const txVal = (txMedians.ev_ebitda * assumptions.ebitda_margin * assumptions.revenue_growth * shares) / shares;
            ranges.push({
                method: 'Precedent Transactions',
                low: txVal * 0.80,
                high: txVal * 1.20,
                midpoint: txVal,
                color: '#8B5CF6',
                weight: 0.15
            });
        }
    }
    
    // 52-Week High/Low
    if (model.market_data) {
        const { high_52w, low_52w } = model.market_data;
        if (high_52w && low_52w) {
            ranges.push({
                method: '52-Week Range',
                low: low_52w,
                high: high_52w,
                midpoint: (high_52w + low_52w) / 2,
                color: '#F59E0B',
                weight: 0.10
            });
        }
    }
    
    // Calculate weighted average
    let totalWeight = 0;
    let weightedSum = 0;
    ranges.forEach(r => {
        totalWeight += r.weight;
        weightedSum += r.midpoint * r.weight;
    });
    const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : null;
    
    // Current market price reference line
    const currentPrice = model.market_data?.current_price || null;
    
    return {
        ranges,
        weighted_average: weightedAverage,
        current_price: currentPrice,
        upside_downside: currentPrice && weightedAverage ? ((weightedAverage - currentPrice) / currentPrice * 100).toFixed(1) : null
    };
}

// ============================================
// WATERFALL BRIDGE CHART
// Shows value creation/destruction step by step
// ============================================
function generateWaterfallBridge(model) {
    const { dcf, assumptions } = model;
    if (!dcf) return null;
    
    const steps = [];
    const shares = assumptions.shares_outstanding;
    
    // Start with terminal value contribution
    const terminalValue = dcf.terminal_value || 0;
    const pvTerminal = terminalValue / Math.pow(1 + assumptions.wacc, assumptions.projection_years);
    const tvPerShare = pvTerminal / shares;
    
    // PV of explicit period FCFF
    const explicitPeriodValue = (dcf.enterprise_value || 0) - pvTerminal;
    const epPerShare = explicitPeriodValue / shares;
    
    steps.push(
        { label: 'PV of Explicit Period', value: epPerShare, type: 'positive', color: '#2563EB' },
        { label: 'PV of Terminal Value', value: tvPerShare, type: 'positive', color: '#10B981' }
    );
    
    // Adjustments
    let runningTotal = epPerShare + tvPerShare;
    
    // Net debt adjustment
    const netDebt = assumptions.net_debt || 0;
    const netDebtPerShare = netDebt / shares;
    steps.push({ label: 'Less: Net Debt', value: -netDebtPerShare, type: 'negative', color: '#EF4444' });
    runningTotal -= netDebtPerShare;
    
    // Minority interest (if any)
    if (assumptions.minority_interest) {
        const miPerShare = assumptions.minority_interest / shares;
        steps.push({ label: 'Less: Minority Interest', value: -miPerShare, type: 'negative', color: '#EF4444' });
        runningTotal -= miPerShare;
    }
    
    // Equity value = runningTotal at this point
    const equityValue = runningTotal;
    
    // Option dilution
    if (assumptions.options_outstanding) {
        const dilutionImpact = -(assumptions.options_outstanding * 0.3) / shares; // Simplified
        steps.push({ label: 'Option Dilution', value: dilutionImpact, type: 'negative', color: '#F59E0B' });
        runningTotal += dilutionImpact;
    }
    
    steps.push({ label: 'Intrinsic Value/Share', value: runningTotal, type: 'total', color: '#1F2937' });
    
    // Current market comparison
    const currentPrice = model.market_data?.current_price;
    if (currentPrice) {
        const premiumDiscount = runningTotal - currentPrice;
        steps.push({ 
            label: premiumDiscount >= 0 ? 'Upside to Market' : 'Downside to Market', 
            value: premiumDiscount, 
            type: premiumDiscount >= 0 ? 'positive' : 'negative', 
            color: premiumDiscount >= 0 ? '#10B981' : '#EF4444' 
        });
        steps.push({ label: 'Current Market Price', value: currentPrice, type: 'total', color: '#6B7280' });
    }
    
    return { steps, total: runningTotal };
}

// ============================================
// TORNADO SENSITIVITY CHART
// Shows which assumptions drive value most
// ============================================
function generateTornadoChart(model) {
    const { assumptions, dcf } = model;
    if (!dcf || !dcf.intrinsic_value_per_share) return null;
    
    const baseValue = dcf.intrinsic_value_per_share;
    const sensitivities = [];
    
    // Define sensitivity parameters: [field, label, low_pct, high_pct]
    const params = [
        ['wacc', 'WACC', -0.015, 0.015],
        ['terminal_growth_rate', 'Terminal Growth Rate', -0.005, 0.005],
        ['revenue_growth', 'Revenue Growth', -0.05, 0.05],
        ['ebitda_margin', 'EBITDA Margin', -0.03, 0.03],
        ['tax_rate', 'Tax Rate', -0.05, 0.05],
        ['capex_pct_revenue', 'CapEx % Revenue', -0.02, 0.02],
        ['working_capital_pct_revenue', 'WC % Revenue', -0.02, 0.02]
    ];
    
    params.forEach(([field, label, lowPct, highPct]) => {
        const baseVal = assumptions[field];
        if (baseVal === undefined) return;
        
        // Calculate low scenario
        const lowAssumptions = { ...assumptions, [field]: Math.max(0, baseVal * (1 + lowPct)) };
        const lowValue = recalculateDCF(lowAssumptions);
        
        // Calculate high scenario
        const highAssumptions = { ...assumptions, [field]: baseVal * (1 + highPct) };
        const highValue = recalculateDCF(highAssumptions);
        
        sensitivities.push({
            label,
            low: lowValue - baseValue,
            high: highValue - baseValue,
            impact: Math.max(Math.abs(lowValue - baseValue), Math.abs(highValue - baseValue)),
            baseValue
        });
    });
    
    // Sort by absolute impact (descending)
    sensitivities.sort((a, b) => b.impact - a.impact);
    
    return {
        base_value: baseValue,
        sensitivities,
        most_sensitive: sensitivities[0]?.label || null
    };
}

// ============================================
// MONTE CARLO SIMULATION
// Probabilistic outcomes with 10,000 iterations
// ============================================
function runMonteCarlo(model, iterations = 10000) {
    const { assumptions } = model;
    const results = [];
    
    // Define distributions for key assumptions
    // Using triangular distributions (min, mode, max)
    const distributions = {
        wacc: { min: assumptions.wacc * 0.85, mode: assumptions.wacc, max: assumptions.wacc * 1.25 },
        terminal_growth_rate: { 
            min: Math.max(0.005, assumptions.terminal_growth_rate * 0.5), 
            mode: assumptions.terminal_growth_rate, 
            max: Math.min(assumptions.wacc * 0.9, assumptions.terminal_growth_rate * 1.5) 
        },
        revenue_growth: { 
            min: Math.max(0, assumptions.revenue_growth * 0.5), 
            mode: assumptions.revenue_growth, 
            max: assumptions.revenue_growth * 1.5 
        },
        ebitda_margin: { 
            min: Math.max(0.05, assumptions.ebitda_margin * 0.7), 
            mode: assumptions.ebitda_margin, 
            max: Math.min(0.8, assumptions.ebitda_margin * 1.2) 
        },
        tax_rate: { 
            min: Math.max(0.15, assumptions.tax_rate * 0.7), 
            mode: assumptions.tax_rate, 
            max: Math.min(0.50, assumptions.tax_rate * 1.3) 
        }
    };
    
    for (let i = 0; i < iterations; i++) {
        const sampled = {};
        for (const [key, dist] of Object.entries(distributions)) {
            sampled[key] = triangularRandom(dist.min, dist.mode, dist.max);
        }
        
        const simAssumptions = { ...assumptions, ...sampled };
        const value = recalculateDCF(simAssumptions);
        results.push(value);
    }
    
    // Calculate statistics
    results.sort((a, b) => a - b);
    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    const median = results[Math.floor(results.length / 2)];
    const stdDev = Math.sqrt(results.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / results.length);
    
    // Percentiles
    const p10 = results[Math.floor(results.length * 0.10)];
    const p25 = results[Math.floor(results.length * 0.25)];
    const p75 = results[Math.floor(results.length * 0.75)];
    const p90 = results[Math.floor(results.length * 0.90)];
    
    // Histogram bins
    const min = results[0];
    const max = results[results.length - 1];
    const binCount = 50;
    const binWidth = (max - min) / binCount;
    const histogram = [];
    
    for (let i = 0; i < binCount; i++) {
        const binMin = min + i * binWidth;
        const binMax = binMin + binWidth;
        const count = results.filter(v => v >= binMin && v < binMax).length;
        histogram.push({
            bin_start: binMin,
            bin_end: binMax,
            count,
            probability: (count / iterations * 100).toFixed(2)
        });
    }
    
    // Probability of upside vs downside
    const currentPrice = model.market_data?.current_price || mean;
    const probUpside = results.filter(v => v > currentPrice).length / iterations;
    const probDownside = 1 - probUpside;
    
    return {
        iterations,
        statistics: {
            mean: round(mean),
            median: round(median),
            std_dev: round(stdDev),
            min: round(min),
            max: round(max),
            p10: round(p10),
            p25: round(p25),
            p75: round(p75),
            p90: round(p90)
        },
        histogram,
        probability: {
            upside: (probUpside * 100).toFixed(1),
            downside: (probDownside * 100).toFixed(1)
        },
        current_price: currentPrice,
        expected_value: round(mean)
    };
}

// ============================================
// SENSITIVITY MATRIX (2-Way Data Table)
// WACC × Terminal Growth → Per Share Value
// ============================================
function generateSensitivityMatrix(model) {
    const { assumptions } = model;
    const waccValues = [];
    const tgrValues = [];
    
    // Generate WACC range (±2% around base)
    const baseWACC = assumptions.wacc;
    for (let w = -0.02; w <= 0.021; w += 0.005) {
        waccValues.push(round(baseWACC + w));
    }
    
    // Generate TGR range (±1% around base)
    const baseTGR = assumptions.terminal_growth_rate;
    for (let g = -0.01; g <= 0.011; g += 0.0025) {
        tgrValues.push(round(Math.max(0.005, baseTGR + g)));
    }
    
    const matrix = [];
    waccValues.forEach(wacc => {
        const row = { wacc, values: [] };
        tgrValues.forEach(tgr => {
            const simAssumptions = { ...assumptions, wacc, terminal_growth_rate: tgr };
            const value = recalculateDCF(simAssumptions);
            row.values.push({
                tgr,
                value: round(value),
                highlight: Math.abs(wacc - baseWACC) < 0.001 && Math.abs(tgr - baseTGR) < 0.001
            });
        });
        matrix.push(row);
    });
    
    return {
        wacc_values: waccValues,
        tgr_values: tgrValues,
        matrix,
        base_wacc: baseWACC,
        base_tgr: baseTGR
    };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function triangularRandom(min, mode, max) {
    const u = Math.random();
    const c = (mode - min) / (max - min);
    if (u <= c) {
        return min + Math.sqrt(u * (max - min) * (mode - min));
    }
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function recalculateDCF(assumptions) {
    const { 
        revenue_base, revenue_growth, projection_years, 
        ebitda_margin, tax_rate, wacc, terminal_growth_rate,
        d_and_a_pct, capex_pct_revenue, working_capital_pct_revenue,
        net_debt, shares_outstanding 
    } = assumptions;
    
    let fcffSum = 0;
    let revenue = revenue_base;
    
    for (let year = 1; year <= projection_years; year++) {
        revenue *= (1 + revenue_growth);
        const ebitda = revenue * ebitda_margin;
        const dna = revenue * (d_and_a_pct || 0.02);
        const ebit = ebitda - dna;
        const taxes = Math.max(0, ebit * tax_rate);
        const nopat = ebit - taxes;
        const capex = revenue * (capex_pct_revenue || 0.05);
        const wcChange = revenue * (working_capital_pct_revenue || 0.03) * revenue_growth;
        const fcff = nopat + dna - capex - wcChange;
        
        fcffSum += fcff / Math.pow(1 + wacc, year);
    }
    
    // Terminal value
    const terminalRevenue = revenue * (1 + revenue_growth);
    const terminalEBITDA = terminalRevenue * ebitda_margin;
    const terminalDNA = terminalRevenue * (d_and_a_pct || 0.02);
    const terminalEBIT = terminalEBITDA - terminalDNA;
    const terminalTaxes = Math.max(0, terminalEBIT * tax_rate);
    const terminalNOPAT = terminalEBIT - terminalTaxes;
    const terminalCapEx = terminalRevenue * (capex_pct_revenue || 0.05);
    const terminalWCChange = terminalRevenue * (working_capital_pct_revenue || 0.03) * revenue_growth;
    const terminalFCFF = terminalNOPAT + terminalDNA - terminalCapEx - terminalWCChange;
    
    const terminalValue = terminalFCFF * (1 + terminal_growth_rate) / (wacc - terminal_growth_rate);
    const pvTerminal = terminalValue / Math.pow(1 + wacc, projection_years);
    
    const enterpriseValue = fcffSum + pvTerminal;
    const equityValue = enterpriseValue - (net_debt || 0);
    const perShare = equityValue / (shares_outstanding || 1);
    
    return perShare;
}

function calculateCompsMedians(companies) {
    const metrics = { ev_ebitda: [], ev_sales: [], pe: [] };
    companies.forEach(c => {
        if (c.ev_ebitda) metrics.ev_ebitda.push(c.ev_ebitda);
        if (c.ev_sales) metrics.ev_sales.push(c.ev_sales);
        if (c.pe) metrics.pe.push(c.pe);
    });
    
    return {
        ev_ebitda: median(metrics.ev_ebitda),
        ev_sales: median(metrics.ev_sales),
        pe: median(metrics.pe)
    };
}

function calculateTransactionMedians(transactions) {
    const metrics = { ev_ebitda: [], ev_sales: [], premium: [] };
    transactions.forEach(t => {
        if (t.ev_ebitda) metrics.ev_ebitda.push(t.ev_ebitda);
        if (t.ev_sales) metrics.ev_sales.push(t.ev_sales);
        if (t.premium_pct) metrics.premium.push(t.premium_pct);
    });
    
    return {
        ev_ebitda: median(metrics.ev_ebitda),
        ev_sales: median(metrics.ev_sales),
        premium: median(metrics.premium)
    };
}

function median(arr) {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(n, digits = 2) {
    return Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits);
}

module.exports = {
    generateFootballField,
    generateWaterfallBridge,
    generateTornadoChart,
    runMonteCarlo,
    generateSensitivityMatrix
};
