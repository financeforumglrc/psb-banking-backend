#!/usr/bin/env node
/**
 * Phase 2 Audit Script for dsFinancial
 * Run: API_BASE=http://localhost:5000/api/v1 node scripts/audit-phase2.js
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'dsf-admin-2024';

const checks = [
  {
    name: "Health endpoint",
    method: "GET",
    path: "/health",
    expect: r => r.success === true && r.message?.includes('running')
  },
  {
    name: "Gallery list (≥3 models)",
    method: "GET",
    path: "/gallery",
    expect: r => Array.isArray(r.data) && r.data.length >= 3
  },
  {
    name: "Reliance model loads",
    method: "GET",
    path: "/gallery/reliance-industries",
    expect: r => r.data?.company?.name
  },
  {
    name: "TCS model loads",
    method: "GET",
    path: "/gallery/tcs",
    expect: r => r.data?.company?.name
  },
  {
    name: "Infosys model loads",
    method: "GET",
    path: "/gallery/infosys",
    expect: r => r.data?.company?.name
  },
  {
    name: "AI test endpoint (Gemini)",
    method: "POST",
    path: "/ai/test",
    body: { task: "chat", message: "Reply with the single word: OK" },
    expect: r => r.success === true && (r.response?.text?.includes("OK") || r.response?.includes("OK") || JSON.stringify(r.response).includes("OK"))
  },
  {
    name: "AI explain-cell",
    method: "POST",
    path: "/ai/explain-cell",
    body: {
      cell: { label: "FCFF Year 3", value: 12500, formula: "EBIT*(1-t)+DA-CapEx-dWC" },
      context: { currency: "INR" }
    },
    expect: r => r.success === true && (r.explanation?.what_it_is || r.explanation?.json?.what_it_is)
  },
  {
    name: "Server quota check",
    method: "GET",
    path: "/admin/quota",
    headers: { "Authorization": "Basic " + Buffer.from("admin:" + ADMIN_PASS).toString("base64") },
    expect: r => typeof r.remaining === "number"
  },
];

async function run() {
  let pass = 0, fail = 0;
  console.log(`\n🔍 dsFinancial Phase 2 Audit`);
  console.log(`   API_BASE: ${API_BASE}\n`);

  for (const c of checks) {
    try {
      const url = c.path.startsWith('/admin')
        ? `${API_BASE.replace('/api/v1', '')}${c.path}`
        : `${API_BASE}${c.path}`;

      const headers = { "Content-Type": "application/json", ...(c.headers || {}) };
      const res = await fetch(url, {
        method: c.method,
        headers,
        body: c.body ? JSON.stringify(c.body) : undefined,
      });

      let data;
      const text = await res.text();
      try { data = JSON.parse(text); } catch { data = text; }

      if (c.expect(data)) {
        console.log(`✅ ${c.name}`);
        pass++;
      } else {
        console.log(`❌ ${c.name} — unexpected response`);
        console.log("   Response:", JSON.stringify(data).substring(0, 200));
        fail++;
      }
    } catch (e) {
      console.log(`💥 ${c.name}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n📊 Results: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
