process.env.JWT_SECRET = 'testsecret';

const request = require('supertest');
const app = require('../server');

describe('Analytics API Tests', () => {
    let adminToken;

    beforeAll(async () => {
        // Register an admin user to access private analytics routes if needed
        const testEmail = `admin-${Date.now()}@dsfinancial.in`;
        await request(app).post('/api/v1/auth/register').send({
            email: testEmail,
            password: 'AdminPassword123!',
            name: 'Admin User'
        });

        // Set role to admin in database
        const { db } = require('../services/database');
        db.prepare('UPDATE users SET role = ? WHERE email = ?').run('admin', testEmail);

        const loginRes = await request(app).post('/api/v1/auth/login').send({
            email: testEmail,
            password: 'AdminPassword123!'
        });
        adminToken = loginRes.body.data.tokens.accessToken;
    });

    describe('GET /api/v1/analytics/usage', () => {
        test('should get API usage statistics', async () => {
            const res = await request(app)
                .get('/api/v1/analytics/usage')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('totalCalls');
        });

        test('should handle date range filtering', async () => {
            const res = await request(app)
                .get('/api/v1/analytics/usage?startDate=2025-01-01&endDate=2025-12-31')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.totalCalls).toBeGreaterThanOrEqual(0);
        });
    });

    describe('GET /api/v1/analytics/patents', () => {
        test('should get patent usage analytics', async () => {
            const res = await request(app)
                .get('/api/v1/analytics/patents')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.totalPatents).toBe(47);
        });
    });

    describe('GET /api/v1/analytics/dashboard', () => {
        test('should get executive dashboard data', async () => {
            const res = await request(app)
                .get('/api/v1/analytics/dashboard')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.overview.patentsFiled).toBe(7);
        });
    });
});
