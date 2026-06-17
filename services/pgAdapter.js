/**
 * PostgreSQL persistence adapter for the SQLite-backed backend.
 *
 * Strategy:
 *   - The app continues to use better-sqlite3 synchronously (fast, simple, tests pass).
 *   - When DATABASE_URL is present (e.g. Render PostgreSQL) we:
 *       1. Ensure the Postgres schema exists.
 *       2. Hydrate the local SQLite file from Postgres on startup.
 *       3. Install SQLite triggers that record every INSERT/UPDATE/DELETE in a queue table.
 *       4. Flush the queue to Postgres periodically and on graceful shutdown.
 *
 * This gives us durable, free-tier Postgres storage without rewriting ~200
 * synchronous call sites across the codebase.
 */

const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;
let flushIntervalId = null;

function getPool() {
    if (!DATABASE_URL) return null;
    if (!pool) {
        const { Pool } = require('pg');
        pool = new Pool({
            connectionString: DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        pool.on('error', (err) => {
            console.error('Postgres pool error:', err.message);
        });
    }
    return pool;
}

function isEnabled() {
    return Boolean(DATABASE_URL);
}

async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

async function ensureSchema() {
    const pg = getPool();
    if (!pg) return;

    const schemaPath = path.join(__dirname, '..', 'scripts', 'pg-schema.sql');
    if (!fs.existsSync(schemaPath)) {
        throw new Error(`Postgres schema file not found: ${schemaPath}`);
    }

    const sql = fs.readFileSync(schemaPath, 'utf8');
    const statements = sql
        .replace(/--.*$/gm, '')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    for (const stmt of statements) {
        await pg.query(stmt);
    }

    console.log('Postgres schema ensured.');
}

function getSqliteTables(sqliteDb) {
    return sqliteDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);
}

function getTableColumns(sqliteDb, table) {
    return sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
}

function getPrimaryKeyColumns(sqliteDb, table) {
    return getTableColumns(sqliteDb, table)
        .filter((c) => c.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((c) => c.name);
}

function isAutoincrementTable(sqliteDb, table) {
    const info = sqliteDb
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? AND sql LIKE '%AUTOINCREMENT%'")
        .get(table);
    return Boolean(info);
}

function toSqliteValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
}

function updateSqliteSequence(sqliteDb, table) {
    if (!isAutoincrementTable(sqliteDb, table)) return;
    try {
        const max = sqliteDb.prepare(`SELECT MAX(id) AS max_id FROM ${table}`).get();
        const seq = max && max.max_id ? max.max_id : 0;
        sqliteDb.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(table);
        if (seq > 0) {
            sqliteDb.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, seq);
        }
    } catch (e) {
        // sqlite_sequence may not exist in some configs; ignore.
    }
}

const LOAD_ORDER = [
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
    'payment_orders'
];

