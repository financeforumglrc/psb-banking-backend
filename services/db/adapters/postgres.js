/**
 * PostgreSQL adapter stub for the DB abstraction layer.
 * Not yet wired up; acts as a placeholder for production migration.
 */

function notConfigured() {
  throw new Error(
    'PostgreSQL adapter not yet configured. Set DB_TYPE=sqlite or configure DATABASE_URL with a valid Postgres connection string.'
  );
}

module.exports = {
  db: new Proxy(
    {},
    {
      get: (_, prop) => {
        if (prop === 'prepare') return notConfigured;
        return notConfigured;
      }
    }
  ),
  prepare: notConfigured,
  // Expose stubs for all known DB interfaces so require() does not crash on startup.
  userDb: {},
  calculationDb: {},
  sessionDb: {},
  aiRunsDb: {},
  quotaDb: {},
  extractionDb: {},
  deviceDb: {},
  modelDb: {},
  bankingDb: {},
  fraudDb: {},
  safeJsonParse: (v) => v
};
