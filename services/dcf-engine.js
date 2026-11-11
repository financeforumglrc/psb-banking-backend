/**
 * Simplified DCF engine — computes intrinsic value from model inputs at runtime.
 * Uses FCFF methodology with Gordon Growth terminal value.
 */

/**
 * @param {Object} model — the full model JSON
 * @returns {Object} { enterprise_value, equity_value, per_share_value, _computed: true, _details: {} }
 */
function computeDCF(model) {
    const dcf = model.dcf || {};
    const settings = model.settings || {};
    const isData = model.statements?.income_statement || {};
    const bsData = model.statements?.balance_sheet?.FY24 || {};
    const estimates = model.estimates || {};

    // ---- Base-year (FY24) financials ----
    const fy24 = isData.FY24 || [];
    const getVal = (idPart) => fy24.find(i => i.id && i.id.includes(idPart))?.value || 0;

    const revenue = getVal('revenue');
    const ebitda = getVal('ebitda') || getVal('operating_profit');
    const depreciation = getVal('depreciation');
    const pat = getVal('pat');

    if (!revenue || !ebitda) {
        return {
            enterprise_value: { value: 0, unit: 'INR_CR' },
            equity_value: { value: 0, unit: 'INR_CR' },
            per_share_value: { value: 0, unit: 'INR' },
            _computed: true,
            _error: 'Missing base-year revenue or EBITDA',
        };
    }

    const ebit = ebitda - depreciation;
    const taxRate = (settings.tax_rate?.value || 25.17) / 100;
    const nopat = ebit * (1 - taxRate);

    // ---- Assumptions ----
    const wacc = (dcf.wacc?.value || 10.5) / 100;
    const g = (dcf.terminal_growth?.value || 3.5) / 100;
    const horizon = dcf.horizon_years || 5;

    if (wacc <= g) {
        return {
            enterprise_value: { value: 0, unit: 'INR_CR' },
            equity_value: { value: 0, unit: 'INR_CR' },
            per_share_value: { value: 0, unit: 'INR' },
            _computed: true,
            _error: 'WACC must be greater than terminal growth rate',
        };
    }

    // ---- Balance sheet bridge ----
    const totalDebt = bsData.total_debt || 0;
    const cash = bsData.cash_and_investments || 0;
    const shares = bsData.shares_outstanding || 1;
    const netDebt = totalDebt - cash;

    // ---- Forecast assumptions (estimates) ----
    const revenueGrowth = estimates.revenue_growth || 0.08;
    const capexPct = estimates.capex_pct || 0.05;
    const wcPct = estimates.working_capital_pct || 0.03;

    // ---- Build FCFF forecast ----
    const ebitdaMargin = ebitda / revenue;
    const daPct = depreciation / revenue;

    let fcffs = [];
    let rev = revenue;
    for (let year = 1; year <= horizon; year++) {
        rev = rev * (1 + revenueGrowth);
        const yearEbitda = rev * ebitdaMargin;
        const yearDa = rev * daPct;
        const yearEbit = yearEbitda - yearDa;
        const yearNopat = yearEbit * (1 - taxRate);
        const yearCapex = rev * capexPct;
        const prevRev = rev / (1 + revenueGrowth);
        const yearWcChange = (rev - prevRev) * wcPct;
        const yearFcff = yearNopat + yearDa - yearCapex - yearWcChange;
        fcffs.push({
            year,
            revenue: Math.round(rev),
            ebitda: Math.round(yearEbitda),
            nopat: Math.round(yearNopat),
            depreciation: Math.round(yearDa),
            capex: Math.round(yearCapex),
            wc_change: Math.round(yearWcChange),
            fcff: Math.round(yearFcff),
        });
    }

    // ---- Terminal Value (Gordon Growth) ----
    const terminalFcff = fcffs[horizon - 1].fcff * (1 + g);
    const terminalValue = terminalFcff / (wacc - g);

    // ---- Discount to Present ----
    let pvFcff = 0;
    for (let i = 0; i < horizon; i++) {
        pvFcff += fcffs[i].fcff / Math.pow(1 + wacc, i + 1);
    }
    const pvTerminal = terminalValue / Math.pow(1 + wacc, horizon);
    const enterpriseValue = pvFcff + pvTerminal;
    const equityValue = enterpriseValue - netDebt;
    const perShareValue = equityValue / shares;

    return {
        enterprise_value: { value: Math.round(enterpriseValue), unit: 'INR_CR' },
        equity_value: { value: Math.round(equityValue), unit: 'INR_CR' },
        per_share_value: { value: Math.round(perShareValue), unit: 'INR' },
        _computed: true,
        _method: 'simplified_fcff',
        _details: {
            base_year: { revenue, ebitda, depreciation, ebit, nopat: Math.round(nopat) },
            assumptions: { wacc: wacc * 100, g: g * 100, tax_rate: taxRate * 100, horizon },
            estimates: { revenue_growth: revenueGrowth, capex_pct: capexPct, wc_pct: wcPct },
            forecast: fcffs,
            terminal_value: Math.round(terminalValue),
            pv_fcff: Math.round(pvFcff),
            pv_terminal: Math.round(pvTerminal),
            net_debt: Math.round(netDebt),
            shares_outstanding: shares,
        },
    };
}

module.exports = { computeDCF };

/**
 * DCF from explicit parameters (used by the modelling workspace and tests).
 * Same FCFF methodology as computeDCF: NOPAT + DA − CAPEX − ΔWC, Gordon terminal.
 * @param {Object} p { baseRevenue, growthRates, ebitdaMargin, taxRate, daPct, capexPct, wcPct, wacc, terminalGrowth, horizon, netDebt, shares }
 */
function computeDCFFromParams(p) {
    const {
        baseRevenue, growthRates, ebitdaMargin, taxRate, daPct,
        capexPct, wcPct, wacc, terminalGrowth, horizon, netDebt, shares
    } = p;

    if (wacc <= terminalGrowth || horizon < 1) {
        return { valid: false, perShareValue: NaN };
    }

    // FCFF = rev × [ebitdaMargin×(1−tax) + daPct×tax − capexPct] − Δrev × wcPct
    const fcff = (rev, prevRev) =>
        rev * (ebitdaMargin * (1 - taxRate) + daPct * taxRate - capexPct) - (rev - prevRev) * wcPct;

    let rev = baseRevenue;
    const forecast = [];
    for (let year = 1; year <= horizon; year++) {
        const prevRev = rev;
        rev = rev * (1 + (growthRates[year - 1] || 0));
        forecast.push({ year, revenue: rev, fcff: fcff(rev, prevRev) });
    }

    let pvFcff = 0;
    for (let i = 0; i < horizon; i++) {
        pvFcff += forecast[i].fcff / Math.pow(1 + wacc, i + 1);
    }

    const terminalValue = (forecast[horizon - 1].fcff * (1 + terminalGrowth)) / (wacc - terminalGrowth);
    const pvTerminal = terminalValue / Math.pow(1 + wacc, horizon);
    const enterpriseValue = pvFcff + pvTerminal;
    const equityValue = enterpriseValue - netDebt;
    const perShareValue = equityValue / shares;

    return { valid: true, forecast, terminalValue, pvTerminal, pvFcff, enterpriseValue, equityValue, perShareValue };
}

/**
 * Span-correct CAGR: (end/start)^(1/periods) − 1. Returns 0 for invalid inputs.
 */
function cagr(end, start, periods) {
    if (!start || start <= 0 || end <= 0 || !periods || periods <= 0) return 0;
    return Math.pow(end / start, 1 / periods) - 1;
}

module.exports = { computeDCF, computeDCFFromParams, cagr };
