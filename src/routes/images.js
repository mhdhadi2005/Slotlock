const express = require("express");
const { db } = require("../db");
const { requireAuth } = require("../lib/auth");
const { rateLimit } = require("../lib/util");

const router = express.Router();
const uploadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PORTFOLIO = 12;

// Trust the bytes, not the label: only real JPEG, PNG and WebP files get in.
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// The browser resizes before uploading, so these are small. Sent as a data
// URL in JSON (server.js gives this route a bigger body limit).
router.post("/api/images", requireAuth, uploadLimiter, (req, res) => {
  const kind = req.body.kind;
  if (!["avatar", "portfolio"].includes(kind)) return res.status(400).json({ error: "Unknown image type." });
  const match = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/.exec(typeof req.body.data === "string" ? req.body.data : "");
  if (!match) return res.status(400).json({ error: "Upload a JPG, PNG or WebP image." });
  const buf = Buffer.from(match[1], "base64");
  if (buf.length > MAX_BYTES) return res.status(413).json({ error: "That image is too big (2 MB max)." });
  const mime = sniff(buf);
  if (!mime) return res.status(400).json({ error: "Upload a JPG, PNG or WebP image." });

  const a = req.artist;
  if (kind === "portfolio" &&
      db.prepare("SELECT COUNT(*) AS n FROM images WHERE artist_id = ? AND kind = 'portfolio'").get(a.id).n >= MAX_PORTFOLIO) {
    return res.status(400).json({ error: `Your portfolio is full (${MAX_PORTFOLIO} pieces). Remove one to add another.` });
  }

  const { lastInsertRowid: id } = db.prepare(`INSERT INTO images (artist_id, kind, mime, data, sort_order, created_at)
    VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM images WHERE artist_id = ?), ?)`)
    .run(a.id, kind, mime, buf, a.id, new Date().toISOString());
  if (kind === "avatar") {
    db.prepare("DELETE FROM images WHERE artist_id = ? AND kind = 'avatar' AND id != ?").run(a.id, id);
    db.prepare("UPDATE artists SET avatar_image_id = ? WHERE id = ?").run(id, a.id);
  }
  res.status(201).json({ image: { id: Number(id), url: `/img/${id}` } });
});

router.delete("/api/images/:id", requireAuth, (req, res) => {
  const img = db.prepare("SELECT id, kind FROM images WHERE id = ? AND artist_id = ?").get(Number(req.params.id), req.artist.id);
  if (!img) return res.status(404).json({ error: "Image not found." });
  db.prepare("DELETE FROM images WHERE id = ?").run(img.id);
  if (img.kind === "avatar") db.prepare("UPDATE artists SET avatar_image_id = NULL WHERE id = ? AND avatar_image_id = ?").run(req.artist.id, img.id);
  res.json({ ok: true });
});

// A new upload always gets a new id, so each URL's bytes never change and can
// be cached forever. The strict CSP matters for the demo's SVG artwork.
router.get("/img/:id", (req, res, next) => {
  const img = db.prepare("SELECT mime, data FROM images WHERE id = ?").get(Number(req.params.id));
  if (!img) return next();
  res.set({
    "Content-Type": img.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.send(Buffer.from(img.data));
});

module.exports = router;
