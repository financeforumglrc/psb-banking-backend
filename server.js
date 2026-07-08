/**
 * DS Financial Solutions - Backend Server
 * Patent-Protected API Platform
 * Version: 2.0.0
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const winston = require('winston');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const taxRoutes = require('./routes/tax');
const gstRoutes = require('./routes/gst');
const aiRoutes = require('./routes/ai');
const documentRoutes = require('./routes/documents');
const financialModelRoutes = require('./routes/financial-model');
const analyticsRoutes = require('./routes/analytics');
const extractRoutes = require('./routes/extract');
const galleryRoutes = require('./routes/gallery');
const exportRoutes = require('./routes/export');
const adminRoutes = require('./routes/admin');
const fraudRoutes = require('./routes/fraud');
const chartRoutes = require('./routes/charts');
const marketDataRoutes = require('./routes/market-data');
const realDataRoutes = require('./routes/realData');
const scenarioRoutes = require('./routes/scenarios');
const nlpQueryRoutes = require('./routes/nlp-query');
const screenerRoutes  = require('./routes/screener');
const bankingRoutes = require('./routes/banking');
const businessRoutes = require('./routes/business');
const kycRoutes = require('./routes/kyc');
const msmeRoutes = require('./routes/msme');
const { seedAll } = require('./scripts/seedDemoData');
const { seedComprehensiveDemo } = require('./scripts/seedComprehensiveDemo');
const { db, dbPath } = require('./services/database');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware, requireRole, validateSecurityConfig } = require('./middleware/auth');
const { auditMiddleware } = require('./middleware/auditLogger');

// Initialize logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

// Initialize Express app
const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Validate security-critical configuration before accepting traffic
validateSecurityConfig();

// Default no-op until server starts; banking.js fraud alerts call this safely
global.broadcastFraudAlert = () => {};

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.gst.gov.in", "https://openrouter.ai", "https://api.groq.com", "https://api-inference.huggingface.co", "https://api.anthropic.com", "https://generativelanguage.googleapis.com", "https://api.openai.com"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

const defaultOrigins = process.env.NODE_ENV === 'production'
    ? ['https://dsfinancial.in', 'https://www.dsfinancial.in', 'https://dsfinancial-47556.surge.sh', 'https://psb-securewealth-2026-new.surge.sh', 'https://psb-securewealth-frontend.onrender.com']
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5500', 'https://dsfinancial-47556.surge.sh', 'https://psb-securewealth-2026-new.surge.sh', 'https://psb-securewealth-frontend.onrender.com'];
const corsOrigins = process.env.CORS_ORIGINS
    ? [...defaultOrigins, ...process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)]
    : defaultOrigins;

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: process.env.NODE_ENV === 'production'
        ? ['Content-Type', 'Authorization', 'X-API-Key', 'X-BYOK-Key', 'X-Device-Id']
        : ['Content-Type', 'Authorization', 'X-API-Key', 'X-BYOK-Key', 'X-Device-Id', 'X-Dev-User-Email']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Stricter rate limiting for AI endpoints
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'AI request limit exceeded. Please try again in a minute.'
    }
});

// Per-route limiters for compute-heavy or external-data endpoints
const chartLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { success: false, error: 'Chart request limit exceeded' } });
const scenarioLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { success: false, error: 'Scenario request limit exceeded' } });
const nlpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { success: false, error: 'NLP query limit exceeded' } });
const marketLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { success: false, error: 'Market data request limit exceeded' } });

app.use(limiter);
app.use('/api/v1/charts', chartLimiter);
app.use('/api/v1/scenarios', scenarioLimiter);
app.use('/api/v1/query', nlpLimiter);
app.use('/api/v1/market', marketLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Audit logging: captures all authenticated mutations/views
app.use(auditMiddleware);

// Request logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Lightweight keep-alive ping endpoint for Render free tier
app.get('/ping', (_, res) => res.json({ ok: true, ts: Date.now(), uptime: process.uptime() }));

// Frontend routes - serve HTML directly
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send('<html><body><h1>DS Financial API</h1><p>API is running. Open api-demo.html directly in browser.</p></body></html>');
});

app.get('/demo', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send('<html><body><h1>API Demo</h1><p>Please open api-demo.html directly in your browser.</p></body></html>');
});

app.get('/financial-modelling', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'financial-modelling.html'));
});

app.get('/financial-modelling-v2', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'financial-modelling-v2.html'));
});

// Serve any .js tab module requested directly (tab_screener.js etc.)
// SECURITY: Whitelist known tab names to prevent path traversal attacks
const ALLOWED_TAB_NAMES = new Set([
    'screener', 'dcf', 'footballfield', 'lbo', 'ma', 'modelgrid',
    'ratios', 'sensitivity', 'summary', 'wacc', 'comps'
]);
app.get('/tab_:name.js', (req, res) => {
    const name = req.params.name;
    if (!ALLOWED_TAB_NAMES.has(name)) {
        return res.status(404).json({ success: false, error: 'Tab not found' });
    }
    const filePath = path.resolve(path.join(__dirname, '..', `tab_${name}.js`));
    // Verify resolved path stays within parent directory
    const parentDir = path.resolve(path.join(__dirname, '..'));
    if (!filePath.startsWith(parentDir + path.sep) && filePath !== parentDir) {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }
    res.sendFile(filePath);
});
app.get('/extracted_functions.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'extracted_functions.js'));
});

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
    const count = (table) => { try { return db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c; } catch { return -1; } };
    const userCount = count('users');
    const accountCount = count('bank_accounts');
    const txnCount = count('transactions');
    const instrumentCount = count('market_instruments');
    const priceCount = count('market_prices');
    const rbiMacroCount = count('rbi_macro_data');
    const forexCount = count('forex_rates');
    const datasetCount = count('external_datasets');
    res.json({
        success: true,
        message: 'DS Financial API is running',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        dbPath: dbPath,
        userCount,
        accountCount,
        txnCount,
        realData: {
            instruments: instrumentCount,
            prices: priceCount,
            rbiMacro: rbiMacroCount,
            forex: forexCount,
            externalDatasets: datasetCount
        },
        patents: {
            total: 47,
            phase1: 7,
            phase2: 12,
            phase3: 18,
            phase4: 10
        }
    });
});

// Auth rate limiter (stricter than general limiter)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// API routes (Phase 2 v2 + Phase 3 + Phase 4)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tax', authMiddleware, taxRoutes);
app.use('/api/v1/gst', authMiddleware, gstRoutes);
// Phase 2 v2: AI routes require authentication (BYOK still supported via header)
app.use('/api/v1/ai', aiLimiter, authMiddleware, aiRoutes);
app.use('/api/v1/extract', aiLimiter, authMiddleware, extractRoutes);
app.use('/api/v1/gallery', galleryRoutes);
app.use('/api/v1/export', authMiddleware, exportRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/fraud', fraudRoutes);
app.use('/api/v1/documents', authMiddleware, documentRoutes);
app.use('/api/v1/analytics', authMiddleware, requireRole('admin'), analyticsRoutes);
app.use('/api/v1/financial-model', authMiddleware, financialModelRoutes);
// Phase 4: World-class features
app.use('/api/v1/charts', chartRoutes);
app.use('/api/v1/market', marketDataRoutes);
app.use('/api/v1/real-data', realDataRoutes);
app.use('/api/v1/scenarios', scenarioRoutes);
app.use('/api/v1/query', nlpQueryRoutes);
app.use('/api/v1/screener', screenerRoutes);
app.use('/api/v1/banking', authMiddleware, bankingRoutes);
app.use('/api/v1/business', businessRoutes);
app.use('/api/v1/kyc', authMiddleware, kycRoutes);
app.use('/api/v1/msme', authMiddleware, msmeRoutes);

// Patent information endpoint
app.get('/api/v1/patents', (req, res) => {
    res.json({
        success: true,
        data: {
            portfolio: [
                {
                    id: 'PAT-001',
                    title: 'GSTIN Risk Intelligence Validator',
                    status: 'provisional_filed',
                    priority: 'critical',
                    file: 'gst-black-mirror-enhanced.js'
                },
                {
                    id: 'PAT-002',
                    title: 'ITC Risk Scanner',
                    status: 'provisional_filed',
                    priority: 'critical',
                    file: 'gst-black-mirror-enhanced.js'
                },
                {
                    id: 'PAT-003',
                    title: 'Shell Company Detector',
                    status: 'provisional_filed',
                    priority: 'high',
                    file: 'gst-black-mirror-enhanced.js'
                },
                {
                    id: 'PAT-004',
                    title: 'Multi-Regime Tax Optimizer',
                    status: 'provisional_filed',
                    priority: 'critical',
                    file: 'smart-tax-optimizer.js'
                },
                {
                    id: 'PAT-005',
                    title: 'Tax Rate Error Detector',
                    status: 'provisional_filed',
                    priority: 'high',
                    file: 'gst-black-mirror-enhanced.js'
                },
                {
                    id: 'PAT-006',
                    title: 'Missing ITC Recovery Predictor',
                    status: 'provisional_filed',
                    priority: 'high',
                    file: 'gst-black-mirror-enhanced.js'
                },
                {
                    id: 'PAT-007',
                    title: 'Multi-Provider AI Orchestrator',
                    status: 'provisional_filed',
                    priority: 'medium-high',
                    file: 'ai-engine.js'
                }
            ]
        }
    });
});

// Static file serving - ONLY serve from public directory, never parent dirs
app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: ['index.html', 'api-demo.html']
}));

// Serve the built React SPA in production / container deployments
const spaDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(spaDist, { index: false }));
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    if (req.headers.accept && !req.headers.accept.includes('text/html')) return next();
    const indexPath = path.join(spaDist, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    next();
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Global error handler
app.use(errorHandler);

// Start server only when run directly (not when imported by tests)
if (require.main === module) {
    // WebSocket alert server for real-time fraud notifications
    const wss = new WebSocket.Server({ server: httpServer, path: '/ws/alerts' });

    global.broadcastFraudAlert = (alert) => {
        const payload = JSON.stringify({ type: 'FRAUD_ALERT', data: alert, ts: Date.now() });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        });
    };

    wss.on('connection', (ws, req) => {
        try {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const token = url.searchParams.get('token');
            if (!token) {
                ws.close(1008, 'Missing token');
                return;
            }
            const secret = process.env.JWT_SECRET;
            if (!secret) {
                ws.close(1011, 'Server JWT secret not configured');
                return;
            }
            const decoded = jwt.verify(token, secret);
            if (decoded.role !== 'admin') {
                ws.close(1008, 'Admin role required');
                return;
            }
            ws.send(JSON.stringify({ type: 'CONNECTED', ts: Date.now() }));
        } catch {
            ws.close(1008, 'Invalid token');
        }
    });

    // Cleanup AI cache once a day
    setInterval(() => {
        try {
            require('./services/database').db.prepare(`DELETE FROM ai_cache WHERE created_at < datetime('now', '-24 hours')`).run();
        } catch (e) {
            console.error('[ai-cache] cleanup error:', e.message);
        }
    }, 24 * 60 * 60 * 1000);

    // Seed demo data in stages. Comprehensive personas first (needed for the
    // hackathon demo), then generic demo data. Errors are isolated so a seed
    // stage failure never prevents the API from accepting traffic.
    (async () => {
        try {
            const result = await seedComprehensiveDemo();
            logger.info(`[seed] comprehensive personas: ${result.seeded ? 'seeded' : (result.reason || 'skipped')}`);
        } catch (err) {
            logger.error('[seed] comprehensive personas failed:', err.message);
        }

        try {
            await seedAll();
            logger.info('[seed] generic demo data complete');
        } catch (err) {
            logger.error('[seed] generic demo data failed:', err.message);
        }
    })()
        .then(() => {
            httpServer.listen(PORT, () => {
                logger.info(`DS Financial API Server running on port ${PORT}`);
                logger.info(`Environment: ${process.env.NODE_ENV}`);
                logger.info(`Patent Portfolio: 47 innovations ready`);
                require('./scripts/keepAlive').start();
            });
        })
        .catch((err) => {
            logger.error('Server startup failed:', err);
            process.exit(1);
        });
}

module.exports = app;
