// Business types, looks, add-ons and patch tests.
const { startServer, nextWeekday } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const { db } = require("../src/db");
const { outbox } = require("../src/lib/email");

let ctx;
test.before(async () => { ctx = await startServer(); });
test.after(() => ctx.server.close());

async function signup(handle, extra = {}) {
  const artist = ctx.client();
  const r = await artist("POST", "/api/auth/signup", {
    email: `${handle}@example.com`, password: "password123", handle, displayName: handle, timezone: "America/Chicago", ...extra,
  });
  assert.equal(r.status, 201, r.text);
  return { artist, me: r.body.artist };
}

test("signing up as a nail tech: blush look, nail wording, starter services, pages render pink", async () => {
  const { artist, me } = await signup("glow-nails", { businessType: "nails" });
  assert.equal(me.businessType, "nails");
  assert.equal(me.look, "blush");
  const plain = await signup("plain-ink", { businessType: "nope" });
  assert.equal(plain.me.businessType, "tattoo");
  assert.equal(plain.me.look, "ink");

  let r = await artist("POST", "/api/services/starters", {});
  assert.equal(r.status, 201);
  assert.equal(r.body.added, 3);
  assert.equal((await artist("POST", "/api/services/starters", {})).body.added, 0, "no duplicates");
  const { body: { services } } = await artist("GET", "/api/services");
  assert.ok(services.find((s) => s.name === "Gel manicure").addons.length > 0);

  const client = ctx.client();
  r = await client("GET", "/api/public/artists/glow-nails");
  assert.equal(r.body.artist.look, "blush");
  assert.equal(r.body.artist.words.work, "nails");
  assert.match(r.body.artist.words.notesPlaceholder, /Nail shape/);

  // The server paints the look in before any script runs.
  r = await client("GET", "/glow-nails");
  assert.match(r.text, /<html lang="en" data-look="blush">/);
  r = await client("GET", "/plain-ink");
  assert.doesNotMatch(r.text, /data-look/);
  r = await artist("GET", "/app");
  assert.match(r.text, /data-look="blush"/);

  // Switching look and type.
  assert.equal((await artist("PATCH", "/api/me", { look: "neon" })).status, 400);
  assert.equal((await artist("PATCH", "/api/me", { businessType: "florist" })).status, 400);
  r = await artist("PATCH", "/api/me", { look: "latte", businessType: "lashes" });
  assert.equal(r.body.artist.look, "latte");
  assert.match((await client("GET", "/glow-nails")).text, /data-look="latte"/);

  // The consent form falls back to the business type's template.
  await artist("PATCH", "/api/me", { consentEnabled: true });
  assert.ok((await ctx.client()("GET", "/api/config")).body.business.lashes.consent.statements.some((st) => /patch test/i.test(st)));
});

test("add-ons make the appointment longer and cost more; patch tests need a confirmation and notice", async () => {
  const { artist } = await signup("lash-lab", { businessType: "lashes" });
  await artist("PATCH", "/api/me", { paymentMethods: [{ type: "venmo", value: "@lashlab" }] });
  // Only Thursdays 11:00–14:00, so a longer appointment fits fewer times.
  await artist("PUT", "/api/availability", { rules: [{ weekday: 4, startMin: 660, endMin: 840 }], blocked: [] });

  assert.equal((await artist("POST", "/api/services", { name: "Bad", durationMin: 60, depositCents: 0, addons: [{ name: "X", priceCents: 100, durationMin: 7 }] })).status, 400);
  assert.equal((await artist("POST", "/api/services", { name: "Bad", durationMin: 60, depositCents: 0, patchTestHours: 5 })).status, 400);
  let r = await artist("POST", "/api/services", {
    name: "Lash set", durationMin: 120, priceCents: 9000, depositCents: 2500, patchTestHours: 48,
    addons: [{ name: "Bottom lashes", priceCents: 1500, durationMin: 30 }, { name: "  ", priceCents: 1 }, { name: "Lash bath", priceCents: 500, durationMin: 0 }],
  });
  assert.equal(r.status, 201, r.text);
  const svc = r.body.service;
  assert.deepEqual(svc.addons.map((x) => x.name), ["Bottom lashes", "Lash bath"]);
  assert.equal(svc.patchTestHours, 48);

  const client = ctx.client();
  const thursday = nextWeekday(4);
  const slots = async (addons) => (await client("GET", `/api/public/artists/lash-lab/availability?service=${svc.id}&from=${thursday}&days=1${addons ? `&addons=${addons}` : ""}`)).body.days[0].slots;
  const plainSlots = await slots("");
  const longSlots = await slots("0,1");
  assert.equal(plainSlots.length, 3, "2h fits at 11:00, 11:30, 12:00");
  assert.equal(longSlots.length, 2, "2h30 fits at 11:00, 11:30");
  assert.equal((await client("GET", `/api/public/artists/lash-lab/availability?service=${svc.id}&addons=9`)).status, 400);

  const body = { serviceId: svc.id, name: "Ivy", email: "ivy@example.com", addons: [0, 1], patchTestOk: true };
  r = await client("POST", "/api/public/artists/lash-lab/bookings", { ...body, start: plainSlots[2] });
  assert.equal(r.status, 409, "12:00 + 2h30 runs past closing");
  r = await client("POST", "/api/public/artists/lash-lab/bookings", { ...body, patchTestOk: false, start: longSlots[0] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /patch test/);
  r = await client("POST", "/api/public/artists/lash-lab/bookings", { ...body, start: longSlots[0] });
  assert.equal(r.status, 201, r.text);
  const token = r.body.redirectUrl.split("/").pop();
  const b = db.prepare("SELECT * FROM bookings WHERE public_token = ?").get(token);
  assert.equal(Date.parse(b.ends_at) - Date.parse(b.starts_at), 150 * 60000);
  assert.equal(b.addons_cents, 2000);
  assert.equal(b.deposit_cents, 2500, "deposit is the service's");

  r = await client("GET", `/api/public/bookings/${token}`);
  assert.deepEqual(r.body.booking.addons.map((x) => x.name), ["Bottom lashes", "Lash bath"]);
  assert.ok(outbox.some((m) => m.to === "lash-lab@example.com" && /Add-ons: Bottom lashes \(\+\$15\.00\), Lash bath/.test(m.text)));
  r = await artist("GET", "/api/bookings?scope=action");
  assert.equal(r.body.bookings[0].addonsCents, 2000);

  // Patch test notice: nothing bookable in the next 48 hours.
  await artist("PUT", "/api/availability", { rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 0, endMin: 1440 })), blocked: [] });
  await artist("PATCH", "/api/me", { minNoticeHours: 0 });
  const today = new Date().toISOString().slice(0, 10);
  r = await client("GET", `/api/public/artists/lash-lab/availability?service=${svc.id}&from=${today}&days=4`);
  const first = r.body.days.flatMap((d) => d.slots)[0];
  assert.ok(Date.parse(first) >= Date.now() + 47.9 * 3600000, "first opening is at least 48h away");
});
