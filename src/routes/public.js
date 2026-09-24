const express = require("express");
const { db } = require("../db");
const { randomToken } = require("../lib/ids");
const { slotsForService } = require("../lib/slots");
const { localDateStr, isDateStr, formatWhen } = require("../lib/time");
const { calendar } = require("../lib/ics");
const { parseMethods, methodsForBooking, TYPES } = require("../lib/payments");
const bookings = require("../lib/bookings");
const requests = require("../lib/requests");
const { consentForm, aftercareText, ageOn } = require("../lib/forms");
const { decodeImage } = require("../lib/images");
const { parseAddons, pickAddons } = require("../lib/addons");
const { businessOf } = require("../lib/business");
const {
  THEMES, billingState, depositsReady, rateLimit, str, isEmail, isHttpUrl,
} = require("../lib/util");
const { imageUrl } = require("./auth");

const router = express.Router();
const bookingLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
const actionLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });
const requestLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10 });
const waitlistLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

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
    booksOpen: !!a.books_open,
    booksClosedMessage: a.books_closed_message,
    look: a.look,
    businessType: a.business_type,
  };
}

// Everything the booking page header shows.
function artistPage(a) {
  return {
    ...publicArtist(a),
    portfolio: portfolioOf(a.id),
    paymentMethods: [...new Set(parseMethods(a.payment_methods).map((m) => TYPES[m.type].label))],
    acceptingBookings: billingState(a).active,
    // Wording for the booking page, fitted to the kind of business.
    words: (({ label, pro, work, notesPlaceholder, idea }) => ({ label, pro, work, notesPlaceholder, idea }))(businessOf(a)),
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
      priceCents: s.price_cents, depositCents: s.deposit_cents, mode: s.mode,
      addons: parseAddons(s.addons), patchTestHours: s.patch_test_hours,
      // A consultation needs no deposit details until the artist quotes.
      bookable: s.mode === "consult" || s.deposit_cents === 0 || ready,
    }));
  res.json({
    artist: artistPage(a),
    services,
  });
});

router.get("/api/public/artists/:handle/availability", (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  const service = activeService(a.id, req.query.service);
  if (!service) return res.status(404).json({ error: "Service not found." });
  // Chosen add-ons make the appointment longer, so fewer times may fit.
  const extra = pickAddons(service, req.query.addons ? String(req.query.addons).split(",") : []).minutes;
  const today = localDateStr(Date.now(), a.timezone);
  const from = isDateStr(req.query.from) && req.query.from > today ? req.query.from : today;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 31);
  res.json({ timezone: a.timezone, today, days: slotsForService(a, { ...service, duration_min: service.duration_min + extra }, from, days) });
});

router.post("/api/public/artists/:handle/bookings", bookingLimiter, async (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  if (!billingState(a).active) return res.status(403).json({ error: `${a.display_name} isn't taking online bookings right now.` });
  if (!a.books_open) return res.status(403).json({ error: `${a.display_name}'s books are closed right now.` });
  const service = activeService(a.id, req.body.serviceId);
  if (!service) return res.status(404).json({ error: "That service isn't available." });
  if (service.mode === "consult") return res.status(400).json({ error: "This service starts with a consultation request." });
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
  if (service.patch_test_hours > 0 && req.body.patchTestOk !== true) {
    return res.status(400).json({ error: "Please confirm the patch test." });
  }
  const extras = pickAddons(service, req.body.addons);

  const booking = await bookings.createBooking(a, {
    serviceId: service.id, serviceName: service.name, durationMin: service.duration_min + extras.minutes, depositCents: service.deposit_cents,
    startIso: req.body.start, client: { name, email, phone, instagram }, notes, referenceUrl,
    patchTestHours: service.patch_test_hours, addons: extras.chosen, addonsCents: extras.cents,
  });
  res.status(201).json({ redirectUrl: `/booking/${booking.public_token}` });
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
    addons: parseAddons(b.addons),
    addonsCents: b.addons_cents,
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
    consent: consentForClient(b, a),
    aftercare: a.aftercare_enabled && b.status === "confirmed" && Date.parse(b.ends_at) <= Date.now()
      ? { text: aftercareText(a), reviewUrl: a.review_url } : null,
    artist: publicArtist(a),
  };
}

