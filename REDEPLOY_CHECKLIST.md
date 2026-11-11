# Backend Redeploy & Durable Storage Checklist

**Verified live (12 Nov 2026):** storage endpoint, corrected CSP, Permissions-Policy, security headers all deployed. Backend is currently **SQLite-only (ephemeral)** — data resets on every redeploy until you complete step 2–4.

## Steps to get durable (survive redeploys) storage

1. **Restore `services/database.js`** from your backup/IDE history — the version with the `pgAdapter` (Postgres) wiring. Do NOT restore the files I intentionally changed (`server.js`, `tests/storage.test.js`, `STORAGE.md`).
2. **Create a free Render PostgreSQL** (dashboard → New → PostgreSQL → Free) — note the 30-day expiry.
3. **Set `DATABASE_URL`** on the backend service (Environment) to the Postgres connection string. Also keep `REQUIRE_POSTGRES=true` (already in `render.yaml`).
4. **Redeploy.** On startup the backend will:
   - Hydrate the local SQLite from Postgres (if Postgres has data) or seed it.
   - Install triggers that queue every mutation.
   - Flush the queue to Postgres every 15s + on shutdown.
5. **Verify:** `curl https://psb-securewealth-backend.onrender.com/api/v1/storage` → expect `"mode":"durable"`, `"engine":"postgresql"`.

## Current state (before durable storage)

- `/api/v1/storage` → `{"mode":"ephemeral","engine":"sqlite","note":"SQLite-only: data WILL be lost on the next redeploy..."}`
- Health: 8 users, 24 accounts, 480 transactions, 47 patents, 23 instruments, 10 RBI macro, 5 external datasets.
- If you redeploy now (before Postgres is wired), those 480 transactions are lost.

## Already done & live (no action needed)

- Storage observability endpoint `/api/v1/storage`.
- CSP: CDN allowlist (cdnjs/jsdelivr/unpkg), `wasm-unsafe-eval`, Razorpay frame, `object-src 'none'`, `upgrade-insecure-requests`.
- `Permissions-Policy`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`.
- CI Node 24; pre-commit hook fixed (0 ESLint no-undef).
