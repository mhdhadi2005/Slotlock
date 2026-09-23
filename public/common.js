// Shared helpers for every page. Everything user-supplied goes into the page
// through h() as text, never innerHTML, so bios, notes and names can't inject
// markup. The only innerHTML below is the fixed icon set.

async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Couldn't reach Slotlock. Check your connection and try again.");
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `Something went wrong (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let configPromise;
const getConfig = () => (configPromise ||= api("/api/config"));

// h("div.card", { onclick }, "text", childNode, [more, children])
function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs !== undefined && attrs !== null &&
      (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className += " " + v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of [children].flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren() would print null/false as text, so conditional children
// (cond ? node : null) go through this instead.
function fill(el, ...kids) {
  el.replaceChildren();
  return append(el, kids);
}

const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  calcheck: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  sliders: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  refund: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  banknote: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  bank: '<path d="m3 10 9-6 9 6"/><path d="M4 10v9"/><path d="M20 10v9"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/><path d="M2 21h20"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  sunset: '<path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="M16 18a4 4 0 0 0-8 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.6-.75 1.6-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2C19.5 16.38 22 13.87 22 10.6 22 5.76 17.5 2 12 2z"/>',
};

function icon(name, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor",
    "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "icon",
  })) svg.setAttribute(k, v);
  svg.innerHTML = ICONS[name] || "";
  return svg;
}

// Static pages mark icons with <i data-icon="calendar" data-size="20">.
function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll("i[data-icon]")) el.replaceWith(icon(el.dataset.icon, Number(el.dataset.size) || 18));
}

function toast(message, kind = "ok") {
  let wrap = document.getElementById("toasts");
  if (!wrap) {
    wrap = h("div", { id: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(wrap);
  }
  while (wrap.children.length >= 3) wrap.firstChild.remove();
  const t = h("div.toast." + kind, icon(kind === "error" ? "alert" : kind === "info" ? "info" : "check", 18), h("span", message));
  wrap.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, kind === "error" ? 5200 : 2800);
}

// modal({ title, lead, body, actions: [{ label, kind, value, onClick }] }) -> Promise
// An action's onClick can return false (or throw) to keep the dialog open.
function modal({ title, lead, body = [], actions = [{ label: "OK", kind: "primary", value: true }], wide = false }) {
  return new Promise((resolve) => {
    const dlg = h("dialog.modal" + (wide ? ".wide" : ""));
    const close = (value) => { dlg.close(); dlg.remove(); resolve(value); };
    const buttons = actions.map((a) => {
      if (a.spacer) return h("div.spacer");
      const btn = h("button.btn" + (a.kind ? "." + a.kind : ""), { type: "button" }, a.label);
      btn.addEventListener("click", async () => {
        if (a.onClick) {
          btn.classList.add("loading");
          try {
            if ((await a.onClick()) === false) return;
          } catch (err) {
            toast(err.message, "error");
            return;
          } finally {
            btn.classList.remove("loading");
          }
        }
        close(a.value);
      });
      return btn;
    });
    fill(dlg,
      h("div.modal-body", title ? h("h2.modal-title", title) : null, lead ? h("p.modal-lead", lead) : null, body),
      buttons.length ? h("div.modal-foot", buttons) : null);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(null); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(null); });
    document.body.append(dlg);
    dlg.showModal();
    const first = dlg.querySelector("input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, select");
    if (first && window.matchMedia("(pointer: fine)").matches) first.focus();
  });
}

const confirmDialog = (title, lead, { confirm = "Confirm", danger = false, cancel = "Not now" } = {}) =>
  modal({ title, lead, actions: [{ label: cancel, kind: "ghost", value: false }, { label: confirm, kind: danger ? "danger" : "primary", value: true }] });

function lightbox(src, alt = "") {
  const dlg = h("dialog.lightbox", h("img", { src, alt }));
  dlg.addEventListener("click", () => { dlg.close(); dlg.remove(); });
  dlg.addEventListener("cancel", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

async function copyText(text, message = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h("textarea", { style: { position: "fixed", opacity: "0" } }, text);
    document.body.append(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  toast(message);
}

// Runs fn with the button showing a spinner; errors become a toast.
async function busy(button, fn) {
  if (button) button.classList.add("loading");
  try {
    return await fn();
  } catch (err) {
    toast(err.message, "error");
    return undefined;
  } finally {
    if (button) button.classList.remove("loading");
  }
}

// Shrinks a photo in the browser before upload (phones take 5–12 MB photos).
async function resizeImage(file, { max = 1400, square = false, quality = 0.85 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a photo we can read. Try a JPG or PNG."));
      i.src = url;
    });
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (square) {
      const side = Math.min(sw, sh);
      sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side;
    }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function money(cents, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function currencySymbol(currency) {
  try {
    const part = new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() })
      .formatToParts(0).find((p) => p.type === "currency");
    return part ? part.value : currency.toUpperCase();
  } catch {
    return currency.toUpperCase();
  }
}

function duration(min) {
  const hrs = Math.floor(min / 60), m = min % 60;
  return [hrs ? `${hrs} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

