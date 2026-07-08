/**
 * Business / SME API Tests
 */

process.env.JWT_SECRET = 'testsecret';

const request = require('supertest');
const app = require('../server');

describe('Business / SME API Tests', () => {
    let authToken;

    beforeAll(async () => {
        const email = `test-business-${Date.now()}@dsfinancial.in`;
        await request(app)
            .post('/api/v1/auth/register')
            .send({ email, password: 'TestPass123!', name: 'Business Test User' });

        const login = await request(app)
            .post('/api/v1/auth/login')
            .send({ email, password: 'TestPass123!' });

        authToken = login.body.data.tokens.accessToken;
    });

    test('GET /business/cash-flow returns 12-month timeline', async () => {
        const res = await request(app)
            .get('/api/v1/business/cash-flow')
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(12);
        expect(res.body.data[0]).toHaveProperty('month');
        expect(res.body.data[0]).toHaveProperty('inflow');
        expect(res.body.data[0]).toHaveProperty('outflow');
        expect(res.body.data[0]).toHaveProperty('net');
    });

    test('GET /business/surplus returns advisor recommendations', async () => {
        const res = await request(app)
            .get('/api/v1/business/surplus')
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.data.currentSurplus).toBe('number');
        expect(Array.isArray(res.body.data.projections)).toBe(true);
        expect(res.body.data.projections.length).toBeGreaterThan(0);
        expect(res.body.data.projections[0]).toHaveProperty('action');
        expect(res.body.data.projections[0]).toHaveProperty('allocation');
        expect(res.body.data.projections[0]).toHaveProperty('projectedValue');
    });

    test('GET /business/working-capital returns health metrics', async () => {
        const res = await request(app)
            .get('/api/v1/business/working-capital')
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.data.score).toBe('number');
        expect(typeof res.body.data.currentRatio).toBe('number');
        expect(typeof res.body.data.quickRatio).toBe('number');
        expect(typeof res.body.data.receivableDays).toBe('number');
        expect(typeof res.body.data.payableDays).toBe('number');
        expect(typeof res.body.data.inventoryDays).toBe('number');
        expect(typeof res.body.data.cashConversionCycle).toBe('number');
    });

    test('GET /business/cash-flow without auth returns 401', async () => {
        const res = await request(app).get('/api/v1/business/cash-flow');
        expect(res.status).toBe(401);
    });
});
