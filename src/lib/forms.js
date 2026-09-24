// Consent forms and aftercare: helpers for the consent statements stored as a
// JSON array on the artist. The starting templates live in business.js.

const { businessOf, BUSINESS } = require("./business");

// The tattoo templates, kept as named exports for older callers.
const CONSENT_INTRO = BUSINESS.tattoo.consent.intro;
const CONSENT_STATEMENTS = BUSINESS.tattoo.consent.statements;
const AFTERCARE_TEXT = BUSINESS.tattoo.aftercare;

const MAX_STATEMENTS = 15;

function parseStatements(json) {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()) : [];
  } catch {
    return [];
  }
}

function normalizeStatements(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => (typeof s === "string" ? s.trim().slice(0, 400) : ""))
    .filter(Boolean)
    .slice(0, MAX_STATEMENTS);
}

// What the client sees: the artist's own wording, or their business type's
// template if they turned the form on without writing any.
function consentForm(artist) {
  const statements = parseStatements(artist.consent_statements);
  const template = businessOf(artist).consent;
  return {
    intro: artist.consent_intro || template.intro,
    statements: statements.length ? statements : template.statements,
  };
}

const aftercareText = (artist) => artist.aftercare_text || businessOf(artist).aftercare;

// Age on a given date, from a YYYY-MM-DD birth date.
function ageOn(dob, onDate) {
  const [y, m, d] = dob.split("-").map(Number);
  const on = new Date(onDate);
  let age = on.getUTCFullYear() - y;
  if (on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d)) age--;
  return age;
}

module.exports = {
  CONSENT_INTRO, CONSENT_STATEMENTS, AFTERCARE_TEXT, MAX_STATEMENTS,
  parseStatements, normalizeStatements, consentForm, aftercareText, ageOn,
};
