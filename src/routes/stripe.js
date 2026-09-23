const express = require("express");
const { db } = require("../db");
const stripe = require("../lib/stripe");
const { requireAuth } = require("../lib/auth");
const { confirmPaidBooking } = require("../lib/bookings");
const { baseUrl } = require("../lib/util");

const router = express.Router();
const webhookRouter = express.Router();

// ---- Stripe Connect: artists receive deposits into their own account -------

async function onboardingLink(artist) {
  let accountId = artist.stripe_account_id;
  if (!accountId) {
    const account = await stripe.call("POST", "/accounts", {
      type: "express",
      email: artist.email,
      business_profile: { url: `${baseUrl()}/${artist.handle}`, name: artist.display_name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { artist_id: String(artist.id) },
    });
    accountId = account.id;
    db.prepare("UPDATE artists SET stripe_account_id = ? WHERE id = ?").run(accountId, artist.id);
  }
  const link = await stripe.call("POST", "/account_links", {
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${baseUrl()}/api/stripe/connect/refresh`,
    return_url: `${baseUrl()}/api/stripe/connect/return`,
  });
  return link.url;
}

async function refreshAccountStatus(artist) {
  if (!artist.stripe_account_id) return;
  const account = await stripe.call("GET", `/accounts/${artist.stripe_account_id}`);
  db.prepare("UPDATE artists SET stripe_charges_enabled = ? WHERE id = ?")
    .run(account.charges_enabled ? 1 : 0, artist.id);
}

router.post("/api/stripe/connect", requireAuth, async (req, res) => {
  if (!stripe.enabled()) return res.status(400).json({ error: "Demo mode: deposits are simulated, nothing to connect." });
  res.json({ url: await onboardingLink(req.artist) });
});

// Stripe sends the artist back here in the browser, so these redirect.
router.get("/api/stripe/connect/refresh", requireAuth, async (req, res) => {
  res.redirect(await onboardingLink(req.artist));
});

router.get("/api/stripe/connect/return", requireAuth, async (req, res) => {
  await refreshAccountStatus(req.artist).catch((err) => console.error(err.message));
  res.redirect("/app#setup");
});

router.post("/api/stripe/connect/sync", requireAuth, async (req, res) => {
  if (stripe.enabled()) await refreshAccountStatus(req.artist);
  res.json({ ok: true });
});

// ---- Billing: the artist's own subscription to Slotlock ---------------------

router.post("/api/billing/checkout", requireAuth, async (req, res) => {
  const a = req.artist;
  if (!stripe.enabled()) {
    db.prepare("UPDATE artists SET subscription_status = 'active' WHERE id = ?").run(a.id);
    return res.json({ url: "/app?billing=success#billing" });
  }
  if (!process.env.STRIPE_PRICE_ID) return res.status(500).json({ error: "STRIPE_PRICE_ID is not configured." });

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
  if (!stripe.enabled() || !req.artist.stripe_customer_id) {
    return res.status(400).json({ error: "No billing account yet." });
  }
  const session = await stripe.call("POST", "/billing_portal/sessions", {
    customer: req.artist.stripe_customer_id,
    return_url: `${baseUrl()}/app#billing`,
  });
  res.json({ url: session.url });
});

// ---- Webhook ---------------------------------------------------------------

async function handleEvent(event) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      if (obj.metadata?.kind === "deposit" && obj.payment_status === "paid") {
        await confirmPaidBooking(Number(obj.metadata.booking_id), { paymentIntentId: obj.payment_intent });
      } else if (obj.metadata?.kind === "subscription") {
        let status = "active";
        try { status = (await stripe.call("GET", `/subscriptions/${obj.subscription}`)).status; } catch {}
        db.prepare(`UPDATE artists SET stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?
          WHERE id = ?`).run(obj.customer, obj.subscription, status, Number(obj.metadata.artist_id));
      }
      break;
    }
    case "checkout.session.expired": {
      if (obj.metadata?.kind === "deposit") {
        db.prepare(`UPDATE bookings SET status = 'expired', hold_expires_at = NULL
          WHERE id = ? AND status = 'pending_payment'`).run(Number(obj.metadata.booking_id));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const artistId = Number(obj.metadata?.artist_id) || 0;
      db.prepare(`UPDATE artists SET subscription_status = ?, stripe_subscription_id = ?, stripe_customer_id = ?
        WHERE stripe_subscription_id = ? OR (id = ? AND stripe_subscription_id IS NULL)`).run(obj.status, obj.id, obj.customer, obj.id, artistId);
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
