const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");
const { randomToken, refCode } = require("../lib/ids");

// Node's built-in node:sqlite, so there's no native build step. Needs Node 22.5+.
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

// Columns added after the first release. CREATE TABLE IF NOT EXISTS leaves an
// existing table alone, so databases created by older versions (like the one
// already running on Railway) get these added on boot.
const ADDED_COLUMNS = [
  ["artists", "hold_hours", "INTEGER NOT NULL DEFAULT 24"],
  ["artists", "payment_methods", "TEXT NOT NULL DEFAULT '[]'"],
  ["artists", "payment_note", "TEXT NOT NULL DEFAULT ''"],
  ["artists", "theme", "TEXT NOT NULL DEFAULT 'vermilion'"],
  ["artists", "avatar_image_id", "INTEGER"],
  ["artists", "calendar_token", "TEXT"],
  ["artists", "is_demo", "INTEGER NOT NULL DEFAULT 0"],
  ["bookings", "ref_code", "TEXT"],
  ["bookings", "deposit_reported_at", "TEXT"],
  ["bookings", "deposit_method", "TEXT NOT NULL DEFAULT ''"],
  ["bookings", "refund_status", "TEXT NOT NULL DEFAULT 'none'"],
  ["bookings", "cancel_reason", "TEXT NOT NULL DEFAULT ''"],
];

const columnsOf = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));

function initSchema() {
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

  for (const [table, column, definition] of ADDED_COLUMNS) {
    if (!columnsOf(table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_calendar_token ON artists(calendar_token)");

  // Data from the first release, when deposits were charged by card through
  // Stripe: unpaid bookings are now "awaiting_deposit", and the old refunded
  // flag becomes refund_status.
  db.exec("UPDATE bookings SET status = 'awaiting_deposit' WHERE status = 'pending_payment'");
  if (columnsOf("bookings").has("refunded")) {
    db.exec("UPDATE bookings SET refund_status = 'refunded' WHERE refunded = 1 AND refund_status = 'none'");
  }
  for (const { id } of db.prepare("SELECT id FROM artists WHERE calendar_token IS NULL").all()) {
    db.prepare("UPDATE artists SET calendar_token = ? WHERE id = ?").run(randomToken(24), id);
  }
  for (const { id } of db.prepare("SELECT id FROM bookings WHERE ref_code IS NULL").all()) {
    db.prepare("UPDATE bookings SET ref_code = ? WHERE id = ?").run(refCode(), id);
  }
}

module.exports = { db, initSchema, DB_PATH };
