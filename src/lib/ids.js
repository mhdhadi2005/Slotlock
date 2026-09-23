const crypto = require("crypto");

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

// Short codes clients paste into a payment note so the artist can match the
// money to the booking. No 0/O/1/I, so they survive being read off a phone.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function refCode(length = 5) {
  let out = "";
  for (const byte of crypto.randomBytes(length)) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

module.exports = { randomToken, refCode };
