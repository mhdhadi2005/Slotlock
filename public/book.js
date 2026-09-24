// An artist's public booking page: pick a service, a time, then send a request.
// Consultation services send the client's idea first instead; the same page at
// /request/:token then shows the artist's quote and lets the client book it.
const REQUEST_TOKEN = location.pathname.startsWith("/request/") ? decodeURIComponent(location.pathname.split("/")[2] || "") : null;
let handle = REQUEST_TOKEN ? "" : decodeURIComponent(location.pathname.split("/")[1] || "");
const bookingEl = document.getElementById("booking");
let base = `/api/public/artists/${encodeURIComponent(handle)}`;
const requestBase = REQUEST_TOKEN ? `/api/public/requests/${encodeURIComponent(REQUEST_TOKEN)}` : null;
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const state = {
  artist: null, services: [], service: null,
  days: [], from: null, today: null, date: null, slot: null, loadingDays: false, stripScroll: 0,
  form: { name: "", email: "", phone: "", instagram: "", notes: "", referenceUrl: "", agreed: false },
  idea: { idea: "", placement: "", size: "", style: "", photos: [] },
  request: null, joined: false,
  addons: new Set(), patchOk: false,
};

// The picked add-ons: extra minutes (which change what fits) and extra price.
function extras() {
  const list = state.service?.addons || [];
  const chosen = [...state.addons].sort((x, y) => x - y).map((i) => list[i]).filter(Boolean);
  return { chosen, minutes: chosen.reduce((n, x) => n + x.durationMin, 0), cents: chosen.reduce((n, x) => n + x.priceCents, 0) };
}

const listJoin = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dayLabel = (d, opts) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", ...opts });

async function init() {
  if (REQUEST_TOKEN) return initRequest();
  let data;
  try {
    data = await api(base);
  } catch {
    fill(document.getElementById("head"), h("h1.bp-name", { style: { marginTop: "90px" } }, "Page not found"), h("p.muted", "Check the link, or ask the artist for theirs."));
    return;
  }
  state.artist = data.artist;
  state.services = data.services;
  setLook(data.artist.look);
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
  if (REQUEST_TOKEN) return renderRequest();
  const a = state.artist;
  if (a.acceptingBookings && !a.booksOpen) return fill(bookingEl, closedCard());
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

  const consult = state.service?.mode === "consult";
  const step = state.slot ? 3 : state.service ? 2 : 1;
  const labels = consult ? ["Service", "Your idea"] : ["Service", "Time", "Your details"];
  fill(bookingEl, h("section.book-card",
    h("div.book-card-head", h("div.book-steps", labels.map((label, i) => h("div" + (i < step ? ".on" : ""), label)))),
    serviceSection(),
    consult ? ideaSection() : null,
    state.service && !consult ? timeSection() : null,
    state.slot ? detailsSection() : null));

  const newStrip = bookingEl.querySelector(".day-strip");
  if (newStrip) newStrip.scrollLeft = state.stripScroll;
}

