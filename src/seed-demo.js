// The public example page at /demo that the landing page links to. Rebuilt
// on every boot (server.js), so it always exists and always shows the
// current feature set. Run by hand with: npm run seed
require("dotenv").config();
const { db, initSchema } = require("./db");
const { hashPassword } = require("./lib/auth");
const { randomToken } = require("./lib/ids");

const HANDLE = "demo";
const DEMO_EMAIL = "demo@slotlock.invalid";

// ---- Flash-sheet artwork for the demo portfolio (drawn in code, so no
// photos of anyone's real work are involved) --------------------------------

const PAPER = "#efe7d8";
const INK = "#1c1814";
const RED = "#c8452c";
const n = (v) => Number(v.toFixed(1));

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${PAPER}"/>` +
  `<g fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

const sparkle = (cx, cy, r) =>
  `<path d="M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z" fill="${INK}" stroke="none"/>`;

function sunMoon() {
  const rays = [];
  for (let i = 0; i < 16; i++) {
    const t = (i * Math.PI) / 8;
    const r2 = i % 2 ? 118 : 140;
    rays.push(`<line x1="${n(200 + 94 * Math.cos(t))}" y1="${n(200 + 94 * Math.sin(t))}" x2="${n(200 + r2 * Math.cos(t))}" y2="${n(200 + r2 * Math.sin(t))}"/>`);
  }
  return svg(`<circle cx="200" cy="200" r="78"/>
    <path d="M230 152 A52 52 0 1 0 230 248 A60 60 0 0 1 230 152 Z" fill="${RED}" stroke-width="4"/>
    ${rays.join("")}${sparkle(66, 66, 14)}${sparkle(334, 84, 10)}${sparkle(326, 334, 16)}${sparkle(78, 322, 9)}`);
}

function mandala() {
  const petals = (count, len, width, offset, extra = "") => Array.from({ length: count }, (_, i) =>
    `<path d="M200 200 Q${200 + width} ${200 - len / 2} 200 ${200 - len} Q${200 - width} ${200 - len / 2} 200 200 Z" transform="rotate(${offset + (i * 360) / count} 200 200)" ${extra}/>`).join("");
  const dots = Array.from({ length: 24 }, (_, i) => {
    const t = (i * Math.PI) / 12;
    return `<circle cx="${n(200 + 152 * Math.cos(t))}" cy="${n(200 + 152 * Math.sin(t))}" r="4" fill="${INK}" stroke="none"/>`;
  }).join("");
  return svg(`<circle cx="200" cy="200" r="134"/><circle cx="200" cy="200" r="122" stroke-dasharray="1 11" stroke-width="4"/>
    ${petals(8, 118, 34, 0)}${petals(8, 84, 22, 22.5, `fill="${RED}"`)}
    <circle cx="200" cy="200" r="26" fill="${PAPER}"/><circle cx="200" cy="200" r="9" fill="${INK}"/>${dots}`);
}

function sprig() {
  const leaf = (x, y, angle, size = 1) =>
    `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${size})"><path d="M0 0 Q24 -15 52 0 Q24 15 0 0 Z"/><path d="M5 0 L42 0" stroke-width="3"/></g>`;
  return svg(`<path d="M200 352 C188 292 214 232 200 172 S186 94 206 52"/>
    ${leaf(197, 312, 205)}${leaf(199, 284, -28)}${leaf(201, 246, 208, 0.95)}${leaf(203, 214, -32, 0.95)}
    ${leaf(199, 180, 212, 0.85)}${leaf(196, 146, -38, 0.85)}${leaf(195, 114, 218, 0.72)}${leaf(199, 86, -45, 0.7)}
    <circle cx="206" cy="46" r="8" fill="${RED}"/>${sparkle(118, 104, 11)}${sparkle(292, 318, 13)}`);
}

function dagger() {
  return svg(`<path d="M200 354 L180 178 L220 178 Z" fill="${PAPER}"/><path d="M200 338 L200 188" stroke-width="3"/>
    <rect x="140" y="160" width="120" height="18" rx="9" fill="${RED}"/>
    <circle cx="134" cy="169" r="9"/><circle cx="266" cy="169" r="9"/>
    <rect x="188" y="92" width="24" height="68" rx="6"/>
    <path d="M188 108 L212 122 M188 124 L212 138 M188 140 L212 154" stroke-width="3"/>
    <circle cx="200" cy="78" r="14" fill="${INK}"/>${sparkle(118, 252, 14)}${sparkle(290, 282, 10)}${sparkle(284, 96, 12)}`);
}

function eye() {
  // Lashes along the top lid: sample the lid curve, step outward along its normal.
  const lashes = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.2 + i * 0.1;
    const x = (1 - t) ** 2 * 96 + 2 * (1 - t) * t * 200 + t ** 2 * 304;
    const y = (1 - t) ** 2 * 200 + 2 * (1 - t) * t * 106 + t ** 2 * 200;
    const dx = 2 * (1 - t) * 104 + 2 * t * 104;
    const dy = 2 * (1 - t) * -94 + 2 * t * 94;
    const len = Math.hypot(dx, dy);
    lashes.push(`<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + (dy / len) * 22)}" y2="${n(y - (dx / len) * 22)}"/>`);
  }
  const rays = Array.from({ length: 12 }, (_, i) => {
    const t = (i * Math.PI) / 6 + Math.PI / 12;
    return `<line x1="${n(200 + 128 * Math.cos(t))}" y1="${n(200 + 128 * Math.sin(t))}" x2="${n(200 + 146 * Math.cos(t))}" y2="${n(200 + 146 * Math.sin(t))}" stroke-width="4"/>`;
  }).join("");
  return svg(`<path d="M96 200 Q200 106 304 200 Q200 294 96 200 Z"/>${lashes.join("")}
    <circle cx="200" cy="200" r="40"/><circle cx="200" cy="200" r="16" fill="${INK}"/>
    <circle cx="211" cy="190" r="6" fill="${PAPER}" stroke="none"/>
    <path d="M200 266 C191 280 191 292 200 294 C209 292 209 280 200 266 Z" fill="${RED}" stroke-width="4"/>${rays}`);
}

