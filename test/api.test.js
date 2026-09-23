const { startServer, nextWeekday, setupArtist } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const { db } = require("../src/db");
const { outbox } = require("../src/lib/email");

let ctx;
test.before(async () => { ctx = await startServer(); });
test.after(() => ctx.server.close());

const tokenFrom = (url) => url.split("/")[2].split("?")[0];
const emailsTo = (to) => outbox.filter((m) => m.to === to);

test("full flow: request, client sends deposit, artist confirms, client cancels, artist refunds", async () => {
  const artist = ctx.client();
  const client = ctx.client();

  let r = await artist("POST", "/api/auth/signup", {
    email: "Sam@Example.com", password: "hunter2hunter2", handle: "sam-ink", displayName: "Sam Ink", timezone: "America/Chicago",
  });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.artist.billing.enabled, false);
  assert.equal(r.body.artist.billing.active, true);
  assert.match(r.body.artist.calendarUrl, /\/cal\/[\w-]+\.ics$/);

  // Taken handle, reserved handle, duplicate email.
  const other = ctx.client();
  assert.equal((await other("POST", "/api/auth/signup", { email: "x@example.com", password: "12345678", handle: "sam-ink", displayName: "X", timezone: "UTC" })).status, 409);
  assert.equal((await other("POST", "/api/auth/signup", { email: "x@example.com", password: "12345678", handle: "demo", displayName: "X", timezone: "UTC" })).status, 400);
  assert.equal((await other("POST", "/api/auth/signup", { email: "sam@example.com", password: "12345678", handle: "sam2", displayName: "X", timezone: "UTC" })).status, 409);

  r = await artist("POST", "/api/services", { name: "Small custom", durationMin: 120, priceCents: 30000, depositCents: 5000 });
  assert.equal(r.status, 201, r.text);
  const serviceId = r.body.service.id;
  assert.equal((await artist("POST", "/api/services", { name: "Bad", durationMin: 7, depositCents: 0 })).status, 400);
  assert.equal((await artist("POST", "/api/services", { name: "Bad", durationMin: 60, priceCents: 1000, depositCents: 5000 })).status, 400);

  // A deposit service can't be booked until the artist says how to pay them.
  r = await client("GET", "/api/public/artists/sam-ink");
  assert.equal(r.body.services[0].bookable, false);

  r = await artist("PATCH", "/api/me", {
    policy: "Deposits are non-refundable within 48 hours.",
    paymentMethods: [{ type: "venmo", value: "@sam-ink" }, { type: "zelle", value: "sam@example.com" }],
    paymentNote: "Add the reference in the note.",
    holdHours: 12,
  });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.artist.paymentMethods, [{ type: "venmo", value: "sam-ink" }, { type: "zelle", value: "sam@example.com" }]);

  // Thursdays 10:00–16:00 only.
  r = await artist("PUT", "/api/availability", { rules: [{ weekday: 4, startMin: 600, endMin: 960 }], blocked: [] });
  assert.equal(r.status, 200, r.text);

  r = await client("GET", "/api/public/artists/sam-ink");
  assert.equal(r.body.services[0].bookable, true);
  assert.deepEqual(r.body.artist.paymentMethods, ["Venmo", "Zelle"]);

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

  outbox.length = 0;
  r = await client("POST", "/api/public/artists/sam-ink/bookings", booking);
  assert.equal(r.status, 201, r.text);
  assert.match(r.body.redirectUrl, /^\/booking\/[\w-]+$/);
  const token = tokenFrom(r.body.redirectUrl);

  // Client gets payment instructions; artist hears about the request.
  const [clientMail] = emailsTo("alex@example.com");
  assert.match(clientMail.subject, /Send your \$50\.00 deposit/);
  assert.match(clientMail.text, /Venmo: @sam-ink/);
  assert.equal(emailsTo("sam@example.com").length, 1);

  r = await client("GET", `/api/public/bookings/${token}`);
  assert.equal(r.body.booking.status, "awaiting_deposit");
  assert.match(r.body.booking.refCode, /^[2-9A-HJ-NP-Z]{5}$/);
  assert.ok(r.body.booking.holdExpiresAt);
  const venmo = r.body.booking.payment.methods.find((m) => m.type === "venmo");
  assert.equal(venmo.href, "https://venmo.com/u/sam-ink");
  assert.equal(venmo.display, "@sam-ink");
  const zelle = r.body.booking.payment.methods.find((m) => m.type === "zelle");
  assert.equal(zelle.href, null);
  assert.equal(zelle.copy, "sam@example.com");
  // Held for 12h (the artist's setting), well before the appointment.
  const held = Date.parse(r.body.booking.holdExpiresAt) - Date.now();
  assert.ok(held > 11.9 * 3600000 && held <= 12 * 3600000, `hold ${held}`);

  // The hold blocks that slot and its overlaps for everyone else.
  r = await client("GET", `/api/public/artists/sam-ink/availability?service=${serviceId}&from=${thursday}&days=1`);
  assert.ok(!r.body.days[0].slots.includes(start));
  assert.equal(r.body.days[0].slots.length, 5);
  assert.equal((await client("POST", "/api/public/artists/sam-ink/bookings", { ...booking, email: "b@example.com" })).status, 409);

  // Shows up in the artist's "needs action" list, not in upcoming.
  r = await artist("GET", "/api/bookings?scope=action");
  assert.equal(r.body.bookings.length, 1);
  assert.equal(r.body.bookings[0].notes, "Fern on forearm");
  assert.equal((await artist("GET", "/api/bookings")).body.bookings.length, 0);

  outbox.length = 0;
  r = await client("POST", `/api/public/bookings/${token}/report-deposit`, { method: "venmo" });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.booking.status, "awaiting_deposit");
  assert.equal(r.body.booking.depositReported, true);
  assert.equal(r.body.booking.holdExpiresAt, null);
  assert.match(emailsTo("sam@example.com")[0].subject, /says they sent the \$50\.00 deposit/);

  r = await artist("GET", "/api/bookings/stats");
  assert.equal(r.body.reportedDeposits, 1);
  assert.equal(r.body.needsAction, 1);

  outbox.length = 0;
  const [pending] = (await artist("GET", "/api/bookings?scope=action")).body.bookings;
  assert.equal(pending.depositMethod, "venmo");
  r = await artist("POST", `/api/bookings/${pending.id}/confirm-deposit`, {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.booking.status, "confirmed");
  assert.match(emailsTo("alex@example.com")[0].subject, /You're booked/);
  assert.equal((await artist("POST", `/api/bookings/${pending.id}/confirm-deposit`, {})).status, 409);

  r = await artist("GET", "/api/bookings/stats");
  assert.equal(r.body.upcoming, 1);
  assert.equal(r.body.needsAction, 0);
  assert.equal(r.body.depositsThisMonthCents, 5000);

  r = await client("GET", `/api/public/bookings/${token}`);
  assert.equal(r.body.booking.payment, null);
  assert.equal(r.body.booking.refundOnCancel, true);
  assert.equal((await client("GET", `/api/public/bookings/${token}/ics`)).status, 200);

  // Client cancels well ahead of the 48h window -> refund owed by the artist.
  outbox.length = 0;
  r = await client("POST", `/api/public/bookings/${token}/cancel`, {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.booking.status, "cancelled");
  assert.equal(r.body.booking.refundStatus, "owed");
  assert.match(emailsTo("sam@example.com")[0].text, /owed their \$50\.00 deposit back/);
  assert.equal((await client("POST", `/api/public/bookings/${token}/cancel`, {})).status, 409);

  r = await artist("GET", "/api/bookings?scope=action");
  assert.equal(r.body.bookings.length, 1);
  assert.equal(r.body.bookings[0].refundStatus, "owed");
  r = await artist("POST", `/api/bookings/${pending.id}/refund`, { status: "refunded" });
  assert.equal(r.body.booking.refundStatus, "refunded");
  assert.equal((await artist("POST", `/api/bookings/${pending.id}/refund`, { status: "refunded" })).status, 409);

  // Slot is free again.
  r = await client("GET", `/api/public/artists/sam-ink/availability?service=${serviceId}&from=${thursday}&days=1`);
  assert.ok(r.body.days[0].slots.includes(start));
});

test("unpaid holds expire and free the slot; reported ones don't", async () => {
  const { artist, service } = await setupArtist(ctx, "hold-artist");
  const client = ctx.client();
  const date = nextWeekday(3);
  const avail = async () => (await client("GET", `/api/public/artists/hold-artist/availability?service=${service.id}&from=${date}&days=1`)).body.days[0].slots;
  const [s1, , , , s2] = await avail();

  const { body: a } = await client("POST", "/api/public/artists/hold-artist/bookings", { serviceId: service.id, start: s1, name: "A", email: "a@example.com" });
  const { body: b } = await client("POST", "/api/public/artists/hold-artist/bookings", { serviceId: service.id, start: s2, name: "B", email: "b@example.com" });
  await client("POST", `/api/public/bookings/${tokenFrom(b.redirectUrl)}/report-deposit`, {});

  const { expireHolds } = require("../src/jobs/scheduler");
  outbox.length = 0;
  const expired = await expireHolds(Date.now() + 25 * 3600000);
  assert.equal(expired, 1);
  assert.match(emailsTo("a@example.com")[0].subject, /hold .* has expired/);

  assert.equal((await client("GET", `/api/public/bookings/${tokenFrom(a.redirectUrl)}`)).body.booking.status, "expired");
  assert.equal((await client("GET", `/api/public/bookings/${tokenFrom(b.redirectUrl)}`)).body.booking.status, "awaiting_deposit");
  const slots = await avail();
  assert.ok(slots.includes(s1));
  assert.ok(!slots.includes(s2));

  // Reporting on an expired hold is refused.
  assert.equal((await client("POST", `/api/public/bookings/${tokenFrom(a.redirectUrl)}/report-deposit`, {})).status, 409);

  // Artist declines B (they never got the money) without a refund.
  const [pending] = (await artist("GET", "/api/bookings?scope=action")).body.bookings;
  const r = await artist("POST", `/api/bookings/${pending.id}/cancel`, { reason: "Deposit never arrived", refund: false });
  assert.equal(r.body.booking.status, "cancelled");
  assert.equal(r.body.booking.refundStatus, "none");
  assert.equal(r.body.booking.cancelReason, "Deposit never arrived");
});

test("late client cancellation keeps the deposit; no-deposit services book instantly", async () => {
  const { artist } = await setupArtist(ctx, "late-artist");
  await artist("PATCH", "/api/me", { cancelWindowHours: 720, minNoticeHours: 0 });
  const { body: { service: free } } = await artist("POST", "/api/services", { name: "Consult", durationMin: 30, depositCents: 0 });
  const { body: { service: paid } } = await artist("POST", "/api/services", { name: "Flash", durationMin: 60, depositCents: 2000 });
  const client = ctx.client();
  const date = nextWeekday(2);

  const slot = async (svc) => (await client("GET", `/api/public/artists/late-artist/availability?service=${svc.id}&from=${date}&days=1`)).body.days[0].slots[0];
  outbox.length = 0;
  let r = await client("POST", "/api/public/artists/late-artist/bookings", { serviceId: free.id, start: await slot(free), name: "C", email: "c@example.com" });
  assert.equal(r.status, 201);
  assert.equal((await client("GET", `/api/public/bookings/${tokenFrom(r.body.redirectUrl)}`)).body.booking.status, "confirmed");
  assert.match(emailsTo("late-artist@example.com")[0].subject, /New booking/);

  r = await client("POST", "/api/public/artists/late-artist/bookings", { serviceId: paid.id, start: await slot(paid), name: "D", email: "d@example.com" });
  const token = tokenFrom(r.body.redirectUrl);
  const [pending] = (await artist("GET", "/api/bookings?scope=action")).body.bookings;
  await artist("POST", `/api/bookings/${pending.id}/confirm-deposit`, {});
  r = await client("GET", `/api/public/bookings/${token}`);
  assert.equal(r.body.booking.refundOnCancel, false); // inside the 720h window
  r = await client("POST", `/api/public/bookings/${token}/cancel`, {});
  assert.equal(r.body.booking.refundStatus, "none");
  const stats = (await artist("GET", "/api/bookings/stats")).body;
  assert.equal(stats.keptFromCancellationsCents, 2000);
});

test("payment method validation", async () => {
  const { artist } = await setupArtist(ctx, "pm-artist", { methods: null });
  const bad = async (methods) => (await artist("PATCH", "/api/me", { paymentMethods: methods })).status;
  assert.equal(await bad([{ type: "bitcoin", value: "x" }]), 400);
  assert.equal(await bad([{ type: "link", value: "javascript:alert(1)" }]), 400);
  assert.equal(await bad([{ type: "venmo", value: "not a name!" }]), 400);
  assert.equal(await bad([{ type: "upi", value: "nope" }]), 400);
  assert.equal(await bad(Array(7).fill({ type: "zelle", value: "a@b.co" })), 400);
  const r = await artist("PATCH", "/api/me", { paymentMethods: [
    { type: "paypal", value: "https://www.paypal.me/Rosa/20" }, { type: "cashapp", value: "$rosa" },
    { type: "link", value: "https://buy.stripe.com/test_123" }, { type: "upi", value: "rosa@okaxis" },
  ] });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.artist.paymentMethods.map((m) => m.value), ["Rosa", "rosa", "https://buy.stripe.com/test_123", "rosa@okaxis"]);
});

