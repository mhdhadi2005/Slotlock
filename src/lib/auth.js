const crypto = require("crypto");
const { db } = require("../db");
const { randomToken } = require("./ids");

const COOKIE = "sl_session";
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split(":");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function createSession(artistId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, artist_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), artistId, expires);
  return token;
}

function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

// After a password change: everyone else is signed out, this device stays in.
function destroyOtherSessions(artistId, keepToken) {
  db.prepare("DELETE FROM sessions WHERE artist_id = ? AND token_hash != ?").run(artistId, keepToken ? sha256(keepToken) : "");
}

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function attachArtist(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.sessionToken = token;
  if (token) {
    req.artist = db.prepare(`
      SELECT a.* FROM sessions s JOIN artists a ON a.id = s.artist_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(sha256(token), new Date().toISOString());
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.artist) return res.status(401).json({ error: "Please log in." });
  next();
}

module.exports = {
  hashPassword, verifyPassword, randomToken, sha256, createSession, destroySession, destroyOtherSessions,
  setSessionCookie, clearSessionCookie, attachArtist, requireAuth, parseCookies,
};
