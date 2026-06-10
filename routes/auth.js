/**
 * Authentication API Routes
 * Secure user management with JWT
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Auth rate limiter: stricter limits for login/register
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const { userDb, sessionDb } = require('../services/database');
const { authMiddleware } = require('../middleware/auth');

function formatUser(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        tier: user.tier,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        apiUsage: {
            total: user.api_usage_total || 0,
            thisMonth: user.api_usage_month || 0
        }
    };
}

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, password, name, phone, pan_number, aadhar } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                error: 'Email, password, and name are required',
                code: 'FIELDS_MISSING'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format',
                code: 'INVALID_EMAIL'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters',
                code: 'WEAK_PASSWORD'
            });
        }
        // Basic password complexity check
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        if (!hasUppercase || !hasLowercase || !hasNumber) {
            return res.status(400).json({
                success: false,
                error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
                code: 'WEAK_PASSWORD'
            });
        }

        const existing = userDb.findByEmail(email);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'User already exists',
                code: 'USER_EXISTS'
            });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = {
            id: `USR-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
            email,
            password: hashedPassword,
            name,
            phone: phone || null,
            role: 'user',
            tier: 'free',
            pan_number: pan_number || null,
            aadhar: aadhar || null
        };

        userDb.create(user);

        const accessToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role, tier: user.tier },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        const refreshToken = jwt.sign(
            { id: user.id, type: 'refresh' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
        );

        // Store refresh token in database for revocation support
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        sessionDb.create({
            userId: user.id,
            refreshToken: refreshToken,
            expiresAt: expiresAt.toISOString()
        });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    tier: user.tier,
                    pan_number: user.pan_number,
                    aadhar: user.aadhar
                },
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: '7d'
                }
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed',
            code: 'REGISTRATION_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and get tokens
 * @access  Public
 */
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required',
                code: 'FIELDS_MISSING'
            });
        }

        const user = userDb.findByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        userDb.updateLastLogin(user.id);

        const accessToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role, tier: user.tier },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        const refreshToken = jwt.sign(
            { id: user.id, type: 'refresh' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
        );

        // Store refresh token in database for revocation support
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        sessionDb.create({
            userId: user.id,
            refreshToken: refreshToken,
            expiresAt: expiresAt.toISOString()
        });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    tier: user.tier
                },
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: '7d'
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            code: 'LOGIN_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public (with refresh token)
 */
router.post('/refresh', (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token required',
                code: 'TOKEN_MISSING'
            });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token type',
                code: 'INVALID_TOKEN_TYPE'
            });
        }

        // Verify token exists in database (not revoked)
        const session = sessionDb.findByToken(refreshToken);
        if (!session) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token revoked or invalid',
                code: 'TOKEN_REVOKED'
            });
        }

        const user = userDb.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        const accessToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role, tier: user.tier },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.json({
            success: true,
            data: {
                accessToken,
                expiresIn: '7d'
            }
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Refresh token expired',
                code: 'TOKEN_EXPIRED'
            });
        }

        res.status(401).json({
            success: false,
            error: 'Invalid refresh token',
            code: 'TOKEN_INVALID',
            details: error.message
        });
    }
});

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authMiddleware, (req, res) => {
    try {
        const user = userDb.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: formatUser(user)
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch profile',
            code: 'PROFILE_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/auth/face-register
 * @desc    Register face descriptor for biometric login
 * @access  Private
 */
router.post('/face-register', authMiddleware, (req, res) => {
    try {
        const { descriptor } = req.body;
        if (!descriptor || !Array.isArray(descriptor)) {
            return res.status(400).json({ success: false, error: 'Face descriptor array is required', code: 'FACE_DESCRIPTOR_MISSING' });
        }
        if (descriptor.length !== 128) {
            return res.status(400).json({ success: false, error: 'Descriptor must have 128 floats', code: 'INVALID_DESCRIPTOR' });
        }
        userDb.updateFaceDescriptor(req.user.id, JSON.stringify(descriptor));
        res.json({ success: true, message: 'Face registered successfully' });
    } catch (error) {
        console.error('Face register error:', error);
        res.status(500).json({ success: false, error: 'Face registration failed', code: 'FACE_REGISTER_ERROR' });
    }
});

function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

/**
 * @route   POST /api/v1/auth/face-verify
 * @desc    Verify face descriptor and login
 * @access  Public
 */
router.post('/face-verify', authLimiter, (req, res) => {
    try {
        const { descriptor, email } = req.body;
        if (!descriptor || !Array.isArray(descriptor)) {
            return res.status(400).json({ success: false, error: 'Face descriptor array is required', code: 'FACE_DESCRIPTOR_MISSING' });
        }

        // If email provided, only check that user; otherwise scan all registered faces
        let candidates = [];
        if (email) {
            const user = userDb.findByEmail(email);
            if (user && user.face_descriptor) candidates.push(user);
        } else {
            candidates = userDb.findByFaceDescriptor();
        }

        if (candidates.length === 0) {
            return res.status(401).json({ success: false, error: 'No registered face found', code: 'FACE_NOT_REGISTERED' });
        }

        const THRESHOLD = 0.6; // face-api.js typical threshold
        let bestMatch = null;
        let bestDistance = Infinity;

        for (const user of candidates) {
            try {
                const stored = JSON.parse(user.face_descriptor);
                if (!Array.isArray(stored) || stored.length !== 128) continue;
                const dist = euclideanDistance(descriptor, stored);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    bestMatch = user;
                }
            } catch {
                continue;
            }
        }

        if (!bestMatch || bestDistance > THRESHOLD) {
            return res.status(401).json({ success: false, error: 'Face not recognized', code: 'FACE_MISMATCH', distance: bestDistance });
        }

        userDb.updateLastLogin(bestMatch.id);

        const accessToken = jwt.sign(
            { id: bestMatch.id, email: bestMatch.email, role: bestMatch.role || 'user', tier: bestMatch.tier || 'free' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        const refreshToken = jwt.sign(
            { id: bestMatch.id, type: 'refresh' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        sessionDb.create({
            userId: bestMatch.id,
            refreshToken: refreshToken,
            expiresAt: expiresAt.toISOString()
        });

        res.json({
            success: true,
            message: 'Face login successful',
            data: {
                user: { id: bestMatch.id, email: bestMatch.email, name: bestMatch.name, role: bestMatch.role || 'user', tier: bestMatch.tier || 'free' },
                tokens: { accessToken, refreshToken, expiresIn: '7d' },
                confidence: bestDistance
            }
        });
    } catch (error) {
        console.error('Face verify error:', error);
        res.status(500).json({ success: false, error: 'Face verification failed', code: 'FACE_VERIFY_ERROR' });
    }
});

module.exports = router;