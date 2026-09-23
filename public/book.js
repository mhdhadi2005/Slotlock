// An artist's public booking page: pick a service, a time, then send a request.
const handle = decodeURIComponent(location.pathname.split("/")[1] || "");
const bookingEl = document.getElementById("booking");
const base = `/api/public/artists/${encodeURIComponent(handle)}`;
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const state = {
  artist: null, services: [], service: null,
  days: [], from: null, today: null, date: null, slot: null, loadingDays: false, stripScroll: 0,
  form: { name: "", email: "", phone: "", instagram: "", notes: "", referenceUrl: "", agreed: false },
};

const listJoin = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dayLabel = (d, opts) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", ...opts });

async function init() {
  let data;
  try {
    data = await api(base);
  } catch {
    fill(document.getElementById("head"), h("h1.bp-name", { style: { marginTop: "90px" } }, "Page not found"), h("p.muted", "Check the link, or ask the artist for theirs."));
    return;
  }
  state.artist = data.artist;
  state.services = data.services;
  setAccent(data.artist.accent);
  renderHead();
  renderSaved();
  renderBooking();
}

function renderHead() {
  const a = state.artist;
  if (a.isDemo) {
    fill(document.getElementById("cover"), h("div.demo-ribbon",
      h("span", icon("sparkle", 14), "Example page: try booking, nothing is real. ", h("a", { href: "/signup" }, "Make your own →"))));
  }
  const refund = a.cancelWindowHours
    ? `Free cancellation up to ${a.cancelWindowHours >= 48 && a.cancelWindowHours % 24 === 0 ? `${a.cancelWindowHours / 24} days` : `${a.cancelWindowHours} hours`} before`
    : "Free cancellation until the appointment";
  fill(document.getElementById("head"),
    avatarEl(a.avatarUrl, a.displayName),
    h("h1.bp-name", a.displayName),
    h("div.bp-meta",
      a.location ? h("span", icon("pin", 15), a.location) : null,
      a.instagram ? h("a", { href: `https://instagram.com/${a.instagram}`, target: "_blank", rel: "noopener" }, icon("instagram", 15), "@" + a.instagram) : null),
    a.bio ? h("p.bp-bio", a.bio) : null,
    h("div.bp-tags",
      a.paymentMethods.length ? h("span.chip", icon("wallet", 14), `Deposit by ${listJoin(a.paymentMethods)}`) : null,
      h("span.chip", icon("shield", 14), refund)),
    a.portfolio.length ? h("div.portfolio", a.portfolio.map((url, i) =>
      h("button", { type: "button", "aria-label": `View piece ${i + 1}`, onclick: () => lightbox(url, `${a.displayName} portfolio piece`) },
        h("img", { src: url, alt: "", loading: i > 3 ? "lazy" : "eager" })))) : null,
  );
}

// Bookings made from this browser, so a client can find theirs again.
function renderSaved() {
  const mine = store.get("slotlock:bookings", [])
    .filter((b) => b.handle === handle && Date.parse(b.startsAt) > Date.now())
    .sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt));
  if (!mine.length) return;
  const b = mine[0];
  fill(document.getElementById("saved"), h("a.saved-booking", { href: `/booking/${b.token}` },
    icon("calcheck", 20),
    h("div.grow", h("b", "You have a booking here"), h("span", `${b.service} · ${when(b.startsAt, state.artist.timezone)}`)),
    icon("right", 18)));
}

function renderBooking() {
  const a = state.artist;
  if (!a.acceptingBookings) {
    return fill(bookingEl, h("div.card", { style: { marginTop: "28px" } }, h("div.notice", icon("info", 18),
      h("span", `${a.displayName} isn't taking online bookings right now. Message them directly to book.`))));
  }
  if (!state.services.length) {
    return fill(bookingEl, h("div.card.empty", { style: { marginTop: "28px" } }, h("div.empty-icon", icon("calendar", 24)),
      h("h3", "No services listed yet"), h("p", "Check back soon.")));
  }
  const strip = bookingEl.querySelector(".day-strip");
  if (strip) state.stripScroll = strip.scrollLeft;

  const step = state.slot ? 3 : state.service ? 2 : 1;
  fill(bookingEl, h("section.book-card",
    h("div.book-card-head", h("div.book-steps", ["Service", "Time", "Your details"].map((label, i) => h("div" + (i < step ? ".on" : ""), label)))),
    serviceSection(),
    state.service ? timeSection() : null,
    state.slot ? detailsSection() : null));

  const newStrip = bookingEl.querySelector(".day-strip");
  if (newStrip) newStrip.scrollLeft = state.stripScroll;
}

