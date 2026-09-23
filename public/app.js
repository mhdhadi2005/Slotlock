let me = null;
const view = document.getElementById("view");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function loadMe() {
  me = (await api("/api/me")).artist;
  document.getElementById("view-page").href = me.bookingUrl;
  renderBanner();
}

function renderBanner() {
  const b = document.getElementById("banner");
  fill(b);
  if (!me.billing.active) {
    b.append(h("div.notice.warn", { style: "margin-bottom:1rem" },
      "Your free trial has ended, so your page isn't taking new bookings. ",
      h("a", { href: "#billing" }, "Subscribe to turn it back on →")));
  } else if (!me.billing.subscribed && me.billing.trialDaysLeft <= 3) {
    b.append(h("div.notice", { style: "margin-bottom:1rem" },
      `${me.billing.trialDaysLeft} day${me.billing.trialDaysLeft === 1 ? "" : "s"} left in your free trial. `,
      h("a", { href: "#billing" }, "Subscribe")));
  }
  if (me.stripe.mode === "demo") {
    b.append(h("div.notice", { style: "margin-bottom:1rem" },
      h("b", "Demo mode: "), "Stripe isn't configured on this server, so deposits and billing are simulated. Nothing gets charged."));
  }
}

function field(labelText, input, hint) {
  if (!input.id) input.id = "f-" + Math.random().toString(36).slice(2);
  return h("div.field", h("label", { for: input.id }, labelText), input, hint ? h("div.hint", hint) : null);
}

function withSave(button, fn) {
  return async (e) => {
    e?.preventDefault();
    const original = button.textContent;
    button.disabled = true;
    try {
      await fn();
      button.textContent = "Saved ✓";
      setTimeout(() => { button.textContent = original; button.disabled = false; }, 1200);
    } catch (err) {
      alert(err.message);
      button.textContent = original;
      button.disabled = false;
    }
  };
}

// ---- Home / setup ----------------------------------------------------------

async function renderSetup() {
  const [{ services }, { rules }, stats] = await Promise.all([
    api("/api/services"), api("/api/availability"), api("/api/bookings/stats"),
  ]);
  const hasServices = services.some((s) => s.active);
  const hasHours = rules.length > 0;
  const hasProfile = !!(me.bio || me.location);
  const stripeDone = me.stripe.depositsReady;
  const needsDeposits = services.some((s) => s.active && s.depositCents > 0);

  const linkInput = h("input", { value: me.bookingUrl, readOnly: true, onclick: (e) => e.target.select() });
  const copyBtn = h("button.btn.small", { onclick: async () => {
    try { await navigator.clipboard.writeText(me.bookingUrl); copyBtn.textContent = "Copied ✓"; }
    catch { linkInput.select(); }
    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
  } }, "Copy");

  const item = (done, title, desc, action) =>
    h("li", h("span.dot" + (done ? ".done" : ""), done ? "✓" : ""), h("div", h("b", title), h("div.small.muted", desc)), action);

  let stripeAction = null;
  if (me.stripe.mode === "live" && !stripeDone) {
    const btn = h("button.btn.primary.small", { onclick: async () => {
      btn.disabled = true;
      try { location.href = (await api("/api/stripe/connect", { method: "POST", body: {} })).url; }
      catch (err) { alert(err.message); btn.disabled = false; }
    } }, me.stripe.connected ? "Finish setup" : "Connect");
    stripeAction = btn;
  }

  fill(view, 
    h("h1", `Hi, ${me.displayName}`),
    h("div.grid3", { style: "margin-bottom:1rem" },
      h("div.card", h("div.small.muted", "Upcoming bookings"), h("div.stat", stats.upcoming)),
      h("div.card", h("div.small.muted", "Deposits this month"), h("div.stat", money(stats.depositsThisMonthCents, stats.currency))),
      h("div.card", h("div.small.muted", "Kept from late cancels"), h("div.stat", money(stats.keptFromCancellationsCents, stats.currency))),
    ),
    h("div.card.stack",
      h("h2", { style: "font-size:1.2rem" }, "Your booking link"),
      h("div.linkbox", linkInput, copyBtn),
      h("p.small.muted", "Put this in your Instagram bio, stories and DM replies."),
    ),
    h("div.card", { style: "margin-top:1rem" },
      h("h2", { style: "font-size:1.2rem" }, "Setup"),
      h("ul.checklist",
        item(true, "Create your page", "Done."),
        item(hasServices, "Add your services", "Length, price and deposit for each thing you book.", hasServices ? null : h("a.btn.small", { href: "#services" }, "Add")),
        item(hasHours, "Set your hours", "Which days and times clients can book.", h("a.btn.small", { href: "#hours" }, hasHours ? "Edit" : "Set")),
        item(stripeDone || !needsDeposits, "Get paid deposits",
          me.stripe.mode === "demo" ? "Demo mode: deposits are simulated." :
          stripeDone ? "Stripe connected. Deposits go to your account." : "Connect Stripe so deposits land in your bank.",
          stripeAction),
        item(hasProfile, "Finish your profile", "Bio, studio address and cancellation policy.", hasProfile ? null : h("a.btn.small", { href: "#settings" }, "Edit")),
      ),
    ),
  );
}

