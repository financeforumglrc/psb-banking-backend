/**
 * Login-to-Action Timing Check Middleware
 * Detects if a high-value action happens within 10 seconds of login
 * (indicates rushed/coerced activity, credential stuffing, or session hijacking)
 * Required by PSB Hackathon problem statement — Wealth Protection Layer
 */

const RISK_THRESHOLD_MS = 10000;
const HIGH_VALUE_THRESHOLD = 50000;

const timingCheck = (req, res, next) => {
    try {
        req.wealthProtection = { signals: [], riskScore: 0 };

        if (!req.user || !req.user.loginAt) {
            return next();
        }

        const timeSinceLogin = Date.now() - req.user.loginAt;
        const amount = parseFloat(req.body?.amount) || 0;

        if (timeSinceLogin < RISK_THRESHOLD_MS) {
            const isHighValue = amount >= HIGH_VALUE_THRESHOLD;
            req.wealthProtection.signals.push({
                type: 'FAST_ACTION_AFTER_LOGIN',
                detail: 'Action taken unusually fast after login',
                severity: isHighValue ? 'high' : 'medium',
                timeSinceLoginMs: timeSinceLogin
            });
            req.wealthProtection.riskScore += isHighValue ? 30 : 15;
        }

        next();
    } catch {
        next();
    }
};

module.exports = { timingCheck };
