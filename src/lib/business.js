// Business types: tattoo studios and beauty pros book the same way, but the
// words, the starting templates and the look should fit the work. Everything
// here is a default the artist can change.

const LOOKS = ["ink", "blush", "latte"];

const TATTOO_CONSENT = {
  intro: "Please read this carefully before your appointment. Getting tattooed is a permanent decision, " +
    "and your artist needs to know you're ready and healthy enough for it.",
  statements: [
    "I am at least 18 years old and have shown or will show valid photo ID.",
    "I am not under the influence of alcohol or drugs.",
    "I have told my artist about any medical conditions, allergies, medications, pregnancy or skin conditions that could affect the tattoo or healing.",
    "I understand a tattoo is permanent and that removal is difficult, expensive and not always complete.",
    "I have checked the design, spelling, size and placement, and I approve them.",
    "I understand there is a risk of infection, allergic reaction or scarring, and I will follow the aftercare instructions I'm given.",
    "I understand colours and lines can vary from the design and change as the tattoo heals and ages.",
    "I release my artist and the studio from liability for any problems caused by not following aftercare or by information I didn't share.",
  ],
};

const TATTOO_AFTERCARE = [
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

const BUSINESS = {
  tattoo: {
    label: "Tattoo", look: "ink", pro: "artist", work: "tattoo",
    notesPlaceholder: "Your idea, placement, size, colour or black & grey…",
    idea: { title: "Describe your idea", placeholder: "What you'd like, the vibe, anything it means to you…", place: ["Placement", "e.g. inner forearm"], size: ["Rough size", "e.g. palm size, 4 inches"], style: true },
    consent: TATTOO_CONSENT,
    aftercare: TATTOO_AFTERCARE,
    starters: [
      { name: "Flash piece", description: "Pick any design from my flash sheets. Up to palm size.", durationMin: 60, priceCents: 15000, depositCents: 5000 },
      { name: "Small custom", description: "A custom design up to about 4 inches.", durationMin: 120, priceCents: 30000, depositCents: 7500 },
      { name: "Custom project", description: "Send me your idea and references and I'll reply with a quote.", durationMin: 180, priceCents: null, depositCents: 10000, mode: "consult" },
    ],
  },
  nails: {
    label: "Nails", look: "blush", pro: "nail tech", work: "nails",
    notesPlaceholder: "Nail shape & length, colours, inspo, or anything I should know…",
    idea: { title: "What would you like?", placeholder: "The look you're going for, colours, any inspo…", place: ["Shape & length", "e.g. short almond"], size: ["Colours", "e.g. milky pink, chrome"], style: false },
    consent: {
      intro: "A few quick checks before your appointment, so your nails are done safely.",
      statements: [
        "I have told my nail tech about any allergies, especially to acrylics, gels or adhesives.",
        "I don't have any infections, cuts or skin conditions on my hands or nails, or I have told my nail tech about them.",
        "I understand that removing enhancements at home can damage my natural nails.",
        "I will follow the aftercare advice I'm given.",
      ],
    },
    aftercare: [
      "Thanks for coming in! To keep your nails looking perfect:",
      "",
      "• Use cuticle oil every day. It keeps the product flexible and your nails healthy.",
      "• Wear gloves for cleaning and washing up.",
      "• Don't pick, bite or peel your gel. Book a removal instead so your natural nails stay strong.",
      "• If a nail lifts or breaks in the first 3 days, message me and I'll fix it.",
      "",
      "See you at your next fill!",
    ].join("\n"),
    starters: [
      { name: "Gel manicure", description: "Shape, cuticle care and a glossy gel colour of your choice.", durationMin: 60, priceCents: 4500, depositCents: 1500, addons: [{ name: "Gel removal", priceCents: 1000, durationMin: 15 }, { name: "Nail art (2 nails)", priceCents: 800, durationMin: 15 }] },
      { name: "BIAB + nail art", description: "Builder gel overlay for strength, plus nail art.", durationMin: 90, priceCents: 6500, depositCents: 2000, addons: [{ name: "Nail art on all 10", priceCents: 1500, durationMin: 30 }, { name: "Removal", priceCents: 1000, durationMin: 15 }] },
      { name: "Acrylic full set", description: "Full set with your choice of shape and length.", durationMin: 120, priceCents: 7000, depositCents: 2000 },
    ],
  },
  lashes: {
    label: "Lashes & brows", look: "latte", pro: "lash artist", work: "treatment",
    notesPlaceholder: "The look you want (natural, wispy, dramatic), contact lenses, sensitivities…",
    idea: { title: "What would you like?", placeholder: "The look you're going for, and any inspo…", place: ["Style", "e.g. wispy, natural"], size: ["Length or curl", "e.g. medium, C curl"], style: false },
    consent: {
      intro: "Before your treatment, please confirm the following so it's done safely.",
      statements: [
        "I have had a patch test, or will have one at least 48 hours before my appointment.",
        "I have told my artist about any allergies, eye conditions, recent eye surgery or sensitivity to adhesives or tints.",
        "I will remove contact lenses and eye makeup before the treatment.",
        "I understand that a reaction, although rare, is possible, and I will seek medical advice if my eyes become red, swollen or painful.",
        "I will follow the aftercare advice I'm given.",
      ],
    },
    aftercare: [
      "Thanks for coming in! Your lashes/brows will look their best if you:",
      "",
      "• Keep them dry for the first 24 hours: no steam, sauna or swimming.",
      "• Avoid oil-based makeup removers and cleansers near the eyes.",
      "• Brush your lashes gently every morning with a clean spoolie.",
      "• Don't rub, pull or pick at them.",
      "• Sleep on your back or use a silk pillowcase if you can.",
      "",
      "Book your infill for 2–3 weeks' time. See you soon!",
    ].join("\n"),
    starters: [
      { name: "Patch test", description: "Required before your first lash or tint treatment. 10 minutes, free.", durationMin: 15, priceCents: 0, depositCents: 0 },
      { name: "Classic lash full set", description: "One extension per natural lash. Soft and natural.", durationMin: 120, priceCents: 9000, depositCents: 2500, patchTestHours: 48 },
      { name: "Lash infill", description: "Within 3 weeks of your last set.", durationMin: 60, priceCents: 5000, depositCents: 1500, patchTestHours: 48 },
      { name: "Brow lamination + tint", description: "Lifted, fluffy brows that last 6–8 weeks.", durationMin: 45, priceCents: 5500, depositCents: 1500, patchTestHours: 48, addons: [{ name: "Brow wax & shape", priceCents: 1200, durationMin: 15 }] },
    ],
  },
  hair: {
    label: "Hair", look: "latte", pro: "stylist", work: "appointment",
    notesPlaceholder: "Your hair now, the look you want, any colour history…",
    idea: { title: "What would you like?", placeholder: "The look you're going for, your hair history, any inspo…", place: ["Current hair", "e.g. shoulder length, box dye"], size: ["Goal", "e.g. soft balayage"], style: false },
    consent: {
      intro: "A few checks before your appointment.",
      statements: [
        "I have had a skin allergy test for colour, or will have one at least 48 hours before my appointment.",
        "I have told my stylist about any allergies, scalp conditions or recent chemical treatments (including box dye).",
        "I understand colour results depend on my hair's history and condition, and may take more than one session.",
        "I will follow the aftercare advice I'm given.",
      ],
    },
    aftercare: [
      "Thanks for coming in! To keep your hair looking great:",
      "",
      "• Wait 48–72 hours before washing after colour.",
      "• Use a sulphate-free, colour-safe shampoo and conditioner.",
      "• Turn the heat down on your tools and use a heat protectant.",
      "• Book a gloss or toner in 6–8 weeks to keep the colour fresh.",
    ].join("\n"),
    starters: [
      { name: "Cut & blow dry", description: "Consultation, wash, cut and style.", durationMin: 60, priceCents: 6000, depositCents: 1500 },
      { name: "Colour & gloss", description: "Root colour or all-over colour, with a gloss.", durationMin: 120, priceCents: 12000, depositCents: 3000, patchTestHours: 48 },
      { name: "Balayage", description: "Hand-painted lightening for a soft, lived-in look. Send me your hair photos first.", durationMin: 240, priceCents: null, depositCents: 5000, mode: "consult" },
    ],
  },
  barber: {
    label: "Barber", look: "ink", pro: "barber", work: "cut",
    notesPlaceholder: "The cut you want, how short, anything I should know…",
    idea: { title: "What would you like?", placeholder: "The cut you want, and any inspo…", place: ["Style", "e.g. mid skin fade"], size: ["Beard", "e.g. line up and trim"], style: false },
    consent: {
      intro: "A quick check before your appointment.",
      statements: [
        "I have told my barber about any skin conditions, cuts or allergies on my scalp, face or neck.",
        "I understand shaving and razor work can cause irritation.",
      ],
    },
    aftercare: [
      "Thanks for coming in! A few tips:",
      "",
      "• Moisturise after a shave and avoid touching fresh line-ups.",
      "• Book your next cut in 2–3 weeks to keep it sharp.",
    ].join("\n"),
    starters: [
      { name: "Haircut", description: "Consultation, cut and style.", durationMin: 45, priceCents: 4000, depositCents: 1000, addons: [{ name: "Beard trim & line up", priceCents: 1500, durationMin: 15 }] },
      { name: "Skin fade", description: "Bald or skin fade with a sharp finish.", durationMin: 60, priceCents: 4500, depositCents: 1000 },
    ],
  },
};

const businessOf = (a) => BUSINESS[a.business_type] || BUSINESS.tattoo;

// What the frontend needs: wording and starter services, not the long templates.
function publicBusiness() {
  return Object.fromEntries(Object.entries(BUSINESS).map(([key, b]) => [key, {
    label: b.label, look: b.look, pro: b.pro, work: b.work, notesPlaceholder: b.notesPlaceholder, idea: b.idea, starters: b.starters,
    consent: b.consent, aftercare: b.aftercare,
  }]));
}

module.exports = { BUSINESS, LOOKS, businessOf, publicBusiness };
