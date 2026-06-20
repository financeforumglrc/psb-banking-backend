/**
 * SETU Account Aggregator (AA) Sandbox Adapter
 *
 * Bridges the internal PSB SecureWealth Twin consent flow with SETU's FIU APIs.
 * When SETU credentials are present in env, real sandbox calls are made.
 * When credentials are missing, the adapter returns a clear error so the
 * caller can fall back to the deterministic PSB mock flow.
 *
 * SETU AA sandbox docs: https://docs.setu.co/data/account-aggregator
 * Postman collection: https://documenter.getpostman.com/view/16080598/TzzBoun5
 */

const axios = require('axios');

const BASE_URL = process.env.SETU_AA_BASE_URL || 'https://fiu-sandbox.setu.co';
const CLIENT_ID = process.env.SETU_AA_CLIENT_ID;
const CLIENT_SECRET = process.env.SETU_AA_CLIENT_SECRET;
const PRODUCT_INSTANCE_ID = process.env.SETU_AA_PRODUCT_INSTANCE_ID;
const PSB_FIP_ID = process.env.SETU_PSB_FIP_ID || 'PSB-FIP-001';

function isConfigured() {
    return !!(CLIENT_ID && CLIENT_SECRET && PRODUCT_INSTANCE_ID);
}

function headers() {
    return {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        'x-client-secret': CLIENT_SECRET,
        'x-product-instance-id': PRODUCT_INSTANCE_ID
    };
}

async function request(method, path, body) {
    if (!isConfigured()) {
        throw new Error('SETU AA credentials are not configured');
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
 * Create a consent request on SETU AA.
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
    const dataRangeFrom = opts.dataRangeFrom || new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const dataRangeTo = opts.dataRangeTo || now;

    // Minimal v2 consent body. Consent template details (purpose, fiTypes,
    // frequency, dataLife, redirectUrl, etc.) are picked from the product
    // configuration on Setu Bridge, so we do not override them here.
    const body = {
        consentDuration: { unit: 'MONTH', value: '3' },
        vua: opts.vua,
        dataRange: {
            from: dataRangeFrom.toISOString(),
            to: dataRangeTo.toISOString()
        },
        context: [
            { key: 'fipId', value: PSB_FIP_ID }
        ],
        additionalParams: {
            tags: ['PSB_SecureWealth', 'wealth_intelligence']
        }
    };

    return request('POST', '/v2/consents', body);
}

function getConsentStatus(requestId) {
    return request('GET', `/v2/consents/${requestId}`);
}

function revokeConsent(requestId) {
    return request('POST', `/v2/consents/${requestId}/revoke`, {});
}

function getDataSessions(consentRequestId) {
    return request('GET', `/v2/consents/${consentRequestId}/data-sessions`);
}

function getFetchStatus(consentRequestId) {
    return request('GET', `/v2/consents/${consentRequestId}/fetch/status`);
}

/**
 * Fetch FI data for a session.
 * In production this returns encrypted FI data that must be decrypted via
 * Sahamati Rahasya (or Setu's managed decrypt endpoint). Here we return the
 * raw response so the caller can store it and optionally decrypt it.
 */
function fetchSessionData(sessionId) {
    return request('GET', `/v2/sessions/${sessionId}/fetch`);
}

module.exports = {
    isConfigured,
    BASE_URL,
    PSB_FIP_ID,
    createConsent,
    getConsentStatus,
    revokeConsent,
    getDataSessions,
    getFetchStatus,
    fetchSessionData
};
