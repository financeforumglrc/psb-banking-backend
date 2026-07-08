/**
 * SQLite Database Service
 * Provides persistent storage for DS Financial API
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { maskEmail, maskPhone, maskPan, maskAadhaar } = require('../lib/pii');

const dbPath = process.env.DATABASE_PATH || process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ds_financial.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
        CREATE TABLE IF NOT EXISTS ai_cache (
            cache_key TEXT PRIMARY KEY,
            response TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ai_cache_created ON ai_cache(created_at);

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
        CREATE INDEX IF NOT EXISTS idx_users_search ON users(name, email);
        CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

        CREATE TABLE IF NOT EXISTS whitelisted_ips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fraud_event_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_log_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            admin_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (audit_log_id) REFERENCES audit_logs(id)
        );

        -- Fraud Intelligence Center tables
        CREATE TABLE IF NOT EXISTS fraud_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_ref TEXT UNIQUE NOT NULL,
            audit_log_id INTEGER,
            user_id TEXT,
            status TEXT DEFAULT 'open',
            priority TEXT DEFAULT 'medium',
            risk_score REAL DEFAULT 0,
            risk_factors TEXT,
            category TEXT,
            summary TEXT,
            source_entity_type TEXT,
            source_entity_id INTEGER,
            assigned_admin_id TEXT,
            country_risk_tags TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (audit_log_id) REFERENCES audit_logs(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS fraud_hops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fraud_case_id INTEGER NOT NULL,
            hop_number INTEGER NOT NULL,
            hop_type TEXT NOT NULL,
            node_name TEXT,
            country TEXT,
            city TEXT,
            lat REAL,
            lon REAL,
            entity_type TEXT,
            entity_value TEXT,
            institution TEXT,
            ifsc TEXT,
            swift_bic TEXT,
            amount REAL,
            currency TEXT DEFAULT 'INR',
            timestamp TEXT DEFAULT (datetime('now')),
            evidence_json TEXT,
            confidence REAL DEFAULT 0,
            is_sanctioned INTEGER DEFAULT 0,
            FOREIGN KEY (fraud_case_id) REFERENCES fraud_cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS fraud_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fraud_case_id INTEGER NOT NULL,
            account_type TEXT NOT NULL,
            holder_name TEXT,
            bank_name TEXT,
            branch TEXT,
            masked_account TEXT,
            ifsc TEXT,
            swift_bic TEXT,
            country TEXT,
            risk_flags TEXT,
            FOREIGN KEY (fraud_case_id) REFERENCES fraud_cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS fraud_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fraud_case_id INTEGER NOT NULL,
            admin_id TEXT,
            note TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (fraud_case_id) REFERENCES fraud_cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS fraud_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            condition_json TEXT NOT NULL,
            action TEXT DEFAULT 'flag',
            severity TEXT DEFAULT 'medium',
            created_by TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_fraud_cases_ref ON fraud_cases(case_ref);
        CREATE INDEX IF NOT EXISTS idx_fraud_cases_user ON fraud_cases(user_id);
        CREATE INDEX IF NOT EXISTS idx_fraud_cases_status ON fraud_cases(status);
        CREATE INDEX IF NOT EXISTS idx_fraud_cases_priority ON fraud_cases(priority);
        CREATE INDEX IF NOT EXISTS idx_fraud_cases_created ON fraud_cases(created_at);
        CREATE INDEX IF NOT EXISTS idx_fraud_hops_case ON fraud_hops(fraud_case_id);
        CREATE INDEX IF NOT EXISTS idx_fraud_accounts_case ON fraud_accounts(fraud_case_id);
        CREATE INDEX IF NOT EXISTS idx_fraud_notes_case ON fraud_notes(fraud_case_id);

        -- Real-world financial data ingestion tables (RBI, Market, Forex, Kaggle-style)
        CREATE TABLE IF NOT EXISTS market_instruments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL, -- stock, index, etf, mutual_fund, commodity, currency, bond
            exchange TEXT,
            sector TEXT,
            currency TEXT DEFAULT 'INR',
            isin TEXT,
            source TEXT,
            source_url TEXT,
            metadata_json TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS market_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instrument_id INTEGER NOT NULL,
            price_date TEXT NOT NULL,
            open_price REAL,
            high_price REAL,
            low_price REAL,
            close_price REAL,
            volume INTEGER,
            adjusted_close REAL,
            source TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (instrument_id) REFERENCES market_instruments(id),
            UNIQUE(instrument_id, price_date)
        );

        CREATE TABLE IF NOT EXISTS rbi_macro_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data_date TEXT NOT NULL,
            indicator TEXT NOT NULL, -- repo_rate, reverse_repo_rate, bank_rate, cpi_inflation, wpi_inflation, gdp_growth, forex_reserves
            value REAL NOT NULL,
            unit TEXT,
            source TEXT,
            source_url TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(data_date, indicator)
        );

        CREATE TABLE IF NOT EXISTS forex_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rate_date TEXT NOT NULL,
            base_currency TEXT NOT NULL,
            quote_currency TEXT NOT NULL,
            rate REAL NOT NULL,
            source TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(rate_date, base_currency, quote_currency)
        );

        CREATE TABLE IF NOT EXISTS external_datasets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataset_key TEXT UNIQUE NOT NULL, -- e.g. kaggle_credit_card_fraud_sample
            source_name TEXT NOT NULL, -- Kaggle, RBI, World Bank, etc.
            source_url TEXT,
            description TEXT,
            record_count INTEGER,
            schema_json TEXT,
            sample_json TEXT,
            last_fetched TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_asset_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_asset_id INTEGER NOT NULL,
            instrument_id INTEGER,
            units REAL,
            avg_cost REAL,
            current_price REAL,
            last_synced TEXT,
            metadata_json TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_asset_id) REFERENCES user_assets(id),
            FOREIGN KEY (instrument_id) REFERENCES market_instruments(id)
        );

        CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON market_instruments(symbol);
        CREATE INDEX IF NOT EXISTS idx_instruments_type ON market_instruments(type);
        CREATE INDEX IF NOT EXISTS idx_prices_instrument_date ON market_prices(instrument_id, price_date);
        CREATE INDEX IF NOT EXISTS idx_rbi_indicator_date ON rbi_macro_data(indicator, data_date);
        CREATE INDEX IF NOT EXISTS idx_forex_date ON forex_rates(rate_date, base_currency, quote_currency);
        CREATE INDEX IF NOT EXISTS idx_user_asset_links_asset ON user_asset_links(user_asset_id);

        -- MSME CreditBridge AI tables
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

    console.log('SQLite database initialized');
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
    getAllAuditLogs: (filters = {}) => {
        let sql = `SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
        const params = [];
        if (filters.userId) { sql += ' AND a.user_id = ?'; params.push(filters.userId); }
        if (filters.action) { sql += ' AND a.action = ?'; params.push(filters.action); }
        if (filters.entityType) { sql += ' AND a.entity_type = ?'; params.push(filters.entityType); }
        if (filters.dateFrom) { sql += ' AND a.created_at >= ?'; params.push(filters.dateFrom); }
        if (filters.dateTo) { sql += ' AND a.created_at <= ?'; params.push(filters.dateTo); }
        sql += ' ORDER BY a.created_at DESC';
        if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }
        if (filters.offset) { sql += ' OFFSET ?'; params.push(filters.offset); }
        return db.prepare(sql).all(...params);
    },
    getFraudEvents: (limit = 100) => {
        const sql = `SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE (a.action = 'DELETE' OR a.entity_type IN ('auth', 'transaction', 'card', 'kyc')) AND a.new_value LIKE '%"status":4%' ORDER BY a.created_at DESC LIMIT ?`;
        return db.prepare(sql).all(limit);
    },
    blockUser: (userId) => {
        return db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(userId);
    },
    whitelistIp: (ip) => {
        try {
            return db.prepare(`INSERT OR IGNORE INTO whitelisted_ips (ip) VALUES (?)`).run(ip);
        } catch (e) {
            return { changes: 0 };
        }
    },
    isIpWhitelisted: (ip) => {
        return db.prepare(`SELECT COUNT(*) as count FROM whitelisted_ips WHERE ip = ?`).get(ip).count > 0;
    },
    markFalsePositive: (auditLogId, adminId = null) => {
        return db.prepare(`INSERT INTO fraud_event_actions (audit_log_id, action, admin_id) VALUES (?, 'false_positive', ?)`).run(auditLogId, adminId);
    },
    acknowledgeFraudEvent: (auditLogId, adminId = null) => {
        return db.prepare(`INSERT INTO fraud_event_actions (audit_log_id, action, admin_id) VALUES (?, 'acknowledge', ?)`).run(auditLogId, adminId);
    },
    getUsers: ({ q = '', sort = 'created_at', order = 'desc', page = 1, limit = 50 } = {}) => {
        const allowedSort = ['name', 'email', 'created_at', 'tier', 'role'].includes(sort) ? sort : 'created_at';
        const dir = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const offset = Math.max(0, (page - 1) * limit);
        let where = 'WHERE 1=1';
        const params = [];
        if (q) {
            where += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR pan_number LIKE ? OR aadhar LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like, like);
        }
        const countRow = db.prepare(`SELECT COUNT(*) as total FROM users ${where}`).get(...params);
        const sql = `SELECT id, email, name, phone, role, tier, pan_number, aadhar, created_at, last_login, face_descriptor IS NOT NULL as face_registered, api_usage_total, is_active FROM users ${where} ORDER BY ${allowedSort} ${dir} LIMIT ? OFFSET ?`;
        const users = db.prepare(sql).all(...params, limit, offset).map(u => ({
            ...u,
            email: maskEmail(u.email),
            phone: maskPhone(u.phone),
            pan_number: maskPan(u.pan_number),
            aadhar: maskAadhaar(u.aadhar)
        }));
        return { users, total: countRow.total, page, limit, pages: Math.ceil(countRow.total / limit) };
    },
    updateUserStatus: (userId, isActive) => {
        return db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, userId);
    },
    updateUser: (userId, { role, tier }) => {
        const stmt = db.prepare(`UPDATE users SET role = COALESCE(?, role), tier = COALESCE(?, tier) WHERE id = ?`);
        return stmt.run(role, tier, userId);
    },
    getAuditLogsPaged: ({ userId, action, entityType, dateFrom, dateTo, q = '', page = 1, limit = 100 } = {}) => {
        let sql = `SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
        const params = [];
        if (userId) { sql += ' AND a.user_id = ?'; params.push(userId); }
        if (action) { sql += ' AND a.action = ?'; params.push(action); }
        if (entityType) { sql += ' AND a.entity_type = ?'; params.push(entityType); }
        if (dateFrom) { sql += ' AND a.created_at >= ?'; params.push(dateFrom); }
        if (dateTo) { sql += ' AND a.created_at <= ?'; params.push(dateTo); }
        if (q) {
            sql += ' AND (a.action LIKE ? OR a.entity_type LIKE ? OR a.details LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR a.ip_address LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like, like, like);
        }
        const countRow = db.prepare(`SELECT COUNT(*) as total FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1 ${sql.split('WHERE 1=1')[1] || ''}`).get(...params);
        sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        const offset = Math.max(0, (page - 1) * limit);
        const logs = db.prepare(sql).all(...params, limit, offset);
        return { logs, total: countRow.total, page, limit, pages: Math.ceil(countRow.total / limit) };
    },
    getDashboardMetrics: (days = 7) => {
        const dayMs = 86400000;
        const now = new Date();
        const registrations = [];
        const transactions = [];
        const fraudTrends = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * dayMs);
            const dateStr = d.toISOString().split('T')[0];
            const nextStr = new Date(d.getTime() + dayMs).toISOString().split('T')[0];
            const reg = db.prepare(`SELECT COUNT(*) as count FROM users WHERE created_at >= ? AND created_at < ?`).get(dateStr, nextStr);
            const txn = db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE created_at >= ? AND created_at < ?`).get(dateStr, nextStr);
            const fraud = db.prepare(`SELECT COUNT(*) as count FROM audit_logs WHERE created_at >= ? AND created_at < ? AND (action = 'DELETE' OR entity_type IN ('auth', 'transaction', 'card', 'kyc')) AND new_value LIKE '%"status":4%'`).get(dateStr, nextStr);
            const label = d.toLocaleDateString('en-IN', { weekday: 'short' });
            registrations.push({ day: label, users: reg.count });
            transactions.push({ day: label, txns: txn.count });
            fraudTrends.push({ day: label, attempts: fraud.count, blocked: Math.floor(fraud.count * 0.85) });
        }
        const tierRows = db.prepare(`SELECT tier, COUNT(*) as count FROM users GROUP BY tier`).all();
        const tierMap = { free: 0, premium: 0, enterprise: 0 };
        tierRows.forEach(r => { tierMap[r.tier] = r.count; });
        const tierDistribution = [
            { name: 'Free', value: tierMap.free || 0, color: '#64748b' },
            { name: 'Premium', value: tierMap.premium || 0, color: '#fbbf24' },
            { name: 'Enterprise', value: tierMap.enterprise || 0, color: '#a78bfa' },
        ];
        const originRows = db.prepare(`SELECT COUNT(*) as count, ip_address FROM audit_logs WHERE created_at >= datetime('now', '-7 day') AND (action = 'DELETE' OR entity_type IN ('auth', 'transaction', 'card', 'kyc')) AND new_value LIKE '%"status":4%' GROUP BY ip_address ORDER BY count DESC LIMIT 5`).all();
        const topOrigins = originRows.map(r => ({ country: r.ip_address, count: r.count }));
        return { registrations, transactions, fraudTrends, tierDistribution, topOrigins };
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

    // ========== REAL-WORLD DATA LINKS (RBI / Market / Forex) ==========
    createInstrument: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO market_instruments (symbol, name, type, exchange, sector, currency, isin, source, source_url, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.symbol, data.name, data.type, data.exchange || null, data.sector || null, data.currency || 'INR', data.isin || null, data.source || null, data.sourceUrl || null, data.metadataJson ? JSON.stringify(data.metadataJson) : null);
    },
    findInstrumentBySymbol: (symbol) => {
        return db.prepare('SELECT * FROM market_instruments WHERE symbol = ?').get(symbol);
    },
    getInstruments: (filters = {}) => {
        let sql = 'SELECT * FROM market_instruments WHERE 1=1';
        const params = [];
        if (filters.type) { sql += ' AND type = ?'; params.push(filters.type); }
        if (filters.exchange) { sql += ' AND exchange = ?'; params.push(filters.exchange); }
        if (filters.sector) { sql += ' AND sector = ?'; params.push(filters.sector); }
        sql += ' ORDER BY name';
        return db.prepare(sql).all(...params);
    },
    createPrice: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO market_prices (instrument_id, price_date, open_price, high_price, low_price, close_price, volume, adjusted_close, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.instrumentId, data.priceDate, data.open || null, data.high || null, data.low || null, data.close || null, data.volume || null, data.adjustedClose || null, data.source || null);
    },
    getPrices: (instrumentId, limit = 30) => {
        return db.prepare('SELECT * FROM market_prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT ?').all(instrumentId, limit);
    },
    getLatestPrice: (instrumentId) => {
        return db.prepare('SELECT * FROM market_prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT 1').get(instrumentId);
    },
    createRBIMacro: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO rbi_macro_data (data_date, indicator, value, unit, source, source_url, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.dataDate, data.indicator, data.value, data.unit || null, data.source || null, data.sourceUrl || null, data.notes || null);
    },
    getRBIMacro: (indicator, limit = 12) => {
        return db.prepare('SELECT * FROM rbi_macro_data WHERE indicator = ? ORDER BY data_date DESC LIMIT ?').all(indicator, limit);
    },
    getLatestRBIMacro: (indicator) => {
        return db.prepare('SELECT * FROM rbi_macro_data WHERE indicator = ? ORDER BY data_date DESC LIMIT 1').get(indicator);
    },
    createForexRate: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO forex_rates (rate_date, base_currency, quote_currency, rate, source) VALUES (?, ?, ?, ?, ?)`);
        return stmt.run(data.rateDate, data.baseCurrency, data.quoteCurrency, data.rate, data.source || null);
    },
    getForexRate: (baseCurrency, quoteCurrency) => {
        return db.prepare('SELECT * FROM forex_rates WHERE base_currency = ? AND quote_currency = ? ORDER BY rate_date DESC LIMIT 1').get(baseCurrency, quoteCurrency);
    },
    createExternalDataset: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO external_datasets (dataset_key, source_name, source_url, description, record_count, schema_json, sample_json, last_fetched) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.datasetKey, data.sourceName, data.sourceUrl || null, data.description || null, data.recordCount || null, data.schemaJson ? JSON.stringify(data.schemaJson) : null, data.sampleJson ? JSON.stringify(data.sampleJson) : null, data.lastFetched || new Date().toISOString());
    },
    getExternalDataset: (key) => {
        return db.prepare('SELECT * FROM external_datasets WHERE dataset_key = ?').get(key);
    },
    createUserAssetLink: (data) => {
        const stmt = db.prepare(`INSERT INTO user_asset_links (user_asset_id, instrument_id, units, avg_cost, current_price, last_synced, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userAssetId, data.instrumentId || null, data.units || null, data.avgCost || null, data.currentPrice || null, data.lastSynced || null, data.metadataJson ? JSON.stringify(data.metadataJson) : null);
    },
    getUserAssetLinks: (userAssetId) => {
        return db.prepare('SELECT l.*, i.symbol, i.name, i.type FROM user_asset_links l LEFT JOIN market_instruments i ON l.instrument_id = i.id WHERE l.user_asset_id = ?').all(userAssetId);
    }
};

const marketDb = {
    createInstrument: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO market_instruments (symbol, name, type, exchange, sector, currency, isin, source, source_url, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.symbol, data.name, data.type, data.exchange || null, data.sector || null, data.currency || 'INR', data.isin || null, data.source || null, data.sourceUrl || null, data.metadataJson ? JSON.stringify(data.metadataJson) : null);
    },
    findInstrumentBySymbol: (symbol) => {
        return db.prepare('SELECT * FROM market_instruments WHERE symbol = ?').get(symbol);
    },
    getInstruments: (filters = {}) => {
        let sql = 'SELECT * FROM market_instruments WHERE 1=1';
        const params = [];
        if (filters.type) { sql += ' AND type = ?'; params.push(filters.type); }
        if (filters.exchange) { sql += ' AND exchange = ?'; params.push(filters.exchange); }
        if (filters.sector) { sql += ' AND sector = ?'; params.push(filters.sector); }
        sql += ' ORDER BY name';
        return db.prepare(sql).all(...params);
    },
    createPrice: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO market_prices (instrument_id, price_date, open_price, high_price, low_price, close_price, volume, adjusted_close, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.instrumentId, data.priceDate, data.open || null, data.high || null, data.low || null, data.close || null, data.volume || null, data.adjustedClose || null, data.source || null);
    },
    getPrices: (instrumentId, limit = 30) => {
        return db.prepare('SELECT * FROM market_prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT ?').all(instrumentId, limit);
    },
    getLatestPrice: (instrumentId) => {
        return db.prepare('SELECT * FROM market_prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT 1').get(instrumentId);
    },
    createRBIMacro: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO rbi_macro_data (data_date, indicator, value, unit, source, source_url, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.dataDate, data.indicator, data.value, data.unit || null, data.source || null, data.sourceUrl || null, data.notes || null);
    },
    getRBIMacro: (indicator, limit = 12) => {
        return db.prepare('SELECT * FROM rbi_macro_data WHERE indicator = ? ORDER BY data_date DESC LIMIT ?').all(indicator, limit);
    },
    getLatestRBIMacro: (indicator) => {
        return db.prepare('SELECT * FROM rbi_macro_data WHERE indicator = ? ORDER BY data_date DESC LIMIT 1').get(indicator);
    },
    createForexRate: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO forex_rates (rate_date, base_currency, quote_currency, rate, source) VALUES (?, ?, ?, ?, ?)`);
        return stmt.run(data.rateDate, data.baseCurrency, data.quoteCurrency, data.rate, data.source || null);
    },
    getForexRate: (baseCurrency, quoteCurrency) => {
        return db.prepare('SELECT * FROM forex_rates WHERE base_currency = ? AND quote_currency = ? ORDER BY rate_date DESC LIMIT 1').get(baseCurrency, quoteCurrency);
    },
    createExternalDataset: (data) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO external_datasets (dataset_key, source_name, source_url, description, record_count, schema_json, sample_json, last_fetched) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.datasetKey, data.sourceName, data.sourceUrl || null, data.description || null, data.recordCount || null, data.schemaJson ? JSON.stringify(data.schemaJson) : null, data.sampleJson ? JSON.stringify(data.sampleJson) : null, data.lastFetched || new Date().toISOString());
    },
    getExternalDataset: (key) => {
        return db.prepare('SELECT * FROM external_datasets WHERE dataset_key = ?').get(key);
    },
    createUserAssetLink: (data) => {
        const stmt = db.prepare(`INSERT INTO user_asset_links (user_asset_id, instrument_id, units, avg_cost, current_price, last_synced, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.userAssetId, data.instrumentId || null, data.units || null, data.avgCost || null, data.currentPrice || null, data.lastSynced || null, data.metadataJson ? JSON.stringify(data.metadataJson) : null);
    },
    getUserAssetLinks: (userAssetId) => {
        return db.prepare('SELECT l.*, i.symbol, i.name, i.type FROM user_asset_links l LEFT JOIN market_instruments i ON l.instrument_id = i.id WHERE l.user_asset_id = ?').all(userAssetId);
    }
};

const fraudDb = {
    createCase: (data) => {
        const stmt = db.prepare(`INSERT INTO fraud_cases
            (case_ref, audit_log_id, user_id, status, priority, risk_score, risk_factors, category, summary,
             source_entity_type, source_entity_id, assigned_admin_id, country_risk_tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const result = stmt.run(
            data.caseRef,
            data.auditLogId || null,
            data.userId || null,
            data.status || 'open',
            data.priority || 'medium',
            data.riskScore || 0,
            data.riskFactors ? JSON.stringify(data.riskFactors) : null,
            data.category || null,
            data.summary || null,
            data.sourceEntityType || null,
            data.sourceEntityId || null,
            data.assignedAdminId || null,
            data.countryRiskTags ? JSON.stringify(data.countryRiskTags) : null
        );
        return result;
    },
    getCaseById: (id) => db.prepare('SELECT * FROM fraud_cases WHERE id = ?').get(id),
    getCaseByRef: (caseRef) => db.prepare('SELECT * FROM fraud_cases WHERE case_ref = ?').get(caseRef),
    getCases: (filters = {}) => {
        let sql = `SELECT c.*, u.name AS user_name, u.email AS user_email FROM fraud_cases c LEFT JOIN users u ON c.user_id = u.id WHERE 1=1`;
        const params = [];
        if (filters.status) { sql += ' AND c.status = ?'; params.push(filters.status); }
        if (filters.priority) { sql += ' AND c.priority = ?'; params.push(filters.priority); }
        if (filters.category) { sql += ' AND c.category = ?'; params.push(filters.category); }
        if (filters.assignedAdminId) { sql += ' AND c.assigned_admin_id = ?'; params.push(filters.assignedAdminId); }
        if (filters.userId) { sql += ' AND c.user_id = ?'; params.push(filters.userId); }
        if (filters.dateFrom) { sql += ' AND c.created_at >= ?'; params.push(filters.dateFrom); }
        if (filters.dateTo) { sql += ' AND c.created_at <= ?'; params.push(filters.dateTo); }
        if (filters.timeRange && filters.timeRange !== 'all') {
            const now = new Date().toISOString();
            let seconds = 0;
            switch (filters.timeRange) {
                case 'live': seconds = 60; break;
                case '7d': seconds = 7 * 24 * 60 * 60; break;
                case '1m': seconds = 30 * 24 * 60 * 60; break;
                case '1y': seconds = 365 * 24 * 60 * 60; break;
                case '10y': seconds = 10 * 365 * 24 * 60 * 60; break;
            }
            if (seconds > 0) {
                sql += " AND c.created_at >= datetime('now', '-" + seconds + " seconds')";
            }
        }
        if (filters.minRisk !== undefined) { sql += ' AND c.risk_score >= ?'; params.push(filters.minRisk); }
        if (filters.maxRisk !== undefined) { sql += ' AND c.risk_score <= ?'; params.push(filters.maxRisk); }
        if (filters.q) {
            sql += ` AND (c.case_ref LIKE ? OR c.summary LIKE ? OR c.category LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR c.country_risk_tags LIKE ?)`;
            const like = `%${filters.q}%`;
            params.push(like, like, like, like, like, like);
        }
        if (filters.ids && filters.ids.length) {
            const ph = filters.ids.map(() => '?').join(',');
            sql += ` AND c.id IN (${ph})`;
            params.push(...filters.ids);
        }
        const countRow = db.prepare(`SELECT COUNT(*) as total FROM fraud_cases c LEFT JOIN users u ON c.user_id = u.id WHERE 1=1 ${sql.split('WHERE 1=1')[1] || ''}`).get(...params);
        const allowedSort = ['created_at', 'updated_at', 'risk_score', 'priority', 'status'].includes(filters.sort) ? filters.sort : 'created_at';
        const dir = filters.order && filters.order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        sql += ` ORDER BY c.${allowedSort} ${dir}`;
        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.max(1, Math.min(500, parseInt(filters.limit) || 50));
        const offset = (page - 1) * limit;
        sql += ' LIMIT ? OFFSET ?';
        const cases = db.prepare(sql).all(...params, limit, offset);
        const casesWithHops = cases.map(c => ({
            ...c,
            hops: db.prepare('SELECT * FROM fraud_hops WHERE fraud_case_id = ? ORDER BY hop_number, timestamp').all(c.id).map(h => ({
                ...h,
                evidenceJson: safeJsonParse(h.evidence_json, null),
                isSanctioned: !!h.is_sanctioned
            }))
        }));
        return { cases: casesWithHops, total: countRow.total, page, limit, pages: Math.ceil(countRow.total / limit) };
    },
    updateCase: (id, data) => {
        const stmt = db.prepare(`UPDATE fraud_cases SET
            status = COALESCE(?, status),
            priority = COALESCE(?, priority),
            risk_score = COALESCE(?, risk_score),
            risk_factors = COALESCE(?, risk_factors),
            category = COALESCE(?, category),
            summary = COALESCE(?, summary),
            assigned_admin_id = COALESCE(?, assigned_admin_id),
            country_risk_tags = COALESCE(?, country_risk_tags),
            updated_at = datetime('now')
            WHERE id = ?`);
        return stmt.run(
            data.status || null,
            data.priority || null,
            data.riskScore !== undefined ? data.riskScore : null,
            data.riskFactors ? JSON.stringify(data.riskFactors) : null,
            data.category || null,
            data.summary || null,
            data.assignedAdminId !== undefined ? data.assignedAdminId : null,
            data.countryRiskTags ? JSON.stringify(data.countryRiskTags) : null,
            id
        );
    },
    deleteCase: (id) => db.prepare('DELETE FROM fraud_cases WHERE id = ?').run(id),

    createHop: (data) => {
        const stmt = db.prepare(`INSERT INTO fraud_hops
            (fraud_case_id, hop_number, hop_type, node_name, country, city, lat, lon, entity_type,
             entity_value, institution, ifsc, swift_bic, amount, currency, timestamp, evidence_json, confidence, is_sanctioned)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(
            data.fraudCaseId, data.hopNumber, data.hopType, data.nodeName || null, data.country || null,
            data.city || null, data.lat || null, data.lon || null, data.entityType || null,
            data.entityValue || null, data.institution || null, data.ifsc || null, data.swiftBic || null,
            data.amount || 0, data.currency || 'INR', data.timestamp || null,
            data.evidenceJson ? JSON.stringify(data.evidenceJson) : null,
            data.confidence || 0, data.isSanctioned ? 1 : 0
        );
    },
    getHopsByCase: (caseId) => db.prepare('SELECT * FROM fraud_hops WHERE fraud_case_id = ? ORDER BY hop_number, timestamp').all(caseId),
    updateHop: (id, data) => {
        const stmt = db.prepare(`UPDATE fraud_hops SET
            hop_number = COALESCE(?, hop_number), hop_type = COALESCE(?, hop_type), node_name = COALESCE(?, node_name),
            country = COALESCE(?, country), city = COALESCE(?, city), lat = COALESCE(?, lat), lon = COALESCE(?, lon),
            entity_type = COALESCE(?, entity_type), entity_value = COALESCE(?, entity_value),
            institution = COALESCE(?, institution), ifsc = COALESCE(?, ifsc), swift_bic = COALESCE(?, swift_bic),
            amount = COALESCE(?, amount), currency = COALESCE(?, currency), timestamp = COALESCE(?, timestamp),
            evidence_json = COALESCE(?, evidence_json), confidence = COALESCE(?, confidence), is_sanctioned = COALESCE(?, is_sanctioned)
            WHERE id = ?`);
        return stmt.run(
            data.hopNumber !== undefined ? data.hopNumber : null,
            data.hopType || null, data.nodeName || null, data.country || null, data.city || null,
            data.lat !== undefined ? data.lat : null, data.lon !== undefined ? data.lon : null,
            data.entityType || null, data.entityValue || null, data.institution || null,
            data.ifsc || null, data.swiftBic || null, data.amount !== undefined ? data.amount : null,
            data.currency || null, data.timestamp || null,
            data.evidenceJson ? JSON.stringify(data.evidenceJson) : null,
            data.confidence !== undefined ? data.confidence : null,
            data.isSanctioned !== undefined ? (data.isSanctioned ? 1 : 0) : null,
            id
        );
    },
    deleteHop: (id) => db.prepare('DELETE FROM fraud_hops WHERE id = ?').run(id),

    createAccount: (data) => {
        const stmt = db.prepare(`INSERT INTO fraud_accounts
            (fraud_case_id, account_type, holder_name, bank_name, branch, masked_account, ifsc, swift_bic, country, risk_flags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(
            data.fraudCaseId, data.accountType, data.holderName || null, data.bankName || null,
            data.branch || null, data.maskedAccount || null, data.ifsc || null, data.swiftBic || null,
            data.country || null, data.riskFlags ? JSON.stringify(data.riskFlags) : null
        );
    },
    getAccountsByCase: (caseId) => db.prepare('SELECT * FROM fraud_accounts WHERE fraud_case_id = ?').all(caseId),
    updateAccount: (id, data) => {
        const stmt = db.prepare(`UPDATE fraud_accounts SET
            account_type = COALESCE(?, account_type), holder_name = COALESCE(?, holder_name),
            bank_name = COALESCE(?, bank_name), branch = COALESCE(?, branch),
            masked_account = COALESCE(?, masked_account), ifsc = COALESCE(?, ifsc),
            swift_bic = COALESCE(?, swift_bic), country = COALESCE(?, country), risk_flags = COALESCE(?, risk_flags)
            WHERE id = ?`);
        return stmt.run(
            data.accountType || null, data.holderName || null, data.bankName || null, data.branch || null,
            data.maskedAccount || null, data.ifsc || null, data.swiftBic || null, data.country || null,
            data.riskFlags ? JSON.stringify(data.riskFlags) : null,
            id
        );
    },
    deleteAccount: (id) => db.prepare('DELETE FROM fraud_accounts WHERE id = ?').run(id),

    createNote: (data) => {
        const stmt = db.prepare(`INSERT INTO fraud_notes (fraud_case_id, admin_id, note) VALUES (?, ?, ?)`);
        return stmt.run(data.fraudCaseId, data.adminId || null, data.note);
    },
    getNotesByCase: (caseId) => db.prepare('SELECT * FROM fraud_notes WHERE fraud_case_id = ? ORDER BY created_at DESC').all(caseId),
    deleteNote: (id) => db.prepare('DELETE FROM fraud_notes WHERE id = ?').run(id),

    getFullCase: (id) => {
        const caseRow = db.prepare('SELECT c.*, u.name AS user_name, u.email AS user_email FROM fraud_cases c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(id);
        if (!caseRow) return null;
        return {
            ...caseRow,
            riskFactors: safeJsonParse(caseRow.risk_factors, []),
            countryRiskTags: safeJsonParse(caseRow.country_risk_tags, []),
            hops: db.prepare('SELECT * FROM fraud_hops WHERE fraud_case_id = ? ORDER BY hop_number, timestamp').all(id).map(h => ({
                ...h,
                evidenceJson: safeJsonParse(h.evidence_json, null),
                isSanctioned: !!h.is_sanctioned
            })),
            accounts: db.prepare('SELECT * FROM fraud_accounts WHERE fraud_case_id = ?').all(id).map(a => ({
                ...a,
                riskFlags: safeJsonParse(a.risk_flags, [])
            })),
            notes: db.prepare('SELECT * FROM fraud_notes WHERE fraud_case_id = ? ORDER BY created_at DESC').all(id)
        };
    },

    getStats: () => {
        const total = db.prepare('SELECT COUNT(*) as count FROM fraud_cases').get();
        const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM fraud_cases GROUP BY status").all();
        const byPriority = db.prepare("SELECT priority, COUNT(*) as count FROM fraud_cases GROUP BY priority").all();
        const byCategory = db.prepare("SELECT category, COUNT(*) as count FROM fraud_cases GROUP BY category").all();
        const highRisk = db.prepare("SELECT COUNT(*) as count FROM fraud_cases WHERE risk_score >= 80").get();
        const sanctioned = db.prepare("SELECT COUNT(DISTINCT fraud_case_id) as count FROM fraud_hops WHERE is_sanctioned = 1").get();
        const totalAmount = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM fraud_hops WHERE currency = 'INR'").get();
        return {
            totalCases: total.count,
            byStatus,
            byPriority,
            byCategory,
            highRiskCases: highRisk.count,
            sanctionedCases: sanctioned.count,
            totalInrAmount: totalAmount.total
        };
    },

    createRule: (data) => {
        const stmt = db.prepare(`INSERT INTO fraud_rules (name, enabled, condition_json, action, severity, created_by) VALUES (?, ?, ?, ?, ?, ?)`);
        return stmt.run(data.name, data.enabled !== false ? 1 : 0, JSON.stringify(data.conditionJson), data.action || 'flag', data.severity || 'medium', data.createdBy || null);
    },
    getRules: (filters = {}) => {
        let sql = 'SELECT * FROM fraud_rules WHERE 1=1';
        const params = [];
        if (filters.enabled !== undefined) { sql += ' AND enabled = ?'; params.push(filters.enabled ? 1 : 0); }
        sql += ' ORDER BY created_at DESC';
        const limit = Math.max(1, Math.min(500, parseInt(filters.limit) || 100));
        sql += ' LIMIT ?';
        return db.prepare(sql).all(...params, limit).map(r => ({ ...r, conditionJson: safeJsonParse(r.condition_json, {}) }));
    },
    getRuleById: (id) => {
        const r = db.prepare('SELECT * FROM fraud_rules WHERE id = ?').get(id);
        if (!r) return null;
        return { ...r, conditionJson: safeJsonParse(r.condition_json, {}) };
    },
    updateRule: (id, data) => {
        const stmt = db.prepare(`UPDATE fraud_rules SET
            name = COALESCE(?, name), enabled = COALESCE(?, enabled),
            condition_json = COALESCE(?, condition_json), action = COALESCE(?, action),
            severity = COALESCE(?, severity) WHERE id = ?`);
        return stmt.run(
            data.name || null,
            data.enabled !== undefined ? (data.enabled ? 1 : 0) : null,
            data.conditionJson ? JSON.stringify(data.conditionJson) : null,
            data.action || null,
            data.severity || null,
            id
        );
    },
    deleteRule: (id) => db.prepare('DELETE FROM fraud_rules WHERE id = ?').run(id)
};

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

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

module.exports = {
    db,
    dbPath,
    userDb,
    calculationDb,
    sessionDb,
    aiRunsDb,
    quotaDb,
    extractionDb,
    deviceDb,
    modelDb,
    bankingDb,
    marketDb,
    fraudDb,
    msmeDb,
    safeJsonParse
};