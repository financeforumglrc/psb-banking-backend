/**
 * Fraud Intelligence Center API
 * Admin-only endpoints for comprehensive fraud case management,
 * multi-hop tracing, exports, and alerting rules.
 */

const express = require('express');
const ExcelJS = require('exceljs');
const { db, fraudDb, bankingDb } = require('../services/database');
const { adminApiAuth, getAdminIdFromToken } = require('../middleware/auth');
const { validateBody, fraudSchemas } = require('../middleware/validate');
const { maskEmail } = require('../lib/pii');
const { generateLiveCase, persistCase } = require('../lib/fraudGenerator');

const router = express.Router();

const VALID_STATUSES = ['open', 'investigating', 'escalated', 'closed', 'false_positive'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const VALID_CATEGORIES = ['account_takeover', 'mule_transfer', 'card_fraud', 'phishing', 'insider', 'identity_theft', 'velocity'];
const VALID_ACTIONS = ['acknowledge', 'investigate', 'escalate', 'close', 'false_positive'];

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
        console.error('[Fraud] audit log failed', e.message);
    }
}

function normalizeCaseRow(row) {
    return {
        ...row,
        riskFactors: row.risk_factors ? JSON.parse(row.risk_factors) : [],
        countryRiskTags: row.country_risk_tags ? JSON.parse(row.country_risk_tags) : []
    };
}

// GET /api/v1/fraud/cases — list/filter/paginate
router.get('/cases', adminApiAuth, (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            priority: req.query.priority,
            category: req.query.category,
            assignedAdminId: req.query.assignedAdminId,
            userId: req.query.userId,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            timeRange: req.query.timeRange,
            minRisk: req.query.minRisk !== undefined ? parseFloat(req.query.minRisk) : undefined,
            maxRisk: req.query.maxRisk !== undefined ? parseFloat(req.query.maxRisk) : undefined,
            q: req.query.q,
            ids: req.query.ids ? String(req.query.ids).split(',').map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0) : undefined,
            sort: req.query.sort,
            order: req.query.order,
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 50,
        };
        const result = fraudDb.getCases(filters);
        res.json({ success: true, ...result, cases: result.cases.map(normalizeCaseRow) });
    } catch (error) {
        console.error('List fraud cases error:', error);
        res.status(500).json({ success: false, error: 'Failed to load fraud cases' });
    }
});

// POST /api/v1/fraud/cases — create a case manually
router.post('/cases', adminApiAuth, validateBody(fraudSchemas.createCase), (req, res) => {
    try {
        const data = req.body;
        if (!data.caseRef) return res.status(400).json({ success: false, error: 'caseRef is required' });
        const result = fraudDb.createCase(data);
        audit(req, 'CREATE', 'fraud_case', result.lastInsertRowid, { caseRef: data.caseRef });
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Create fraud case error:', error);
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ success: false, error: 'caseRef already exists' });
        }
        res.status(500).json({ success: false, error: 'Failed to create fraud case' });
    }
});

// GET /api/v1/fraud/cases/:id — full case with hops, accounts, notes
router.get('/cases/:id', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Invalid case id' });
        const caseData = fraudDb.getFullCase(id);
        if (!caseData) return res.status(404).json({ success: false, error: 'Case not found' });
        audit(req, 'VIEW', 'fraud_case', id, { caseRef: caseData.case_ref });
        res.json({ success: true, case: caseData });
    } catch (error) {
        console.error('Get fraud case error:', error);
        res.status(500).json({ success: false, error: 'Failed to load fraud case' });
    }
});

// PATCH /api/v1/fraud/cases/:id — update status, priority, assignee, etc.
router.patch('/cases/:id', adminApiAuth, validateBody(fraudSchemas.updateCase), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const data = req.body;
        fraudDb.updateCase(id, data);
        audit(req, 'UPDATE', 'fraud_case', id, data);
        res.json({ success: true });
    } catch (error) {
        console.error('Update fraud case error:', error);
        res.status(500).json({ success: false, error: 'Failed to update fraud case' });
    }
});

// DELETE /api/v1/fraud/cases/:id
router.delete('/cases/:id', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        fraudDb.deleteCase(id);
        audit(req, 'DELETE', 'fraud_case', id, null);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete fraud case error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete fraud case' });
    }
});

