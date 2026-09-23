// Consultation requests: the client describes the tattoo, the artist replies
// with a quote (price, deposit, session length), and the client turns the quote
// into a normal deposit booking by picking a time.
const { db } = require("../db");
const { randomToken } = require("./ids");
const { decodeImage } = require("./images");
const { baseUrl, money, httpError, depositsReady } = require("./util");
const { formatWhen } = require("./time");
const bookings = require("./bookings");

const MAX_PHOTOS = 4;
const STYLES = { color: "Colour", black_grey: "Black & grey", unsure: "Not sure yet" };

const getRequest = (id) => db.prepare("SELECT * FROM requests WHERE id = ?").get(id);
const requestLink = (r) => `${baseUrl()}/request/${r.public_token}`;
const photoUrls = (r) => db.prepare("SELECT key FROM request_photos WHERE request_id = ? ORDER BY id").all(r.id).map((p) => `/rp/${p.key}`);
const bookingOf = (r) => (r.booking_id ? bookings.getBooking(r.booking_id) : null);

// A quoted request can be booked, and so can one whose booking lapsed or was
// cancelled: the quote still stands, so the client just picks another time.
function canBook(r) {
  if (r.status === "quoted") return true;
  if (r.status !== "booked") return false;
  const b = bookingOf(r);
  return !b || ["expired", "cancelled"].includes(b.status);
}

function summary(r) {
  const style = STYLES[r.style];
  return [
    `Idea: ${r.idea}`,
    r.placement ? `Placement: ${r.placement}` : "",
    r.size ? `Size: ${r.size}` : "",
    style ? `Style: ${style}` : "",
  ].filter(Boolean).join("\n");
}

function quoteLines(r) {
  return [
    r.quote_price_cents !== null ? `Price: ${money(r.quote_price_cents, r.currency)}` : "",
    `Session length: ${Math.floor(r.quote_duration_min / 60) ? `${Math.floor(r.quote_duration_min / 60)} h ` : ""}${r.quote_duration_min % 60 ? `${r.quote_duration_min % 60} min` : ""}`.trim(),
    r.quote_deposit_cents ? `Deposit to book: ${money(r.quote_deposit_cents, r.currency)}` : "No deposit needed",
  ].filter(Boolean).join("\n");
}

// ---- Creating --------------------------------------------------------------

