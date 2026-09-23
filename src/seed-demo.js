// Creates (or resets) the public demo page at /demo that the landing page
// links to. Run with: npm run seed — or set SEED_DEMO=1 and the server
// creates it on boot if it's missing (handy on Railway, no shell needed).
require("dotenv").config();
const { db, initSchema } = require("./db");
const { hashPassword, randomToken } = require("./lib/auth");

const HANDLE = "demo";

function seedDemo() {
  db.prepare("DELETE FROM artists WHERE handle = ?").run(HANDLE);

  const now = new Date();
  const { lastInsertRowid: id } = db.prepare(`
    INSERT INTO artists (email, password_hash, handle, display_name, bio, location, instagram,
      timezone, policy, trial_ends_at, subscription_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(
    "demo@slotlock.invalid", hashPassword(randomToken()), HANDLE, "Rosa Vega Tattoo",
    "Fine line, botanical and blackwork. Custom pieces and flash. Located in the Mission.",
    "Needle & Rose Studio, 2280 Mission St, San Francisco", "rosavega.tattoo",
    "America/Los_Angeles",
    "Deposits go toward the final price of your tattoo.\n" +
    "Cancel or reschedule at least 48 hours ahead and your deposit is refunded.\n" +
    "Late cancellations and no-shows forfeit the deposit.",
    new Date(now.getTime() + 3650 * 86400000).toISOString(), now.toISOString(),
  );

  const svc = db.prepare(`INSERT INTO services (artist_id, name, description, duration_min, price_cents, deposit_cents, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  svc.run(id, "Flash piece", "Pick any design from my flash sheets. Up to palm size.", 60, 15000, 5000, 1);
  svc.run(id, "Small custom", "Custom design, up to about 4 inches. Send references when you book.", 120, 30000, 7500, 2);
  svc.run(id, "Half day session", "Larger custom work or continuing a piece.", 240, 60000, 10000, 3);
  svc.run(id, "Consultation", "15 minutes to talk through a big project.", 30, null, 0, 4);

  const hours = db.prepare("INSERT INTO availability (artist_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)");
  for (const wd of [2, 3, 4, 5, 6]) hours.run(id, wd, 11 * 60, 19 * 60);

  console.log(`Demo artist ready at /${HANDLE}`);
}

function ensureDemo() {
  if (!db.prepare("SELECT 1 FROM artists WHERE handle = ?").get(HANDLE)) seedDemo();
}

if (require.main === module) {
  initSchema();
  seedDemo();
}

module.exports = { seedDemo, ensureDemo };