// POST /api/v1/fraud/cases/:id/actions — acknowledge / investigate / escalate / close / false_positive
router.post('/cases/:id/actions', adminApiAuth, validateBody(fraudSchemas.caseAction), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { action, note } = req.body;
        const statusMap = {
            acknowledge: 'open',
            investigate: 'investigating',
            escalate: 'escalated',
            close: 'closed',
            false_positive: 'false_positive'
        };
        fraudDb.updateCase(id, { status: statusMap[action] });
        if (note) {
            fraudDb.createNote({ fraudCaseId: id, adminId: getAdminIdFromToken(req), note: `${action}: ${note}` });
        }
        audit(req, action.toUpperCase(), 'fraud_case', id, { note });
        res.json({ success: true });
    } catch (error) {
        console.error('Fraud case action error:', error);
        res.status(500).json({ success: false, error: 'Failed to apply action' });
    }
});

// GET /api/v1/fraud/cases/:id/hops
router.get('/cases/:id/hops', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const hops = fraudDb.getHopsByCase(id);
        res.json({ success: true, hops: hops.map(h => ({ ...h, evidenceJson: h.evidence_json ? JSON.parse(h.evidence_json) : null, isSanctioned: !!h.is_sanctioned })) });
    } catch (error) {
        console.error('Get fraud hops error:', error);
        res.status(500).json({ success: false, error: 'Failed to load hops' });
    }
});

// POST /api/v1/fraud/cases/:id/hops
router.post('/cases/:id/hops', adminApiAuth, validateBody(fraudSchemas.createHop), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const data = req.body;
        data.fraudCaseId = id;
        const result = fraudDb.createHop(data);
        audit(req, 'CREATE', 'fraud_hop', result.lastInsertRowid, { fraudCaseId: id });
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Create fraud hop error:', error);
        res.status(500).json({ success: false, error: 'Failed to create hop' });
    }
});

// PATCH /api/v1/fraud/hops/:id
router.patch('/hops/:id', adminApiAuth, validateBody(fraudSchemas.updateHop), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        fraudDb.updateHop(id, req.body);
        audit(req, 'UPDATE', 'fraud_hop', id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Update fraud hop error:', error);
        res.status(500).json({ success: false, error: 'Failed to update hop' });
    }
});

// DELETE /api/v1/fraud/hops/:id
router.delete('/hops/:id', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        fraudDb.deleteHop(id);
        audit(req, 'DELETE', 'fraud_hop', id, null);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete fraud hop error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete hop' });
    }
});

// GET /api/v1/fraud/cases/:id/accounts
router.get('/cases/:id/accounts', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const accounts = fraudDb.getAccountsByCase(id);
        res.json({ success: true, accounts: accounts.map(a => ({ ...a, riskFlags: a.risk_flags ? JSON.parse(a.risk_flags) : [] })) });
    } catch (error) {
        console.error('Get fraud accounts error:', error);
        res.status(500).json({ success: false, error: 'Failed to load accounts' });
    }
});

// POST /api/v1/fraud/cases/:id/accounts
router.post('/cases/:id/accounts', adminApiAuth, validateBody(fraudSchemas.createAccount), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const data = req.body;
        data.fraudCaseId = id;
        const result = fraudDb.createAccount(data);
        audit(req, 'CREATE', 'fraud_account', result.lastInsertRowid, { fraudCaseId: id });
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Create fraud account error:', error);
        res.status(500).json({ success: false, error: 'Failed to create account' });
    }
});

// GET /api/v1/fraud/cases/:id/notes
router.get('/cases/:id/notes', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const notes = fraudDb.getNotesByCase(id);
        res.json({ success: true, notes });
    } catch (error) {
        console.error('Get fraud notes error:', error);
        res.status(500).json({ success: false, error: 'Failed to load notes' });
    }
});

// POST /api/v1/fraud/cases/:id/notes
router.post('/cases/:id/notes', adminApiAuth, validateBody(fraudSchemas.createNote), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { note } = req.body;
        const result = fraudDb.createNote({ fraudCaseId: id, adminId: getAdminIdFromToken(req), note });
        audit(req, 'CREATE', 'fraud_note', result.lastInsertRowid, { fraudCaseId: id, note });
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Create fraud note error:', error);
        res.status(500).json({ success: false, error: 'Failed to create note' });
    }
});

// GET /api/v1/fraud/stats/summary
router.get('/stats/summary', adminApiAuth, (req, res) => {
    try {
        const stats = fraudDb.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Fraud stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to load stats' });
    }
});