// ---- Bookings --------------------------------------------------------------

let bookingScope = "upcoming";
async function renderBookings() {
  const { bookings } = await api(`/api/bookings?scope=${bookingScope}`);
  const tabs = h("div.tabs", ["upcoming", "past", "cancelled"].map((s) =>
    h("button" + (s === bookingScope ? ".active" : ""), { onclick: () => { bookingScope = s; renderBookings(); } },
      s[0].toUpperCase() + s.slice(1))));

  const list = bookings.length ? bookings.map(bookingCard) :
    [h("div.card.muted", bookingScope === "upcoming" ? "No upcoming bookings yet. Share your link to get some!" : "Nothing here.")];

  // Group upcoming by day for a calendar-ish scan.
  const out = [];
  let lastDay = "";
  for (let i = 0; i < bookings.length; i++) {
    const day = fmt(bookings[i].startsAt, me.timezone, { weekday: "long", month: "long", day: "numeric" });
    if (day !== lastDay) { out.push(h("h3.muted", { style: "font-size:.95rem;margin:1.2rem 0 .5rem" }, day)); lastDay = day; }
    out.push(list[i]);
  }
  fill(view, h("h1", "Bookings"), tabs, h("div.stack", bookings.length ? out : list));
}

function bookingCard(b) {
  const time = `${fmt(b.startsAt, me.timezone, { hour: "numeric", minute: "2-digit" })} – ${fmt(b.endsAt, me.timezone, { hour: "numeric", minute: "2-digit" })}`;
  let depositPill = null;
  if (b.depositCents > 0) {
    depositPill = b.refunded ? h("span.pill", "Deposit refunded")
      : b.depositPaid ? h("span.pill.ok", `${money(b.depositCents, b.currency)} paid`)
      : h("span.pill.warn", "Unpaid");
  }
  const canCancel = b.status === "confirmed" && Date.parse(b.startsAt) > Date.now();
  const kv = (k, v) => v ? h("div.kv", h("b", k + ": "), v) : null;
  return h("div.card.booking",
    h("div.booking-head", h("b", `${time} · ${b.serviceName}`), h("span.bar-actions",
      depositPill, b.status === "cancelled" ? h("span.pill.bad", `Cancelled by ${b.cancelledBy}`) : null)),
    h("div", { style: "font-size:1.05rem" }, b.clientName),
    kv("Email", h("a", { href: `mailto:${b.clientEmail}` }, b.clientEmail)),
    kv("Phone", b.clientPhone ? h("a", { href: `tel:${b.clientPhone}` }, b.clientPhone) : null),
    kv("Instagram", b.clientInstagram),
    kv("Notes", b.notes),
    kv("Reference", b.referenceUrl ? h("a", { href: b.referenceUrl, target: "_blank", rel: "noopener noreferrer" }, b.referenceUrl) : null),
    canCancel ? h("div", { style: "margin-top:.6rem" }, h("button.btn.danger.small", { onclick: () => cancelAsArtist(b) }, "Cancel booking")) : null,
  );
}

