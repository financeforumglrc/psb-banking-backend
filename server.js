/**
 * DS Financial Solutions - Backend Server
 * Patent-Protected API Platform
 * Version: 2.0.0
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
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
const chartRoutes = require('./routes/charts');
const marketDataRoutes = require('./routes/market-data');
const scenarioRoutes = require('./routes/scenarios');
const nlpQueryRoutes = require('./routes/nlp-query');
const screenerRoutes  = require('./routes/screener');
const bankingRoutes = require('./routes/banking');
const kycRoutes = require('./routes/kyc');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware, requireRole } = require('./middleware/auth');

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
const PORT = process.env.PORT || 5000;

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

app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://dsfinancial.in', 'https://www.dsfinancial.in', 'https://dsfinancial-47556.surge.sh', 'https://psb-securewealth-2026-new.surge.sh'] 
        : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5500', 'https://dsfinancial-47556.surge.sh', 'https://psb-securewealth-2026-new.surge.sh'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-BYOK-Key', 'X-Device-Id', 'X-Dev-User-Email']
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
app.use(limiter);

// Stricter rate limiting for AI endpoints
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'AI request limit exceeded. Please try again in a minute.'
    }
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

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
app.get('/tab_:name.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', `tab_${req.params.name}.js`));
});
app.get('/extracted_functions.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'extracted_functions.js'));
});

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
    res.json({
        success: true,
        message: 'DS Financial API is running',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
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
// Phase 2 v2: AI routes are public (portfolio mode, device-id based)
app.use('/api/v1/ai', aiLimiter, aiRoutes);
app.use('/api/v1/extract', aiLimiter, extractRoutes);
app.use('/api/v1/gallery', galleryRoutes);
app.use('/api/v1/export', exportRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/documents', authMiddleware, documentRoutes);
app.use('/api/v1/analytics', authMiddleware, requireRole('admin'), analyticsRoutes);
app.use('/api/v1/financial-model', authMiddleware, financialModelRoutes);
// Phase 4: World-class features
app.use('/api/v1/charts', chartRoutes);
app.use('/api/v1/market', marketDataRoutes);
app.use('/api/v1/scenarios', scenarioRoutes);
app.use('/api/v1/query', nlpQueryRoutes);
app.use('/api/v1/screener', screenerRoutes);
app.use('/api/v1/banking', bankingRoutes);
app.use('/api/v1/kyc', authMiddleware, kycRoutes);

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
    app.listen(PORT, () => {
        logger.info(`DS Financial API Server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
        logger.info(`Patent Portfolio: 47 innovations ready`);
    });
}

module.exports = app;