function fmt(iso, tz, opts) {
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }).format(new Date(iso));
}
const when = (iso, tz) => fmt(iso, tz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const timeOnly = (iso, tz) => fmt(iso, tz, { hour: "numeric", minute: "2-digit" });

// "150" / "150.50" -> 15000 / 15050. Empty -> null.
function toCents(v) {
  const s = String(v ?? "").trim().replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = Math.round(parseFloat(s) * 100);
  return Number.isFinite(n) ? n : null;
}
const fromCents = (c) => (c === null || c === undefined ? "" : (c / 100).toFixed(c % 100 ? 2 : 0));

const minToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMin = (t) => { const [a, b] = String(t).split(":").map(Number); return a * 60 + b; };

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function avatarEl(url, name, cls = "") {
  return url
    ? h("img.avatar" + cls, { src: url, alt: "" })
    : h("div.avatar" + cls, { "aria-hidden": "true" }, initials(name));
}

// "5h 12m" / "2d 3h" / "8m"
function timeLeft(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "0m";
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${hr}h`;
  if (hr) return `${hr}h ${m % 60}m`;
  return `${m}m`;
}

function relTime(iso) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// localStorage can throw (private mode, blocked storage). Never let it break a page.
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

function setAccent(color) {
  if (color) document.documentElement.style.setProperty("--accent", color);
}

// The logo: a padlock whose body is a calendar with one booked slot (the
// icon), and "slotlock" with a keyhole and a booking dot for its o's.
const MARK_SVG = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><path d="M22 28v-7a10 10 0 0 1 20 0v7" fill="none" stroke="#1a0905" stroke-width="5" stroke-linecap="round"/><rect x="13" y="27" width="38" height="27" rx="6" fill="#1a0905"/><rect x="18.5" y="32" width="7" height="7" rx="2" fill="#ff7a4f" opacity=".55"/><rect x="28.5" y="32" width="7" height="7" rx="2" fill="#ff7a4f" opacity=".55"/><rect x="38.5" y="32" width="7" height="7" rx="2" fill="#ff7a4f" opacity=".55"/><rect x="18.5" y="42.5" width="7" height="7" rx="2" fill="#ff7a4f" opacity=".55"/><rect x="28.5" y="42.5" width="7" height="7" rx="2" fill="#ff7a4f" opacity=".55"/><rect x="38.5" y="42.5" width="7" height="7" rx="2" fill="#f5f0e8"/></svg>';
function brandMark() {
  const el = h("span.brand-mark");
  el.innerHTML = MARK_SVG;
  return el;
}
const wordmark = () => h("span.wordmark", { role: "img", "aria-label": "slotlock" }, "sl", h("span.wm-key"), "tl", h("span.wm-dot"), "ck");

document.addEventListener("DOMContentLoaded", () => hydrateIcons());
