/**
 * Excel Export Route for dsFinancial Phase 3
 * POST /api/v1/models/:id/export/xlsx
 * Generates a professional DCF workbook with live formulas
 */

const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();

// Format helpers
const FMT_CR = '#,##0.00 "Cr"';
const FMT_PCT = '0.00%';
const FMT_MULTIPLE = '0.00x';
const FMT_INR = '₹#,##0.00';

const BLUE_INPUT = { fg: { argb: 'FF2563EB' }, bold: true };
const BLACK_FORMULA = { fg: { argb: 'FF1F2937' } };
const GREEN_CHECK = { fg: { argb: 'FF10B981' } };
const RED_ERROR = { fg: { argb: 'FFEF4444' } };

function getCellValue(model, path, fallback = 0) {
    // Navigate nested path like "dcf.wacc.value"
    const parts = path.split('.');
    let val = model;
    for (const p of parts) {
        if (val == null) return fallback;
        val = val[p];
    }
    return val != null ? val : fallback;
}

function safeNum(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

async function buildWorkbook(model) {
    const wb = new ExcelJS.Workbook();
    const company = model.company || {};
    const settings = model.settings || {};
    const dcf = model.dcf || {};
    const statements = model.statements || {};
    const is = statements.income_statement || {};
    const bs = statements.balance_sheet || {};
    const cf = statements.cash_flow || {};

    const years = Object.keys(is).sort().reverse(); // FY24, FY23, FY22
    const fyCurrent = years[0] || 'FY24';
    const fyPrev = years[1] || 'FY23';
    const fyPrev2 = years[2] || 'FY22';

    // Extract key values
    const revCurrent = safeNum(is[fyCurrent]?.find(x => x.label?.toLowerCase().includes('revenue'))?.value);
    const revPrev = safeNum(is[fyPrev]?.find(x => x.label?.toLowerCase().includes('revenue'))?.value);
    const revPrev2 = safeNum(is[fyPrev2]?.find(x => x.label?.toLowerCase().includes('revenue'))?.value);
    const patCurrent = safeNum(is[fyCurrent]?.find(x => x.label?.toLowerCase().includes('profit') || x.label?.toLowerCase().includes('pat') || x.label?.toLowerCase().includes('net income'))?.value);
    const ebitdaCurrent = safeNum(is[fyCurrent]?.find(x => x.label?.toLowerCase().includes('ebitda'))?.value);

    const wacc = safeNum(getCellValue(model, 'dcf.wacc.value', 10.5)) / 100;
    const tgr = safeNum(getCellValue(model, 'dcf.terminal_growth.value', 3.5)) / 100;
    const taxRate = safeNum(getCellValue(model, 'settings.tax_rate.value', 25.17)) / 100;
    const horizon = safeNum(getCellValue(model, 'dcf.horizon_years', 5));
    const shares = safeNum(getCellValue(model, 'company.shares_outstanding', 100));
    const netDebt = safeNum(getCellValue(model, 'company.net_debt', 0));

    // Revenue growth rates
    const revGrowth1 = revPrev > 0 ? (revCurrent - revPrev) / revPrev : 0.12;
    const revGrowth2 = revPrev2 > 0 ? (revPrev - revPrev2) / revPrev2 : 0.10;
    const avgGrowth = (revGrowth1 + revGrowth2) / 2;

    // ── Sheet 1: Cover ──
    const cover = wb.addWorksheet('Cover');
    cover.mergeCells('A1:H10');
    cover.getCell('A1').value = `${company.name || 'Company'} — DCF Valuation Model`;
    cover.getCell('A1').font = { size: 24, bold: true, color: { argb: 'FF1F2937' } };
    cover.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    cover.mergeCells('A12:H12');
    cover.getCell('A12').value = `Ticker: ${company.ticker || 'N/A'}  |  Exchange: ${company.exchange || 'N/A'}  |  Model Date: ${new Date().toISOString().split('T')[0]}`;
    cover.getCell('A12').font = { size: 12, color: { argb: 'FF6B7280' } };
    cover.getCell('A12').alignment = { horizontal: 'center' };

    cover.mergeCells('A14:H14');
    cover.getCell('A14').value = 'Built with dsFinancial — https://dsfinancial.in';
    cover.getCell('A14').font = { size: 11, color: { argb: 'FF2563EB' }, underline: 'single' };
    cover.getCell('A14').alignment = { horizontal: 'center' };

    cover.mergeCells('A16:H18');
    cover.getCell('A16').value = 'DISCLAIMER: This model is for educational and analytical purposes only. It does not constitute investment advice. All projections are hypothetical and based on user assumptions.';
    cover.getCell('A16').font = { size: 10, color: { argb: 'FF9CA3AF' }, italic: true };
    cover.getCell('A16').alignment = { horizontal: 'center', wrapText: true };

    // ── Sheet 2: Assumptions ──
    const ass = wb.addWorksheet('Assumptions');
    ass.columns = [{ width: 35 }, { width: 18 }, { width: 12 }, { width: 40 }];

    const addAssumption = (row, label, value, format, note, name) => {
        ass.getCell(`A${row}`).value = label;
        ass.getCell(`B${row}`).value = value;
        ass.getCell(`B${row}`).numFmt = format;
        ass.getCell(`B${row}`).font = BLUE_INPUT;
        if (name) ass.getCell(`B${row}`).name = name;
        ass.getCell(`D${row}`).value = note;
        ass.getCell(`D${row}`).font = { size: 10, color: { argb: 'FF9CA3AF' } };
        return row + 1;
    };

    let r = 1;
    ass.getCell(`A${r}`).value = 'KEY ASSUMPTIONS';
    ass.getCell(`A${r}`).font = { bold: true, size: 14 };
    r += 2;

    r = addAssumption(r, 'WACC', wacc, FMT_PCT, 'Weighted average cost of capital', 'WACC');
    r = addAssumption(r, 'Terminal Growth Rate (g)', tgr, FMT_PCT, 'Long-run GDP growth proxy', 'g_terminal');
    r = addAssumption(r, 'Tax Rate', taxRate, FMT_PCT, 'Corporate tax rate (India Sec 115BAA)', 'tax_rate');
    r = addAssumption(r, 'Forecast Horizon (years)', horizon, '0', 'Number of explicit forecast years', 'horizon');
    r++;
    r = addAssumption(r, 'Revenue Growth Y1-Y2', avgGrowth, FMT_PCT, 'Based on historical CAGR', 'rev_growth_1');
    r = addAssumption(r, 'Revenue Growth Y3+', avgGrowth * 0.85, FMT_PCT, 'Deceleration in mature years', 'rev_growth_2');
    r = addAssumption(r, 'EBITDA Margin', ebitdaCurrent > 0 && revCurrent > 0 ? ebitdaCurrent / revCurrent : 0.18, FMT_PCT, 'As % of revenue', 'ebitda_margin');
    r = addAssumption(r, 'D&A as % of Revenue', 0.03, FMT_PCT, 'Depreciation & amortization', 'da_pct');
    r = addAssumption(r, 'CapEx as % of Revenue', 0.05, FMT_PCT, 'Capital expenditure', 'capex_pct');
    r = addAssumption(r, 'ΔWC as % of Revenue', 0.01, FMT_PCT, 'Change in working capital', 'dwc_pct');
    r++;
    r = addAssumption(r, 'Net Debt (₹ Cr)', netDebt, FMT_CR, 'Total debt minus cash', 'net_debt');
    r = addAssumption(r, 'Shares Outstanding (Cr)', shares, '#,##0.00', 'Fully diluted', 'shares');

    // ── Sheet 3: Income Statement ──
    const income = wb.addWorksheet('Income Statement');
    income.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, ...Array(5).fill({ width: 16 })];

    const isHeaders = ['Line Item', fyPrev2, fyPrev, fyCurrent, 'Y+1', 'Y+2', 'Y+3', 'Y+4', 'Y+5'];
    isHeaders.forEach((h, i) => {
        const cell = income.getCell(1, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    });

    const addISRow = (row, label, histValues, formulaFn) => {
        income.getCell(row, 1).value = label;
        income.getCell(row, 1).font = { bold: label.includes('Total') || label.includes('EBIT') };
        histValues.forEach((v, i) => {
            income.getCell(row, i + 2).value = v;
            income.getCell(row, i + 2).numFmt = FMT_CR;
        });
        if (formulaFn) {
            for (let i = 0; i < 5; i++) {
                const cell = income.getCell(row, 5 + i);
                cell.value = { formula: formulaFn(i + 1) };
                cell.numFmt = FMT_CR;
                cell.font = BLACK_FORMULA;
            }
        }
    };

    // Build IS rows with formulas referencing Assumptions
    let isRow = 2;
    addISRow(isRow++, 'Revenue', [revPrev2, revPrev, revCurrent],
        y => `=C${isRow - 1 + (y === 1 ? 0 : -1)}*(1+${y <= 2 ? 'rev_growth_1' : 'rev_growth_2'})`);
    const revRow = isRow - 1;
    addISRow(isRow++, 'Cost of Goods Sold', [revPrev2 * 0.55, revPrev * 0.55, revCurrent * 0.55],
        y => `=-${String.fromCharCode(66 + 3 + y)}${revRow}*0.55`);
    addISRow(isRow++, 'Gross Profit', [revPrev2 * 0.45, revPrev * 0.45, revCurrent * 0.45],
        y => `=${String.fromCharCode(66 + 3 + y)}${revRow}+${String.fromCharCode(66 + 3 + y)}${revRow + 1}`);
    addISRow(isRow++, 'SG&A', [revPrev2 * 0.15, revPrev * 0.15, revCurrent * 0.15],
        y => `=-${String.fromCharCode(66 + 3 + y)}${revRow}*0.15`);
    addISRow(isRow++, 'EBITDA', [revPrev2 * 0.30, revPrev * 0.30, revCurrent * 0.30],
        y => `=${String.fromCharCode(66 + 3 + y)}${revRow + 2}+${String.fromCharCode(66 + 3 + y)}${revRow + 3}`);
    const ebitdaRow = isRow - 1;
    addISRow(isRow++, 'D&A', [revPrev2 * 0.03, revPrev * 0.03, revCurrent * 0.03],
        y => `=-${String.fromCharCode(66 + 3 + y)}${revRow}*da_pct`);
    addISRow(isRow++, 'EBIT', [revPrev2 * 0.27, revPrev * 0.27, revCurrent * 0.27],
        y => `=${String.fromCharCode(66 + 3 + y)}${ebitdaRow}+${String.fromCharCode(66 + 3 + y)}${ebitdaRow + 1}`);
    const ebitRow = isRow - 1;
    addISRow(isRow++, 'Interest', [revPrev2 * 0.01, revPrev * 0.01, revCurrent * 0.01],
        y => `=-${String.fromCharCode(66 + 3 + y)}${revRow}*0.01`);
    addISRow(isRow++, 'EBT', [revPrev2 * 0.26, revPrev * 0.26, revCurrent * 0.26],
        y => `=${String.fromCharCode(66 + 3 + y)}${ebitRow}+${String.fromCharCode(66 + 3 + y)}${ebitRow + 1}`);
    const ebtRow = isRow - 1;
    addISRow(isRow++, 'Tax', [revPrev2 * 0.26 * taxRate, revPrev * 0.26 * taxRate, revCurrent * 0.26 * taxRate],
        y => `=-${String.fromCharCode(66 + 3 + y)}${ebtRow}*tax_rate`);
    addISRow(isRow++, 'Net Income (PAT)', [revPrev2 * 0.26 * (1 - taxRate), revPrev * 0.26 * (1 - taxRate), revCurrent * 0.26 * (1 - taxRate)],
        y => `=${String.fromCharCode(66 + 3 + y)}${ebtRow}+${String.fromCharCode(66 + 3 + y)}${ebtRow + 1}`);

    // ── Sheet 4: DCF ──
    const dcfSheet = wb.addWorksheet('DCF');
    dcfSheet.columns = [{ width: 30 }, ...Array(5).fill({ width: 16 })];

    const dcfHeaders = ['DCF Projection', 'Y+1', 'Y+2', 'Y+3', 'Y+4', 'Y+5'];
    dcfHeaders.forEach((h, i) => {
        const cell = dcfSheet.getCell(1, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    });

    let dr = 2;
    const addDCFRow = (row, label, formula, fmt = FMT_CR) => {
        dcfSheet.getCell(row, 1).value = label;
        if (typeof formula === 'string') {
            for (let i = 0; i < 5; i++) {
                const cell = dcfSheet.getCell(row, i + 2);
                cell.value = { formula: formula.replace(/\{y\}/g, i + 1).replace(/\{col\}/g, String.fromCharCode(66 + i)) };
                cell.numFmt = fmt;
                cell.font = BLACK_FORMULA;
            }
        } else if (Array.isArray(formula)) {
            formula.forEach((v, i) => {
                const cell = dcfSheet.getCell(row, i + 2);
                cell.value = v;
                cell.numFmt = fmt;
                if (typeof v === 'object' && v.formula) cell.font = BLACK_FORMULA;
            });
        }
        return row + 1;
    };

    // Use IS sheet revenue row for base
    const baseRev = revCurrent;
    const growth1 = avgGrowth;
    const growth2 = avgGrowth * 0.85;

    dr = addDCFRow(dr, 'Revenue', (y) => {
        const prevCol = y === 1 ? 'C' : String.fromCharCode(66 + y - 1);
        const g = y <= 2 ? 'rev_growth_1' : 'rev_growth_2';
        return `=${prevCol}${revRow}*(1+${g})`;
    });
    const dcfRevRow = dr - 1;
    dr = addDCFRow(dr, 'EBIT', (y) => `=${String.fromCharCode(66 + y)}${dcfRevRow}*ebitda_margin-da_pct*${String.fromCharCode(66 + y)}${dcfRevRow}`);
    const dcfEbitRow = dr - 1;
    dr = addDCFRow(dr, 'Tax on EBIT', (y) => `=-${String.fromCharCode(66 + y)}${dcfEbitRow}*tax_rate`);
    const dcfTaxRow = dr - 1;
    dr = addDCFRow(dr, 'NOPAT', (y) => `=${String.fromCharCode(66 + y)}${dcfEbitRow}+${String.fromCharCode(66 + y)}${dcfTaxRow}`);
    const dcfNopatRow = dr - 1;
    dr = addDCFRow(dr, 'D&A', (y) => `=${String.fromCharCode(66 + y)}${dcfRevRow}*da_pct`);
    const dcfDaRow = dr - 1;
    dr = addDCFRow(dr, 'CapEx', (y) => `=-${String.fromCharCode(66 + y)}${dcfRevRow}*capex_pct`);
    const dcfCapexRow = dr - 1;
    dr = addDCFRow(dr, 'ΔWorking Capital', (y) => `=-${String.fromCharCode(66 + y)}${dcfRevRow}*dwc_pct`);
    const dcfWcRow = dr - 1;
    dr = addDCFRow(dr, 'FCFF', (y) => `=${String.fromCharCode(66 + y)}${dcfNopatRow}+${String.fromCharCode(66 + y)}${dcfDaRow}+${String.fromCharCode(66 + y)}${dcfCapexRow}+${String.fromCharCode(66 + y)}${dcfWcRow}`);
    const dcfFcffRow = dr - 1;
    dr = addDCFRow(dr, 'Discount Factor', (y) => `=1/(1+WACC)^${y}`);
    const dcfDfRow = dr - 1;
    dr = addDCFRow(dr, 'PV of FCFF', (y) => `=${String.fromCharCode(66 + y)}${dcfFcffRow}*${String.fromCharCode(66 + y)}${dcfDfRow}`);
    const dcfPvRow = dr - 1;
    dr++;
    dr = addDCFRow(dr, 'Sum of PV (Years 1-5)', [
        { formula: `=SUM(B${dcfPvRow}:F${dcfPvRow})` }, null, null, null, null
    ]);
    const sumPvRow = dr - 1;
    dr = addDCFRow(dr, 'Terminal Value (Gordon)', [
        { formula: `=F${dcfFcffRow}*(1+g_terminal)/(WACC-g_terminal)` }, null, null, null, null
    ]);
    const tvRow = dr - 1;
    dr = addDCFRow(dr, 'PV of Terminal Value', [
        { formula: `=B${tvRow}*F${dcfDfRow}` }, null, null, null, null
    ]);
    const pvTvRow = dr - 1;
    dr = addDCFRow(dr, 'Enterprise Value', [
        { formula: `=B${sumPvRow}+B${pvTvRow}` }, null, null, null, null
    ]);
    const evRow = dr - 1;
    dr = addDCFRow(dr, 'Less: Net Debt', [
        { formula: `=-net_debt` }, null, null, null, null
    ]);
    const debtRow = dr - 1;
    dr = addDCFRow(dr, 'Equity Value', [
        { formula: `=B${evRow}+B${debtRow}` }, null, null, null, null
    ]);
    const eqRow = dr - 1;
    dr = addDCFRow(dr, 'Shares Outstanding (Cr)', [
        { formula: `=shares` }, null, null, null, null
    ]);
    const shRow = dr - 1;
    dr = addDCFRow(dr, 'Value per Share (₹)', [
        { formula: `=B${eqRow}/B${shRow}` }, null, null, null, null
    ], FMT_INR);
    const vpsRow = dr - 1;

    // ── Sheet 5: Sensitivity ──
    const sens = wb.addWorksheet('Sensitivity');
    sens.columns = [{ width: 18 }, ...Array(5).fill({ width: 14 })];

    sens.getCell('A1').value = 'WACC \\ g';
    sens.getCell('A1').font = { bold: true };
    const waccVals = [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02];
    const gVals = [tgr - 0.01, tgr, tgr + 0.01];

    waccVals.forEach((v, i) => {
        sens.getCell(1, i + 2).value = v;
        sens.getCell(1, i + 2).numFmt = FMT_PCT;
        sens.getCell(1, i + 2).font = { bold: true };
    });

    gVals.forEach((g, i) => {
        const row = i + 2;
        sens.getCell(row, 1).value = g;
        sens.getCell(row, 1).numFmt = FMT_PCT;
        sens.getCell(row, 1).font = { bold: true };
        waccVals.forEach((w, j) => {
            // Formula: FCFF_Y5 * (1+g) / (w-g) * DF + Sum PV
            const col = String.fromCharCode(66 + j);
            sens.getCell(row, j + 2).value = {
                formula: `=(${col}${dcfFcffRow}*(1+A${row})/(${col}$1-A${row})*${col}${dcfDfRow}+${col}${sumPvRow})/shares`
            };
            sens.getCell(row, j + 2).numFmt = FMT_INR;
        });
    });

    // ── Sheet 6: Checks ──
    const checks = wb.addWorksheet('Checks');
    checks.columns = [{ width: 40 }, { width: 12 }, { width: 50 }];

    const addCheck = (row, label, formula, passText, failText) => {
        checks.getCell(row, 1).value = label;
        checks.getCell(row, 2).value = { formula };
        checks.getCell(row, 2).font = { bold: true };
        checks.getCell(row, 3).value = { formula: `=IF(B${row}="PASS","${passText}","${failText}")` };
    };

    let cr = 1;
    checks.getCell(`A${cr}`).value = 'MODEL INTEGRITY CHECKS';
    checks.getCell(`A${cr}`).font = { bold: true, size: 14 };
    cr += 2;

    addCheck(cr++, 'WACC > Terminal Growth?', `=IF(WACC>g_terminal,"PASS","FAIL")`, '✓ WACC > g', '✗ WACC ≤ g — DCF explodes');
    addCheck(cr++, 'Tax Rate in [0%, 60%]?', `=IF(AND(tax_rate>=0,tax_rate<=0.6),"PASS","FAIL")`, '✓ Tax rate reasonable', '✗ Tax rate out of bounds');
    addCheck(cr++, 'Horizon ≥ 3 years?', `=IF(horizon>=3,"PASS","FAIL")`, '✓ Horizon adequate', '✗ Horizon too short');
    addCheck(cr++, 'Revenue Growth < 100%?', `=IF(rev_growth_1<1,"PASS","FAIL")`, '✓ Growth realistic', '✗ Growth > 100% — verify');
    addCheck(cr++, 'Shares Outstanding > 0?', `=IF(shares>0,"PASS","FAIL")`, '✓ Shares valid', '✗ Shares = 0');
    addCheck(cr++, 'Net Debt defined?', `=IF(ISNUMBER(net_debt),"PASS","FAIL")`, '✓ Net debt set', '✗ Net debt missing');

    // Apply conditional formatting to check column
    for (let i = 3; i < cr; i++) {
        const cell = checks.getCell(i, 2);
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: cell.value?.formula?.includes('PASS') ? 'FFD1FAE5' : 'FFFEE2E2' }
        };
    }

    return wb;
}

router.post('/xlsx', async (req, res) => {
    try {
        const { model_snapshot } = req.body;
        if (!model_snapshot) {
            return res.status(400).json({ success: false, error: 'model_snapshot required' });
        }

        const wb = await buildWorkbook(model_snapshot);
        const companyName = model_snapshot.company?.name || 'Model';
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `${companyName.replace(/\s+/g, '_')}_DCF_${dateStr}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await wb.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel export error:', error);
        res.status(500).json({ success: false, error: 'Export failed: ' + error.message });
    }
});

module.exports = router;
