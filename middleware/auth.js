/**
 * Authentication Middleware
 * Patent-Protected: Session Management & Security
 */

const jwt = require('jsonwebtoken');
const winston = require('winston');
const { userDb } = require('../services/database');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [new winston.transports.Console()]
});

const DEFAULT_WEAK_SECRETS = [
    'ds-financial-dev-secret-key-2024-secure',
    'your-super-secret-jwt-key-min-64-chars-long-change-this-immediately',
    'secret',
    'test',
    ''
];

/**
 * Validates that JWT_SECRET is configured and strong.
 * Call this once during server startup.
 */
function ensureJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || DEFAULT_WEAK_SECRETS.includes(secret)) {
        const msg = 'FATAL: JWT_SECRET is missing, too short (< 32 chars), or uses a known weak/default value. Set a strong random secret before starting the server.';
        logger.error(msg);
        throw new Error(msg);
    }
}

/**
 * JWT Authentication Middleware
 * Verifies access token and attaches user to request
 */
const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = req.cookies?.accessToken;
        const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required',
                code: 'TOKEN_MISSING'
            });
        }

        // Verify token and pin algorithm to prevent algorithm switching attacks
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        // Admin service tokens carry role directly and are not tied to a DB user
        if (decoded.role === 'admin') {
            req.user = {
                id: decoded.id,
                email: decoded.id,
                role: 'admin',
                tier: decoded.tier || 'enterprise'
            };
            return next();
        }

        // Verify user still exists and is active
        const user = userDb.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User no longer exists',
                code: 'USER_NOT_FOUND'
            });
        }
        if (user.is_active === 0) {
            return res.status(403).json({
                success: false,
                error: 'Account has been deactivated',
                code: 'ACCOUNT_DISABLED'
            });
        }

        // Attach user info to request (use latest data from DB, not stale token data)
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role || 'user',
            tier: user.tier || 'free'
        };

        // Log API usage for analytics
        logger.info('API Request', {
            userId: decoded.id,
            endpoint: req.path,
            method: req.method,
            timestamp: new Date().toISOString()
        });

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token',
                code: 'TOKEN_INVALID'
            });
        }

        logger.error('Auth middleware error', { error: error.message });
        return res.status(500).json({
            success: false,
            error: 'Authentication error',
            code: 'AUTH_ERROR'
        });
    }
};

/**
 * Role-based access control middleware
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                required: roles,
                current: req.user.role
            });
        }

        next();
    };
};

/**
 * Tier-based access control middleware
 */
const requireTier = (...tiers) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        if (!tiers.includes(req.user.tier)) {
            return res.status(403).json({
                success: false,
                error: 'Premium feature requires upgrade',
                required: tiers,
                current: req.user.tier
            });
        }

        next();
    };
};

/**
 * API Key authentication for enterprise clients
 * NOTE: This requires a proper API key database table to be functional.
 * Currently returns 501 Not Implemented if called without configuration.
 */
const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required',
            code: 'API_KEY_MISSING'
        });
    }

    // TODO: Implement real API key validation against database
    // const { db } = require('../services/database');
    // const keyRecord = db.prepare('SELECT * FROM api_keys WHERE key = ? AND active = 1 AND expires_at > datetime("now")').get(apiKey);
    // if (!keyRecord) { ... }

    // Reject all API key requests until properly implemented
    return res.status(501).json({
        success: false,
        error: 'API key authentication not yet implemented. Use Bearer token authentication instead.',
        code: 'API_KEY_NOT_IMPLEMENTED'
    });
};

module.exports = {
    authMiddleware,
    requireRole,
    requireTier,
    apiKeyMiddleware,
    ensureJwtSecret
};
