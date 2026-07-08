process.env.JWT_SECRET = 'testsecret';
const request = require('supertest');
const app = require('../server');
const { authMiddleware, requireRole, requireTier, apiKeyMiddleware } = require('../middleware/auth');

describe('Authentication API & Middleware Tests', () => {
    let accessToken;
    let refreshToken;
    const testEmail = `test-${Date.now()}@dsfinancial.in`;
    const testPassword = 'TestPassword123!';

    describe('Auth Routes', () => {
        test('should fail registration with weak password', async () => {
            const res = await request(app).post('/api/v1/auth/register').send({
                email: 'weak@example.com',
                password: 'weak',
                name: 'Weak'
            });
            expect(res.status).toBe(400);
        });

        test('should fail registration without required fields', async () => {
            const res = await request(app).post('/api/v1/auth/register').send({
                email: 'missing@example.com'
            });
            expect(res.status).toBe(400);
        });

        test('should fail with invalid email', async () => {
            const res = await request(app).post('/api/v1/auth/register').send({
                email: 'invalid-email',
                password: testPassword,
                name: 'Invalid'
            });
            expect(res.status).toBe(400);
        });

        test('should register a new user successfully', async () => {
            const res = await request(app).post('/api/v1/auth/register').send({
                email: testEmail,
                password: testPassword,
                name: 'Test User'
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            accessToken = res.body.data.tokens.accessToken;
            refreshToken = res.body.data.tokens.refreshToken;
        });

        test('should fail registration for existing user', async () => {
            const res = await request(app).post('/api/v1/auth/register').send({
                email: testEmail,
                password: testPassword,
                name: 'Test User 2'
            });
            expect(res.status).toBe(409);
        });

        test('should fail login without credentials', async () => {
            const res = await request(app).post('/api/v1/auth/login').send({});
            expect(res.status).toBe(400);
        });

        test('should login successfully', async () => {
            const res = await request(app).post('/api/v1/auth/login').send({
                email: testEmail,
                password: testPassword
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test('should fail login with wrong password', async () => {
            const res = await request(app).post('/api/v1/auth/login').send({
                email: testEmail,
                password: 'WrongPassword1!'
            });
            expect(res.status).toBe(401);
        });

        test('should fail login with non-existent user', async () => {
            const res = await request(app).post('/api/v1/auth/login').send({
                email: 'notfound@example.com',
                password: testPassword
            });
            expect(res.status).toBe(401);
        });

        test('should get user profile (me)', async () => {
            const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
            expect(res.status).toBe(200);
            expect(res.body.data.email).toContain('@');
            expect(res.body.data.email).not.toBe(testEmail);
        });

        test('should refresh token successfully', async () => {
            const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
            if (res.status !== 200) console.log('Refresh failed. Body:', res.body, 'Token:', refreshToken);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test('should fail refresh token if missing', async () => {
            const res = await request(app).post('/api/v1/auth/refresh').send({});
            expect(res.status).toBe(400);
        });
        
        test('should fail refresh with invalid token', async () => {
            const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'invalid.token.str' });
            expect(res.status).toBe(401);
        });
    });

    describe('Auth Middleware', () => {
        test('authMiddleware should block missing token', () => {
            const req = { headers: {}, path: '/api/v1/auth/me', method: 'GET' };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            authMiddleware(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        test('authMiddleware should block invalid token format', () => {
            const req = { headers: { authorization: 'Bearer ' }, path: '/api/v1/auth/me', method: 'GET' };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            authMiddleware(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        test('requireRole should block unauthorized user', () => {
            const req = { user: { role: 'user' } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            requireRole('admin')(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('requireRole should allow authorized user', () => {
            const req = { user: { role: 'admin' } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            requireRole('admin')(req, res, next);
            expect(next).toHaveBeenCalled();
        });

        test('requireTier should block insufficient tier', () => {
            const req = { user: { tier: 'free' } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            requireTier('pro', 'enterprise')(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('requireTier should allow valid tier', () => {
            const req = { user: { tier: 'pro' } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            requireTier('pro', 'enterprise')(req, res, next);
            expect(next).toHaveBeenCalled();
        });

        test('apiKeyMiddleware should block missing api key', () => {
            const req = { headers: {} };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            apiKeyMiddleware(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
        });
        
        test('apiKeyMiddleware should return 501 when key is provided', () => {
            const req = { headers: { 'x-api-key': 'test' } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            apiKeyMiddleware(req, res, next);
            expect(res.status).toHaveBeenCalledWith(501);
        });
    });
});
