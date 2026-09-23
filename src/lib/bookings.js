const { db } = require("../db");
const stripe = require("./stripe");
const { sendEmail } = require("./email");
const { hasConflict } = require("./slots");
const { formatWhen } = require("./time");
const { baseUrl, money } = require("./util");

const getBooking = (id) => db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
const getArtist = (id) => db.prepare("SELECT * FROM artists WHERE id = ?").get(id);

function bookingLink(b) { return `${baseUrl()}/booking/${b.public_token}`; }

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

async function notifyConfirmed(b) {
  const a = getArtist(b.artist_id);
  const when = formatWhen(b.starts_at, a.timezone);
  const deposit = b.deposit_paid ? `Deposit paid: ${money(b.deposit_cents, b.currency)}\n` : "";
  await sendEmail({
    to: b.client_email,
    subject: `You're booked with ${a.display_name}: ${when}`,
    text:
      `Hi ${b.client_name},\n\nYou're booked for ${b.service_name} with ${a.display_name}.\n\n` +
      `When: ${when}\n${a.location ? `Where: ${a.location}\n` : ""}${deposit}\n` +
      `Add to Google Calendar: ${googleCalendarLink(b, a)}\n` +
      `View or cancel: ${bookingLink(b)}\n` +
      (a.policy ? `\nPolicy:\n${a.policy}\n` : ""),
  });
  await sendEmail({
    to: a.email,
    subject: `New booking: ${b.client_name}, ${when}`,
    text:
      `${b.client_name} booked ${b.service_name} for ${when}.\n\n` +
      `Email: ${b.client_email}\n` +
      (b.client_phone ? `Phone: ${b.client_phone}\n` : "") +
      (b.client_instagram ? `Instagram: ${b.client_instagram}\n` : "") +
      deposit +
      (b.notes ? `\nNotes:\n${b.notes}\n` : "") +
      (b.reference_url ? `\nReference: ${b.reference_url}\n` : "") +
      `\nDashboard: ${baseUrl()}/app#bookings\n`,
  });
}

async function notifyCancelled(b, reason) {
  const a = getArtist(b.artist_id);
  const when = formatWhen(b.starts_at, a.timezone);
  const refund = b.refunded ? `Your ${money(b.deposit_cents, b.currency)} deposit has been refunded.\n` : "";
  await sendEmail({
    to: b.client_email,
    subject: `Booking cancelled: ${when}`,
    text: `Hi ${b.client_name},\n\nYour ${b.service_name} booking with ${a.display_name} on ${when} ` +
      `has been cancelled. ${reason}\n${refund}\nBook again: ${baseUrl()}/${a.handle}\n`,
  });
  if (b.cancelled_by !== "artist") {
    await sendEmail({
      to: a.email,
      subject: `Cancelled: ${b.client_name}, ${when}`,
      text: `${b.client_name}'s ${b.service_name} booking on ${when} was cancelled. ${reason}\n` +
        (b.deposit_paid && !b.refunded ? "The deposit was kept per your cancellation policy.\n" : "") +
        (b.refunded ? "The deposit was refunded.\n" : ""),
    });
  }
}

async function refundDeposit(b) {
  if (!b.deposit_paid || b.refunded) return false;
  if (stripe.enabled()) {
    if (!b.stripe_payment_intent_id) return false;
    // reverse_transfer pulls the money back from the artist's connected
    // account, since deposits are destination charges.
    await stripe.call("POST", "/refunds", {
      payment_intent: b.stripe_payment_intent_id,
      reverse_transfer: true,
      metadata: { booking_id: b.id },
    });
  }
  db.prepare("UPDATE bookings SET refunded = 1 WHERE id = ?").run(b.id);
  return true;
}

// Called when a deposit payment succeeds (Stripe webhook, or the demo button).
async function confirmPaidBooking(bookingId, { paymentIntentId = null } = {}) {
  const b = getBooking(bookingId);
  if (!b || b.deposit_paid) return b;

  db.prepare("UPDATE bookings SET deposit_paid = 1, stripe_payment_intent_id = ? WHERE id = ?")
    .run(paymentIntentId, b.id);

  // The hold normally outlives Checkout, so this is rare: the booking was
  // released (client backed out, or the hold lapsed) and someone else took
  // the slot before the payment landed. Refund rather than double-book.
  const released = b.status !== "pending_payment" && b.status !== "confirmed";
  if (released && (b.status === "cancelled" || hasConflict(b.artist_id, b.starts_at, b.ends_at, b.id))) {
    db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_by = 'system' WHERE id = ?").run(b.id);
    await refundDeposit(getBooking(b.id));
    await notifyCancelled(getBooking(b.id), "That time was taken before your payment went through.");
    return getBooking(b.id);
  }

  db.prepare("UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = ?").run(b.id);
  const confirmed = getBooking(b.id);
  await notifyConfirmed(confirmed);
  return confirmed;
}

// Clients get their deposit back when cancelling outside the artist's
// window; inside it the deposit is kept (that's the point of a deposit).
// Artists cancelling always refund unless they choose otherwise.
async function cancelBooking(b, { by, refund }) {
  if (!["pending_payment", "confirmed"].includes(b.status)) {
    throw Object.assign(new Error("This booking can't be cancelled."), { status: 409 });
  }
  if (Date.parse(b.starts_at) <= Date.now()) {
    throw Object.assign(new Error("This appointment has already started."), { status: 409 });
  }

  const wasPending = b.status === "pending_payment";
  db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_by = ?, hold_expires_at = NULL WHERE id = ?")
    .run(by, b.id);

  if (wasPending) {
    if (b.stripe_checkout_session_id && stripe.enabled()) {
      stripe.call("POST", `/checkout/sessions/${b.stripe_checkout_session_id}/expire`)
        .catch(() => { /* already expired or completed */ });
    }
    return getBooking(b.id);
  }

  if (refund) await refundDeposit(getBooking(b.id));
  const reason = by === "artist" ? `${getArtist(b.artist_id).display_name} cancelled it.` : "";
  await notifyCancelled(getBooking(b.id), reason);
  return getBooking(b.id);
}

function clientRefundEligible(b, artist, now = Date.now()) {
  return Date.parse(b.starts_at) - now >= artist.cancel_window_hours * 3600000;
}

module.exports = {
  getBooking, confirmPaidBooking, cancelBooking, clientRefundEligible,
  notifyConfirmed, googleCalendarLink, bookingLink,
};