function moth() {
  const wing = `<path d="M210 178 C250 120 330 116 334 170 C338 214 276 224 212 206 Z"/>
    <path d="M210 214 C256 222 300 246 284 290 C270 326 232 296 208 242 Z"/>
    <circle cx="282" cy="172" r="16" fill="${RED}" stroke-width="4"/><circle cx="282" cy="172" r="5" fill="${INK}" stroke="none"/>
    <path d="M224 238 C250 250 266 262 266 282" stroke-width="3"/>
    <path d="M205 144 C214 118 230 104 250 100"/><circle cx="252" cy="99" r="4" fill="${INK}"/>`;
  return svg(`${wing}<g transform="translate(400 0) scale(-1 1)">${wing}</g>
    <ellipse cx="200" cy="210" rx="11" ry="50" fill="${INK}"/><circle cx="200" cy="152" r="11" fill="${INK}"/>
    <path d="M191 200 L209 200 M191 216 L209 216 M192 232 L208 232" stroke="${PAPER}" stroke-width="3"/>
    <path d="M200 30 A26 26 0 1 0 200 82 A30 30 0 0 1 200 30 Z" fill="${INK}" stroke-width="3"/>
    <circle cx="176" cy="348" r="4" fill="${INK}"/><circle cx="200" cy="352" r="4" fill="${INK}"/><circle cx="224" cy="348" r="4" fill="${INK}"/>`);
}

const ARTWORK = [moth, sunMoon, sprig, dagger, eye, mandala];

// ---------------------------------------------------------------------------

function seedDemo() {
  const existing = db.prepare("SELECT id, email FROM artists WHERE handle = ?").get(HANDLE);
  if (existing && existing.email !== DEMO_EMAIL) {
    console.warn(`[demo] /${HANDLE} belongs to a real account, so the example page was not created.`);
    return false;
  }

  const now = new Date();
  db.exec("BEGIN");
  try {
    if (existing) {
      for (const table of ["requests", "waitlist", "bookings", "images", "services", "availability", "blocked_dates", "sessions", "password_resets"]) {
        db.prepare(`DELETE FROM ${table} WHERE artist_id = ?`).run(existing.id);
      }
      db.prepare("DELETE FROM artists WHERE id = ?").run(existing.id);
    }

    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO artists (email, password_hash, handle, display_name, bio, location, instagram, timezone,
        policy, payment_methods, payment_note, hold_hours, theme, calendar_token, is_demo,
        consent_enabled, aftercare_enabled, subscription_status, trial_ends_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 24, 'vermilion', ?, 1, 1, 1, 'comped', ?, ?)
    `).run(
      DEMO_EMAIL, hashPassword(randomToken()), HANDLE, "Rosa Vega Tattoo",
      "Fine line, botanical and blackwork. Custom pieces and flash.\nBooks open for October and November.",
      "Needle & Rose Studio, Mission District, San Francisco", "rosavega.tattoo",
      "America/Los_Angeles",
      "Your deposit comes off the final price of your tattoo.\n" +
      "Cancel or reschedule at least 48 hours ahead and you'll get it back.\n" +
      "Late cancellations and no-shows lose the deposit.",
      JSON.stringify([
        { type: "paypal", value: "rosavega-demo" },
        { type: "venmo", value: "rosavega-demo" },
        { type: "cashapp", value: "rosavegademo" },
        { type: "zelle", value: "bookings@rosavega.example" },
      ]),
      "Put your name and the reference code in the payment note so I can match it to your booking.",
      randomToken(24), new Date(now.getTime() + 3650 * 86400000).toISOString(), now.toISOString(),
    );

    const svc = db.prepare(`INSERT INTO services (artist_id, name, description, duration_min, price_cents, deposit_cents, mode, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    svc.run(id, "Flash piece", "Pick any design from my flash sheets. Up to palm size.", 60, 15000, 5000, "book", 1);
    svc.run(id, "Small custom", "A custom design up to about 4 inches. Add your references when you book.", 120, 30000, 7500, "book", 2);
    svc.run(id, "Custom project", "Something bigger or personal? Send me your idea and references and I'll reply with a quote.", 180, null, 10000, "consult", 3);
    svc.run(id, "Half-day session", "Larger custom work, or continuing a piece we've started.", 240, 60000, 10000, "book", 4);

    const hours = db.prepare("INSERT INTO availability (artist_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)");
    for (const wd of [2, 3, 4, 5, 6]) hours.run(id, wd, 11 * 60, 19 * 60);

    const img = db.prepare(`INSERT INTO images (artist_id, kind, mime, data, sort_order, created_at)
      VALUES (?, 'portfolio', 'image/svg+xml', ?, ?, ?)`);
    ARTWORK.forEach((draw, i) => img.run(id, Buffer.from(draw()), i + 1, now.toISOString()));

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return true;
}

if (require.main === module) {
  initSchema();
  if (seedDemo()) console.log(`Demo artist ready at /${HANDLE}`);
}

module.exports = { seedDemo, HANDLE, ARTWORK };