async function cancelAsArtist(b) {
  if (!confirm(`Cancel ${b.clientName}'s booking? They'll get an email.`)) return;
  let refund = true;
  if (b.depositPaid) refund = confirm(`Refund their ${money(b.depositCents, b.currency)} deposit?\n\nOK = refund, Cancel = keep it`);
  try {
    await api(`/api/bookings/${b.id}/cancel`, { method: "POST", body: { refund } });
    renderBookings();
  } catch (err) { alert(err.message); }
}

// ---- Services --------------------------------------------------------------

async function renderServices() {
  const { services } = await api("/api/services");
  const cur = me.currency.toUpperCase();

  function form(s = {}) {
    const name = h("input", { value: s.name || "", placeholder: "e.g. Small custom (palm size)" });
    const desc = h("textarea", { placeholder: "What's included, sizing, anything clients should know" }, s.description || "");
    const dur = h("select", [30, 60, 90, 120, 180, 240, 300, 360, 480].concat(s.durationMin && ![30, 60, 90, 120, 180, 240, 300, 360, 480].includes(s.durationMin) ? [s.durationMin] : [])
      .map((m) => h("option", { value: m, selected: m === (s.durationMin || 120) }, duration(m))));
    const price = h("input", { value: fromCents(s.priceCents), inputMode: "decimal", placeholder: "Leave blank if quoted" });
    const deposit = h("input", { value: fromCents(s.depositCents ?? 5000), inputMode: "decimal" });
    const active = h("input", { type: "checkbox", checked: s.active !== false });
    const save = h("button.btn.primary.small", { type: "submit" }, s.id ? "Save" : "Add service");
    const f = h("form.card.stack",
      field("Name", name),
      field("Description", desc),
      h("div.row", field("Length", dur), field(`Price (${cur})`, price, "Shown to clients."), field(`Deposit (${cur})`, deposit, "Paid when booking. 0 = no deposit.")),
      s.id ? h("label.check", active, "Show on my booking page") : null,
      h("div.row", { style: "justify-content:space-between;align-items:center" },
        h("div", { style: "flex:0 0 auto" }, save),
        s.id ? h("button.btn.danger.small", { type: "button", style: "flex:0 0 auto", onclick: async () => {
          if (!confirm(`Delete "${s.name}"?`)) return;
          await api(`/api/services/${s.id}`, { method: "DELETE" });
          renderServices();
        } }, "Delete") : null),
    );
    f.addEventListener("submit", withSave(save, async () => {
      const body = {
        name: name.value, description: desc.value, durationMin: Number(dur.value),
        priceCents: toCents(price.value), depositCents: toCents(deposit.value) ?? 0,
      };
      if (s.id) body.active = active.checked;
      await api(s.id ? `/api/services/${s.id}` : "/api/services", { method: s.id ? "PATCH" : "POST", body });
      if (!s.id) renderServices();
    }));
    return f;
  }

  fill(view, 
    h("h1", "Services"),
    h("p.muted", "Everything clients can book. The length decides which openings fit, and the deposit is what they pay to lock the slot in."),
    h("div.stack", services.map((s) => form(s))),
    h("h2", { style: "font-size:1.2rem;margin-top:2rem" }, "Add a service"),
    form(),
  );
}

// ---- Hours -----------------------------------------------------------------

