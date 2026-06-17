-- PostgreSQL schema for PSB SecureWealth Twin backend
-- Run this against your Render Postgres (or local PostgreSQL) before starting the app.
-- Then set DATABASE_URL env var to the Postgres connection string.

-- Users
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    api_usage_total INTEGER DEFAULT 0,
    api_usage_month INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    face_descriptor TEXT,
    aadhar TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Calculations
CREATE TABLE IF NOT EXISTS calculations (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    input_data TEXT,
    result_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calculations_user ON calculations(user_id);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- AI runs
CREATE TABLE IF NOT EXISTS ai_runs (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_device ON ai_runs(device_id, created_at);

-- Server quota
CREATE TABLE IF NOT EXISTS server_quota (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    date TEXT NOT NULL,
    extract_used INTEGER DEFAULT 0,
    chat_used INTEGER DEFAULT 0,
    explain_used INTEGER DEFAULT 0,
    memo_used INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extractions
CREATE TABLE IF NOT EXISTS extractions (
    id SERIAL PRIMARY KEY,
    device_id TEXT,
    pdf_hash TEXT NOT NULL UNIQUE,
    storage_path TEXT,
    filename TEXT,
    size_bytes INTEGER,
    company_name TEXT,
    ticker TEXT,
    result_json TEXT,
    overall_confidence REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extractions_hash ON extractions(pdf_hash);

-- Device IDs
CREATE TABLE IF NOT EXISTS device_ids (
    device_id TEXT PRIMARY KEY,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    extract_count_today INTEGER DEFAULT 0,
    chat_count_today INTEGER DEFAULT 0,
    explain_count_today INTEGER DEFAULT 0,
    quota_date TEXT DEFAULT (CURRENT_DATE::TEXT)
);

-- Financial models
CREATE TABLE IF NOT EXISTS financial_models (
    id SERIAL PRIMARY KEY,
    device_id TEXT,
    slug TEXT UNIQUE,
    company_name TEXT NOT NULL,
    ticker TEXT,
    exchange TEXT,
    is_public INTEGER DEFAULT 0,
    model_json TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_models_device ON financial_models(device_id);
CREATE INDEX IF NOT EXISTS idx_models_slug ON financial_models(slug);
CREATE INDEX IF NOT EXISTS idx_models_public ON financial_models(is_public);

-- Model versions
CREATE TABLE IF NOT EXISTS model_versions (
    id SERIAL PRIMARY KEY,
    model_id INTEGER NOT NULL REFERENCES financial_models(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    model_json TEXT NOT NULL,
    change_summary TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_versions_model ON model_versions(model_id, version_number);

-- Model comments
CREATE TABLE IF NOT EXISTS model_comments (
    id SERIAL PRIMARY KEY,
    model_id INTEGER NOT NULL REFERENCES financial_models(id) ON DELETE CASCADE,
    cell_id TEXT,
    comment TEXT NOT NULL,
    author TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_model ON model_comments(model_id, cell_id);

-- Saved scenarios
CREATE TABLE IF NOT EXISTS saved_scenarios (
    id SERIAL PRIMARY KEY,
    device_id TEXT,
    model_id INTEGER,
    name TEXT NOT NULL,
    scenario_key TEXT,
    assumptions_json TEXT NOT NULL,
    intrinsic_value REAL,
    is_public INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scenarios_device ON saved_scenarios(device_id);

-- Banking
CREATE TABLE IF NOT EXISTS bank_accounts (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_number TEXT UNIQUE NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'savings',
    balance REAL NOT NULL DEFAULT 0,
    ifsc TEXT,
    branch TEXT,
    status TEXT DEFAULT 'active',
    opened_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON bank_accounts(user_id);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_account TEXT,
    to_account TEXT,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'completed',
    reference_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at);

CREATE TABLE IF NOT EXISTS beneficiaries (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_number TEXT,
    ifsc TEXT,
    bank_name TEXT,
    upi_id TEXT,
    verified INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_number_masked TEXT NOT NULL,
    expiry TEXT,
    cvv_masked TEXT,
    card_type TEXT DEFAULT 'debit',
    status TEXT DEFAULT 'active',
    limit_daily REAL DEFAULT 50000,
    limit_monthly REAL DEFAULT 500000,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    amount REAL NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'upcoming',
    is_recurring INTEGER DEFAULT 0,
    frequency TEXT DEFAULT 'monthly',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    billing_cycle TEXT DEFAULT 'monthly',
    next_billing TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kyc_records (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    pan_number TEXT,
    aadhaar_masked TEXT,
    kyc_status TEXT DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    ekyc_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    deadline TEXT,
    goal_type TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

CREATE TABLE IF NOT EXISTS user_assets (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    asset_type TEXT,
    value REAL DEFAULT 0,
    liquidity TEXT,
    returns REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loans, recurring, audit
CREATE TABLE IF NOT EXISTS loans (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);

CREATE TABLE IF NOT EXISTS recurring_payments (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_payments(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at);

-- Device fingerprints
CREATE TABLE IF NOT EXISTS device_fingerprints (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    fingerprint_hash TEXT NOT NULL,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    is_trusted INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON device_fingerprints(user_id);

-- OTP attempts
CREATE TABLE IF NOT EXISTS otp_attempts (
    id SERIAL PRIMARY KEY,
    recipient TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'secure transaction',
    attempts INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    verified INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_recipient ON otp_attempts(recipient, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_attempts(expires_at);

-- Razorpay test orders (optional, for demo tracking)
CREATE TABLE IF NOT EXISTS payment_orders (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    razorpay_order_id TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    receipt TEXT,
    status TEXT DEFAULT 'created',
    metadata TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
