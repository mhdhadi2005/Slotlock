// Every test file gets its own throwaway database. Emails are captured in
// lib/email's outbox instead of being sent.
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slotlock-test-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.NODE_ENV = "test";
process.env.DISABLE_SCHEDULER = "1";
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_PRICE_ID;
delete process.env.RESEND_API_KEY;

async function startServer() {
  const app = require("../src/server");
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  function client() {
    let cookie = "";
    return async function request(method, url, body) {
      const res = await fetch(base + url, {
        method,
        headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const buf = Buffer.from(await res.arrayBuffer());
      const text = buf.toString("utf8");
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, body: json, text, buf, headers: res.headers };
    };
  }
  return { server, base, client };
}

// Next date that falls on `weekday`, at least 3 days out.
function nextWeekday(weekday) {
  const d = new Date(Date.now() + 3 * 86400000);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Signs up an artist with one deposit service and PayPal set up.
async function setupArtist(ctx, handle, { deposit = 5000, methods = [{ type: "paypal", value: "https://paypal.me/" + handle.replace(/-/g, "") }], timezone = "America/Chicago" } = {}) {
  const artist = ctx.client();
  const r = await artist("POST", "/api/auth/signup", {
    email: `${handle}@example.com`, password: "password123", handle, displayName: handle, timezone,
  });
  if (r.status !== 201) throw new Error(r.text);
  if (methods) await artist("PATCH", "/api/me", { paymentMethods: methods });
  const { body: { service } } = await artist("POST", "/api/services", { name: "Small custom", durationMin: 120, priceCents: 30000, depositCents: deposit });
  return { artist, service };
}

module.exports = { startServer, nextWeekday, setupArtist };
