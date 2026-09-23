const express = require("express");
const { db } = require("../db");
const auth = require("../lib/auth");
const stripe = require("../lib/stripe");
const { isValidTimezone } = require("../lib/time");
const { billingState, depositsReady, baseUrl, rateLimit, str, isEmail } = require("../lib/util");

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

// Handles live at the site root (slotlock.com/sarahink), so anything that is or
// could become a real route is off limits.
const RESERVED = new Set([
  "api", "app", "admin", "login", "logout", "signup", "register", "booking", "bookings",
  "book", "demo-pay", "webhooks", "health", "static", "assets", "public", "pricing",
  "about", "terms", "privacy", "help", "support", "blog", "settings", "dashboard",
  "slotlock", "www", "mail", "stripe", "billing",
]);

function validHandle(h) {
  return /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(h) && !RESERVED.has(h);
}

function serializeArtist(a) {
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
    slotStepMin: a.slot_step_min,
    minNoticeHours: a.min_notice_hours,
    maxDaysAhead: a.max_days_ahead,
    cancelWindowHours: a.cancel_window_hours,
    bookingUrl: `${baseUrl()}/${a.handle}`,
    stripe: {
      mode: stripe.enabled() ? "live" : "demo",
      connected: !!a.stripe_account_id,
      chargesEnabled: !!a.stripe_charges_enabled,
      depositsReady: depositsReady(a),
    },
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
    return res.status(409).json({ error: "An account with that email already exists." });
  }
  if (db.prepare("SELECT 1 FROM artists WHERE handle = ?").get(handle)) {
    return res.status(409).json({ error: "That link name is taken." });
  }

  const now = new Date();
  const trialDays = Number(process.env.TRIAL_DAYS || 14);
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO artists (email, password_hash, handle, display_name, timezone, trial_ends_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(email, auth.hashPassword(password), handle, displayName, timezone,
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
  if (!artist || !auth.verifyPassword(password, artist.password_hash)) {
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

router.get("/api/me", auth.requireAuth, (req, res) => {
  res.json({ artist: serializeArtist(req.artist) });
});

module.exports = { router, serializeArtist, validHandle };
