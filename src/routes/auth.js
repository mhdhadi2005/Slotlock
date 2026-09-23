const express = require("express");
const { db } = require("../db");
const auth = require("../lib/auth");
const { randomToken } = require("../lib/ids");
const { sendEmail, emailEnabled } = require("../lib/email");
const { parseMethods } = require("../lib/payments");
const { isValidTimezone } = require("../lib/time");
const { billingState, depositsReady, baseUrl, rateLimit, str, isEmail } = require("../lib/util");

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

// Handles live at the site root (slotlock.com/sarahink), so anything that is
// or could become a real route is off limits.
const RESERVED = new Set([
  "api", "app", "admin", "login", "logout", "signup", "register", "forgot", "reset", "booking",
  "bookings", "book", "demo", "webhooks", "health", "static", "assets", "public", "fonts", "img",
  "cal", "pricing", "about", "terms", "privacy", "help", "support", "blog", "settings",
  "dashboard", "slotlock", "www", "mail", "stripe", "billing", "favicon", "og",
]);

function validHandle(h) {
  return /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(h) && !RESERVED.has(h);
}

const imageUrl = (id) => (id ? `/img/${id}` : null);

function serializeArtist(a) {
  const portfolio = db.prepare("SELECT id FROM images WHERE artist_id = ? AND kind = 'portfolio' ORDER BY sort_order, id")
    .all(a.id).map((r) => ({ id: r.id, url: imageUrl(r.id) }));
  return {
    id: a.id,
    email: a.email,
    handle: a.handle,
    displayName: a.display_name,
    bio: a.bio,
    location: a.location,
    instagram: a.instagram,
    timezone: a.timezone,
    currency: a.currency,
    policy: a.policy,
    theme: a.theme,
    slotStepMin: a.slot_step_min,
    minNoticeHours: a.min_notice_hours,
    maxDaysAhead: a.max_days_ahead,
    cancelWindowHours: a.cancel_window_hours,
    holdHours: a.hold_hours,
    paymentMethods: parseMethods(a.payment_methods),
    paymentNote: a.payment_note,
    depositsReady: depositsReady(a),
    avatarUrl: imageUrl(a.avatar_image_id),
    portfolio,
    bookingUrl: `${baseUrl()}/${a.handle}`,
    calendarUrl: `${baseUrl()}/cal/${a.calendar_token}.ics`,
    emailEnabled: emailEnabled(),
    billing: billingState(a),
  };
}

router.post("/api/auth/signup", limiter, (req, res) => {
  const email = str(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const handle = str(req.body.handle, 30).toLowerCase();
  const displayName = str(req.body.displayName, 80);
  const timezone = str(req.body.timezone, 64);

  if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!displayName) return res.status(400).json({ error: "Enter your name or studio name." });
  if (!validHandle(handle)) {
    return res.status(400).json({ error: "Link name must be 3–30 lowercase letters, numbers or dashes." });
  }
  if (!isValidTimezone(timezone)) return res.status(400).json({ error: "Pick a valid timezone." });

  if (db.prepare("SELECT 1 FROM artists WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "An account with that email already exists. Try logging in." });
  }
  if (db.prepare("SELECT 1 FROM artists WHERE handle = ?").get(handle)) {
    return res.status(409).json({ error: "That link name is taken. Try another." });
  }

  const now = new Date();
  const trialDays = Number(process.env.TRIAL_DAYS || 14);
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO artists (email, password_hash, handle, display_name, timezone, calendar_token, trial_ends_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(email, auth.hashPassword(password), handle, displayName, timezone, randomToken(24),
    new Date(now.getTime() + trialDays * 86400000).toISOString(), now.toISOString());

  // Sensible starting hours (Tue–Sat, 11am–7pm) so the page works immediately.
  const addHours = db.prepare("INSERT INTO availability (artist_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)");
  for (const wd of [2, 3, 4, 5, 6]) addHours.run(lastInsertRowid, wd, 11 * 60, 19 * 60);

  auth.setSessionCookie(res, auth.createSession(lastInsertRowid));
  const artist = db.prepare("SELECT * FROM artists WHERE id = ?").get(lastInsertRowid);
  res.status(201).json({ artist: serializeArtist(artist) });
});

router.post("/api/auth/login", limiter, (req, res) => {
  const email = str(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const artist = db.prepare("SELECT * FROM artists WHERE email = ?").get(email);
  if (!artist || artist.is_demo || !auth.verifyPassword(password, artist.password_hash)) {
    return res.status(401).json({ error: "Wrong email or password." });
  }
  auth.setSessionCookie(res, auth.createSession(artist.id));
  res.json({ artist: serializeArtist(artist) });
});

router.post("/api/auth/logout", (req, res) => {
  auth.destroySession(req.sessionToken);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Always answers the same way, so it can't be used to find out who has an
// account. Without email configured the link goes to the server log, where
// the site owner can find it and pass it on.
router.post("/api/auth/forgot", limiter, async (req, res) => {
  const email = str(req.body.email, 254).toLowerCase();
  const artist = isEmail(email) && db.prepare("SELECT * FROM artists WHERE email = ? AND is_demo = 0").get(email);
  if (artist) {
    const token = randomToken();
    db.prepare("INSERT INTO password_resets (token_hash, artist_id, expires_at) VALUES (?, ?, ?)")
      .run(auth.sha256(token), artist.id, new Date(Date.now() + 3600000).toISOString());
    const link = `${baseUrl()}/reset/${token}`;
    if (!emailEnabled() && process.env.NODE_ENV !== "test") console.log(`[password reset] ${artist.email}: ${link}`);
    await sendEmail({
      to: artist.email,
      subject: "Reset your Slotlock password",
      text: `Someone (hopefully you) asked to reset your Slotlock password.\n\n` +
        `Choose a new one here within the next hour:\n${link}\n\nIf this wasn't you, ignore this email.\n`,
    });
  }
  res.json({ ok: true });
});

router.post("/api/auth/reset", limiter, (req, res) => {
  const token = str(req.body.token, 200);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  const row = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .get(auth.sha256(token), new Date().toISOString());
  if (!row) return res.status(400).json({ error: "This reset link has expired or was already used. Request a new one." });

  db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").run(new Date().toISOString(), row.token_hash);
  db.prepare("UPDATE artists SET password_hash = ? WHERE id = ?").run(auth.hashPassword(password), row.artist_id);
  db.prepare("DELETE FROM sessions WHERE artist_id = ?").run(row.artist_id);
  auth.setSessionCookie(res, auth.createSession(row.artist_id));
  res.json({ ok: true });
});

router.get("/api/me", auth.requireAuth, (req, res) => {
  res.json({ artist: serializeArtist(req.artist) });
});

module.exports = { router, serializeArtist, validHandle, imageUrl };
