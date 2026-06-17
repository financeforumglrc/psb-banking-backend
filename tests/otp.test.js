process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long-for-jwt';
process.env.SENDGRID_API_KEY = ''; // Force console fallback
const request = require('supertest');
const app = require('../server');

describe('OTP API', () => {
    const testEmail = `otp-test-${Date.now()}@dsfinancial.in`;
    const userId = `USR-${Date.now()}`;
    let plainOtp = null;

    test('should reject send without email or userId', async () => {
        const res = await request(app).post('/api/v1/otp/send').send({});
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('RECIPIENT_MISSING');
    });

    test('should send OTP by email', async () => {
        const res = await request(app).post('/api/v1/otp/send').send({
            email: testEmail,
            purpose: 'test-transfer'
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.recipient).toContain('*');
        expect(res.body.data.provider).toBe('console');
        // Extract OTP from console fallback logs is not possible here; we use verify with wrong code first.
    });

    test('should reject invalid OTP format', async () => {
        const res = await request(app).post('/api/v1/otp/verify').send({
            email: testEmail,
            otp: '123',
            purpose: 'test-transfer'
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_OTP_FORMAT');
    });

    test('should reject wrong OTP and track attempts', async () => {
        const res = await request(app).post('/api/v1/otp/verify').send({
            email: testEmail,
            otp: '000000',
            purpose: 'test-transfer'
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_OTP');
        expect(res.body.data.attempts_remaining).toBeGreaterThanOrEqual(0);
    });

    test('should reject send with invalid email', async () => {
        const res = await request(app).post('/api/v1/otp/send').send({
            email: 'not-an-email',
            purpose: 'test-transfer'
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_EMAIL');
    });

    test('should reject verify for expired/nonexistent OTP', async () => {
        const res = await request(app).post('/api/v1/otp/verify').send({
            email: 'missing@dsfinancial.in',
            otp: '123456',
            purpose: 'test-transfer'
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('OTP_NOT_FOUND');
    });

    test('should send OTP by userId fallback when user not found', async () => {
        const res = await request(app).post('/api/v1/otp/send').send({
            userId: userId,
            purpose: 'user-id-test'
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('EMAIL_NOT_FOUND');
    });
});
