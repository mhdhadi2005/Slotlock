const express = require("express");
const { db } = require("../db");
const { requireAuth } = require("../lib/auth");
const { isValidTimezone, isDateStr, localDateStr } = require("../lib/time");
const { CURRENCIES, str } = require("../lib/util");
const { cancelBooking } = require("../lib/bookings");
const { serializeArtist, validHandle } = require("./auth");

const router = express.Router();
router.use("/api/me", requireAuth);
router.use("/api/services", requireAuth);
router.use("/api/availability", requireAuth);
router.use("/api/bookings", requireAuth);

const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const bad = (res, error) => res.status(400).json({ error });

// ---- Profile & settings ----------------------------------------------------

router.patch("/api/me", (req, res) => {
  const a = req.artist;
  const b = req.body;
  const next = {
    display_name: b.displayName !== undefined ? str(b.displayName, 80) : a.display_name,
    handle: b.handle !== undefined ? str(b.handle, 30).toLowerCase() : a.handle,
    bio: b.bio !== undefined ? str(b.bio, 600) : a.bio,
    location: b.location !== undefined ? str(b.location, 160) : a.location,
    instagram: b.instagram !== undefined ? str(b.instagram, 60).replace(/^@/, "") : a.instagram,
    timezone: b.timezone ?? a.timezone,
    currency: b.currency ?? a.currency,
    policy: b.policy !== undefined ? str(b.policy, 2000) : a.policy,
    slot_step_min: b.slotStepMin ?? a.slot_step_min,
    min_notice_hours: b.minNoticeHours ?? a.min_notice_hours,
    max_days_ahead: b.maxDaysAhead ?? a.max_days_ahead,
    cancel_window_hours: b.cancelWindowHours ?? a.cancel_window_hours,
  };

  if (!next.display_name) return bad(res, "Name can't be empty.");
  if (!validHandle(next.handle)) return bad(res, "Link name must be 3–30 lowercase letters, numbers or dashes.");
  if (next.handle !== a.handle && db.prepare("SELECT 1 FROM artists WHERE handle = ?").get(next.handle)) {
    return res.status(409).json({ error: "That link name is taken." });
  }
  if (!isValidTimezone(next.timezone)) return bad(res, "Pick a valid timezone.");
  if (!CURRENCIES.includes(next.currency)) return bad(res, "Unsupported currency.");
  if (![15, 30, 60].includes(next.slot_step_min)) return bad(res, "Start times must be every 15, 30 or 60 minutes.");
  if (!intIn(next.min_notice_hours, 0, 720)) return bad(res, "Minimum notice must be 0–720 hours.");
  if (!intIn(next.max_days_ahead, 1, 365)) return bad(res, "Booking window must be 1–365 days.");
  if (!intIn(next.cancel_window_hours, 0, 720)) return bad(res, "Cancellation window must be 0–720 hours.");

  db.prepare(`
    UPDATE artists SET display_name = ?, handle = ?, bio = ?, location = ?, instagram = ?,
      timezone = ?, currency = ?, policy = ?, slot_step_min = ?, min_notice_hours = ?,
      max_days_ahead = ?, cancel_window_hours = ?
    WHERE id = ?
  `).run(next.display_name, next.handle, next.bio, next.location, next.instagram,
    next.timezone, next.currency, next.policy, next.slot_step_min, next.min_notice_hours,
    next.max_days_ahead, next.cancel_window_hours, a.id);

  res.json({ artist: serializeArtist(db.prepare("SELECT * FROM artists WHERE id = ?").get(a.id)) });
});

// ---- Services --------------------------------------------------------------

function serializeService(s) {
  return {
    id: s.id, name: s.name, description: s.description, durationMin: s.duration_min,
    priceCents: s.price_cents, depositCents: s.deposit_cents, active: !!s.active,
  };
}

