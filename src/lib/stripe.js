const crypto = require("crypto");

// Minimal Stripe client over fetch — the handful of endpoints Slotlock uses
// doesn't justify the SDK. With no STRIPE_SECRET_KEY the app runs in demo
// mode and none of these are called.

const API = "https://api.stripe.com/v1";

const enabled = () => !!process.env.STRIPE_SECRET_KEY;

// Stripe wants form encoding with bracketed keys: a[b][0][c]=1
function encodeForm(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encodeForm(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(method, path, params) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? encodeForm(params).toString() : undefined,
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(`Stripe ${method} ${path}: ${body.error?.message || res.status}`);
    err.stripe = body.error;
    throw err;
  }
  return body;
}

// Verifies the Stripe-Signature header against the raw request body.
// https://docs.stripe.com/webhooks#verify-manually
function verifyWebhook(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  const parts = {};
  for (const item of String(header || "").split(",")) {
    const [k, v] = item.split("=");
    if (!k || !v) continue;
    (parts[k] ||= []).push(v);
  }
  const t = Number(parts.t?.[0]);
  if (!t || !parts.v1) throw new Error("Malformed Stripe-Signature header");
  if (Math.abs(now / 1000 - t) > toleranceSec) throw new Error("Stripe webhook timestamp too old");

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const ok = parts.v1.some((sig) => {
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error("Stripe webhook signature mismatch");
  return JSON.parse(rawBody.toString("utf8"));
}

module.exports = { enabled, call, verifyWebhook, encodeForm };
