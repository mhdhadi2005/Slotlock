# Slotlock

*Lock the slot. Take the deposit. End no-shows.*

Booking pages with deposits for tattoo artists (and barbers, nail and lash
techs: anyone who books by appointment and gets burned by no-shows).

An artist signs up, adds services (length, price, deposit), sets their hours,
lists how they get paid (PayPal, Venmo, Cash App, Zelle, Revolut, Monzo, UPI,
bank transfer or any payment link), and puts `yourdomain.com/theirname` in their
Instagram bio.

A client picks a service and an open time, then gets the artist's payment
details with the exact amount and a reference code. They pay the artist
directly and tap **"I've sent the deposit"**. The artist checks the money
arrived and taps **confirm**. Unpaid requests release their slot on their own,
and cancellations follow the artist's refund cutoff.

**Slotlock never touches client money.** No payment processor, no Stripe
account needed for artists, works in any country and currency.

**Business model:** $19/month per artist. Free "early access" until you switch
billing on (see below). 53 paying artists ≈ $1,000/month. See `LAUNCH.md`.

## Run it locally

```bash
npm install
npm start         # http://localhost:3002  (the /demo example page is built on boot)
npm test
```

Everything works with no keys at all. Without `RESEND_API_KEY`, emails are
printed to the console instead of sent.

## What's in it

| Area | Where |
| --- | --- |
| Signup, login, password reset (scrypt, cookie sessions) | `src/routes/auth.js`, `src/lib/auth.js` |
| Dashboard API: profile, services, hours, deposits, bookings, refunds | `src/routes/artist.js` |
| Public booking page, holds, deposit reporting, cancellations, .ics | `src/routes/public.js`, `src/lib/bookings.js` |
| Payment methods and tap-to-pay links | `src/lib/payments.js` |
| Slot engine (timezones + DST without a date library) | `src/lib/time.js`, `src/lib/slots.js` |
| Profile photos and portfolio (resized in the browser, stored in SQLite) | `src/routes/images.js` |
| Private calendar feed for Google / Apple Calendar | `src/routes/calendar.js`, `src/lib/ics.js` |
| Emails (Resend), hold expiry, day-before reminders | `src/lib/email.js`, `src/jobs/scheduler.js` |
| Consultation requests: idea + reference photos → quote → booking | `src/lib/requests.js`, `public/book.js` (`/request/:token`) |
| Books open/closed, waitlist and the "books are open" email | `src/routes/artist.js`, `src/routes/public.js`, `public/leave.js` |
| Consent forms (signed on the client's phone) and aftercare emails | `src/lib/forms.js`, `public/booking.js`, `src/jobs/scheduler.js` |
| Business types (tattoo, nails, lashes & brows, hair, barber): wording, templates, starter services | `src/lib/business.js` |
| Looks: Ink (dark), Blush and Latte (light), set by `data-look` on `<html>` | `public/style.css`, `src/server.js` (`withLook`) |
| Add-ons and patch-test rules on services | `src/lib/addons.js`, `src/lib/slots.js` |
| Beauty landing page and example page (`/beauty`, `/demo-beauty`) | `public/beauty.html`, `src/seed-beauty-demo.js` |
| Optional artist subscription billing (Stripe) | `src/routes/billing.js`, `src/lib/stripe.js` |
| The example page at `/demo`, with generated flash artwork | `src/seed-demo.js` |
| Landing, auth, dashboard, booking and status pages | `public/` |

### How a booking works

1. The client requests a time. The server re-checks the slot is free before
   saving, so two clients can't grab the same time.
2. Deposit services start as **awaiting deposit**. The slot is held for the
   artist's chosen window (24 hours by default, never past 2 hours before the
   appointment). No-deposit services are confirmed straight away.
3. The client pays the artist directly and taps "I've sent the deposit". From
   then on the slot stays held until the artist acts.
4. The artist taps **Deposit received** (booking confirmed, client emailed) or
   **Decline**.
5. If nobody reports a payment before the hold runs out, the request expires,
   the slot opens up and the client is emailed.