function readService(body, existing = {}) {
  const pick = (k, fallback) => (body[k] !== undefined ? body[k] : fallback);
  return {
    name: str(pick("name", existing.name), 100),
    description: str(pick("description", existing.description ?? ""), 600),
    duration_min: pick("durationMin", existing.duration_min),
    price_cents: pick("priceCents", existing.price_cents ?? null),
    deposit_cents: pick("depositCents", existing.deposit_cents ?? 0),
    active: pick("active", existing.active === undefined ? true : !!existing.active) ? 1 : 0,
  };
}

function validateService(s) {
  if (!s.name) return "Give the service a name.";
  if (!intIn(s.duration_min, 15, 12 * 60) || s.duration_min % 15) return "Length must be 15 min to 12 h, in 15-minute steps.";
  if (s.price_cents !== null && !intIn(s.price_cents, 0, 10_000_000)) return "Invalid price.";
  if (!intIn(s.deposit_cents, 0, 1_000_000)) return "Invalid deposit.";
  if (s.deposit_cents > 0 && s.deposit_cents < 100) return "Deposits must be at least 1.00 (card processing minimum).";
  return null;
}

router.get("/api/services", (req, res) => {
  const rows = db.prepare("SELECT * FROM services WHERE artist_id = ? ORDER BY sort_order, id").all(req.artist.id);
  res.json({ services: rows.map(serializeService) });
});

