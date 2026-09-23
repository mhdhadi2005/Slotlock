// Consultation requests, books closed + waitlist, consent forms and aftercare.
const { startServer, nextWeekday, setupArtist } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const { db } = require("../src/db");
const { outbox } = require("../src/lib/email");

let ctx;
test.before(async () => { ctx = await startServer(); });
test.after(() => ctx.server.close());

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const emailsTo = (to) => outbox.filter((m) => m.to === to);
const tokenOf = (url) => url.split("/")[2];

async function firstThursdaySlot(client, url) {
  const r = await client("GET", `${url}${url.includes("?") ? "&" : "?"}from=${nextWeekday(4)}&days=1`);
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.days[0].slots.length, "expected openings on Thursday");
  return r.body.days[0].slots[0];
}

test("consultation: request with photos, quote, book the quote, rebook after it lapses", async () => {
  const { artist } = await setupArtist(ctx, "cara-ink", { methods: null });
  const client = ctx.client();

  let r = await artist("POST", "/api/services", { name: "Custom project", durationMin: 180, priceCents: null, depositCents: 10000, mode: "consult" });
  assert.equal(r.status, 201, r.text);
  const consult = r.body.service;
  assert.equal(consult.mode, "consult");
  assert.equal((await artist("POST", "/api/services", { name: "Bad", durationMin: 60, depositCents: 0, mode: "sometimes" })).status, 400);

  // Consult services show as bookable even before deposits are set up, and
  // can't be booked straight into a time.
  r = await client("GET", "/api/public/artists/cara-ink");
  assert.equal(r.body.services.find((s) => s.id === consult.id).bookable, true);
  r = await client("POST", "/api/public/artists/cara-ink/bookings", { serviceId: consult.id, start: new Date().toISOString(), name: "A", email: "a@example.com" });
  assert.equal(r.status, 400);

  // Validation.
  const base = { serviceId: consult.id, name: "Mia Lopez", email: "mia@example.com", idea: "A moth with a crescent moon, fine line", placement: "inner forearm", size: "4 inches", style: "black_grey" };
  assert.equal((await client("POST", "/api/public/artists/cara-ink/requests", { ...base, idea: "moth" })).status, 400);
  assert.equal((await client("POST", "/api/public/artists/cara-ink/requests", { ...base, email: "nope" })).status, 400);
  assert.equal((await client("POST", "/api/public/artists/cara-ink/requests", { ...base, photos: ["data:image/png;base64,AAAA"] })).status, 400);

  r = await client("POST", "/api/public/artists/cara-ink/requests", { ...base, photos: [PNG, PNG] });
  assert.equal(r.status, 201, r.text);
  const token = tokenOf(r.body.redirectUrl);
  assert.ok(emailsTo("cara-ink@example.com").some((m) => /New consultation request from Mia Lopez/.test(m.subject)));
  assert.ok(emailsTo("mia@example.com").some((m) => /sent to cara-ink/.test(m.subject)));

  r = await client("GET", `/api/public/requests/${token}`);
  assert.equal(r.body.request.status, "new");
  assert.equal(r.body.request.canBook, false);
  assert.equal(r.body.request.photos.length, 2);
  const photo = await client("GET", r.body.request.photos[0]);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.equal((await client("GET", "/rp/not-a-real-key")).status, 404);
  assert.equal((await client("GET", `/api/public/requests/${token}/availability`)).status, 409);

  // The artist sees it; a deposit quote needs payment details first.
  r = await artist("GET", "/api/requests");
  assert.equal(r.body.requests.length, 1);
  const req = r.body.requests[0];
  assert.equal(req.styleLabel, "Black & grey");
  assert.equal((await artist("GET", "/api/bookings/stats")).body.newRequests, 1);
  r = await artist("POST", `/api/requests/${req.id}/quote`, { priceCents: 45000, depositCents: 10000, durationMin: 180, message: "Love it!" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Deposits page/);
  await artist("PATCH", "/api/me", { paymentMethods: [{ type: "venmo", value: "@cara" }] });
  assert.equal((await artist("POST", `/api/requests/${req.id}/quote`, { priceCents: 1000, depositCents: 5000, durationMin: 180 })).status, 400);
  assert.equal((await artist("POST", `/api/requests/${req.id}/quote`, { depositCents: 5000, durationMin: 50 })).status, 400);
  r = await artist("POST", `/api/requests/${req.id}/quote`, { priceCents: 45000, depositCents: 10000, durationMin: 180, message: "Love it!" });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.request.status, "quoted");
  const quoteMail = emailsTo("mia@example.com").find((m) => /sent you a quote/.test(m.subject));
  assert.ok(quoteMail);
  assert.match(quoteMail.text, /Deposit to book: \$100\.00/);
  assert.match(quoteMail.text, new RegExp(`/request/${token}`));

  // The client books a 3-hour slot from the quote.
  r = await client("GET", `/api/public/requests/${token}`);
  assert.equal(r.body.request.canBook, true);
  assert.equal(r.body.request.quote.durationMin, 180);
  const start = await firstThursdaySlot(client, `/api/public/requests/${token}/availability`);
  r = await client("POST", `/api/public/requests/${token}/book`, { start });
  assert.equal(r.status, 201, r.text);
  const bookingToken = tokenOf(r.body.redirectUrl);
  const booking = db.prepare("SELECT * FROM bookings WHERE public_token = ?").get(bookingToken);
  assert.equal(booking.status, "awaiting_deposit");
  assert.equal(booking.deposit_cents, 10000);
  assert.equal(Date.parse(booking.ends_at) - Date.parse(booking.starts_at), 180 * 60000);
  assert.equal(booking.request_id, req.id);
  assert.match(booking.notes, /moth with a crescent moon/);
  assert.equal((await client("POST", `/api/public/requests/${token}/book`, { start })).status, 409);
  r = await client("GET", `/api/public/requests/${token}`);
  assert.equal(r.body.request.status, "booked");
  assert.equal(r.body.request.booking.token, bookingToken);

  // The hold lapses: the quote still stands, so they can pick a new time.
  db.prepare("UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ?").run(booking.id);
  r = await client("GET", `/api/public/requests/${token}`);
  assert.equal(r.body.request.canBook, true);
  r = await client("POST", `/api/public/requests/${token}/book`, { start });
  assert.equal(r.status, 201, r.text);

  // The service has requests now, so deleting it only hides it.
  r = await artist("DELETE", `/api/services/${consult.id}`);
  assert.equal(r.body.archived, true);
});

