const express = require("express");
const { db } = require("../db");
const stripe = require("../lib/stripe");
const { randomToken } = require("../lib/auth");
const { slotsForService } = require("../lib/slots");
const { localDateStr, isDateStr, formatWhen } = require("../lib/time");
const bookings = require("../lib/bookings");
const {
  baseUrl, billingState, depositsReady, rateLimit, str, isEmail, isHttpUrl,
} = require("../lib/util");

const router = express.Router();
const bookingLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

// Stripe Checkout sessions can't expire sooner than 30 minutes, so the slot
// hold runs a little longer than that: an unpaid booking never loses its slot
// while the client can still pay.
const CHECKOUT_MINUTES = 31;
const HOLD_MINUTES = 35;

const artistByHandle = (h) => db.prepare("SELECT * FROM artists WHERE handle = ?").get(String(h).toLowerCase());
const activeService = (artistId, id) =>
  db.prepare("SELECT * FROM services WHERE id = ? AND artist_id = ? AND active = 1").get(Number(id), artistId);
const bookingByToken = (t) => db.prepare("SELECT * FROM bookings WHERE public_token = ?").get(String(t));

function publicServices(artist) {
  return db.prepare("SELECT * FROM services WHERE artist_id = ? AND active = 1 ORDER BY sort_order, id")
    .all(artist.id)
    .map((s) => ({
      id: s.id, name: s.name, description: s.description, durationMin: s.duration_min,
      priceCents: s.price_cents, depositCents: s.deposit_cents,
      bookable: s.deposit_cents === 0 || depositsReady(artist),
    }));
}

