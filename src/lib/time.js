// Timezone math without a date library. Artists set hours in their own local
// time; bookings are stored as UTC instants. Intl gives us the offset of any
// IANA zone at any instant, which is all we need.

const formatters = new Map();
function partsFormatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
  }
  return formatters.get(tz);
}

function zonedParts(ts, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ts))) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
  };
}

// Milliseconds to add to a UTC instant to get the wall-clock time in `tz`.
function tzOffsetMs(ts, tz) {
  const secs = Math.floor(ts / 1000) * 1000;
  const p = zonedParts(secs, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - secs;
}

// "2026-11-01" + 600 minutes in America/New_York -> UTC ms. Two passes so the
// result is right on both sides of a DST change.
function zonedTimeToUtc(dateStr, minutes, tz) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const first = naive - tzOffsetMs(naive, tz);
  return naive - tzOffsetMs(first, tz);
}

const pad = (n) => String(n).padStart(2, "0");

function localDateStr(ts, tz) {
  const p = zonedParts(ts, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function localMinutes(ts, tz) {
  const p = zonedParts(ts, tz);
  return p.hour * 60 + p.minute;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

function isDateStr(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
}

function formatWhen(iso, tz) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

module.exports = {
  zonedTimeToUtc, localDateStr, localMinutes, addDays, weekdayOf,
  isValidTimezone, isDateStr, formatWhen, tzOffsetMs,
};
