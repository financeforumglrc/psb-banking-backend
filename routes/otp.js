/**
 * OTP API Routes
 * Real email-based OTP flow using SendGrid.
 * Falls back to console logging when SENDGRID_API_KEY is not configured (local dev).
 */

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { otpDb, userDb } = require('../services/database');

const router = express.Router();

let sgMail = null;
try {
    sgMail = require('@sendgrid/mail');
    if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
} catch (e) {
    console.warn('@sendgrid/mail not available; OTP emails will use console fallback.');
}

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'sdeepu70gg@gmail.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'PSB SecureWealth';

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Too many OTP requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

function generateOtp() {
    // Cryptographically secure 6-digit code
    const buf = crypto.randomInt(0, 1_000_000);
    return String(buf).padStart(OTP_LENGTH, '0');
}

function hashOtp(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

function getDisplayRecipient(userId, email) {
    if (email) return email.trim().toLowerCase();
    if (userId) return String(userId).trim();
    return null;
}

async function sendOtpEmail(recipient, otp, purpose) {
    const subject = `${otp} is your PSB SecureWealth verification code`;
    const text = `Your one-time verification code is: ${otp}\n\nThis code is valid for ${OTP_TTL_MINUTES} minutes and was requested for: ${purpose || 'secure transaction'}.\n\nIf you did not request this, please ignore this email or contact support.`;
    const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1A237E">PSB SecureWealth</h2>
            <p>Your one-time verification code is:</p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;text-align:center;font-size:32px;letter-spacing:8px;font-weight:bold;color:#1A237E">
                ${otp}
            </div>
            <p>This code is valid for <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
            <p style="color:#666;font-size:12px">Requested for: ${purpose || 'secure transaction'}. If you did not request this, please ignore this email or contact support.</p>
        </div>
    `;

    if (sgMail && process.env.SENDGRID_API_KEY) {
        try {
            console.log(`Sending OTP via SendGrid from ${FROM_NAME} <${FROM_EMAIL}> to ${recipient}`);
            await sgMail.send({
                to: recipient,
                from: { email: FROM_EMAIL, name: FROM_NAME },
                subject,
                text,
                html
            });
            return { sent: true, provider: 'sendgrid' };
        } catch (err) {
            console.error('SendGrid send failed:', err.message);
            if (err.response && err.response.body) {
                console.error('SendGrid error body:', JSON.stringify(err.response.body));
            }
            throw new Error(`SendGrid failed: ${err.message}`);
        }
    }

    // Dev fallback: never expose the OTP through the API, but log it locally.
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' OTP FALLBACK (SendGrid not configured):');
    console.log(` To: ${recipient}`);
    console.log(` Purpose: ${purpose || 'secure transaction'}`);
    console.log(` Code: ${otp}`);
    console.log('═══════════════════════════════════════════════════════════════');
    return { sent: true, provider: 'console' };
}

/**
 * @route   POST /api/v1/otp/send
 * @desc    Generate and send a 6-digit OTP via email
 * @access  Public (caller should ensure user is authenticated)
 */
router.post('/send', otpLimiter, async (req, res) => {
    try {
        const { email, userId, purpose = 'secure transaction' } = req.body || {};

        const recipient = getDisplayRecipient(userId, email);
        if (!recipient) {
            return res.status(400).json({
                success: false,
                error: 'email or userId is required',
                code: 'RECIPIENT_MISSING'
            });
        }

        // Resolve email from userId if only userId provided
        let resolvedEmail = email ? email.trim().toLowerCase() : null;
        if (!resolvedEmail && userId) {
            const user = userDb.findById(userId);
            if (user && user.email) {
                resolvedEmail = user.email;
            }
        }

        if (!resolvedEmail) {
            return res.status(400).json({
                success: false,
                error: 'Could not resolve a valid email address',
                code: 'EMAIL_NOT_FOUND'
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(resolvedEmail)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format',
                code: 'INVALID_EMAIL'
            });
        }

        const otp = generateOtp();
        const otpHash = hashOtp(otp);
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

        // Invalidate any previous active OTP for this recipient/purpose
        otpDb.invalidateActive(recipient, purpose);

        otpDb.create({
            recipient,
            otpHash,
            purpose,
            expiresAt
        });

        const sendResult = await sendOtpEmail(resolvedEmail, otp, purpose);

        res.json({
            success: true,
            message: `OTP sent to ${maskEmail(resolvedEmail)}`,
            data: {
                recipient: maskEmail(resolvedEmail),
                expires_in_seconds: OTP_TTL_MINUTES * 60,
                purpose,
                provider: sendResult.provider
            }
        });
    } catch (error) {
        console.error('OTP send error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send OTP',
            code: 'OTP_SEND_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/otp/verify
 * @desc    Verify a 6-digit OTP
 * @access  Public
 */
router.post('/verify', async (req, res) => {
    try {
        const { email, userId, otp, purpose = 'secure transaction' } = req.body || {};

        const recipient = getDisplayRecipient(userId, email);
        if (!recipient) {
            return res.status(400).json({
                success: false,
                error: 'email or userId is required',
                code: 'RECIPIENT_MISSING'
            });
        }

        if (!otp || !/^\d{6}$/.test(String(otp))) {
            return res.status(400).json({
                success: false,
                error: 'A valid 6-digit OTP is required',
                code: 'INVALID_OTP_FORMAT'
            });
        }

        const record = otpDb.findActiveByRecipient(recipient, purpose);
        if (!record) {
            return res.status(400).json({
                success: false,
                error: 'OTP expired or not found. Please request a new one.',
                code: 'OTP_NOT_FOUND'
            });
        }

        if (record.attempts >= MAX_ATTEMPTS) {
            return res.status(429).json({
                success: false,
                error: 'Maximum verification attempts exceeded. Please request a new OTP.',
                code: 'OTP_MAX_ATTEMPTS_EXCEEDED'
            });
        }

        otpDb.incrementAttempts(record.id);

        const providedHash = hashOtp(String(otp));
        if (providedHash !== record.otp_hash) {
            const remaining = Math.max(0, MAX_ATTEMPTS - (record.attempts + 1));
            return res.status(400).json({
                success: false,
                error: 'Invalid OTP',
                code: 'INVALID_OTP',
                data: { attempts_remaining: remaining }
            });
        }

        otpDb.markVerified(record.id);

        res.json({
            success: true,
            message: 'OTP verified successfully',
            data: {
                verified: true,
                purpose: record.purpose
            }
        });
    } catch (error) {
        console.error('OTP verify error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify OTP',
            code: 'OTP_VERIFY_ERROR'
        });
    }
});

function maskEmail(email) {
    const [local, domain] = email.split('@');
    if (!domain) return '*'.repeat(email.length);
    const visible = Math.max(1, Math.floor(local.length / 3));
    const masked = local.slice(0, visible) + '*'.repeat(Math.max(1, local.length - visible));
    return `${masked}@${domain}`;
}

module.exports = router;