function consentForClient(b, a) {
  const signed = db.prepare("SELECT signed_at, legal_name FROM consents WHERE booking_id = ?").get(b.id);
  if (signed) return { required: true, signed: true, signedAt: signed.signed_at, legalName: signed.legal_name };
  if (!a.consent_enabled || !["awaiting_deposit", "confirmed"].includes(b.status) || Date.parse(b.ends_at) <= Date.now()) return null;
  return { required: true, signed: false, form: consentForm(a) };
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

// The client signs the artist's consent form. The wording they saw is saved
// with the signature, so the record stays accurate if the form changes later.
router.post("/api/public/bookings/:token/consent", actionLimiter, (req, res) => {
  const b = bookingByToken(req.params.token);
  if (!b) return res.status(404).json({ error: "Booking not found." });
  const a = db.prepare("SELECT * FROM artists WHERE id = ?").get(b.artist_id);
  const current = consentForClient(b, a);
  if (!current) return res.status(409).json({ error: "There's no consent form to sign for this booking." });
  if (current.signed) return res.status(409).json({ error: "You've already signed the consent form." });

  const legalName = str(req.body.legalName, 120);
  const dob = str(req.body.dateOfBirth, 10);
  const medical = str(req.body.medicalNotes, 2000);
  if (legalName.length < 2) return res.status(400).json({ error: "Enter your full legal name." });
  if (!isDateStr(dob) || dob < "1900-01-01") return res.status(400).json({ error: "Enter your date of birth." });
  if (ageOn(dob, b.starts_at) < 18) return res.status(400).json({ error: "You need to be 18 or over on the day of your appointment." });
  if (req.body.agreed !== true) return res.status(400).json({ error: "Please tick every statement to sign." });
  const sig = decodeImage(req.body.signature, { maxBytes: 400 * 1024, only: ["image/png"] });

  const { intro, statements } = current.form;
  const formText = `${intro}\n\n${statements.map((st) => `[x] ${st}`).join("\n")}`;
  db.prepare(`INSERT INTO consents (booking_id, legal_name, date_of_birth, medical_notes, form_text, signature_mime, signature, signed_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(b.id, legalName, dob, medical, formText, sig.mime, sig.buf,
    new Date().toISOString(), String(req.ip || "").slice(0, 64), str(req.get("user-agent"), 300));
  res.status(201).json({ booking: serializeForClient(b) });
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

// ---- Consultation requests -------------------------------------------------

const requestByToken = (t) => db.prepare("SELECT * FROM requests WHERE public_token = ?").get(String(t));
const artistOfRequest = (r) => db.prepare("SELECT * FROM artists WHERE id = ?").get(r.artist_id);

router.post("/api/public/artists/:handle/requests", requestLimiter, async (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  if (!billingState(a).active) return res.status(403).json({ error: `${a.display_name} isn't taking online bookings right now.` });
  if (!a.books_open) return res.status(403).json({ error: `${a.display_name}'s books are closed right now.` });
  const service = activeService(a.id, req.body.serviceId);
  if (!service || service.mode !== "consult") return res.status(404).json({ error: "That service isn't available." });

  const fields = {
    name: str(req.body.name, 100), email: str(req.body.email, 254).toLowerCase(), phone: str(req.body.phone, 40),
    instagram: str(req.body.instagram, 60).replace(/^@/, ""), idea: str(req.body.idea, 3000),
    placement: str(req.body.placement, 120), size: str(req.body.size, 120),
    style: requests.STYLES[req.body.style] ? req.body.style : "", photos: req.body.photos,
  };
  if (!fields.name) return res.status(400).json({ error: "Enter your name." });
  if (!isEmail(fields.email)) return res.status(400).json({ error: "Enter a valid email." });
  if (fields.idea.length < 10) return res.status(400).json({ error: "Tell the artist a bit more about your idea." });
  if (Array.isArray(fields.photos) && fields.photos.length > requests.MAX_PHOTOS) {
    return res.status(400).json({ error: `Up to ${requests.MAX_PHOTOS} reference photos.` });
  }
  const r = await requests.createRequest(a, service, fields);
  res.status(201).json({ redirectUrl: `/request/${r.public_token}` });
});

router.get("/api/public/requests/:token", (req, res) => {
  const r = requestByToken(req.params.token);
  if (!r) return res.status(404).json({ error: "Request not found." });
  const a = artistOfRequest(r);
  res.json({ request: requests.serializeForClient(r, artistPage(a)) });
});

// Openings that fit the quoted session length.
router.get("/api/public/requests/:token/availability", (req, res) => {
  const r = requestByToken(req.params.token);
  if (!r) return res.status(404).json({ error: "Request not found." });
  if (!requests.canBook(r)) return res.status(409).json({ error: "This request can't be booked right now." });
  const a = artistOfRequest(r);
  const today = localDateStr(Date.now(), a.timezone);
  const from = isDateStr(req.query.from) && req.query.from > today ? req.query.from : today;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 31);
  res.json({ timezone: a.timezone, today, days: slotsForService(a, { duration_min: r.quote_duration_min }, from, days) });
});

router.post("/api/public/requests/:token/book", bookingLimiter, async (req, res) => {
  const r = requestByToken(req.params.token);
  if (!r) return res.status(404).json({ error: "Request not found." });
  const a = artistOfRequest(r);
  if (a.policy && req.body.agreedToPolicy !== true) return res.status(400).json({ error: "Please agree to the booking policy." });
  const b = await requests.bookRequest(r, req.body.start);
  res.status(201).json({ redirectUrl: `/booking/${b.public_token}` });
});

router.post("/api/public/requests/:token/withdraw", actionLimiter, (req, res) => {
  const r = requestByToken(req.params.token);
  if (!r) return res.status(404).json({ error: "Request not found." });
  const updated = requests.withdrawRequest(r);
  const a = artistOfRequest(updated);
  res.json({ request: requests.serializeForClient(updated, artistPage(a)) });
});

// Reference photos, by unguessable key only.
router.get("/rp/:key", (req, res, next) => {
  const p = db.prepare("SELECT mime, data FROM request_photos WHERE key = ?").get(String(req.params.key));
  if (!p) return next();
  res.set({
    "Content-Type": p.mime,
    "Cache-Control": "private, max-age=86400",
    "Content-Security-Policy": "default-src 'none'",
    "X-Robots-Tag": "noindex",
  });
  res.send(Buffer.from(p.data));
});

// ---- Waitlist ----------------------------------------------------------------

router.post("/api/public/artists/:handle/waitlist", waitlistLimiter, (req, res) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return res.status(404).json({ error: "Not found." });
  const email = str(req.body.email, 254).toLowerCase();
  const name = str(req.body.name, 100);
  if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (db.prepare("SELECT COUNT(*) AS n FROM waitlist WHERE artist_id = ?").get(a.id).n >= 5000) {
    return res.status(400).json({ error: "The waitlist is full right now." });
  }
  // Same answer whether or not they were already on it.
  db.prepare(`INSERT INTO waitlist (artist_id, email, name, token, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (artist_id, email) DO UPDATE SET name = CASE WHEN excluded.name != '' THEN excluded.name ELSE waitlist.name END`)
    .run(a.id, email, name, randomToken(18), new Date().toISOString());
  res.status(201).json({ ok: true });
});

const waitlistByToken = (t) => db.prepare(`SELECT w.*, a.display_name FROM waitlist w JOIN artists a ON a.id = w.artist_id
  WHERE w.token = ?`).get(String(t));

router.get("/api/public/waitlist/:token", (req, res) => {
  const w = waitlistByToken(req.params.token);
  if (!w) return res.status(404).json({ error: "You're not on this waitlist (any more)." });
  res.json({ artistName: w.display_name, email: w.email });
});

router.post("/api/public/waitlist/:token/leave", actionLimiter, (req, res) => {
  const w = waitlistByToken(req.params.token);
  if (w) db.prepare("DELETE FROM waitlist WHERE id = ?").run(w.id);
  res.json({ ok: true });
});

module.exports = { router, artistByHandle, portfolioOf };
