const fs = require("fs");
const initSqlJs = require("sql.js");

let sqlModulePromise = null;

function loadSqlModule() {
  if (!sqlModulePromise) sqlModulePromise = initSqlJs();
  return sqlModulePromise;
}

/* better-sqlite3 callers pass either positional args (a, b, c) or a single
   named-params object ({key: val}). sql.js requires named-param object keys
   to carry the SQL placeholder's own prefix (@/:/$), and silently ignores
   (rather than errors on) keys that don't match — so mismatched prefixes
   fail silently with NULL binds instead of a loud error. Normalising here
   keeps every route's existing call-site shape working unchanged. */
function normalizeParams(args) {
  if (args.length === 0) return undefined;
  if (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === "object" &&
    !Array.isArray(args[0])
  ) {
    const obj = args[0];
    const named = {};
    for (const key of Object.keys(obj)) {
      const prefixed = /^[@:$]/.test(key) ? key : "@" + key;
      named[prefixed] = obj[key];
    }
    return named;
  }
  return args;
}

/* Creates a better-sqlite3-shaped client (prepare/exec/transaction) backed
   by sql.js. sql.js keeps the whole database in memory and never touches
   disk on its own, so every write persists the full export back to
   dbPath — the cost is trivial at this site's scale and it removes any
   chance of a route forgetting to save. */
async function createSqlJsClient(dbPath) {
  const SQL = await loadSqlModule();
  const sqljsDb = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  let suspendPersist = false;

  function persist() {
    if (suspendPersist) return;
    fs.writeFileSync(dbPath, Buffer.from(sqljsDb.export()));
    /* sql.js silently resets PRAGMA foreign_keys to OFF on the live
       connection as a side effect of export() — without this, every
       write after the first would stop enforcing ON DELETE CASCADE. */
    sqljsDb.run("PRAGMA foreign_keys = ON;");
  }

  function wrapStatement(sql) {
    return {
      get(...args) {
        const stmt = sqljsDb.prepare(sql);
        try {
          const params = normalizeParams(args);
          if (params !== undefined) stmt.bind(params);
          return stmt.step() ? stmt.getAsObject() : undefined;
        } finally {
          stmt.free();
        }
      },
      all(...args) {
        const stmt = sqljsDb.prepare(sql);
        try {
          const params = normalizeParams(args);
          if (params !== undefined) stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      },
      run(...args) {
        const stmt = sqljsDb.prepare(sql);
        let changes = 0;
        try {
          const params = normalizeParams(args);
          if (params !== undefined) stmt.bind(params);
          stmt.step();
          changes = sqljsDb.getRowsModified();
        } finally {
          stmt.free();
        }
        const idRes = sqljsDb.exec("SELECT last_insert_rowid() AS id");
        const lastInsertRowid = idRes.length
          ? idRes[0].values[0][0]
          : undefined;
        if (changes > 0) persist();
        return { changes, lastInsertRowid };
      },
    };
  }

  return {
    prepare(sql) {
      return wrapStatement(sql);
    },
    exec(sql) {
      sqljsDb.run(sql);
      persist();
    },
    transaction(fn) {
      return (...args) => {
        suspendPersist = true;
        sqljsDb.run("BEGIN");
        try {
          const result = fn(...args);
          sqljsDb.run("COMMIT");
          suspendPersist = false;
          persist();
          return result;
        } catch (err) {
          sqljsDb.run("ROLLBACK");
          suspendPersist = false;
          throw err;
        }
      };
    },
    save: persist,
  };
}

module.exports = { createSqlJsClient };
