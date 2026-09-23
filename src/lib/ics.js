// Minimal iCalendar writer for the client's "add to calendar" file and the
// artist's subscribable calendar feed.

const stamp = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (s) => String(s).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

// Lines longer than 75 octets must be folded (RFC 5545 §3.1).
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

function calendar({ name, events }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Slotlock//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (name) {
    lines.push(`X-WR-CALNAME:${escapeText(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H");
  }
  const now = stamp(new Date().toISOString());
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.status) lines.push(`STATUS:${e.status}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR", "");
  return lines.map(fold).join("\r\n");
}

module.exports = { calendar, stamp };