test("demo page: always seeded, pretend payments, auto-confirms, sends nothing", async () => {
  const client = ctx.client();
  let r = await client("GET", "/api/public/artists/demo");
  assert.equal(r.status, 200);
  assert.equal(r.body.artist.isDemo, true);
  assert.equal(r.body.artist.portfolio.length, 6);
  assert.ok(r.body.services.every((s) => s.bookable));

  const img = await client("GET", r.body.artist.portfolio[0]);
  assert.equal(img.headers.get("content-type"), "image/svg+xml");
  assert.match(img.headers.get("content-security-policy"), /default-src 'none'/);

  const svc = r.body.services[0];
  const date = nextWeekday(4);
  r = await client("GET", `/api/public/artists/demo/availability?service=${svc.id}&from=${date}&days=1`);
  outbox.length = 0;
  r = await client("POST", "/api/public/artists/demo/bookings", { serviceId: svc.id, start: r.body.days[0].slots[0], name: "Visitor", email: "visitor@example.com", agreedToPolicy: true });
  assert.equal(r.status, 201, r.text);
  const token = tokenFrom(r.body.redirectUrl);
  r = await client("GET", `/api/public/bookings/${token}`);
  assert.ok(r.body.booking.payment.methods.length > 0);
  assert.ok(r.body.booking.payment.methods.every((m) => m.href === null), "demo must never link to real accounts");
  r = await client("POST", `/api/public/bookings/${token}/report-deposit`, { method: "paypal" });
  assert.equal(r.body.booking.status, "confirmed");
  assert.equal(outbox.length, 0);

  // Nobody can log in as the demo.
  assert.equal((await client("POST", "/api/auth/login", { email: "demo@slotlock.invalid", password: "x" })).status, 401);

  // Demo bookings are tidied after 30 minutes.
  const { cleanDemo } = require("../src/jobs/scheduler");
  assert.equal(cleanDemo(Date.now() + 31 * 60000), 1);
});