async function createRequest(a, service, fields) {
  const photos = (Array.isArray(fields.photos) ? fields.photos : []).slice(0, MAX_PHOTOS)
    .map((data) => decodeImage(data, { maxBytes: 1.5 * 1024 * 1024 }));

  const now = new Date().toISOString();
  db.exec("BEGIN");
  let id;
  try {
    ({ lastInsertRowid: id } = db.prepare(`
      INSERT INTO requests (artist_id, service_id, public_token, service_name, client_name, client_email, client_phone,
        client_instagram, idea, placement, size, style, currency, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(a.id, service.id, randomToken(18), service.name, fields.name, fields.email, fields.phone, fields.instagram,
      fields.idea, fields.placement, fields.size, fields.style, a.currency, now));
    const addPhoto = db.prepare("INSERT INTO request_photos (request_id, key, mime, data) VALUES (?, ?, ?, ?)");
    for (const p of photos) addPhoto.run(id, randomToken(24), p.mime, p.buf);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  const r = getRequest(id);

  // The demo has no artist to reply, so it quotes straight away.
  if (a.is_demo) {
    return quoteRequest(r, {
      priceCents: service.price_cents, depositCents: service.deposit_cents, durationMin: service.duration_min,
      message: "Love this idea! I'd do it as fine line with a little shading. Pick a time below to lock it in.",
    });
  }

  await bookings.mail(a, {
    to: r.client_email,
    subject: `Your tattoo request was sent to ${a.display_name}`,
    text:
      `Hi ${r.client_name},\n\n${a.display_name} has your request for ${r.service_name} and will reply with a quote.\n\n` +
      `${summary(r)}\n\nYou'll get an email when they reply. Check on it any time:\n${requestLink(r)}\n`,
  });
  await bookings.mail(a, {
    to: a.email,
    subject: `New consultation request from ${r.client_name}`,
    text:
      `${r.client_name} sent a request for ${r.service_name}.\n\n${summary(r)}\n` +
      (photos.length ? `\n${photos.length} reference photo${photos.length === 1 ? "" : "s"} attached.\n` : "") +
      `\nEmail: ${r.client_email}\n` + (r.client_phone ? `Phone: ${r.client_phone}\n` : "") +
      (r.client_instagram ? `Instagram: ${r.client_instagram}\n` : "") +
      `\nReview it and send a quote:\n${bookings.dashboardLink("requests")}\n`,
  });
  return r;
}

// ---- The artist replies ----------------------------------------------------

async function quoteRequest(r, { priceCents, depositCents, durationMin, message }) {
  if (!["new", "quoted"].includes(r.status)) throw httpError(409, "This request has already been answered.");
  const a = bookings.getArtist(r.artist_id);
  if (depositCents > 0 && !depositsReady(a)) throw httpError(400, "Add how clients pay you (Deposits page) before asking for a deposit.");
  db.prepare(`UPDATE requests SET status = 'quoted', quote_price_cents = ?, quote_deposit_cents = ?, quote_duration_min = ?,
    quote_message = ?, quoted_at = ? WHERE id = ?`).run(priceCents, depositCents, durationMin, message, new Date().toISOString(), r.id);
  const updated = getRequest(r.id);
  await bookings.mail(a, {
    to: r.client_email,
    subject: `${a.display_name} sent you a quote`,
    text:
      `Hi ${r.client_name},\n\n${a.display_name} replied to your ${r.service_name} request.\n\n` +
      (message ? `"${message}"\n\n` : "") + `${quoteLines(updated)}\n\n` +
      `Pick a time and book it here:\n${requestLink(updated)}\n`,
  });
  return updated;
}

async function declineRequest(r, reason) {
  if (!["new", "quoted"].includes(r.status)) throw httpError(409, "This request has already been answered.");
  const a = bookings.getArtist(r.artist_id);
  db.prepare("UPDATE requests SET status = 'declined', decline_reason = ? WHERE id = ?").run(reason, r.id);
  await bookings.mail(a, {
    to: r.client_email,
    subject: `About your tattoo request with ${a.display_name}`,
    text:
      `Hi ${r.client_name},\n\n${a.display_name} can't take on your ${r.service_name} request this time.\n` +
      (reason ? `\n"${reason}"\n` : "") + `\nThanks for thinking of them.\n`,
  });
  return getRequest(r.id);
}

// ---- The client books the quote --------------------------------------------

async function bookRequest(r, startIso) {
  if (!canBook(r)) throw httpError(409, r.status === "booked" ? "This request is already booked." : "This request hasn't been quoted yet.");
  const a = bookings.getArtist(r.artist_id);
  if (r.quote_deposit_cents > 0 && !depositsReady(a)) {
    throw httpError(403, `${a.display_name} hasn't set up deposits yet. Message them directly to book.`);
  }
  const b = bookings.insertBooking(a, {
    serviceId: r.service_id, serviceName: r.service_name, durationMin: r.quote_duration_min, depositCents: r.quote_deposit_cents,
    startIso, client: { name: r.client_name, email: r.client_email, phone: r.client_phone, instagram: r.client_instagram },
    notes: summary(r), requestId: r.id,
  });
  db.prepare("UPDATE requests SET status = 'booked', booking_id = ? WHERE id = ?").run(b.id, r.id);
  if (b.status === "awaiting_deposit") await bookings.notifyRequested(b);
  else await bookings.notifyConfirmed(b, { instant: true });
  return b;
}

function withdrawRequest(r) {
  if (!["new", "quoted"].includes(r.status)) throw httpError(409, "This request can't be withdrawn.");
  db.prepare("UPDATE requests SET status = 'withdrawn' WHERE id = ?").run(r.id);
  return getRequest(r.id);
}

// ---- Shapes for the API ------------------------------------------------------

function quoteOf(r) {
  if (r.quote_duration_min === null) return null;
  return { priceCents: r.quote_price_cents, depositCents: r.quote_deposit_cents, durationMin: r.quote_duration_min, message: r.quote_message, quotedAt: r.quoted_at };
}

function serializeForArtist(r) {
  const b = bookingOf(r);
  return {
    id: r.id, status: r.status, serviceId: r.service_id, serviceName: r.service_name,
    clientName: r.client_name, clientEmail: r.client_email, clientPhone: r.client_phone, clientInstagram: r.client_instagram,
    idea: r.idea, placement: r.placement, size: r.size, style: r.style, styleLabel: STYLES[r.style] || "",
    photos: photoUrls(r), quote: quoteOf(r), declineReason: r.decline_reason, currency: r.currency, createdAt: r.created_at,
    booking: b ? { id: b.id, status: b.status, startsAt: b.starts_at } : null,
  };
}

function serializeForClient(r, artistView) {
  const b = bookingOf(r);
  const a = bookings.getArtist(r.artist_id);
  return {
    status: r.status, serviceName: r.service_name, clientName: r.client_name,
    idea: r.idea, placement: r.placement, size: r.size, styleLabel: STYLES[r.style] || "",
    photos: photoUrls(r), quote: quoteOf(r), declineReason: r.decline_reason, currency: r.currency,
    canBook: canBook(r),
    booking: b ? { token: b.public_token, status: b.status, when: formatWhen(b.starts_at, a.timezone) } : null,
    artist: artistView,
  };
}

module.exports = {
  MAX_PHOTOS, STYLES, getRequest, createRequest, quoteRequest, declineRequest, bookRequest, withdrawRequest,
  serializeForArtist, serializeForClient, canBook,
};
