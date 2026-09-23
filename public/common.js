// Small shared helpers. Everything user-supplied goes through textContent via
// h(), never innerHTML, so artist bios and client notes can't inject markup.

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// h("div.card", { onclick }, "text", childNode, ...)
function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  // Anything that isn't a plain attributes object (text, numbers — including
  // 0 — nodes, arrays) is really the first child.
  if (attrs !== undefined && attrs !== null &&
      (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className += " " + v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren() would print null/false as text, so conditional children
// (cond ? node : null) go through this instead.
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}

function money(cents, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function duration(min) {
  const hrs = Math.floor(min / 60), m = min % 60;
  return [hrs ? `${hrs} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

function fmt(iso, tz, opts) {
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }).format(new Date(iso));
}

function when(iso, tz) {
  return fmt(iso, tz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// "150" / "150.50" -> 15000 / 15050. Empty -> null.
function toCents(v) {
  const s = String(v ?? "").trim().replace(/[^0-9.]/g, "");
  if (!s) return null;
  return Math.round(parseFloat(s) * 100);
}
const fromCents = (c) => (c === null || c === undefined ? "" : (c / 100).toFixed(c % 100 ? 2 : 0));

function minToTime(m) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
function timeToMin(t) { const [a, b] = t.split(":").map(Number); return a * 60 + b; }
