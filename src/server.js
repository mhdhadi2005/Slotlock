require("dotenv").config();
const express = require("express");
const path = require("path");
const { initSchema } = require("./db");

initSchema();
if (process.env.SEED_DEMO === "1") require("./seed-demo").ensureDemo();

const auth = require("./lib/auth");
const { router: authRoutes } = require("./routes/auth");
const artistRoutes = require("./routes/artist");
const { router: publicRoutes, artistByHandle } = require("./routes/public");
const { router: stripeRoutes, webhookRouter } = require("./routes/stripe");
const { startScheduler } = require("./jobs/scheduler");

const PUBLIC = path.join(__dirname, "..", "public");
const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC, file));

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

// Webhook first: it needs the raw body, before express.json() consumes it.
app.use(webhookRouter);
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

app.use(authRoutes);
app.use(artistRoutes);
app.use(publicRoutes);
app.use(stripeRoutes);

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

app.use(express.static(PUBLIC, { index: false, extensions: [] }));
app.get("/", page("index.html"));
app.get("/signup", page("auth.html"));
app.get("/login", page("auth.html"));
app.get("/app", page("app.html"));
app.get("/booking/:token", page("booking.html"));
app.get("/:handle", (req, res, next) => {
  if (!artistByHandle(req.params.handle)) return next();
  page("book.html")(req, res);
});
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, "404.html")));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const message = status < 500 ? err.message : "Something went wrong. Please try again.";
  if (req.path.startsWith("/api")) return res.status(status).json({ error: message });
  res.status(status).send(message);
});

const PORT = process.env.PORT || 3002;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Slotlock listening on :${PORT}`));
  startScheduler();
}

module.exports = app;
