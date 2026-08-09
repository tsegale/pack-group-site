const path = require("path");
const fs = require("fs");
const { createSqlJsClient } = require("./sqlJsClient");

const DB_PATH = path.join(__dirname, "pack.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let dbPromise = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = createSqlJsClient(DB_PATH).then((client) => {
      client.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
      return client;
    });
  }
  return dbPromise;
}

module.exports = { getDb, DB_PATH };
