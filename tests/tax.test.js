/**
 * Tax API Tests
 * Testing Patent PAT-004: Multi-Regime Tax Optimizer
 */

const request = require('supertest');
const app = require('../server');

describe('Tax API Tests', () => {
    let authToken;

    beforeAll(async () => {
        await request(app)
            .post('/api/v1/auth/register')
            .send({
                email: 'test-tax@dsfinancial.in',
                password: 'TestPass123!',
                name: 'Tax Test User'
            });

        const login = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: 'test-tax@dsfinancial.in',
                password: 'TestPass123!'
            });

        authToken = login.body.data.tokens.accessToken;
    });

    describe('PAT-004: Income Tax Calculation', () => {
        test('should calculate tax for ₹12L income', async () => {
            const res = await request(app)
                .post('/api/v1/tax/calculate-income-tax')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ income: 1200000 });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.patent).toBe('PAT-004');
            expect(res.body.data.oldRegime.totalTax).toBeGreaterThan(0);
            expect(res.body.data.newRegime.totalTax).toBeGreaterThan(0);
            expect(res.body.data.optimal.regime).toMatch(/Old Regime|New Regime/);
        });

        test('should generate recommendations', async () => {
            const res = await request(app)
                .post('/api/v1/tax/calculate-income-tax')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    income: 1500000,
                    age: 35,
                    currentInvestments: 100000,
                    rent: 25000,
                    cityType: 'metro',
                    employmentType: 'salaried'
                });

            expect(res.status).toBe(200);
            expect(res.body.data.recommendations.length).toBeGreaterThan(0);
            expect(res.body.data.potentialSavings).toBeGreaterThanOrEqual(0);
        });

        test('should require income', async () => {
            const res = await request(app)
                .post('/api/v1/tax/calculate-income-tax')
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INCOME_MISSING');
        });
    });

    describe('HRA Calculation', () => {
        test('should calculate HRA exemption', async () => {
            const res = await request(app)
                .post('/api/v1/tax/calculate-hra')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    basicSalary: 50000,
                    hraReceived: 20000,
                    rentPaid: 25000,
                    cityType: 'metro'
                });

            expect(res.status).toBe(200);
            expect(res.body.data.annual.hraExemption).toBeGreaterThan(0);
        });
    });

    describe('Tax Slabs', () => {
        test('should return tax slabs', async () => {
            const res = await request(app)
                .get('/api/v1/tax/slabs/2025-26')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.slabs.newRegime).toHaveLength(6);
            expect(res.body.data.slabs.oldRegime).toHaveLength(4);
        });
    });
});
