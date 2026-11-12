# Backend Redeploy & Durable Storage Checklist

**Verified live (12 Nov 2026):** storage endpoint, corrected CSP, Permissions-Policy, security headers all deployed. **All durability CODE is deployed and waiting** — the only remaining action is to set `DATABASE_URL` on the Render backend service.

## What's already done & live (no action needed)

- `services/database.js` — pgAdapter (Postgres) durability wiring: hydrate SQLite from Postgres, install mutation triggers, auto-flush every 15s. (commits `02fa5dc`, `7dfd4ed`)
- `server.js` — graceful-shutdown flush: on `SIGTERM`/`SIGINT`, `pgAdapter.flushAndShutdown(db)` writes the queued mutations before exit. (commit `8cf69f2`)
- `services/pgAdapter.js` — **first-connect backfill**: when Postgres is empty, the existing SQLite rows (the 480 transactions, users, etc.) are uploaded to Postgres so they are NOT lost on the next redeploy. (commit `434a8e7`)
- `REQUIRE_POSTGRES` — warns (never crashes) if `DATABASE_URL` is unset.
- Storage observability endpoint `/api/v1/storage`.
- CSP: CDN allowlist (cdnjs/jsdelivr/unpkg), `wasm-unsafe-eval`, Razorpay frame, `object-src 'none'`, `upgrade-insecure-requests`.
- `Permissions-Policy`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`.
- Backend test suite: **143/143 pass** (precise DCF/FCFF engines, route order, backfill test).

## The only remaining step: activate durable storage (user action on Render)

1. **Create a free Render PostgreSQL** — dashboard → New → PostgreSQL → Free (note: 30-day expiry, then recreate and re-set `DATABASE_URL`).
2. **Copy the Internal Database URL** (`postgres://user:pass@host:port/dbname`).
3. **Set `DATABASE_URL`** on the backend service → Environment → Add. Keep `REQUIRE_POSTGRES=true` (already in `render.yaml`).
4. **Deploy / Restart** the backend. On startup it will:
   - Backfill the existing SQLite rows (480 transactions, etc.) to Postgres — nothing is lost.
   - Install triggers that queue every mutation.
   - Flush the queue to Postgres every 15s + on shutdown.
5. **Verify:** `curl https://psb-securewealth-backend.onrender.com/api/v1/storage` → expect `"mode":"durable"`, `"engine":"postgresql"`, `"postgresConnected":true`.

## Current state (before durable storage)

- `/api/v1/storage` → `{"mode":"ephemeral","engine":"sqlite","note":"SQLite-only: data WILL be lost on the next redeploy..."}`
- Health: 8 users, 24 accounts, 480 transactions, 47 patents, 23 instruments, 10 RBI macro, 5 external datasets.
- If you redeploy now (before `DATABASE_URL` is set), those 480 transactions are still at risk — but the moment you connect Postgres, the backfill preserves them.
