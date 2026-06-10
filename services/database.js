/**
 * SQLite Database Service
 * Provides persistent storage for DS Financial API
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'ds_financial.db');
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
    bankingDb
};