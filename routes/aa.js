/**
 * Account Aggregator (AA) mock / SETU sandbox endpoints — PSB-only demo flow
 *
 * Simulates the real India AA consent journey for the SecureWealth Twin hackathon:
 *   1. List supported institutions (Punjab & Sind Bank only for this demo).
 *   2. Create a consent against PSB (SETU sandbox when credentials are present).
 *   3. Discover accounts linked to that consent.
 *   4. Fetch recent transactions for a discovered account.
 *   5. Revoke consent (and deactivate discovered accounts).
 *
 * SETU integration is **architecture-ready**: when SETU_AA_CLIENT_ID,
 * SETU_AA_CLIENT_SECRET and SETU_AA_PRODUCT_INSTANCE_ID are set, the
 * consent is created on SETU's FIU sandbox. Without credentials the route
 * falls back to a deterministic mock flow so the demo keeps working.
 *
 * Data is persisted in SQLite so the demo survives reloads.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { bankingDb } = require('../services/database');
const setuAa = require('../services/setuAaAdapter');

const PSB_INSTITUTIONS = [
    {
        id: 'PSB-HO-CHD',
        name: 'Punjab & Sind Bank',
        shortName: 'PSB',
        type: 'BANK',
        fipId: setuAa.PSB_FIP_ID,
        logoUrl: '/assets/psb-logo.svg',
        supportedScopes: ['profile', 'accounts', 'transactions', 'balance']
    }
];

const PSB_ACCOUNT_TYPES = ['Savings Account', 'Current Account', 'Fixed Deposit', 'Recurring Deposit'];

const TXN_TEMPLATES = [
    { description: 'Salary credit via NEFT', category: 'income', type: 'credit', min: 25000, max: 95000 },
    { description: 'UPI to Grocery Mart', category: 'shopping', type: 'debit', min: 250, max: 3500 },
    { description: 'ATM withdrawal PSB', category: 'cash', type: 'debit', min: 500, max: 10000 },
    { description: 'Interest credit', category: 'interest', type: 'credit', min: 120, max: 4500 },
    { description: 'UPI to Electricity Board', category: 'utilities', type: 'debit', min: 800, max: 2800 },
    { description: 'SIP mandate', category: 'investment', type: 'debit', min: 1000, max: 10000 },
    { description: 'Refund from E-commerce', category: 'refund', type: 'credit', min: 300, max: 5000 },
    { description: 'IMPS transfer', category: 'transfer', type: 'debit', min: 500, max: 15000 }
];

function hashSeed(input) {
    return parseInt(crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 12), 16);
}

function pseudoRandom(seed, index) {
    const x = Math.sin(seed + index) * 10000;
    return x - Math.floor(x);
}

function formatINR(amount) {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function generateMaskedAccount(seed, index) {
    const branch = 1000 + Math.floor(pseudoRandom(seed, index * 7) * 9000);
    const suffix = 100000 + Math.floor(pseudoRandom(seed, index * 13) * 899999);
    return `${branch}XXXX${suffix}`;
}

function generatePsbAccounts(consentId, userId, count = 2) {
    const seed = hashSeed(consentId + userId);
    const accounts = [];
    for (let i = 0; i < count; i++) {
        const typeIndex = Math.floor(pseudoRandom(seed, i) * PSB_ACCOUNT_TYPES.length);
        const accountType = PSB_ACCOUNT_TYPES[typeIndex];
        const baseBalance = accountType === 'Savings Account'
            ? 15000 + pseudoRandom(seed, i + 100) * 185000
            : accountType === 'Current Account'
                ? 50000 + pseudoRandom(seed, i + 100) * 500000
                : 25000 + pseudoRandom(seed, i + 100) * 200000;
        accounts.push({
            accountId: `PSB-${consentId}-${i + 1}`,
            accountNumberMasked: generateMaskedAccount(seed, i),
            accountType,
            bankName: 'Punjab & Sind Bank',
            currency: 'INR',
            balance: Math.round(baseBalance)
        });
    }
    return accounts;
}

function generateTransactions(accountId, balance, count = 12) {
    const seed = hashSeed(accountId);
    const transactions = [];
    const today = new Date();
    let runningBalance = balance;
    for (let i = 0; i < count; i++) {
        const template = TXN_TEMPLATES[Math.floor(pseudoRandom(seed, i) * TXN_TEMPLATES.length)];
        const amount = Math.round(template.min + pseudoRandom(seed, i + 200) * (template.max - template.min));
        const date = new Date(today);
        date.setDate(date.getDate() - i * 2 - Math.floor(pseudoRandom(seed, i + 300) * 2));
        const txnDate = date.toISOString().split('T')[0];
        if (template.type === 'credit') {
            runningBalance += amount;
        } else {
            runningBalance -= amount;
        }
        transactions.push({
            txnId: `TXN-${accountId}-${i + 1}`,
            txnDate,
            description: template.description,
            amount,
            type: template.type,
            category: template.category,
            balanceAfter: Math.round(runningBalance)
        });
    }
    return transactions.reverse();
}

function normalizeStatus(setuStatus) {
    if (!setuStatus) return 'active';
    const s = String(setuStatus).toUpperCase();
    if (s === 'ACTIVE' || s === 'APPROVED' || s === 'READY') return 'active';
    if (s === 'REVOKED' || s === 'REJECTED' || s === 'EXPIRED') return 'revoked';
    return 'pending';
}

// ═══════════════════════════════════════════════════════════════
// Supported institutions (PSB-only for the hackathon demo)
// ═══════════════════════════════════════════════════════════════
router.get('/institutions', (req, res) => {
    res.json({
        success: true,
        data: PSB_INSTITUTIONS,
        setuConfigured: setuAa.isConfigured()
    });
});

// ═══════════════════════════════════════════════════════════════
// Consent management
// ═══════════════════════════════════════════════════════════════
router.get('/consents', (req, res) => {
    try {
        const consents = bankingDb.getAaConsentsByUser(req.user.id);
        res.json({ success: true, data: consents, setuConfigured: setuAa.isConfigured() });
    } catch (err) {
        console.error('AA consents error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch AA consents' });
    }
});

router.post('/consents', async (req, res) => {
    try {
        const { bankName, accountMask, scopes, phone, redirectUrl } = req.body;
        if (!bankName) {
            return res.status(400).json({ success: false, error: 'bankName is required' });
        }
        const consentRedirectUrl = redirectUrl || process.env.SETU_AA_REDIRECT_URL || 'http://localhost:3000/aa/callback';
        const consentPhone = phone || process.env.SETU_AA_TEST_PHONE;
        const normalized = bankName.trim().toLowerCase();
        if (!normalized.includes('punjab') && !normalized.includes('psb') && !normalized.includes('sind')) {
            return res.status(400).json({
                success: false,
                error: 'This demo only supports Punjab & Sind Bank (PSB) accounts.'
            });
        }

        const internalConsentId = `AA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        let setuRequestId = null;
        let setuConsentUrl = null;
        let setuStatus = null;

        if (setuAa.isConfigured()) {
            try {
                const vua = consentPhone ? `${consentPhone}@onemoney` : `${req.user.id}@onemoney`;
                const setuRes = await setuAa.createConsent({
                    vua,
                    redirectUrl: consentRedirectUrl,
                    fiTypes: ['DEPOSIT'],
                    consentTypes: (scopes || ['transactions', 'profile', 'summary']).map(s => String(s).toUpperCase())
                });
                setuRequestId = setuRes.id || setuRes.consentId || null;
                setuConsentUrl = setuRes.url || setuRes.redirectUrl || null;
                setuStatus = setuRes.status || 'PENDING';
            } catch (setuErr) {
                // SETU sandbox occasionally returns 500s for products that are not
                // fully configured or KYC-incomplete. Keep the demo usable by
                // falling back to a local mock consent and surfacing the error.
                console.warn('SETU consent creation failed, falling back to mock:', setuErr.message);
            }
        }

        const result = bankingDb.createAaConsent({
            userId: req.user.id,
            bankName: 'Punjab & Sind Bank',
            accountMask: accountMask || `****${Math.floor(1000 + Math.random() * 9000)}`,
            consentId: internalConsentId,
            scopes: scopes || ['profile', 'accounts', 'transactions'],
            setuRequestId,
            setuConsentUrl,
            setuStatus
        });

        const setuConfigured = setuAa.isConfigured();
        const mode = setuConfigured
            ? (setuRequestId ? 'setu-sandbox' : 'setu-sandbox-fallback')
            : 'mock';

        res.json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                consentId: internalConsentId,
                bankName: 'Punjab & Sind Bank',
                setuRequestId,
                setuConsentUrl,
                setuStatus,
                mode
            }
        });
    } catch (err) {
        if (err.message === 'Bank already linked') {
            return res.status(409).json({ success: false, error: err.message });
        }
        console.error('AA consent create error:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to create AA consent' });
    }
});

router.get('/consents/:id/status', async (req, res) => {
    try {
        const consent = bankingDb.getAaConsentById(req.params.id, req.user.id);
        if (!consent) {
            return res.status(404).json({ success: false, error: 'Consent not found' });
        }

        let setuStatus = consent.setu_status;
        if (setuAa.isConfigured() && consent.setu_request_id) {
            const setuRes = await setuAa.getConsentStatus(consent.setu_request_id);
            setuStatus = setuRes.status || setuStatus;
            const localStatus = normalizeStatus(setuStatus);
            if (localStatus !== consent.status || setuStatus !== consent.setu_status) {
                bankingDb.updateAaConsentSetu(consent.id, req.user.id, {
                    setuStatus,
                    status: localStatus
                });
            }
        }

        res.json({
            success: true,
            data: {
                id: consent.id,
                consentId: consent.consent_id,
                status: normalizeStatus(setuStatus),
                setuStatus,
                setuConsentUrl: consent.setu_consent_url
            }
        });
    } catch (err) {
        console.error('AA consent status error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch consent status' });
    }
});

router.delete('/consents/:id', async (req, res) => {
    try {
        const consent = bankingDb.getAaConsentById(req.params.id, req.user.id);
        if (!consent) {
            return res.status(404).json({ success: false, error: 'Consent not found' });
        }
        if (setuAa.isConfigured() && consent.setu_request_id) {
            await setuAa.revokeConsent(consent.setu_request_id).catch(() => null);
        }
        bankingDb.revokeAaConsent(req.params.id, req.user.id);
        bankingDb.deactivateAaAccountsByConsent(req.params.id, req.user.id);
        res.json({ success: true, message: 'Consent revoked and linked accounts deactivated' });
    } catch (err) {
        console.error('AA consent revoke error:', err);
        res.status(500).json({ success: false, error: 'Failed to revoke AA consent' });
    }
});

// ═══════════════════════════════════════════════════════════════
// Account discovery (simulates FIP account discovery after consent)
// ═══════════════════════════════════════════════════════════════
router.post('/consents/:id/discover', async (req, res) => {
    try {
        const consent = bankingDb.getAaConsentById(req.params.id, req.user.id);
        if (!consent) {
            return res.status(404).json({ success: false, error: 'Consent not found' });
        }
        if (consent.status !== 'active') {
            return res.status(400).json({ success: false, error: 'Consent is not active' });
        }

        let setuSessions = null;
        if (setuAa.isConfigured() && consent.setu_request_id) {
            const setuRes = await setuAa.getConsentStatus(consent.setu_request_id);
            const setuStatus = setuRes.status || consent.setu_status;
            if (normalizeStatus(setuStatus) !== 'active') {
                return res.status(400).json({
                    success: false,
                    error: 'SETU consent is not active yet; user must approve it first',
                    setuStatus
                });
            }
            bankingDb.updateAaConsentSetu(consent.id, req.user.id, { setuStatus, status: 'active' });
            // The public UAT sandbox does not expose a list-data-sessions endpoint;
            // sessions are created on demand when data is fetched.
            setuSessions = null;
        }

        const existing = bankingDb.getAaAccountsByConsent(consent.id, req.user.id);
        if (existing.length > 0) {
            return res.json({ success: true, data: existing, source: 'cache', setuSessions });
        }

        const generated = generatePsbAccounts(consent.consent_id, req.user.id, 2);
        const accounts = [];
        for (const acc of generated) {
            const result = bankingDb.createAaAccount({
                consentId: consent.id,
                userId: req.user.id,
                accountId: acc.accountId,
                accountNumberMasked: acc.accountNumberMasked,
                accountType: acc.accountType,
                bankName: acc.bankName,
                currency: acc.currency,
                balance: acc.balance
            });
            accounts.push({ ...acc, id: result.lastInsertRowid });
        }
        res.json({ success: true, data: accounts, source: 'discovered', setuSessions });
    } catch (err) {
        console.error('AA discover error:', err);
        res.status(500).json({ success: false, error: 'Failed to discover accounts' });
    }
});

router.get('/accounts', (req, res) => {
    try {
        const accounts = bankingDb.getAaAccountsByUser(req.user.id);
        res.json({ success: true, data: accounts, setuConfigured: setuAa.isConfigured() });
    } catch (err) {
        console.error('AA accounts error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch accounts' });
    }
});

// ═══════════════════════════════════════════════════════════════
// Transaction fetch (simulates FI data fetch for a discovered account)
// ═══════════════════════════════════════════════════════════════
router.get('/accounts/:accountId/transactions', (req, res) => {
    try {
        const { accountId } = req.params;
        const account = bankingDb.getAaAccountsByUser(req.user.id).find(a => a.account_id === accountId);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }
        let transactions = bankingDb.getAaTransactionsByAccount(accountId);
        if (transactions.length === 0) {
            const generated = generateTransactions(accountId, account.balance, 12);
            for (const t of generated) {
                bankingDb.createAaTransaction({ accountId, ...t });
            }
            transactions = bankingDb.getAaTransactionsByAccount(accountId);
        }
        res.json({ success: true, data: transactions, accountBalance: account.balance });
    } catch (err) {
        console.error('AA transactions error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
    }
});

// ═══════════════════════════════════════════════════════════════
// One-shot sync helper: discover + fetch all transactions for all consents
// ═══════════════════════════════════════════════════════════════
router.post('/sync', async (req, res) => {
    try {
        const consents = bankingDb.getAaConsentsByUser(req.user.id);
        const result = [];
        for (const consent of consents) {
            const existing = bankingDb.getAaAccountsByConsent(consent.id, req.user.id);
            let accounts = existing;
            if (accounts.length === 0) {
                const generated = generatePsbAccounts(consent.consent_id, req.user.id, 2);
                accounts = [];
                for (const acc of generated) {
                    const r = bankingDb.createAaAccount({
                        consentId: consent.id,
                        userId: req.user.id,
                        accountId: acc.accountId,
                        accountNumberMasked: acc.accountNumberMasked,
                        accountType: acc.accountType,
                        bankName: acc.bankName,
                        currency: acc.currency,
                        balance: acc.balance
                    });
                    accounts.push({ ...acc, id: r.lastInsertRowid });
                }
            }
            for (const acc of accounts) {
                const txns = bankingDb.getAaTransactionsByAccount(acc.account_id);
                if (txns.length === 0) {
                    const generated = generateTransactions(acc.account_id, acc.balance, 12);
                    for (const t of generated) {
                        bankingDb.createAaTransaction({ accountId: acc.account_id, ...t });
                    }
                }
            }
            result.push({ consentId: consent.consent_id, accounts });
        }
        res.json({ success: true, data: result, setuConfigured: setuAa.isConfigured() });
    } catch (err) {
        console.error('AA sync error:', err);
        res.status(500).json({ success: false, error: 'Failed to sync AA data' });
    }
});

// ═══════════════════════════════════════════════════════════════
// SETU redirect callback (user returns after approving/rejecting)
// ═══════════════════════════════════════════════════════════════
// Setu redirects to the configured redirectUrl with ?requestId=<id>.
// We poll the consent status and then send the user to the frontend.
router.get('/callback', async (req, res) => {
    try {
        // Setu redirects with ?id=<consent-id>&success=<true|false>.
        // We also accept ?requestId=<id> for backward compatibility.
        const { requestId, id, success, errorcode, errormsg, error: setuError } = req.query;
        const setuRequestId = requestId || id;
        if (!setuRequestId) {
            return res.status(400).json({ success: false, error: 'Missing requestId/id' });
        }
        const successFlag = success === 'true';
        const userRejected = success === 'false' || errorcode === '1' || errorcode === '5';
        if (setuError || errormsg) {
            console.warn('SETU callback returned error:', setuError || errormsg, 'code:', errorcode);
        }

        const consent = bankingDb.getAaConsentBySetuRequestId(setuRequestId);
        if (setuAa.isConfigured() && !userRejected) {
            try {
                const setuRes = await setuAa.getConsentStatus(setuRequestId);
                const setuStatus = setuRes.status || consent?.setu_status;
                const localStatus = normalizeStatus(setuStatus);
                if (consent) {
                    bankingDb.updateAaConsentSetu(consent.id, consent.user_id, {
                        setuStatus,
                        status: localStatus
                    });
                }
            } catch (statusErr) {
                console.warn('SETU callback status poll failed:', statusErr.message);
            }
        } else if (consent && userRejected) {
            bankingDb.updateAaConsentSetu(consent.id, consent.user_id, {
                setuStatus: 'REJECTED',
                status: 'revoked'
            });
        }

        const redirectUrl = process.env.SETU_AA_REDIRECT_URL || 'http://localhost:3000/aa/callback';
        const separator = redirectUrl.includes('?') ? '&' : '?';
        // Refresh consent after the DB update so the redirect carries the latest status.
        const refreshedConsent = consent ? bankingDb.getAaConsentBySetuRequestId(setuRequestId) : null;
        return res.redirect(`${redirectUrl}${separator}requestId=${encodeURIComponent(setuRequestId)}&status=${refreshedConsent ? refreshedConsent.status : (consent ? consent.status : 'unknown')}`);
    } catch (err) {
        console.error('AA callback error:', err);
        res.status(500).json({ success: false, error: 'Failed to process SETU callback' });
    }
});

// ═══════════════════════════════════════════════════════════════
// SETU notifications webhook
// ═══════════════════════════════════════════════════════════════
// Configure this endpoint in Step 1 of the Bridge product config.
// It receives async events (consent approved/revoked, data ready, etc.).
router.post('/notifications', async (req, res) => {
    try {
        const { type, requestId, consentId, status, data } = req.body || {};
        console.log('SETU notification received:', { type, requestId, consentId, status });

        if (requestId) {
            const consent = bankingDb.getAaConsentBySetuRequestId(requestId);
            if (consent) {
                const localStatus = normalizeStatus(status);
                bankingDb.updateAaConsentSetu(consent.id, consent.user_id, {
                    setuStatus: status,
                    status: localStatus
                });
            }
        }

        // Acknowledge quickly — Setu retries if not 200.
        res.json({ success: true, message: 'Notification received' });
    } catch (err) {
        console.error('AA notification error:', err);
        res.status(500).json({ success: false, error: 'Failed to process notification' });
    }
});

module.exports = router;
