# PSB Banking Backend — Deployment Guide

## Option 1: Render (Recommended — Free Tier)

### Step 1: Create GitHub Repo
1. Go to https://github.com/new
2. Name: `psb-banking-backend`
3. Make it **Public**
4. Click "Create repository"

### Step 2: Push Code
```bash
cd E:/DS_Financial/backend
git remote add origin https://github.com/YOUR_USERNAME/psb-banking-backend.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy on Render
1. Go to https://dashboard.render.com/
2. Click **New +** → **Blueprint**
3. Connect your GitHub account
4. Select `psb-banking-backend` repo
5. Render will auto-detect `render.yaml`
6. Click **Apply**
7. Wait 2-3 minutes for build

### Step 4: Get Backend URL
After deploy, your URL will be: `https://psb-banking-backend.onrender.com`

### Step 5: Update Frontend
In `PSB-Website-Clean/client/src/lib/backendApi.ts`, change:
```js
const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api/v1';
```

Set environment variable in Surge/Vite:
```
VITE_BACKEND_URL=https://psb-banking-backend.onrender.com/api/v1
```

Or for quick test, hardcode:
```js
const API_BASE = 'https://psb-banking-backend.onrender.com/api/v1';
```

### Step 6: Seed Database
After first deploy, hit this endpoint to seed demo data:
```
POST https://psb-banking-backend.onrender.com/api/v1/banking/seed
```

---

## Option 2: Railway

```bash
npm install -g @railway/cli
railway login
railway init --name psb-banking-backend
railway up
```

---

## Environment Variables

| Variable | Required | Default |
|---|---|---|
| `PORT` | No | 5000 |
| `NODE_ENV` | No | development |
| `JWT_SECRET` | Yes | - |
| `ADMIN_PASSWORD` | No | dsf-admin-2024 |
| `GEMINI_API_KEY` | No | (mock mode) |
| `DATABASE_PATH` | No | ./data/ds_financial.db |

---

## Post-Deploy Checklist

- [ ] Backend URL responds with health check
- [ ] CORS allows `psb-securewealth-2026-new.surge.sh`
- [ ] Frontend `backendApi.ts` points to deployed URL
- [ ] `/api/v1/banking/seed` seeded the database
- [ ] All 4 banking features load real data
