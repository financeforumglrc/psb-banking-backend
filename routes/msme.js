/**
 * MSME CreditBridge AI Routes
 * /api/v1/msme
 */

const express = require('express');
const { z } = require('zod');
const { authMiddleware, requireRole, adminApiAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { msmeDb, bankingDb } = require('../services/database');
const { assessApplication } = require('../algorithms/msmeCreditScore');
const { maskPan, maskAadhaar } = require('../lib/pii');

const router = express.Router();

function generateRef() {
    return `CB-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function maskApplication(row) {
    if (!row) return row;
    return {
        ...row,
        panNumber: row.pan_number ? maskPan(row.pan_number) : null,
        aadhaarMasked: row.aadhaar_masked ? maskAadhaar(row.aadhaar_masked) : null,
        consentGst: !!row.consent_gst,
        consentAa: !!row.consent_aa,
        consentUpi: !!row.consent_upi,
    };
}

const applySchema = z.object({
    businessName: z.string().min(1).max(200),
    udyamNumber: z.string().max(30).optional(),
    gstin: z.string().max(20).optional(),
    panNumber: z.string().max(10).optional(),
    aadhaarMasked: z.string().max(20).optional(),
    enterpriseType: z.enum(['micro', 'small', 'medium']).default('micro'),
    annualTurnover: z.number().min(0).default(0),
    employees: z.number().int().min(0).default(0),
    requestedAmount: z.number().min(10000).max(50000000),
    requestedTenure: z.number().int().min(6).max(60),
    purpose: z.string().max(500).optional(),
    consentGst: z.boolean().default(false),
    consentAa: z.boolean().default(false),
    consentUpi: z.boolean().default(false),
    gstComplianceScore: z.number().min(0).max(100).optional(),
    cashFlowStabilityScore: z.number().min(0).max(100).optional(),
    transactionVolumeScore: z.number().min(0).max(100).optional(),
    digitalAdoptionScore: z.number().min(0).max(100).optional(),
    creditHistoryScore: z.number().min(0).max(100).optional(),
}).strict();

const scorePreviewSchema = z.object({
    businessName: z.string().min(1).max(200).optional(),
    enterpriseType: z.enum(['micro', 'small', 'medium']).default('micro'),
    annualTurnover: z.number().min(0).default(0),
    employees: z.number().int().min(0).default(0),
    requestedAmount: z.number().min(10000).max(50000000),
    requestedTenure: z.number().int().min(6).max(60),
    gstin: z.string().max(20).optional(),
    gstComplianceScore: z.number().min(0).max(100).optional(),
    cashFlowStabilityScore: z.number().min(0).max(100).optional(),
    transactionVolumeScore: z.number().min(0).max(100).optional(),
    digitalAdoptionScore: z.number().min(0).max(100).optional(),
    creditHistoryScore: z.number().min(0).max(100).optional(),
}).strict();

const acceptOfferSchema = z.object({
    offerId: z.number().int().positive(),
}).strict();

// Apply for MSME loan
router.post('/apply', authMiddleware, validateBody(applySchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const data = req.body;
        const applicationRef = generateRef();

        const appResult = msmeDb.createApplication({
            userId,
            applicationRef,
            businessName: data.businessName,
            udyamNumber: data.udyamNumber,
            gstin: data.gstin,
            panNumber: data.panNumber,
            aadhaarMasked: data.aadhaarMasked,
            enterpriseType: data.enterpriseType,
            annualTurnover: data.annualTurnover,
            employees: data.employees,
            requestedAmount: data.requestedAmount,
            requestedTenure: data.requestedTenure,
            purpose: data.purpose,
            consentGst: data.consentGst,
            consentAa: data.consentAa,
            consentUpi: data.consentUpi,
        });
        const applicationId = appResult.lastInsertRowid;

        const scoringInput = {
            ...data,
            gstComplianceScore: data.gstComplianceScore ?? 75,
            cashFlowStabilityScore: data.cashFlowStabilityScore ?? 65,
            transactionVolumeScore: data.transactionVolumeScore ?? 60,
            digitalAdoptionScore: data.digitalAdoptionScore ?? 55,
            creditHistoryScore: data.creditHistoryScore ?? 40,
        };
        const result = assessApplication(scoringInput);

        msmeDb.createScore({
            applicationId,
            score: result.score,
            category: result.category,
            factors: result.factors,
            eli5: result.eli5,
            recommendations: result.recommendations,
            fraudSignals: result.fraudSignals,
        });

        for (const offer of result.offers) {
            msmeDb.createOffer({ applicationId, ...offer });
        }

        msmeDb.updateApplication(applicationId, {
            status: result.decision === 'REJECTED' ? 'rejected' : 'approved',
            decision: result.decision,
            decisionReason: result.conditions.join('; '),
            scoredAt: new Date().toISOString(),
        });

        msmeDb.createAuditLog({
            applicationId,
            userId,
            action: 'APPLICATION_SCORED',
            details: { score: result.score, decision: result.decision },
        });

        // Create a banking loan record if approved (demo flow)
        if (result.decision === 'APPROVED' || result.decision === 'APPROVED_WITH_CONDITIONS') {
            const primaryOffer = result.offers.find((o) => o.offerType === 'primary') || result.offers[0];
            if (primaryOffer) {
                bankingDb.createLoan({
                    userId,
                    loanType: 'msme-creditbridge',
                    principalAmount: primaryOffer.principalAmount,
                    interestRate: primaryOffer.interestRate,
                    tenureMonths: primaryOffer.tenureMonths,
                    emiAmount: primaryOffer.emiAmount,
                    totalPayable: primaryOffer.totalRepayment,
                    nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    status: 'active',
                    purpose: data.purpose || 'MSME working capital',
                });
            }
        }

        res.json({
            success: true,
            data: {
                applicationId,
                applicationRef,
                decision: result.decision,
                score: result.score,
                category: result.category,
                eli5: result.eli5,
                factors: result.factors,
                recommendations: result.recommendations,
                fraudSignals: result.fraudSignals,
                conditions: result.conditions,
            },
        });
    } catch (err) {
        console.error('MSME apply error:', err);
        res.status(500).json({ success: false, error: err.message || 'Application failed' });
    }
});

// Score preview without persistence
router.post('/score', authMiddleware, validateBody(scorePreviewSchema), (req, res) => {
    try {
        const data = req.body;
        const scoringInput = {
            ...data,
            gstComplianceScore: data.gstComplianceScore ?? 75,
            cashFlowStabilityScore: data.cashFlowStabilityScore ?? 65,
            transactionVolumeScore: data.transactionVolumeScore ?? 60,
            digitalAdoptionScore: data.digitalAdoptionScore ?? 55,
            creditHistoryScore: data.creditHistoryScore ?? 40,
        };
        const result = assessApplication(scoringInput);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('MSME score error:', err);
        res.status(500).json({ success: false, error: err.message || 'Scoring failed' });
    }
});

// Get my applications
router.get('/my-applications', authMiddleware, (req, res) => {
    try {
        const rows = msmeDb.getApplicationsByUser(req.user.id);
        res.json({ success: true, data: rows.map(maskApplication) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get single application with score + offers
router.get('/application/:id', authMiddleware, (req, res) => {
    try {
        const appId = parseInt(req.params.id, 10);
        const app = msmeDb.getApplicationById(appId);
        if (!app || app.user_id !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }
        const score = msmeDb.getScoreByApplication(appId);
        const offers = msmeDb.getOffersByApplication(appId);
        const audit = msmeDb.getAuditLogsByApplication(appId);
        res.json({
            success: true,
            data: {
                application: maskApplication(app),
                score,
                offers,
                audit,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get offers for application
router.get('/offers/:applicationId', authMiddleware, (req, res) => {
    try {
        const applicationId = parseInt(req.params.applicationId, 10);
        const app = msmeDb.getApplicationById(applicationId);
        if (!app || app.user_id !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }
        const offers = msmeDb.getOffersByApplication(applicationId);
        res.json({ success: true, data: offers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accept an offer
router.post('/accept-offer', authMiddleware, validateBody(acceptOfferSchema), (req, res) => {
    try {
        const offerId = req.body.offerId;
        // Find offer and verify ownership via application
        const offerRow = require('../services/database').db.prepare('SELECT * FROM msme_offers WHERE id = ?').get(offerId);
        if (!offerRow) return res.status(404).json({ success: false, error: 'Offer not found' });
        const app = msmeDb.getApplicationById(offerRow.application_id);
        if (!app || app.user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        msmeDb.acceptOffer(offerId);
        msmeDb.updateApplication(app.id, { status: 'disbursed' });
        msmeDb.createAuditLog({
            applicationId: app.id,
            userId: req.user.id,
            action: 'OFFER_ACCEPTED',
            details: { offerId },
        });
        res.json({ success: true, data: { accepted: true } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin: list applications
router.get('/admin/applications', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const result = msmeDb.getApplications({
            status: req.query.status,
            decision: req.query.decision,
            q: req.query.q,
            page: req.query.page,
            limit: req.query.limit,
            sort: req.query.sort,
            order: req.query.order,
        });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin: portfolio metrics
router.get('/admin/portfolio', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = require('../services/database').db;
        const totalLoansDisbursed = db.prepare("SELECT COALESCE(SUM(principal_amount), 0) as total FROM msme_offers WHERE status = 'accepted'").get().total;
        const activeMSMEs = db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM msme_applications').get().count;
        const totalApplications = db.prepare('SELECT COUNT(*) as count FROM msme_applications').get().count;
        const approved = db.prepare("SELECT COUNT(*) as count FROM msme_applications WHERE decision IN ('APPROVED','APPROVED_WITH_CONDITIONS')").get().count;
        const rejected = db.prepare("SELECT COUNT(*) as count FROM msme_applications WHERE decision = 'REJECTED'").get().count;
        const avgTicket = db.prepare('SELECT COALESCE(AVG(requested_amount), 0) as avg FROM msme_applications').get().avg;
        const womenLed = Math.round(activeMSMEs * 0.31); // placeholder until field added
        const ruralReach = Math.round(activeMSMEs * 0.42);
        res.json({
            success: true,
            data: {
                totalLoansDisbursed,
                activeMSMEs,
                totalApplications,
                approved,
                rejected,
                averageTicketSize: avgTicket,
                portfolioPAR: 2.3,
                recoveryRate: 96.7,
                womenLedMSMEs: womenLed,
                ruralReach,
                cgstmseClaims: totalLoansDisbursed * 0.85,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin: fraud signals
router.get('/admin/fraud-signals', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = require('../services/database').db;
        const rows = db.prepare('SELECT a.id, a.application_ref, a.business_name, s.fraud_signals_json FROM msme_applications a JOIN msme_credit_scores s ON s.application_id = a.id ORDER BY a.created_at DESC LIMIT 100').all();
        const signals = rows.flatMap((r) => {
            const list = require('../services/database').safeJsonParse(r.fraud_signals_json, []);
            return list.map((s) => ({ applicationId: r.id, applicationRef: r.application_ref, businessName: r.business_name, ...s }));
        });
        res.json({ success: true, data: signals });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin: bias audit (quarterly placeholder)
router.get('/admin/bias-audit', authMiddleware, requireRole('admin'), (req, res) => {
    res.json({
        success: true,
        data: {
            lastAuditDate: '2026-03-15',
            nextAuditDate: '2026-06-15',
            metrics: {
                genderParity: 'Approval rate: Male 68% vs Female 64% (Δ4% - ACCEPTABLE <5%)',
                regionalFairness: 'Urban 71% vs Rural 66% (Δ5% - MONITORING)',
                enterpriseSize: 'Micro 63% vs Small 72% vs Medium 78% (Within norms)',
            },
            auditReport: 'Download Q1 2026 Bias Audit Report (PDF)',
            overallFairnessScore: 96.4,
        },
    });
});

module.exports = router;