test("consultation: decline and withdraw", async () => {
  const { artist } = await setupArtist(ctx, "dex-ink");
  const client = ctx.client();
  const { body: { service } } = await artist("POST", "/api/services", { name: "Custom", durationMin: 120, priceCents: null, depositCents: 5000, mode: "consult" });
  const send = async (email) => tokenOf((await client("POST", "/api/public/artists/dex-ink/requests", {
    serviceId: service.id, name: "Kim", email, idea: "Big back piece with koi and waves",
  })).body.redirectUrl);

  const t1 = await send("kim@example.com");
  const [r1] = (await artist("GET", "/api/requests")).body.requests;
  let r = await artist("POST", `/api/requests/${r1.id}/decline`, { reason: "Not my style, try @someone" });
  assert.equal(r.body.request.status, "declined");
  assert.ok(emailsTo("kim@example.com").some((m) => /Not my style/.test(m.text)));
  assert.equal((await artist("POST", `/api/requests/${r1.id}/quote`, { depositCents: 0, durationMin: 60 })).status, 409);
  assert.equal((await client("GET", `/api/public/requests/${t1}`)).body.request.declineReason, "Not my style, try @someone");
  assert.equal((await artist("GET", "/api/requests?scope=closed")).body.requests.length, 1);

  const t2 = await send("kim2@example.com");
  r = await client("POST", `/api/public/requests/${t2}/withdraw`, {});
  assert.equal(r.body.request.status, "withdrawn");
  assert.equal((await client("POST", `/api/public/requests/${t2}/withdraw`, {})).status, 409);

  // Another artist can't touch these.
  const { artist: other } = await setupArtist(ctx, "eve-ink");
  assert.equal((await other("POST", `/api/requests/${r1.id}/decline`, {})).status, 404);
});

