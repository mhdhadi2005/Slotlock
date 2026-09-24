const { db } = require("../db");
const { zonedTimeToUtc, localDateStr, addDays, weekdayOf } = require("./time");

const MIN = 60 * 1000;

// Bookings that occupy calendar time: confirmed ones, plus requests still
// waiting on a deposit — either inside their hold, or already reported as
// paid (those wait for the artist to confirm and must not be double-booked).
const OCCUPYING = `(status = 'confirmed' OR (status = 'awaiting_deposit'
  AND (deposit_reported_at IS NOT NULL OR hold_expires_at > ?)))`;

function busyIntervals(artistId, fromIso, toIso, nowIso, excludeBookingId = 0) {
  return db.prepare(`
    SELECT starts_at, ends_at FROM bookings
    WHERE artist_id = ? AND id != ?
      AND starts_at < ? AND ends_at > ?
      AND ${OCCUPYING}
  `).all(artistId, excludeBookingId, toIso, fromIso, nowIso)
    .map((b) => ({ start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) }));
}

function hasConflict(artistId, startIso, endIso, excludeBookingId = 0, now = Date.now()) {
  return busyIntervals(artistId, startIso, endIso, new Date(now).toISOString(), excludeBookingId).length > 0;
}

// Pure slot generation, kept free of DB access so it's easy to test.
function generateSlots({ timezone, stepMin, minNoticeHours, maxDaysAhead, durationMin,
  rules, blocked, busy, fromDate, days, now }) {
  const earliest = now + minNoticeHours * 60 * MIN;
  const lastDate = addDays(localDateStr(now, timezone), maxDaysAhead);
  const out = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    if (date > lastDate) break;
    const slots = [];
    const rule = rules[weekdayOf(date)];
    if (rule && !blocked.has(date)) {
      for (let m = rule.start_min; m + durationMin <= rule.end_min; m += stepMin) {
        const start = zonedTimeToUtc(date, m, timezone);
        const end = start + durationMin * MIN;
        if (start < earliest) continue;
        if (busy.some((b) => b.start < end && b.end > start)) continue;
        slots.push(new Date(start).toISOString());
      }
    }
    out.push({ date, slots });
  }
  return out;
}

function slotsForService(artist, service, fromDate, days, now = Date.now()) {
  const rules = {};
  for (const r of db.prepare("SELECT * FROM availability WHERE artist_id = ?").all(artist.id)) {
    rules[r.weekday] = r;
  }
  const blocked = new Set(
    db.prepare("SELECT date FROM blocked_dates WHERE artist_id = ?").all(artist.id).map((r) => r.date)
  );
  // Pad the busy window by a day on each side so timezone edges are covered.
  const from = new Date(zonedTimeToUtc(addDays(fromDate, -1), 0, artist.timezone)).toISOString();
  const to = new Date(zonedTimeToUtc(addDays(fromDate, days + 1), 0, artist.timezone)).toISOString();
  const busy = busyIntervals(artist.id, from, to, new Date(now).toISOString());

  return generateSlots({
    timezone: artist.timezone,
    stepMin: artist.slot_step_min,
    // A service that needs a patch test can't be booked sooner than that.
    minNoticeHours: Math.max(artist.min_notice_hours, service.patch_test_hours || 0),
    maxDaysAhead: artist.max_days_ahead,
    durationMin: service.duration_min,
    rules, blocked, busy, fromDate, days, now,
  });
}

module.exports = { generateSlots, slotsForService, hasConflict, OCCUPYING };