function scrollTo(id) {
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function priceBlock(s) {
  const cur = state.artist.currency;
  if (s.mode === "consult") {
    return h("div.svc-price", s.priceCents === null ? "Quoted" : `From ${money(s.priceCents, cur)}`, h("small", "Consult first"));
  }
  return h("div.svc-price", s.priceCents === null ? "Quoted" : money(s.priceCents, cur),
    h("small", s.depositCents ? `${money(s.depositCents, cur)} deposit` : "No deposit"));
}

function serviceSection() {
  const title = (extra) => h("div.book-section-title", h("span.n", "1"), "Choose a service", extra || null);
  if (state.service) {
    const s = state.service, x = extras();
    const addons = s.addons?.length && s.mode !== "consult" ? h("div.addon-list", { style: { marginTop: "12px" } },
      h("span.label", "Add-ons"),
      s.addons.map((ad, i) => {
        const on = state.addons.has(i);
        const box = h("input", { type: "checkbox", checked: on });
        box.addEventListener("change", () => {
          if (box.checked) state.addons.add(i); else state.addons.delete(i);
          // A longer appointment may not fit the same times, so pick again.
          state.slot = null;
          loadDays(state.from);
        });
        return h("label.addon" + (on ? ".on" : ""), box,
          h("span", h("b", ad.name), ad.durationMin ? h("small", `+${duration(ad.durationMin)}`) : null),
          h("span.addon-price", ad.priceCents ? `+${money(ad.priceCents, state.artist.currency)}` : "Free"));
      })) : null;
    return h("div.book-section",
      title(h("button.btn.ghost.sm", { type: "button", onclick: () => { Object.assign(state, { service: null, slot: null, date: null, days: [], from: null, addons: new Set(), patchOk: false }); renderBooking(); } }, "Change")),
      h("div.picked", h("div.grow", h("b", s.name), h("span", duration(s.durationMin + x.minutes))), priceBlock(s)),
      addons);
  }
  return h("div.book-section", title(),
    h("div.services", state.services.map((s) => h("button.service-card", {
      type: "button", disabled: !s.bookable,
      onclick: () => {
        Object.assign(state, { service: s, slot: null, date: null, days: [], from: null });
        if (s.mode === "consult") { renderBooking(); scrollTo("step-idea"); return; }
        loadDays(null);
        scrollTo("step-time");
      },
    },
      h("div.name", s.name),
      priceBlock(s),
      s.description ? h("div.desc", s.description) : null,
      h("div.tags",
        s.mode === "consult" ? h("span.badge.accent", icon("message", 13), "Send your idea, get a quote") : h("span.badge", icon("clock", 13), duration(s.durationMin)),
        s.addons?.length && s.mode !== "consult" ? h("span.badge", icon("plus", 13), "Add-ons") : null,
        s.patchTestHours ? h("span.badge.warn", `Patch test ${s.patchTestHours}h before`) : null,
        s.bookable ? null : h("span.badge.warn", "Message to book"))))));
}

async function loadDays(from) {
  state.loadingDays = true;
  renderBooking();
  const q = new URLSearchParams({ days: 14 });
  if (!REQUEST_TOKEN) q.set("service", state.service.id);
  if (!REQUEST_TOKEN && state.addons.size) q.set("addons", [...state.addons].join(","));
  if (from) q.set("from", from);
  try {
    const data = await api(`${REQUEST_TOKEN ? requestBase : base}/availability?${q}`);
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
  if (REQUEST_TOKEN) return confirmQuoteSection();
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

  const x = extras();
  const patch = h("input", { type: "checkbox", checked: state.patchOk });
  patch.addEventListener("change", () => { state.patchOk = patch.checked; });
  const form = h("form", { novalidate: true },
    h("div.summary",
      h("div.summary-line", h("span", "Service"), h("b", s.name)),
      x.chosen.length ? h("div.summary-line", h("span", "Add-ons"), h("span", { style: { textAlign: "right" } }, x.chosen.map((ad) => ad.name).join(", "))) : null,
      h("div.summary-line", h("span", "When"), h("b", when(state.slot, a.timezone))),
      h("div.summary-line", h("span", "Length"), h("span", duration(s.durationMin + x.minutes))),
      s.priceCents !== null && x.cents ? h("div.summary-line", h("span", "Price"), h("span", money(s.priceCents + x.cents, cur))) : null,
      s.depositCents ? h("div.summary-line", h("span", "Deposit"), h("b", money(s.depositCents, cur))) : null),
    s.patchTestHours ? h("div.field", h("span.label", "Patch test"),
      h("label.check.patch-box", patch, h("span", `I've had a patch test with ${a.displayName.split(" ")[0]} in the last 6 months, or I'll have one at least ${s.patchTestHours} hours before this appointment.`))) : null,
    fieldOf("Your name", input("name", { autocomplete: "name", required: true })),
    fieldOf("Email", input("email", { type: "email", autocomplete: "email", required: true }), "Your booking details go here."),
    h("div.grid-2",
      fieldOf("Phone (optional)", input("phone", { type: "tel", autocomplete: "tel" })),
      fieldOf("Instagram (optional)", input("instagram", { placeholder: "@yourhandle", autocapitalize: "none" }))),
    fieldOf(`Tell ${a.displayName.split(" ")[0]} about it (optional)`, input("notes", { multiline: true, rows: 3, maxLength: 2000, placeholder: a.words?.notesPlaceholder || "Anything they should know…" })),
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
        addons: [...state.addons], patchTestOk: state.patchOk,
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

// ---- Books closed: the waitlist ------------------------------------------------

function closedCard() {
  const a = state.artist;
  const head = [h("div.status-icon.off", { style: { margin: "0 auto 14px" } }, icon("lock", 26)),
    h("h2.card-title", { style: { textAlign: "center", fontSize: "1.35rem" } }, "Books are closed"),
    h("p.muted.center", { style: { margin: "8px 0 0" } }, a.booksClosedMessage || `${a.displayName} isn't taking new bookings right now.`)];
  if (state.joined) {
    return h("section.card.closed-card", head, h("div.notice.ok", { style: { marginTop: "20px" } }, icon("check", 18),
      h("span", `You're on the list. ${firstWord(a.displayName)} will email you when books open.`)));
  }
  const email = h("input", { type: "email", autocomplete: "email", required: true, placeholder: "you@email.com", "aria-label": "Email" });
  const name = h("input", { autocomplete: "given-name", placeholder: "First name (optional)", "aria-label": "First name" });
  const error = h("div.form-error", { role: "alert" });
  const btn = h("button.btn.primary.lg.block", { type: "submit" }, icon("bell", 18), "Tell me when books open");
  const form = h("form", { novalidate: true, style: { marginTop: "22px" } }, h("div.stack-sm", name, email), error, btn,
    h("p.fine.center", { style: { marginTop: "10px" } }, "Just one email when books open. Leave any time."));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    btn.classList.add("loading");
    try {
      await api(`${base}/waitlist`, { method: "POST", body: { email: email.value, name: name.value } });
      state.joined = true;
      renderBooking();
    } catch (err) {
      error.textContent = err.message;
      btn.classList.remove("loading");
    }
  });
  return h("section.card.closed-card", head, form);
}

const firstWord = (s) => String(s).trim().split(/\s+/)[0];

// ---- Consultation: the client's idea ---------------------------------------------

const MAX_PHOTOS = 4;

function ideaSection() {
  const a = state.artist, f = state.form, d = state.idea;
  const w = a.words?.idea || { title: "Describe your idea", placeholder: "", place: ["Placement", ""], size: ["Rough size", ""], style: true };
  const bind = (obj, key, el) => { el.value = obj[key]; el.addEventListener("input", () => { obj[key] = el.value; }); return el; };
  const fieldOf = (label, el, hint) => { el.id ||= "i-" + label.toLowerCase().replace(/\W+/g, "-"); return h("div.field", h("label", { for: el.id }, label), el, hint ? h("div.hint", hint) : null); };
  const style = h("select", h("option", { value: "" }, "Choose…"), h("option", { value: "color" }, "Colour"), h("option", { value: "black_grey" }, "Black & grey"), h("option", { value: "unsure" }, "Not sure yet"));
  bind(d, "style", style);
  style.addEventListener("change", () => { d.style = style.value; });

  const photos = h("div.ref-photos");
  const picker = h("input.hidden", { type: "file", accept: "image/*", multiple: true });
  const drawPhotos = () => fill(photos,
    d.photos.map((src, i) => h("div.ref-photo", h("img", { src, alt: `Reference ${i + 1}` }),
      h("button", { type: "button", "aria-label": "Remove photo", onclick: () => { d.photos.splice(i, 1); drawPhotos(); } }, icon("x", 14)))),
    d.photos.length < MAX_PHOTOS ? h("button.ref-add", { type: "button", onclick: () => picker.click() }, icon("image", 20), h("span", "Add photo")) : null);
  picker.addEventListener("change", async () => {
    const files = [...picker.files].slice(0, MAX_PHOTOS - d.photos.length);
    picker.value = "";
    for (const file of files) {
      try { d.photos.push(await resizeImage(file, { max: 1280, quality: 0.8 })); } catch { toast("Couldn't read that photo. Try a JPG or PNG.", "error"); }
    }
    drawPhotos();
  });
  drawPhotos();

  const error = h("div.form-error", { role: "alert" });
  const submit = h("button.btn.primary.lg.block", { type: "submit" }, "Send my idea", icon("send", 18));
  const form = h("form", { novalidate: true },
    fieldOf(w.title, bind(d, "idea", h("textarea", { id: "i-idea", rows: 4, maxLength: 3000, required: true, placeholder: w.placeholder }))),
    h("div.grid-2",
      fieldOf(w.place[0], bind(d, "placement", h("input", { id: "i-placement", maxLength: 120, placeholder: w.place[1] }))),
      fieldOf(w.size[0], bind(d, "size", h("input", { id: "i-size", maxLength: 120, placeholder: w.size[1] })))),
    w.style ? fieldOf("Colour or black & grey?", style) : null,
    h("div.field", h("span.label", "Reference photos (optional)"), photos, picker,
      h("div.hint", `Up to ${MAX_PHOTOS}. Designs you like, or the spot you want it.`)),
    h("div.divider"),
    fieldOf("Your name", bind(f, "name", h("input", { autocomplete: "name", required: true }))),
    fieldOf("Email", bind(f, "email", h("input", { type: "email", autocomplete: "email", required: true })), `${firstWord(a.displayName)} replies with a quote here.`),
    h("div.grid-2",
      fieldOf("Phone (optional)", bind(f, "phone", h("input", { type: "tel", autocomplete: "tel" }))),
      fieldOf("Instagram (optional)", bind(f, "instagram", h("input", { placeholder: "@yourhandle", autocapitalize: "none" })))),
    error, submit,
    h("p.fine", `No payment yet. ${a.displayName} reviews your idea and replies with a price and a deposit to book. Then you pick a time.`));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    submit.classList.add("loading");
    try {
      const { redirectUrl } = await api(`${base}/requests`, { method: "POST", body: {
        serviceId: state.service.id, name: f.name, email: f.email, phone: f.phone, instagram: f.instagram,
        idea: d.idea, placement: d.placement, size: d.size, style: d.style, photos: d.photos,
      } });
      location.href = redirectUrl;
    } catch (err) {
      error.textContent = err.message;
      submit.classList.remove("loading");
    }
  });

  return h("div.book-section", { id: "step-idea" }, h("div.book-section-title", h("span.n", "2"), "Tell ", firstWord(a.displayName), " about it"), form);
}

