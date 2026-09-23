require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const { methodHref, normalizeMethods, methodsForBooking } = require("../src/lib/payments");

const ctx = { amountCents: 5000, currency: "usd", ref: "K7QXM", payee: "Rosa" };

test("payment links prefill the amount where the app supports it", () => {
  assert.equal(methodHref({ type: "paypal", value: "rosa" }, ctx), "https://paypal.me/rosa/50USD");
  assert.equal(methodHref({ type: "paypal", value: "rosa" }, { ...ctx, currency: "lkr" }), "https://paypal.me/rosa");
  assert.equal(methodHref({ type: "cashapp", value: "rosa" }, ctx), "https://cash.app/$rosa/50");
  assert.equal(methodHref({ type: "cashapp", value: "rosa" }, { ...ctx, amountCents: 2550 }), "https://cash.app/$rosa/25.50");
  assert.equal(methodHref({ type: "venmo", value: "rosa" }, ctx), "https://venmo.com/u/rosa");
  assert.equal(methodHref({ type: "monzo", value: "rosa" }, { ...ctx, currency: "gbp" }), "https://monzo.me/rosa/50?d=K7QXM");
  assert.equal(methodHref({ type: "upi", value: "rosa@okaxis" }, { ...ctx, currency: "inr" }), "upi://pay?pa=rosa%40okaxis&pn=Rosa&tn=K7QXM&am=50&cu=INR");
  assert.equal(methodHref({ type: "link", value: "https://buy.stripe.com/x" }, ctx), "https://buy.stripe.com/x");
  assert.equal(methodHref({ type: "zelle", value: "a@b.co" }, ctx), null);
  assert.equal(methodHref({ type: "bank", value: "IBAN" }, ctx), null);
});

test("handles are cleaned from whatever gets pasted", () => {
  const values = normalizeMethods([
    { type: "paypal", value: "https://www.paypal.com/paypalme/RosaV" },
    { type: "venmo", value: "https://account.venmo.com/u/rosa-v" },
    { type: "cashapp", value: "cash.app/$rosav" },
    { type: "revolut", value: "@rosav" },
  ]).map((m) => m.value);
  assert.deepEqual(values, ["RosaV", "rosa-v", "rosav", "rosav"]);
});

test("demo pages never get payment links", () => {
  const out = methodsForBooking([{ type: "paypal", value: "rosa" }, { type: "link", value: "https://x.example" }], { ...ctx, demo: true });
  assert.ok(out.every((m) => m.href === null));
  assert.equal(out[0].display, "paypal.me/rosa");
});
