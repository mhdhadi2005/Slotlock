// Consent forms and aftercare: the starting templates artists edit, and the
// helpers for the consent statements stored as a JSON array on the artist.

const CONSENT_INTRO =
  "Please read this carefully before your appointment. Getting tattooed is a permanent decision, " +
  "and your artist needs to know you're ready and healthy enough for it.";

const CONSENT_STATEMENTS = [
  "I am at least 18 years old and have shown or will show valid photo ID.",
  "I am not under the influence of alcohol or drugs.",
  "I have told my artist about any medical conditions, allergies, medications, pregnancy or skin conditions that could affect the tattoo or healing.",
  "I understand a tattoo is permanent and that removal is difficult, expensive and not always complete.",
  "I have checked the design, spelling, size and placement, and I approve them.",
  "I understand there is a risk of infection, allergic reaction or scarring, and I will follow the aftercare instructions I'm given.",
  "I understand colours and lines can vary from the design and change as the tattoo heals and ages.",
  "I release my artist and the studio from liability for any problems caused by not following aftercare or by information I didn't share.",
];

const AFTERCARE_TEXT = [
  "Thanks for getting tattooed! Here's how to look after it:",
  "",
  "• Leave the wrap on for the time your artist told you, then wash your hands and gently wash the tattoo with lukewarm water and unscented soap.",
  "• Pat it dry with a clean paper towel. Don't rub.",
  "• Apply a very thin layer of the aftercare balm or unscented lotion 2–3 times a day. Less is more.",
  "• Don't pick or scratch. Peeling and itching are normal.",
  "• For 2–3 weeks: no swimming, baths, saunas, tanning or direct sun on it.",
  "• Wear loose, clean clothes over it and sleep on clean sheets.",
  "",
  "If you notice spreading redness, heat, pus or a fever, see a doctor.",
  "Questions? Just reply or message me. Enjoy your new tattoo!",
].join("\n");

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

// What the client sees: the artist's own wording, or the template if they
// turned the form on without writing any.
function consentForm(artist) {
  const statements = parseStatements(artist.consent_statements);
  return {
    intro: artist.consent_intro || CONSENT_INTRO,
    statements: statements.length ? statements : CONSENT_STATEMENTS,
  };
}

const aftercareText = (artist) => artist.aftercare_text || AFTERCARE_TEXT;

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
