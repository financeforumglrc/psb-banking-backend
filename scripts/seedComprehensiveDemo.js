/**
 * Comprehensive SecureWealth Twin demo seeder.
 *
 * Seeds 8 curated personas with realistic accounts, ~500 transactions,
 * goals, assets, audit logs, and fraud events. Safe to run on startup:
 * it skips users that already exist unless FORCE=1 is set.
 */

const bcrypt = require('bcryptjs');
const { db, userDb, bankingDb } = require('../services/database');
const {
  PERSONAS,
  DEMO_PASSWORD,
  generateAccounts,
  generateAssets,
  generateGoals,
  generateTransactions,
  generateAuditLogs,
  generateFraudEvents,
} = require('../seeds/syntheticPersonas');
const { ingestAllRealData, linkAssetToInstrument } = require('../services/dataIngestion');

const FORCE = process.env.FORCE_COMPREHENSIVE_SEED === '1' || process.env.FORCE_SEED === '1';

// Map synthetic asset names to real market instrument symbols.
function resolveAssetSymbol(name, assetType) {
  const n = (name || '').toLowerCase();
  if (n.includes('nifty')) return '^NSEI';
  if (n.includes('reliance')) return 'RELIANCE.NS';
  if (n.includes('tcs')) return 'TCS.NS';
  if (n.includes('infosys') || n.includes('infy')) return 'INFY.NS';
  if (n.includes('hdfc bank')) return 'HDFCBANK.NS';
  if (n.includes('icici')) return 'ICICIBANK.NS';
  if (n.includes('sbi')) return 'SBIN.NS';
  if (n.includes('unilever') || n.includes('hul')) return 'HINDUNILVR.NS';
  if (n.includes('itc')) return 'ITC.NS';
  if (n.includes('l&t') || n.includes('larsen')) return 'LT.NS';
  if (n.includes('bharti') || n.includes('airtel')) return 'BHARTIARTL.NS';
  if (n.includes('kotak')) return 'KOTAKBANK.NS';
  if (n.includes('axis')) return 'AXISBANK.NS';
  if (n.includes('bajaj finance')) return 'BAJFINANCE.NS';
  if (n.includes('maruti')) return 'MARUTI.NS';
  if (n.includes('tata motors')) return 'TATAMOTORS.NS';
  if (n.includes('sun pharma')) return 'SUNPHARMA.NS';
  if (n.includes('dr reddy')) return 'DRREDDY.NS';
  if (assetType === 'gold' || n.includes('gold') || n.includes('sgb')) return 'GC=F';
  if (assetType === 'mutualFund' && n.includes('bluechip')) return '^NSEI';
  if (assetType === 'mutualFund' && n.includes('small cap')) return '^NSEI';
  if (assetType === 'stock') return '^NSEI';
  return null;
}

async function clearPersonaData() {
  console.log('[seedComprehensiveDemo] clearing existing persona data...');
  const ids = PERSONAS.map(p => p.id);
  const emails = PERSONAS.map(p => p.email);
  const idPlaceholders = ids.map(() => '?').join(',');
  const emailPlaceholders = emails.map(() => '?').join(',');

  // Resolve ids to delete (by persona id OR email)
  const rows = db.prepare(`SELECT id FROM users WHERE id IN (${idPlaceholders}) OR email IN (${emailPlaceholders})`).all(...ids, ...emails);
  const idsToDelete = rows.map(r => r.id);
  if (idsToDelete.length === 0) {
    console.log('[seedComprehensiveDemo] no existing persona data to clear.');
    return;
  }
  const delPlaceholders = idsToDelete.map(() => '?').join(',');

  // Cascading delete order to respect foreign keys
  db.prepare(`DELETE FROM fraud_event_actions WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${delPlaceholders}))`).run(...idsToDelete);
  db.prepare(`DELETE FROM fraud_hops WHERE fraud_case_id IN (SELECT id FROM fraud_cases WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${delPlaceholders})))`).run(...idsToDelete);
  db.prepare(`DELETE FROM fraud_accounts WHERE fraud_case_id IN (SELECT id FROM fraud_cases WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${delPlaceholders})))`).run(...idsToDelete);
  db.prepare(`DELETE FROM fraud_notes WHERE fraud_case_id IN (SELECT id FROM fraud_cases WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${delPlaceholders})))`).run(...idsToDelete);
  db.prepare(`DELETE FROM fraud_cases WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${delPlaceholders}))`).run(...idsToDelete);
  db.prepare(`DELETE FROM audit_logs WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM transactions WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM goals WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM user_assets WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM bank_accounts WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM sessions WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM kyc_records WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM calculations WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM msme_applications WHERE user_id IN (${delPlaceholders})`).run(...idsToDelete);
  db.prepare(`DELETE FROM users WHERE id IN (${delPlaceholders})`).run(...idsToDelete);
  console.log(`[seedComprehensiveDemo] cleared ${idsToDelete.length} persona records.`);
}

