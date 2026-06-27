const { z } = require('zod');

function validateBody(schema) {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            const message = error.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') || error.message;
            return res.status(400).json({ success: false, error: 'Validation failed', details: message });
        }
    };
}

const msmeSchemas = {
    apply: z.object({
        businessName: z.string().min(1).max(200),
        udyamNumber: z.string().max(20).optional(),
        gstin: z.string().max(15).optional(),
        panNumber: z.string().length(10).optional(),
        entityType: z.enum(['micro', 'small', 'medium']).optional(),
        turnover: z.number().min(0).optional(),
        employees: z.number().int().min(0).optional(),
        requestedAmount: z.number().min(50000).max(50000000),
        tenureMonths: z.number().int().min(6).max(60),
        purpose: z.string().max(500).optional(),
        consents: z.object({ gst: z.boolean(), aa: z.boolean(), upi: z.boolean() }),
    }).strict(),
    score: z.object({
        businessName: z.string().min(1).max(200).optional(),
        enterpriseType: z.enum(['micro', 'small', 'medium']).optional(),
        annualTurnover: z.number().min(0).optional(),
        employees: z.number().int().min(0).optional(),
        requestedAmount: z.number().min(50000).max(50000000).optional(),
        requestedTenure: z.number().int().min(6).max(60).optional(),
        gstin: z.string().max(15).optional(),
        gstComplianceScore: z.number().min(0).max(100).optional(),
        cashFlowStabilityScore: z.number().min(0).max(100).optional(),
        transactionVolumeScore: z.number().min(0).max(100).optional(),
        digitalAdoptionScore: z.number().min(0).max(100).optional(),
        creditHistoryScore: z.number().min(0).max(100).optional(),
    }).strict(),
    acceptOffer: z.object({
        offerId: z.number().int().positive(),
    }).strict(),
};

module.exports = {
    validateBody,
    msmeSchemas,
};