test("artists can only touch their own data, and writes need a session", async () => {
  const { artist: a, service } = await setupArtist(ctx, "artist-a");
  const { artist: b } = await setupArtist(ctx, "artist-b");

  assert.equal((await b("PATCH", `/api/services/${service.id}`, { name: "Stolen" })).status, 404);
  assert.equal((await b("DELETE", `/api/services/${service.id}`)).status, 404);
  assert.equal((await ctx.client()("GET", "/api/bookings")).status, 401);

  const client = ctx.client();
  const date = nextWeekday(3);
  const { body: avail } = await client("GET", `/api/public/artists/artist-a/availability?service=${service.id}&from=${date}&days=1`);
  await client("POST", "/api/public/artists/artist-a/bookings", { serviceId: service.id, start: avail.days[0].slots[0], name: "Z", email: "z@example.com" });
  const [mine] = (await a("GET", "/api/bookings?scope=action")).body.bookings;
  assert.equal((await b("POST", `/api/bookings/${mine.id}/confirm-deposit`, {})).status, 404);
  assert.equal((await b("POST", `/api/bookings/${mine.id}/cancel`, {})).status, 404);

  // Non-JSON writes are refused (CSRF guard).
  const res = await fetch(`${ctx.base}/api/auth/logout`, { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } });
  assert.equal(res.status, 415);
});

