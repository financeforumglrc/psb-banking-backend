/**
 * SETU Account Aggregator (AA) Sandbox Adapter
 *
 * Bridges the internal PSB SecureWealth Twin consent flow with SETU's public
 * FIU UAT sandbox. The public sandbox uses the shared "test-client" credentials
 * from the official Postman collection, so the integration works without
 * completing Setu Bridge KYC.
 *
 * If you later obtain organisation-specific FIU credentials, set
 * SETU_AA_FORCE_OWN_CREDENTIALS=true and provide SETU_AA_CLIENT_ID,
 * SETU_AA_CLIENT_SECRET and SETU_AA_PRODUCT_INSTANCE_ID.
 *
 * Official collection: https://documenter.getpostman.com/view/15462260/UVCBBQLW
 * Setu AA docs: https://docs.setu.co/data/account-aggregator
 */

const axios = require('axios');

const FORCE_OWN = process.env.SETU_AA_FORCE_OWN_CREDENTIALS === 'true';

// Public UAT sandbox credentials from Setu's official Postman collection.
const PUBLIC_BASE_URL = 'https://fiu-uat.setu.co';
const PUBLIC_CLIENT_ID = 'test-client';
const PUBLIC_CLIENT_SECRET = '3fa14d45-3adc-4522-b512-1e3f24d92568';

const BASE_URL = FORCE_OWN
    ? (process.env.SETU_AA_BASE_URL || 'https://fiu-sandbox.setu.co')
    : PUBLIC_BASE_URL;
const CLIENT_ID = FORCE_OWN ? process.env.SETU_AA_CLIENT_ID : PUBLIC_CLIENT_ID;
const CLIENT_SECRET = FORCE_OWN ? process.env.SETU_AA_CLIENT_SECRET : PUBLIC_CLIENT_SECRET;
const PRODUCT_INSTANCE_ID = process.env.SETU_AA_PRODUCT_INSTANCE_ID;
const PSB_FIP_ID = process.env.SETU_PSB_FIP_ID || 'PSB-FIP-001';
const DATA_CONSUMER_ID = process.env.SETU_AA_DATA_CONSUMER_ID || 'setu-fiu-id';
const TEST_PHONE = process.env.SETU_AA_TEST_PHONE || '9999999999';

function isConfigured() {
    // The public sandbox is always configured. Own-credentials mode needs all three.
    if (FORCE_OWN) {
        return !!(CLIENT_ID && CLIENT_SECRET && PRODUCT_INSTANCE_ID);
    }
    return true;
}

function normalizeVua(vua) {
    if (!vua) return `${TEST_PHONE}@onemoney`;
    if (/^\d{10}@/.test(vua)) return vua;
    const digits = vua.replace(/\D/g, '');
    if (digits.length >= 10) {
        return `${digits.slice(-10)}@onemoney`;
    }
    return `${TEST_PHONE}@onemoney`;
}

function addDuration(date, value, unit) {
    const d = new Date(date);
    const v = parseInt(value, 10);
    switch (String(unit).toUpperCase()) {
        case 'DAY': d.setDate(d.getDate() + v); break;
        case 'MONTH': d.setMonth(d.getMonth() + v); break;
        case 'YEAR': d.setFullYear(d.getFullYear() + v); break;
        default: d.setMonth(d.getMonth() + v);
    }
    return d.toISOString();
}

// Safe startup log: only booleans, never the actual credentials.
console.log('[SETU AA] adapter loaded — mode:', FORCE_OWN ? 'own-credentials' : 'public-uat',
    '| configured:', isConfigured(),
    '| baseUrl:', BASE_URL);

function headers() {
    const h = {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        'x-client-secret': CLIENT_SECRET
    };
    if (PRODUCT_INSTANCE_ID) {
        h['x-product-instance-id'] = PRODUCT_INSTANCE_ID;
    }
    return h;
}

