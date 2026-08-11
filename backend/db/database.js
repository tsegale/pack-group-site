const path = require("path");
const fs = require("fs");
const { createSqlJsClient } = require("./sqlJsClient");

const DB_PATH = path.join(__dirname, "pack.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let dbPromise = null;

/* schema.sql's CREATE TABLE IF NOT EXISTS is a no-op against a leads
   table that already exists from before 'general' was added to the
   source_division CHECK constraint — SQLite bakes CHECK constraints in
   at creation time, so an existing table keeps enforcing the old one
   until it's rebuilt. Recreate it in place, preserving every row. */
function migrateLeadsGeneralDivision(client) {
  const table = client
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leads'",
    )
    .get();
  if (!table || table.sql.includes("'general'")) return;

  const migrate = client.transaction(() => {
    client.exec("ALTER TABLE leads RENAME TO leads_old;");
    client.exec(`
      CREATE TABLE leads (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        phone           TEXT,
        email           TEXT,
        message         TEXT,
        source_division TEXT    NOT NULL DEFAULT 'real-estate'
                          CHECK(source_division IN ('real-estate','insurance','general')),
        property_id     INTEGER REFERENCES properties(id) ON DELETE SET NULL,
        status          TEXT    NOT NULL DEFAULT 'new'
                          CHECK(status IN ('new','contacted','closed')),
        created_at      TEXT    DEFAULT (datetime('now'))
      );
    `);
    client.exec("INSERT INTO leads SELECT * FROM leads_old;");
    client.exec("DROP TABLE leads_old;");
    client.exec(
      "CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);",
    );
    client.exec(
      "CREATE INDEX IF NOT EXISTS idx_leads_division ON leads(source_division);",
    );
  });
  migrate();
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = createSqlJsClient(DB_PATH).then((client) => {
      client.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
      migrateLeadsGeneralDivision(client);
      return client;
    });
  }
  return dbPromise;
}

module.exports = { getDb, DB_PATH };