test("passwords: login, logout, change, forgot and reset", async () => {
  const a = ctx.client();
  await a("POST", "/api/auth/signup", { email: "t@example.com", password: "password123", handle: "pw-artist", displayName: "T", timezone: "UTC" });
  assert.equal((await a("POST", "/api/auth/logout", {})).status, 200);
  assert.equal((await a("GET", "/api/me")).status, 401);
  assert.equal((await a("POST", "/api/auth/login", { email: "t@example.com", password: "wrong-password" })).status, 401);
  assert.equal((await a("POST", "/api/auth/login", { email: "T@example.com", password: "password123" })).status, 200);

  const other = ctx.client();
  await other("POST", "/api/auth/login", { email: "t@example.com", password: "password123" });
  assert.equal((await a("POST", "/api/me/password", { current: "nope", next: "newpassword1" })).status, 400);
  assert.equal((await a("POST", "/api/me/password", { current: "password123", next: "newpassword1" })).status, 200);
  assert.equal((await a("GET", "/api/me")).status, 200, "this device stays signed in");
  assert.equal((await other("GET", "/api/me")).status, 401, "other devices are signed out");

  outbox.length = 0;
  assert.equal((await ctx.client()("POST", "/api/auth/forgot", { email: "nobody@example.com" })).status, 200);
  assert.equal(outbox.length, 0);
  await ctx.client()("POST", "/api/auth/forgot", { email: "t@example.com" });
  const link = /\/reset\/([\w-]+)/.exec(outbox[0].text);
  assert.ok(link, outbox[0]?.text);
  const fresh = ctx.client();
  assert.equal((await fresh("POST", "/api/auth/reset", { token: link[1], password: "short" })).status, 400);
  assert.equal((await fresh("POST", "/api/auth/reset", { token: link[1], password: "brandnewpass" })).status, 200);
  assert.equal((await fresh("GET", "/api/me")).status, 200);
  assert.equal((await fresh("POST", "/api/auth/reset", { token: link[1], password: "anotherpass1" })).status, 400, "one use only");
  assert.equal((await ctx.client()("POST", "/api/auth/login", { email: "t@example.com", password: "brandnewpass" })).status, 200);
});

