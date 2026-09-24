// Add-ons: optional extras on a service ("+ Nail art $15, 30 min"). Their
// minutes make the appointment longer, so they're picked before the time.
const { httpError } = require("./util");

const MAX_ADDONS = 8;
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function parseAddons(json) {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Returns a clean list, or an error message.
function normalizeAddons(list) {
  if (list === undefined) return { addons: undefined };
  if (!Array.isArray(list)) return { error: "Invalid add-ons." };
  const out = [];
  for (const raw of list.slice(0, MAX_ADDONS)) {
    const name = typeof raw?.name === "string" ? raw.name.trim().slice(0, 60) : "";
    if (!name) continue;
    const priceCents = raw.priceCents ?? 0, durationMin = raw.durationMin ?? 0;
    if (!intIn(priceCents, 0, 10_000_000)) return { error: `Add-on “${name}”: invalid price.` };
    if (!intIn(durationMin, 0, 240) || durationMin % 5) return { error: `Add-on “${name}”: extra time must be 0–240 minutes, in 5-minute steps.` };
    out.push({ name, priceCents, durationMin });
  }
  return { addons: out };
}

// The add-ons a client picked, by index into the service's list.
function pickAddons(service, picked) {
  const all = parseAddons(service.addons);
  const idx = [...new Set((Array.isArray(picked) ? picked : []).map(Number))];
  if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= all.length)) throw httpError(400, "That add-on isn't available any more.");
  const chosen = idx.sort((a, b) => a - b).map((i) => all[i]);
  return {
    chosen,
    minutes: chosen.reduce((n, x) => n + x.durationMin, 0),
    cents: chosen.reduce((n, x) => n + x.priceCents, 0),
  };
}

module.exports = { MAX_ADDONS, parseAddons, normalizeAddons, pickAddons };