async function request(method, path, body) {
    if (FORCE_OWN && !isConfigured()) {
        throw new Error('SETU AA own-credentials mode is missing credentials');
    }
    const url = `${BASE_URL.replace(/\/$/, '')}${path}`;
    try {
        const res = await axios({ method, url, headers: headers(), data: body });
        return res.data;
    } catch (err) {
        const detail = err.response?.data || { message: err.message };
        const error = new Error(`SETU AA API error: ${err.message}`);
        error.status = err.response?.status || 500;
        error.setuDetail = detail;
        throw error;
    }
}

/**
 * Create a consent request on SETU AA public UAT sandbox.
 *
 * @param {Object} opts
 * @param {string} opts.vua              Virtual user address, e.g. 9999999999@onemoney
 * @param {string} opts.redirectUrl      Where the user returns after AA approval
 * @param {string[]} [opts.fiTypes]      Default ['DEPOSIT']
 * @param {string[]} [opts.consentTypes] Default ['TRANSACTIONS', 'PROFILE', 'SUMMARY']
 * @param {string} [opts.purposeCode]    ReBIT purpose code, default '101'
 * @param {string} [opts.purposeText]    Default 'Wealth intelligence and financial protection'
 * @param {Date} [opts.dataRangeFrom]
 * @param {Date} [opts.dataRangeTo]
 */
async function createConsent(opts) {
    const now = new Date();
    const consentStart = now.toISOString();
    const consentExpiry = addDuration(now, 3, 'MONTH');
    const dataRangeFrom = opts.dataRangeFrom || new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const dataRangeTo = opts.dataRangeTo || now;

    const consentTypes = (opts.consentTypes || ['TRANSACTIONS', 'PROFILE', 'SUMMARY']).map(s => String(s).toUpperCase());
    const fiTypes = opts.fiTypes || ['DEPOSIT'];
    const purposeText = opts.purposeText || 'Wealth intelligence and financial protection';
    const purposeCode = opts.purposeCode || '101';

    // Legacy FIU UAT body shape from the public Postman collection.
    const body = {
        Detail: {
            consentStart,
            consentExpiry,
            Customer: {
                id: normalizeVua(opts.vua)
            },
            FIDataRange: {
                from: dataRangeFrom.toISOString(),
                to: dataRangeTo.toISOString()
            },
            consentMode: 'STORE',
            consentTypes,
            fetchType: 'PERIODIC',
            Frequency: {
                value: 30,
                unit: 'MONTH'
            },
            DataFilter: [],
            DataLife: {
                value: 1,
                unit: 'MONTH'
            },
            DataConsumer: {
                id: DATA_CONSUMER_ID
            },
            Purpose: {
                Category: {
                    type: 'string'
                },
                code: purposeCode,
                text: purposeText,
                refUri: `https://api.rebit.org.in/aa/purpose/${purposeCode}.xml`
            },
            fiTypes
        },
        context: [
            { key: 'fipId', value: PSB_FIP_ID }
        ]
    };

    if (opts.redirectUrl) {
        body.redirectUrl = opts.redirectUrl;
    }

    return request('POST', '/consents', body);
}

function getConsentStatus(requestId) {
    return request('GET', `/consents/${requestId}`);
}

function revokeConsent(requestId) {
    return request('POST', `/consents/${requestId}/revoke`, {});
}

/**
 * Create a data session for an approved consent.
 * The public UAT API returns the session id immediately; data can then be
 * fetched with fetchSessionData once Setu has processed it.
 */
function createDataSession(consentId, dataRange) {
    const body = {
        consentId,
        DataRange: {
            from: dataRange?.from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            to: dataRange?.to || new Date().toISOString()
        },
        format: 'json'
    };
    return request('POST', '/sessions', body);
}

function fetchSessionData(sessionId) {
    return request('GET', `/sessions/${sessionId}`);
}

function getFips() {
    return request('GET', '/fips');
}

module.exports = {
    isConfigured,
    BASE_URL,
    PSB_FIP_ID,
    createConsent,
    getConsentStatus,
    revokeConsent,
    createDataSession,
    fetchSessionData,
    getFips
};