// ---- /request/:token: status, quote, then pick a time ------------------------------

async function initRequest() {
  try {
    state.request = (await api(requestBase)).request;
  } catch {
    fill(document.getElementById("head"), h("h1.bp-name", { style: { marginTop: "90px" } }, "Request not found"), h("p.muted", "Check the link in your email."));
    return;
  }
  const r = state.request;
  state.artist = r.artist;
  setLook(r.artist.look);
  handle = r.artist.handle;
  base = `/api/public/artists/${encodeURIComponent(handle)}`;
  document.title = `Your request · ${r.artist.displayName}`;
  setAccent(r.artist.accent);
  renderHead();
  if (r.canBook && r.quote) {
    state.service = { name: r.serviceName, durationMin: r.quote.durationMin, depositCents: r.quote.depositCents, priceCents: r.quote.priceCents };
    loadDays(null);
  } else {
    renderRequest();
  }
}

function requestSummary(r) {
  return h("div.req-summary",
    h("p.pre", r.idea),
    h("div.row.tight", { style: { flexWrap: "wrap", marginTop: "10px" } },
      r.placement ? h("span.chip", icon("pin", 13), r.placement) : null,
      r.size ? h("span.chip", r.size) : null,
      r.styleLabel ? h("span.chip", r.styleLabel) : null),
    r.photos.length ? h("div.ref-photos.view", r.photos.map((src, i) => h("button.ref-photo", { type: "button", "aria-label": `View reference ${i + 1}`, onclick: () => lightbox(src, "Reference photo") }, h("img", { src, alt: "" })))) : null);
}

