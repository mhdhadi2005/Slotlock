const stripe = require("./stripe");

const CURRENCIES = ["usd", "cad", "gbp", "eur", "aud", "nzd"];

const baseUrl = () => (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`).replace(/\/$/, "");

function money(cents, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() })
    .format(cents / 100);
}

// An artist can take bookings while in the free trial or with a live
// subscription. past_due still counts: Stripe is retrying the card, and
// switching off someone's booking page over one failed charge loses them.
function billingState(artist, now = Date.now()) {
  const subscribed = ["active", "trialing", "past_due"].includes(artist.subscription_status);
  const trialLeft = Date.parse(artist.trial_ends_at) - now;
  return {
    subscribed,
    status: artist.subscription_status || null,
    trialDaysLeft: Math.max(0, Math.ceil(trialLeft / 86400000)),
    active: subscribed || trialLeft > 0,
  };
}

// Deposits need a connected Stripe account — except in demo mode.
const depositsReady = (artist) => !stripe.enabled() || !!artist.stripe_charges_enabled;

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

module.exports = {
  CURRENCIES, baseUrl, money, billingState, depositsReady, rateLimit, str, isEmail, isHttpUrl,
};
