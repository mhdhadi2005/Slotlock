const express = require("express");
const { db } = require("../db");
const { randomToken, refCode } = require("../lib/ids");
const { slotsForService } = require("../lib/slots");
const { localDateStr, isDateStr, formatWhen } = require("../lib/time");
const { calendar } = require("../lib/ics");
const { parseMethods, methodsForBooking, TYPES } = require("../lib/payments");
const bookings = require("../lib/bookings");
const {
  THEMES, billingState, depositsReady, rateLimit, str, isEmail, isHttpUrl,
} = require("../lib/util");
const { imageUrl } = require("./auth");

const router = express.Router();
const bookingLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
const actionLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });

const artistByHandle = (h) => db.prepare("SELECT * FROM artists WHERE handle = ?").get(String(h).toLowerCase());
const activeService = (artistId, id) =>
  db.prepare("SELECT * FROM services WHERE id = ? AND artist_id = ? AND active = 1").get(Number(id), artistId);
const bookingByToken = (t) => db.prepare("SELECT * FROM bookings WHERE public_token = ?").get(String(t));
const portfolioOf = (artistId) => db.prepare("SELECT id FROM images WHERE artist_id = ? AND kind = 'portfolio' ORDER BY sort_order, id")
  .all(artistId).map((r) => imageUrl(r.id));

function publicArtist(a) {
  return {
    handle: a.handle, displayName: a.display_name, bio: a.bio, location: a.location,
    instagram: a.instagram, timezone: a.timezone, currency: a.currency, policy: a.policy,
    cancelWindowHours: a.cancel_window_hours, holdHours: a.hold_hours,
    theme: a.theme, accent: THEMES[a.theme] || THEMES.vermilion,
    avatarUrl: imageUrl(a.avatar_image_id),
    isDemo: !!a.is_demo,
  };
}

router.get("/api/public/artists/:handle", (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  const ready = depositsReady(a);
  const services = db.prepare("SELECT * FROM services WHERE artist_id = ? AND active = 1 ORDER BY sort_order, id")
    .all(a.id)
    .map((s) => ({
      id: s.id, name: s.name, description: s.description, durationMin: s.duration_min,
      priceCents: s.price_cents, depositCents: s.deposit_cents,
      bookable: s.deposit_cents === 0 || ready,
    }));
  res.json({
    artist: {
      ...publicArtist(a),
      portfolio: portfolioOf(a.id),
      paymentMethods: [...new Set(parseMethods(a.payment_methods).map((m) => TYPES[m.type].label))],
      acceptingBookings: billingState(a).active,
    },
    services,
  });
});

router.get("/api/public/artists/:handle/availability", (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  const service = activeService(a.id, req.query.service);
  if (!service) return res.status(404).json({ error: "Service not found." });
  const today = localDateStr(Date.now(), a.timezone);
  const from = isDateStr(req.query.from) && req.query.from > today ? req.query.from : today;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 31);
  res.json({ timezone: a.timezone, today, days: slotsForService(a, service, from, days) });
});