test("billing stays off without Stripe, even when a trial has run out", async () => {
  const { artist } = await setupArtist(ctx, "trial-over");
  db.prepare("UPDATE artists SET trial_ends_at = ? WHERE handle = 'trial-over'").run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await ctx.client()("GET", "/api/public/artists/trial-over")).body.artist.acceptingBookings, true);
  assert.equal((await artist("POST", "/api/billing/checkout", {})).status, 400);
  const config = (await ctx.client()("GET", "/api/config")).body;
  assert.equal(config.billingEnabled, false);
  assert.ok(config.paymentTypes.some((t) => t.type === "paypal"));
});

test("images: upload avatar and portfolio, reject non-images", async () => {
  const { artist } = await setupArtist(ctx, "img-artist");
  // Smallest valid PNG (1x1).
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  let r = await artist("POST", "/api/images", { kind: "avatar", data: png });
  assert.equal(r.status, 201, r.text);
  const avatarUrl = r.body.image.url;
  assert.equal((await artist("GET", "/api/me")).body.artist.avatarUrl, avatarUrl);
  const served = await ctx.client()("GET", avatarUrl);
  assert.equal(served.headers.get("content-type"), "image/png");

  // Replacing the avatar deletes the old one.
  r = await artist("POST", "/api/images", { kind: "avatar", data: png });
  assert.equal((await ctx.client()("GET", avatarUrl)).status, 404);

  r = await artist("POST", "/api/images", { kind: "portfolio", data: png });
  assert.equal(r.status, 201);
  assert.equal((await artist("GET", "/api/me")).body.artist.portfolio.length, 1);
  assert.equal((await ctx.client()("GET", "/api/public/artists/img-artist")).body.artist.portfolio.length, 1);

  const fake = "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64");
  assert.equal((await artist("POST", "/api/images", { kind: "portfolio", data: fake })).status, 400);
  assert.equal((await artist("DELETE", `/api/images/${r.body.image.id}`)).status, 200);
  assert.equal((await artist("GET", "/api/me")).body.artist.portfolio.length, 0);
});

