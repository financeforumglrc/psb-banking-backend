const { z } = require('zod');

function formatZodError(error) {
    const issues = error.errors || error.issues || [];
    return issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
}

function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ success: false, error: formatZodError(result.error) });
        }
        req.body = result.data;
        next();
    };
}

function validateQuery(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return res.status(400).json({ success: false, error: formatZodError(result.error) });
        }
        req.query = result.data;
        next();
    };
}

const fraudSchemas = {
    createCase: z.object({
        caseRef: z.string().min(1).max(64),
        status: z.enum(['open', 'investigating', 'escalated', 'closed', 'false_positive']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        riskScore: z.number().int().min(0).max(100).optional(),
        category: z.enum(['account_takeover', 'mule_transfer', 'card_fraud', 'phishing', 'insider', 'identity_theft', 'velocity']).optional(),
        summary: z.string().max(2000).optional(),
        riskFactors: z.array(z.string()).max(50).optional(),
        countryRiskTags: z.array(z.string()).max(50).optional(),
        assignedAdminId: z.string().max(64).optional(),
        userId: z.string().max(64).optional(),
        sourceEntityType: z.string().max(64).optional(),
        sourceEntityId: z.number().int().positive().optional(),
        auditLogId: z.number().int().positive().optional()
    }).strict(),

    updateCase: z.object({
        status: z.enum(['open', 'investigating', 'escalated', 'closed', 'false_positive']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        riskScore: z.number().int().min(0).max(100).optional(),
        category: z.enum(['account_takeover', 'mule_transfer', 'card_fraud', 'phishing', 'insider', 'identity_theft', 'velocity']).optional(),
        summary: z.string().max(2000).optional(),
        assignedAdminId: z.string().max(64).optional()
    }).strict(),

    caseAction: z.object({
        action: z.enum(['acknowledge', 'investigate', 'escalate', 'close', 'false_positive']),
        note: z.string().max(2000).optional()
    }).strict(),

    createHop: z.object({
        hopNumber: z.number().int().min(1).max(100),
        hopType: z.enum(['origin', 'intermediate', 'destination']),
        nodeName: z.string().min(1).max(200),
        country: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
        entityType: z.string().max(64).optional(),
        entityValue: z.string().max(200).optional(),
        institution: z.string().max(200).optional(),
        ifsc: z.string().max(20).optional(),
        swiftBic: z.string().max(20).optional(),
        amount: z.number().min(0).optional(),
        currency: z.string().max(3).default('INR'),
        timestamp: z.string().max(30).optional(),
        evidenceJson: z.record(z.unknown()).optional(),
        confidence: z.number().int().min(0).max(100).optional(),
        isSanctioned: z.boolean().optional()
    }).strict(),

    updateHop: z.object({
        hopNumber: z.number().int().min(1).max(100).optional(),
        hopType: z.enum(['origin', 'intermediate', 'destination']).optional(),
        nodeName: z.string().min(1).max(200).optional(),
        country: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
        entityType: z.string().max(64).optional(),
        entityValue: z.string().max(200).optional(),
        institution: z.string().max(200).optional(),
        ifsc: z.string().max(20).optional(),
        swiftBic: z.string().max(20).optional(),
        amount: z.number().min(0).optional(),
        currency: z.string().max(3).optional(),
        timestamp: z.string().max(30).optional(),
        evidenceJson: z.record(z.unknown()).optional(),
        confidence: z.number().int().min(0).max(100).optional(),
        isSanctioned: z.boolean().optional()
    }).strict(),

    createAccount: z.object({
        accountType: z.enum(['source', 'mule', 'beneficiary']),
        holderName: z.string().min(1).max(200),
        bankName: z.string().max(200).optional(),
        branch: z.string().max(200).optional(),
        maskedAccount: z.string().max(50).optional(),
        ifsc: z.string().max(20).optional(),
        swiftBic: z.string().max(20).optional(),
        country: z.string().max(100).optional(),
        riskFlags: z.array(z.string()).max(50).optional()
    }).strict(),

    createNote: z.object({
        note: z.string().min(1).max(5000)
    }).strict(),

    createRule: z.object({
        name: z.string().min(1).max(200),
        enabled: z.boolean().optional(),
        conditionJson: z.record(z.unknown()),
        action: z.enum(['flag', 'block', 'notify']).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
    }).strict(),

    updateRule: z.object({
        name: z.string().min(1).max(200).optional(),
        enabled: z.boolean().optional(),
        conditionJson: z.record(z.unknown()).optional(),
        action: z.enum(['flag', 'block', 'notify']).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
    }).strict(),

    simulate: z.object({
        count: z.union([z.string(), z.number()]).optional()
    }).strict()
};

module.exports = { validateBody, validateQuery, fraudSchemas };
