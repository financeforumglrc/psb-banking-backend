/**
 * GST API Tests
 * Testing Patent-Protected Endpoints
 */

const request = require('supertest');
const app = require('../server');

describe('GST API Tests', () => {
    let authToken;

    beforeAll(async () => {
        await request(app)
            .post('/api/v1/auth/register')
            .send({
                email: 'test-gst@dsfinancial.in',
                password: 'TestPass123!',
                name: 'GST Test User'
            });

        const login = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: 'test-gst@dsfinancial.in',
                password: 'TestPass123!'
            });

        authToken = login.body.data.tokens.accessToken;
    });

    describe('PAT-001: GSTIN Validation', () => {
        test('should validate a correct GSTIN', async () => {
            const res = await request(app)
                .post('/api/v1/gst/validate-gstin')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ gstin: '07AABCU9603R1ZM' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.isValid).toBe(true);
            expect(res.body.data.riskLevel).toBeDefined();
            expect(res.body.data.patent).toBe('PAT-001');
        });

        test('should reject invalid GSTIN format', async () => {
            const res = await request(app)
                .post('/api/v1/gst/validate-gstin')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ gstin: 'INVALID' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe('PAT-002: ITC Risk Analysis', () => {
        test('should analyze ITC risks', async () => {
            const purchaseData = [
                {
                    invoice_no: 'INV001',
                    supplier_name: 'Test Supplier',
                    gstin: '07AABCU9603R1ZM',
                    taxable_value: 100000,
                    cgst: 9000,
                    sgst: 9000
                }
            ];

            const res = await request(app)
                .post('/api/v1/gst/analyze-itc-risk')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ purchaseData });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.patent).toBe('PAT-002');
        });
    });

    describe('PAT-003: Shell Company Detector', () => {
        test('should detect potential shell company indicators', async () => {
            const invoiceData = [
                {
                    gstin: '07AABCU9603R1ZM',
                    registrationDate: '2025-12-01',
                    returnsFiled: 0,
                    taxable_value: 5000000
                }
            ];

            const res = await request(app)
                .post('/api/v1/gst/detect-shell-companies')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ invoiceData });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('summary');
        });
    });

    describe('PAT-005: Tax Rate Error Detector', () => {
        test('should detect HSN rate mismatch', async () => {
            const invoices = [
                {
                    invoiceNo: 'INV-002',
                    hsn: '8517', // Smartphones (18%)
                    rate: 12, // Incorrect rate
                    taxable_value: 100000
                }
            ];

            const res = await request(app)
                .post('/api/v1/gst/verify-rates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ invoices });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            // We expect at least one error
            expect(res.body.data.errors.length).toBeGreaterThan(0);
        });
    });

    describe('PAT-006: Missing ITC Recovery Predictor', () => {
        test('should predict ITC recovery potential', async () => {
            const purchaseData = [];
            const gstr2bData = [
                {
                    gstin: '07AABCU9603R1ZM',
                    invoiceNo: 'INV-003',
                    taxable_value: 100000,
                    rate: 18,
                    invoiceDate: '2025-10-01'
                }
            ];

            const res = await request(app)
                .post('/api/v1/gst/predict-itc-recovery')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ purchaseData, gstr2bData });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('summary');
        });
    });
});
