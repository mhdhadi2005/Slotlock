const { startServer } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert");

let ctx;
test.before(async () => { ctx = await startServer(); });
test.after(() => ctx.server.close());

// Next date (in the artist's zone) that falls on `weekday`, at least 3 days out.
function nextWeekday(weekday) {
  const d = new Date(Date.now() + 3 * 86400000);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test("full flow: signup, set up, client books and pays, cancels", async () => {
  const artist = ctx.client();
  const client = ctx.client();

  let r = await artist("POST", "/api/auth/signup", {
    email: "Sam@Example.com", password: "hunter2hunter2", handle: "sam-ink",
    displayName: "Sam Ink", timezone: "America/Chicago",
  });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.artist.billing.active, true);
  assert.equal(r.body.artist.billing.trialDaysLeft, 14);

  // Taken handle, reserved handle, duplicate email.
  const other = ctx.client();
  assert.equal((await other("POST", "/api/auth/signup", { email: "x@example.com", password: "12345678", handle: "sam-ink", displayName: "X", timezone: "UTC" })).status, 409);
  assert.equal((await other("POST", "/api/auth/signup", { email: "x@example.com", password: "12345678", handle: "login", displayName: "X", timezone: "UTC" })).status, 400);
  assert.equal((await other("POST", "/api/auth/signup", { email: "sam@example.com", password: "12345678", handle: "sam2", displayName: "X", timezone: "UTC" })).status, 409);

  r = await artist("PATCH", "/api/me", { policy: "Deposits are non-refundable within 48 hours." });
  assert.equal(r.status, 200, r.text);

  r = await artist("POST", "/api/services", { name: "Small custom", durationMin: 120, priceCents: 30000, depositCents: 5000 });
  assert.equal(r.status, 201, r.text);
  const serviceId = r.body.service.id;
  assert.equal((await artist("POST", "/api/services", { name: "Bad", durationMin: 7, depositCents: 0 })).status, 400);

  // Thursdays 10:00–16:00 only.
  r = await artist("PUT", "/api/availability", { rules: [{ weekday: 4, startMin: 600, endMin: 960 }], blocked: [] });
  assert.equal(r.status, 200, r.text);

  // Public page + availability.
  r = await client("GET", "/api/public/artists/sam-ink");
  assert.equal(r.status, 200);
  assert.equal(r.body.services.length, 1);
  assert.equal(r.body.services[0].bookable, true);

  const thursday = nextWeekday(4);
  r = await client("GET", `/api/public/artists/sam-ink/availability?service=${serviceId}&from=${thursday}&days=1`);
  assert.equal(r.status, 200, r.text);
  const slots = r.body.days[0].slots;
  assert.equal(slots.length, 9); // 10:00 … 14:00 every 30 min for a 2h service
  const start = slots[0];

  const booking = {
    serviceId, start, name: "Alex Client", email: "alex@example.com", notes: "Fern on forearm",
    referenceUrl: "https://example.com/fern.jpg", agreedToPolicy: true,
  };
  assert.equal((await client("POST", "/api/public/artists/sam-ink/bookings", { ...booking, agreedToPolicy: false })).status, 400);
  assert.equal((await client("POST", "/api/public/artists/sam-ink/bookings", { ...booking, referenceUrl: "javascript:alert(1)" })).status, 400);

  r = await client("POST", "/api/public/artists/sam-ink/bookings", booking);
  assert.equal(r.status, 201, r.text);
  assert.match(r.body.redirectUrl, /^\/booking\/[\w-]+\?demo_pay=1$/);
  const token = r.body.redirectUrl.split("/")[2].split("?")[0];

  // The unpaid hold blocks that slot and its overlaps for everyone else.
  r = await client("GET", `/api/public/artists/sam-ink/availability?service=${serviceId}&from=${thursday}&days=1`);
  assert.ok(!r.body.days[0].slots.includes(start));
  assert.equal(r.body.days[0].slots.length, 5);
  assert.equal((await client("POST", "/api/public/artists/sam-ink/bookings", { ...booking, email: "b@example.com" })).status, 409);

  // Not on the artist's list until paid.
  r = await artist("GET", "/api/bookings");
  assert.equal(r.body.bookings.length, 0);

  r = await client("POST", `/api/public/bookings/${token}/demo-pay`, {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.booking.status, "confirmed");
  assert.equal(r.body.booking.depositPaid, true);
  assert.equal(r.body.booking.refundOnCancel, true);

  r = await artist("GET", "/api/bookings");
  assert.equal(r.body.bookings.length, 1);
  assert.equal(r.body.bookings[0].notes, "Fern on forearm");

  r = await artist("GET", "/api/bookings/stats");
  assert.equal(r.body.upcoming, 1);
  assert.equal(r.body.depositsThisMonthCents, 5000);

  r = await client("GET", `/api/public/bookings/${token}/ics`);
  assert.equal(r.status, 200);
  assert.match(r.text, /BEGIN:VEVENT/);

  // Client cancels well ahead of the 48h window -> refunded.
  r = await client("POST", `/api/public/bookings/${token}/cancel`, {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.booking.status, "cancelled");
  assert.equal(r.body.booking.refunded, true);
  assert.equal((await client("POST", `/api/public/bookings/${token}/cancel`, {})).status, 409);

  // Slot is free again.
  r = await client("GET", `/api/public/artists/sam-ink/availability?service=${serviceId}&from=${thursday}&days=1`);
  assert.ok(r.body.days[0].slots.includes(start));
});

test("abandoning checkout releases the slot", async () => {
  const artist = ctx.client();
  await artist("POST", "/api/auth/signup", { email: "kim@example.com", password: "password123", handle: "kim", displayName: "Kim", timezone: "Europe/London" });
  const { body: { service } } = await artist("POST", "/api/services", { name: "Flash", durationMin: 60, depositCents: 2000 });
  const client = ctx.client();
  const date = nextWeekday(3); // default hours are Tue–Sat
  const { body: avail } = await client("GET", `/api/public/artists/kim/availability?service=${service.id}&from=${date}&days=1`);
  const start = avail.days[0].slots[0];
  const { body } = await client("POST", "/api/public/artists/kim/bookings", { serviceId: service.id, start, name: "A", email: "a@example.com" });
  const token = body.redirectUrl.split("/")[2].split("?")[0];

  const r = await client("POST", `/api/public/bookings/${token}/abandon`, {});
  assert.equal(r.body.booking.status, "expired");
  const again = await client("POST", "/api/public/artists/kim/bookings", { serviceId: service.id, start, name: "B", email: "b@example.com" });
  assert.equal(again.status, 201);
});

test("artists can only touch their own data, and writes need a session", async () => {
  const a = ctx.client();
  const b = ctx.client();
  await a("POST", "/api/auth/signup", { email: "a1@example.com", password: "password123", handle: "artist-a", displayName: "A", timezone: "UTC" });
  await b("POST", "/api/auth/signup", { email: "b1@example.com", password: "password123", handle: "artist-b", displayName: "B", timezone: "UTC" });
  const { body: { service } } = await a("POST", "/api/services", { name: "Mine", durationMin: 60, depositCents: 0 });

  assert.equal((await b("PATCH", `/api/services/${service.id}`, { name: "Stolen" })).status, 404);
  assert.equal((await b("DELETE", `/api/services/${service.id}`)).status, 404);
  assert.equal((await ctx.client()("GET", "/api/bookings")).status, 401);

  // Non-JSON writes are refused (CSRF guard).
  const res = await fetch(`${ctx.base}/api/auth/logout`, { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } });
  assert.equal(res.status, 415);
});

test("login, logout, and trial expiry turns the page off", async () => {
  const a = ctx.client();
  await a("POST", "/api/auth/signup", { email: "t@example.com", password: "password123", handle: "trial-over", displayName: "T", timezone: "UTC" });
  assert.equal((await a("POST", "/api/auth/logout", {})).status, 200);
  assert.equal((await a("GET", "/api/me")).status, 401);
  assert.equal((await a("POST", "/api/auth/login", { email: "t@example.com", password: "wrong-password" })).status, 401);
  assert.equal((await a("POST", "/api/auth/login", { email: "T@example.com", password: "password123" })).status, 200);

  const { db } = require("../src/db");
  db.prepare("UPDATE artists SET trial_ends_at = ? WHERE handle = 'trial-over'").run(new Date(Date.now() - 1000).toISOString());
  const pub = await ctx.client()("GET", "/api/public/artists/trial-over");
  assert.equal(pub.body.artist.acceptingBookings, false);
  assert.equal((await a("GET", "/api/me")).body.artist.billing.active, false);

  // Demo-mode subscribe turns it back on.
  await a("POST", "/api/billing/checkout", {});
  assert.equal((await ctx.client()("GET", "/api/public/artists/trial-over")).body.artist.acceptingBookings, true);
});

test("pages: landing, artist page, unknown handle 404s", async () => {
  const get = ctx.client();
  assert.equal((await get("GET", "/")).status, 200);
  assert.equal((await get("GET", "/sam-ink")).status, 200);
  assert.equal((await get("GET", "/no-such-artist")).status, 404);
  assert.equal((await get("GET", "/health")).body.ok, true);
});

test("Stripe webhook confirms a paid deposit; late payment for a lost slot is refunded", async () => {
  const crypto = require("crypto");
  const { db } = require("../src/db");
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const sendEvent = async (event) => {
    const body = JSON.stringify(event);
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    return fetch(`${ctx.base}/webhooks/stripe`, {
      method: "POST", body, headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${t},v1=${sig}` },
    });
  };
  const paid = (bookingId) => ({
    type: "checkout.session.completed",
    data: { object: { metadata: { kind: "deposit", booking_id: String(bookingId) }, payment_status: "paid", payment_intent: "pi_123" } },
  });

  const artist = ctx.client();
  await artist("POST", "/api/auth/signup", { email: "wh@example.com", password: "password123", handle: "webhook-artist", displayName: "W", timezone: "UTC" });
  const { body: { service } } = await artist("POST", "/api/services", { name: "Flash", durationMin: 60, depositCents: 2000 });
  const client = ctx.client();
  const date = nextWeekday(5);
  const { body: avail } = await client("GET", `/api/public/artists/webhook-artist/availability?service=${service.id}&from=${date}&days=1`);
  const start = avail.days[0].slots[0];
  const book = async (email) => {
    const { body } = await client("POST", "/api/public/artists/webhook-artist/bookings", { serviceId: service.id, start, name: "C", email });
    const token = body.redirectUrl.split("/")[2].split("?")[0];
    return db.prepare("SELECT * FROM bookings WHERE public_token = ?").get(token);
  };

  // Bad signature is rejected.
  const bad = await fetch(`${ctx.base}/webhooks/stripe`, { method: "POST", body: "{}", headers: { "Stripe-Signature": "t=1,v1=00" } });
  assert.equal(bad.status, 400);

  // Normal path.
  const first = await book("one@example.com");
  assert.equal((await sendEvent(paid(first.id))).status, 200);
  let row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(first.id);
  assert.equal(row.status, "confirmed");
  assert.equal(row.stripe_payment_intent_id, "pi_123");
  // Replays are harmless.
  assert.equal((await sendEvent(paid(first.id))).status, 200);

  // Lost-slot path: client A's hold lapses, B takes the slot and pays, then A's payment lands.
  await artist("POST", `/api/bookings/${first.id}/cancel`, { refund: true });
  const a = await book("a@example.com");
  db.prepare("UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ?").run(a.id);
  const b = await book("b@example.com");
  await sendEvent(paid(b.id));
  await sendEvent(paid(a.id));
  row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(a.id);
  assert.equal(row.status, "cancelled");
  assert.equal(row.refunded, 1);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = ?").get(b.id).status, "confirmed");
});
