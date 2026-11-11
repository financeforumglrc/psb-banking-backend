# Storage Architecture — Best Free Storage

**Date:** 12 November 2026
**Goal:** Ensure the site uses the best possible **free** storage that survives redeploys.

---

## 1. Current Architecture (hybrid, already strong)

The backend uses a **two-tier hybrid**:

### Tier 1 — SQLite (`better-sqlite3`, WAL mode)
- **Primary store.** Synchronous, fast, simple — ~200 call sites use it directly.
- `journal_mode = WAL`, `foreign_keys = ON`.
- Lives at `DATABASE_PATH` (Render: `/tmp/ds-financial.db`; local: `backend/data/ds_financial.db`).

### Tier 2 — PostgreSQL persistence adapter (`services/pgAdapter.js`)
- Activated when **`DATABASE_URL`** is set (Render free Postgres).
- **Strategy:**
  1. Ensure Postgres schema exists (`scripts/pg-schema.sql`).
  2. **Hydrate** the local SQLite file from Postgres on startup.
  3. Install SQLite triggers recording every INSERT/UPDATE/DELETE in a **sync queue**.
  4. **Flush** the queue to Postgres every **15 s** (auto-flush) and on graceful shutdown (drain).

This keeps the fast synchronous SQLite API **and** gets durable Postgres persistence **without** rewriting the codebase.

## 2. Why This Matters for Free Tier

- **Render free instances use an ephemeral filesystem** — SQLite data is **wiped on every redeploy/restart**.
- **Postgres is the only durable free option.** The adapter makes Postgres the source of truth and SQLite the working cache.

## 3. New: Storage Status Endpoint (`GET /api/v1/storage`)

Added to answer "is my data actually safe?" at a glance:

```json
{
  "success": true,
  "mode": "durable",            // "durable" (Postgres) | "ephemeral" (SQLite-only)
  "engine": "postgresql",       // "postgresql" | "sqlite"
  "postgresConnected": true,
  "sqlite": { "path": "...", "sizeBytes": 348160 },
  "note": "Data survives redeploys via PostgreSQL."
}
```

- **`mode: "durable"`** → user data survives redeploys. ✅
- **`mode: "ephemeral"`** → SQLite-only; data WILL be lost on the next redeploy. ⚠️

## 4. Verification

- **Backend tests:** 13 suites / **133 tests passing** (added `tests/storage.test.js` with 3 tests).
- **Local smoke test:** `GET /api/v1/storage` → HTTP 200, correct `ephemeral`/`sqlite` payload.
- **`/api/v1/ready`** still reports the database engine.

## 5. The One Critical Action

> **Link a free Render PostgreSQL database to the backend** and set `DATABASE_URL`.
> `render.yaml` already has `REQUIRE_POSTGRES: true` and `DATABASE_URL: sync: false`, so the app is configured to require it — just ensure a Postgres instance is actually attached.

### Free-tier Postgres caveats (documented)
- Render free Postgres is limited (~256 MB, 1 concurrent connection) and **expires after 30 days** unless upgraded.
- If Postgres is unavailable and `REQUIRE_POSTGRES=true`, the app fails fast (by design, to prevent silent data loss).
- `REQUIRE_POSTGRES=false` → app falls back to SQLite-only with a console warning.

## 6. Recommended Storage Safety (free)

1. **Attach free Render Postgres** (primary action — makes storage durable).
2. **Set `REQUIRE_POSTGRES=true`** (already done) so the app never silently runs in data-loss mode.
3. **Monitor `/api/v1/storage`** — if it ever reports `ephemeral`, fix Postgres immediately.
4. **Back up Postgres** periodically (e.g. `pg_dump` via a cron/free scheduler) — free-tier Postgres is ephemeral too.

---

*End of storage documentation.*
