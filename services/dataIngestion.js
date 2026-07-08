/**
 * Real-world financial data ingestion service.
 *
 * Fetches and persists data from public sources:
 *   - RBI macro indicators (repo rate, inflation, etc.)
 *   - Yahoo Finance / NSE / BSE market prices
 *   - USD/INR and other forex rates
 *   - Kaggle-style reference datasets (stored as static samples / metadata)
 *
 * All fetched data is stored in SQLite with source attribution so it can be
 * linked to user assets, transactions, goals, and fraud cases.
 */

const https = require('https');
const { marketDb } = require('./database');

const DEFAULT_TIMEOUT_MS = 15000;

// Reference instruments that the synthetic personas can link to.
const REFERENCE_INSTRUMENTS = [
    { symbol: '^NSEI', name: 'NIFTY 50', type: 'index', exchange: 'NSE', currency: 'INR', sector: 'Broad Market' },
    { symbol: '^BSESN', name: 'S&P BSE SENSEX', type: 'index', exchange: 'BSE', currency: 'INR', sector: 'Broad Market' },
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Conglomerate' },
    { symbol: 'TCS.NS', name: 'Tata Consultancy Services Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'IT Services' },
    { symbol: 'INFY.NS', name: 'Infosys Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'IT Services' },
    { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Banking' },
    { symbol: 'ICICIBANK.NS', name: 'ICICI Bank Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Banking' },
    { symbol: 'SBIN.NS', name: 'State Bank of India', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Banking' },
    { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'FMCG' },
    { symbol: 'ITC.NS', name: 'ITC Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'FMCG' },
    { symbol: 'LT.NS', name: 'Larsen & Toubro Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Infrastructure' },
    { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Telecom' },
    { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Banking' },
    { symbol: 'AXISBANK.NS', name: 'Axis Bank Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Banking' },
    { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'NBFC' },
    { symbol: 'MARUTI.NS', name: 'Maruti Suzuki India Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Automobile' },
    { symbol: 'TATAMOTORS.NS', name: 'Tata Motors Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Automobile' },
    { symbol: 'SUNPHARMA.NS', name: 'Sun Pharmaceutical Industries Ltd.', type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Pharma' },
    { symbol: 'DRREDDY.NS', name: "Dr. Reddy's Laboratories Ltd.", type: 'stock', exchange: 'NSE', currency: 'INR', sector: 'Pharma' },
    { symbol: 'GC=F', name: 'Gold Futures', type: 'commodity', exchange: 'COMEX', currency: 'USD', sector: 'Precious Metals' },
    { symbol: 'SI=F', name: 'Silver Futures', type: 'commodity', exchange: 'COMEX', currency: 'USD', sector: 'Precious Metals' },
    { symbol: 'CL=F', name: 'Crude Oil Futures', type: 'commodity', exchange: 'NYMEX', currency: 'USD', sector: 'Energy' },
    { symbol: 'INR=X', name: 'USD/INR', type: 'currency', exchange: 'FOREX', currency: 'INR', sector: 'Forex' },
];

// Fallback RBI macro data (last updated 2026-07). Used when live scraping fails.
const RBI_MACRO_FALLBACK = [
    { dataDate: '2026-07-01', indicator: 'repo_rate', value: 6.50, unit: '%', source: 'RBI (fallback)', notes: 'Policy repo rate' },
    { dataDate: '2026-07-01', indicator: 'reverse_repo_rate', value: 3.35, unit: '%', source: 'RBI (fallback)', notes: 'Standing Deposit Facility rate' },
    { dataDate: '2026-07-01', indicator: 'bank_rate', value: 6.75, unit: '%', source: 'RBI (fallback)', notes: 'Bank rate' },
    { dataDate: '2026-07-01', indicator: 'msf_rate', value: 6.75, unit: '%', source: 'RBI (fallback)', notes: 'Marginal Standing Facility rate' },
    { dataDate: '2026-06-01', indicator: 'cpi_inflation', value: 4.75, unit: '%', source: 'RBI/CSO (fallback)', notes: 'Consumer Price Index inflation y/y' },
    { dataDate: '2026-06-01', indicator: 'wpi_inflation', value: 2.45, unit: '%', source: 'RBI/Commerce Ministry (fallback)', notes: 'Wholesale Price Index inflation y/y' },
    { dataDate: '2026-06-01', indicator: 'forex_reserves', value: 675.50, unit: 'USD bn', source: 'RBI (fallback)', notes: 'Foreign exchange reserves' },
];

function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: options.timeout || DEFAULT_TIMEOUT_MS }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

function fetchText(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: options.timeout || DEFAULT_TIMEOUT_MS }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

/**
 * Seed reference instruments into market_instruments table.
 */
async function seedReferenceInstruments() {
    let count = 0;
    for (const inst of REFERENCE_INSTRUMENTS) {
        const existing = marketDb.findInstrumentBySymbol(inst.symbol);
        if (!existing) {
            marketDb.createInstrument({ ...inst, source: 'Reference', metadataJson: { reference: true } });
            count++;
        }
    }
    return { seeded: count, total: REFERENCE_INSTRUMENTS.length };
}

/**
 * Fetch latest RBI policy rates from RBI website. Falls back to static data.
 */
async function ingestRBIMacroData() {
    const results = [];
    try {
        // RBI maintains a JSON endpoint for policy rates in some deployments.
        // We attempt the publicly accessible rates page and parse the latest value.
        const url = 'https://www.rbi.org.in/Scripts/bs_viewcontent.aspx?Id=2669';
        const res = await fetchText(url, { timeout: 10000 });
        if (res.status === 200 && res.body) {
            // Very conservative parsing: look for "Policy Repo Rate" and a percentage nearby.
            const repoMatch = res.body.match(/Policy Repo Rate[\s\S]{0,500}?([0-9]+\.[0-9]+)\s*%/i);
            if (repoMatch) {
                const today = new Date().toISOString().split('T')[0];
                marketDb.createRBIMacro({
                    dataDate: today,
                    indicator: 'repo_rate',
                    value: parseFloat(repoMatch[1]),
                    unit: '%',
                    source: 'RBI',
                    sourceUrl: url,
                    notes: 'Scraped from RBI policy rates page'
                });
                results.push({ indicator: 'repo_rate', value: parseFloat(repoMatch[1]), source: 'RBI' });
            }
        }
    } catch (e) {
        console.warn('[dataIngestion] RBI scrape failed, using fallback:', e.message);
    }

    // World Bank: India CPI inflation (FP.CPI.TOTL.ZG)
    try {
        const wbUrl = 'https://api.worldbank.org/v2/country/IND/indicator/FP.CPI.TOTL.ZG?format=json&per_page=5&date=2020:2026';
        const res = await fetchJson(wbUrl, { timeout: 10000 });
        if (res.body && Array.isArray(res.body[1])) {
            for (const row of res.body[1]) {
                if (row.value !== null && row.date) {
                    marketDb.createRBIMacro({
                        dataDate: `${row.date}-12-31`,
                        indicator: 'cpi_inflation',
                        value: parseFloat(row.value),
                        unit: '%',
                        source: 'World Bank',
                        sourceUrl: wbUrl,
                        notes: `India CPI inflation ${row.date}`
                    });
                    results.push({ indicator: 'cpi_inflation', value: row.value, source: 'World Bank', year: row.date });
                }
            }
        }
    } catch (e) {
        console.warn('[dataIngestion] World Bank CPI fetch failed:', e.message);
    }

    // World Bank: India GDP growth (NY.GDP.MKTP.KD.ZG)
    try {
        const wbUrl = 'https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=5&date=2020:2026';
        const res = await fetchJson(wbUrl, { timeout: 10000 });
        if (res.body && Array.isArray(res.body[1])) {
            for (const row of res.body[1]) {
                if (row.value !== null && row.date) {
                    marketDb.createRBIMacro({
                        dataDate: `${row.date}-12-31`,
                        indicator: 'gdp_growth',
                        value: parseFloat(row.value),
                        unit: '%',
                        source: 'World Bank',
                        sourceUrl: wbUrl,
                        notes: `India GDP growth ${row.date}`
                    });
                    results.push({ indicator: 'gdp_growth', value: row.value, source: 'World Bank', year: row.date });
                }
            }
        }
    } catch (e) {
        console.warn('[dataIngestion] World Bank GDP fetch failed:', e.message);
    }

    // If live fetch produced nothing, insert fallback rows.
    if (results.length === 0) {
        for (const row of RBI_MACRO_FALLBACK) {
            marketDb.createRBIMacro(row);
        }
        results.push(...RBI_MACRO_FALLBACK.map(r => ({ indicator: r.indicator, value: r.value, source: r.source })));
    }

    return { source: 'RBI/World Bank', indicators: results };
}

/**
 * Fetch latest quotes from Yahoo Finance v7 and store as a single-day price snapshot.
 */
async function ingestYahooQuotes(symbols = REFERENCE_INSTRUMENTS.map(i => i.symbol)) {
    const fields = 'regularMarketPrice,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose';
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=${fields}`;
    const results = [];
    try {
        const res = await fetchJson(url, { timeout: 15000 });
        const quotes = res.body?.quoteResponse?.result || [];
        const today = new Date().toISOString().split('T')[0];
        for (const q of quotes) {
            const symbol = q.symbol;
            const instrument = marketDb.findInstrumentBySymbol(symbol);
            if (!instrument) continue;
            const priceData = {
                instrumentId: instrument.id,
                priceDate: today,
                open: q.regularMarketOpen || q.regularMarketPreviousClose,
                high: q.regularMarketDayHigh || q.regularMarketPrice,
                low: q.regularMarketDayLow || q.regularMarketPrice,
                close: q.regularMarketPrice,
                volume: q.regularMarketVolume,
                adjustedClose: q.regularMarketPrice,
                source: 'Yahoo Finance'
            };
            marketDb.createPrice(priceData);
            results.push({ symbol, close: q.regularMarketPrice, source: 'Yahoo Finance' });
        }
    } catch (e) {
        console.warn('[dataIngestion] Yahoo Finance quote fetch failed:', e.message);
    }
    return { source: 'Yahoo Finance', prices: results };
}

/**
 * Fetch USD/INR and EUR/INR forex rates from Yahoo Finance.
 */
async function ingestForexRates() {
    const pairs = [
        { base: 'USD', quote: 'INR', symbol: 'INR=X' },
        { base: 'EUR', quote: 'INR', symbol: 'EURINR=X' },
        { base: 'GBP', quote: 'INR', symbol: 'GBPINR=X' },
        { base: 'JPY', quote: 'INR', symbol: 'JPYINR=X' },
    ];
    const results = [];
    const today = new Date().toISOString().split('T')[0];
    try {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${pairs.map(p => p.symbol).join(',')}&fields=regularMarketPrice`;
        const res = await fetchJson(url, { timeout: 10000 });
        const quotes = res.body?.quoteResponse?.result || [];
        for (const q of quotes) {
            const pair = pairs.find(p => p.symbol === q.symbol);
            if (!pair) continue;
            marketDb.createForexRate({
                rateDate: today,
                baseCurrency: pair.base,
                quoteCurrency: pair.quote,
                rate: q.regularMarketPrice,
                source: 'Yahoo Finance'
            });
            results.push({ pair: `${pair.base}/${pair.quote}`, rate: q.regularMarketPrice });
        }
    } catch (e) {
        console.warn('[dataIngestion] Forex fetch failed:', e.message);
    }
    return { source: 'Yahoo Finance', rates: results };
}

/**
 * Persist metadata about external datasets (Kaggle-style). We cannot download
 * Kaggle without credentials, so we record known public datasets and store a
 * representative sample of fraud patterns that can be expanded later.
 */
async function ingestExternalDatasetMetadata() {
    const datasets = [
        {
            datasetKey: 'kaggle_credit_card_fraud',
            sourceName: 'Kaggle - Credit Card Fraud Detection',
            sourceUrl: 'https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud',
            description: 'Anonymized credit card transactions labeled as fraudulent or genuine. 284,807 transactions, 492 frauds.',
            recordCount: 284807,
            schemaJson: { columns: ['Time', 'V1-V28', 'Amount', 'Class'], classDistribution: { genuine: 284315, fraud: 492 } },
            sampleJson: { time: 406, amount: 2.05, class: 1 }
        },
        {
            datasetKey: 'kaggle_indian_personal_finance',
            sourceName: 'Kaggle - Indian Personal Finance & Spending Habits',
            sourceUrl: 'https://www.kaggle.com/datasets/akashsharma0105/indian-personal-finance-and-spending-habits',
            description: 'Indian household income, expenses, savings, and investment patterns by city/age/gender.',
            recordCount: 20000,
            schemaJson: { columns: ['Age', 'Gender', 'City', 'Income', 'Expenses', 'Savings', 'Investments'] },
            sampleJson: { age: 32, city: 'Mumbai', income: 850000, expenses: 420000, savings: 150000 }
        },
        {
            datasetKey: 'kaggle_paysim_fraud',
            sourceName: 'Kaggle - PaySim Synthetic Financial Dataset',
            sourceUrl: 'https://www.kaggle.com/datasets/ealaxi/paysim1',
            description: 'Synthetic mobile-money transactions with fraud labels based on real-world data.',
            recordCount: 6362620,
            schemaJson: { columns: ['step', 'type', 'amount', 'nameOrig', 'oldbalanceOrg', 'newbalanceOrig', 'nameDest', 'oldbalanceDest', 'newbalanceDest', 'isFraud', 'isFlaggedFraud'] },
            sampleJson: { type: 'TRANSFER', amount: 181.0, isFraud: 1 }
        },
        {
            datasetKey: 'rbi_policy_rates',
            sourceName: 'Reserve Bank of India - Policy Rates',
            sourceUrl: 'https://www.rbi.org.in/Scripts/bs_viewcontent.aspx?Id=2669',
            description: 'Historical RBI repo, reverse repo, bank rate and MSF rate.',
            recordCount: null,
            schemaJson: { columns: ['Date', 'Repo Rate', 'Reverse Repo Rate', 'Bank Rate', 'MSF Rate'] },
            sampleJson: { date: '2026-07-01', repoRate: 6.50 }
        },
        {
            datasetKey: 'nse_bhavcopy',
            sourceName: 'NSE India - Daily Bhavcopy',
            sourceUrl: 'https://www.nseindia.com/all-reports',
            description: 'End-of-day prices and volumes for all NSE listed securities.',
            recordCount: null,
            schemaJson: { columns: ['SYMBOL', 'SERIES', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'LAST', 'PREVCLOSE', 'TOTTRDQTY', 'TOTTRDVAL', 'TIMESTAMP'] },
            sampleJson: { symbol: 'RELIANCE', close: 3024.5, volume: 4523100 }
        }
    ];

    for (const ds of datasets) {
        marketDb.createExternalDataset({ ...ds, lastFetched: new Date().toISOString() });
    }
    return { source: 'Kaggle/RBI/NSE metadata', datasets: datasets.map(d => d.datasetKey) };
}

/**
 * Link a synthetic user_asset row to a real market instrument.
 */
function linkAssetToInstrument(userAssetId, symbol, metadata = {}) {
    const instrument = marketDb.findInstrumentBySymbol(symbol);
    if (!instrument) return null;
    const latestPrice = marketDb.getLatestPrice(instrument.id);
    return marketDb.createUserAssetLink({
        userAssetId,
        instrumentId: instrument.id,
        units: metadata.units || null,
        avgCost: metadata.avgCost || null,
        currentPrice: latestPrice ? latestPrice.close_price : null,
        lastSynced: new Date().toISOString(),
        metadataJson: metadata
    });
}

/**
 * Main orchestrator: seed instruments, ingest macro/market/forex data, record datasets.
 */
async function ingestAllRealData() {
    const summary = {};
    summary.instruments = await seedReferenceInstruments();
    summary.rbi = await ingestRBIMacroData();
    summary.market = await ingestYahooQuotes();
    summary.forex = await ingestForexRates();
    summary.datasets = await ingestExternalDatasetMetadata();
    return summary;
}

module.exports = {
    REFERENCE_INSTRUMENTS,
    RBI_MACRO_FALLBACK,
    seedReferenceInstruments,
    ingestRBIMacroData,
    ingestYahooQuotes,
    ingestForexRates,
    ingestExternalDatasetMetadata,
    linkAssetToInstrument,
    ingestAllRealData
};
