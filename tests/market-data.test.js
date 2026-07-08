/**
 * Market Data API Tests
 */

process.env.JWT_SECRET = 'testsecret';

const request = require('supertest');
const app = require('../server');

describe('Market Data API Tests', () => {
    test('GET /market/macro-signals returns signals and recommendations', async () => {
        const res = await request(app).get('/api/v1/market/macro-signals');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.signals)).toBe(true);
        expect(res.body.data.signals.length).toBeGreaterThan(0);
        expect(Array.isArray(res.body.data.recommendations)).toBe(true);
        expect(res.body.data.recommendations.length).toBeGreaterThan(0);
        expect(res.body.data.recommendations[0]).toHaveProperty('title');
        expect(res.body.data.recommendations[0]).toHaveProperty('trigger');
    });
});
