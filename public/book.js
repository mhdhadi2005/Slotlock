const handle = location.pathname.split("/")[1];
const main = document.getElementById("main");
const state = { artist: null, services: [], service: null, days: [], from: null, date: null, slot: null };

async function init() {
  let data;
  try { data = await api(`/api/public/artists/${encodeURIComponent(handle)}`); }
  catch { fill(main, h("p", "This booking page doesn't exist.")); return; }
  Object.assign(state, { artist: data.artist, services: data.services, demo: data.demoPayments });
  const a = data.artist;
  document.title = `Book with ${a.displayName}`;

  fill(document.getElementById("head"), 
    h("h1", a.displayName),
    a.location ? h("div.muted", a.location) : null,
    a.instagram ? h("a.small", { href: `https://instagram.com/${a.instagram}`, target: "_blank", rel: "noopener" }, `@${a.instagram}`) : null,
    a.bio ? h("p", { style: "margin-top:1rem;white-space:pre-wrap" }, a.bio) : null,
  );

  if (new URLSearchParams(location.search).has("cancelled")) {
    main.before(h("div.notice", { style: "margin-bottom:1rem" }, "Payment cancelled, so the time wasn't booked. Pick a time to try again."));
  }
  if (!a.acceptingBookings) {
    fill(main, h("div.notice", `${a.displayName} isn't taking online bookings right now. Reach out to them directly.`));
    return;
  }
  renderServices();
}

function renderServices() {
  const cur = state.artist.currency;
  if (!state.services.length) {
    fill(main, h("div.notice", "No services are listed yet. Check back soon."));
    return;
  }
  fill(main, 
    h("h2", { style: "font-size:1.2rem" }, "1. Choose a service"),
    ...state.services.map((s) => h("button.card.service" + (state.service?.id === s.id ? ".selected" : ""), {
      disabled: !s.bookable,
      onclick: () => { state.service = s; state.date = null; state.slot = null; loadDays(null); },
    },
      h("b", s.name),
      s.description ? h("div.small.muted", { style: "margin-top:.3em;white-space:pre-wrap" }, s.description) : null,
      h("div.service-meta",
        h("span", duration(s.durationMin)),
        s.priceCents !== null ? h("span", money(s.priceCents, cur)) : h("span", "Price quoted"),
        s.depositCents ? h("span", `${money(s.depositCents, cur)} deposit`) : h("span", "No deposit"),
        s.bookable ? null : h("span", "Not bookable yet"),
      ),
    )),
    h("div", { id: "step2" }),
  );
}

async function loadDays(from) {
  renderServices();
  fill(document.getElementById("step2"), h("p.muted", "Finding open times…"));
  const q = new URLSearchParams({ service: state.service.id, days: 14 });
  if (from) q.set("from", from);
  const data = await api(`/api/public/artists/${encodeURIComponent(handle)}/availability?${q}`);
  state.days = data.days;
  state.from = from;
  if (!state.date) state.date = (state.days.find((d) => d.slots.length) || {}).date || null;
  renderTimes();
}

