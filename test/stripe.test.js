require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { verifyWebhook, encodeForm } = require("../src/lib/stripe");

const secret = "whsec_test";
const sign = (body, t, s = secret) =>
  `t=${t},v1=${crypto.createHmac("sha256", s).update(`${t}.${body}`).digest("hex")}`;

test("accepts a correctly signed webhook", () => {
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const t = Math.floor(Date.now() / 1000);
  assert.equal(verifyWebhook(Buffer.from(body), sign(body, t), secret).id, "evt_1");
});

test("rejects wrong secret, tampered body and stale timestamp", () => {
  const body = JSON.stringify({ id: "evt_1" });
  const t = Math.floor(Date.now() / 1000);
  assert.throws(() => verifyWebhook(Buffer.from(body), sign(body, t, "whsec_other"), secret), /mismatch/);
  assert.throws(() => verifyWebhook(Buffer.from(body + " "), sign(body, t), secret), /mismatch/);
  assert.throws(() => verifyWebhook(Buffer.from(body), sign(body, t - 3600), secret), /too old/);
  assert.throws(() => verifyWebhook(Buffer.from(body), "garbage", secret), /Malformed/);
});

test("form encoding uses Stripe's bracket syntax", () => {
  const out = encodeForm({ mode: "payment", line_items: [{ price_data: { unit_amount: 5000 } }], skip: undefined }).toString();
  assert.equal(decodeURIComponent(out), "mode=payment&line_items[0][price_data][unit_amount]=5000");
});