router.get("/api/public/artists/:handle", (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  res.json({
    artist: {
      handle: a.handle, displayName: a.display_name, bio: a.bio, location: a.location,
      instagram: a.instagram, timezone: a.timezone, currency: a.currency, policy: a.policy,
      cancelWindowHours: a.cancel_window_hours,
      acceptingBookings: billingState(a).active,
    },
    services: publicServices(a),
    demoPayments: !stripe.enabled(),
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
  res.json({ timezone: a.timezone, days: slotsForService(a, service, from, days) });
});

router.post("/api/public/artists/:handle/bookings", bookingLimiter, async (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  if (!billingState(a).active) return res.status(403).json({ error: `${a.display_name} isn't taking online bookings right now.` });
  const service = activeService(a.id, req.body.serviceId);
  if (!service) return res.status(404).json({ error: "That service isn't available." });
  if (service.deposit_cents > 0 && !depositsReady(a)) {
    return res.status(403).json({ error: `${a.display_name} hasn't finished setting up deposits yet.` });
  }

  const name = str(req.body.name, 100);
  const email = str(req.body.email, 254).toLowerCase();
  const phone = str(req.body.phone, 40);
  const instagram = str(req.body.instagram, 60);
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
  const token = randomToken(18);
  const needsDeposit = service.deposit_cents > 0;
  const endIso = new Date(startMs + service.duration_min * 60000).toISOString();
  const { lastInsertRowid: bookingId } = db.prepare(`
    INSERT INTO bookings (artist_id, service_id, public_token, service_name, starts_at, ends_at, status,
      hold_expires_at, client_name, client_email, client_phone, client_instagram, notes, reference_url,
      deposit_cents, currency, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(a.id, service.id, token, service.name, startIso, endIso,
    needsDeposit ? "pending_payment" : "confirmed",
    needsDeposit ? new Date(now + HOLD_MINUTES * 60000).toISOString() : null,
    name, email, phone, instagram, notes, referenceUrl,
    service.deposit_cents, a.currency, new Date(now).toISOString());

  const bookingUrl = `/booking/${token}`;

  if (!needsDeposit) {
    await bookings.notifyConfirmed(bookings.getBooking(bookingId));
    return res.status(201).json({ redirectUrl: bookingUrl });
  }

  if (!stripe.enabled()) {
    return res.status(201).json({ redirectUrl: `${bookingUrl}?demo_pay=1` });
  }

  try {
    const session = await stripe.call("POST", "/checkout/sessions", {
      mode: "payment",
      customer_email: email,
      client_reference_id: String(bookingId),
      expires_at: Math.floor(now / 1000) + CHECKOUT_MINUTES * 60,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: a.currency,
          unit_amount: service.deposit_cents,
          product_data: {
            name: `Deposit: ${service.name} with ${a.display_name}`,
            description: formatWhen(startIso, a.timezone),
          },
        },
      }],
      payment_intent_data: {
        transfer_data: { destination: a.stripe_account_id },
        metadata: { booking_id: String(bookingId) },
      },
      metadata: { kind: "deposit", booking_id: String(bookingId) },
      success_url: `${baseUrl()}${bookingUrl}?paid=1`,
      cancel_url: `${baseUrl()}${bookingUrl}?abandon=1`,
    });
    db.prepare("UPDATE bookings SET stripe_checkout_session_id = ? WHERE id = ?").run(session.id, bookingId);
    res.status(201).json({ redirectUrl: session.url });
  } catch (err) {
    console.error(err.message);
    db.prepare("UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ?").run(bookingId);
    res.status(502).json({ error: "Couldn't start the payment. Please try again." });
  }
});

// ---- A client's own booking, addressed by its unguessable token -----------

function serializeForClient(b) {
  const a = db.prepare("SELECT * FROM artists WHERE id = ?").get(b.artist_id);
  const cancellable = ["pending_payment", "confirmed"].includes(b.status) && Date.parse(b.starts_at) > Date.now();
  return {
    status: b.status,
    serviceName: b.service_name,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    when: formatWhen(b.starts_at, a.timezone),
    clientName: b.client_name,
    depositCents: b.deposit_cents,
    currency: b.currency,
    depositPaid: !!b.deposit_paid,
    refunded: !!b.refunded,
    cancelledBy: b.cancelled_by,
    cancellable,
    refundOnCancel: cancellable && b.deposit_paid ? bookings.clientRefundEligible(b, a) : false,
    googleCalendarUrl: bookings.googleCalendarLink(b, a),
    demoPayments: !stripe.enabled(),
    artist: {
      handle: a.handle, displayName: a.display_name, location: a.location,
      policy: a.policy, cancelWindowHours: a.cancel_window_hours,
    },
  };
}

router.get("/api/public/bookings/:token", (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking: serializeForClient(b) });
});

router.post("/api/public/bookings/:token/cancel", async (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  const a = db.prepare("SELECT * FROM artists WHERE id = ?").get(b.artist_id);
  const updated = await bookings.cancelBooking(b, { by: "client", refund: bookings.clientRefundEligible(b, a) });
  res.json({ booking: serializeForClient(updated) });
});

// Client backed out of Stripe Checkout: free the slot straight away rather
// than holding it for the full 35 minutes.
router.post("/api/public/bookings/:token/abandon", async (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  if (b.status === "pending_payment") {
    db.prepare("UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ?").run(b.id);
    if (b.stripe_checkout_session_id && stripe.enabled()) {
      await stripe.call("POST", `/checkout/sessions/${b.stripe_checkout_session_id}/expire`).catch(() => {});
    }
  }
  res.json({ booking: serializeForClient(bookingByToken(req.params.token)) });
});

// Demo mode stand-in for Stripe Checkout. Only exists without Stripe keys.
router.post("/api/public/bookings/:token/demo-pay", async (req, res) => {
  if (stripe.enabled()) return res.status(404).json({ error: "Not found." });
  const b = bookingByToken(req.params.token);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  if (b.status !== "pending_payment") return res.status(409).json({ error: "This booking isn't waiting on payment." });
  await bookings.confirmPaidBooking(b.id, { paymentIntentId: null });
  res.json({ booking: serializeForClient(bookingByToken(req.params.token)) });
});

router.get("/api/public/bookings/:token/ics", (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b || b.status !== "confirmed") return res.status(404).send("Not found");
  const a = db.prepare("SELECT * FROM artists WHERE id = ?").get(b.artist_id);
  const fmt = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s) => String(s).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Slotlock//EN", "BEGIN:VEVENT",
    `UID:${b.public_token}@slotlock`, `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(b.starts_at)}`, `DTEND:${fmt(b.ends_at)}`,
    `SUMMARY:${esc(`${b.service_name} with ${a.display_name}`)}`,
    `LOCATION:${esc(a.location)}`,
    `DESCRIPTION:${esc(`Manage your booking: ${bookings.bookingLink(b)}`)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
  res.type("text/calendar").attachment("appointment.ics").send(ics);
});

module.exports = { router, artistByHandle };
