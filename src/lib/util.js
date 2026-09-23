const stripe = require("./stripe");
const { parseMethods } = require("./payments");

// Deposits are paid artist-to-client outside Slotlock, so currency is display
// only and any of these work.
const CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "nzd", "inr", "aed", "sgd", "myr", "php", "idr",
  "thb", "hkd", "jpy", "krw", "zar", "ngn", "brl", "mxn", "chf", "sek", "nok", "dkk", "pln", "czk",
  "try", "ils", "sar", "qar", "lkr", "pkr", "bdt"];

// Booking page accent colours an artist can pick from.
const THEMES = {
  vermilion: "#ff5c39",
  rose: "#ff4d8d",
  violet: "#a07cff",
  ocean: "#3ba4ff",
  jade: "#2fcf8f",
  gold: "#f4b940",
  bone: "#efe6d6",
};

// The site's public address, for links in emails, the calendar feed and the
// artist's "your booking link" box. BASE_URL wins. On Railway, the domain it
// generated (RAILWAY_PUBLIC_DOMAIN) works with no setup. Otherwise localhost,
// which is only right for local development.
function baseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.trim().replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}`;
  return `http://localhost:${process.env.PORT || 3002}`;
}

function money(cents, currency) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

// Artist subscriptions only switch on once Stripe billing is configured.
// Until then every artist is on free early access.
const billingEnabled = () => stripe.enabled() && !!process.env.STRIPE_PRICE_ID;

// While billing is on, an artist can take bookings in the free trial or with
// a live subscription. past_due still counts: Stripe is retrying the card,
// and switching off a booking page over one failed charge loses the artist.
// "comped" is for artists the owner has given free access.
function billingState(artist, now = Date.now()) {
  if (!billingEnabled()) {
    return { enabled: false, active: true, subscribed: false, status: null, trialDaysLeft: 0 };
  }
  const subscribed = ["active", "trialing", "past_due", "comped"].includes(artist.subscription_status);
  const trialLeft = Date.parse(artist.trial_ends_at) - now;
  return {
    enabled: true,
    subscribed,
    status: artist.subscription_status || null,
    trialDaysLeft: Math.max(0, Math.ceil(trialLeft / 86400000)),
    active: subscribed || trialLeft > 0,
  };
}

// A deposit can only be asked for if the client has some way to pay it.
const depositsReady = (artist) => parseMethods(artist.payment_methods).length > 0 || !!String(artist.payment_note || "").trim();

// Simple fixed-window limiter, in memory. Fine for one instance.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    if (++entry.count > max) {
      return res.status(429).json({ error: "Too many requests. Try again in a few minutes." });
    }
    if (hits.size > 5000) for (const [k, e] of hits) if (e.reset < now) hits.delete(k);
    next();
  };
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const isHttpUrl = (s) => {
  try { return ["http:", "https:"].includes(new URL(s).protocol); } catch { return false; }
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const httpError = (status, message) => Object.assign(new Error(message), { status });

module.exports = {
  CURRENCIES, THEMES, baseUrl, money, billingEnabled, billingState, depositsReady, rateLimit,
  str, isEmail, isHttpUrl, escapeHtml, httpError,
};
