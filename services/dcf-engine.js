/**
 * DCF engine — computes intrinsic value from model inputs at runtime.
 * Uses FCFF methodology with Gordon Growth terminal value. computeDCF (model
 * JSON adapter) and computeDCFFromParams (explicit params) share one precise core.
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

    const invalid = (msg) => ({
        enterprise_value: { value: 0, unit: 'INR_CR' },
        equity_value: { value: 0, unit: 'INR_CR' },
        per_share_value: { value: 0, unit: 'INR' },
        _computed: true,
        _error: msg,
    });

    if (!revenue || !ebitda) return invalid('Missing base-year revenue or EBITDA');

    const horizon = dcf.horizon_years || 5;
    const revenueGrowth = estimates.revenue_growth || 0.08;
    const wacc = (dcf.wacc?.value || 10.5) / 100;
    const terminalGrowth = (dcf.terminal_growth?.value || 3.5) / 100;

    if (wacc <= terminalGrowth) return invalid('WACC must be greater than terminal growth rate');

    // Delegate to the precise FCFF core so the model JSON adapter and the
    // parameter API produce identical, unrounded values.
    const result = computeDCFFromParams({
        baseRevenue: revenue,
        growthRates: Array(horizon).fill(revenueGrowth),
        ebitdaMargin: ebitda / revenue,
        taxRate: (settings.tax_rate?.value || 25.17) / 100,
        daPct: depreciation / revenue,
        capexPct: estimates.capex_pct || 0.05,
        wcPct: estimates.working_capital_pct || 0.03,
        wacc,
        terminalGrowth,
        horizon,
        netDebt: (bsData.total_debt || 0) - (bsData.cash_and_investments || 0),
        shares: bsData.shares_outstanding || 1,
    });

    if (!result.valid) return invalid('WACC must be greater than terminal growth rate');

    return {
        enterprise_value: { value: result.enterpriseValue, unit: 'INR_CR' },
        equity_value: { value: result.equityValue, unit: 'INR_CR' },
        per_share_value: { value: result.perShareValue, unit: 'INR' },
        _computed: true,
        _method: 'fcff',
        _details: {
            base_year: { revenue, ebitda, depreciation },
            assumptions: { wacc: wacc * 100, g: terminalGrowth * 100, tax_rate: (settings.tax_rate?.value || 25.17), horizon },
            estimates: { revenue_growth: revenueGrowth, capex_pct: estimates.capex_pct || 0.05, wc_pct: estimates.working_capital_pct || 0.03 },
            forecast: result.forecast,
            terminal_value: result.terminalValue,
            pv_fcff: result.pvFcff,
            pv_terminal: result.pvTerminal,
            net_debt: (bsData.total_debt || 0) - (bsData.cash_and_investments || 0),
            shares_outstanding: bsData.shares_outstanding || 1,
        },
    };
}

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