async function renderHours() {
  const { rules, blocked } = await api("/api/availability");
  const byDay = Object.fromEntries(rules.map((r) => [r.weekday, r]));
  const rows = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const r = byDay[wd];
    const on = h("input", { type: "checkbox", checked: !!r });
    const start = h("input", { type: "time", step: 900, value: minToTime(r ? r.startMin : 660), "aria-label": `${DAYS[wd]} opens` });
    const end = h("input", { type: "time", step: 900, value: minToTime(r ? r.endMin : 1140), "aria-label": `${DAYS[wd]} closes` });
    const sync = () => { start.disabled = end.disabled = !on.checked; };
    on.addEventListener("change", sync); sync();
    return { wd, on, start, end, el: h("div.day-row", h("label.check", on, DAYS[wd]), start, end) };
  });

  const days = [...blocked];
  const chips = h("div.chips");
  const drawChips = () => fill(chips, ...(days.length ? days.sort().map((d) =>
    h("span.chip", new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
      h("button", { type: "button", "aria-label": `Remove ${d}`, onclick: () => { days.splice(days.indexOf(d), 1); drawChips(); } }, "×")))
    : [h("span.small.muted", "No days off added.")]));
  drawChips();
  const dateInput = h("input", { type: "date", min: new Date().toISOString().slice(0, 10) });
  const addBtn = h("button.btn.small", { type: "button", onclick: () => {
    if (dateInput.value && !days.includes(dateInput.value)) { days.push(dateInput.value); drawChips(); }
    dateInput.value = "";
  } }, "Add day off");

  const save = h("button.btn.primary", "Save hours");
  save.addEventListener("click", withSave(save, async () => {
    const out = [];
    for (const r of rows) {
      if (!r.on.checked) continue;
      const startMin = timeToMin(r.start.value), endMin = timeToMin(r.end.value);
      if (endMin <= startMin) throw new Error(`${DAYS[r.wd]}: closing time must be after opening time.`);
      out.push({ weekday: r.wd, startMin, endMin });
    }
    await api("/api/availability", { method: "PUT", body: { rules: out, blocked: days } });
  }));

  fill(view, 
    h("h1", "Hours"),
    h("p.muted", `When clients can book, in your timezone (${me.timezone.replace(/_/g, " ")}). Appointments must fit inside these hours.`),
    h("div.card", rows.map((r) => r.el)),
    h("div.card.stack", { style: "margin-top:1rem" },
      h("h2", { style: "font-size:1.2rem" }, "Days off"),
      h("p.small.muted", "Guest spots, conventions, holidays. Nobody can book these dates."),
      h("div.linkbox", dateInput, addBtn),
      chips,
    ),
    h("div", { style: "margin-top:1rem" }, save),
  );
}

// ---- Settings --------------------------------------------------------------

function renderSettings() {
  const i = (v, attrs = {}) => h("input", { value: v ?? "", ...attrs });
  const displayName = i(me.displayName);
  const handle = i(me.handle, { autocapitalize: "none", spellcheck: false });
  const bio = h("textarea", { maxLength: 600 }, me.bio);
  const location = i(me.location, { placeholder: "Studio name, street, city" });
  const instagram = i(me.instagram, { placeholder: "yourhandle" });
  const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];
  if (!zones.includes(me.timezone)) zones.unshift(me.timezone);
  const tz = h("select", zones
    .map((z) => h("option", { value: z, selected: z === me.timezone }, z.replace(/_/g, " "))));
  const currency = h("select", ["usd", "cad", "gbp", "eur", "aud", "nzd"].map((c) => h("option", { value: c, selected: c === me.currency }, c.toUpperCase())));
  const policy = h("textarea", { maxLength: 2000, placeholder: "e.g. Deposits go toward the final price. Cancel or reschedule at least 48 hours ahead for a refund. Late cancellations and no-shows forfeit the deposit." }, me.policy);
  const cancelWindow = i(me.cancelWindowHours, { type: "number", min: 0, max: 720 });
  const minNotice = i(me.minNoticeHours, { type: "number", min: 0, max: 720 });
  const maxDays = i(me.maxDaysAhead, { type: "number", min: 1, max: 365 });
  const step = h("select", [15, 30, 60].map((m) => h("option", { value: m, selected: m === me.slotStepMin }, `Every ${m} minutes`)));
  const save = h("button.btn.primary", { type: "submit" }, "Save settings");

  const form = h("form.stack",
    h("div.card",
      h("h2", { style: "font-size:1.2rem" }, "Profile"),
      field("Name or studio", displayName),
      field("Booking link", h("div.prefix", h("span", `${window.location.host}/`), handle), "Changing this breaks your old link."),
      field("Bio", bio, "Your style, what you do and don't take on."),
      field("Studio address", location, "Included in confirmation emails."),
      field("Instagram", h("div.prefix", h("span", "@"), instagram)),
    ),
    h("div.card",
      h("h2", { style: "font-size:1.2rem" }, "Booking rules"),
      field("Cancellation & deposit policy", policy, "Clients must agree to this before paying."),
      h("div.row",
        field("Refund cutoff (hours)", cancelWindow, "Cancel earlier than this = refund."),
        field("Minimum notice (hours)", minNotice, "No bookings sooner than this."),
        field("Book up to (days ahead)", maxDays)),
      h("div.row", field("Start times", step), field("Timezone", tz), field("Currency", currency)),
    ),
    h("div", save),
  );
  form.addEventListener("submit", withSave(save, async () => {
    me = (await api("/api/me", { method: "PATCH", body: {
      displayName: displayName.value, handle: handle.value.toLowerCase(), bio: bio.value,
      location: location.value, instagram: instagram.value, policy: policy.value,
      cancelWindowHours: Number(cancelWindow.value), minNoticeHours: Number(minNotice.value),
      maxDaysAhead: Number(maxDays.value), slotStepMin: Number(step.value),
      timezone: tz.value, currency: currency.value,
    } })).artist;
    document.getElementById("view-page").href = me.bookingUrl;
  }));
  fill(view, h("h1", "Settings"), form);
}

