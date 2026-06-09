const express = require('express');
const router = express.Router();
const { bankingDb } = require('../services/database');
const { authMiddleware } = require('../middleware/auth');

router.get('/status', authMiddleware, (req, res) => {
    try {
        const kyc = bankingDb.getKycByUser(req.user.id);
        res.json({ success: true, data: kyc || { kyc_status: 'pending' } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/submit', authMiddleware, (req, res) => {
    try {
        const { panNumber, aadhaarMasked } = req.body;
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        const aadhaarRegex = /^\d{12}$/;

        if (panNumber && !panRegex.test(panNumber)) {
            return res.status(400).json({ success: false, error: 'Invalid PAN format. Expected: ABCDE1234F' });
        }
        if (aadhaarMasked && !aadhaarRegex.test(aadhaarMasked)) {
            return res.status(400).json({ success: false, error: 'Invalid Aadhaar. Expected 12 digits.' });
        }

        bankingDb.createOrUpdateKyc({
            userId: req.user.id,
            panNumber,
            aadhaarMasked,
            kycStatus: panNumber && aadhaarMasked ? 'verified' : 'pending'
        });

        res.json({ success: true, message: 'KYC submitted successfully', data: { status: panNumber && aadhaarMasked ? 'verified' : 'pending' } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
