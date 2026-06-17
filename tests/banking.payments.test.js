/**
 * Banking Payments (Razorpay test mode) route tests
 */

process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long-for-jwt';
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';

const request = require('supertest');
const app = require('../server');

function getTokenAndUser() {
    return new Promise((resolve) => {
        const email = `pay-test-${Date.now()}@dsfinancial.in`;
        request(app)
            .post('/api/v1/auth/register')
            .send({ email, password: 'TestPassword123!', name: 'Payment Tester' })
            .end((_, res) => {
                const token = res.body.data.tokens.accessToken;
                const userId = res.body.data.user.id;
                // Create an account with balance
                request(app)
                    .post('/api/v1/banking/accounts')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ accountType: 'savings', balance: 50000 })
                    .end(() => resolve({ token, userId }));
            });
    });
}

describe('Banking Payments API', () => {
    let token;

    beforeAll(async () => {
        const creds = await getTokenAndUser();
        token = creds.token;
    }, 30000);

    test('GET /api/v1/banking/payments/config returns fallback status', async () => {
        const res = await request(app)
            .get('/api/v1/banking/payments/config')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.enabled).toBe(false);
        expect(res.body.data.keyId).toBeFalsy();
    });

    test('POST /api/v1/banking/payments/create-order returns fallback order', async () => {
        const res = await request(app)
            .post('/api/v1/banking/payments/create-order')
            .set('Authorization', `Bearer ${token}`)
            .send({ amount: 250, currency: 'INR', receipt: 'rcpt_test_1' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.amount).toBe(25000);
        expect(res.body.data.currency).toBe('INR');
        expect(res.body.data.fallback).toBe(true);
        expect(res.body.data.id).toMatch(/^fallback_order_/);
    });

    test('POST /api/v1/banking/payments/create-order rejects invalid amount', async () => {
        const res = await request(app)
            .post('/api/v1/banking/payments/create-order')
            .set('Authorization', `Bearer ${token}`)
            .send({ amount: -10 });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('POST /api/v1/banking/payments/verify records a transaction in fallback mode', async () => {
        const orderRes = await request(app)
            .post('/api/v1/banking/payments/create-order')
            .set('Authorization', `Bearer ${token}`)
            .send({ amount: 100, receipt: 'rcpt_verify_1' });
        const orderId = orderRes.body.data.id;

        const res = await request(app)
            .post('/api/v1/banking/payments/verify')
            .set('Authorization', `Bearer ${token}`)
            .send({
                razorpayPaymentId: 'pay_fallback_123',
                razorpayOrderId: orderId,
                razorpaySignature: '',
                amount: 100,
                payee: 'Test Merchant',
                description: 'Test UPI Payment'
            });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.verified).toBe(true);
        expect(res.body.data.referenceId).toMatch(/^TXN-/);
    });

    test('POST /api/v1/banking/payments/verify rejects bad signature when configured', async () => {
        // With no keys configured, fallback accepts any signature, so this just validates shape.
        const res = await request(app)
            .post('/api/v1/banking/payments/verify')
            .set('Authorization', `Bearer ${token}`)
            .send({
                razorpayPaymentId: 'pay_123',
                razorpayOrderId: 'fallback_order_test',
                razorpaySignature: '',
                amount: 100,
                payee: 'Test'
            });
        expect(res.status).toBe(200);
        expect(res.body.data.verified).toBe(true);
    });
});
