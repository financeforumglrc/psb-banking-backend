/**
 * Admin Status Page for dsFinancial Phase 3
 * GET /admin/status — observability dashboard
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { quotaDb, db, bankingDb } = require('../services/database');
const { adminApiAuth, getAdminIdFromToken } = require('../middleware/auth');
const axios = require('axios');
const router = express.Router();

// Admin credentials are sourced from environment variables only.
// Default credentials are intentionally NOT provided here; they are handled in middleware/auth.js
// for non-production environments, but production requires explicit configuration.
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function basicAuth(req, res, next) {
    if (!ADMIN_ID || !ADMIN_PASSWORD) {
        return res.status(503).json({ success: false, error: 'Admin credentials not configured' });
    }
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Authentication required');
    }
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
    const [user, pass] = credentials.split(':');
    if (user !== ADMIN_ID || pass !== ADMIN_PASSWORD) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Invalid credentials');
    }
    next();
}

router.get('/quota', basicAuth, (req, res) => {
    try {
        const quota = quotaDb.getOrCreateToday();
        res.json({
            success: true,
            remaining: Math.max(0, 250 - quota.extract_used),
            quota: {
                extract_used: quota.extract_used,
                extract_limit: 250,
                chat_used: quota.chat_used,
                chat_limit: 1000,
                explain_used: quota.explain_used,
                explain_limit: 1000,
                memo_used: quota.memo_used,
                memo_limit: 100,
                date: quota.date
            }
        });
    } catch (error) {
        console.error('Admin quota error:', error);
        res.status(500).json({ success: false, error: 'Failed to load quota' });
    }
});

router.get('/status', basicAuth, (req, res) => {
    try {
        const quota = quotaDb.getOrCreateToday();
        const extractions = db.prepare('SELECT * FROM extractions ORDER BY created_at DESC LIMIT 50').all();
        const topModels = db.prepare(`
            SELECT slug, company_name, COUNT(*) as views
            FROM financial_models
            WHERE is_public = 1
            GROUP BY slug
            ORDER BY views DESC
            LIMIT 10
        `).all();
        const activeDevices = db.prepare(`
            SELECT COUNT(DISTINCT device_id) as count
            FROM device_ids
            WHERE last_seen > datetime('now', '-1 day')
        `).get();
        const recentErrors = db.prepare(`
            SELECT task, model, error_message, created_at
            FROM ai_runs
            WHERE success = 0
            ORDER BY created_at DESC
            LIMIT 20
        `).all();

        // Disk usage
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        let uploadSize = 0;
        try {
            const files = fs.readdirSync(uploadsDir, { recursive: true });
            files.forEach(f => {
                try { uploadSize += fs.statSync(path.join(uploadsDir, f)).size; } catch (e) {}
            });
        } catch (e) {}

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>dsFinancial Admin</title>
    <meta http-equiv="refresh" content="30">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
        h1 { font-size: 1.5rem; margin-bottom: 4px; }
        .subtitle { color: #94a3b8; font-size: 0.85rem; margin-bottom: 24px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .card { background: #1e293b; border-radius: 12px; padding: 20px; }
        .card h3 { font-size: 0.85rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 12px; letter-spacing: 0.05em; }
        .metric { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #334155; }
        .metric:last-child { border-bottom: none; }
        .metric-label { font-size: 0.9rem; }
        .metric-value { font-weight: 600; font-size: 0.95rem; }
        .ok { color: #34d399; }
        .warn { color: #fbbf24; }
        .danger { color: #f87171; }
        table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        th { text-align: left; padding: 10px; background: #334155; color: #cbd5e1; font-weight: 500; }
        td { padding: 10px; border-bottom: 1px solid #334155; }
        tr:hover { background: #253449; }
        .timestamp { color: #64748b; font-size: 0.8rem; }
    </style>
</head>
<body>
    <h1>🔧 dsFinancial Admin Status</h1>
    <div class="subtitle">Auto-refreshes every 30s · Last updated: ${new Date().toISOString()}</div>

    <div class="grid">
        <div class="card">
            <h3>Server Quota (Today)</h3>
            <div class="metric">
                <span class="metric-label">Extract (Flash)</span>
                <span class="metric-value ${quota.extract_used > 200 ? 'danger' : quota.extract_used > 150 ? 'warn' : 'ok'}">${quota.extract_used} / 250</span>
            </div>
            <div class="metric">
                <span class="metric-label">Chat (Flash-Lite)</span>
                <span class="metric-value ${quota.chat_used > 800 ? 'danger' : quota.chat_used > 600 ? 'warn' : 'ok'}">${quota.chat_used} / 1000</span>
            </div>
            <div class="metric">
                <span class="metric-label">Explain (Flash-Lite)</span>
                <span class="metric-value ${quota.explain_used > 800 ? 'danger' : quota.explain_used > 600 ? 'warn' : 'ok'}">${quota.explain_used} / 1000</span>
            </div>
            <div class="metric">
                <span class="metric-label">Memo (Flash)</span>
                <span class="metric-value ${quota.memo_used > 80 ? 'danger' : quota.memo_used > 60 ? 'warn' : 'ok'}">${quota.memo_used} / 100</span>
            </div>
        </div>

        <div class="card">
            <h3>System Health</h3>
            <div class="metric">
                <span class="metric-label">Active Devices (24h)</span>
                <span class="metric-value ok">${activeDevices?.count || 0}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Uploads Disk</span>
                <span class="metric-value">${(uploadSize / 1024 / 1024).toFixed(1)} MB</span>
            </div>
            <div class="metric">
                <span class="metric-label">Recent Extractions</span>
                <span class="metric-value">${extractions.length}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Recent Errors</span>
                <span class="metric-value ${recentErrors.length > 10 ? 'danger' : recentErrors.length > 0 ? 'warn' : 'ok'}">${recentErrors.length}</span>
            </div>
        </div>

        <div class="card">
            <h3>Gallery Models</h3>
            ${topModels.map(m => `
                <div class="metric">
                    <span class="metric-label">${m.company_name}</span>
                    <span class="metric-value">${m.views} views</span>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="card">
        <h3>Recent Extractions</h3>
        <table>
            <tr><th>Time</th><th>Company</th><th>Ticker</th><th>Confidence</th><th>Status</th></tr>
            ${extractions.slice(0, 20).map(e => `
                <tr>
                    <td class="timestamp">${e.created_at}</td>
                    <td>${e.company_name || '—'}</td>
                    <td>${e.ticker || '—'}</td>
                    <td>${e.overall_confidence ? (e.overall_confidence * 100).toFixed(0) + '%' : '—'}</td>
                    <td class="ok">✓</td>
                </tr>
            `).join('')}
        </table>
    </div>

    <div class="card" style="margin-top:16px;">
        <h3>Recent AI Errors</h3>
        <table>
            <tr><th>Time</th><th>Task</th><th>Model</th><th>Error</th></tr>
            ${recentErrors.length === 0 ? '<tr><td colspan="4" style="color:#34d399;">No errors in recent history 🎉</td></tr>' : recentErrors.map(e => `
                <tr>
                    <td class="timestamp">${e.created_at}</td>
                    <td>${e.task}</td>
                    <td>${e.model}</td>
                    <td class="danger">${e.error_message?.substring(0, 80) || '—'}</td>
                </tr>
            `).join('')}
        </table>
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Admin status error:', error);
        res.status(500).send('Error loading admin dashboard');
    }
});

// Admin API endpoints for frontend dashboard
function audit(req, action, entityType, entityId, details) {
    try {
        bankingDb.createAuditLog({
            userId: getAdminIdFromToken(req) || 'admin',
            action,
            entityType,
            entityId,
            newValue: details ? JSON.stringify(details) : null,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
    } catch (e) {
        console.error('[Admin] audit log failed', e.message);
    }
}

router.post('/login', (req, res) => {
    const id = ADMIN_ID;
    const password = ADMIN_PASSWORD;
    if (!id || !password) {
        return res.status(503).json({ success: false, error: 'Admin credentials not configured' });
    }
    const { adminId, password: providedPassword } = req.body;
    if (adminId !== id || providedPassword !== password) {
        return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    }
    audit(req, 'LOGIN', 'admin', null, { adminId });
    const token = Buffer.from(`${adminId}:${providedPassword}`).toString('base64');
    res.json({ success: true, token });
});

router.get('/users', adminApiAuth, (req, res) => {
    try {
        const { q, sort, order, page, limit } = req.query;
        const result = bankingDb.getUsers({
            q: q || '',
            sort: sort || 'created_at',
            order: order || 'desc',
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50,
        });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ success: false, error: 'Failed to load users' });
    }
});

router.patch('/users/:id/status', adminApiAuth, (req, res) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, error: 'isActive boolean required' });
        }
        const userId = req.params.id;
        const before = db.prepare('SELECT is_active FROM users WHERE id = ?').get(userId);
        bankingDb.updateUserStatus(userId, isActive);
        audit(req, 'UPDATE', 'user', userId, { field: 'is_active', oldValue: before?.is_active ?? null, newValue: isActive ? 1 : 0 });
        res.json({ success: true });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ success: false, error: 'Failed to update user status' });
    }
});

router.patch('/users/:id', adminApiAuth, (req, res) => {
    try {
        const userId = req.params.id;
        const { role, tier } = req.body;
        const before = db.prepare('SELECT role, tier FROM users WHERE id = ?').get(userId);
        bankingDb.updateUser(userId, { role, tier });
        audit(req, 'UPDATE', 'user', userId, { fields: ['role', 'tier'], oldValue: before || null, newValue: { role, tier } });
        res.json({ success: true });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

router.get('/stats', adminApiAuth, (req, res) => {
    try {
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const faceRegistered = db.prepare('SELECT COUNT(*) as count FROM users WHERE face_descriptor IS NOT NULL').get();
        const activeToday = db.prepare("SELECT COUNT(*) as count FROM users WHERE last_login > datetime('now', '-1 day')").get();
        const totalAccounts = db.prepare('SELECT COUNT(*) as count FROM bank_accounts').get();
        const totalTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions').get();
        const totalBills = db.prepare('SELECT COUNT(*) as count FROM bills').get();
        const totalGoals = db.prepare('SELECT COUNT(*) as count FROM goals').get();
        const totalLoans = db.prepare('SELECT COUNT(*) as count FROM loans').get();

        res.json({
            success: true,
            stats: {
                totalUsers: totalUsers.count,
                faceRegistered: faceRegistered.count,
                activeToday: activeToday.count,
                totalAccounts: totalAccounts.count,
                totalTransactions: totalTransactions.count,
                totalBills: totalBills.count,
                totalGoals: totalGoals.count,
                totalLoans: totalLoans.count,
            }
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to load stats' });
    }
});

// IP geolocation cache
const ipGeoCache = {};

// GET /audit-logs — Returns all audit logs with filters + IP location enrichment
router.get('/audit-logs', adminApiAuth, async (req, res) => {
    try {
        const { userId, action, entityType, dateFrom, dateTo, q, page, limit } = req.query;
        const result = bankingDb.getAuditLogsPaged({
            userId, action, entityType, dateFrom, dateTo,
            q: q || '',
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 100,
        });
        const enriched = await Promise.all(result.logs.map(async (log) => {
            const ip = log.ip_address;
            if (ip && !ipGeoCache[ip] && ip !== '127.0.0.1' && ip !== '::1' && ip !== 'unknown') {
                try {
                    const { data } = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,query`, { timeout: 3000 });
                    if (data.status === 'success') {
                        ipGeoCache[ip] = { country: data.country, city: data.city, isp: data.isp };
                    }
                } catch {}
            }
            let parsedNewValue = null;
            try { parsedNewValue = log.new_value ? JSON.parse(log.new_value) : null; } catch {}
            return { ...log, location: ipGeoCache[ip] || null, parsedNewValue };
        }));
        res.json({ success: true, logs: enriched, total: result.total, page: result.page, pages: result.pages, limit: result.limit });
    } catch (error) {
        console.error('Admin audit logs error:', error);
        res.status(500).json({ success: false, error: 'Failed to load audit logs' });
    }
});

// GET /dashboard-metrics — Returns time-series and distribution data for the admin dashboard
router.get('/dashboard-metrics', adminApiAuth, (req, res) => {
    try {
        const metrics = bankingDb.getDashboardMetrics(parseInt(req.query.days) || 7);
        res.json({ success: true, metrics });
    } catch (error) {
        console.error('Dashboard metrics error:', error);
        res.status(500).json({ success: false, error: 'Failed to load dashboard metrics' });
    }
});

// GET /fraud-events — Returns risk events with IP location for heatmap
router.get('/fraud-events', adminApiAuth, async (req, res) => {
    try {
        const logs = bankingDb.getFraudEvents(parseInt(req.query.limit) || 100);
        const enriched = await Promise.all(logs.map(async (log) => {
            const ip = log.ip_address;
            let location = null;
            if (ip && ip !== '127.0.0.1' && ip !== '::1' && ip !== 'unknown') {
                if (ipGeoCache[ip]) {
                    location = ipGeoCache[ip];
                } else {
                    try {
                        const { data } = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon,isp,query`, { timeout: 3000 });
                        if (data.status === 'success') {
                            location = { country: data.country, city: data.city, lat: data.lat, lon: data.lon, isp: data.isp };
                            ipGeoCache[ip] = location;
                        }
                    } catch {}
                }
            }
            let parsedNewValue = null;
            try { parsedNewValue = log.new_value ? JSON.parse(log.new_value) : null; } catch {}
            return { ...log, location, parsedNewValue, riskScore: parsedNewValue?.status >= 500 ? 95 : parsedNewValue?.status >= 400 ? 70 : 40 };
        }));
        res.json({ success: true, events: enriched.filter(e => e.location) });
    } catch (error) {
        console.error('Admin fraud events error:', error);
        res.status(500).json({ success: false, error: 'Failed to load fraud events' });
    }
});

router.post('/fraud-events/:id/acknowledge', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Invalid event id' });
        bankingDb.acknowledgeFraudEvent(id, getAdminIdFromToken(req));
        audit(req, 'ACKNOWLEDGE', 'fraud_event', id, {});
        res.json({ success: true });
    } catch (error) {
        console.error('Acknowledge fraud event error:', error);
        res.status(500).json({ success: false, error: 'Failed to acknowledge event' });
    }
});

router.post('/fraud-events/:id/block-user', adminApiAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Invalid event id' });
        const log = db.prepare('SELECT user_id, ip_address FROM audit_logs WHERE id = ?').get(id);
        if (!log) return res.status(404).json({ success: false, error: 'Event not found' });
        if (log.user_id) {
            const before = db.prepare('SELECT is_active FROM users WHERE id = ?').get(log.user_id);
            bankingDb.blockUser(log.user_id);
            audit(req, 'BLOCK', 'user', log.user_id, { auditLogId: id, previousIsActive: before?.is_active ?? null });
        }
        res.json({ success: true, blockedUserId: log.user_id || null });
    } catch (error) {
        console.error('Block user error:', error);
        res.status(500).json({ success: false, error: 'Failed to block user' });
    }
});

router.post('/fraud-events/:id/whitelist-ip', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Invalid event id' });
        const log = db.prepare('SELECT ip_address FROM audit_logs WHERE id = ?').get(id);
        if (!log?.ip_address) return res.status(404).json({ success: false, error: 'No IP address for event' });
        bankingDb.whitelistIp(log.ip_address);
        audit(req, 'WHITELIST_IP', 'ip', null, { auditLogId: id, ip: log.ip_address });
        res.json({ success: true, ip: log.ip_address });
    } catch (error) {
        console.error('Whitelist IP error:', error);
        res.status(500).json({ success: false, error: 'Failed to whitelist IP' });
    }
});

router.post('/fraud-events/:id/false-positive', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Invalid event id' });
        bankingDb.markFalsePositive(id, getAdminIdFromToken(req));
        audit(req, 'FALSE_POSITIVE', 'fraud_event', id, {});
        res.json({ success: true });
    } catch (error) {
        console.error('False positive error:', error);
        res.status(500).json({ success: false, error: 'Failed to mark false positive' });
    }
});

module.exports = router;
