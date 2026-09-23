const express = require("express");
const { db } = require("../db");
const auth = require("../lib/auth");
const { randomToken } = require("../lib/ids");
const { isValidTimezone, isDateStr, localDateStr } = require("../lib/time");
const { CURRENCIES, THEMES, str } = require("../lib/util");
const { normalizeMethods } = require("../lib/payments");
const bookings = require("../lib/bookings");
const { OCCUPYING } = require("../lib/slots");
const { serializeArtist, validHandle } = require("./auth");

const router = express.Router();
for (const p of ["/api/me", "/api/services", "/api/availability", "/api/bookings"]) router.use(p, auth.requireAuth);

const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const bad = (res, error) => res.status(400).json({ error });
const HOLD_OPTIONS = [2, 6, 12, 24, 48, 72];
const reload = (id) => db.prepare("SELECT * FROM artists WHERE id = ?").get(id);

// ---- Profile & settings ----------------------------------------------------

router.patch("/api/me", (req, res) => {
  const a = req.artist;
  const b = req.body;
  const pick = (key, fallback, fn = (v) => v) => (b[key] !== undefined ? fn(b[key]) : fallback);

  const next = {
    display_name: pick("displayName", a.display_name, (v) => str(v, 80)),
    handle: pick("handle", a.handle, (v) => str(v, 30).toLowerCase()),
    bio: pick("bio", a.bio, (v) => str(v, 600)),
    location: pick("location", a.location, (v) => str(v, 160)),
    instagram: pick("instagram", a.instagram, (v) => str(v, 60).replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "")),
    timezone: pick("timezone", a.timezone),
    currency: pick("currency", a.currency),
    policy: pick("policy", a.policy, (v) => str(v, 2000)),
    theme: pick("theme", a.theme),
    slot_step_min: pick("slotStepMin", a.slot_step_min),
    min_notice_hours: pick("minNoticeHours", a.min_notice_hours),
    max_days_ahead: pick("maxDaysAhead", a.max_days_ahead),
    cancel_window_hours: pick("cancelWindowHours", a.cancel_window_hours),
    hold_hours: pick("holdHours", a.hold_hours),
    payment_note: pick("paymentNote", a.payment_note, (v) => str(v, 600)),
    payment_methods: a.payment_methods,
  };

  if (!next.display_name) return bad(res, "Name can't be empty.");
  if (!validHandle(next.handle)) return bad(res, "Link name must be 3–30 lowercase letters, numbers or dashes.");
  if (next.handle !== a.handle && db.prepare("SELECT 1 FROM artists WHERE handle = ?").get(next.handle)) {
    return res.status(409).json({ error: "That link name is taken." });
  }
  if (next.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(next.instagram)) return bad(res, "Enter a valid Instagram username.");
  if (!isValidTimezone(next.timezone)) return bad(res, "Pick a valid timezone.");
  if (!CURRENCIES.includes(next.currency)) return bad(res, "Unsupported currency.");
  if (!THEMES[next.theme]) return bad(res, "Unknown page colour.");
  if (![15, 30, 60].includes(next.slot_step_min)) return bad(res, "Start times must be every 15, 30 or 60 minutes.");
  if (!intIn(next.min_notice_hours, 0, 720)) return bad(res, "Minimum notice must be 0–720 hours.");
  if (!intIn(next.max_days_ahead, 1, 365)) return bad(res, "Booking window must be 1–365 days.");
  if (!intIn(next.cancel_window_hours, 0, 720)) return bad(res, "Refund cutoff must be 0–720 hours.");
  if (!HOLD_OPTIONS.includes(next.hold_hours)) return bad(res, "Pick how long to hold unpaid requests.");
  if (b.paymentMethods !== undefined) next.payment_methods = JSON.stringify(normalizeMethods(b.paymentMethods));

  db.prepare(`
    UPDATE artists SET display_name = ?, handle = ?, bio = ?, location = ?, instagram = ?, timezone = ?,
      currency = ?, policy = ?, theme = ?, slot_step_min = ?, min_notice_hours = ?, max_days_ahead = ?,
      cancel_window_hours = ?, hold_hours = ?, payment_note = ?, payment_methods = ?
    WHERE id = ?
  `).run(next.display_name, next.handle, next.bio, next.location, next.instagram, next.timezone,
    next.currency, next.policy, next.theme, next.slot_step_min, next.min_notice_hours, next.max_days_ahead,
    next.cancel_window_hours, next.hold_hours, next.payment_note, next.payment_methods, a.id);

  res.json({ artist: serializeArtist(reload(a.id)) });
});

