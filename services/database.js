/**
 * SQLite Database Service
 * Provides persistent storage for DS Financial API
 *
 * When DATABASE_URL is set (e.g. Render PostgreSQL), the service uses a
 * Postgres-backed persistence adapter: it hydrates SQLite from Postgres on
 * startup, records every local mutation in a sync queue, and flushes that
 * queue to Postgres in the background. This preserves the existing
 * synchronous better-sqlite3 API used throughout the codebase.
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const pgAdapter = require('./pgAdapter');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'ds_financial.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

let readyPromise = Promise.resolve();

function initializeDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            role TEXT DEFAULT 'user',
            tier TEXT DEFAULT 'free',
            pan_number TEXT,
            gstin TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            last_login TEXT,
            api_usage_total INTEGER DEFAULT 0,
            api_usage_month INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS calculations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            type TEXT NOT NULL,
            input_data TEXT,
            result_data TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_calculations_user ON calculations(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

        -- Phase 2 v2: AI audit & quota tables
        CREATE TABLE IF NOT EXISTS ai_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT,
            task TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER,
            output_tokens INTEGER,
            latency_ms INTEGER,
            cost_usd_estimate REAL,
            success INTEGER DEFAULT 1,
            error_message TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS server_quota (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            date TEXT NOT NULL,
            extract_used INTEGER DEFAULT 0,
            chat_used INTEGER DEFAULT 0,
            explain_used INTEGER DEFAULT 0,
            memo_used INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS extractions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT,
            pdf_hash TEXT NOT NULL UNIQUE,
            storage_path TEXT,
            filename TEXT,
            size_bytes INTEGER,
            company_name TEXT,
            ticker TEXT,
            result_json TEXT,
            overall_confidence REAL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS device_ids (
            device_id TEXT PRIMARY KEY,
            first_seen TEXT DEFAULT (datetime('now')),
            last_seen TEXT DEFAULT (datetime('now')),
            extract_count_today INTEGER DEFAULT 0,
            chat_count_today INTEGER DEFAULT 0,
            explain_count_today INTEGER DEFAULT 0,
            quota_date TEXT DEFAULT (date('now'))
        );

        CREATE TABLE IF NOT EXISTS financial_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT,
            slug TEXT UNIQUE,
            company_name TEXT NOT NULL,
            ticker TEXT,
            exchange TEXT,
            is_public INTEGER DEFAULT 0,
            model_json TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_ai_runs_device ON ai_runs(device_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_extractions_hash ON extractions(pdf_hash);
        CREATE INDEX IF NOT EXISTS idx_models_device ON financial_models(device_id);
        CREATE INDEX IF NOT EXISTS idx_models_slug ON financial_models(slug);
        CREATE INDEX IF NOT EXISTS idx_models_public ON financial_models(is_public);

        -- Phase 4: Model versioning
        CREATE TABLE IF NOT EXISTS model_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            version_number INTEGER NOT NULL,
            model_json TEXT NOT NULL,
            change_summary TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (model_id) REFERENCES financial_models(id)
        );

        -- Phase 4: Model comments/annotations
        CREATE TABLE IF NOT EXISTS model_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            cell_id TEXT,
            comment TEXT NOT NULL,
            author TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (model_id) REFERENCES financial_models(id)
        );

        -- Phase 4: Saved scenarios
        CREATE TABLE IF NOT EXISTS saved_scenarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT,
            model_id INTEGER,
            name TEXT NOT NULL,
            scenario_key TEXT,
            assumptions_json TEXT NOT NULL,
            intrinsic_value REAL,
            is_public INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- Banking Schema (PSB SecureWealth)
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            account_number TEXT UNIQUE NOT NULL,
            account_type TEXT NOT NULL DEFAULT 'savings',
            balance REAL NOT NULL DEFAULT 0,
            ifsc TEXT,
            branch TEXT,
            status TEXT DEFAULT 'active',
            opened_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            from_account TEXT,
            to_account TEXT,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'completed',
            reference_id TEXT UNIQUE,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS beneficiaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            account_number TEXT,
            ifsc TEXT,
            bank_name TEXT,
            upi_id TEXT,
            verified INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            card_number_masked TEXT NOT NULL,
            expiry TEXT,
            cvv_masked TEXT,
            card_type TEXT DEFAULT 'debit',
            status TEXT DEFAULT 'active',
            limit_daily REAL DEFAULT 50000,
            limit_monthly REAL DEFAULT 500000,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT,
            amount REAL NOT NULL,
            due_date TEXT,
            status TEXT DEFAULT 'upcoming',
            is_recurring INTEGER DEFAULT 0,
            frequency TEXT DEFAULT 'monthly',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            billing_cycle TEXT DEFAULT 'monthly',
            next_billing TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS kyc_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            pan_number TEXT,
            aadhaar_masked TEXT,
            kyc_status TEXT DEFAULT 'pending',
            verified_at TEXT,
            ekyc_reference TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS aa_consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            bank_name TEXT NOT NULL,
            account_mask TEXT,
            consent_id TEXT UNIQUE,
            status TEXT DEFAULT 'active',
            scopes TEXT,
            linked_at TEXT DEFAULT (datetime('now')),
            created_at TEXT DEFAULT (datetime('now'))
            -- Guest/demo users may create AA consents before full registration,
            -- so no foreign-key constraint is enforced on user_id.
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            target_amount REAL NOT NULL,
            current_amount REAL DEFAULT 0,
            deadline TEXT,
            goal_type TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS user_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            asset_type TEXT,
            value REAL DEFAULT 0,
            liquidity TEXT,
            returns REAL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_versions_model ON model_versions(model_id, version_number);
        CREATE INDEX IF NOT EXISTS idx_comments_model ON model_comments(model_id, cell_id);
        CREATE INDEX IF NOT EXISTS idx_scenarios_device ON saved_scenarios(device_id);
        CREATE INDEX IF NOT EXISTS idx_accounts_user ON bank_accounts(user_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);
        CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

        -- Phase 3: Comprehensive banking tables
        CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            loan_type TEXT NOT NULL,
            principal_amount REAL NOT NULL,
            interest_rate REAL NOT NULL,
            tenure_months INTEGER NOT NULL,
            emi_amount REAL NOT NULL,
            total_payable REAL NOT NULL,
            amount_paid REAL DEFAULT 0,
            next_due_date TEXT,
            status TEXT DEFAULT 'active',
            purpose TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS recurring_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            frequency TEXT DEFAULT 'monthly',
            category TEXT,
            account_id INTEGER,
            beneficiary_id INTEGER,
            start_date TEXT,
            end_date TEXT,
            next_execution TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            old_value TEXT,
            new_value TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);
        CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_payments(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at);

        -- SecureWealth Twin: real device fingerprinting
        CREATE TABLE IF NOT EXISTS device_fingerprints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            visitor_id TEXT NOT NULL,
            fingerprint_hash TEXT NOT NULL,
            first_seen TEXT DEFAULT (datetime('now')),
            last_seen TEXT DEFAULT (datetime('now')),
            is_trusted INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON device_fingerprints(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_device_fingerprints_visitor ON device_fingerprints(user_id, visitor_id);

        -- OTP attempts table (email-based OTP flow)
        CREATE TABLE IF NOT EXISTS otp_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            purpose TEXT NOT NULL DEFAULT 'secure transaction',
            attempts INTEGER DEFAULT 0,
            expires_at TEXT NOT NULL,
            verified INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_otp_recipient ON otp_attempts(recipient, purpose, expires_at);
        CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_attempts(expires_at);
    `);

    // Migration: remove legacy foreign-key constraint from aa_consents
    try {
        const aaFkInfo = db.prepare("PRAGMA foreign_key_list('aa_consents')").all();
        if (aaFkInfo.length > 0) {
            db.prepare('PRAGMA foreign_keys = OFF').run();
            db.prepare(`CREATE TABLE IF NOT EXISTS aa_consents_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                bank_name TEXT NOT NULL,
                account_mask TEXT,
                consent_id TEXT UNIQUE,
                status TEXT DEFAULT 'active',
                scopes TEXT,
                linked_at TEXT DEFAULT (datetime('now')),
                created_at TEXT DEFAULT (datetime('now'))
            )`).run();
            db.prepare(`INSERT INTO aa_consents_new SELECT * FROM aa_consents`).run();
            db.prepare(`DROP TABLE aa_consents`).run();
            db.prepare(`ALTER TABLE aa_consents_new RENAME TO aa_consents`).run();
            db.prepare('PRAGMA foreign_keys = ON').run();
        }
    } catch (migrationErr) {
        console.warn('AA consents migration skipped:', migrationErr.message);
    }

    // Migration: add face_descriptor column for biometric login
    try {
        db.exec(`ALTER TABLE users ADD COLUMN face_descriptor TEXT`);
        console.log('Migration applied: added face_descriptor column');
    } catch (e) {
        // Column likely already exists
    }

    // Migration: add aadhar column for KYC
    try {
        db.exec(`ALTER TABLE users ADD COLUMN aadhar TEXT`);
        console.log('Migration applied: added aadhar column');
    } catch (e) {
        // Column likely already exists
    }

    // Phase 1: Account Aggregator mock tables (PSB-only demo)
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS aa_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consent_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                account_id TEXT UNIQUE NOT NULL,
                account_number_masked TEXT,
                account_type TEXT,
                bank_name TEXT,
                currency TEXT DEFAULT 'INR',
                balance REAL DEFAULT 0,
                status TEXT DEFAULT 'active',
                discovered_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_aa_accounts_consent ON aa_accounts(consent_id);
            CREATE INDEX IF NOT EXISTS idx_aa_accounts_user ON aa_accounts(user_id);

            CREATE TABLE IF NOT EXISTS aa_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                txn_id TEXT UNIQUE NOT NULL,
                txn_date TEXT,
                description TEXT,
                amount REAL,
                type TEXT,
                category TEXT,
                balance_after REAL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_aa_transactions_account ON aa_transactions(account_id, txn_date);
        `);
        console.log('Migration applied: aa_accounts / aa_transactions tables ready');
    } catch (e) {
        console.warn('AA tables migration skipped:', e.message);
    }

    // Migration: add SETU AA tracking columns to aa_consents
    try {
        db.exec(`ALTER TABLE aa_consents ADD COLUMN setu_request_id TEXT`);
        console.log('Migration applied: added setu_request_id column');
    } catch (e) { /* column likely exists */ }
    try {
        db.exec(`ALTER TABLE aa_consents ADD COLUMN setu_consent_url TEXT`);
        console.log('Migration applied: added setu_consent_url column');
    } catch (e) { /* column likely exists */ }
    try {
        db.exec(`ALTER TABLE aa_consents ADD COLUMN setu_status TEXT`);
        console.log('Migration applied: added setu_status column');
    } catch (e) { /* column likely exists */ }

    console.log('SQLite database initialized');

    if (pgAdapter.isEnabled()) {
        readyPromise = (async () => {
            const maxRetries = 5;
            const delayMs = 3000;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`DATABASE_URL detected; enabling PostgreSQL persistence adapter (attempt ${attempt}/${maxRetries})...`);
                    await pgAdapter.ensureSchema();
                    await pgAdapter.loadFromPostgres(db);
                    pgAdapter.installTriggers(db);
                    pgAdapter.startAutoFlush(db);
                    console.log('PostgreSQL persistence adapter ready.');
                    return;
                } catch (err) {
                    console.error(`PostgreSQL persistence adapter attempt ${attempt} failed:`, err.message);
                    if (attempt === maxRetries) {
                        console.error('Falling back to SQLite-only mode. Data will NOT persist across redeploys.');
                        return;
                    }
                    await new Promise((r) => setTimeout(r, delayMs));
                }
            }
        })();
    }
}