test("books closed: no new bookings, waitlist, books-open email, leave link", async () => {
  const { artist, service } = await setupArtist(ctx, "fay-ink");
  const client = ctx.client();

  let r = await artist("PATCH", "/api/me", { booksOpen: false, booksClosedMessage: "Back in November!" });
  assert.equal(r.body.artist.booksOpen, false);
  r = await client("GET", "/api/public/artists/fay-ink");
  assert.equal(r.body.artist.booksOpen, false);
  assert.equal(r.body.artist.booksClosedMessage, "Back in November!");
  const start = await firstThursdaySlot(client, `/api/public/artists/fay-ink/availability?service=${service.id}`);
  r = await client("POST", "/api/public/artists/fay-ink/bookings", { serviceId: service.id, start, name: "A", email: "a@example.com" });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /books are closed/);

  assert.equal((await client("POST", "/api/public/artists/fay-ink/waitlist", { email: "bad" })).status, 400);
  assert.equal((await client("POST", "/api/public/artists/fay-ink/waitlist", { email: "Lee@Example.com", name: "Lee" })).status, 201);
  assert.equal((await client("POST", "/api/public/artists/fay-ink/waitlist", { email: "lee@example.com" })).status, 201);
  assert.equal((await client("POST", "/api/public/artists/fay-ink/waitlist", { email: "sam@example.com" })).status, 201);
  r = await artist("GET", "/api/waitlist");
  assert.equal(r.body.entries.length, 2);
  assert.equal(r.body.entries.find((w) => w.email === "lee@example.com").name, "Lee");
  assert.equal((await artist("GET", "/api/bookings/stats")).body.waitlist, 2);

  // Without an email service there's nothing to send with.
  assert.equal((await artist("POST", "/api/waitlist/notify", {})).status, 400);
  process.env.RESEND_API_KEY = "test";
  try {
    r = await artist("POST", "/api/waitlist/notify", {});
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Open your books/);
    await artist("PATCH", "/api/me", { booksOpen: true });
    r = await artist("POST", "/api/waitlist/notify", { message: "Flash day on the 13th" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.sent, 2);
    assert.equal((await artist("POST", "/api/waitlist/notify", {})).status, 429);
  } finally {
    delete process.env.RESEND_API_KEY;
  }
  const mail = emailsTo("lee@example.com").find((m) => /books are open/.test(m.subject));
  assert.ok(mail);
  assert.match(mail.text, /Hi Lee/);
  assert.match(mail.text, /Flash day on the 13th/);
  const leave = /\/waitlist\/leave\/([\w-]+)/.exec(mail.text)[1];

  r = await client("GET", `/api/public/waitlist/${leave}`);
  assert.equal(r.body.email, "lee@example.com");
  assert.equal((await client("POST", `/api/public/waitlist/${leave}/leave`, {})).status, 200);
  assert.equal((await client("GET", `/api/public/waitlist/${leave}`)).status, 404);
  assert.equal((await artist("GET", "/api/waitlist")).body.entries.length, 1);
  assert.equal((await client("GET", `/waitlist/leave/${leave}`)).status, 200);

  // Open again: booking works.
  r = await client("POST", "/api/public/artists/fay-ink/bookings", { serviceId: service.id, start, name: "A", email: "a@example.com" });
  assert.equal(r.status, 201, r.text);
});