function renderTimes() {
  const tz = state.artist.timezone;
  const step2 = document.getElementById("step2");
  const lastDate = state.days.length ? state.days[state.days.length - 1].date : null;
  const firstDate = state.days.length ? state.days[0].date : null;
  const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const label = (d, opts) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", ...opts });

  const strip = h("div.days",
    state.from ? h("button.day", { "aria-label": "Earlier dates", onclick: () => { state.date = null; loadDays(addDays(firstDate, -14) <= todayIn(tz) ? null : addDays(firstDate, -14)); } }, h("b", "‹")) : null,
    state.days.map((d) => h("button.day" + (d.date === state.date ? ".selected" : ""), {
      disabled: !d.slots.length,
      onclick: () => { state.date = d.date; state.slot = null; renderTimes(); },
    }, h("small", label(d.date, { weekday: "short" })), h("b", label(d.date, { day: "numeric" })), h("small", label(d.date, { month: "short" })))),
    lastDate && state.days.length === 14 ? h("button.day", { "aria-label": "Later dates", onclick: () => { state.date = null; loadDays(addDays(lastDate, 1)); } }, h("b", "›")) : null,
  );

  const day = state.days.find((d) => d.date === state.date);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const slots = day ? h("div.slots", day.slots.map((iso) =>
    h("button.slot" + (iso === state.slot ? ".selected" : ""), { onclick: () => { state.slot = iso; renderTimes(); } },
      fmt(iso, tz, { hour: "numeric", minute: "2-digit" }))))
    : h("p.muted", "No open times in these dates. Try later dates →");

  fill(step2, 
    h("h2", { style: "font-size:1.2rem;margin-top:1.5rem" }, "2. Pick a time"),
    strip,
    day ? h("h3.muted", { style: "font-size:.95rem;margin:1rem 0 .5rem" }, label(day.date, { weekday: "long", month: "long", day: "numeric" })) : null,
    slots,
    browserTz !== tz ? h("p.small.muted", { style: "margin-top:.5rem" }, `Times are in the studio's timezone (${tz.replace(/_/g, " ")}).`) : null,
    h("div", { id: "step3" }),
  );
  if (state.slot) renderDetails();
}

function todayIn(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function renderDetails() {
  const a = state.artist, s = state.service;
  const inp = (attrs) => h("input", attrs);
  const name = inp({ autocomplete: "name", required: true });
  const email = inp({ type: "email", autocomplete: "email", required: true });
  const phone = inp({ type: "tel", autocomplete: "tel" });
  const instagram = inp({ placeholder: "@yourhandle" });
  const notes = h("textarea", { placeholder: "Your idea, placement, size, colour or black & grey…" });
  const ref = inp({ type: "url", placeholder: "https://… (Pinterest, Google Drive, Instagram post)" });
  const agree = h("input", { type: "checkbox" });
  const error = h("div.error", { role: "alert" });
  const submit = h("button.btn.primary.block", { type: "submit" },
    s.depositCents ? `Pay ${money(s.depositCents, a.currency)} deposit & book` : "Book appointment");

  const f = (l, input, hint) => { input.id = "b-" + l.replace(/\W/g, ""); return h("div.field", h("label", { for: input.id }, l), input, hint ? h("div.hint", hint) : null); };

  const form = h("form.card.stack", { novalidate: true },
    h("div",
      h("div.summary-line", h("span.muted", "Service"), h("b", s.name)),
      h("div.summary-line", h("span.muted", "When"), h("b", when(state.slot, a.timezone))),
      h("div.summary-line", h("span.muted", "Length"), h("span", duration(s.durationMin))),
      s.depositCents ? h("div.summary-line", h("span.muted", "Deposit due now"), h("b", money(s.depositCents, a.currency))) : null,
    ),
    f("Name", name), f("Email", email, "Your confirmation goes here."),
    h("div.row", f("Phone (optional)", phone), f("Instagram (optional)", instagram)),
    f("Tell us about it (optional)", notes),
    f("Reference link (optional)", ref),
    a.policy ? h("div", h("label", "Booking policy"), h("div.policy.notice", a.policy),
      h("label.check", { style: "margin-top:.6rem" }, agree, "I agree to the booking policy")) : null,
    s.depositCents && a.cancelWindowHours ? h("p.small.muted",
      `Cancel at least ${a.cancelWindowHours} hours before for a full deposit refund.`) : null,
    state.demo && s.depositCents ? h("p.small.muted", "Demo mode: no real payment will be taken.") : null,
    error, submit,
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    try {
      const { redirectUrl } = await api(`/api/public/artists/${encodeURIComponent(handle)}/bookings`, { method: "POST", body: {
        serviceId: s.id, start: state.slot, name: name.value, email: email.value, phone: phone.value,
        instagram: instagram.value, notes: notes.value, referenceUrl: ref.value, agreedToPolicy: agree.checked,
      }});
      location.href = redirectUrl;
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
      if (err.status === 409) { state.slot = null; loadDays(state.from); }
    }
  });

  fill(document.getElementById("step3"), h("h2", { style: "font-size:1.2rem;margin-top:1.5rem" }, "3. Your details"), form);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

init();