6. Cancel before the artist's cutoff and the deposit is marked **refund owed**.
   The artist sends it back themselves, then marks it refunded. Cancel later and
   they keep it.

### Consultations, waitlist, consent

- **Consult-first services.** The client sends their idea, placement, size,
  style and up to 4 reference photos (served only by unguessable `/rp/` keys).
  The artist quotes a price, deposit and session length, or declines. The
  client books the quote from `/request/:token`, which becomes a normal deposit
  booking linked to the request. If that booking lapses, the quote still stands.
- **Books closed.** No new bookings or requests. The page shows the artist's
  message and a waitlist form. Opening books can email the whole list (at most
  every 12 hours), with a leave link in each email that asks before removing.
- **Consent forms.** Clients tick each statement, give their legal name, date of
  birth (18+ on the appointment day), medical notes and a drawn signature. The
  exact wording signed is stored with it; the artist gets a printable record at
  `/app/consent/:bookingId`. Links go out in confirmation and reminder emails.
- **Business types and looks.** Each artist picks what they do (tattoo, nails,
  lashes & brows, hair, barber) and a look (Ink, Blush, Latte) in Settings or
  at signup. The type sets the booking-page wording, the default consent form
  and aftercare, and the starter services; the look themes their booking page,
  request and booking pages and dashboard. The server writes the look into the
  HTML so light pages never flash dark.
- **Add-ons and patch tests.** Services can have add-ons (name, price, extra
  minutes). Clients pick them before choosing a time, because extra minutes
  change which slots fit; the server recomputes length and price. A service can
  need a patch test 24/48/72 hours ahead: that becomes its minimum notice, and
  the client must confirm it before booking.
- **Aftercare.** Shown on the booking page after the appointment and emailed 3
  hours after it ends, with an optional review link.

## Deploy (Railway)

1. **New Project → Deploy from GitHub repo** → this repo. `railway.json` and
   `nixpacks.toml` are picked up automatically.
2. Attach a **Volume** to the service, mounted at `/data`.
3. **Settings → Networking → Generate Domain** to get a `*.up.railway.app` URL.
4. Variables:
   - `NODE_ENV=production`
   - `DB_PATH=/data/slotlock.db`
   - `BASE_URL=https://<your-domain>` (no trailing slash)
5. Check `https://<your-domain>/health` returns `{"ok":true}` and `/demo` shows
   the example page.

Upgrading from the first version is automatic: on boot the database gains the
new columns and old bookings are converted. Nothing to run by hand.

## Emails (strongly recommended)

Clients get payment instructions, confirmations and reminders by email, and
artists get told about new requests. Sign up at resend.com, verify your domain,
and set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Slotlock <bookings@yourdomain.com>`).

Without it, everything still works, but only on screen: artists see requests in
their dashboard, and clients see their status page. Password reset links are
written to the server log instead (Railway → Deployments → Logs), so you can
pass them on.

## Charging artists (optional, later)

While `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are unset, every artist is on
free early access and nothing is ever charged. To start charging the $19/month:

1. In Stripe, create a Product "Slotlock Pro" with a recurring **$19/month**
   Price. Put the price ID in `STRIPE_PRICE_ID`.
2. Add a webhook endpoint at `{BASE_URL}/webhooks/stripe` with events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, and put
   its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Turn on the **Customer portal** (Settings → Billing → Customer portal).
4. Set `STRIPE_SECRET_KEY` (test keys first).

Artists then pay on Stripe's own checkout page, never on this site. New artists
get `TRIAL_DAYS` (14) free. Heads up: artists who signed up during early access
are asked to subscribe as soon as billing is on, so announce it first. To keep
someone free, set their `subscription_status` to `comped`.

## Known limits / next up

- One working window per weekday (no split shifts yet).
- Reference photo uploads are for consultation requests only; instant bookings take a link.
- No SMS reminders yet (Twilio would be the obvious add, and a good upsell).
- Artists can't add bookings by hand yet (for ones made over DM).
- SQLite on one instance. Fine for hundreds of artists; the double-booking guard
  would need a transaction or constraint if this moves to Postgres (see
  `src/db/index.js`).
