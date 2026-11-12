process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long-for-jwt';

// Mock the pg Pool so loadFromPostgres/backfill runs against a fake Postgres.
const insertCalls = [];
const mockQuery = jest.fn((text, params) => {
    if (text.includes('information_schema.columns')) {
        // columns for the 'users' table
        return Promise.resolve({
            rows: [
                { column_name: 'id', data_type: 'integer' },
                { column_name: 'email', data_type: 'text' },
                { column_name: 'is_active', data_type: 'boolean' },
            ],
        });
    }
    if (/^SELECT \* FROM/i.test(text)) {
        // Postgres is empty -> triggers backfill
        return Promise.resolve({ rows: [] });
    }
    if (/^INSERT INTO/i.test(text)) {
        insertCalls.push({ text, params });
        return Promise.resolve({ rowCount: 1 });
    }
    return Promise.resolve({ rows: [] });
});

jest.mock('pg', () => ({
    Pool: class MockPool {
        constructor() { this.queries = []; }
        query(text, params) { return mockQuery(text, params); }
        on() {}
        end() { return Promise.resolve(); }
    },
}));

process.env.DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';

const Database = require('better-sqlite3');
const { loadFromPostgres } = require('../services/pgAdapter');

describe('pgAdapter backfill (first connect with empty Postgres)', () => {
    test('uploads pre-existing SQLite rows to Postgres instead of dropping them', async () => {
        const db = new Database(':memory:');
        db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, is_active INTEGER)`);
        db.prepare(`INSERT INTO users (id, email, is_active) VALUES (1, 'a@b.com', 1), (2, 'c@d.com', 0)`).run();

        insertCalls.length = 0;
        await loadFromPostgres(db);

        // Must have issued an INSERT for each backfilled row (2 rows).
        const inserts = insertCalls.filter((c) => /^INSERT INTO "?users"?/i.test(c.text));
        expect(inserts.length).toBe(2);
        // Boolean conversion: is_active 1 -> true, 0 -> false.
        const activeRow = inserts.find((c) => c.params[1] === 'a@b.com');
        expect(activeRow).toBeDefined();
        expect(activeRow.params[2]).toBe(true);
    });
});
