const { db } = require("../db");
const { sendEmail } = require("../lib/email");
const { formatWhen } = require("../lib/time");
const { bookingLink } = require("../lib/bookings");

// Every 10 minutes: tidy lapsed holds and send day-before reminders.
// Reminders are what actually cut no-shows, alongside the deposit.

function expireHolds(now = Date.now()) {
  return db.prepare(`UPDATE bookings SET status = 'expired', hold_expires_at = NULL
    WHERE status = 'pending_payment' AND hold_expires_at <= ?`).run(new Date(now).toISOString()).changes;
}

async function sendReminders(now = Date.now()) {
  const due = db.prepare(`
    SELECT b.*, a.display_name, a.timezone, a.location, a.cancel_window_hours
    FROM bookings b JOIN artists a ON a.id = b.artist_id
    WHERE b.status = 'confirmed' AND b.reminder_sent_at IS NULL
      AND b.starts_at > ? AND b.starts_at <= ?
  `).all(new Date(now).toISOString(), new Date(now + 24 * 3600000).toISOString());

  for (const b of due) {
    // Mark first so a slow email provider can't cause a double send.
    db.prepare("UPDATE bookings SET reminder_sent_at = ? WHERE id = ?").run(new Date(now).toISOString(), b.id);
    await sendEmail({
      to: b.client_email,
      subject: `Reminder: ${b.service_name} with ${b.display_name} tomorrow`,
      text: `Hi ${b.client_name},\n\nJust a reminder about your appointment.\n\n` +
        `When: ${formatWhen(b.starts_at, b.timezone)}\n` +
        (b.location ? `Where: ${b.location}\n` : "") +
        `\nNeed to change something? ${bookingLink(b)}\n`,
    });
  }
  return due.length;
}

async function tick() {
  try {
    expireHolds();
    await sendReminders();
  } catch (err) {
    console.error(`[scheduler] ${err.message}`);
  }
}

function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === "1") return;
  tick();
  setInterval(tick, 10 * 60 * 1000).unref();
}

module.exports = { startScheduler, expireHolds, sendReminders };