async function loadFromPostgres(sqliteDb) {
    const pg = getPool();
    if (!pg) return;

    const sqliteTables = new Set(getSqliteTables(sqliteDb));

    sqliteDb.exec('PRAGMA foreign_keys = OFF');
    try {
        for (const table of LOAD_ORDER) {
            if (!sqliteTables.has(table)) continue;

            const { rows } = await pg.query(`SELECT * FROM ${table}`);
            if (rows.length === 0) {
                console.log(`  ${table}: 0 rows restored`);
                continue;
            }

            // Clear local table
            sqliteDb.prepare(`DELETE FROM ${table}`).run();

            const columns = Object.keys(rows[0]);
            const colList = columns.map((c) => `"${c}"`).join(',');
            const placeholders = columns.map(() => '?').join(',');
            const insert = sqliteDb.prepare(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`);

            const insertMany = sqliteDb.transaction((rowList) => {
                for (const row of rowList) {
                    const values = columns.map((c) => toSqliteValue(row[c]));
                    insert.run(values);
                }
            });
            insertMany(rows);

            updateSqliteSequence(sqliteDb, table);
            console.log(`  ${table}: restored ${rows.length} rows`);
        }
    } finally {
        sqliteDb.exec('PRAGMA foreign_keys = ON');
    }

    console.log('Postgres -> SQLite hydration complete.');
}

function ensureQueueTable(sqliteDb) {
    sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS _pg_sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            operation TEXT NOT NULL,
            pk_json TEXT,
            row_json TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);
}

function buildJsonObjectExpr(columns, prefix) {
    const parts = columns.map((c) => `'${c}', ${prefix}.${c}`);
    return `json_object(${parts.join(', ')})`;
}

function buildPkJsonExpr(pkCols, prefix) {
    if (pkCols.length === 0) return 'NULL';
    const parts = pkCols.map((c) => `'${c}', ${prefix}.${c}`);
    return `json_object(${parts.join(', ')})`;
}

function installTriggers(sqliteDb) {
    const pg = getPool();
    if (!pg) return;

    ensureQueueTable(sqliteDb);

    const tables = getSqliteTables(sqliteDb).filter(
        (t) => !t.startsWith('sqlite_') && t !== '_pg_sync_queue'
    );

    for (const table of tables) {
        const columns = getTableColumns(sqliteDb, table).map((c) => c.name);
        const pkCols = getPrimaryKeyColumns(sqliteDb, table);

        const rowJsonNew = buildJsonObjectExpr(columns, 'NEW');
        const rowJsonOld = buildJsonObjectExpr(columns, 'OLD');
        const pkJsonNew = buildPkJsonExpr(pkCols, 'NEW');
        const pkJsonOld = buildPkJsonExpr(pkCols, 'OLD');

        sqliteDb.exec(`
            CREATE TRIGGER IF NOT EXISTS sw_pg_sync_${table}_insert
            AFTER INSERT ON ${table}
            BEGIN
                INSERT INTO _pg_sync_queue (table_name, operation, pk_json, row_json)
                VALUES ('${table}', 'INSERT', ${pkJsonNew}, ${rowJsonNew});
            END;

            CREATE TRIGGER IF NOT EXISTS sw_pg_sync_${table}_update
            AFTER UPDATE ON ${table}
            BEGIN
                INSERT INTO _pg_sync_queue (table_name, operation, pk_json, row_json)
                VALUES ('${table}', 'UPDATE', ${pkJsonNew}, ${rowJsonNew});
            END;

            CREATE TRIGGER IF NOT EXISTS sw_pg_sync_${table}_delete
            AFTER DELETE ON ${table}
            BEGIN
                INSERT INTO _pg_sync_queue (table_name, operation, pk_json, row_json)
                VALUES ('${table}', 'DELETE', ${pkJsonOld}, ${rowJsonOld});
            END;
        `);
    }

    console.log('Postgres sync triggers installed.');
}

function buildUpsertSql(table, row, pkCols) {
    const columns = Object.keys(row);
    const colList = columns.map((c) => `"${c}"`).join(',');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
    const updateCols = columns.filter((c) => !pkCols.includes(c));
    const updateClause = updateCols.length
        ? 'DO UPDATE SET ' + updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ')
        : 'DO NOTHING';
    const conflictTarget = pkCols.length ? `(${pkCols.map((c) => `"${c}"`).join(',')})` : '';
    const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT ${conflictTarget} ${updateClause}`;
    const values = columns.map((c) => row[c] ?? null);
    return { sql, values };
}

function buildDeleteSql(table, pk, pkCols) {
    const conditions = pkCols.map((c, i) => `"${c}" = $${i + 1}`).join(' AND ');
    const values = pkCols.map((c) => pk[c] ?? null);
    return { sql: `DELETE FROM ${table} WHERE ${conditions}`, values };
}

async function flush(sqliteDb) {
    const pg = getPool();
    if (!pg) return { processed: 0 };

    const queueRows = sqliteDb
        .prepare('SELECT * FROM _pg_sync_queue ORDER BY id ASC LIMIT 500')
        .all();

    if (queueRows.length === 0) return { processed: 0 };

    const client = await pg.connect();
    let processed = 0;

    try {
        await client.query('BEGIN');

        for (const item of queueRows) {
            const row = JSON.parse(item.row_json);
            const pk = item.pk_json ? JSON.parse(item.pk_json) : {};
            const pkCols = Object.keys(pk);

            if (item.operation === 'DELETE') {
                if (pkCols.length === 0) continue;
                const { sql, values } = buildDeleteSql(item.table_name, pk, pkCols);
                await client.query(sql, values);
            } else {
                // INSERT or UPDATE -> upsert
                if (pkCols.length === 0) {
                    // No primary key known; fall back to plain insert.
                    const columns = Object.keys(row);
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
                    const sql = `INSERT INTO ${item.table_name} (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`;
                    const values = columns.map((c) => row[c] ?? null);
                    await client.query(sql, values);
                } else {
                    const { sql, values } = buildUpsertSql(item.table_name, row, pkCols);
                    await client.query(sql, values);
                }
            }
            processed++;
        }

        await client.query('COMMIT');

        // Remove flushed rows from the SQLite queue (Postgres does not own this table).
        const ids = queueRows.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        sqliteDb.prepare(`DELETE FROM _pg_sync_queue WHERE id IN (${placeholders})`).run(...ids);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Postgres sync flush failed:', err.message);
        throw err;
    } finally {
        client.release();
    }

    if (processed > 0) {
        console.log(`Postgres sync flush: ${processed} row(s)`);
    }
    return { processed };
}

function startAutoFlush(sqliteDb) {
    if (flushIntervalId) return;

    // Initial flush after startup hydration completes.
    setTimeout(() => {
        flush(sqliteDb).catch((err) => console.error('Initial sync flush failed:', err.message));
    }, 2000);

    flushIntervalId = setInterval(() => {
        flush(sqliteDb).catch((err) => console.error('Periodic sync flush failed:', err.message));
    }, 15000);
}

function stopAutoFlush() {
    if (flushIntervalId) {
        clearInterval(flushIntervalId);
        flushIntervalId = null;
    }
}

async function flushAndShutdown(sqliteDb) {
    stopAutoFlush();
    try {
        await flush(sqliteDb);
    } catch (err) {
        console.error('Final sync flush failed:', err.message);
    }
    await closePool();
}

module.exports = {
    isEnabled,
    getPool,
    ensureSchema,
    loadFromPostgres,
    installTriggers,
    flush,
    startAutoFlush,
    stopAutoFlush,
    flushAndShutdown
};
