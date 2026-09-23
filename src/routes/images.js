const express = require("express");
const { db } = require("../db");
const { requireAuth } = require("../lib/auth");
const { rateLimit } = require("../lib/util");
const { decodeImage } = require("../lib/images");

const router = express.Router();
const uploadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PORTFOLIO = 12;

// The browser resizes before uploading, so these are small. Sent as a data
// URL in JSON (server.js gives this route a bigger body limit).
router.post("/api/images", requireAuth, uploadLimiter, (req, res) => {
  const kind = req.body.kind;
  if (!["avatar", "portfolio"].includes(kind)) return res.status(400).json({ error: "Unknown image type." });
  const { mime, buf } = decodeImage(req.body.data, { maxBytes: MAX_BYTES });

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
