// Sends through Resend when RESEND_API_KEY is set, otherwise logs the email so
// local dev and demo mode still show what would have gone out. Never throws —
// a failed email shouldn't fail a booking.
async function sendEmail({ to, subject, text }) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "test") {
      console.log(`[email] to=${to} subject="${subject}"\n${text}\n`);
    }
    return { skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Slotlock <onboarding@resend.dev>",
        to: [to], subject, text,
      }),
    });
    if (!res.ok) console.error(`[email] Resend ${res.status}: ${await res.text()}`);
    return { ok: res.ok };
  } catch (err) {
    console.error(`[email] send failed: ${err.message}`);
    return { ok: false };
  }
}

module.exports = { sendEmail };
