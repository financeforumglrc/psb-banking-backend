/**
 * Anomaly Detection Service for dsFinancial Phase 3
 * Deterministic checks on financial models
 */

function sumLineItems(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((a, b) => a + (b.value || 0), 0);
}

function detectAnomalies(model) {
    const flags = [];
    if (!model) return flags;

    const settings = model.settings || {};
    const dcf = model.dcf || {};
    const statements = model.statements || {};
    const bs = statements.balance_sheet || {};
    const is = statements.income_statement || {};

    // Check 1: WACC > Terminal Growth
    const wacc = parseFloat(dcf.wacc?.value || settings.tax_rate?.value || 10) / 100;
    const tgr = parseFloat(dcf.terminal_growth?.value || 3.5) / 100;
    if (wacc <= tgr) {
        flags.push({
            severity: 'error',
            code: 'WACC_LE_G',
            message: `WACC (${(wacc * 100).toFixed(2)}%) must exceed terminal growth (${(tgr * 100).toFixed(2)}%). DCF formula divides by (WACC - g) — if WACC ≤ g, terminal value explodes to infinity.`,
            cell_ids: ['dcf.wacc', 'dcf.terminal_growth'],
        });
    }

    // Check 2: Tax rate bounds
    const taxRate = parseFloat(settings.tax_rate?.value || 25) / 100;
    if (taxRate < 0 || taxRate > 0.60) {
        flags.push({
            severity: 'error',
            code: 'TAX_RATE_OUT_OF_BOUNDS',
            message: `Tax rate of ${(taxRate * 100).toFixed(2)}% is outside the normal range [0%, 60%]. Verify the input.`,
            cell_ids: ['settings.tax_rate'],
        });
    }

    // Check 3: Balance sheet balance (if data available)
    const bsYears = Object.keys(bs);
    for (const year of bsYears) {
        const yearData = bs[year];
        if (!Array.isArray(yearData)) continue;
        const assets = yearData.filter(x => x.label?.toLowerCase().includes('asset') && !x.label?.toLowerCase().includes('non'));
        const totalAssets = sumLineItems(assets);
        const liabilities = yearData.filter(x => x.label?.toLowerCase().includes('liabilit'));
        const equity = yearData.filter(x => x.label?.toLowerCase().includes('equity') || x.label?.toLowerCase().includes('shareholders'));
        const totalLiabEq = sumLineItems(liabilities) + sumLineItems(equity);
        if (totalAssets > 0 && Math.abs(totalAssets - totalLiabEq) > 0.01 * totalAssets) {
            flags.push({
                severity: 'error',
                code: 'BS_UNBALANCED',
                message: `Balance sheet doesn't balance in ${year}. Assets (₹${totalAssets.toFixed(0)} Cr) ≠ Liabilities + Equity (₹${totalLiabEq.toFixed(0)} Cr). Difference: ₹${Math.abs(totalAssets - totalLiabEq).toFixed(0)} Cr.`,
                cell_ids: [`bs.total_assets.${year}`, `bs.total_liabilities.${year}`, `bs.total_equity.${year}`],
            });
        }
    }

    // Check 4: Revenue growth reasonableness
    const isYears = Object.keys(is).sort();
    for (let i = 1; i < isYears.length; i++) {
        const currYear = is[isYears[i]];
        const prevYear = is[isYears[i - 1]];
        if (!Array.isArray(currYear) || !Array.isArray(prevYear)) continue;
        const currRev = currYear.find(x => x.label?.toLowerCase().includes('revenue'));
        const prevRev = prevYear.find(x => x.label?.toLowerCase().includes('revenue'));
        if (currRev?.value && prevRev?.value && prevRev.value > 0) {
            const growth = (currRev.value - prevRev.value) / prevRev.value;
            if (growth > 1.0) {
                flags.push({
                    severity: 'warning',
                    code: 'REVENUE_GROWTH_HIGH',
                    message: `Revenue grew ${(growth * 100).toFixed(0)}% in ${isYears[i]}. Verify if this is organic growth or due to an acquisition/one-off.`,
                    cell_ids: [`is.revenue.${isYears[i]}`],
                });
            }
            if (growth < -0.5) {
                flags.push({
                    severity: 'warning',
                    code: 'REVENUE_GROWTH_NEGATIVE',
                    message: `Revenue declined ${(Math.abs(growth) * 100).toFixed(0)}% in ${isYears[i]}. Investigate drivers of the contraction.`,
                    cell_ids: [`is.revenue.${isYears[i]}`],
                });
            }
        }
    }

    // Check 5: Horizon years
    const horizon = parseInt(dcf.horizon_years || 5);
    if (horizon < 3) {
        flags.push({
            severity: 'warning',
            code: 'HORIZON_TOO_SHORT',
            message: `Forecast horizon of ${horizon} years is short. Most DCF models use 5-10 years to capture the business cycle.`,
            cell_ids: ['dcf.horizon_years'],
        });
    }

    // Check 6: Shares outstanding
    const shares = parseFloat(model.company?.shares_outstanding || dcf.outputs?.per_share_value?.value || 100);
    if (shares <= 0) {
        flags.push({
            severity: 'error',
            code: 'SHARES_INVALID',
            message: 'Shares outstanding must be greater than zero to compute per-share value.',
            cell_ids: ['company.shares_outstanding'],
        });
    }

    return flags;
}

module.exports = { detectAnomalies };
