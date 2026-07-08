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

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `GET /api/v1/auth/me` - Get current user

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
- API key support for enterprise

## License

Proprietary - DS Financial Solutions
