// A second example page, for beauty pros: /demo-beauty, a nail and lash
// studio in the Blush look. Rebuilt on every boot like /demo.
const { db } = require("./db");
const { hashPassword } = require("./lib/auth");
const { randomToken } = require("./lib/ids");
const { BUSINESS } = require("./lib/business");

const HANDLE = "demo-beauty";
const DEMO_EMAIL = "demo-beauty@slotlock.invalid";

// ---- Nail, lash and brow artwork, drawn in code -------------------------------

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${body}</svg>`;

function nails(bg, fill, deco = () => "", tip = null) {
  const xs = [70, 130, 190, 250, 310], hs = [150, 190, 205, 190, 150];
  return svg(`<rect width="400" height="400" fill="${bg}"/>` + xs.map((x, i) => {
    const hgt = hs[i], y = 330 - hgt, w = 50;
    const path = `M${x - w / 2} 330 L${x - w / 2} ${y + 34} Q${x - w / 2} ${y} ${x} ${y - 6} Q${x + w / 2} ${y} ${x + w / 2} ${y + 34} L${x + w / 2} 330 Z`;
    return `<clipPath id="c${i}"><path d="${path}"/></clipPath><path d="${path}" fill="${fill}"/>` +
      `<g clip-path="url(#c${i})">${tip ? `<path d="M${x - 40} ${y + 30} Q${x} ${y + 52} ${x + 40} ${y + 30} L${x + 40} ${y - 20} L${x - 40} ${y - 20} Z" fill="${tip}"/>` : ""}${deco(x, y, i)}</g>` +
      `<path d="M${x - 12} ${y + 30} Q${x - 14} ${y + 70} ${x - 10} ${y + 110}" stroke="#fff" stroke-opacity=".55" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  }).join(""));
}
const heart = (cx, cy, s) => `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 6 C-10 -4 -18 4 -10 12 L0 20 L10 12 C18 4 10 -4 0 6 Z" fill="#e0457f"/>`;
function daisy(cx, cy, r) {
  let out = "";
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, px = (cx + Math.cos(a) * r).toFixed(1), py = (cy + Math.sin(a) * r).toFixed(1);
    out += `<ellipse cx="${px}" cy="${py}" rx="${(r * 0.62).toFixed(1)}" ry="${(r * 0.4).toFixed(1)}" transform="rotate(${(a * 57.3).toFixed(0)} ${px} ${py})" fill="#fff"/>`;
  }
  return out + `<circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="#f7c948"/>`;
}
function lashes() {
  let out = `<rect width="400" height="400" fill="#f8e4ea"/><path d="M70 215 Q200 300 330 215" stroke="#3d1f2c" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  for (let i = 0; i < 19; i++) {
    const t = i / 18, x = 70 + t * 260, y = 215 + Math.sin(t * Math.PI) * 43, len = 40 + Math.sin(t * Math.PI) * 55, a = (t - 0.5) * 1.1;
    out += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} q${(Math.sin(a) * len * 0.5).toFixed(1)} ${(len * 0.55).toFixed(1)} ${(Math.sin(a) * len).toFixed(1)} ${len.toFixed(1)}" stroke="#2a1520" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
  return svg(out + `<path d="M95 150 Q200 110 305 150" stroke="#b98a9a" stroke-width="5" fill="none" stroke-linecap="round" opacity=".5"/>`);
}
function brows() {
  let out = `<rect width="400" height="400" fill="#f3e3d9"/>`;
  for (let i = 0; i < 60; i++) {
    const t = i / 59, x = 70 + t * 260, y = 220 - Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.9) * 70 + (t > 0.8 ? (t - 0.8) * 90 : 0);
    out += `<path d="M${x.toFixed(1)} ${(y + 18).toFixed(1)} l${(10 + t * 6).toFixed(1)} ${(-26 + t * 10).toFixed(1)}" stroke="#5b3a2c" stroke-width="3.2" stroke-linecap="round" opacity="${(0.55 + (i % 3) * 0.15).toFixed(2)}"/>`;
  }
  return svg(out);
}
const chrome = () => nails("#e9c7d3", "url(#g)").replace("<rect", `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#f3d9e4"/><stop offset=".7" stop-color="#e9e3f7"/><stop offset="1" stop-color="#fbeef3"/></linearGradient></defs><rect`);

const ARTWORK = [
  () => nails("#fcd6e2", "#f39bb9", (x, y, i) => daisy(x, y + 55 + (i % 2) * 30, 9)),
  chrome,
  () => nails("#fbe7ea", "#efd3c5", (x, y) => heart(x - 6, y + 40, 1.1) + heart(x + 6, y + 95, 0.8)),
  lashes,
  () => nails("#f9dde5", "#f4c7d2", () => "", "#ffffff"),
  brows,
];

function seedBeautyDemo() {
  const existing = db.prepare("SELECT id, email FROM artists WHERE handle = ?").get(HANDLE);
  if (existing && existing.email !== DEMO_EMAIL) {
    console.warn(`[demo] /${HANDLE} belongs to a real account, so the beauty example page was not created.`);
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
        policy, payment_methods, payment_note, hold_hours, cancel_window_hours, theme, look, business_type, calendar_token, is_demo,
        consent_enabled, aftercare_enabled, subscription_status, trial_ends_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 24, 24, 'rose', 'blush', 'nails', ?, 1, 1, 1, 'comped', ?, ?)
    `).run(
      DEMO_EMAIL, hashPassword(randomToken()), HANDLE, "Glow by Jade",
      "Gel, BIAB & hand-painted nail art. Classic & hybrid lash sets.\nPrivate suite, by appointment.",
      "The Glow Suites, Wicker Park, Chicago", "glowbyjade", "America/Chicago",
      "Your deposit comes off the final price.\nPlease come with bare nails, or add a removal.\nCancel 24 hours ahead to get your deposit back.",
      JSON.stringify([{ type: "venmo", value: "glowbyjade-demo" }, { type: "cashapp", value: "glowbyjadedemo" }, { type: "zelle", value: "hello@glowbyjade.example" }]),
      "Add your name and the reference code in the payment note 💕",
      randomToken(24), new Date(now.getTime() + 3650 * 86400000).toISOString(), now.toISOString(),
    );
    const svc = db.prepare(`INSERT INTO services (artist_id, name, description, duration_min, price_cents, deposit_cents, mode, addons, patch_test_hours, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const services = [
      ...BUSINESS.nails.starters.slice(0, 2),
      BUSINESS.lashes.starters[1],
      { name: "Nail art design", description: "Something special? Send me your inspo and I'll quote it.", durationMin: 120, priceCents: null, depositCents: 2000, mode: "consult" },
    ];
    services.forEach((st, i) => svc.run(id, st.name, st.description, st.durationMin, st.priceCents, st.depositCents, st.mode || "book",
      JSON.stringify(st.addons || []), st.patchTestHours || 0, i + 1));
    const hours = db.prepare("INSERT INTO availability (artist_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)");
    for (const wd of [2, 3, 4, 5, 6]) hours.run(id, wd, 10 * 60, 18 * 60);
    const img = db.prepare(`INSERT INTO images (artist_id, kind, mime, data, sort_order, created_at) VALUES (?, 'portfolio', 'image/svg+xml', ?, ?, ?)`);
    ARTWORK.forEach((draw, i) => img.run(id, Buffer.from(draw()), i + 1, now.toISOString()));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return true;
}

module.exports = { seedBeautyDemo, HANDLE, ARTWORK };