// GET /api/v1/fraud/rules
router.get('/rules', adminApiAuth, (req, res) => {
    try {
        const rules = fraudDb.getRules({ enabled: req.query.enabled, limit: req.query.limit });
        res.json({ success: true, rules });
    } catch (error) {
        console.error('List fraud rules error:', error);
        res.status(500).json({ success: false, error: 'Failed to load rules' });
    }
});

// POST /api/v1/fraud/rules
router.post('/rules', adminApiAuth, validateBody(fraudSchemas.createRule), (req, res) => {
    try {
        const data = req.body;
        const result = fraudDb.createRule({ ...data, createdBy: getAdminIdFromToken(req) });
        audit(req, 'CREATE', 'fraud_rule', result.lastInsertRowid, { name: data.name });
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Create fraud rule error:', error);
        res.status(500).json({ success: false, error: 'Failed to create rule' });
    }
});

// PATCH /api/v1/fraud/rules/:id
router.patch('/rules/:id', adminApiAuth, validateBody(fraudSchemas.updateRule), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        fraudDb.updateRule(id, req.body);
        audit(req, 'UPDATE', 'fraud_rule', id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Update fraud rule error:', error);
        res.status(500).json({ success: false, error: 'Failed to update rule' });
    }
});

// DELETE /api/v1/fraud/rules/:id
router.delete('/rules/:id', adminApiAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        fraudDb.deleteRule(id);
        audit(req, 'DELETE', 'fraud_rule', id, null);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete fraud rule error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete rule' });
    }
});

