/**
 * MSME CreditBridge AI API Tests
 */

process.env.JWT_SECRET = 'testsecret';
process.env.ALLOW_DEV_AUTH_BYPASS = 'false';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { userDb } = require('../services/database');

describe('MSME CreditBridge AI API Tests', () => {
    let authToken;
    let adminToken;
    let applicationId;

    beforeAll(async () => {
        const email = `test-msme-${Date.now()}@dsfinancial.in`;
        await request(app)
            .post('/api/v1/auth/register')
            .send({ email, password: 'TestPass123!', name: 'MSME Test User' });

        const login = await request(app)
            .post('/api/v1/auth/login')
            .send({ email, password: 'TestPass123!' });

        authToken = login.body.data.tokens.accessToken;

        const adminEmail = `test-msme-admin-${Date.now()}@dsfinancial.in`;
        const adminId = `USR-ADMIN-${Date.now()}`;
        userDb.create({
            id: adminId,
            email: adminEmail,
            password: bcrypt.hashSync('AdminPass123!', 12),
            name: 'MSME Admin',
            role: 'admin',
            tier: 'premium',
        });
        adminToken = jwt.sign({ id: adminId, email: adminEmail, role: 'admin' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    });

    test('POST /msme/score returns deterministic score preview', async () => {
        const res = await request(app)
            .post('/api/v1/msme/score')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                businessName: 'Test Enterprise',
                requestedAmount: 500000,
                requestedTenure: 24,
                gstComplianceScore: 90,
                cashFlowStabilityScore: 80,
                transactionVolumeScore: 70,
                digitalAdoptionScore: 60,
                creditHistoryScore: 50,
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.data.score).toBe('number');
        expect(res.body.data.score).toBeGreaterThan(0);
        expect(Array.isArray(res.body.data.factors)).toBe(true);
        expect(res.body.data.factors.length).toBe(5);
    });

    test('POST /msme/apply creates application and returns decision', async () => {
        const res = await request(app)
            .post('/api/v1/msme/apply')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                businessName: 'Test Enterprise',
                udyamNumber: 'UDYAM-XX-00-0000000',
                gstin: '07ABCDE1234F1Z5',
                panNumber: 'ABCDE1234F',
                enterpriseType: 'small',
                annualTurnover: 2400000,
                employees: 12,
                requestedAmount: 850000,
                requestedTenure: 24,
                purpose: 'Working capital',
                consentGst: true,
                consentAa: true,
                consentUpi: true,
                gstComplianceScore: 85,
                cashFlowStabilityScore: 72,
                transactionVolumeScore: 65,
                digitalAdoptionScore: 58,
                creditHistoryScore: 40,
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.applicationId).toBeDefined();
        expect(res.body.data.applicationRef.startsWith('CB-')).toBe(true);
        expect(typeof res.body.data.score).toBe('number');
        applicationId = res.body.data.applicationId;
    });

    test('GET /msme/my-applications returns list', async () => {
        const res = await request(app)
            .get('/api/v1/msme/my-applications')
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('GET /msme/application/:id returns details', async () => {
        const res = await request(app)
            .get(`/api/v1/msme/application/${applicationId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.application.id).toBe(applicationId);
        expect(res.body.data.score).toBeDefined();
        expect(Array.isArray(res.body.data.offers)).toBe(true);
    });

    test('GET /msme/offers/:applicationId returns offers', async () => {
        const res = await request(app)
            .get(`/api/v1/msme/offers/${applicationId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('POST /msme/accept-offer accepts first offer', async () => {
        const offersRes = await request(app)
            .get(`/api/v1/msme/offers/${applicationId}`)
            .set('Authorization', `Bearer ${authToken}`);
        const offerId = offersRes.body.data[0].id;

        const res = await request(app)
            .post('/api/v1/msme/accept-offer')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ offerId });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.accepted).toBe(true);
    });

    test('GET /msme/admin/applications requires admin', async () => {
        const res = await request(app)
            .get('/api/v1/msme/admin/applications')
            .set('Authorization', `Bearer ${authToken}`);
        expect(res.status).toBe(403);
    });

    test('GET /msme/admin/applications returns applications for admin', async () => {
        const res = await request(app)
            .get('/api/v1/msme/admin/applications')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.applications)).toBe(true);
    });

    test('GET /msme/admin/portfolio returns metrics', async () => {
        const res = await request(app)
            .get('/api/v1/msme/admin/portfolio')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.data.totalApplications).toBe('number');
    });

    test('GET /msme/admin/bias-audit returns audit', async () => {
        const res = await request(app)
            .get('/api/v1/msme/admin/bias-audit')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.overallFairnessScore).toBeDefined();
    });
});
