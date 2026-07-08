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

const FORCE = process.env.FORCE_COMPREHENSIVE_SEED === '1' || process.env.FORCE_SEED === '1';

async function clearPersonaData() {
  console.log('[seedComprehensiveDemo] clearing existing persona data...');
  const ids = PERSONAS.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');

  // Cascading delete order to respect foreign keys
  db.prepare(`DELETE FROM fraud_event_actions WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${placeholders}))`).run(...ids);
  db.prepare(`DELETE FROM fraud_hops WHERE fraud_case_id IN (SELECT id FROM fraud_cases WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${placeholders})))`).run(...ids);
  db.prepare(`DELETE FROM fraud_accounts WHERE fraud_case_id IN (SELECT id FROM fraud_cases WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${placeholders})))`).run(...ids);
  db.prepare(`DELETE FROM fraud_notes WHERE fraud_case_id IN (SELECT id FROM fraud_cases WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${placeholders})))`).run(...ids);
  db.prepare(`DELETE FROM fraud_cases WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE user_id IN (${placeholders}))`).run(...ids);
  db.prepare(`DELETE FROM audit_logs WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM transactions WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM goals WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM user_assets WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM bank_accounts WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM sessions WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM kyc_records WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM calculations WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM msme_applications WHERE user_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids);
  console.log('[seedComprehensiveDemo] cleared persona data.');
}

async function seedComprehensiveDemo() {
  const anyExisting = db.prepare(`SELECT COUNT(*) as count FROM users WHERE id IN (${PERSONAS.map(() => '?').join(',')})`).all(...PERSONAS.map(p => p.id));
  const existingCount = anyExisting[0].count;

  if (existingCount > 0 && !FORCE) {
    console.log(`[seedComprehensiveDemo] ${existingCount} personas already seeded, skipping (set FORCE_SEED=1 to overwrite).`);
    return { seeded: false, reason: 'already_exists' };
  }

  if (FORCE && existingCount > 0) {
    await clearPersonaData();
  }

  console.log('[seedComprehensiveDemo] seeding curated personas...');
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

  const insertAll = db.transaction(() => {
    for (const persona of PERSONAS) {
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

      // 5. Assets
      const assets = generateAssets(persona);
      assets.forEach(a => {
        bankingDb.createAsset({
          userId: persona.id,
          name: a.name,
          assetType: a.assetType,
          value: a.value,
          liquidity: a.liquidity,
          returns: a.returns,
        });
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

module.exports = { seedComprehensiveDemo };