router.post("/api/public/artists/:handle/bookings", bookingLimiter, async (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  if (!billingState(a).active) return res.status(403).json({ error: `${a.display_name} isn't taking online bookings right now.` });
  const service = activeService(a.id, req.body.serviceId);
  if (!service) return res.status(404).json({ error: "That service isn't available." });
  if (service.deposit_cents > 0 && !depositsReady(a)) {
    return res.status(403).json({ error: `${a.display_name} hasn't set up deposits yet. Message them directly to book.` });
  }

  const name = str(req.body.name, 100);
  const email = str(req.body.email, 254).toLowerCase();
  const phone = str(req.body.phone, 40);
  const instagram = str(req.body.instagram, 60).replace(/^@/, "");
  const notes = str(req.body.notes, 2000);
  const referenceUrl = str(req.body.referenceUrl, 500);
  if (!name) return res.status(400).json({ error: "Enter your name." });
  if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (referenceUrl && !isHttpUrl(referenceUrl)) return res.status(400).json({ error: "Reference link must start with http:// or https://" });
  if (a.policy && req.body.agreedToPolicy !== true) return res.status(400).json({ error: "Please agree to the booking policy." });

  const startMs = Date.parse(req.body.start);
  if (!startMs) return res.status(400).json({ error: "Pick a time." });
  const startIso = new Date(startMs).toISOString();

  // Re-derive the slot list server-side: the client only gets to pick from
  // times that are genuinely free right now. No await between this check and
  // the INSERT below — that's what keeps two clients from taking one slot.
  const date = localDateStr(startMs, a.timezone);
  const [day] = slotsForService(a, service, date, 1);
  if (!day || !day.slots.includes(startIso)) {
    return res.status(409).json({ error: "Sorry, that time was just taken. Please pick another." });
  }

  const now = Date.now();
  const needsDeposit = service.deposit_cents > 0;
  const token = randomToken(18);
  const endIso = new Date(startMs + service.duration_min * 60000).toISOString();
  const { lastInsertRowid: bookingId } = db.prepare(`
    INSERT INTO bookings (artist_id, service_id, public_token, ref_code, service_name, starts_at, ends_at, status,
      hold_expires_at, client_name, client_email, client_phone, client_instagram, notes, reference_url,
      deposit_cents, currency, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(a.id, service.id, token, refCode(), service.name, startIso, endIso,
    needsDeposit ? "awaiting_deposit" : "confirmed",
    needsDeposit ? bookings.holdUntil(startMs, a.hold_hours, now) : null,
    name, email, phone, instagram, notes, referenceUrl,
    service.deposit_cents, a.currency, new Date(now).toISOString());

  const booking = bookings.getBooking(bookingId);
  if (needsDeposit) await bookings.notifyRequested(booking);
  else await bookings.notifyConfirmed(booking, { instant: true });
  res.status(201).json({ redirectUrl: `/booking/${token}` });
});

// ---- A client's own booking, addressed by its unguessable token -----------

function serializeForClient(b) {
  const a = db.prepare("SELECT * FROM artists WHERE id = ?").get(b.artist_id);
  const future = Date.parse(b.starts_at) > Date.now();
  const cancellable = ["awaiting_deposit", "confirmed"].includes(b.status) && future;
  const awaiting = b.status === "awaiting_deposit";
  return {
    status: b.status,
    refCode: b.ref_code,
    serviceName: b.service_name,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    when: formatWhen(b.starts_at, a.timezone),
    clientName: b.client_name,
    depositCents: b.deposit_cents,
    currency: b.currency,
    depositPaid: !!b.deposit_paid,
    depositReported: !!b.deposit_reported_at,
    depositMethod: b.deposit_method,
    holdExpiresAt: awaiting && !b.deposit_reported_at ? b.hold_expires_at : null,
    refundStatus: b.refund_status,
    cancelledBy: b.cancelled_by,
    cancelReason: b.cancel_reason,
    cancellable,
    refundOnCancel: cancellable && bookings.moneySent(b) ? bookings.clientRefundEligible(b, a) : false,
    googleCalendarUrl: bookings.googleCalendarLink(b, a),
    payment: awaiting ? {
      note: a.payment_note,
      methods: methodsForBooking(parseMethods(a.payment_methods), {
        amountCents: b.deposit_cents, currency: b.currency, ref: b.ref_code, payee: a.display_name, demo: !!a.is_demo,
      }),
    } : null,
    artist: publicArtist(a),
  };
}

router.get("/api/public/bookings/:token", (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking: serializeForClient(b) });
});

router.post("/api/public/bookings/:token/report-deposit", actionLimiter, async (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  const method = TYPES[req.body.method] ? req.body.method : "";
  await bookings.reportDeposit(b, method);
  res.json({ booking: serializeForClient(bookingByToken(req.params.token)) });
});

router.post("/api/public/bookings/:token/cancel", actionLimiter, async (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  const a = db.prepare("SELECT * FROM artists WHERE id = ?").get(b.artist_id);
  const updated = await bookings.cancelBooking(b, {
    by: "client", refund: bookings.clientRefundEligible(b, a), reason: str(req.body.reason, 500),
  });
  res.json({ booking: serializeForClient(updated) });
});

router.get("/api/public/bookings/:token/ics", (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b || b.status !== "confirmed") return res.status(404).send("Not found");
  const a = db.prepare("SELECT * FROM artists WHERE id = ?").get(b.artist_id);
  const ics = calendar({
    events: [{
      uid: `${b.public_token}@slotlock`, start: b.starts_at, end: b.ends_at,
      summary: `${b.service_name} with ${a.display_name}`, location: a.location,
      description: `Manage your booking: ${bookings.bookingLink(b)}`, status: "CONFIRMED",
    }],
  });
  res.type("text/calendar").attachment("appointment.ics").send(ics);
});

module.exports = { router, artistByHandle, portfolioOf };