function scrollTo(id) {
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function priceBlock(s) {
  const cur = state.artist.currency;
  return h("div.svc-price", s.priceCents === null ? "Quoted" : money(s.priceCents, cur),
    h("small", s.depositCents ? `${money(s.depositCents, cur)} deposit` : "No deposit"));
}

function serviceSection() {
  const title = (extra) => h("div.book-section-title", h("span.n", "1"), "Choose a service", extra || null);
  if (state.service) {
    const s = state.service;
    return h("div.book-section",
      title(h("button.btn.ghost.sm", { type: "button", onclick: () => { Object.assign(state, { service: null, slot: null, date: null, days: [], from: null }); renderBooking(); } }, "Change")),
      h("div.picked", h("div.grow", h("b", s.name), h("span", duration(s.durationMin))), priceBlock(s)));
  }
  return h("div.book-section", title(),
    h("div.services", state.services.map((s) => h("button.service-card", {
      type: "button", disabled: !s.bookable,
      onclick: () => {
        Object.assign(state, { service: s, slot: null, date: null, days: [], from: null });
        loadDays(null);
        scrollTo("step-time");
      },
    },
      h("div.name", s.name),
      priceBlock(s),
      s.description ? h("div.desc", s.description) : null,
      h("div.tags",
        h("span.badge", icon("clock", 13), duration(s.durationMin)),
        s.bookable ? null : h("span.badge.warn", "Message to book"))))));
}

async function loadDays(from) {
  state.loadingDays = true;
  renderBooking();
  const q = new URLSearchParams({ service: state.service.id, days: 14 });
  if (from) q.set("from", from);
  try {
    const data = await api(`${base}/availability?${q}`);
    state.days = data.days;
    state.today = data.today;
    state.from = from;
    state.stripScroll = 0;
    if (!state.days.some((d) => d.date === state.date && d.slots.length)) {
      state.date = (state.days.find((d) => d.slots.length) || {}).date || null;
    }
  } catch (err) {
    toast(err.message, "error");
  } finally {
    state.loadingDays = false;
    renderBooking();
  }
}

function timeSection() {
  const tz = state.artist.timezone;
  const title = h("div.book-section-title", h("span.n", "2"), "Pick a time");
  if (state.loadingDays && !state.days.length) {
    return h("div.book-section", { id: "step-time" }, title, h("div.skeleton", { style: { height: "86px" } }), h("div.skeleton", { style: { height: "110px", marginTop: "14px" } }));
  }

  const first = state.days[0]?.date;
  const last = state.days[state.days.length - 1]?.date;
  const canBack = !!state.from && first > state.today;
  const canForward = state.days.length === 14;
  const monthDate = state.date || first;
  const nav = h("div.row.tight",
    h("button.btn.sm.icon-only", { type: "button", "aria-label": "Earlier dates", disabled: !canBack, onclick: () => { state.date = null; const back = addDays(first, -14); loadDays(back <= state.today ? null : back); } }, icon("left", 16)),
    h("button.btn.sm.icon-only", { type: "button", "aria-label": "Later dates", disabled: !canForward, onclick: () => { state.date = null; loadDays(addDays(last, 1)); } }, icon("right", 16)));

  const strip = h("div.day-strip", { role: "listbox", "aria-label": "Dates" }, state.days.map((d) => h("button.day" + (d.date === state.date ? ".selected" : ""), {
    type: "button", disabled: !d.slots.length, role: "option", "aria-selected": String(d.date === state.date),
    "aria-label": `${dayLabel(d.date, { weekday: "long", month: "long", day: "numeric" })}${d.slots.length ? "" : ", no openings"}`,
    onclick: () => { state.date = d.date; state.slot = null; renderBooking(); },
  }, h("span.dow", dayLabel(d.date, { weekday: "short" })), h("span.num", dayLabel(d.date, { day: "numeric" })), h("span.dot"))));

  const day = state.days.find((d) => d.date === state.date);
  let slotsView;
  if (!day) {
    slotsView = h("div.notice", { style: { marginTop: "14px" } }, icon("calendar", 18),
      h("span", "No openings in these two weeks. ", canForward ? h("button.link-btn", { type: "button", onclick: () => loadDays(addDays(last, 1)) }, "Try the next two weeks") : null));
  } else {
    const groups = [["Morning", "sun", []], ["Afternoon", "sunset", []], ["Evening", "moon", []]];
    for (const iso of day.slots) {
      const hour = Number(fmt(iso, tz, { hour: "numeric", hourCycle: "h23" }));
      groups[hour < 12 ? 0 : hour < 17 ? 1 : 2][2].push(iso);
    }
    slotsView = groups.filter((g) => g[2].length).map(([label, ic, list]) => h("div.slot-group",
      h("div.slot-group-title", icon(ic, 14), label),
      h("div.slots", list.map((iso) => h("button.slot" + (iso === state.slot ? ".selected" : ""), {
        type: "button", "aria-pressed": String(iso === state.slot),
        onclick: () => { state.slot = iso; renderBooking(); scrollTo("step-details"); },
      }, timeOnly(iso, tz))))));
  }

  return h("div.book-section", { id: "step-time" },
    title,
    h("div.month-row", h("b", dayLabel(monthDate, { month: "long", year: "numeric" })), nav),
    strip,
    slotsView,
    browserTz !== tz ? h("div.tz-note", icon("globe", 15), `Times are in the studio's timezone (${tz.replace(/_/g, " ")}).`) : null);
}

function detailsSection() {
  const a = state.artist, s = state.service, f = state.form;
  const cur = a.currency;
  const input = (key, attrs) => {
    const el = h(attrs.multiline ? "textarea" : "input", { ...attrs, multiline: null, value: attrs.multiline ? null : f[key] }, attrs.multiline ? f[key] : null);
    el.addEventListener("input", () => { f[key] = el.value; });
    return el;
  };
  const fieldOf = (label, el, hint) => { el.id = "b-" + label.toLowerCase().replace(/\W+/g, "-"); return h("div.field", h("label", { for: el.id }, label), el, hint ? h("div.hint", hint) : null); };
  const agree = h("input", { type: "checkbox", checked: f.agreed });
  agree.addEventListener("change", () => { f.agreed = agree.checked; });
  const error = h("div.form-error", { role: "alert" });
  const submit = h("button.btn.primary.lg.block", { type: "submit" },
    s.depositCents ? `Request booking` : "Confirm booking", icon("arrow", 18));

  const form = h("form", { novalidate: true },
    h("div.summary",
      h("div.summary-line", h("span", "Service"), h("b", s.name)),
      h("div.summary-line", h("span", "When"), h("b", when(state.slot, a.timezone))),
      h("div.summary-line", h("span", "Length"), h("span", duration(s.durationMin))),
      s.depositCents ? h("div.summary-line", h("span", "Deposit"), h("b", money(s.depositCents, cur))) : null),
    fieldOf("Your name", input("name", { autocomplete: "name", required: true })),
    fieldOf("Email", input("email", { type: "email", autocomplete: "email", required: true }), "Your booking details go here."),
    h("div.grid-2",
      fieldOf("Phone (optional)", input("phone", { type: "tel", autocomplete: "tel" })),
      fieldOf("Instagram (optional)", input("instagram", { placeholder: "@yourhandle", autocapitalize: "none" }))),
    fieldOf(`Tell ${a.displayName.split(" ")[0]} about it (optional)`, input("notes", { multiline: true, rows: 3, maxLength: 2000, placeholder: "Your idea, placement, size, colour or black & grey…" })),
    fieldOf("Reference link (optional)", input("referenceUrl", { type: "url", placeholder: "https://… Pinterest, Google Drive, an Instagram post" })),
    a.policy ? h("div.field", h("span.label", "Booking policy"), h("div.policy-box", a.policy),
      h("label.check", agree, "I've read and agree to the booking policy")) : null,
    error,
    submit,
    s.depositCents
      ? h("p.fine", `Next, you'll send the ${money(s.depositCents, cur)} deposit straight to ${a.displayName}${a.paymentMethods.length ? ` by ${listJoin(a.paymentMethods)}` : ""}. Your time is held for up to ${a.holdHours} hours while you do.`)
      : h("p.fine", "No deposit needed. You'll get a confirmation email straight away."));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    submit.classList.add("loading");
    try {
      const { redirectUrl } = await api(`${base}/bookings`, { method: "POST", body: {
        serviceId: s.id, start: state.slot, name: f.name, email: f.email, phone: f.phone, instagram: f.instagram,
        notes: f.notes, referenceUrl: f.referenceUrl, agreedToPolicy: f.agreed,
      } });
      const token = redirectUrl.split("/").pop();
      const saved = store.get("slotlock:bookings", []).filter((b) => Date.parse(b.startsAt) > Date.now()).slice(-20);
      saved.push({ token, handle, startsAt: state.slot, service: s.name });
      store.set("slotlock:bookings", saved);
      location.href = redirectUrl;
    } catch (err) {
      error.textContent = err.message;
      submit.classList.remove("loading");
      if (err.status === 409) { state.slot = null; loadDays(state.from); toast(err.message, "error"); }
    }
  });

  return h("div.book-section", { id: "step-details" }, h("div.book-section-title", h("span.n", "3"), "Your details"), form);
}

init();