const userDb = {
    create: (user) => {
        const stmt = db.prepare(`
            INSERT INTO users (id, email, password, name, phone, role, tier, pan_number, aadhar)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(user.id, user.email, user.password, user.name, user.phone || null, user.role || 'user', user.tier || 'free', user.pan_number || null, user.aadhar || null);
    },

    findByEmail: (email) => {
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        return stmt.get(email);
    },

    findById: (id) => {
        const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id);
    },

    updateLastLogin: (id) => {
        const stmt = db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?");
        return stmt.run(id);
    },

    updateApiUsage: (id, total, month) => {
        const stmt = db.prepare('UPDATE users SET api_usage_total = ?, api_usage_month = ? WHERE id = ?');
        return stmt.run(total, month, id);
    },

    updateFaceDescriptor: (id, descriptor) => {
        const stmt = db.prepare('UPDATE users SET face_descriptor = ? WHERE id = ?');
        return stmt.run(descriptor, id);
    },

    findByFaceDescriptor: () => {
        const stmt = db.prepare('SELECT id, email, name, role, tier, face_descriptor FROM users WHERE face_descriptor IS NOT NULL');
        return stmt.all();
    }
};

const calculationDb = {
    create: (calculation) => {
        const stmt = db.prepare(`
            INSERT INTO calculations (user_id, type, input_data, result_data)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(calculation.userId, calculation.type, calculation.inputData, calculation.resultData);
    },

    getByUser: (userId, limit = 50) => {
        const stmt = db.prepare('SELECT * FROM calculations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?');
        return stmt.all(userId, limit);
    }
};

const sessionDb = {
    create: (session) => {
        const stmt = db.prepare(`
            INSERT INTO sessions (user_id, refresh_token, expires_at)
            VALUES (?, ?, ?)
        `);
        return stmt.run(session.userId, session.refreshToken, session.expiresAt);
    },

    findByToken: (token) => {
        const stmt = db.prepare('SELECT * FROM sessions WHERE refresh_token = ? AND expires_at > datetime(\'now\')');
        return stmt.get(token);
    },

    delete: (token) => {
        const stmt = db.prepare('DELETE FROM sessions WHERE refresh_token = ?');
        return stmt.run(token);
    },

    deleteExpired: () => {
        const stmt = db.prepare('DELETE FROM sessions WHERE expires_at <= datetime(\'now\')');
        return stmt.run();
    }
};

initializeDatabase();

// MSME CreditBridge AI tables
db.exec(`
    CREATE TABLE IF NOT EXISTS msme_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        application_ref TEXT UNIQUE NOT NULL,
        business_name TEXT NOT NULL,
        udyam_number TEXT,
        gstin TEXT,
        pan_number TEXT,
        aadhaar_masked TEXT,
        enterprise_type TEXT DEFAULT 'micro',
        annual_turnover REAL DEFAULT 0,
        employees INTEGER DEFAULT 0,
        requested_amount REAL NOT NULL,
        requested_tenure INTEGER NOT NULL,
        purpose TEXT,
        consent_gst INTEGER DEFAULT 0,
        consent_aa INTEGER DEFAULT 0,
        consent_upi INTEGER DEFAULT 0,
        status TEXT DEFAULT 'scoring',
        decision TEXT,
        decision_reason TEXT,
        scored_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS msme_credit_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL UNIQUE,
        score INTEGER NOT NULL,
        category TEXT NOT NULL,
        factors_json TEXT NOT NULL,
        eli5 TEXT,
        recommendations_json TEXT,
        fraud_signals_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (application_id) REFERENCES msme_applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS msme_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL,
        file_name TEXT,
        storage_path TEXT,
        verification_status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (application_id) REFERENCES msme_applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS msme_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        offer_type TEXT NOT NULL DEFAULT 'primary',
        principal_amount REAL NOT NULL,
        interest_rate REAL NOT NULL,
        tenure_months INTEGER NOT NULL,
        emi_amount REAL NOT NULL,
        total_interest REAL NOT NULL,
        total_repayment REAL NOT NULL,
        processing_fee REAL DEFAULT 0,
        gst_on_fees REAL DEFAULT 0,
        cgtmse_applicable INTEGER DEFAULT 0,
        cgtmse_guarantee_percent REAL DEFAULT 0,
        cgtmse_guaranteed_amount REAL DEFAULT 0,
        collateral_required INTEGER DEFAULT 0,
        conditions_json TEXT,
        status TEXT DEFAULT 'offered',
        accepted_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (application_id) REFERENCES msme_applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS msme_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (application_id) REFERENCES msme_applications(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_msme_applications_user ON msme_applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_msme_applications_status ON msme_applications(status);
    CREATE INDEX IF NOT EXISTS idx_msme_applications_ref ON msme_applications(application_ref);
    CREATE INDEX IF NOT EXISTS idx_msme_applications_created ON msme_applications(created_at);
    CREATE INDEX IF NOT EXISTS idx_msme_scores_app ON msme_credit_scores(application_id);
    CREATE INDEX IF NOT EXISTS idx_msme_documents_app ON msme_documents(application_id);
    CREATE INDEX IF NOT EXISTS idx_msme_offers_app ON msme_offers(application_id);
    CREATE INDEX IF NOT EXISTS idx_msme_audit_app ON msme_audit_logs(application_id);
`);

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

const msmeDb = {
    createApplication: (data) => {
        const stmt = db.prepare(`INSERT INTO msme_applications
            (user_id, application_ref, business_name, udyam_number, gstin, pan_number, aadhaar_masked, enterprise_type,
             annual_turnover, employees, requested_amount, requested_tenure, purpose,
             consent_gst, consent_aa, consent_upi, status, decision, decision_reason, scored_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(
            data.userId, data.applicationRef, data.businessName, data.udyamNumber || null,
            data.gstin || null, data.panNumber || null, data.aadhaarMasked || null,
            data.enterpriseType || 'micro', data.annualTurnover || 0, data.employees || 0,
            data.requestedAmount, data.requestedTenure, data.purpose || null,
            data.consentGst ? 1 : 0, data.consentAa ? 1 : 0, data.consentUpi ? 1 : 0,
            data.status || 'scoring', data.decision || null, data.decisionReason || null,
            data.scoredAt || null
        );
    },
    getApplicationById: (id) => {
        const row = db.prepare('SELECT * FROM msme_applications WHERE id = ?').get(id);
        if (!row) return null;
        return {
            ...row,
            consentGst: !!row.consent_gst,
            consentAa: !!row.consent_aa,
            consentUpi: !!row.consent_upi,
            cgtmseApplicable: false,
        };
    },
    getApplicationsByUser: (userId, limit = 50) => {
        return db.prepare('SELECT * FROM msme_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
    },
    getApplications: (filters = {}) => {
        let sql = `SELECT a.*, u.name AS user_name, u.email AS user_email FROM msme_applications a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
        const params = [];
        if (filters.status) { sql += ' AND a.status = ?'; params.push(filters.status); }
        if (filters.decision) { sql += ' AND a.decision = ?'; params.push(filters.decision); }
        if (filters.userId) { sql += ' AND a.user_id = ?'; params.push(filters.userId); }
        if (filters.q) {
            sql += ` AND (a.application_ref LIKE ? OR a.business_name LIKE ? OR u.name LIKE ? OR u.email LIKE ?)`;
            const like = `%${filters.q}%`;
            params.push(like, like, like, like);
        }
        const countRow = db.prepare(`SELECT COUNT(*) as total FROM msme_applications a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1 ${sql.split('WHERE 1=1')[1] || ''}`).get(...params);
        const allowedSort = ['created_at', 'updated_at', 'requested_amount'].includes(filters.sort) ? filters.sort : 'created_at';
        const dir = filters.order && filters.order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        sql += ` ORDER BY a.${allowedSort} ${dir}`;
        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.max(1, Math.min(500, parseInt(filters.limit) || 50));
        const offset = (page - 1) * limit;
        sql += ' LIMIT ? OFFSET ?';
        const rows = db.prepare(sql).all(...params, limit, offset);
        return { applications: rows, total: countRow.total, page, limit, pages: Math.ceil(countRow.total / limit) };
    },
    updateApplication: (id, data) => {
        const stmt = db.prepare(`UPDATE msme_applications SET
            status = COALESCE(?, status),
            decision = COALESCE(?, decision),
            decision_reason = COALESCE(?, decision_reason),
            scored_at = COALESCE(?, scored_at),
            updated_at = datetime('now')
            WHERE id = ?`);
        return stmt.run(data.status || null, data.decision || null, data.decisionReason || null, data.scoredAt || null, id);
    },
    deleteApplication: (id) => db.prepare('DELETE FROM msme_applications WHERE id = ?').run(id),

    createScore: (data) => {
        const stmt = db.prepare(`INSERT INTO msme_credit_scores
            (application_id, score, category, factors_json, eli5, recommendations_json, fraud_signals_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(
            data.applicationId, data.score, data.category,
            JSON.stringify(data.factors || []),
            data.eli5 || null,
            JSON.stringify(data.recommendations || []),
            JSON.stringify(data.fraudSignals || [])
        );
    },
    getScoreByApplication: (applicationId) => {
        const row = db.prepare('SELECT * FROM msme_credit_scores WHERE application_id = ?').get(applicationId);
        if (!row) return null;
        return {
            ...row,
            factors: safeJsonParse(row.factors_json, []),
            recommendations: safeJsonParse(row.recommendations_json, []),
            fraudSignals: safeJsonParse(row.fraud_signals_json, [])
        };
    },

    createDocument: (data) => {
        const stmt = db.prepare(`INSERT INTO msme_documents (application_id, doc_type, file_name, storage_path, verification_status) VALUES (?, ?, ?, ?, ?)`);
        return stmt.run(data.applicationId, data.docType, data.fileName || null, data.storagePath || null, data.verificationStatus || 'pending');
    },
    getDocumentsByApplication: (applicationId) => db.prepare('SELECT * FROM msme_documents WHERE application_id = ? ORDER BY created_at DESC').all(applicationId),

    createOffer: (data) => {
        const stmt = db.prepare(`INSERT INTO msme_offers
            (application_id, offer_type, principal_amount, interest_rate, tenure_months, emi_amount,
             total_interest, total_repayment, processing_fee, gst_on_fees, cgtmse_applicable,
             cgtmse_guarantee_percent, cgtmse_guaranteed_amount, collateral_required, conditions_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(
            data.applicationId, data.offerType || 'primary', data.principalAmount, data.interestRate,
            data.tenureMonths, data.emiAmount, data.totalInterest, data.totalRepayment,
            data.processingFee || 0, data.gstOnFees || 0, data.cgtmseApplicable ? 1 : 0,
            data.cgtmseGuaranteePercent || 0, data.cgtmseGuaranteedAmount || 0,
            data.collateralRequired ? 1 : 0, data.conditions ? JSON.stringify(data.conditions) : null
        );
    },
    getOffersByApplication: (applicationId) => {
        return db.prepare('SELECT * FROM msme_offers WHERE application_id = ? ORDER BY created_at DESC').all(applicationId).map(o => ({
            ...o,
            cgtmseApplicable: !!o.cgtmse_applicable,
            collateralRequired: !!o.collateral_required,
            conditions: safeJsonParse(o.conditions_json, [])
        }));
    },
    acceptOffer: (offerId) => db.prepare("UPDATE msme_offers SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?").run(offerId),

    createAuditLog: (data) => {
        const stmt = db.prepare(`INSERT INTO msme_audit_logs (application_id, user_id, action, details_json) VALUES (?, ?, ?, ?)`);
        return stmt.run(data.applicationId, data.userId, data.action, JSON.stringify(data.details || {}));
    },
    getAuditLogsByApplication: (applicationId) => db.prepare('SELECT * FROM msme_audit_logs WHERE application_id = ? ORDER BY created_at DESC').all(applicationId).map(l => ({ ...l, details: safeJsonParse(l.details_json, {}) }))
};

const aiRunsDb = {
    create: (run) => {
        const stmt = db.prepare(`INSERT INTO ai_runs (device_id, task, provider, model, input_tokens, output_tokens, latency_ms, cost_usd_estimate, success, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(run.deviceId, run.task, run.provider, run.model, run.inputTokens || 0, run.outputTokens || 0, run.latencyMs || 0, run.costUsd || 0, run.success ? 1 : 0, run.errorMessage || null);
    },
    getRecent: (deviceId, limit = 50) => {
        const stmt = db.prepare('SELECT * FROM ai_runs WHERE device_id = ? ORDER BY created_at DESC LIMIT ?');
        return stmt.all(deviceId, limit);
    }
};

const quotaDb = {
    getOrCreateToday: () => {
        const today = new Date().toISOString().split('T')[0];
        let row = db.prepare('SELECT * FROM server_quota WHERE id = 1').get();
        if (!row || row.date !== today) {
            db.prepare(`INSERT OR REPLACE INTO server_quota (id, date, extract_used, chat_used, explain_used, memo_used) VALUES (1, ?, 0, 0, 0, 0)`).run(today);
            row = { date: today, extract_used: 0, chat_used: 0, explain_used: 0, memo_used: 0 };
        }
        return row;
    },
    increment: (task) => {
        const allowed = new Set(['extract', 'chat', 'explain', 'memo']);
        if (!allowed.has(task)) throw new Error('Invalid quota task');
        const col = task + '_used';
        const stmt = db.prepare(`UPDATE server_quota SET ${col} = ${col} + 1, updated_at = datetime('now') WHERE id = 1`);
        return stmt.run();
    }
};

const extractionDb = {
    create: (ex) => {
        const stmt = db.prepare(`INSERT INTO extractions (device_id, pdf_hash, storage_path, filename, size_bytes, company_name, ticker, result_json, overall_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(ex.deviceId, ex.pdfHash, ex.storagePath, ex.filename, ex.sizeBytes, ex.companyName, ex.ticker, ex.resultJson, ex.confidence);
    },
    findByHash: (hash) => {
        const stmt = db.prepare('SELECT * FROM extractions WHERE pdf_hash = ? AND created_at > datetime("now", "-30 days")');
        return stmt.get(hash);
    }
};

const deviceDb = {
    getOrCreate: (deviceId) => {
        const today = new Date().toISOString().split('T')[0];
        let row = db.prepare('SELECT * FROM device_ids WHERE device_id = ?').get(deviceId);
        if (!row) {
            db.prepare('INSERT INTO device_ids (device_id, quota_date) VALUES (?, ?)').run(deviceId, today);
            row = { device_id: deviceId, extract_count_today: 0, chat_count_today: 0, explain_count_today: 0, quota_date: today };
        } else if (row.quota_date !== today) {
            db.prepare("UPDATE device_ids SET extract_count_today = 0, chat_count_today = 0, explain_count_today = 0, quota_date = ?, last_seen = datetime('now') WHERE device_id = ?").run(today, deviceId);
            row = { ...row, extract_count_today: 0, chat_count_today: 0, explain_count_today: 0, quota_date: today };
        } else {
            db.prepare("UPDATE device_ids SET last_seen = datetime('now') WHERE device_id = ?").run(deviceId);
        }
        return row;
    },
    increment: (deviceId, task) => {
        const allowed = new Set(['extract', 'chat', 'explain', 'memo']);
        if (!allowed.has(task)) throw new Error('Invalid device quota task');
        const col = task + '_count_today';
        const stmt = db.prepare(`UPDATE device_ids SET ${col} = ${col} + 1 WHERE device_id = ?`);
        return stmt.run(deviceId);
    },
    deleteAll: (deviceId) => {
        db.prepare('DELETE FROM financial_models WHERE device_id = ?').run(deviceId);
        db.prepare('DELETE FROM extractions WHERE device_id = ?').run(deviceId);
        db.prepare('DELETE FROM ai_runs WHERE device_id = ?').run(deviceId);
        db.prepare('DELETE FROM device_ids WHERE device_id = ?').run(deviceId);
    }
};

const modelDb = {
    create: (m) => {
        const stmt = db.prepare('INSERT INTO financial_models (device_id, slug, company_name, ticker, exchange, is_public, model_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
        return stmt.run(m.deviceId, m.slug, m.companyName, m.ticker, m.exchange, m.isPublic ? 1 : 0, m.modelJson);
    },
    findBySlug: (slug) => {
        const stmt = db.prepare('SELECT * FROM financial_models WHERE slug = ?');
        return stmt.get(slug);
    },
    getPublic: () => {
        const stmt = db.prepare('SELECT * FROM financial_models WHERE is_public = 1 ORDER BY created_at DESC');
        return stmt.all();
    },
    getByDevice: (deviceId) => {
        const stmt = db.prepare('SELECT * FROM financial_models WHERE device_id = ? ORDER BY updated_at DESC');
        return stmt.all(deviceId);
    },
    update: (id, modelJson) => {
        const stmt = db.prepare("UPDATE financial_models SET model_json = ?, updated_at = datetime('now') WHERE id = ?");
        return stmt.run(modelJson, id);
    }
};

const bankingDb = {
    createAccount: (data) => {
        const stmt = db.prepare(`INSERT INTO bank_accounts (user_id, account_number, account_type, balance, ifsc, branch, status) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.accountNumber, data.type || 'savings', data.balance || 0, data.ifsc || null, data.branch || null, data.status || 'active');
    },
    getAccountsByUser: (userId) => {
        return db.prepare('SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY opened_at DESC').all(userId);
    },
    getAccountById: (id) => {
        return db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(id);
    },
    updateBalance: (accountId, newBalance) => {
        return db.prepare('UPDATE bank_accounts SET balance = ? WHERE id = ?').run(newBalance, accountId);
    },
    updateAccountStatus: (accountId, status) => {
        return db.prepare('UPDATE bank_accounts SET status = ? WHERE id = ?').run(status, accountId);
    },
    deleteAccount: (accountId) => {
        return db.prepare('DELETE FROM bank_accounts WHERE id = ?').run(accountId);
    },
    // Atomic transaction: debit/credit with balance check
    executeTransfer: (data) => {
        const { fromAccountId, toAccountId, amount, userId, type, description } = data;
        const transferRef = 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        
        const tx = db.transaction(() => {
            const fromAcc = db.prepare('SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?').get(fromAccountId, userId);
            if (!fromAcc) throw new Error('Source account not found');
            if (fromAcc.balance < amount) throw new Error('Insufficient balance');
            
            db.prepare('UPDATE bank_accounts SET balance = balance - ? WHERE id = ?').run(amount, fromAccountId);
            
            if (toAccountId) {
                const toAcc = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(toAccountId);
                if (toAcc) {
                    db.prepare('UPDATE bank_accounts SET balance = balance + ? WHERE id = ?').run(amount, toAccountId);
                }
            }
            
            const stmt = db.prepare(`INSERT INTO transactions (user_id, from_account, to_account, type, amount, description, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            const result = stmt.run(userId, fromAccountId, toAccountId || null, type, amount, description || null, 'completed', transferRef);
            return { transactionId: result.lastInsertRowid, referenceId: transferRef };
        });
        
        return tx();
    },
    getTransactionsByAccount: (accountId, userId, limit = 100) => {
        return db.prepare('SELECT * FROM transactions WHERE (from_account = ? OR to_account = ?) AND user_id = ? ORDER BY created_at DESC LIMIT ?').all(accountId, accountId, userId, limit);
    },
    getTransactionsByType: (userId, type, limit = 100) => {
        return db.prepare('SELECT * FROM transactions WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT ?').all(userId, type, limit);
    },
    getTransactionsByDateRange: (userId, startDate, endDate, limit = 500) => {
        return db.prepare("SELECT * FROM transactions WHERE user_id = ? AND date(created_at) BETWEEN ? AND ? ORDER BY created_at DESC LIMIT ?").all(userId, startDate, endDate, limit);
    },
    createTransaction: (data) => {
        const refId = data.referenceId || 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        const stmt = db.prepare(`INSERT INTO transactions (user_id, from_account, to_account, type, amount, description, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.fromAccount || null, data.toAccount || null, data.type, data.amount, data.description || null, data.status || 'completed', refId);
    },
    getTransactionsByUser: (userId, limit = 100) => {
        return db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
    },
    getTransactionByRef: (refId) => {
        return db.prepare('SELECT * FROM transactions WHERE reference_id = ?').get(refId);
    },
    createBeneficiary: (data) => {
        const stmt = db.prepare(`INSERT INTO beneficiaries (user_id, name, account_number, ifsc, bank_name, upi_id, verified) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.name, data.accountNumber || null, data.ifsc || null, data.bankName || null, data.upiId || null, data.verified ? 1 : 0);
    },
    getBeneficiariesByUser: (userId) => {
        return db.prepare('SELECT * FROM beneficiaries WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    },
    updateBeneficiary: (id, data) => {
        const stmt = db.prepare(`UPDATE beneficiaries SET name = COALESCE(?, name), account_number = COALESCE(?, account_number), ifsc = COALESCE(?, ifsc), bank_name = COALESCE(?, bank_name), upi_id = COALESCE(?, upi_id), verified = COALESCE(?, verified) WHERE id = ?`);
        return stmt.run(data.name, data.accountNumber, data.ifsc, data.bankName, data.upiId, data.verified !== undefined ? (data.verified ? 1 : 0) : undefined, id);
    },
    deleteBeneficiary: (id) => {
        return db.prepare('DELETE FROM beneficiaries WHERE id = ?').run(id);
    },
    createCard: (data) => {
        const stmt = db.prepare(`INSERT INTO cards (user_id, card_number_masked, expiry, cvv_masked, card_type, status, limit_daily, limit_monthly) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.cardNumberMasked, data.expiry, data.cvvMasked, data.cardType || 'debit', data.status || 'active', data.limitDaily || 50000, data.limitMonthly || 500000);
    },
    getCardsByUser: (userId) => {
        return db.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    },
    updateCardStatus: (cardId, status) => {
        return db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(status, cardId);
    },
    updateCardLimits: (cardId, limits) => {
        const stmt = db.prepare(`UPDATE cards SET limit_daily = COALESCE(?, limit_daily), limit_monthly = COALESCE(?, limit_monthly) WHERE id = ?`);
        return stmt.run(limits.limitDaily, limits.limitMonthly, cardId);
    },
    deleteCard: (cardId) => {
        return db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
    },
    createBill: (data) => {
        const stmt = db.prepare(`INSERT INTO bills (user_id, name, category, amount, due_date, status, is_recurring, frequency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.name, data.category || null, data.amount, data.dueDate || null, data.status || 'upcoming', data.isRecurring ? 1 : 0, data.frequency || 'monthly');
    },
    getBillsByUser: (userId) => {
        return db.prepare('SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC').all(userId);
    },
    updateBillStatus: (billId, status) => {
        return db.prepare('UPDATE bills SET status = ? WHERE id = ?').run(status, billId);
    },
    updateBill: (billId, data) => {
        const stmt = db.prepare(`UPDATE bills SET name = COALESCE(?, name), category = COALESCE(?, category), amount = COALESCE(?, amount), due_date = COALESCE(?, due_date), is_recurring = COALESCE(?, is_recurring), frequency = COALESCE(?, frequency) WHERE id = ?`);
        return stmt.run(data.name, data.category, data.amount, data.dueDate, data.isRecurring !== undefined ? (data.isRecurring ? 1 : 0) : undefined, data.frequency, billId);
    },
    deleteBill: (billId) => {
        return db.prepare('DELETE FROM bills WHERE id = ?').run(billId);
    },
    createSubscription: (data) => {
        const stmt = db.prepare(`INSERT INTO subscriptions (user_id, name, amount, billing_cycle, next_billing, status) VALUES (?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.name, data.amount, data.billingCycle || 'monthly', data.nextBilling || null, data.status || 'active');
    },
    getSubscriptionsByUser: (userId) => {
        return db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY next_billing ASC').all(userId);
    },
    updateSubscription: (id, data) => {
        const stmt = db.prepare(`UPDATE subscriptions SET name = COALESCE(?, name), amount = COALESCE(?, amount), billing_cycle = COALESCE(?, billing_cycle), next_billing = COALESCE(?, next_billing), status = COALESCE(?, status) WHERE id = ?`);
        return stmt.run(data.name, data.amount, data.billingCycle, data.nextBilling, data.status, id);
    },
    deleteSubscription: (id) => {
        return db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
    },
    createGoal: (data) => {
        const stmt = db.prepare(`INSERT INTO goals (user_id, name, target_amount, current_amount, deadline, goal_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.name, data.targetAmount, data.currentAmount || 0, data.deadline || null, data.goalType || null, data.status || 'active');
    },
    getGoalsByUser: (userId) => {
        return db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    },
    updateGoalAmount: (goalId, currentAmount) => {
        return db.prepare('UPDATE goals SET current_amount = ? WHERE id = ?').run(currentAmount, goalId);
    },
    updateGoal: (goalId, data) => {
        const stmt = db.prepare(`UPDATE goals SET name = COALESCE(?, name), target_amount = COALESCE(?, target_amount), current_amount = COALESCE(?, current_amount), deadline = COALESCE(?, deadline), goal_type = COALESCE(?, goal_type), status = COALESCE(?, status) WHERE id = ?`);
        return stmt.run(data.name, data.targetAmount, data.currentAmount, data.deadline, data.goalType, data.status, goalId);
    },
    deleteGoal: (goalId) => {
        return db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);
    },
    // ========== LOANS ==========
    createLoan: (data) => {
        const stmt = db.prepare(`INSERT INTO loans (user_id, loan_type, principal_amount, interest_rate, tenure_months, emi_amount, total_payable, next_due_date, status, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.loanType, data.principalAmount, data.interestRate, data.tenureMonths, data.emiAmount, data.totalPayable, data.nextDueDate, data.status || 'active', data.purpose || null);
    },
    getLoansByUser: (userId) => {
        return db.prepare('SELECT * FROM loans WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    },
    updateLoanPayment: (loanId, amountPaid, nextDueDate) => {
        return db.prepare('UPDATE loans SET amount_paid = amount_paid + ?, next_due_date = ? WHERE id = ?').run(amountPaid, nextDueDate, loanId);
    },
    updateLoanStatus: (loanId, status) => {
        return db.prepare('UPDATE loans SET status = ? WHERE id = ?').run(status, loanId);
    },
    // ========== RECURRING PAYMENTS ==========
    createRecurring: (data) => {
        const stmt = db.prepare(`INSERT INTO recurring_payments (user_id, name, amount, frequency, category, account_id, beneficiary_id, start_date, end_date, next_execution, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.name, data.amount, data.frequency || 'monthly', data.category || null, data.accountId || null, data.beneficiaryId || null, data.startDate || null, data.endDate || null, data.nextExecution || null, data.status || 'active');
    },
    getRecurringByUser: (userId) => {
        return db.prepare('SELECT * FROM recurring_payments WHERE user_id = ? ORDER BY next_execution ASC').all(userId);
    },
    updateRecurring: (id, data) => {
        const stmt = db.prepare(`UPDATE recurring_payments SET name = COALESCE(?, name), amount = COALESCE(?, amount), frequency = COALESCE(?, frequency), category = COALESCE(?, category), account_id = COALESCE(?, account_id), beneficiary_id = COALESCE(?, beneficiary_id), next_execution = COALESCE(?, next_execution), status = COALESCE(?, status) WHERE id = ?`);
        return stmt.run(data.name, data.amount, data.frequency, data.category, data.accountId, data.beneficiaryId, data.nextExecution, data.status, id);
    },
    deleteRecurring: (id) => {
        return db.prepare('DELETE FROM recurring_payments WHERE id = ?').run(id);
    },
    // ========== AUDIT LOGS ==========
    createAuditLog: (data) => {
        const stmt = db.prepare(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.action, data.entityType, data.entityId || null, data.oldValue || null, data.newValue || null, data.ipAddress || null, data.userAgent || null);
    },
    getAuditLogsByUser: (userId, limit = 100) => {
        return db.prepare('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
    },
    createAsset: (data) => {
        const stmt = db.prepare(`INSERT INTO user_assets (user_id, name, asset_type, value, liquidity, returns) VALUES (?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.name, data.assetType || null, data.value || 0, data.liquidity || null, data.returns || null);
    },
    getAssetsByUser: (userId) => {
        return db.prepare('SELECT * FROM user_assets WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    },
    updateAsset: (assetId, data) => {
        const stmt = db.prepare(`UPDATE user_assets SET name = COALESCE(?, name), asset_type = COALESCE(?, asset_type), value = COALESCE(?, value), liquidity = COALESCE(?, liquidity), returns = COALESCE(?, returns) WHERE id = ?`);
        return stmt.run(data.name, data.assetType, data.value, data.liquidity, data.returns, assetId);
    },
    deleteAsset: (assetId) => {
        return db.prepare('DELETE FROM user_assets WHERE id = ?').run(assetId);
    },
    getKycByUser: (userId) => {
        return db.prepare('SELECT * FROM kyc_records WHERE user_id = ?').get(userId);
    },
    createOrUpdateKyc: (data) => {
        const existing = db.prepare('SELECT * FROM kyc_records WHERE user_id = ?').get(data.userId);
        if (existing) {
            const stmt = db.prepare(`UPDATE kyc_records SET pan_number = COALESCE(?, pan_number), aadhaar_masked = COALESCE(?, aadhaar_masked), kyc_status = COALESCE(?, kyc_status), verified_at = COALESCE(?, verified_at), ekyc_reference = COALESCE(?, ekyc_reference) WHERE user_id = ?`);
            return stmt.run(data.panNumber, data.aadhaarMasked, data.kycStatus, data.verifiedAt, data.ekycReference, data.userId);
        }
        const stmt = db.prepare(`INSERT INTO kyc_records (user_id, pan_number, aadhaar_masked, kyc_status) VALUES (?, ?, ?, ?)`);
        return stmt.run(data.userId, data.panNumber || null, data.aadhaarMasked || null, data.kycStatus || 'pending');
    },
    markKycVerified: (userId, reference) => {
        const stmt = db.prepare(`UPDATE kyc_records SET kyc_status = 'verified', verified_at = datetime('now'), ekyc_reference = COALESCE(?, ekyc_reference) WHERE user_id = ?`);
        return stmt.run(reference || null, userId);
    },
    getAaConsentsByUser: (userId) => {
        return db.prepare('SELECT * FROM aa_consents WHERE user_id = ? AND status = ? ORDER BY linked_at DESC').all(userId, 'active');
    },
    createAaConsent: (data) => {
        const existing = db.prepare('SELECT * FROM aa_consents WHERE user_id = ? AND bank_name = ? AND status = ?').get(data.userId, data.bankName, 'active');
        if (existing) throw new Error('Bank already linked');
        const stmt = db.prepare(`INSERT INTO aa_consents (user_id, bank_name, account_mask, consent_id, status, scopes, setu_request_id, setu_consent_url, setu_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userId, data.bankName, data.accountMask || null, data.consentId || null, 'active', Array.isArray(data.scopes) ? data.scopes.join(',') : data.scopes || null, data.setuRequestId || null, data.setuConsentUrl || null, data.setuStatus || null);
    },
    updateAaConsentSetu: (consentId, userId, setuData) => {
        const stmt = db.prepare(`UPDATE aa_consents SET setu_request_id = COALESCE(?, setu_request_id), setu_consent_url = COALESCE(?, setu_consent_url), setu_status = COALESCE(?, setu_status), status = COALESCE(?, status) WHERE id = ? AND user_id = ?`);
        return stmt.run(setuData.setuRequestId || null, setuData.setuConsentUrl || null, setuData.setuStatus || null, setuData.status || null, consentId, userId);
    },
    revokeAaConsent: (consentId, userId) => {
        const stmt = db.prepare(`UPDATE aa_consents SET status = 'revoked' WHERE id = ? AND user_id = ?`);
        return stmt.run(consentId, userId);
    },
    getAaConsentById: (consentId, userId) => {
        return db.prepare('SELECT * FROM aa_consents WHERE id = ? AND user_id = ?').get(consentId, userId);
    },
    getAaConsentBySetuRequestId: (requestId) => {
        return db.prepare('SELECT * FROM aa_consents WHERE setu_request_id = ?').get(requestId);
    },
    getAaAccountsByUser: (userId) => {
        return db.prepare('SELECT * FROM aa_accounts WHERE user_id = ? AND status = ? ORDER BY discovered_at DESC').all(userId, 'active');
    },
    getAaAccountsByConsent: (consentId, userId) => {
        return db.prepare('SELECT * FROM aa_accounts WHERE consent_id = ? AND user_id = ? AND status = ? ORDER BY discovered_at DESC').all(consentId, userId, 'active');
    },
    createAaAccount: (data) => {
        const stmt = db.prepare(`INSERT INTO aa_accounts (consent_id, user_id, account_id, account_number_masked, account_type, bank_name, currency, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.consentId, data.userId, data.accountId, data.accountNumberMasked, data.accountType, data.bankName, data.currency || 'INR', data.balance || 0);
    },
    deactivateAaAccountsByConsent: (consentId, userId) => {
        return db.prepare(`UPDATE aa_accounts SET status = 'revoked' WHERE consent_id = ? AND user_id = ?`).run(consentId, userId);
    },
    getAaTransactionsByAccount: (accountId) => {
        return db.prepare('SELECT * FROM aa_transactions WHERE account_id = ? ORDER BY txn_date DESC, id DESC LIMIT 50').all(accountId);
    },
    createAaTransaction: (data) => {
        const stmt = db.prepare(`INSERT INTO aa_transactions (account_id, txn_id, txn_date, description, amount, type, category, balance_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.accountId, data.txnId, data.txnDate, data.description, data.amount, data.type, data.category, data.balanceAfter);
    }
};

const otpDb = {
    create: (data) => {
        const stmt = db.prepare(`INSERT INTO otp_attempts (recipient, otp_hash, purpose, attempts, expires_at, verified) VALUES (?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.recipient, data.otpHash, data.purpose || 'secure transaction', data.attempts || 0, data.expiresAt, data.verified ? 1 : 0);
    },
    findActiveByRecipient: (recipient, purpose = 'secure transaction') => {
        return db.prepare(`SELECT * FROM otp_attempts WHERE recipient = ? AND purpose = ? AND expires_at > datetime('now') AND verified = 0 ORDER BY created_at DESC LIMIT 1`).get(recipient, purpose);
    },
    findRecentByRecipient: (recipient, purpose = 'secure transaction', limit = 10) => {
        return db.prepare(`SELECT * FROM otp_attempts WHERE recipient = ? AND purpose = ? ORDER BY created_at DESC LIMIT ?`).all(recipient, purpose, limit);
    },
    incrementAttempts: (id) => {
        return db.prepare(`UPDATE otp_attempts SET attempts = attempts + 1 WHERE id = ?`).run(id);
    },
    markVerified: (id) => {
        return db.prepare(`UPDATE otp_attempts SET verified = 1 WHERE id = ?`).run(id);
    },
    invalidateActive: (recipient, purpose = 'secure transaction') => {
        return db.prepare(`UPDATE otp_attempts SET verified = -1 WHERE recipient = ? AND purpose = ? AND verified = 0 AND expires_at > datetime('now')`).run(recipient, purpose);
    },
    cleanupExpired: () => {
        return db.prepare(`DELETE FROM otp_attempts WHERE expires_at <= datetime('now', '-1 day')`).run();
    },
    getAttemptStats: (recipient, purpose = 'secure transaction') => {
        const row = db.prepare(`SELECT COUNT(*) as total, SUM(attempts) as total_attempts, MAX(attempts) as max_attempts FROM otp_attempts WHERE recipient = ? AND purpose = ? AND created_at > datetime('now', '-1 day')`).get(recipient, purpose);
        return row || { total: 0, total_attempts: 0, max_attempts: 0 };
    },
    getAttemptsInWindow: (recipient, purpose = 'secure transaction', minutes = 5) => {
        const row = db.prepare(`SELECT COALESCE(SUM(attempts), 0) as total_attempts FROM otp_attempts WHERE recipient = ? AND purpose = ? AND created_at > datetime('now', '-${minutes} minutes')`).get(recipient, purpose);
        return row ? Number(row.total_attempts) : 0;
    }
};

const deviceFingerprintDb = {
    create: (data) => {
        const stmt = db.prepare(`
            INSERT INTO device_fingerprints (user_id, visitor_id, fingerprint_hash, is_trusted)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, visitor_id) DO UPDATE SET
                last_seen = datetime('now'),
                fingerprint_hash = excluded.fingerprint_hash,
                is_trusted = COALESCE(device_fingerprints.is_trusted, excluded.is_trusted)
        `);
        return stmt.run(data.userId, data.visitorId, data.fingerprintHash, data.isTrusted ? 1 : 0);
    },

    findByUserAndVisitor: (userId, visitorId) => {
        const stmt = db.prepare('SELECT * FROM device_fingerprints WHERE user_id = ? AND visitor_id = ?');
        return stmt.get(userId, visitorId);
    },

    findByUser: (userId) => {
        const stmt = db.prepare('SELECT * FROM device_fingerprints WHERE user_id = ? ORDER BY last_seen DESC');
        return stmt.all(userId);
    },

    setTrusted: (id, isTrusted) => {
        const stmt = db.prepare('UPDATE device_fingerprints SET is_trusted = ? WHERE id = ?');
        return stmt.run(isTrusted ? 1 : 0, id);
    },

    updateLastSeen: (id) => {
        const stmt = db.prepare("UPDATE device_fingerprints SET last_seen = datetime('now') WHERE id = ?");
        return stmt.run(id);
    },

    hasTrustedDevice: (userId) => {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM device_fingerprints WHERE user_id = ? AND is_trusted = 1');
        const row = stmt.get(userId);
        return row && row.count > 0;
    },

    getTrustStatus: (userId, visitorId, fingerprintHash) => {
        const stmt = db.prepare('SELECT * FROM device_fingerprints WHERE user_id = ? AND visitor_id = ? AND fingerprint_hash = ?');
        return stmt.get(userId, visitorId, fingerprintHash);
    }
};

module.exports = {
    db,
    userDb,
    calculationDb,
    sessionDb,
    aiRunsDb,
    quotaDb,
    extractionDb,
    deviceDb,
    modelDb,
    bankingDb,
    deviceFingerprintDb,
    otpDb,
    msmeDb,
    safeJsonParse,
    ready: readyPromise,
    pgAdapter
};