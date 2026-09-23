// The live database on Railway was created by the first release. Build one
// like it (old schema, old statuses, the old demo row) and make sure the new
// code upgrades it in place without losing anything.
require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

test("upgrades a first-release database in place", async () => {
  const old = new DatabaseSync(process.env.DB_PATH);
  old.exec(fs.readFileSync(path.join(__dirname, "fixtures/schema-v1.sql"), "utf8"));
  const now = new Date().toISOString();
  const later = (h) => new Date(Date.now() + h * 3600000).toISOString();
  old.prepare(`INSERT INTO artists (id, email, password_hash, handle, display_name, timezone, trial_ends_at, created_at,
    stripe_account_id, stripe_charges_enabled) VALUES (1, 'real@example.com', 'x', 'real-artist', 'Real', 'UTC', ?, ?, 'acct_1', 1)`).run(later(100), now);
  old.prepare(`INSERT INTO artists (id, email, password_hash, handle, display_name, timezone, trial_ends_at, created_at)
    VALUES (2, 'demo@slotlock.invalid', 'x', 'demo', 'Old Demo', 'UTC', ?, ?)`).run(later(100), now);
  old.prepare(`INSERT INTO services (id, artist_id, name, duration_min, deposit_cents) VALUES (1, 1, 'Flash', 60, 2000)`).run();
  old.prepare(`INSERT INTO services (id, artist_id, name, duration_min, deposit_cents) VALUES (2, 2, 'Old', 60, 2000)`).run();
  const booking = old.prepare(`INSERT INTO bookings (artist_id, service_id, public_token, service_name, starts_at, ends_at, status,
    hold_expires_at, client_name, client_email, deposit_cents, currency, deposit_paid, refunded, created_at)
    VALUES (?, ?, ?, 'Flash', ?, ?, ?, ?, 'C', 'c@example.com', 2000, 'usd', ?, ?, ?)`);
  booking.run(1, 1, "tok-pending", later(48), later(49), "pending_payment", later(0.5), 0, 0, now);
  booking.run(1, 1, "tok-refunded", later(72), later(73), "cancelled", null, 1, 1, now);
  booking.run(1, 1, "tok-confirmed", later(96), later(97), "confirmed", null, 1, 0, now);
  booking.run(2, 2, "tok-demo", later(20), later(21), "confirmed", null, 1, 0, now);
  old.close();

  const { startServer } = require("./helpers");
  const ctx = await startServer();
  try {
    const { db } = require("../src/db");
    const rows = Object.fromEntries(db.prepare("SELECT * FROM bookings").all().map((b) => [b.public_token, b]));
    assert.equal(rows["tok-pending"].status, "awaiting_deposit");
    assert.equal(rows["tok-refunded"].refund_status, "refunded");
    assert.equal(rows["tok-confirmed"].status, "confirmed");
    assert.equal(rows["tok-confirmed"].refund_status, "none");
    assert.ok(Object.values(rows).every((b) => /^[2-9A-Z]{5}$/.test(b.ref_code)));
    assert.equal(rows["tok-demo"], undefined, "old demo rebuilt from scratch");

    const real = db.prepare("SELECT * FROM artists WHERE handle = 'real-artist'").get();
    assert.equal(real.payment_methods, "[]");
    assert.equal(real.hold_hours, 24);
    assert.equal(real.theme, "vermilion");
    assert.ok(real.calendar_token);
    // Newer features default to off / open, so nothing changes for existing artists.
    assert.equal(real.books_open, 1);
    assert.equal(real.consent_enabled, 0);
    assert.equal(real.aftercare_enabled, 0);
    assert.equal(db.prepare("SELECT mode FROM services WHERE id = 1").get().mode, "book");
    for (const table of ["requests", "request_photos", "waitlist", "consents"]) {
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), `${table} table created`);
    }

    const demo = db.prepare("SELECT * FROM artists WHERE handle = 'demo'").get();
    assert.equal(demo.is_demo, 1);
    assert.equal(demo.display_name, "Rosa Vega Tattoo");

    // Old artist's page and booking still work through the API.
    const client = ctx.client();
    assert.equal((await client("GET", "/api/public/artists/real-artist")).status, 200);
    const r = await client("GET", "/api/public/bookings/tok-confirmed");
    assert.equal(r.status, 200);
    assert.equal(r.body.booking.status, "confirmed");
    assert.equal((await client("GET", "/demo")).status, 200);

    // Booting again is a no-op for the migration.
    const { initSchema } = require("../src/db");
    initSchema();
    assert.equal(db.prepare("SELECT status FROM bookings WHERE public_token = 'tok-pending'").get().status, "awaiting_deposit");
  } finally {
    ctx.server.close();
  }
});
