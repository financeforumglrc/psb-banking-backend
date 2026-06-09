/**
 * GST API Routes - Patent-Protected Endpoints
 * PATENTS: #1, #2, #3, #5, #6
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Import patent algorithms
const GSTINValidatorPro = require('../algorithms/gstinValidator');
const ITCRiskScanner = require('../algorithms/itcRiskScanner');
const TaxRateErrorDetector = require('../algorithms/taxRateErrorDetector');
const MissingITCRecovery = require('../algorithms/missingITCRecovery');
const ShellCompanyDetector = require('../algorithms/shellCompanyDetector');

// Initialize validators (GSTINValidatorPro is an object, not a class)
const gstinValidator = GSTINValidatorPro;

/**
 * @route   POST /api/v1/gst/validate-gstin
 * @desc    Validate GSTIN with comprehensive risk analysis
 * @patent  PATENT #1: GSTIN Risk Intelligence Validator
 * @access  Private
 */
const MAX_ARRAY_LENGTH = 10000;

function validateArrayLength(arr, fieldName) {
    if (!Array.isArray(arr)) return { valid: false, error: `${fieldName} must be an array` };
    if (arr.length > MAX_ARRAY_LENGTH) return { valid: false, error: `${fieldName} exceeds maximum limit of ${MAX_ARRAY_LENGTH} items` };
    return { valid: true };
}

