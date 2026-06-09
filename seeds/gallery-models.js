/**
 * Seed script for public gallery models
 * Data sourced from Screener.in consolidated financials (FY24 = year ending March 2024)
 * Run: node seeds/gallery-models.js
 */

const { modelDb } = require('../services/database');

/* ─── Reliance Industries Ltd ───
   Source: https://www.screener.in/company/RELIANCE/consolidated/
   FY24: Revenue ₹8,99,041 Cr | EBITDA ₹2,13,330 Cr | PAT ₹79,020 Cr
*/
const relianceModel = {
    schema_version: '0.2.0',
    id: 'reliance-industries',
    company: {
        name: 'Reliance Industries Ltd',
        ticker: 'RELIANCE',
        exchange: 'NSE',
        sector: 'Conglomerate',
        fiscal_year_end: 'March 31'
    },
    settings: {
        currency: 'INR',
        accounting_standard: 'IND_AS',
        tax_rate: { value: 25.17, unit: 'PCT', provenance: { type: 'default', reason: 'Sec 115BAA' } },
        tutor_mode: false
    },
    statements: {
        income_statement: {
            FY24: [
                { id: 'is.revenue.fy24', label: 'Revenue from operations', value: 899041, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in consolidated' }, last_updated: '2024-03-31' },
                { id: 'is.ebitda.fy24', label: 'EBITDA', value: 213330, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation', source: 'Screener.in' }, last_updated: '2024-03-31' },
                { id: 'is.depreciation.fy24', label: 'Depreciation & Amortisation', value: 50832, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2024-03-31' },
                { id: 'is.ebit.fy24', label: 'Operating Profit (EBIT)', value: 162498, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2024-03-31' },
                { id: 'is.pat.fy24', label: 'Profit After Tax', value: 79020, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2024-03-31' }
            ],
            FY23: [
                { id: 'is.revenue.fy23', label: 'Revenue from operations', value: 876396, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2023-03-31' },
                { id: 'is.ebitda.fy23', label: 'EBITDA', value: 182621, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation' }, last_updated: '2023-03-31' },
                { id: 'is.depreciation.fy23', label: 'Depreciation & Amortisation', value: 40303, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2023-03-31' },
                { id: 'is.ebit.fy23', label: 'Operating Profit (EBIT)', value: 142318, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2023-03-31' },
                { id: 'is.pat.fy23', label: 'Profit After Tax', value: 74088, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2023-03-31' }
            ],
            FY22: [
                { id: 'is.revenue.fy22', label: 'Revenue from operations', value: 694673, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2022-03-31' },
                { id: 'is.ebitda.fy22', label: 'EBITDA', value: 138363, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation' }, last_updated: '2022-03-31' },
                { id: 'is.depreciation.fy22', label: 'Depreciation & Amortisation', value: 29782, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2022-03-31' },
                { id: 'is.ebit.fy22', label: 'Operating Profit (EBIT)', value: 108581, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2022-03-31' },
                { id: 'is.pat.fy22', label: 'Profit After Tax', value: 67845, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' }, last_updated: '2022-03-31' }
            ]
        },
        balance_sheet: {
            FY24: {
                total_assets: 1755048,
                total_equity: 793481,
                total_debt: 350719,
                cash_and_investments: 225672,
                shares_outstanding: 676.6,
                face_value: 10,
            }
        },
        cash_flow: {}
    },
    estimates: {
        revenue_growth: 0.06,
        capex_pct: 0.10,
        working_capital_pct: -0.03,  // negative WC (source of cash for Reliance)
    },
    dcf: {
        horizon_years: 5,
        fcff_or_fcfe: 'FCFF',
        terminal_method: 'gordon',
        terminal_growth: { value: 3.5, unit: 'PCT', provenance: { type: 'default' } },
        wacc: { value: 10.5, unit: 'PCT', provenance: { type: 'default' } },
        forecast: {},
        outputs: {}  // computed at runtime by dcf-engine.js
    },
    metadata: {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
        data_source: 'Screener.in consolidated financials'
    }
};

/* ─── Tata Consultancy Services ───
   Source: https://www.screener.in/company/TCS/consolidated/
   FY24: Revenue ₹2,40,893 Cr | EBITDA ₹69,281 Cr | PAT ₹46,099 Cr
*/
const tcsModel = {
    schema_version: '0.2.0',
    id: 'tcs',
    company: { name: 'Tata Consultancy Services', ticker: 'TCS', exchange: 'NSE', sector: 'IT Services', fiscal_year_end: 'March 31' },
    settings: { currency: 'INR', accounting_standard: 'IND_AS', tax_rate: { value: 25.17, unit: 'PCT', provenance: { type: 'default' } }, tutor_mode: false },
    statements: {
        income_statement: {
            FY24: [
                { id: 'is.revenue.fy24', label: 'Revenue', value: 240893, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebitda.fy24', label: 'EBITDA', value: 69281, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation', source: 'Screener.in' } },
                { id: 'is.depreciation.fy24', label: 'Depreciation & Amortisation', value: 4985, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebit.fy24', label: 'Operating Profit (EBIT)', value: 64296, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.pat.fy24', label: 'PAT', value: 46099, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } }
            ],
            FY23: [
                { id: 'is.revenue.fy23', label: 'Revenue', value: 225458, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebitda.fy23', label: 'EBITDA', value: 64281, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation' } },
                { id: 'is.depreciation.fy23', label: 'Depreciation & Amortisation', value: 5022, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebit.fy23', label: 'Operating Profit (EBIT)', value: 59259, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.pat.fy23', label: 'PAT', value: 42303, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } }
            ],
            FY22: [
                { id: 'is.revenue.fy22', label: 'Revenue', value: 191754, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebitda.fy22', label: 'EBITDA', value: 57661, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation' } },
                { id: 'is.depreciation.fy22', label: 'Depreciation & Amortisation', value: 4604, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebit.fy22', label: 'Operating Profit (EBIT)', value: 53057, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.pat.fy22', label: 'PAT', value: 38449, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } }
            ]
        },
        balance_sheet: {
            FY24: {
                total_assets: 145472,
                total_equity: 90489,
                total_debt: 8021,
                cash_and_investments: 31762,
                shares_outstanding: 362,
                face_value: 1,
            }
        },
        cash_flow: {}
    },
    estimates: {
        revenue_growth: 0.07,
        capex_pct: 0.03,
        working_capital_pct: 0.03,
    },
    dcf: {
        horizon_years: 5,
        fcff_or_fcfe: 'FCFF',
        terminal_method: 'gordon',
        terminal_growth: { value: 3.5, unit: 'PCT' },
        wacc: { value: 9.8, unit: 'PCT' },
        outputs: {}
    },
    metadata: { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1, data_source: 'Screener.in consolidated financials' }
};

/* ─── Infosys Ltd ───
   Source: https://www.screener.in/company/INFY/consolidated/
   FY24: Revenue ₹1,53,670 Cr | EBITDA ₹41,103 Cr | PAT ₹26,248 Cr
*/
const infosysModel = {
    schema_version: '0.2.0',
    id: 'infosys',
    company: { name: 'Infosys Ltd', ticker: 'INFY', exchange: 'NSE', sector: 'IT Services', fiscal_year_end: 'March 31' },
    settings: { currency: 'INR', accounting_standard: 'IND_AS', tax_rate: { value: 25.17, unit: 'PCT', provenance: { type: 'default' } }, tutor_mode: false },
    statements: {
        income_statement: {
            FY24: [
                { id: 'is.revenue.fy24', label: 'Revenue', value: 153670, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebitda.fy24', label: 'EBITDA', value: 41103, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation', source: 'Screener.in' } },
                { id: 'is.depreciation.fy24', label: 'Depreciation & Amortisation', value: 4678, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebit.fy24', label: 'Operating Profit (EBIT)', value: 36425, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.pat.fy24', label: 'PAT', value: 26248, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } }
            ],
            FY23: [
                { id: 'is.revenue.fy23', label: 'Revenue', value: 146767, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebitda.fy23', label: 'EBITDA', value: 39355, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation' } },
                { id: 'is.depreciation.fy23', label: 'Depreciation & Amortisation', value: 4225, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebit.fy23', label: 'Operating Profit (EBIT)', value: 35130, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.pat.fy23', label: 'PAT', value: 24108, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } }
            ],
            FY22: [
                { id: 'is.revenue.fy22', label: 'Revenue', value: 121641, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebitda.fy22', label: 'EBITDA', value: 34967, unit: 'INR_CR', provenance: { type: 'formula', expression: 'ebit + depreciation' } },
                { id: 'is.depreciation.fy22', label: 'Depreciation & Amortisation', value: 3476, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.ebit.fy22', label: 'Operating Profit (EBIT)', value: 31491, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } },
                { id: 'is.pat.fy22', label: 'PAT', value: 22146, unit: 'INR_CR', provenance: { type: 'manual', source: 'Screener.in' } }
            ]
        },
        balance_sheet: {
            FY24: {
                total_assets: 137360,
                total_equity: 88116,
                total_debt: 8359,
                cash_and_investments: 24623,
                shares_outstanding: 414.2,
                face_value: 5,
            }
        },
        cash_flow: {}
    },
    estimates: {
        revenue_growth: 0.07,
        capex_pct: 0.04,
        working_capital_pct: 0.04,
    },
    dcf: {
        horizon_years: 5,
        fcff_or_fcfe: 'FCFF',
        terminal_method: 'gordon',
        terminal_growth: { value: 3.5, unit: 'PCT' },
        wacc: { value: 10.2, unit: 'PCT' },
        outputs: {}
    },
    metadata: { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1, data_source: 'Screener.in consolidated financials' }
};

function seed() {
    const models = [
        { slug: 'reliance-industries', companyName: 'Reliance Industries Ltd', ticker: 'RELIANCE', exchange: 'NSE', isPublic: 1, modelJson: JSON.stringify(relianceModel) },
        { slug: 'tcs', companyName: 'Tata Consultancy Services', ticker: 'TCS', exchange: 'NSE', isPublic: 1, modelJson: JSON.stringify(tcsModel) },
        { slug: 'infosys', companyName: 'Infosys Ltd', ticker: 'INFY', exchange: 'NSE', isPublic: 1, modelJson: JSON.stringify(infosysModel) },
    ];

    models.forEach((m) => {
        try {
            const existing = modelDb.findBySlug(m.slug);
            if (existing) {
                modelDb.update(existing.id, m.modelJson);
                console.log('Updated:', m.slug);
            } else {
                modelDb.create(m);
                console.log('Seeded:', m.slug);
            }
        } catch (e) {
            if (e.message.includes('UNIQUE constraint failed')) {
                console.log('Already exists:', m.slug);
            } else {
                console.error('Failed to seed', m.slug, e.message);
            }
        }
    });
    console.log('Gallery seed complete');
}

seed();
