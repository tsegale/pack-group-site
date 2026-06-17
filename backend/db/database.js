const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH = path.join(__dirname, 'pack.db');
const SCHEMA  = path.join(__dirname, 'schema.sql');

let _db;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  _db.exec(schema);
  return _db;
}

module.exports = { getDb };
