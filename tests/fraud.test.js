process.env.JWT_SECRET = 'testsecret';
process.env.ADMIN_ID = 'testadmin';
process.env.ADMIN_PASSWORD = 'testpass123';

const request = require('supertest');
const app = require('../server');
const { fraudDb } = require('../services/database');

const adminToken = Buffer.from(`${process.env.ADMIN_ID}:${process.env.ADMIN_PASSWORD}`).toString('base64');

function authHeader() {
    return `Bearer ${adminToken}`;
}

describe('Fraud Intelligence Center API', () => {
    let createdCaseId;

    test('should reject requests without admin token', async () => {
        const res = await request(app).get('/api/v1/fraud/cases');
        expect(res.status).toBe(401);
    });

    test('should list fraud cases', async () => {
        const res = await request(app)
            .get('/api/v1/fraud/cases')
            .set('Authorization', authHeader());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.cases)).toBe(true);
    });

    test('should create a fraud case', async () => {
        const res = await request(app)
            .post('/api/v1/fraud/cases')
            .set('Authorization', authHeader())
            .send({
                caseRef: `FC-TEST-${Date.now()}`,
                status: 'open',
                priority: 'high',
                riskScore: 85,
                category: 'mule_transfer',
                summary: 'Test synthetic fraud case',
                riskFactors: ['velocity_spike', 'cross_border_transfer'],
                countryRiskTags: ['India', 'UAE', 'Switzerland']
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.id).toBeDefined();
        createdCaseId = res.body.id;
    });

    test('should reject invalid fraud case body', async () => {
        const res = await request(app)
            .post('/api/v1/fraud/cases')
            .set('Authorization', authHeader())
            .send({
                caseRef: '',
                riskScore: 999,
                priority: 'super-critical'
            });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('should retrieve a full fraud case', async () => {
        const res = await request(app)
            .get(`/api/v1/fraud/cases/${createdCaseId}`)
            .set('Authorization', authHeader());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.case.id).toBe(createdCaseId);
    });

    test('should update fraud case status', async () => {
        const res = await request(app)
            .patch(`/api/v1/fraud/cases/${createdCaseId}`)
            .set('Authorization', authHeader())
            .send({ status: 'investigating' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const get = await request(app)
            .get(`/api/v1/fraud/cases/${createdCaseId}`)
            .set('Authorization', authHeader());
        expect(get.body.case.status).toBe('investigating');
    });

    test('should add a hop to a case', async () => {
        const res = await request(app)
            .post(`/api/v1/fraud/cases/${createdCaseId}/hops`)
            .set('Authorization', authHeader())
            .send({
                hopNumber: 1,
                hopType: 'origin',
                nodeName: 'Mumbai, India',
                country: 'India',
                city: 'Mumbai',
                lat: 19.0760,
                lon: 72.8777,
                entityType: 'bank_account',
                entityValue: 'XXXX1234',
                institution: 'State Bank of India',
                amount: 1000000,
                currency: 'INR',
                confidence: 95
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    test('should add a note to a case', async () => {
        const res = await request(app)
            .post(`/api/v1/fraud/cases/${createdCaseId}/notes`)
            .set('Authorization', authHeader())
            .send({ note: 'Suspicious velocity pattern observed' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    test('should apply an action to a case', async () => {
        const res = await request(app)
            .post(`/api/v1/fraud/cases/${createdCaseId}/actions`)
            .set('Authorization', authHeader())
            .send({ action: 'escalate' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('should get fraud stats', async () => {
        const res = await request(app)
            .get('/api/v1/fraud/stats/summary')
            .set('Authorization', authHeader());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.stats.totalCases).toBe('number');
    });

    test('should export cases as xlsx', async () => {
        const res = await request(app)
            .get('/api/v1/fraud/export/cases?format=xlsx')
            .set('Authorization', authHeader());
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('spreadsheetml');
    }, 15000);

    test('should surface correlated clusters', async () => {
        const sharedIp = '203.0.113.99';
        const case2 = await request(app)
            .post('/api/v1/fraud/cases')
            .set('Authorization', authHeader())
            .send({
                caseRef: `FC-CORR-${Date.now()}`,
                status: 'open',
                priority: 'high',
                riskScore: 75,
                category: 'mule_transfer',
                summary: 'Correlation test case',
                riskFactors: ['shared_ip'],
                countryRiskTags: ['India']
            });
        expect(case2.status).toBe(201);
        const case2Id = case2.body.id;

        await request(app)
            .post(`/api/v1/fraud/cases/${createdCaseId}/hops`)
            .set('Authorization', authHeader())
            .send({
                hopNumber: 2,
                hopType: 'intermediate',
                nodeName: 'Shared IP Hop',
                country: 'India',
                city: 'Mumbai',
                entityType: 'ip',
                entityValue: sharedIp,
                amount: 0,
                currency: 'INR',
                confidence: 90,
                evidenceJson: { ip: sharedIp }
            });

        await request(app)
            .post(`/api/v1/fraud/cases/${case2Id}/hops`)
            .set('Authorization', authHeader())
            .send({
                hopNumber: 1,
                hopType: 'origin',
                nodeName: 'Shared IP Hop',
                country: 'India',
                city: 'Delhi',
                entityType: 'ip',
                entityValue: sharedIp,
                amount: 500000,
                currency: 'INR',
                confidence: 90,
                evidenceJson: { ip: sharedIp }
            });

        const res = await request(app)
            .get('/api/v1/fraud/correlations')
            .set('Authorization', authHeader());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.clusters)).toBe(true);
        const ipCluster = res.body.clusters.find(c =>
            c.type === 'ip' &&
            c.caseIds.includes(createdCaseId) &&
            c.caseIds.includes(case2Id)
        );
        expect(ipCluster).toBeDefined();
        expect(ipCluster.caseCount).toBeGreaterThanOrEqual(2);

        await request(app)
            .delete(`/api/v1/fraud/cases/${case2Id}`)
            .set('Authorization', authHeader());
    });

    test('should delete a fraud case', async () => {
        const res = await request(app)
            .delete(`/api/v1/fraud/cases/${createdCaseId}`)
            .set('Authorization', authHeader());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
