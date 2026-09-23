const express = require("express");
const { db } = require("../db");
const { calendar } = require("../lib/ics");
const { OCCUPYING } = require("../lib/slots");
const { baseUrl, money } = require("../lib/util");

// A private feed artists subscribe to from Google or Apple Calendar, so every
// booking shows up on their phone. The unguessable token is the only key.
const router = express.Router();

router.get("/cal/:file", (req, res, next) => {
  const token = req.params.file.replace(/\.ics$/, "");
  const a = token && db.prepare("SELECT * FROM artists WHERE calendar_token = ?").get(token);
  if (!a) return next();

  const now = new Date().toISOString();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const rows = db.prepare(`SELECT * FROM bookings WHERE artist_id = ? AND ends_at > ? AND ${OCCUPYING} ORDER BY starts_at`)
    .all(a.id, since, now);

  const events = rows.map((b) => {
    const pending = b.status === "awaiting_deposit";
    return {
      uid: `${b.public_token}@slotlock`,
      start: b.starts_at,
      end: b.ends_at,
      summary: `${pending ? "[Deposit pending] " : ""}${b.service_name}: ${b.client_name}`,
      location: a.location,
      status: pending ? "TENTATIVE" : "CONFIRMED",
      description: [
        `Client: ${b.client_name}`, `Email: ${b.client_email}`,
        b.client_phone && `Phone: ${b.client_phone}`,
        b.client_instagram && `Instagram: @${b.client_instagram}`,
        b.deposit_cents && `Deposit: ${money(b.deposit_cents, b.currency)} (${b.deposit_paid ? "received" : "pending"}, ref ${b.ref_code})`,
        b.notes && `\nNotes: ${b.notes}`,
        b.reference_url && `Reference: ${b.reference_url}`,
        `\n${baseUrl()}/app#bookings`,
      ].filter(Boolean).join("\n"),
    };
  });

  res.set("Cache-Control", "private, max-age=300");
  res.type("text/calendar; charset=utf-8").send(calendar({ name: `Slotlock: ${a.display_name}`, events }));
});

module.exports = router;
