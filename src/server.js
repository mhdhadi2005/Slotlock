require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { initSchema } = require("./db");

initSchema();

const auth = require("./lib/auth");
const { emailEnabled } = require("./lib/email");
const { publicTypes, MAX_METHODS } = require("./lib/payments");
const { CURRENCIES, THEMES, baseUrl, billingEnabled, escapeHtml } = require("./lib/util");
const { router: authRoutes } = require("./routes/auth");
const artistRoutes = require("./routes/artist");
const { router: publicRoutes, artistByHandle } = require("./routes/public");
const { router: billingRoutes, webhookRouter } = require("./routes/billing");
const imageRoutes = require("./routes/images");
const calendarRoutes = require("./routes/calendar");
const { startScheduler } = require("./jobs/scheduler");
const { seedDemo } = require("./seed-demo");

// The example page the landing page links to. Rebuilt on every boot so it
// always works; set DISABLE_DEMO=1 to skip it.
if (process.env.DISABLE_DEMO !== "1") seedDemo();

const PUBLIC = path.join(__dirname, "..", "public");
const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC, file));

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

const CSP = [
  "default-src 'self'", "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline'",
  "font-src 'self'", "script-src 'self'", "connect-src 'self'", "object-src 'none'",
  "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", CSP);
  next();
});

// Webhook first: it needs the raw body, before express.json() consumes it.
app.use(webhookRouter);
// Image uploads arrive as data URLs, so they get a bigger limit than the rest.
app.use("/api/images", express.json({ limit: "4mb" }));
app.use(express.json({ limit: "100kb" }));
app.use(auth.attachArtist);

// CSRF guard: the session cookie is SameSite=Lax, and API writes must be JSON,
// which a cross-site <form> can't send without a CORS preflight. Forms can't
// send DELETE at all, so body-less deletes are fine.
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH"].includes(req.method) && !req.is("application/json")) {
    return res.status(415).json({ error: "Expected application/json." });
  }
  next();
});

// What the frontend needs to know about this server.
app.get("/api/config", (req, res) => {
  res.json({
    billingEnabled: billingEnabled(),
    emailEnabled: emailEnabled(),
    trialDays: Number(process.env.TRIAL_DAYS || 14),
    paymentTypes: publicTypes(),
    maxPaymentMethods: MAX_METHODS,
    currencies: CURRENCIES,
    themes: THEMES,
  });
});

app.use(authRoutes);
app.use(artistRoutes);
app.use(publicRoutes);
app.use(billingRoutes);
app.use(imageRoutes);
app.use(calendarRoutes);

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

app.use(express.static(PUBLIC, { index: false, extensions: [], maxAge: "1h" }));
const landingTemplate = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
app.get("/", (req, res) => res.type("html").send(landingTemplate.replaceAll("{{base}}", escapeHtml(baseUrl()))));
app.get(["/signup", "/login", "/forgot", "/reset/:token"], page("auth.html"));
app.get("/app", page("app.html"));
app.get("/booking/:token", page("booking.html"));

// Artist pages get real <title> and Open Graph tags, so a link pasted into an
// Instagram DM or WhatsApp previews as "Book with Rosa Vega Tattoo".
const bookTemplate = fs.readFileSync(path.join(PUBLIC, "book.html"), "utf8");
app.get("/:handle", (req, res, next) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return next();
  const fill = {
    title: `Book with ${a.display_name}`,
    description: (a.bio || `Pick a time and book ${a.display_name} online.`).replace(/\s+/g, " ").slice(0, 200),
    image: a.avatar_image_id ? `${baseUrl()}/img/${a.avatar_image_id}` : `${baseUrl()}/og.png`,
    url: `${baseUrl()}/${a.handle}`,
  };
  res.type("html").send(bookTemplate.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in fill ? escapeHtml(fill[key]) : m)));
});

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, "404.html")));

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status < 500 ? err.message : "Something went wrong. Please try again.";
  if (req.path.startsWith("/api")) return res.status(status).json({ error: message });
  res.status(status).send(message);
});

const PORT = process.env.PORT || 3002;
if (require.main === module) {
  if (process.env.NODE_ENV === "production" && baseUrl().includes("localhost")) {
    console.warn(`WARNING: BASE_URL is not set, so links in emails and the dashboard point at ${baseUrl()}. ` +
      "Set BASE_URL to the site's public address, e.g. https://yourapp.up.railway.app");
  }
  app.listen(PORT, () => console.log(`Slotlock listening on :${PORT}`));
  startScheduler();
}

module.exports = app;