function renderRequest() {
  const r = state.request, a = state.artist, first = firstWord(a.displayName);
  const cur = r.currency;
  let top;
  if (r.canBook && r.quote) {
    const q = r.quote;
    const expired = r.booking && ["expired", "cancelled"].includes(r.booking.status);
    top = h("div.book-section",
      h("div.book-section-title", h("span.n", "1"), `${first}'s quote`),
      expired ? h("div.notice.warn", { style: { marginBottom: "14px" } }, icon("hourglass", 18), h("span", "Your last booking for this lapsed, but the quote still stands. Pick a new time below.")) : null,
      q.message ? h("div.quote-msg", avatarEl(a.avatarUrl, a.displayName), h("p.pre", q.message)) : null,
      h("div.summary", { style: { marginTop: "14px" } },
        h("div.summary-line", h("span", "Service"), h("b", r.serviceName)),
        q.priceCents !== null ? h("div.summary-line", h("span", "Price"), h("b", money(q.priceCents, cur))) : null,
        h("div.summary-line", h("span", "Session"), h("span", duration(q.durationMin))),
        h("div.summary-line", h("span", "Deposit to book"), h("b", q.depositCents ? money(q.depositCents, cur) : "None"))),
      h("details", { style: { marginTop: "12px" } }, h("summary.small.muted", { style: { cursor: "pointer" } }, "Your request"), requestSummary(r)));
    return fill(bookingEl, h("section.book-card",
      h("div.book-card-head", h("div.book-steps", ["Quote", "Time", "Confirm"].map((label, i) => h("div" + (i < (state.slot ? 3 : 2) ? ".on" : ""), label)))),
      top, timeSection(), state.slot ? detailsSection() : null));
  }

  let hero;
  if (r.status === "new") {
    hero = [h("div.status-icon.wait", icon("send", 26)), h("h1", "Request sent"),
      h("p", `${a.displayName} will look at your idea and reply with a quote${a.isDemo ? "" : " by email"}. You can check back here any time.`)];
  } else if (r.status === "declined") {
    hero = [h("div.status-icon.off", icon("x", 26)), h("h1", `${first} can't take this one`), h("p", r.declineReason ? `“${r.declineReason}”` : "Thanks for thinking of them.")];
  } else if (r.status === "withdrawn") {
    hero = [h("div.status-icon.off", icon("x", 26)), h("h1", "Request withdrawn"), h("p", "You withdrew this request.")];
  } else {
    hero = [h("div.status-icon.ok", icon("calcheck", 26)), h("h1", "Booked from this request"),
      h("p", r.booking ? `Your appointment: ${r.booking.when}.` : "")];
  }
  const withdraw = r.status === "new"
    ? h("button.btn.ghost.sm", { type: "button", onclick: async () => {
      if (!(await confirmDialog("Withdraw your request?", `${first} won't reply to it.`, { confirm: "Withdraw", danger: true }))) return;
      await busy(null, async () => { state.request = (await api(`${requestBase}/withdraw`, { method: "POST", body: {} })).request; renderRequest(); });
    } }, "Withdraw request") : null;

  fill(bookingEl,
    h("div.status-hero", hero),
    r.booking && r.status === "booked" ? h("a.btn.primary", { href: `/booking/${r.booking.token}`, style: { marginTop: "4px" } }, "See your booking", icon("arrow", 16)) : null,
    ["declined", "withdrawn"].includes(r.status) ? h("a.btn", { href: `/${a.handle}` }, `Back to ${first}'s page`) : null,
    h("section.card", { style: { marginTop: "22px" } }, h("div.card-head", h("div", h("h2.card-title", "Your request"), h("p.card-sub", r.serviceName))), requestSummary(r),
      withdraw ? h("div", { style: { marginTop: "16px" } }, withdraw) : null),
    r.status === "new" ? h("p.fine.center", { style: { marginTop: "22px" } }, "Bookmark this page to check on your request. ",
      h("button.link-btn", { type: "button", onclick: () => copyText(location.href, "Link copied") }, "Copy link")) : null);
}

