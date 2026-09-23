const express = require("express");
const { db } = require("../db");
const stripe = require("../lib/stripe");
const { requireAuth } = require("../lib/auth");
const { baseUrl, billingEnabled } = require("../lib/util");

// The artist's own subscription to Slotlock. Dormant — every artist is on
// free early access — until STRIPE_SECRET_KEY and STRIPE_PRICE_ID are set.
// Clients' deposits never come through here; they go straight to the artist.

const router = express.Router();
const webhookRouter = express.Router();

router.post("/api/billing/checkout", requireAuth, async (req, res) => {
  if (!billingEnabled()) return res.status(400).json({ error: "Slotlock is free during early access. Nothing to pay!" });
  const a = req.artist;

  // Carry any unused trial over so subscribing early doesn't cost trial days.
  // Checkout requires trial_end to be at least 48 hours out.
  const trialEnd = Math.floor(Date.parse(a.trial_ends_at) / 1000);
  const subscriptionData = { metadata: { artist_id: String(a.id) } };
  if (trialEnd > Date.now() / 1000 + 49 * 3600) subscriptionData.trial_end = trialEnd;

  const session = await stripe.call("POST", "/checkout/sessions", {
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: String(a.id),
    ...(a.stripe_customer_id ? { customer: a.stripe_customer_id } : { customer_email: a.email }),
    subscription_data: subscriptionData,
    metadata: { kind: "subscription", artist_id: String(a.id) },
    success_url: `${baseUrl()}/app?billing=success#billing`,
    cancel_url: `${baseUrl()}/app#billing`,
  });
  res.json({ url: session.url });
});

router.post("/api/billing/portal", requireAuth, async (req, res) => {
  if (!billingEnabled() || !req.artist.stripe_customer_id) {
    return res.status(400).json({ error: "No billing account yet." });
  }
  const session = await stripe.call("POST", "/billing_portal/sessions", {
    customer: req.artist.stripe_customer_id,
    return_url: `${baseUrl()}/app#billing`,
  });
  res.json({ url: session.url });
});

async function handleEvent(event) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      if (obj.metadata?.kind !== "subscription") break;
      let status = "active";
      try { status = (await stripe.call("GET", `/subscriptions/${obj.subscription}`)).status; } catch {}
      db.prepare(`UPDATE artists SET stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?
        WHERE id = ?`).run(obj.customer, obj.subscription, status, Number(obj.metadata.artist_id));
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const artistId = Number(obj.metadata?.artist_id) || 0;
      db.prepare(`UPDATE artists SET subscription_status = ?, stripe_subscription_id = ?, stripe_customer_id = ?
        WHERE stripe_subscription_id = ? OR (id = ? AND stripe_subscription_id IS NULL)`)
        .run(obj.status, obj.id, obj.customer, obj.id, artistId);
      break;
    }
  }
}

// Registered before express.json() in server.js: signature checks need the
// exact raw bytes Stripe sent.
webhookRouter.post("/webhooks/stripe", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  let event;
  try {
    event = stripe.verifyWebhook(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  await handleEvent(event);
  res.json({ received: true });
});

module.exports = { router, webhookRouter, handleEvent };
