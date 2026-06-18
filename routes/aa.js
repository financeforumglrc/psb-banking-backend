/**
 * Account Aggregator (AA) mock endpoints
 * Persists linked-bank consents in the backend so the state survives reloads.
 */

const express = require('express');
const router = express.Router();
const { bankingDb } = require('../services/database');
const { authMiddleware } = require('../middleware/auth');

router.get('/consents', authMiddleware, (req, res) => {
    try {
        const consents = bankingDb.getAaConsentsByUser(req.user.id);
        res.json({ success: true, data: consents });
    } catch (err) {
        console.error('AA consents error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch AA consents' });
    }
});

router.post('/consents', authMiddleware, (req, res) => {
    try {
        const { bankName, accountMask, scopes } = req.body;
        if (!bankName) {
            return res.status(400).json({ success: false, error: 'bankName is required' });
        }
        const consentId = `AA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const result = bankingDb.createAaConsent({
            userId: req.user.id,
            bankName,
            accountMask: accountMask || `****${Math.floor(1000 + Math.random() * 9000)}`,
            consentId,
            scopes: scopes || ['profile', 'transactions']
        });
        res.json({ success: true, data: { id: result.lastInsertRowid, consentId, bankName } });
    } catch (err) {
        if (err.message === 'Bank already linked') {
            return res.status(409).json({ success: false, error: err.message });
        }
        console.error('AA consent create error:', err);
        res.status(500).json({ success: false, error: 'Failed to create AA consent' });
    }
});

router.delete('/consents/:id', authMiddleware, (req, res) => {
    try {
        bankingDb.revokeAaConsent(req.params.id, req.user.id);
        res.json({ success: true, message: 'Consent revoked' });
    } catch (err) {
        console.error('AA consent revoke error:', err);
        res.status(500).json({ success: false, error: 'Failed to revoke consent' });
    }
});

module.exports = router;
