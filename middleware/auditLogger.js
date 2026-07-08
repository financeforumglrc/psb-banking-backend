/**
 * Audit Logger Middleware
 * Captures IP, user-agent, device fingerprint, action metadata
 * Auto-logs all API responses for authenticated users
 */

const { bankingDb } = require('../services/database');
const { redactBody } = require('../lib/pii');

function captureMeta(req) {
    return {
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || 'unknown',
        ua: req.headers['user-agent'] || null,
        deviceId: req.headers['x-device-id'] || null
    };
}

function entityFromPath(path) {
    if (path.includes('/auth/login')) return 'auth';
    if (path.includes('/auth/register')) return 'auth';
    if (path.includes('/auth/refresh')) return 'auth';
    if (path.includes('/auth/logout')) return 'auth';
    if (path.includes('/banking/accounts')) return 'account';
    if (path.includes('/banking/transactions')) return 'transaction';
    if (path.includes('/banking/recurring')) return 'recurring';
    if (path.includes('/banking/goals')) return 'goal';
    if (path.includes('/banking/loans')) return 'loan';
    if (path.includes('/banking/bills')) return 'bill';
    if (path.includes('/banking/beneficiaries')) return 'beneficiary';
    if (path.includes('/banking/cards')) return 'card';
    if (path.includes('/kyc')) return 'kyc';
    if (path.includes('/admin/login')) return 'admin';
    if (path.includes('/ai')) return 'ai';
    if (path.includes('/otp')) return 'otp';
    return 'api';
}

const auditMiddleware = (req, res, next) => {
    const origJson = res.json.bind(res);
    const startTime = Date.now();

    res.json = function (body) {
        // Check at call time (req.user may be set by authMiddleware after this runs)
        if (req.user?.id) {
            try {
                const meta = captureMeta(req);
                const method = req.method;
                const success = res.statusCode < 400;
                const entityType = entityFromPath(req.path);

                let action;
                if (method === 'GET') action = 'VIEW';
                else if (method === 'POST') action = 'CREATE';
                else if (method === 'PATCH') action = 'UPDATE';
                else if (method === 'PUT') action = 'UPDATE';
                else if (method === 'DELETE') action = 'DELETE';
                else action = method;

                const safeBody = redactBody(req.body);
                const details = {
                    path: req.path,
                    method,
                    status: res.statusCode,
                    duration: Date.now() - startTime,
                    success,
                    body: safeBody
                };

                if (safeBody?.amount) details.amount = safeBody.amount;
                if (safeBody?.type) details.type = safeBody.type;

                bankingDb.createAuditLog({
                    userId: req.user.id,
                    action,
                    entityType,
                    entityId: req.params?.id || null,
                    oldValue: null,
                    newValue: JSON.stringify(details),
                    ipAddress: meta.ip,
                    userAgent: meta.ua
                });
            } catch {
                // silent fail
            }
        }

        return origJson(body);
    };

    next();
};

module.exports = { auditMiddleware, captureMeta };