// GET /api/v1/fraud/export/cases?format=xlsx|csv
router.get('/export/cases', adminApiAuth, async (req, res) => {
    try {
        const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
        const filters = {
            status: req.query.status,
            priority: req.query.priority,
            category: req.query.category,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            minRisk: req.query.minRisk !== undefined ? parseFloat(req.query.minRisk) : undefined,
            maxRisk: req.query.maxRisk !== undefined ? parseFloat(req.query.maxRisk) : undefined,
            q: req.query.q,
            limit: 5000,
        };
        const result = fraudDb.getCases(filters);
        const caseIds = result.cases.map(c => c.id);

        const workbook = new ExcelJS.Workbook();
        workbook.created = new Date();
        workbook.creator = 'PSB SecureWealth Fraud Intelligence';

        const casesSheet = workbook.addWorksheet('Cases');
        casesSheet.columns = [
            { header: 'Case Ref', key: 'caseRef', width: 18 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Priority', key: 'priority', width: 10 },
            { header: 'Category', key: 'category', width: 18 },
            { header: 'Risk Score', key: 'riskScore', width: 12 },
            { header: 'Summary', key: 'summary', width: 50 },
            { header: 'User Name', key: 'userName', width: 24 },
            { header: 'User Email', key: 'userEmail', width: 28 },
            { header: 'Assigned Admin', key: 'assignedAdmin', width: 18 },
            { header: 'Country Risk Tags', key: 'countryRiskTags', width: 30 },
            { header: 'Created At', key: 'createdAt', width: 20 },
            { header: 'Updated At', key: 'updatedAt', width: 20 },
        ];
        result.cases.forEach(c => casesSheet.addRow({
            caseRef: c.case_ref,
            status: c.status,
            priority: c.priority,
            category: c.category,
            riskScore: c.risk_score,
            summary: c.summary,
            userName: c.user_name || '',
            userEmail: maskEmail(c.user_email) || '',
            assignedAdmin: c.assigned_admin_id || '',
            countryRiskTags: c.country_risk_tags || '',
            createdAt: c.created_at,
            updatedAt: c.updated_at,
        }));

        const hopsSheet = workbook.addWorksheet('Hops');
        hopsSheet.columns = [
            { header: 'Case Ref', key: 'caseRef', width: 18 },
            { header: 'Hop #', key: 'hopNumber', width: 8 },
            { header: 'Type', key: 'hopType', width: 14 },
            { header: 'Node', key: 'nodeName', width: 24 },
            { header: 'Country', key: 'country', width: 16 },
            { header: 'City', key: 'city', width: 18 },
            { header: 'Institution', key: 'institution', width: 26 },
            { header: 'Entity Type', key: 'entityType', width: 16 },
            { header: 'Entity Value', key: 'entityValue', width: 24 },
            { header: 'Amount', key: 'amount', width: 14 },
            { header: 'Currency', key: 'currency', width: 10 },
            { header: 'Timestamp', key: 'timestamp', width: 20 },
            { header: 'Confidence', key: 'confidence', width: 12 },
            { header: 'Sanctioned', key: 'isSanctioned', width: 12 },
        ];

        const accountsSheet = workbook.addWorksheet('Accounts');
        accountsSheet.columns = [
            { header: 'Case Ref', key: 'caseRef', width: 18 },
            { header: 'Account Type', key: 'accountType', width: 14 },
            { header: 'Holder Name', key: 'holderName', width: 24 },
            { header: 'Bank Name', key: 'bankName', width: 26 },
            { header: 'Branch', key: 'branch', width: 22 },
            { header: 'Masked Account', key: 'maskedAccount', width: 22 },
            { header: 'IFSC', key: 'ifsc', width: 16 },
            { header: 'SWIFT/BIC', key: 'swiftBic', width: 16 },
            { header: 'Country', key: 'country', width: 16 },
            { header: 'Risk Flags', key: 'riskFlags', width: 30 },
        ];

        const notesSheet = workbook.addWorksheet('Notes');
        notesSheet.columns = [
            { header: 'Case Ref', key: 'caseRef', width: 18 },
            { header: 'Admin', key: 'adminId', width: 18 },
            { header: 'Note', key: 'note', width: 60 },
            { header: 'Created At', key: 'createdAt', width: 20 },
        ];

        for (const c of result.cases) {
            const hops = fraudDb.getHopsByCase(c.id);
            hops.forEach(h => hopsSheet.addRow({
                caseRef: c.case_ref,
                hopNumber: h.hop_number,
                hopType: h.hop_type,
                nodeName: h.node_name,
                country: h.country,
                city: h.city,
                institution: h.institution,
                entityType: h.entity_type,
                entityValue: h.entity_value,
                amount: h.amount,
                currency: h.currency,
                timestamp: h.timestamp,
                confidence: h.confidence,
                isSanctioned: h.is_sanctioned ? 'Yes' : 'No',
            }));
            const accounts = fraudDb.getAccountsByCase(c.id);
            accounts.forEach(a => accountsSheet.addRow({
                caseRef: c.case_ref,
                accountType: a.account_type,
                holderName: a.holder_name,
                bankName: a.bank_name,
                branch: a.branch,
                maskedAccount: a.masked_account,
                ifsc: a.ifsc,
                swiftBic: a.swift_bic,
                country: a.country,
                riskFlags: a.risk_flags,
            }));
            const notes = fraudDb.getNotesByCase(c.id);
            notes.forEach(n => notesSheet.addRow({
                caseRef: c.case_ref,
                adminId: n.admin_id,
                note: n.note,
                createdAt: n.created_at,
            }));
        }

        if (format === 'csv') {
            const buffer = await workbook.csv.writeBuffer();
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="fraud-cases-${new Date().toISOString().slice(0, 10)}.csv"`);
            res.send(buffer);
        } else {
            const buffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="fraud-cases-${new Date().toISOString().slice(0, 10)}.xlsx"`);
            res.send(buffer);
        }

        audit(req, 'EXPORT', 'fraud_cases', null, { format, count: result.cases.length });
    } catch (error) {
        console.error('Fraud export error:', error);
        res.status(500).json({ success: false, error: 'Failed to export fraud cases' });
    }
});

// POST /api/v1/fraud/simulate — create one or more live-style mock cases
router.post('/simulate', adminApiAuth, validateBody(fraudSchemas.simulate), (req, res) => {
    try {
        const count = Math.min(100, Math.max(1, parseInt(req.body.count) || 1));
        const created = [];
        for (let i = 0; i < count; i++) {
            const caseData = generateLiveCase();
            const id = persistCase(caseData, fraudDb, { note: 'Generated by live simulation' });
            audit(req, 'SIMULATE', 'fraud_case', id, { caseRef: caseData.caseRef });
            created.push({ id, ...caseData });
        }
        res.status(201).json({ success: true, created });
    } catch (error) {
        console.error('Fraud simulate error:', error);
        res.status(500).json({ success: false, error: 'Failed to simulate fraud cases' });
    }
});