// ---- Billing ---------------------------------------------------------------

function renderBilling() {
  const b = me.billing;
  const status = b.subscribed
    ? h("span.pill.ok", b.status === "past_due" ? "Payment issue" : "Subscribed")
    : b.active ? h("span.pill.warn", `Trial: ${b.trialDaysLeft} day${b.trialDaysLeft === 1 ? "" : "s"} left`)
    : h("span.pill.bad", "Trial ended");

  const go = (path) => async (e) => {
    e.target.disabled = true;
    try { location.href = (await api(path, { method: "POST", body: {} })).url; }
    catch (err) { alert(err.message); e.target.disabled = false; }
  };

  fill(view, 
    h("h1", "Billing"),
    new URLSearchParams(location.search).get("billing") === "success"
      ? h("div.notice.ok", { style: "margin-bottom:1rem" }, "Thanks! You're subscribed.") : null,
    h("div.card.stack",
      h("div.row", { style: "align-items:center;justify-content:space-between" }, h("h2", { style: "font-size:1.2rem;margin:0;flex:0 0 auto" }, "Slotlock Pro"), h("div", { style: "flex:0 0 auto" }, status)),
      h("div.price", "$19", h("small", " / month")),
      h("p.muted", "Unlimited bookings. No per-booking fees from us. Cancel anytime from the billing portal."),
      b.subscribed
        ? (me.stripe.mode === "live" ? h("button.btn", { onclick: go("/api/billing/portal") }, "Manage billing") : h("p.small.muted", "Demo mode: subscription simulated."))
        : h("button.btn.primary", { onclick: go("/api/billing/checkout") }, b.active ? "Subscribe now (keeps your remaining trial)" : "Subscribe"),
    ),
  );
}

// ---- Router ----------------------------------------------------------------

const routes = { setup: renderSetup, bookings: renderBookings, services: renderServices, hours: renderHours, settings: renderSettings, billing: renderBilling };

async function route() {
  const name = location.hash.slice(1) || "setup";
  const render = routes[name] || renderSetup;
  for (const a of document.querySelectorAll("#nav a")) a.classList.toggle("active", a.getAttribute("href") === `#${name}`);
  try {
    await loadMe();
    await render();
  } catch (err) {
    if (err.status === 401) return location.replace("/login");
    fill(view, h("div.notice.warn", err.message));
  }
}

document.getElementById("logout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: {} });
  location.href = "/";
});

window.addEventListener("hashchange", route);
route();
