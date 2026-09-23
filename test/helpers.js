// Every test file gets its own throwaway database and demo mode (no Stripe).
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slotlock-test-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.NODE_ENV = "test";
process.env.DISABLE_SCHEDULER = "1";
delete process.env.STRIPE_SECRET_KEY;
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
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, body: json, text, headers: res.headers };
    };
  }
  return { server, base, client };
}

module.exports = { startServer };