router.post("/api/me/password", (req, res) => {
  const current = typeof req.body.current === "string" ? req.body.current : "";
  const next = typeof req.body.next === "string" ? req.body.next : "";
  if (!auth.verifyPassword(current, req.artist.password_hash)) return bad(res, "Your current password isn't right.");
  if (next.length < 8) return bad(res, "New password must be at least 8 characters.");
  db.prepare("UPDATE artists SET password_hash = ? WHERE id = ?").run(auth.hashPassword(next), req.artist.id);
  auth.destroyOtherSessions(req.artist.id, req.sessionToken);
  res.json({ ok: true });
});

// A new calendar link, in case the old one was shared somewhere it shouldn't be.
router.post("/api/me/calendar-token", (req, res) => {
  db.prepare("UPDATE artists SET calendar_token = ? WHERE id = ?").run(randomToken(24), req.artist.id);
  res.json({ artist: serializeArtist(reload(req.artist.id)) });
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
  if (s.price_cents !== null && !intIn(s.price_cents, 0, 100_000_000)) return "Invalid price.";
  if (!intIn(s.deposit_cents, 0, 10_000_000)) return "Invalid deposit.";
  if (s.price_cents !== null && s.deposit_cents > s.price_cents) return "The deposit can't be more than the price.";
  return null;
}

const ownService = (id, artistId) => db.prepare("SELECT * FROM services WHERE id = ? AND artist_id = ?").get(Number(id), artistId);

router.get("/api/services", (req, res) => {
  const rows = db.prepare("SELECT * FROM services WHERE artist_id = ? ORDER BY sort_order, id").all(req.artist.id);
  res.json({ services: rows.map(serializeService) });
});

router.post("/api/services", (req, res) => {
  const s = readService(req.body);
  const err = validateService(s);
  if (err) return bad(res, err);
  if (db.prepare("SELECT COUNT(*) AS n FROM services WHERE artist_id = ?").get(req.artist.id).n >= 50) {
    return bad(res, "That's a lot of services! Archive some before adding more.");
  }
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO services (artist_id, name, description, duration_min, price_cents, deposit_cents, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM services WHERE artist_id = ?))
  `).run(req.artist.id, s.name, s.description, s.duration_min, s.price_cents, s.deposit_cents, s.active, req.artist.id);
  res.status(201).json({ service: serializeService(db.prepare("SELECT * FROM services WHERE id = ?").get(lastInsertRowid)) });
});

router.patch("/api/services/:id", (req, res) => {
  const existing = ownService(req.params.id, req.artist.id);
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
  const existing = ownService(req.params.id, req.artist.id);
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
  if (blocked.length > 366 || !blocked.every(isDateStr)) return bad(res, "Invalid day off.");

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
    id: b.id, refCode: b.ref_code, serviceName: b.service_name, startsAt: b.starts_at, endsAt: b.ends_at,
    status: b.status, clientName: b.client_name, clientEmail: b.client_email,
    clientPhone: b.client_phone, clientInstagram: b.client_instagram, notes: b.notes,
    referenceUrl: b.reference_url, depositCents: b.deposit_cents, currency: b.currency,
    depositPaid: !!b.deposit_paid, depositReportedAt: b.deposit_reported_at, depositMethod: b.deposit_method,
    holdExpiresAt: b.hold_expires_at, refundStatus: b.refund_status, cancelledBy: b.cancelled_by,
    cancelReason: b.cancel_reason, createdAt: b.created_at,
  };
}

// "Needs action": requests waiting on a deposit (reported ones first), and
// cancelled bookings whose deposit the artist still has to send back.
router.get("/api/bookings", (req, res) => {
  const id = req.artist.id;
  const now = new Date().toISOString();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
  let rows;
  switch (req.query.scope) {
    case "action":
      rows = db.prepare(`SELECT * FROM bookings WHERE artist_id = ? AND (
          (status = 'awaiting_deposit' AND (deposit_reported_at IS NOT NULL OR hold_expires_at > ?))
          OR refund_status = 'owed')
        ORDER BY (deposit_reported_at IS NULL), starts_at LIMIT ?`).all(id, now, limit);
      break;
    case "past":
      rows = db.prepare(`SELECT * FROM bookings WHERE artist_id = ? AND status = 'confirmed' AND starts_at <= ?
        ORDER BY starts_at DESC LIMIT ?`).all(id, now, limit);
      break;
    case "cancelled":
      rows = db.prepare(`SELECT * FROM bookings WHERE artist_id = ? AND status IN ('cancelled', 'expired')
        ORDER BY starts_at DESC LIMIT ?`).all(id, limit);
      break;
    default:
      rows = db.prepare(`SELECT * FROM bookings WHERE artist_id = ? AND status = 'confirmed' AND starts_at > ?
        ORDER BY starts_at LIMIT ?`).all(id, now, limit);
  }
  res.json({ bookings: rows.map(serializeBooking) });
});

router.get("/api/bookings/stats", (req, res) => {
  const a = req.artist;
  const now = new Date();
  const nowIso = now.toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const one = (sql, ...args) => db.prepare(sql).get(a.id, ...args);

  const upcoming = one(`SELECT COUNT(*) AS n FROM bookings WHERE artist_id = ? AND status = 'confirmed' AND starts_at > ?`, nowIso).n;
  const awaiting = one(`SELECT COUNT(*) AS n, COALESCE(SUM(deposit_reported_at IS NOT NULL), 0) AS reported
    FROM bookings WHERE artist_id = ? AND status = 'awaiting_deposit' AND (deposit_reported_at IS NOT NULL OR hold_expires_at > ?)`, nowIso);
  const refunds = one(`SELECT COUNT(*) AS n FROM bookings WHERE artist_id = ? AND refund_status = 'owed'`).n;
  const deposits = one(`SELECT COALESCE(SUM(deposit_cents), 0) AS c FROM bookings
    WHERE artist_id = ? AND deposit_paid = 1 AND refund_status = 'none' AND status = 'confirmed' AND created_at >= ?`, monthStart).c;
  const kept = one(`SELECT COALESCE(SUM(deposit_cents), 0) AS c FROM bookings
    WHERE artist_id = ? AND status = 'cancelled' AND deposit_paid = 1 AND refund_status = 'none'`).c;
  const week = one(`SELECT COUNT(*) AS n FROM bookings WHERE artist_id = ? AND ${OCCUPYING}
    AND starts_at > ? AND starts_at <= ?`, nowIso, nowIso, new Date(now.getTime() + 7 * 86400000).toISOString()).n;

  res.json({
    upcoming, thisWeek: week,
    awaitingDeposit: awaiting.n, reportedDeposits: awaiting.reported, refundsOwed: refunds,
    needsAction: awaiting.n + refunds,
    depositsThisMonthCents: deposits, keptFromCancellationsCents: kept, currency: a.currency,
  });
});

const ownBooking = (req) => db.prepare("SELECT * FROM bookings WHERE id = ? AND artist_id = ?").get(Number(req.params.id), req.artist.id);

router.post("/api/bookings/:id/confirm-deposit", async (req, res) => {
  const b = ownBooking(req);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking: serializeBooking(await bookings.confirmDeposit(b)) });
});

// Works for declining a request and cancelling a confirmed booking. `refund`
// only matters when money was sent: it marks the deposit as owed back.
router.post("/api/bookings/:id/cancel", async (req, res) => {
  const b = ownBooking(req);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  const updated = await bookings.cancelBooking(b, {
    by: "artist", refund: req.body.refund === true, reason: str(req.body.reason, 500),
  });
  res.json({ booking: serializeBooking(updated) });
});

// The artist sent the money back (refunded), or there was nothing to send
// (none — e.g. the deposit never actually arrived).
router.post("/api/bookings/:id/refund", (req, res) => {
  const b = ownBooking(req);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  if (!["refunded", "none"].includes(req.body.status)) return bad(res, "Invalid refund status.");
  if (b.refund_status !== "owed") return res.status(409).json({ error: "No refund is owed on this booking." });
  db.prepare("UPDATE bookings SET refund_status = ? WHERE id = ?").run(req.body.status, b.id);
  res.json({ booking: serializeBooking(bookings.getBooking(b.id)) });
});

module.exports = router;
