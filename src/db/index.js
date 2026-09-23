const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

// Same approach as the garden backend: Node's built-in node:sqlite, so there's
// no native build step. Requires Node 22.5+.
//
// Double-booking safety relies on this being synchronous: the slot check and
// the INSERT in routes/public.js run in the same tick with no await between
// them, so two requests can't both claim a slot. If this moves to Postgres,
// that check needs a transaction or an exclusion constraint instead.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/slotlock.db");

if (process.env.NODE_ENV === "production" && !process.env.DB_PATH) {
  console.warn(
    "WARNING: DB_PATH is not set in production — SQLite data will be lost on the next " +
    "deploy/restart unless a persistent Volume is mounted and DB_PATH points into it."
  );
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const sqliteDb = new DatabaseSync(DB_PATH);
sqliteDb.exec("PRAGMA journal_mode = WAL");
sqliteDb.exec("PRAGMA foreign_keys = ON");

const db = {
  prepare: (sql) => sqliteDb.prepare(sql),
  exec: (sql) => sqliteDb.exec(sql),
};

function initSchema() {
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
}

module.exports = { db, initSchema, DB_PATH };
