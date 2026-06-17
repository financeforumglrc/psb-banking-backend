# DS Financial API

## Patent-Protected Financial API Platform

### Version: 2.0.0

---

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Development mode
npm run dev

# Run tests
npm test
```

## Render Deployment Notes

### PostgreSQL persistence (free tier)

The backend now supports Render's free PostgreSQL service so data survives redeploys:

1. Create a Render PostgreSQL instance and copy its **internal connection string**.
2. In the Render dashboard for `psb-securewealth-backend`, set the env var:
   - `DATABASE_URL` = `postgresql://...`
3. (Optional) Seed Postgres from an existing local SQLite file:
   ```bash
   export DATABASE_URL=postgresql://...
   node scripts/migrate-sqlite-to-pg.js
   ```
4. Deploy/restart the web service. On startup it will:
   - Ensure the Postgres schema (`scripts/pg-schema.sql`).
   - Hydrate the local SQLite cache from Postgres.
   - Install triggers that queue every local mutation.
   - Flush the queue to Postgres every 15 seconds and on shutdown.

If `DATABASE_URL` is not set, the service falls back to plain SQLite (used by tests and local dev).

### SendGrid email OTP

The `/api/v1/otp/*` endpoints send real OTPs via SendGrid when configured:

1. Sign up for a free SendGrid account at https://sendgrid.com (100 emails/day).
2. Create a single sender and an API key.
3. In the Render dashboard set:
   - `SENDGRID_API_KEY` = your API key
   - `SENDGRID_FROM_EMAIL` = verified sender email (e.g. `noreply@dsfinancial.in`)
   - `SENDGRID_FROM_NAME` = `PSB SecureWealth`

If SendGrid is not configured, OTPs are logged to the server console in dev/test mode.

---

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `GET /api/v1/auth/me` - Get current user

### OTP
- `POST /api/v1/otp/send` - Send email OTP
- `POST /api/v1/otp/verify` - Verify email OTP

### GST (Patents PAT-001 to PAT-006)
- `POST /api/v1/gst/validate-gstin` - GSTIN validation with risk scoring
- `POST /api/v1/gst/analyze-itc-risk` - ITC risk analysis
- `POST /api/v1/gst/detect-shell-companies` - Shell company detection
- `POST /api/v1/gst/verify-rates` - Tax rate verification
- `POST /api/v1/gst/predict-itc-recovery` - ITC recovery prediction
- `POST /api/v1/gst/comprehensive-analysis` - All analyses combined

### Tax (Patent PAT-004)
- `POST /api/v1/tax/calculate-income-tax` - Income tax calculation
- `POST /api/v1/tax/optimize` - Full tax optimization
- `POST /api/v1/tax/calculate-hra` - HRA exemption calculation
- `GET /api/v1/tax/slabs/:year` - Tax slabs

### AI (Patent PAT-007)
- `POST /api/v1/ai/ask` - Ask AI tax questions
- `POST /api/v1/ai/summarize` - Summarize documents
- `POST /api/v1/ai/analyze-tax-scenario` - Analyze tax scenarios
- `GET /api/v1/ai/providers` - List AI providers

### Documents
- `POST /api/v1/documents/generate-invoice` - Generate GST invoice
- `POST /api/v1/documents/generate-report` - Generate reports

### Analytics
- `GET /api/v1/analytics/usage` - API usage stats
- `GET /api/v1/analytics/patents` - Patent usage analytics
- `GET /api/v1/analytics/dashboard` - Executive dashboard

## Patent Portfolio

| Patent | Title | Status |
|--------|-------|--------|
| PAT-001 | GSTIN Risk Intelligence Validator | Provisional Filed |
| PAT-002 | ITC Risk Scanner | Provisional Filed |
| PAT-003 | Shell Company Detector | Provisional Filed |
| PAT-004 | Multi-Regime Tax Optimizer | Provisional Filed |
| PAT-005 | Tax Rate Error Detector | Provisional Filed |
| PAT-006 | Missing ITC Recovery Predictor | Provisional Filed |
| PAT-007 | Multi-Provider AI Orchestrator | Provisional Filed |

## Security

- JWT authentication
- Rate limiting
- Helmet security headers
- CORS protection
- Input validation
