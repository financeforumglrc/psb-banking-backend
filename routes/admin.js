/**
 * Admin Status Page for dsFinancial Phase 3
 * GET /admin/status — observability dashboard
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { quotaDb, db } = require('../services/database');
const router = express.Router();

const ADMIN_ID = 'TEAM EXCELLENT MINDS';
const ADMIN_PASSWORD = '123456@#Dd';

function basicAuth(req, res, next) {
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

// JWT-based admin auth for frontend API calls
function adminApiAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Admin token required' });
    }
    const token = auth.substring(7);
    // Simple token check: base64 of ADMIN_ID:ADMIN_PASSWORD
    const expected = Buffer.from(`${ADMIN_ID}:${ADMIN_PASSWORD}`).toString('base64');
    if (token !== expected) {
        return res.status(401).json({ success: false, error: 'Invalid admin token' });
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
router.post('/login', (req, res) => {
    const { adminId, password } = req.body;
    console.log('[ADMIN LOGIN] Received:', { adminId, passwordReceived: !!password, expectedId: ADMIN_ID, expectedPw: ADMIN_PASSWORD });
    if (adminId !== ADMIN_ID || password !== ADMIN_PASSWORD) {
        console.log('[ADMIN LOGIN] FAILED — mismatch');
        return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    }
    const token = Buffer.from(`${ADMIN_ID}:${ADMIN_PASSWORD}`).toString('base64');
    console.log('[ADMIN LOGIN] SUCCESS');
    res.json({ success: true, token });
});

router.get('/users', adminApiAuth, (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, email, name, phone, role, tier, pan_number, aadhar, 
                   created_at, last_login, face_descriptor IS NOT NULL as face_registered,
                   api_usage_total, is_active
            FROM users
            ORDER BY created_at DESC
        `).all();
        res.json({ success: true, users });
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ success: false, error: 'Failed to load users' });
    }
});

router.get('/stats', adminApiAuth, (req, res) => {
    try {
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const faceRegistered = db.prepare('SELECT COUNT(*) as count FROM users WHERE face_descriptor IS NOT NULL').get();
        const activeToday = db.prepare("SELECT COUNT(*) as count FROM users WHERE last_login > datetime('now', '-1 day')").get();
        const totalAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
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

module.exports = router;
