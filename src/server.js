require("dotenv").config();
const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { initSchema, db } = require("./db");

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
const { seedBeautyDemo } = require("./seed-beauty-demo");
const forms = require("./lib/forms");
const { publicBusiness, LOOKS } = require("./lib/business");

// The example page the landing page links to. Rebuilt on every boot so it
// always works; set DISABLE_DEMO=1 to skip it.
if (process.env.DISABLE_DEMO !== "1") { seedDemo(); seedBeautyDemo(); }

const PUBLIC = path.join(__dirname, "..", "public");

// Script and stylesheet URLs carry a version that changes whenever those files
// do, so a browser never runs yesterday's cached common.js with today's pages.
const ASSET_VERSION = (() => {
  const hash = crypto.createHash("sha1");
  for (const f of fs.readdirSync(PUBLIC).filter((name) => /\.(js|css)$/.test(name)).sort()) hash.update(fs.readFileSync(path.join(PUBLIC, f)));
  return hash.digest("hex").slice(0, 10);
})();
const versioned = (html) => html.replace(/(src|href)="\/([\w-]+\.(?:js|css))"/g, `$1="/$2?v=${ASSET_VERSION}"`);
const page = (file) => {
  const html = versioned(fs.readFileSync(path.join(PUBLIC, file), "utf8"));
  return (req, res) => res.type("html").send(html);
};

// Pages render in their artist's look (Ink, Blush or Latte) from the first
// paint, so a pink page never flashes dark while it loads.
const LOOK_VALUES = new Set(["blush", "latte"]);
const withLook = (html, look) => (LOOK_VALUES.has(look) ? html.replace('<html lang="en">', `<html lang="en" data-look="${look}">`) : html);
const lookOfBookingToken = (t) => db.prepare("SELECT a.look FROM bookings b JOIN artists a ON a.id = b.artist_id WHERE b.public_token = ?").get(String(t))?.look;
const lookOfRequestToken = (t) => db.prepare("SELECT a.look FROM requests r JOIN artists a ON a.id = r.artist_id WHERE r.public_token = ?").get(String(t))?.look;
const template = (file) => versioned(fs.readFileSync(path.join(PUBLIC, file), "utf8"));

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
// Up to four reference photos with a consultation request, and a drawn signature.
app.use("/api/public/artists/:handle/requests", express.json({ limit: "8mb" }));
app.use("/api/public/bookings/:token/consent", express.json({ limit: "1mb" }));
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
    formTemplates: {
      consentIntro: forms.CONSENT_INTRO, consentStatements: forms.CONSENT_STATEMENTS,
      aftercareText: forms.AFTERCARE_TEXT, maxStatements: forms.MAX_STATEMENTS,
    },
    business: publicBusiness(),
    looks: LOOKS,
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
const landingTemplate = template("index.html");
app.get("/", (req, res) => res.type("html").send(landingTemplate.replaceAll("{{base}}", escapeHtml(baseUrl()))));
const beautyTemplate = template("beauty.html");
app.get("/beauty", (req, res) => res.type("html").send(beautyTemplate.replaceAll("{{base}}", escapeHtml(baseUrl()))));
app.get(["/signup", "/login", "/forgot", "/reset/:token"], page("auth.html"));
const appTemplate = template("app.html");
const bookingTemplate = template("booking.html");
app.get("/app", (req, res) => res.type("html").send(withLook(appTemplate, req.artist?.look)));
app.get("/booking/:token", (req, res) => res.type("html").send(withLook(bookingTemplate, lookOfBookingToken(req.params.token))));
app.get("/waitlist/leave/:token", page("leave.html"));

// Artist pages get real <title> and Open Graph tags, so a link pasted into an
// Instagram DM or WhatsApp previews as "Book with Rosa Vega Tattoo".
const bookTemplate = template("book.html");
const fillBook = (vals) => bookTemplate.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vals ? escapeHtml(vals[key]) : m));
// A consultation request's page: the same booking page, in request mode.
app.get("/request/:token", (req, res) => {
  res.type("html").send(withLook(fillBook({
    title: "Your request", description: "Check on your request and book your quote.",
    image: `${baseUrl()}/og.png`, url: `${baseUrl()}/request/${req.params.token}`,
  }).replace("<head>", '<head>\n  <meta name="robots" content="noindex">'), lookOfRequestToken(req.params.token)));
});
app.get("/:handle", (req, res, next) => {
  const a = artistByHandle(req.params.handle);
  if (!a) return next();
  const fill = {
    title: `Book with ${a.display_name}`,
    description: (a.bio || `Pick a time and book ${a.display_name} online.`).replace(/\s+/g, " ").slice(0, 200),
    image: a.avatar_image_id ? `${baseUrl()}/img/${a.avatar_image_id}` : `${baseUrl()}/og.png`,
    url: `${baseUrl()}/${a.handle}`,
  };
  res.type("html").send(withLook(fillBook(fill), a.look));
});

const notFoundPage = template("404.html");
app.use((req, res) => res.status(404).type("html").send(notFoundPage));

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
