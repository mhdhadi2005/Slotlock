// How clients send an artist their deposit. Slotlock never handles the money:
// the artist lists the ways they already get paid, the client pays them
// directly, and the artist confirms it arrived.

const TYPES = {
  paypal:  { label: "PayPal",        hint: "Your paypal.me name",             kind: "handle" },
  venmo:   { label: "Venmo",         hint: "@username",                        kind: "handle" },
  cashapp: { label: "Cash App",      hint: "$cashtag",                         kind: "handle" },
  zelle:   { label: "Zelle",         hint: "Email or phone number",            kind: "text" },
  revolut: { label: "Revolut",       hint: "Your revolut.me name",             kind: "handle" },
  monzo:   { label: "Monzo",         hint: "Your monzo.me name",               kind: "handle" },
  upi:     { label: "UPI",           hint: "yourname@bank",                    kind: "upi" },
  bank:    { label: "Bank transfer", hint: "Name, account number, sort code or IBAN", kind: "longtext" },
  link:    { label: "Payment link",  hint: "https://… (Stripe, Square, Ko-fi…)", kind: "url" },
  other:   { label: "Other",         hint: "How clients should pay you",       kind: "longtext" },
};

const MAX_METHODS = 6;

// Currencies each app can prefill an amount in. Anything else links to the
// profile without an amount, and the page shows the amount next to it.
const PAYPAL_CURRENCIES = new Set(["usd", "eur", "gbp", "cad", "aud", "nzd", "jpy", "chf", "sek", "nok",
  "dkk", "pln", "sgd", "hkd", "mxn", "brl", "ils", "php", "thb", "czk", "huf", "twd", "myr"]);
const CASHAPP_CURRENCIES = new Set(["usd", "gbp"]);

const HANDLE_PREFIXES = {
  paypal: /^(paypal\.me|(www\.)?paypal\.com\/paypalme)\//i,
  venmo: /^(account\.)?venmo\.com\/(u\/)?/i,
  cashapp: /^cash\.app\//i,
  revolut: /^revolut\.me\//i,
  monzo: /^monzo\.me\//i,
};

// Artists paste all sorts: "@rosa", "$rosa", "https://paypal.me/rosa/20".
// Keep just the name.
function cleanHandle(type, raw) {
  let v = String(raw || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (HANDLE_PREFIXES[type]) v = v.replace(HANDLE_PREFIXES[type], "");
  return v.split(/[/?#]/)[0].replace(/^[@$]/, "");
}

const isHttpUrl = (s) => {
  try { return ["http:", "https:"].includes(new URL(s).protocol); } catch { return false; }
};

function badInput(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// Validates what the dashboard sends. Throws a 400 with a readable message.
function normalizeMethods(input) {
  if (!Array.isArray(input)) throw badInput("Payment methods must be a list.");
  if (input.length > MAX_METHODS) throw badInput(`Add up to ${MAX_METHODS} payment methods.`);
  return input.map((m) => {
    const def = TYPES[m && m.type];
    if (!def) throw badInput("Unknown payment method.");
    const raw = typeof m.value === "string" ? m.value.trim() : "";
    let value;
    switch (def.kind) {
      case "handle":
        value = cleanHandle(m.type, raw);
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(value)) throw badInput(`Enter a valid ${def.label} username.`);
        break;
      case "upi":
        value = raw;
        if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(value)) throw badInput("Enter a UPI ID like name@bank.");
        break;
      case "url":
        value = raw;
        if (!isHttpUrl(value) || value.length > 500) throw badInput("Payment links must start with https://");
        break;
      case "text":
        value = raw.slice(0, 120);
        if (!value) throw badInput(`Enter your ${def.label} details.`);
        break;
      default:
        value = raw.slice(0, 600);
        if (!value) throw badInput(`Enter your ${def.label} details.`);
    }
    return { type: m.type, value };
  });
}

function parseMethods(json) {
  try {
    const list = JSON.parse(json || "[]");
    return Array.isArray(list) ? list.filter((m) => m && TYPES[m.type] && typeof m.value === "string") : [];
  } catch {
    return [];
  }
}

const amountStr = (cents) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));

// The link a client taps to pay. Built here from validated values rather than
// taken from input, so only these known destinations ever reach the page.
function methodHref(m, { amountCents, currency, ref, payee }) {
  const v = encodeURIComponent(m.value);
  const amount = amountStr(amountCents);
  switch (m.type) {
    case "paypal":
      return PAYPAL_CURRENCIES.has(currency) && amountCents
        ? `https://paypal.me/${v}/${amount}${currency.toUpperCase()}`
        : `https://paypal.me/${v}`;
    case "venmo":
      return `https://venmo.com/u/${v}`;
    case "cashapp":
      return CASHAPP_CURRENCIES.has(currency) && amountCents ? `https://cash.app/$${v}/${amount}` : `https://cash.app/$${v}`;
    case "revolut":
      return `https://revolut.me/${v}`;
    case "monzo":
      return currency === "gbp" && amountCents
        ? `https://monzo.me/${v}/${amount}?d=${encodeURIComponent(ref)}`
        : `https://monzo.me/${v}`;
    case "upi": {
      const q = new URLSearchParams({ pa: m.value, pn: payee, tn: ref });
      if (currency === "inr" && amountCents) { q.set("am", amount); q.set("cu", "INR"); }
      return `upi://pay?${q}`;
    }
    case "link":
      return m.value;
    default:
      return null; // Zelle, bank transfer, other: details to copy, no link
  }
}

function methodDisplay(m) {
  switch (m.type) {
    case "paypal": return `paypal.me/${m.value}`;
    case "venmo": return `@${m.value}`;
    case "cashapp": return `$${m.value}`;
    case "revolut": return `revolut.me/${m.value}`;
    case "monzo": return `monzo.me/${m.value}`;
    case "link":
      try { return new URL(m.value).host.replace(/^www\./, ""); } catch { return m.value; }
    default: return m.value;
  }
}

// What the client sees on their booking page, with this booking's amount and
// reference baked into each link. Demo pages get no links at all: the demo's
// usernames are made up, and a visitor must never be sent to pay a stranger.
function methodsForBooking(methods, { amountCents, currency, ref, payee, demo }) {
  return methods.map((m) => ({
    type: m.type,
    label: TYPES[m.type].label,
    display: methodDisplay(m),
    href: demo ? null : methodHref(m, { amountCents, currency, ref, payee }),
    copy: ["zelle", "bank", "upi", "other"].includes(m.type) ? m.value : null,
  }));
}

const publicTypes = () => Object.entries(TYPES).map(([type, t]) => ({ type, label: t.label, hint: t.hint, multiline: t.kind === "longtext" }));

module.exports = { TYPES, MAX_METHODS, normalizeMethods, parseMethods, methodHref, methodDisplay, methodsForBooking, publicTypes, cleanHandle };