// GET /api/v1/fraud/live — cases created in the last N seconds (live feed polling)
router.get('/live', adminApiAuth, (req, res) => {
    try {
        const seconds = Math.min(300, Math.max(1, parseInt(req.query.seconds) || 5));
        const rows = db.prepare(`SELECT * FROM fraud_cases WHERE created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT 100`).all(`-${seconds} seconds`);
        const cases = rows.map(c => ({
            ...c,
            riskFactors: safeJsonParse(c.risk_factors, []),
            countryRiskTags: safeJsonParse(c.country_risk_tags, []),
            hops: db.prepare('SELECT * FROM fraud_hops WHERE fraud_case_id = ? ORDER BY hop_number, timestamp').all(c.id).map(h => ({
                ...h,
                evidenceJson: safeJsonParse(h.evidence_json, null),
                isSanctioned: !!h.is_sanctioned
            }))
        }));
        res.json({ success: true, seconds, cases });
    } catch (error) {
        console.error('Fraud live feed error:', error);
        res.status(500).json({ success: false, error: 'Failed to load live feed' });
    }
});

// GET /api/v1/fraud/correlations
// Surface clusters of related fraud cases (shared IP, destination, beneficiary, origin, category)
router.get('/correlations', adminApiAuth, (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
        const timeRange = req.query.timeRange || '7d';
        let caseSql = `SELECT id, case_ref, risk_score, category FROM fraud_cases WHERE 1=1`;
        const caseParams = [];
        if (timeRange !== 'all') {
            let seconds = 7 * 24 * 60 * 60;
            switch (timeRange) {
                case 'live': seconds = 60; break;
                case '1m': seconds = 30 * 24 * 60 * 60; break;
                case '1y': seconds = 365 * 24 * 60 * 60; break;
                case '10y': seconds = 10 * 365 * 24 * 60 * 60; break;
            }
            caseSql += " AND created_at >= datetime('now', ?)";
            caseParams.push(`-${seconds} seconds`);
        }
        caseSql += ' ORDER BY created_at DESC LIMIT ?';
        const cases = db.prepare(caseSql).all(...caseParams, limit);
        if (!cases.length) {
            return res.json({ success: true, clusters: [] });
        }

        const caseIds = cases.map(c => c.id);
        const placeholders = caseIds.map(() => '?').join(',');

        const hops = db.prepare(`
            SELECT fraud_case_id, hop_number, node_name, country, evidence_json
            FROM fraud_hops
            WHERE fraud_case_id IN (${placeholders})
        `).all(...caseIds);

        const accounts = db.prepare(`
            SELECT fraud_case_id, masked_account
            FROM fraud_accounts
            WHERE account_type = 'beneficiary' AND fraud_case_id IN (${placeholders})
        `).all(...caseIds);

        const caseMap = new Map();
        cases.forEach(c => {
            caseMap.set(c.id, {
                id: c.id,
                caseRef: c.case_ref,
                riskScore: c.risk_score,
                category: c.category,
                hops: [],
                accounts: []
            });
        });

        hops.forEach(h => {
            const c = caseMap.get(h.fraud_case_id);
            if (c) {
                c.hops.push({
                    hopNumber: h.hop_number,
                    nodeName: h.node_name,
                    country: h.country,
                    evidence: safeJsonParse(h.evidence_json, {})
                });
            }
        });

        accounts.forEach(a => {
            const c = caseMap.get(a.fraud_case_id);
            if (c) c.accounts.push(a.masked_account);
        });

        const allCases = Array.from(caseMap.values());

        function extractIp(evidence) {
            return evidence?.ip || null;
        }

        function buildCluster(type, key, matches) {
            if (!matches || matches.length < 2) return null;
            const riskScores = matches.map(c => c.riskScore || 0);
            const avgRisk = Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length);
            const maxRisk = Math.max(...riskScores);
            return {
                id: `${type}-${key}`.replace(/\s+/g, '-').toLowerCase(),
                type,
                key,
                caseIds: matches.map(c => c.id),
                caseCount: matches.length,
                avgRisk,
                maxRisk,
                severity: avgRisk >= 80 ? 'critical' : avgRisk >= 60 ? 'high' : 'medium',
                sampleRefs: matches.slice(0, 3).map(c => c.caseRef)
            };
        }

        const ipMap = new Map();
        const destMap = new Map();
        const beneficiaryMap = new Map();
        const originMap = new Map();
        const categoryMap = new Map();

        allCases.forEach(c => {
            // IP from any hop evidence
            c.hops.forEach(h => {
                const ip = extractIp(h.evidence);
                if (ip) {
                    if (!ipMap.has(ip)) ipMap.set(ip, []);
                    ipMap.get(ip).push(c);
                }
            });

            // Destination = last hop
            const sortedHops = [...c.hops].sort((a, b) => a.hopNumber - b.hopNumber);
            if (sortedHops.length) {
                const last = sortedHops[sortedHops.length - 1];
                const destKey = `${last.nodeName} (${last.country})`;
                if (!destMap.has(destKey)) destMap.set(destKey, []);
                destMap.get(destKey).push(c);

                const origin = sortedHops[0];
                const originKey = origin.country || 'Unknown';
                if (!originMap.has(originKey)) originMap.set(originKey, []);
                originMap.get(originKey).push(c);
            }

            // Beneficiary accounts
            c.accounts.forEach(acc => {
                if (!beneficiaryMap.has(acc)) beneficiaryMap.set(acc, []);
                beneficiaryMap.get(acc).push(c);
            });

            // Category
            if (!categoryMap.has(c.category)) categoryMap.set(c.category, []);
            categoryMap.get(c.category).push(c);
        });

        let clusters = [];
        ipMap.forEach((matches, key) => {
            const cluster = buildCluster('ip', key, matches);
            if (cluster) clusters.push(cluster);
        });
        destMap.forEach((matches, key) => {
            const cluster = buildCluster('destination', key, matches);
            if (cluster) clusters.push(cluster);
        });
        beneficiaryMap.forEach((matches, key) => {
            const cluster = buildCluster('beneficiary', key, matches);
            if (cluster) clusters.push(cluster);
        });
        originMap.forEach((matches, key) => {
            const cluster = buildCluster('origin', key, matches);
            if (cluster) clusters.push(cluster);
        });
        categoryMap.forEach((matches, key) => {
            const riskScores = matches.map(c => c.riskScore || 0);
            const avgRisk = Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length);
            if (matches.length >= 3 && avgRisk >= 60) {
                const cluster = buildCluster('category', key, matches);
                if (cluster) clusters.push(cluster);
            }
        });

        // De-duplicate clusters that share the exact same set of caseIds, keeping the highest-risk one
        const seen = new Map();
        clusters.forEach(c => {
            const sig = [...c.caseIds].sort((a, b) => a - b).join(',');
            const existing = seen.get(sig);
            if (!existing || c.avgRisk > existing.avgRisk) seen.set(sig, c);
        });
        clusters = Array.from(seen.values());

        // Sort by max risk, then count
        clusters.sort((a, b) => b.maxRisk - a.maxRisk || b.caseCount - a.caseCount);

        audit(req, 'VIEW', 'fraud_correlations', 0, { clusterCount: clusters.length });
        res.json({ success: true, clusters: clusters.slice(0, 50) });
    } catch (error) {
        console.error('Fraud correlations error:', error);
        res.status(500).json({ success: false, error: 'Failed to load fraud correlations' });
    }
});

function safeJsonParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

/**
 * @route   GET /api/v1/fraud/mule-trace/:beneficiaryId
 * @desc    Mock money-mule network trace for a beneficiary
 * @access  Public / internal demo
 */
router.get('/mule-trace/:beneficiaryId', (req, res) => {
    try {
        const { beneficiaryId } = req.params;
        const seed = beneficiaryId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const isMule = (seed % 3) !== 0; // 2 out of 3 flagged as mule for demo impact
        const connectedNodes = isMule ? [
            { id: `ACC-${(seed % 9000) + 1000}`, risk: 'high', label: 'Scam Node 1' },
            { id: `ACC-${(seed % 9000) + 1001}`, risk: 'high', label: 'Scam Node 2' },
            { id: `ACC-${(seed % 9000) + 1002}`, risk: 'medium', label: 'Scam Node 3' },
            { id: `ACC-${(seed % 9000) + 1003}`, risk: 'high', label: 'Scam Node 4' },
        ] : [];

        res.json({
            success: true,
            data: {
                beneficiary: beneficiaryId,
                beneficiaryId,
                isMule,
                connectedNodes,
            }
        });
    } catch (error) {
        console.error('Mule trace error:', error);
        res.status(500).json({ success: false, error: 'Failed to trace beneficiary network' });
    }
});

module.exports = router;
