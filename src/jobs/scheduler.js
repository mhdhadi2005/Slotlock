const { db } = require("../db");
const { sendEmail } = require("../lib/email");
const { formatWhen } = require("../lib/time");
const { bookingLink, expireHold, consentLine, getArtist } = require("../lib/bookings");
const { aftercareText } = require("../lib/forms");

// Every 10 minutes: release unpaid holds, send day-before reminders, and
// tidy the demo page and old sessions.

async function expireHolds(now = Date.now()) {
  const due = db.prepare(`SELECT * FROM bookings WHERE status = 'awaiting_deposit'
    AND deposit_reported_at IS NULL AND hold_expires_at <= ?`).all(new Date(now).toISOString());
  for (const b of due) await expireHold(b);
  return due.length;
}

async function sendReminders(now = Date.now()) {
  const due = db.prepare(`
    SELECT b.*, a.display_name, a.timezone, a.location
    FROM bookings b JOIN artists a ON a.id = b.artist_id
    WHERE b.status = 'confirmed' AND b.reminder_sent_at IS NULL AND a.is_demo = 0
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
        `\nNeed to change something? ${bookingLink(b)}\n` + consentLine(b, getArtist(b.artist_id)),
    });
  }
  return due.length;
}

// Aftercare instructions a few hours after the appointment ends. Only for
// appointments that ended in the last three days, so turning aftercare on
// doesn't email everyone from months ago.
async function sendAftercare(now = Date.now()) {
  const due = db.prepare(`
    SELECT b.* FROM bookings b JOIN artists a ON a.id = b.artist_id
    WHERE b.status = 'confirmed' AND b.aftercare_sent_at IS NULL AND a.aftercare_enabled = 1 AND a.is_demo = 0
      AND b.ends_at <= ? AND b.ends_at > ?
  `).all(new Date(now - 3 * 3600000).toISOString(), new Date(now - 3 * 86400000).toISOString());

  for (const b of due) {
    db.prepare("UPDATE bookings SET aftercare_sent_at = ? WHERE id = ?").run(new Date(now).toISOString(), b.id);
    const a = getArtist(b.artist_id);
    await sendEmail({
      to: b.client_email,
      subject: `Aftercare for your new tattoo from ${a.display_name}`,
      text: `Hi ${b.client_name},\n\n${aftercareText(a)}\n` +
        (a.review_url ? `\nLoved it? A quick review helps ${a.display_name} a lot: ${a.review_url}\n` : "") +
        `\nThese instructions are also on your booking page: ${bookingLink(b)}\n`,
    });
  }
  return due.length;
}

// Visitors try the demo all day; clear their pretend bookings after 30
// minutes so its calendar never fills up.
function cleanDemo(now = Date.now()) {
  const cutoff = new Date(now - 30 * 60000).toISOString();
  const demo = "artist_id IN (SELECT id FROM artists WHERE is_demo = 1)";
  db.prepare(`DELETE FROM requests WHERE created_at <= ? AND ${demo}`).run(cutoff);
  db.prepare(`DELETE FROM waitlist WHERE created_at <= ? AND ${demo}`).run(cutoff);
  return db.prepare(`DELETE FROM bookings WHERE created_at <= ? AND ${demo}`).run(cutoff).changes;
}

function cleanSessions(now = Date.now()) {
  const iso = new Date(now).toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(iso);
  db.prepare("DELETE FROM password_resets WHERE expires_at <= ?").run(iso);
}

async function tick() {
  try {
    await expireHolds();
    await sendReminders();
    await sendAftercare();
    cleanDemo();
    cleanSessions();
  } catch (err) {
    console.error(`[scheduler] ${err.message}`);
  }
}

function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === "1") return;
  tick();
  setInterval(tick, 10 * 60 * 1000).unref();
}

module.exports = { startScheduler, expireHolds, sendReminders, sendAftercare, cleanDemo };
