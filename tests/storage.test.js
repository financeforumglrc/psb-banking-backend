process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long-for-jwt';
const request = require('supertest');
const app = require('../server');

describe('Storage Status API', () => {
    test('GET /api/v1/storage returns 200 with durability mode', async () => {
        const res = await request(app).get('/api/v1/storage');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(['durable', 'ephemeral']).toContain(res.body.mode);
        expect(['postgresql', 'sqlite']).toContain(res.body.engine);
        expect(res.body.sqlite).toBeDefined();
        expect(res.body.sqlite.path).toBeDefined();
    });

    test('GET /api/v1/storage reports SQLite-only mode as ephemeral when no DATABASE_URL', async () => {
        // Tests run without DATABASE_URL, so the adapter should report sqlite/ephemeral.
        const res = await request(app).get('/api/v1/storage');
        if (!process.env.DATABASE_URL) {
            expect(res.body.engine).toBe('sqlite');
            expect(res.body.mode).toBe('ephemeral');
            expect(res.body.postgresConnected).toBe(false);
        }
    });

    test('GET /api/v1/health returns 200 with database info', async () => {
        const res = await request(app).get('/api/v1/health');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.dbPath).toBeDefined();
    });
});
