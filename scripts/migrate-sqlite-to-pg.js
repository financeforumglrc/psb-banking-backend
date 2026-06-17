/**
 * One-way migration script: SQLite → PostgreSQL
 *
 * Usage:
 *   export DATABASE_URL=postgresql://...
 *   node scripts/migrate-sqlite-to-pg.js
 *
 * It reads every table from the local SQLite file and inserts rows into Postgres.
 * It is idempotent-ish: it truncates Postgres tables before copying.
 */

const path = require('path');
const sqlite3 = require('better-sqlite3');
const { Pool } = require('pg');

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'ds_financial.db');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('FATAL: DATABASE_URL env var is required');
    process.exit(1);
}

const sqlite = new sqlite3(dbPath);
const pg = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

const tables = [
    'users',
    'calculations',
    'sessions',
    'ai_runs',
    'server_quota',
    'extractions',
    'device_ids',
    'financial_models',
    'model_versions',
    'model_comments',
    'saved_scenarios',
    'bank_accounts',
    'transactions',
    'beneficiaries',
    'cards',
    'bills',
    'subscriptions',
    'kyc_records',
    'goals',
    'user_assets',
    'loans',
    'recurring_payments',
    'audit_logs',
    'device_fingerprints',
    'otp_attempts',
    'payment_orders',
];

async function migrate() {
    console.log(`Migrating from ${dbPath} to PostgreSQL...`);

    for (const table of tables) {
        try {
            const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
            if (rows.length === 0) {
                console.log(`  ${table}: 0 rows`);
                continue;
            }

            // Clear Postgres table
            await pg.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);

            const columns = Object.keys(rows[0]);
            const colList = columns.map(c => `"${c}"`).join(',');
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
            const insertSql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`;
            const insert = await pg.prepare(insertSql);

            for (const row of rows) {
                const values = columns.map(c => row[c] ?? null);
                await pg.query(insertSql, values);
            }
            console.log(`  ${table}: migrated ${rows.length} rows`);
        } catch (err) {
            console.error(`  ${table}: ${err.message}`);
        }
    }

    sqlite.close();
    await pg.end();
    console.log('Migration complete.');
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
