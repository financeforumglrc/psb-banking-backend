/**
 * PDF Extraction Routes for dsFinancial Phase 2 v2
 * POST /api/v1/extract/pdf — Extract financials from annual report PDF
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { callAI } = require('../services/ai-provider');
const { extractionDb, quotaDb, deviceDb } = require('../services/database');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const deviceDir = path.join(uploadDir, req.deviceId || 'anonymous');
        if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
        cb(null, deviceDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.pdf`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are allowed'));
    },
});

const EXTRACTION_PROMPT = `You are a financial data extraction engine. You will receive an annual report or 10-K filing as a PDF.

Extract the consolidated Income Statement, Balance Sheet, and Cash Flow Statement for the last 3 reported fiscal years.

Return STRICT JSON matching the schema below. No preamble. No markdown fences. JSON only.

{
  "company": {
    "name": "string",
    "ticker": "string or null",
    "currency": "INR|USD|EUR|GBP",
    "fiscal_year_end": "string (e.g. 'March 31')",
    "accounting_standard": "IND_AS|IFRS|US_GAAP"
  },
  "statements": {
    "income_statement": {
      "FY24": [
        {"label": "Revenue from operations", "value": 902064, "unit": "INR_CR", "source_page": 142, "confidence": 0.98}
      ],
      "FY23": [],
      "FY22": []
    },
    "balance_sheet": {},
    "cash_flow": {}
  },
  "overall_confidence": 0.0,
  "warnings": []
}

ABSOLUTE RULES:
1. NEVER fabricate numbers. If unclear, set value to null and add a warning.
2. NEVER estimate or interpolate.
3. Prefer Consolidated over Standalone statements.
4. Use the unit the company reports in (typically INR_CR for Indian filings, USD_MN for US).
5. source_page is 1-indexed.
6. Preserve the company's wording in label, but be consistent within the response.
7. Lower confidence (< 0.9) for any value where page layout was complex or OCR-ish ambiguity.`;

function getDeviceId(req) {
    return req.headers['x-device-id'] || req.body?.deviceId || 'anonymous';
}

function parseByokHeader(req) {
    const header = req.headers['x-byok-key'];
    if (!header) return null;
    const [provider, ...rest] = header.split(':');
    if (!provider || rest.length === 0) return null;
    return { provider, key: rest.join(':') };
}

/**
 * @route   POST /api/v1/extract/pdf
 * @desc    Extract financial statements from uploaded PDF
 * @access  Public (device-id rate limited)
 */
router.post('/pdf', upload.single('pdf'), async (req, res) => {
    const deviceId = getDeviceId(req);
    const byok = parseByokHeader(req);

    try {
        // Check device quota
        const device = deviceDb.getOrCreate(deviceId);
        if (device.extract_count_today >= 2) {
            return res.status(429).json({
                success: false,
                error: 'Daily PDF extraction limit reached (2/day). Add your own API key in Settings for unlimited use.',
                code: 'DEVICE_LIMIT_EXCEEDED',
            });
        }

        // Check server quota
        const serverQuota = quotaDb.getOrCreateToday();
        const serverTotal = serverQuota.extract_used + serverQuota.chat_used + serverQuota.explain_used + serverQuota.memo_used;
        if (!byok && serverQuota.extract_used >= 200) {
            return res.status(429).json({
                success: false,
                error: 'Shared AI quota is exhausted for today. Add your own free Gemini key in Settings for unlimited use.',
                code: 'SERVER_QUOTA_EXHAUSTED',
            });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded', code: 'FILE_MISSING' });
        }

        // Compute hash
        const pdfBuffer = fs.readFileSync(req.file.path);
        const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

        // Check cache
        const cached = extractionDb.findByHash(pdfHash);
        if (cached) {
            deviceDb.increment(deviceId, 'extract');
            return res.json({
                success: true,
                cached: true,
                data: JSON.parse(cached.result_json),
            });
        }

        // Call AI
        const result = await callAI('extract', {
            pdfBuffer,
            prompt: EXTRACTION_PROMPT,
            deviceId,
            byok,
        });

        // Save to DB
        extractionDb.create({
            deviceId,
            pdfHash,
            storagePath: req.file.path,
            filename: req.file.originalname,
            sizeBytes: req.file.size,
            companyName: result.json?.company?.name || null,
            ticker: result.json?.company?.ticker || null,
            resultJson: JSON.stringify(result.json),
            confidence: result.json?.overall_confidence || 0,
        });

        deviceDb.increment(deviceId, 'extract');
        quotaDb.increment('extract');

        res.json({
            success: true,
            cached: false,
            extraction_id: pdfHash,
            data: result.json,
            usage: result.usage,
        });
    } catch (error) {
        console.error('PDF extraction error:', error);
        const isUnsupportedImage = error.message && (
            error.message.includes('does not support image input') ||
            error.message.includes('only supports PDF')
        );
        res.status(500).json({
            success: false,
            error: isUnsupportedImage
                ? 'This AI model only supports PDF files. Please upload a valid PDF document.'
                : 'Extraction failed',
            code: 'EXTRACTION_ERROR',
        });
    }
});

module.exports = router;
