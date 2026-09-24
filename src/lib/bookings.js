const { db } = require("../db");
const { sendEmail } = require("./email");
const { formatWhen, localDateStr } = require("./time");
const { baseUrl, money, httpError } = require("./util");
const { parseMethods, TYPES } = require("./payments");
const { hasConflict, slotsForService } = require("./slots");
const { randomToken, refCode } = require("./ids");
const { parseAddons } = require("./addons");

const getBooking = (id) => db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
const getArtist = (id) => db.prepare("SELECT * FROM artists WHERE id = ?").get(id);

const bookingLink = (b) => `${baseUrl()}/booking/${b.public_token}`;
const dashboardLink = (tab = "bookings") => `${baseUrl()}/app#${tab}`;

function googleCalendarLink(b, artist) {
  const fmt = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.service_name} with ${artist.display_name}`,
    dates: `${fmt(b.starts_at)}/${fmt(b.ends_at)}`,
    details: `Manage your booking: ${bookingLink(b)}`,
    location: artist.location || "",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// Demo pages never send email: the "client" on a demo is whoever typed an
// address into a public form.
async function mail(artist, msg) {
  if (!artist.is_demo) await sendEmail(msg);
}

// When an unpaid request stops holding its slot: after the artist's hold
// window, but never later than two hours before the appointment, and never
// sooner than 30 minutes from now.
function holdUntil(startMs, holdHours, now = Date.now()) {
  const byHold = now + holdHours * 3600000;
  const beforeStart = startMs - 2 * 3600000;
  return new Date(Math.max(now + 30 * 60000, Math.min(byHold, beforeStart))).toISOString();
}

const consentSigned = (b) => !!db.prepare("SELECT 1 FROM consents WHERE booking_id = ?").get(b.id);

// A line for emails when the artist wants a signed consent form first.
function consentLine(b, artist) {
  if (!artist.consent_enabled || consentSigned(b)) return "";
  return `\nPlease sign ${artist.display_name}'s consent form before your appointment (takes a minute):\n${bookingLink(b)}\n`;
}

