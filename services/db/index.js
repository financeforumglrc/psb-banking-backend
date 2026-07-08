/**
 * Database adapter selector.
 * Switching DB_TYPE in environment changes the active adapter with zero code changes.
 */

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let adapter;
if (DB_TYPE === 'postgres') {
  adapter = require('./adapters/postgres');
} else {
  adapter = require('./adapters/sqlite');
}

module.exports = adapter;