function seedSinglePersona(persona, hashedPassword) {
  // 1. User
  userDb.create({
    id: persona.id,
    email: persona.email,
    password: hashedPassword,
    name: persona.name,
    phone: persona.phone,
    role: persona.role,
    tier: persona.tier,
    pan_number: persona.pan,
    aadhar: persona.aadhar,
  });

  // 2. Accounts
  const accounts = generateAccounts(persona);
  const accountRows = accounts.map(acc => {
    const result = bankingDb.createAccount({
      userId: persona.id,
      accountNumber: acc.accountNumber,
      type: acc.type,
      balance: acc.balance,
      ifsc: acc.ifsc,
      branch: acc.branch,
      status: acc.status,
    });
    return { ...acc, dbId: result.lastInsertRowid };
  });

  // 3. Transactions (~60 per user)
  const txns = generateTransactions(persona, accountRows, 60);
  txns.forEach((t, idx) => {
    bankingDb.createTransaction({
      userId: persona.id,
      fromAccount: t.fromAccount,
      toAccount: t.toAccount,
      type: t.type,
      amount: t.amount,
      description: t.description,
      status: t.status,
      referenceId: `TXN-${persona.id}-${idx}-${Date.now()}`,
    });
  });

  // 4. Goals
  const goals = generateGoals(persona);
  goals.forEach(g => {
    bankingDb.createGoal({
      userId: persona.id,
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      deadline: g.deadline,
      goalType: g.goalType,
      status: g.status,
    });
  });

  // 5. Assets (with real-market linking where possible)
  const assets = generateAssets(persona);
  assets.forEach(a => {
    const result = bankingDb.createAsset({
      userId: persona.id,
      name: a.name,
      assetType: a.assetType,
      value: a.value,
      liquidity: a.liquidity,
      returns: a.returns,
    });
    // Link synthetic assets to real instruments for proper market tracking.
    const symbol = resolveAssetSymbol(a.name, a.assetType);
    if (symbol) {
      linkAssetToInstrument(result.lastInsertRowid, symbol, { personaId: persona.id, seededValue: a.value });
    }
  });

  // 6. Audit logs
  const auditLogs = generateAuditLogs(persona, accountRows, txns);
  auditLogs.forEach(log => {
    bankingDb.createAuditLog({
      userId: persona.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      newValue: log.newValue,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
    });
  });

  // 7. Fraud events (inserted as audit logs with risky locations)
  const fraudEvents = generateFraudEvents(persona, txns);
  fraudEvents.forEach(event => {
    bankingDb.createAuditLog({
      userId: persona.id,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      newValue: event.newValue,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
    });
  });

  console.log(`[seedComprehensiveDemo] seeded ${persona.name}: ${accounts.length} accounts, ${txns.length} txns, ${goals.length} goals, ${assets.length} assets, ${auditLogs.length} audit logs, ${fraudEvents.length} fraud events`);
  return { accounts, txns, goals, assets, auditLogs, fraudEvents };
}

async function seedComprehensiveDemo() {
  const existingById = db.prepare(`SELECT COUNT(*) as count FROM users WHERE id IN (${PERSONAS.map(() => '?').join(',')})`).all(...PERSONAS.map(p => p.id))[0].count;
  const existingByEmail = db.prepare(`SELECT COUNT(*) as count FROM users WHERE email IN (${PERSONAS.map(() => '?').join(',')})`).all(...PERSONAS.map(p => p.email))[0].count;

  if ((existingById > 0 || existingByEmail > 0) && !FORCE) {
    console.log(`[seedComprehensiveDemo] ${existingById} ids / ${existingByEmail} emails already exist, skipping (set FORCE_SEED=1 to overwrite).`);
    return { seeded: false, reason: 'already_exists' };
  }

  if (FORCE && (existingById > 0 || existingByEmail > 0)) {
    await clearPersonaData();
  }

  // Ingest real-world reference data before creating personas so asset linking works.
  console.log('[seedComprehensiveDemo] ingesting real-world reference data...');
  try {
    const dataSummary = await ingestAllRealData();
    console.log('[seedComprehensiveDemo] real-world data ingestion summary:', JSON.stringify(dataSummary, null, 2));
  } catch (err) {
    console.warn('[seedComprehensiveDemo] real-world data ingestion failed (continuing with synthetic data):', err.message);
  }

  console.log('[seedComprehensiveDemo] seeding curated personas...');
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

  const insertAll = db.transaction(() => {
    for (const persona of PERSONAS) {
      seedSinglePersona(persona, hashedPassword);
    }
  });

  insertAll();

  // Update account balances to reflect net transaction flow (optional: keep seeded balance as opening)
  // We leave seeded balances as the opening balance; transactions are historical records.

  console.log('[seedComprehensiveDemo] done.');
  return { seeded: true, personas: PERSONAS.length };
}

if (require.main === module) {
  seedComprehensiveDemo()
    .then(result => {
      console.log(result);
      process.exit(0);
    })
    .catch(err => {
      console.error('[seedComprehensiveDemo] error:', err);
      process.exit(1);
    });
}

module.exports = { seedComprehensiveDemo, seedSinglePersona };
