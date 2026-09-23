require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const { zonedTimeToUtc, localDateStr, addDays, weekdayOf, isDateStr } = require("../src/lib/time");
const { generateSlots } = require("../src/lib/slots");

test("zonedTimeToUtc handles both sides of a DST change", () => {
  // New York: EDT (UTC-4) until Nov 1 2026 02:00, then EST (UTC-5).
  assert.equal(new Date(zonedTimeToUtc("2026-10-31", 11 * 60, "America/New_York")).toISOString(), "2026-10-31T15:00:00.000Z");
  assert.equal(new Date(zonedTimeToUtc("2026-11-02", 11 * 60, "America/New_York")).toISOString(), "2026-11-02T16:00:00.000Z");
  // Spring forward in London: Mar 29 2026, BST from 01:00 UTC.
  assert.equal(new Date(zonedTimeToUtc("2026-03-30", 9 * 60, "Europe/London")).toISOString(), "2026-03-30T08:00:00.000Z");
  // Positive offset, half-hour zone.
  assert.equal(new Date(zonedTimeToUtc("2026-06-01", 10 * 60, "Asia/Kolkata")).toISOString(), "2026-06-01T04:30:00.000Z");
});

test("date helpers", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekdayOf("2026-09-23"), 3);
  assert.equal(localDateStr(Date.parse("2026-09-23T03:00:00Z"), "America/Los_Angeles"), "2026-09-22");
  assert.ok(isDateStr("2026-02-28"));
  assert.ok(!isDateStr("2026-02-30"));
  assert.ok(!isDateStr("tomorrow"));
});

const base = {
  timezone: "America/New_York", stepMin: 30, minNoticeHours: 0, maxDaysAhead: 60,
  rules: { 4: { start_min: 11 * 60, end_min: 15 * 60 } }, // Thursdays 11–3
  blocked: new Set(), busy: [], days: 1,
  fromDate: "2026-10-01", now: Date.parse("2026-09-23T12:00:00Z"),
};

test("slots fit the service length inside working hours", () => {
  const [day] = generateSlots({ ...base, durationMin: 120 });
  // 11:00, 11:30, 12:00, 12:30, 13:00 — 13:00 + 2h = 15:00 is the last fit.
  assert.equal(day.slots.length, 5);
  assert.equal(day.slots[0], "2026-10-01T15:00:00.000Z");
  assert.equal(day.slots.at(-1), "2026-10-01T17:00:00.000Z");
});

test("slots skip busy time, blocked dates, closed days and short notice", () => {
  const busy = [{ start: Date.parse("2026-10-01T16:00:00Z"), end: Date.parse("2026-10-01T17:00:00Z") }];
  const [day] = generateSlots({ ...base, durationMin: 60, busy });
  // 12:00–13:00 local is taken, so 11:30, 12:00 and 12:30 starts all overlap it.
  assert.deepEqual(day.slots.map((s) => s.slice(11, 16)), ["15:00", "17:00", "17:30", "18:00"]);

  assert.equal(generateSlots({ ...base, durationMin: 60, blocked: new Set(["2026-10-01"]) })[0].slots.length, 0);
  assert.equal(generateSlots({ ...base, durationMin: 60, fromDate: "2026-10-02" })[0].slots.length, 0);

  const now = Date.parse("2026-10-01T14:00:00Z"); // 10:00 local
  const [soon] = generateSlots({ ...base, durationMin: 60, now, minNoticeHours: 3 });
  assert.equal(soon.slots[0], "2026-10-01T17:00:00.000Z"); // 13:00 local is the first allowed
});

test("slots stop at the booking window", () => {
  const out = generateSlots({ ...base, durationMin: 60, maxDaysAhead: 5, days: 30, fromDate: "2026-09-23" });
  assert.equal(out.at(-1).date, "2026-09-28");
});
