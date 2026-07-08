/**
 * SQLite adapter for the DB abstraction layer.
 * In production this re-exports the existing better-sqlite3-backed database service.
 */

const database = require('../../services/database');

module.exports = database;