function confirmQuoteSection() {
  const a = state.artist, s = state.service, f = state.form;
  const agree = h("input", { type: "checkbox", checked: f.agreed });
  agree.addEventListener("change", () => { f.agreed = agree.checked; });
  const error = h("div.form-error", { role: "alert" });
  const submit = h("button.btn.primary.lg.block", { type: "submit" }, s.depositCents ? "Book this time" : "Confirm booking", icon("arrow", 18));
  const form = h("form", { novalidate: true },
    h("div.summary",
      h("div.summary-line", h("span", "When"), h("b", when(state.slot, a.timezone))),
      h("div.summary-line", h("span", "Session"), h("span", duration(s.durationMin))),
      s.depositCents ? h("div.summary-line", h("span", "Deposit"), h("b", money(s.depositCents, a.currency))) : null),
    a.policy ? h("div.field", h("span.label", "Booking policy"), h("div.policy-box", a.policy), h("label.check", agree, "I've read and agree to the booking policy")) : null,
    error, submit,
    s.depositCents ? h("p.fine", `Next, you'll send the ${money(s.depositCents, a.currency)} deposit straight to ${a.displayName}. Your time is held for up to ${a.holdHours} hours while you do.`) : null);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    submit.classList.add("loading");
    try {
      const { redirectUrl } = await api(`${requestBase}/book`, { method: "POST", body: { start: state.slot, agreedToPolicy: f.agreed } });
      location.href = redirectUrl;
    } catch (err) {
      error.textContent = err.message;
      submit.classList.remove("loading");
      if (err.status === 409) { state.slot = null; loadDays(state.from); toast(err.message, "error"); }
    }
  });
  return h("div.book-section", { id: "step-details" }, h("div.book-section-title", h("span.n", "3"), "Confirm"), form);
}

init();