router.post('/validate-gstin', (req, res) => {
    try {
        const { gstin, context } = req.body;

        if (!gstin) {
            return res.status(400).json({
                success: false,
                error: 'GSTIN is required',
                code: 'GSTIN_MISSING'
            });
        }

        // Validate GSTIN format
        const formatRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
        if (!formatRegex.test(gstin.toUpperCase())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid GSTIN format. Must be 15 alphanumeric characters.',
                code: 'GSTIN_FORMAT_INVALID'
            });
        }

        // Run comprehensive validation
        const result = gstinValidator.validateComprehensive(gstin.toUpperCase().trim());

        // Add API metadata
        result.api_version = '2.0';
        result.patent = 'PAT-001';
        result.processed_at = new Date().toISOString();
        result.request_id = `GST-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

        // Log usage for analytics
        console.log(`[PAT-001] GSTIN validated: ${gstin.substring(0, 2)}****${gstin.substring(12)}, Risk: ${result.riskLevel}`);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('GSTIN validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Validation processing error',
            code: 'VALIDATION_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/gst/analyze-itc-risk
 * @desc    Analyze Input Tax Credit risks from purchase data
 * @patent  PATENT #2: ITC Risk Scanner
 * @access  Private
 */
router.post('/analyze-itc-risk', (req, res) => {
    try {
        const { purchaseData, gstr2bData } = req.body;

        const purchaseCheck = validateArrayLength(purchaseData, 'purchaseData');
        if (!purchaseCheck.valid) {
            return res.status(400).json({
                success: false,
                error: purchaseCheck.error,
                code: 'DATA_MISSING'
            });
        }
        const gstr2bCheck = validateArrayLength(gstr2bData || [], 'gstr2bData');
        if (!gstr2bCheck.valid) {
            return res.status(400).json({
                success: false,
                error: gstr2bCheck.error,
                code: 'DATA_INVALID'
            });
        }

        // Run ITC risk analysis
        const results = ITCRiskScanner.analyzeITCRisks(purchaseData, gstr2bData || []);

        res.json({
            success: true,
            patent: 'PAT-002',
            data: results
        });
    } catch (error) {
        console.error('ITC risk analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'ITC analysis processing error',
            code: 'ANALYSIS_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/gst/detect-shell-companies
 * @desc    Detect shell company indicators in supplier data
 * @patent  PATENT #3: Shell Company Detector
 * @access  Private
 */
router.post('/detect-shell-companies', (req, res) => {
    try {
        const { invoiceData } = req.body;

        const check = validateArrayLength(invoiceData, 'invoiceData');
        if (!check.valid) {
            return res.status(400).json({
                success: false,
                error: check.error,
                code: 'DATA_MISSING'
            });
        }

        // Run shell company detection
        const results = ShellCompanyDetector.analyzeSuppliers(invoiceData);

        res.json({
            success: true,
            patent: 'PAT-003',
            data: results
        });
    } catch (error) {
        console.error('Shell company detection error:', error);
        res.status(500).json({
            success: false,
            error: 'Detection processing error',
            code: 'DETECTION_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/gst/verify-rates
 * @desc    Verify GST rates against HSN database
 * @patent  PATENT #5: Tax Rate Error Detector
 * @access  Private
 */
router.post('/verify-rates', (req, res) => {
    try {
        const { invoices } = req.body;

        const check = validateArrayLength(invoices, 'invoices');
        if (!check.valid) {
            return res.status(400).json({
                success: false,
                error: check.error,
                code: 'DATA_MISSING'
            });
        }

        // Run rate verification
        const results = TaxRateErrorDetector.analyzeRates(invoices);

        res.json({
            success: true,
            patent: 'PAT-005',
            data: results
        });
    } catch (error) {
        console.error('Rate verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Rate verification error',
            code: 'VERIFICATION_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/gst/predict-itc-recovery
 * @desc    Predict ITC recovery potential from missing invoices
 * @patent  PATENT #6: Missing ITC Recovery Predictor
 * @access  Private
 */
router.post('/predict-itc-recovery', (req, res) => {
    try {
        const { purchaseData, gstr2bData } = req.body;

        const purchaseCheck = validateArrayLength(purchaseData, 'purchaseData');
        if (!purchaseCheck.valid) {
            return res.status(400).json({
                success: false,
                error: purchaseCheck.error,
                code: 'DATA_MISSING'
            });
        }
        const gstr2bCheck = validateArrayLength(gstr2bData || [], 'gstr2bData');
        if (!gstr2bCheck.valid) {
            return res.status(400).json({
                success: false,
                error: gstr2bCheck.error,
                code: 'DATA_INVALID'
            });
        }

        // Run recovery prediction
        const results = MissingITCRecovery.analyzeMissingITC(purchaseData, gstr2bData || []);

        res.json({
            success: true,
            patent: 'PAT-006',
            data: results
        });
    } catch (error) {
        console.error('ITC recovery prediction error:', error);
        res.status(500).json({
            success: false,
            error: 'Recovery prediction error',
            code: 'PREDICTION_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/gst/comprehensive-analysis
 * @desc    Run all GST analyses in one call
 * @patent  Combined: PAT-001, PAT-002, PAT-003, PAT-005, PAT-006
 * @access  Private (Premium)
 */
router.post('/comprehensive-analysis', (req, res) => {
    try {
        const { gstin, purchaseData, invoices } = req.body;

        if (purchaseData) {
            const check = validateArrayLength(purchaseData, 'purchaseData');
            if (!check.valid) {
                return res.status(400).json({
                    success: false,
                    error: check.error,
                    code: 'DATA_INVALID'
                });
            }
        }
        if (invoices) {
            const check = validateArrayLength(invoices, 'invoices');
            if (!check.valid) {
                return res.status(400).json({
                    success: false,
                    error: check.error,
                    code: 'DATA_INVALID'
                });
            }
        }

        const results = {
            api_version: '2.0',
            processed_at: new Date().toISOString(),
            request_id: `COMP-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
            analyses: {}
        };

        // GSTIN Validation
        if (gstin) {
            results.analyses.gstinValidation = gstinValidator.validateComprehensive(gstin.toUpperCase().trim());
        }

        // ITC Risk Analysis
        if (purchaseData) {
            results.analyses.itcRisk = ITCRiskScanner.analyzeITCRisks(purchaseData, []);
        }

        // Shell Company Detection
        if (purchaseData) {
            results.analyses.shellCompanies = ShellCompanyDetector.analyzeSuppliers(purchaseData);
        }

        // Rate Verification
        if (invoices) {
            results.analyses.rateVerification = TaxRateErrorDetector.analyzeRates(invoices);
        }

        // ITC Recovery
        if (purchaseData) {
            results.analyses.itcRecovery = MissingITCRecovery.analyzeMissingITC(purchaseData, []);
        }

        // Calculate overall compliance score
        let overallScore = 100;
        if (results.analyses.itcRisk) {
            const riskRatio = results.analyses.itcRisk.summary.atRiskITC / (results.analyses.itcRisk.summary.totalITC || 1);
            overallScore -= riskRatio * 30;
        }
        if (results.analyses.shellCompanies) {
            const shellRatio = results.analyses.shellCompanies.summary.highRisk / (results.analyses.shellCompanies.summary.totalSuppliers || 1);
            overallScore -= shellRatio * 25;
        }
        results.overallComplianceScore = Math.max(0, Math.round(overallScore));

        res.json({
            success: true,
            patents: ['PAT-001', 'PAT-002', 'PAT-003', 'PAT-005', 'PAT-006'],
            data: results
        });
    } catch (error) {
        console.error('Comprehensive analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'Comprehensive analysis error',
            code: 'ANALYSIS_ERROR'
        });
    }
});

module.exports = router;