test("consent form: sign before the appointment, artist gets a printable record", async () => {
  const { artist, service } = await setupArtist(ctx, "gus-ink");
  const client = ctx.client();
  await artist("PATCH", "/api/me", { consentEnabled: true, consentStatements: ["I am 18 or older.", "  ", "I have no allergies I haven't mentioned."] });
  let me = (await artist("GET", "/api/me")).body.artist;
  assert.deepEqual(me.consentStatements, ["I am 18 or older.", "I have no allergies I haven't mentioned."]);

  const start = await firstThursdaySlot(client, `/api/public/artists/gus-ink/availability?service=${service.id}`);
  let r = await client("POST", "/api/public/artists/gus-ink/bookings", { serviceId: service.id, start, name: "Ana", email: "ana@example.com" });
  const token = tokenOf(r.body.redirectUrl);
  r = await client("GET", `/api/public/bookings/${token}`);
  assert.equal(r.body.booking.consent.signed, false);
  assert.equal(r.body.booking.consent.form.statements.length, 2);
  assert.match(r.body.booking.consent.form.intro, /permanent/);

  const sign = (body) => client("POST", `/api/public/bookings/${token}/consent`, {
    legalName: "Ana María Ruiz", dateOfBirth: "1995-04-02", medicalNotes: "None", agreed: true, signature: PNG, ...body,
  });
  const minor = new Date(Date.now() - 17 * 365 * 86400000).toISOString().slice(0, 10);
  assert.equal((await sign({ dateOfBirth: minor })).status, 400);
  assert.equal((await sign({ agreed: false })).status, 400);
  assert.equal((await sign({ legalName: "" })).status, 400);
  assert.equal((await sign({ signature: "data:image/jpeg;base64,/9j/4AAQ" })).status, 400);
  r = await sign({});
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.booking.consent.signed, true);
  assert.equal(r.body.booking.consent.legalName, "Ana María Ruiz");
  assert.equal((await sign({})).status, 409);

  r = await artist("GET", "/api/bookings?scope=action");
  const b = r.body.bookings[0];
  assert.equal(b.consentSigned, true);
  r = await artist("GET", `/app/consent/${b.id}`);
  assert.equal(r.status, 200);
  assert.match(r.text, /Ana María Ruiz/);
  assert.match(r.text, /I have no allergies/);
  r = await artist("GET", `/api/bookings/${b.id}/consent/signature`);
  assert.equal(r.headers.get("content-type"), "image/png");

  // Nobody else can see it.
  const { artist: other } = await setupArtist(ctx, "hal-ink");
  assert.equal((await other("GET", `/api/bookings/${b.id}/consent/signature`)).status, 404);
  assert.equal((await other("GET", `/app/consent/${b.id}`)).status, 404);
  const anon = ctx.client();
  assert.equal((await anon("GET", `/app/consent/${b.id}`)).status, 302);
});

test("confirmation email asks for the consent form; aftercare goes out after the appointment", async () => {
  const { artist, service } = await setupArtist(ctx, "ivy-ink");
  const client = ctx.client();
  await artist("PATCH", "/api/me", { consentEnabled: true, aftercareEnabled: true, aftercareText: "Keep it clean!", reviewUrl: "https://g.page/r/ivy" });
  assert.equal((await artist("PATCH", "/api/me", { reviewUrl: "javascript:alert(1)" })).status, 400);

  const start = await firstThursdaySlot(client, `/api/public/artists/ivy-ink/availability?service=${service.id}`);
  let r = await client("POST", "/api/public/artists/ivy-ink/bookings", { serviceId: service.id, start, name: "Bo", email: "bo@example.com" });
  const token = tokenOf(r.body.redirectUrl);
  const { body: { bookings: [b] } } = await artist("GET", "/api/bookings?scope=action");
  await artist("POST", `/api/bookings/${b.id}/confirm-deposit`, {});
  const confirm = emailsTo("bo@example.com").find((m) => /You're booked/.test(m.subject));
  assert.match(confirm.text, /consent form/);

  // Pretend the appointment happened four hours ago.
  const end = new Date(Date.now() - 4 * 3600000);
  db.prepare("UPDATE bookings SET starts_at = ?, ends_at = ? WHERE id = ?").run(new Date(end - 2 * 3600000).toISOString(), end.toISOString(), b.id);
  const { sendAftercare } = require("../src/jobs/scheduler");
  assert.equal(await sendAftercare(), 1);
  assert.equal(await sendAftercare(), 0);
  const mail = emailsTo("bo@example.com").find((m) => /Aftercare/.test(m.subject));
  assert.match(mail.text, /Keep it clean!/);
  assert.match(mail.text, /g\.page\/r\/ivy/);

  r = await client("GET", `/api/public/bookings/${token}`);
  assert.equal(r.body.booking.aftercare.text, "Keep it clean!");
  assert.equal(r.body.booking.consent, null);
});