// Re-checks the time is still free, then saves the booking. There's no await
// between the check and the INSERT: that's what stops two clients taking the
// same slot (see db/index.js).
function insertBooking(a, { serviceId, serviceName, durationMin, depositCents, startIso, client, notes = "", referenceUrl = "",
  requestId = null, patchTestHours = 0, addons = [], addonsCents = 0 }, now = Date.now()) {
  const startMs = Date.parse(startIso);
  if (!startMs) throw httpError(400, "Pick a time.");
  const start = new Date(startMs).toISOString();
  const [day] = slotsForService(a, { duration_min: durationMin, patch_test_hours: patchTestHours }, localDateStr(startMs, a.timezone), 1, now);
  if (!day || !day.slots.includes(start)) throw httpError(409, "Sorry, that time was just taken. Please pick another.");

  const needsDeposit = depositCents > 0;
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO bookings (artist_id, service_id, public_token, ref_code, service_name, starts_at, ends_at, status,
      hold_expires_at, client_name, client_email, client_phone, client_instagram, notes, reference_url,
      deposit_cents, currency, request_id, addons, addons_cents, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(a.id, serviceId, randomToken(18), refCode(), serviceName, start, new Date(startMs + durationMin * 60000).toISOString(),
    needsDeposit ? "awaiting_deposit" : "confirmed",
    needsDeposit ? holdUntil(startMs, a.hold_hours, now) : null,
    client.name, client.email, client.phone || "", client.instagram || "", notes, referenceUrl,
    depositCents, a.currency, requestId, JSON.stringify(addons), addonsCents, new Date(now).toISOString());
  return getBooking(lastInsertRowid);
}

async function createBooking(a, opts) {
  const b = insertBooking(a, opts);
  if (b.status === "awaiting_deposit") await notifyRequested(b);
  else await notifyConfirmed(b, { instant: true });
  return b;
}

const moneySent = (b) => b.deposit_cents > 0 && (!!b.deposit_paid || !!b.deposit_reported_at);

// Cancel early enough and the deposit comes back; inside the artist's window
// they keep it (that's what a deposit is for).
function clientRefundEligible(b, artist, now = Date.now()) {
  return Date.parse(b.starts_at) - now >= artist.cancel_window_hours * 3600000;
}

// ---- Emails ----------------------------------------------------------------

function paymentLines(b, artist) {
  const methods = parseMethods(artist.payment_methods);
  const lines = methods.map((m) => `  • ${TYPES[m.type].label}: ${m.type === "venmo" ? "@" : m.type === "cashapp" ? "$" : ""}${m.value}`);
  if (artist.payment_note) lines.push("", artist.payment_note);
  return lines.join("\n");
}

async function notifyRequested(b) {
  const a = getArtist(b.artist_id);
  const when = formatWhen(b.starts_at, a.timezone);
  const amount = money(b.deposit_cents, b.currency);
  const due = formatWhen(b.hold_expires_at, a.timezone);
  await mail(a, {
    to: b.client_email,
    subject: `Send your ${amount} deposit to lock in ${when}`,
    text:
      `Hi ${b.client_name},\n\n${a.display_name} is holding ${when} for your ${b.service_name}.\n\n` +
      `To lock it in, send the ${amount} deposit by ${due}. Put this reference in the payment note: ${b.ref_code}\n\n` +
      `Ways to pay:\n${paymentLines(b, a)}\n\n` +
      `Once you've sent it, tap "I've sent the deposit" here:\n${bookingLink(b)}\n\n` +
      `If the deposit doesn't arrive by then, the time is released for someone else.\n`,
  });
  await mail(a, {
    to: a.email,
    subject: `New request: ${b.client_name}, ${when} (deposit pending)`,
    text:
      `${b.client_name} requested ${b.service_name} for ${when}.\n\n` +
      `They've been sent your payment details for the ${amount} deposit (reference ${b.ref_code}). ` +
      `The slot is held until ${due}.\n\n${clientDetails(b)}\nDashboard: ${dashboardLink()}\n`,
  });
}

async function notifyReported(b) {
  const a = getArtist(b.artist_id);
  const when = formatWhen(b.starts_at, a.timezone);
  const via = b.deposit_method && TYPES[b.deposit_method] ? ` via ${TYPES[b.deposit_method].label}` : "";
  await mail(a, {
    to: a.email,
    subject: `${b.client_name} says they sent the ${money(b.deposit_cents, b.currency)} deposit`,
    text:
      `${b.client_name} says they've sent the ${money(b.deposit_cents, b.currency)} deposit${via} ` +
      `for ${b.service_name} on ${when} (reference ${b.ref_code}).\n\n` +
      `Check it arrived, then confirm the booking:\n${dashboardLink()}\n\n` +
      `The slot stays held until you confirm or decline.\n`,
  });
}

async function notifyConfirmed(b, { instant }) {
  const a = getArtist(b.artist_id);
  const when = formatWhen(b.starts_at, a.timezone);
  const deposit = b.deposit_paid ? `Deposit received: ${money(b.deposit_cents, b.currency)}\n` : "";
  await mail(a, {
    to: b.client_email,
    subject: `You're booked with ${a.display_name}: ${when}`,
    text:
      `Hi ${b.client_name},\n\nYou're booked for ${b.service_name} with ${a.display_name}.\n\n` +
      `When: ${when}\n${a.location ? `Where: ${a.location}\n` : ""}${addonLine(b)}${deposit}\n` +
      `Add to Google Calendar: ${googleCalendarLink(b, a)}\n` +
      `View or cancel: ${bookingLink(b)}\n` + consentLine(b, a) +
      (a.policy ? `\nPolicy:\n${a.policy}\n` : ""),
  });
  if (instant) {
    await mail(a, {
      to: a.email,
      subject: `New booking: ${b.client_name}, ${when}`,
      text: `${b.client_name} booked ${b.service_name} for ${when}.\n\n${clientDetails(b)}\nDashboard: ${dashboardLink()}\n`,
    });
  }
}

function addonLine(b) {
  const list = parseAddons(b.addons);
  return list.length ? `Add-ons: ${list.map((x) => `${x.name}${x.priceCents ? ` (+${money(x.priceCents, b.currency)})` : ""}`).join(", ")}\n` : "";
}

function clientDetails(b) {
  return addonLine(b) + `Email: ${b.client_email}\n` +
    (b.client_phone ? `Phone: ${b.client_phone}\n` : "") +
    (b.client_instagram ? `Instagram: ${b.client_instagram}\n` : "") +
    (b.notes ? `\nNotes:\n${b.notes}\n` : "") +
    (b.reference_url ? `\nReference: ${b.reference_url}\n` : "");
}

async function notifyCancelled(b) {
  const a = getArtist(b.artist_id);
  const when = formatWhen(b.starts_at, a.timezone);
  const amount = money(b.deposit_cents, b.currency);
  const sent = moneySent(b);

  let clientMoney = "";
  if (sent && b.refund_status === "owed") clientMoney = `${a.display_name} will send your ${amount} deposit back to you.\n`;
  else if (sent && b.refund_status === "refunded") clientMoney = `Your ${amount} deposit has been refunded.\n`;
  else if (sent) clientMoney = `The ${amount} deposit isn't refundable this close to the appointment, per ${a.display_name}'s policy.\n`;

  const byArtist = b.cancelled_by === "artist";
  await mail(a, {
    to: b.client_email,
    subject: byArtist && b.status === "cancelled" && !b.deposit_paid ? `Booking request declined: ${when}` : `Booking cancelled: ${when}`,
    text:
      `Hi ${b.client_name},\n\nYour ${b.service_name} booking with ${a.display_name} on ${when} has been cancelled` +
      `${byArtist ? ` by ${a.display_name}` : ""}.\n` +
      (b.cancel_reason ? `\n"${b.cancel_reason}"\n` : "") + `\n${clientMoney}` +
      `\nBook another time: ${baseUrl()}/${a.handle}\n`,
  });

  if (!byArtist) {
    let artistMoney = "";
    if (sent && b.refund_status === "owed") {
      artistMoney = `They cancelled before your ${a.cancel_window_hours}-hour cutoff, so they're owed their ${amount} deposit back. ` +
        `Send it the way they paid, then mark it refunded:\n${dashboardLink()}\n`;
    } else if (sent) {
      artistMoney = `It's inside your ${a.cancel_window_hours}-hour cutoff, so you keep the ${amount} deposit.\n`;
    }
    await mail(a, {
      to: a.email,
      subject: `Cancelled: ${b.client_name}, ${when}`,
      text: `${b.client_name} cancelled their ${b.service_name} booking on ${when}.\n\n${artistMoney}`,
    });
  }
}

async function notifyExpired(b) {
  const a = getArtist(b.artist_id);
  const when = formatWhen(b.starts_at, a.timezone);
  await mail(a, {
    to: b.client_email,
    subject: `Your hold for ${when} has expired`,
    text:
      `Hi ${b.client_name},\n\nThe deposit for your ${b.service_name} request with ${a.display_name} on ${when} ` +
      `wasn't marked as sent in time, so the slot has been released.\n\n` +
      `If you already paid, reply to ${a.display_name} directly. Otherwise, pick a new time: ${baseUrl()}/${a.handle}\n`,
  });
}

// ---- State changes ---------------------------------------------------------

async function reportDeposit(b, method) {
  if (b.status !== "awaiting_deposit") throw httpError(409, "This booking isn't waiting on a deposit.");
  if (b.deposit_reported_at) return b;
  if (Date.parse(b.hold_expires_at) <= Date.now()) {
    db.prepare("UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ?").run(b.id);
    throw httpError(409, "Sorry, this hold has expired and the time was released. Please pick a new time.");
  }
  db.prepare("UPDATE bookings SET deposit_reported_at = ?, deposit_method = ? WHERE id = ?")
    .run(new Date().toISOString(), method || "", b.id);

  const artist = getArtist(b.artist_id);
  // On the demo there's no artist to check the money, so play their part.
  if (artist.is_demo) return confirmDeposit(getBooking(b.id));

  const updated = getBooking(b.id);
  await notifyReported(updated);
  return updated;
}

async function confirmDeposit(b) {
  if (b.status !== "awaiting_deposit") throw httpError(409, "This booking isn't waiting on a deposit.");
  // A hold that ran out (and was never reported as paid) stops blocking the
  // calendar, so someone else may have taken the time since.
  const lapsed = !b.deposit_reported_at && Date.parse(b.hold_expires_at) <= Date.now();
  if (lapsed && hasConflict(b.artist_id, b.starts_at, b.ends_at, b.id)) {
    throw httpError(409, "This request's hold ran out and someone else has booked that time since. Decline it and ask them to pick a new time.");
  }
  db.prepare("UPDATE bookings SET status = 'confirmed', deposit_paid = 1, hold_expires_at = NULL WHERE id = ?").run(b.id);
  const updated = getBooking(b.id);
  await notifyConfirmed(updated, { instant: false });
  return updated;
}

async function cancelBooking(b, { by, refund = false, reason = "" }) {
  if (!["awaiting_deposit", "confirmed"].includes(b.status)) throw httpError(409, "This booking can't be cancelled.");
  if (Date.parse(b.starts_at) <= Date.now()) throw httpError(409, "This appointment has already started.");

  const refundStatus = moneySent(b) && refund ? "owed" : "none";
  db.prepare(`UPDATE bookings SET status = 'cancelled', cancelled_by = ?, cancel_reason = ?, refund_status = ?,
    hold_expires_at = NULL WHERE id = ?`).run(by, reason, refundStatus, b.id);
  const updated = getBooking(b.id);
  await notifyCancelled(updated);
  return updated;
}

async function expireHold(b) {
  db.prepare("UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ?").run(b.id);
  await notifyExpired(getBooking(b.id));
}

module.exports = {
  getBooking, getArtist, holdUntil, moneySent, clientRefundEligible, googleCalendarLink, bookingLink,
  insertBooking, createBooking, consentSigned, consentLine, dashboardLink, mail,
  notifyRequested, notifyConfirmed, reportDeposit, confirmDeposit, cancelBooking, expireHold,
};