test("calendar feed lists bookings for the artist's secret link only", async () => {
  const { artist, service } = await setupArtist(ctx, "cal-artist");
  const client = ctx.client();
  const date = nextWeekday(5);
  const { body: avail } = await client("GET", `/api/public/artists/cal-artist/availability?service=${service.id}&from=${date}&days=1`);
  await client("POST", "/api/public/artists/cal-artist/bookings", { serviceId: service.id, start: avail.days[0].slots[0], name: "Cal Client", email: "cc@example.com", notes: "A very long note, ".repeat(10) });

  const me = (await artist("GET", "/api/me")).body.artist;
  const path = new URL(me.calendarUrl).pathname;
  let r = await ctx.client()("GET", path);
  assert.equal(r.status, 200);
  assert.match(r.text, /SUMMARY:\[Deposit pending\] Small custom: Cal Client/);
  assert.ok(r.text.split("\r\n").every((line) => Buffer.byteLength(line) <= 75), "lines are folded");

  r = await artist("POST", "/api/me/calendar-token", {});
  assert.equal((await ctx.client()("GET", path)).status, 404, "old link stops working");
});

test("pages: landing, artist page with link preview tags, unknown handle 404s", async () => {
  const get = ctx.client();
  assert.equal((await get("GET", "/")).status, 200);
  const page = await get("GET", "/demo");
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>Book with Rosa Vega Tattoo<\/title>/);
  assert.match(page.text, /property="og:title" content="Book with Rosa Vega Tattoo"/);
  assert.equal((await get("GET", "/no-such-artist")).status, 404);
  assert.equal((await get("GET", "/health")).body.ok, true);
  assert.equal((await get("GET", "/reset/abc")).status, 200);
});

test("Stripe subscription webhooks still update an artist's plan", async () => {
  const crypto = require("crypto");
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const { artist } = await setupArtist(ctx, "sub-artist");
  const id = (await artist("GET", "/api/me")).body.artist.id;
  const body = JSON.stringify({ type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { artist_id: String(id) } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
  const res = await fetch(`${ctx.base}/webhooks/stripe`, { method: "POST", body, headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${t},v1=${sig}` } });
  assert.equal(res.status, 200);
  assert.equal(db.prepare("SELECT subscription_status FROM artists WHERE id = ?").get(id).subscription_status, "active");
  const bad = await fetch(`${ctx.base}/webhooks/stripe`, { method: "POST", body: "{}", headers: { "Stripe-Signature": "t=1,v1=00" } });
  assert.equal(bad.status, 400);
});

test("confirming a lapsed hold can't double-book a slot someone else took", async () => {
  const { artist, service } = await setupArtist(ctx, "race-artist");
  const client = ctx.client();
  const date = nextWeekday(4);
  const { body: avail } = await client("GET", `/api/public/artists/race-artist/availability?service=${service.id}&from=${date}&days=1`);
  const start = avail.days[0].slots[0];
  const first = await client("POST", "/api/public/artists/race-artist/bookings", { serviceId: service.id, start, name: "First", email: "first@example.com" });
  const [pending] = (await artist("GET", "/api/bookings?scope=action")).body.bookings;

  // Hold runs out before the scheduler has tidied it up; someone else books.
  db.prepare("UPDATE bookings SET hold_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60000).toISOString(), pending.id);
  const second = await client("POST", "/api/public/artists/race-artist/bookings", { serviceId: service.id, start, name: "Second", email: "second@example.com" });
  assert.equal(second.status, 201, second.text);

  const r = await artist("POST", `/api/bookings/${pending.id}/confirm-deposit`, {});
  assert.equal(r.status, 409);
  assert.equal((await client("GET", `/api/public/bookings/${tokenFrom(first.body.redirectUrl)}`)).body.booking.status, "awaiting_deposit");
});
