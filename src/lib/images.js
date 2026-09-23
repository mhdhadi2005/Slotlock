const { httpError } = require("./util");

// Trust the bytes, not the label: only real JPEG, PNG and WebP files get in.
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// A browser-resized image sent as a data URL in JSON.
function decodeImage(data, { maxBytes = 2 * 1024 * 1024, only } = {}) {
  const match = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/.exec(typeof data === "string" ? data : "");
  if (!match) throw httpError(400, "Upload a JPG, PNG or WebP image.");
  const buf = Buffer.from(match[1], "base64");
  if (buf.length > maxBytes) throw httpError(413, `That image is too big (${Math.round(maxBytes / 1024 / 1024 * 10) / 10} MB max).`);
  const mime = sniff(buf);
  if (!mime || (only && !only.includes(mime))) throw httpError(400, "Upload a JPG, PNG or WebP image.");
  return { mime, buf };
}

module.exports = { sniff, decodeImage };