router.post("/api/services", (req, res) => {
  const s = readService(req.body);
  const err = validateService(s);
  if (err) return bad(res, err);
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO services (artist_id, name, description, duration_min, price_cents, deposit_cents, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM services WHERE artist_id = ?))
  `).run(req.artist.id, s.name, s.description, s.duration_min, s.price_cents, s.deposit_cents, s.active, req.artist.id);
  res.status(201).json({ service: serializeService(db.prepare("SELECT * FROM services WHERE id = ?").get(lastInsertRowid)) });
});

router.patch("/api/services/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM services WHERE id = ? AND artist_id = ?").get(Number(req.params.id), req.artist.id);
  if (!existing) return res.status(404).json({ error: "Service not found." });
  const s = readService(req.body, existing);
  const err = validateService(s);
  if (err) return bad(res, err);
  db.prepare(`
    UPDATE services SET name = ?, description = ?, duration_min = ?, price_cents = ?, deposit_cents = ?, active = ?
    WHERE id = ?
  `).run(s.name, s.description, s.duration_min, s.price_cents, s.deposit_cents, s.active, existing.id);
  res.json({ service: serializeService(db.prepare("SELECT * FROM services WHERE id = ?").get(existing.id)) });
});

router.delete("/api/services/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM services WHERE id = ? AND artist_id = ?").get(Number(req.params.id), req.artist.id);
  if (!existing) return res.status(404).json({ error: "Service not found." });
  // Bookings reference services, so ones that have been booked are hidden
  // rather than deleted.
  const used = db.prepare("SELECT 1 FROM bookings WHERE service_id = ? LIMIT 1").get(existing.id);
  if (used) db.prepare("UPDATE services SET active = 0 WHERE id = ?").run(existing.id);
  else db.prepare("DELETE FROM services WHERE id = ?").run(existing.id);
  res.json({ ok: true, archived: !!used });
});

// ---- Availability ----------------------------------------------------------

router.get("/api/availability", (req, res) => {
  const rules = db.prepare("SELECT weekday, start_min, end_min FROM availability WHERE artist_id = ? ORDER BY weekday").all(req.artist.id);
  const blocked = db.prepare("SELECT date FROM blocked_dates WHERE artist_id = ? AND date >= ? ORDER BY date")
    .all(req.artist.id, localDateStr(Date.now(), req.artist.timezone)).map((r) => r.date);
  res.json({
    rules: rules.map((r) => ({ weekday: r.weekday, startMin: r.start_min, endMin: r.end_min })),
    blocked,
  });
});

router.put("/api/availability", (req, res) => {
  const rules = Array.isArray(req.body.rules) ? req.body.rules : [];
  const blocked = Array.isArray(req.body.blocked) ? req.body.blocked : [];
  const seen = new Set();
  for (const r of rules) {
    if (!intIn(r.weekday, 0, 6) || seen.has(r.weekday)) return bad(res, "Invalid weekday.");
    seen.add(r.weekday);
    if (!intIn(r.startMin, 0, 1440) || !intIn(r.endMin, 0, 1440) || r.endMin <= r.startMin) {
      return bad(res, "Each day's closing time must be after its opening time.");
    }
  }
  if (blocked.length > 366 || !blocked.every(isDateStr)) return bad(res, "Invalid blocked date.");

  const id = req.artist.id;
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM availability WHERE artist_id = ?").run(id);
    db.prepare("DELETE FROM blocked_dates WHERE artist_id = ?").run(id);
    const addRule = db.prepare("INSERT INTO availability (artist_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)");
    for (const r of rules) addRule.run(id, r.weekday, r.startMin, r.endMin);
    const addBlocked = db.prepare("INSERT OR IGNORE INTO blocked_dates (artist_id, date) VALUES (?, ?)");
    for (const d of blocked) addBlocked.run(id, d);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  res.json({ ok: true });
});

// ---- Bookings --------------------------------------------------------------

function serializeBooking(b) {
  return {
    id: b.id, serviceName: b.service_name, startsAt: b.starts_at, endsAt: b.ends_at,
    status: b.status, clientName: b.client_name, clientEmail: b.client_email,
    clientPhone: b.client_phone, clientInstagram: b.client_instagram, notes: b.notes,
    referenceUrl: b.reference_url, depositCents: b.deposit_cents, currency: b.currency,
    depositPaid: !!b.deposit_paid, refunded: !!b.refunded, cancelledBy: b.cancelled_by,
    createdAt: b.created_at,
  };
}

router.get("/api/bookings", (req, res) => {
  const now = new Date().toISOString();
  const scope = req.query.scope;
  let rows;
  if (scope === "past") {
    rows = db.prepare(`SELECT * FROM bookings WHERE artist_id = ? AND status = 'confirmed' AND starts_at <= ?
      ORDER BY starts_at DESC LIMIT 200`).all(req.artist.id, now);
  } else if (scope === "cancelled") {
    rows = db.prepare(`SELECT * FROM bookings WHERE artist_id = ? AND status = 'cancelled'
      ORDER BY starts_at DESC LIMIT 200`).all(req.artist.id);
  } else {
    rows = db.prepare(`SELECT * FROM bookings WHERE artist_id = ? AND status = 'confirmed' AND starts_at > ?
      ORDER BY starts_at LIMIT 500`).all(req.artist.id, now);
  }
  res.json({ bookings: rows.map(serializeBooking) });
});

router.get("/api/bookings/stats", (req, res) => {
  const a = req.artist;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const upcoming = db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE artist_id = ? AND status = 'confirmed' AND starts_at > ?`)
    .get(a.id, now.toISOString()).n;
  const deposits = db.prepare(`SELECT COALESCE(SUM(deposit_cents), 0) AS c FROM bookings
    WHERE artist_id = ? AND deposit_paid = 1 AND refunded = 0 AND created_at >= ?`).get(a.id, monthStart).c;
  const kept = db.prepare(`SELECT COALESCE(SUM(deposit_cents), 0) AS c FROM bookings
    WHERE artist_id = ? AND status = 'cancelled' AND deposit_paid = 1 AND refunded = 0`).get(a.id).c;
  res.json({ upcoming, depositsThisMonthCents: deposits, keptFromCancellationsCents: kept, currency: a.currency });
});

router.post("/api/bookings/:id/cancel", async (req, res) => {
  const b = db.prepare("SELECT * FROM bookings WHERE id = ? AND artist_id = ?").get(Number(req.params.id), req.artist.id);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  const updated = await cancelBooking(b, { by: "artist", refund: req.body.refund !== false });
  res.json({ booking: serializeBooking(updated) });
});

module.exports = router;
