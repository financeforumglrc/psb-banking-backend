process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long-for-jwt';
const request = require('supertest');
const app = require('../server');

describe('Device Fingerprint Integration', () => {
    const testEmail = `device-test-${Date.now()}@dsfinancial.in`;
    const testPassword = 'TestPassword123!';
    const visitorId = `fpjs-${Date.now()}`;
    let accessToken;
    let deviceId;

    test('should register user and store trusted first fingerprint', async () => {
        const res = await request(app).post('/api/v1/auth/register').send({
            email: testEmail,
            password: testPassword,
            name: 'Device Test',
            fingerprint: { visitorId, fingerprintHash: visitorId }
        });
        expect(res.status).toBe(201);
        accessToken = res.body.data.tokens.accessToken;
    });

    test('should list devices with trusted first device', async () => {
        const res = await request(app).get('/api/v1/auth/devices')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.data[0].isTrusted).toBe(true);
        deviceId = res.body.data[0].id;
    });

    test('should untrust and re-trust device', async () => {
        const untrust = await request(app).post('/api/v1/auth/trust-device')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ deviceId, trusted: false });
        expect(untrust.status).toBe(200);

        const devices = await request(app).get('/api/v1/auth/devices')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(devices.body.data[0].isTrusted).toBe(false);

        const trust = await request(app).post('/api/v1/auth/trust-device')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ deviceId, trusted: true });
        expect(trust.status).toBe(200);
    });

    test('should reduce risk for trusted device', async () => {
        const res = await request(app).post('/api/v1/protect-wealth-action').send({
            user_id: `USR-${Date.now()}`,
            amount: 1000,
            historical_avg_amount: 500,
            seconds_since_login: 300,
            visitor_id: visitorId,
            fingerprint_hash: visitorId
        });
        expect(res.status).toBe(200);
        expect(res.body.device).toBeDefined();
    });

    test('should reject trust-device for another users device', async () => {
        const other = await request(app).post('/api/v1/auth/register').send({
            email: `other-${Date.now()}@dsfinancial.in`,
            password: testPassword,
            name: 'Other'
        });
        const otherToken = other.body.data.tokens.accessToken;

        const res = await request(app).post('/api/v1/auth/trust-device')
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ deviceId, trusted: false });
        expect(res.status).toBe(404);
    });
});
