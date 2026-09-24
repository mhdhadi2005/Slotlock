// The artist dashboard. Hash routes (#bookings, #services, …), one render
// function per page, all DOM built with h() from common.js.

let me = null;
let stats = null;
let config = null;
const view = document.getElementById("view");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const NAV = [
  { id: "home", label: "Home", icon: "home" },
  { id: "bookings", label: "Bookings", icon: "calendar" },
  { id: "requests", label: "Requests", icon: "message" },
  { id: "services", label: "Services", icon: "layers" },
  { id: "availability", label: "Availability", icon: "clock" },
  { id: "deposits", label: "Deposits", icon: "wallet" },
  { id: "waitlist", label: "Books & waitlist", icon: "bell" },
  { id: "forms", label: "Consent & aftercare", icon: "shield" },
  { id: "page", label: "My page", icon: "palette" },
  { id: "settings", label: "Settings", icon: "sliders" },
  { id: "billing", label: "Plan", icon: "card" },
];

const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;
const firstName = (name) => String(name).trim().split(/\s+/)[0];
const currentRoute = () => (ROUTES[location.hash.slice(1)] ? location.hash.slice(1) : "home");

// ---- Shell -----------------------------------------------------------------

// If the server doesn't know its public address, the links it hands back
// point at localhost. The browser knows where it really is, so use that.
function setMe(artist) {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/;
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) {
    for (const key of ["bookingUrl", "calendarUrl"]) artist[key] = artist[key].replace(local, location.origin);
  }
  me = artist;
  setLook(me.look);
  return me;
}

async function refreshMeta() {
  const [meRes, statsRes] = await Promise.all([api("/api/me"), api("/api/bookings/stats")]);
  setMe(meRes.artist);
  stats = statsRes;
  renderShell();
  const pending = stats.needsAction + stats.newRequests;
  document.title = (pending ? `(${pending}) ` : "") + "Slotlock";
}

function navLinks() {
  const active = currentRoute();
  return NAV.map((n) => h("a.side-link" + (n.id === active ? ".active" : ""), { href: "#" + n.id, dataset: { route: n.id } },
    icon(n.icon, 18), h("span", n.label),
    n.id === "bookings" && stats.needsAction ? h("span.count", stats.needsAction) : null,
    n.id === "requests" && stats.newRequests ? h("span.count", stats.newRequests) : null));
}

function renderShell() {
  const pageUrl = me.bookingUrl.replace(/^https?:\/\//, "");
  fill(document.getElementById("sidebar"),
    h("a.brand", { href: "/" }, brandMark(), wordmark()),
    navLinks(),
    h("div.side-spacer"),
    h("div.side-card",
      h("span.label", "Your booking page"),
      h("span.url", pageUrl),
      h("div.row.tight",
        h("a.btn.sm", { href: me.bookingUrl, target: "_blank", rel: "noopener" }, icon("external", 15), "Open"),
        h("button.btn.sm.ghost", { type: "button", onclick: () => copyText(me.bookingUrl, "Link copied") }, icon("copy", 15), "Copy"))),
    h("div.side-user",
      avatarEl(me.avatarUrl, me.displayName),
      h("div.who", h("b", me.displayName), h("span", me.email)),
      h("button.btn.ghost.sm.icon-only", { type: "button", title: "Log out", "aria-label": "Log out", onclick: logout }, icon("logout", 17))),
  );
  fill(document.getElementById("mobilebar"),
    h("div.top",
      h("a.brand", { href: "#home" }, brandMark(), wordmark()),
      h("div.row.tight",
        h("a.btn.sm", { href: me.bookingUrl, target: "_blank", rel: "noopener" }, icon("external", 15), "My page"),
        h("button.btn.ghost.sm.icon-only", { type: "button", "aria-label": "Log out", onclick: logout }, icon("logout", 17)))),
    h("nav.mobile-nav", navLinks()),
  );
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
  location.href = "/";
}

// ---- Building blocks -------------------------------------------------------

function pageHead(title, sub, ...actions) {
  return h("div.page-head",
    h("div", h("h1.page-title", title), sub ? h("p.page-sub", sub) : null),
    actions.length ? h("div.row", actions) : null);
}

function card(title, sub, ...body) {
  return h("section.card",
    title ? h("div.card-head", h("div", h("h2.card-title", title), sub ? h("p.card-sub", sub) : null)) : null,
    body);
}

function field(label, input, hint) {
  const target = input.matches?.("input, select, textarea") ? input : input.querySelector?.("input, select, textarea");
  if (target && !target.id) target.id = "f-" + Math.random().toString(36).slice(2);
  return h("div.field", h("label", { for: target ? target.id : null }, label), input, hint ? h("div.hint", hint) : null);
}

function toggle(checked, onChange, label) {
  const input = h("input", { type: "checkbox", checked, "aria-label": label || "Toggle" });
  input.addEventListener("change", () => onChange(input.checked, input));
  return { input, el: h("label.switch", input, h("span")) };
}

function selectOf(options, current) {
  const list = options.some(([v]) => v === current) ? options : [...options, [current, String(current)]];
  return h("select", list.map(([value, label]) => h("option", { value, selected: value === current }, label)));
}

function saveBar(label, fn) {
  const btn = h("button.btn.primary.lg", { type: "button" }, icon("check", 18), label);
  btn.addEventListener("click", () => busy(btn, fn));
  return h("div.save-bar", btn);
}

function emptyState(iconName, title, text, action) {
  return h("div.card.empty", h("div.empty-icon", icon(iconName, 24)), h("h3", title), h("p", text), action || null);
}

const loading = () => h("div.stack-sm", h("div.skeleton", { style: { height: "120px" } }), h("div.skeleton", { style: { height: "120px" } }));

// ---- Home ------------------------------------------------------------------

async function renderHome() {
  const [{ services }, { rules }, { bookings: next }] = await Promise.all([
    api("/api/services"), api("/api/availability"), api("/api/bookings?scope=upcoming&limit=4"),
  ]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const attention = [];
  if (!me.booksOpen) {
    attention.push(h("a.attention.closed", { href: "#waitlist" },
      h("div.a-icon", icon("lock", 20)),
      h("div", h("b", "Your books are closed"),
        h("span", stats.waitlist ? `${plural(stats.waitlist, "person is", "people are")} on your waitlist. Open your books to let them know.` : "Your page is collecting a waitlist.")),
      h("span.go", icon("right", 20))));
  }
  if (stats.newRequests) {
    attention.push(h("a.attention.request", { href: "#requests" },
      h("div.a-icon", icon("message", 20)),
      h("div", h("b", `${plural(stats.newRequests, "consultation request")} to answer`), h("span", "Send a quote or decline. Quoted clients book and pay the deposit themselves.")),
      h("span.go", icon("right", 20))));
  }
  if (stats.awaitingDeposit) {
    const reported = stats.reportedDeposits;
    attention.push(h("a.attention.deposit", { href: "#bookings" },
      h("div.a-icon", icon("banknote", 20)),
      h("div",
        h("b", reported ? `${plural(reported, "deposit")} to check` : `${plural(stats.awaitingDeposit, "request")} waiting on a deposit`),
        h("span", reported ? "Clients say they've paid. Confirm once the money lands." : "The slot is held while they pay, then released automatically.")),
      h("span.go", icon("right", 20))));
  }
  if (stats.refundsOwed) {
    attention.push(h("a.attention.refund", { href: "#bookings" },
      h("div.a-icon", icon("refund", 20)),
      h("div", h("b", `${plural(stats.refundsOwed, "refund")} to send`), h("span", "Clients who cancelled in time. Send it back, then mark it done.")),
      h("span.go", icon("right", 20))));
  }

  const checks = [
    { done: services.some((s) => s.active), label: "Add your services", desc: "Length, price and deposit for each.", href: "#services" },
    { done: rules.length > 0, label: "Set your hours", desc: "When clients can book you.", href: "#availability" },
    { done: me.depositsReady, label: "Choose how you get deposits", desc: "PayPal, Venmo, Cash App, bank transfer…", href: "#deposits" },
    { done: !!me.policy, label: "Write your booking policy", desc: "Deposits, cancellations, lateness.", href: "#deposits" },
    { done: !!(me.avatarUrl || me.bio), label: "Add a photo and bio", desc: "Clients book people, not pages.", href: "#page" },
    { done: me.portfolio.length > 0, label: "Show some of your work", desc: "Upload a few healed pieces or flash.", href: "#page" },
  ];
  const doneCount = checks.filter((c) => c.done).length;

  const linkInput = h("input", { value: me.bookingUrl, readOnly: true, onclick: (e) => e.target.select(), "aria-label": "Your booking link" });
  const shareBtn = navigator.share
    ? h("button.btn", { type: "button", onclick: () => navigator.share({ title: `Book with ${me.displayName}`, url: me.bookingUrl }).catch(() => {}) }, icon("share", 16), "Share")
    : null;

  const nextCard = card("Next up", null,
    next.length ? h("div.next-list", next.map((b) => h("a.next-item", { href: "#bookings" },
      h("div.next-date", h("small", fmt(b.startsAt, me.timezone, { month: "short" })), h("b", fmt(b.startsAt, me.timezone, { day: "numeric" }))),
      h("div.grow", h("b", b.clientName), h("span", `${fmt(b.startsAt, me.timezone, { weekday: "short" })} ${timeOnly(b.startsAt, me.timezone)} · ${b.serviceName}`)),
      icon("right", 18))))
      : h("p.muted", "No confirmed bookings yet. Share your link and they'll show up here."));

  const setupCard = doneCount < checks.length
    ? card("Get your page ready", `${doneCount} of ${checks.length} done`,
      h("div.progress", { style: { marginBottom: "10px" } }, h("div", { style: { width: `${(doneCount / checks.length) * 100}%` } })),
      h("ul.checklist", checks.map((c) => h("li" + (c.done ? ".done" : ""),
        h("span.check-dot" + (c.done ? ".done" : ""), c.done ? icon("check", 15) : null),
        h("div.grow", h("b", c.label), h("span", c.desc)),
        c.done ? null : h("a.btn.sm", { href: c.href }, "Set up")))))
    : card("You're all set", "Your page is ready for bookings.",
      h("p.muted", "Tip: pin a story highlight called “Book” with your link, and paste it into DM replies when people ask about availability."));

  fill(view,
    pageHead(`${greeting}, ${firstName(me.displayName)}`, "Here's what's happening with your bookings.",
      h("a.btn", { href: me.bookingUrl, target: "_blank", rel: "noopener" }, icon("eye", 16), "View my page")),
    !me.emailEnabled ? h("div.notice.info", { style: { marginBottom: "16px" } }, icon("info", 18),
      h("span", "Email isn't switched on for this site yet, so new requests only show up here. Keep this page handy.")) : null,
    attention.length ? h("div.stack-sm", { style: { marginBottom: "16px" } }, attention) : null,
    h("div.grid-3", { style: { marginBottom: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))" } },
      h("div.card.stat", h("div.label", icon("calendar", 15), "Upcoming"), h("div.value", stats.upcoming)),
      h("div.card.stat", h("div.label", icon("clock", 15), "Next 7 days"), h("div.value", stats.thisWeek)),
      h("div.card.stat", h("div.label", icon("banknote", 15), "Deposits this month"), h("div.value", money(stats.depositsThisMonthCents, stats.currency))),
      h("div.card.stat", h("div.label", icon("shield", 15), "Kept from late cancels"), h("div.value", money(stats.keptFromCancellationsCents, stats.currency)))),
    h("div.grid-2", { style: { alignItems: "start" } },
      h("div.stack",
        card("Your booking link", "Put it in your Instagram bio, stories and DM replies.",
          h("div.linkbox", linkInput, h("button.btn", { type: "button", onclick: () => copyText(me.bookingUrl, "Link copied") }, icon("copy", 16), "Copy")),
          h("div.row.tight", { style: { marginTop: "12px" } },
            h("a.btn.sm.ghost", { href: me.bookingUrl, target: "_blank", rel: "noopener" }, icon("external", 15), "Open"),
            shareBtn ? (shareBtn.classList.add("sm", "ghost"), shareBtn) : null),
          h("p.hint", { style: { marginTop: "12px" } }, "Instagram: Edit profile → Links → Add external link.")),
        nextCard),
      setupCard),
  );
}

// ---- Bookings --------------------------------------------------------------

let bookingTab = null;

async function renderBookings() {
  const tab = bookingTab || (stats.needsAction ? "action" : "upcoming");
  const tabs = [["action", "Needs action", stats.needsAction], ["upcoming", "Upcoming", stats.upcoming], ["past", "Past"], ["cancelled", "Cancelled"]];
  const list = h("div", loading());
  fill(view,
    pageHead("Bookings", "Requests waiting on deposits, confirmed appointments and history."),
    h("div.seg", { role: "tablist" }, tabs.map(([id, label, count]) => h("button" + (id === tab ? ".active" : ""),
      { type: "button", role: "tab", "aria-selected": String(id === tab), onclick: () => { bookingTab = id; renderBookings(); } },
      label, count ? h("span.count" + (id === "action" ? "" : ".quiet"), count) : null))),
    h("div", { style: { marginTop: "22px" } }, list));

  const { bookings } = await api(`/api/bookings?scope=${tab}`);

  if (tab === "action") {
    const reported = bookings.filter((b) => b.status === "awaiting_deposit" && b.depositReportedAt);
    const waiting = bookings.filter((b) => b.status === "awaiting_deposit" && !b.depositReportedAt);
    const refunds = bookings.filter((b) => b.refundStatus === "owed");
    if (!bookings.length) {
      return fill(list, emptyState("check", "You're all caught up", "New requests and refunds to send will show up here."));
    }
    return fill(list,
      reported.length ? [h("h3.day-group-title", "Deposits to check"), reported.map(bookingCard)] : null,
      waiting.length ? [h("h3.day-group-title", "Waiting on the client"), waiting.map(bookingCard)] : null,
      refunds.length ? [h("h3.day-group-title", "Refunds to send"), refunds.map(bookingCard)] : null);
  }

  if (!bookings.length) {
    const copy = {
      upcoming: ["No upcoming bookings", "Confirmed appointments show up here. Share your link to get some!"],
      past: ["Nothing here yet", "Appointments move here once they've happened."],
      cancelled: ["No cancellations", "Cancelled and expired requests show up here."],
    }[tab];
    return fill(list, emptyState("calendar", copy[0], copy[1]));
  }

  if (tab === "cancelled") return fill(list, bookings.map(bookingCard));

  // Upcoming and past: grouped by day.
  const out = [];
  let lastDay = "";
  for (const b of bookings) {
    const day = fmt(b.startsAt, me.timezone, { weekday: "long", month: "long", day: "numeric" });
    if (day !== lastDay) { out.push(h("h3.day-group-title", day)); lastDay = day; }
    out.push(bookingCard(b));
  }
  fill(list, out);
}

function statusBadge(b) {
  if (b.status === "awaiting_deposit") return b.depositReportedAt ? h("span.badge.ok", "Client says paid") : h("span.badge.warn", "Awaiting deposit");
  if (b.status === "confirmed") return b.depositCents ? h("span.badge.ok", icon("check", 13), "Deposit received") : h("span.badge", "Confirmed");
  if (b.status === "expired") return h("span.badge", "Hold expired");
  return h("span.badge.danger", b.cancelledBy === "client" ? "Cancelled by client" : "Cancelled by you");
}

function refundBadge(b) {
  if (b.refundStatus === "owed") return h("span.badge.info", "Refund owed");
  if (b.refundStatus === "refunded") return h("span.badge", "Refunded");
  if (b.status === "cancelled" && b.depositPaid) return h("span.badge", "Deposit kept");
  return null;
}

function bookingCard(b) {
  const tz = me.timezone;
  const amount = money(b.depositCents, b.currency);
  const minutes = Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000);
  const ig = String(b.clientInstagram || "").replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "");
  const future = Date.parse(b.startsAt) > Date.now();
  const via = b.depositMethod ? ` via ${(config.paymentTypes.find((t) => t.type === b.depositMethod) || {}).label || b.depositMethod}` : "";

  let alert = null;
  if (b.status === "awaiting_deposit" && b.depositReportedAt) {
    alert = h("div.bk-alert.reported", icon("banknote", 17),
      h("span", `Says they sent ${amount}${via} ${relTime(b.depositReportedAt)}. Look for reference ${b.refCode}.`));
  } else if (b.status === "awaiting_deposit") {
    alert = h("div.bk-alert.waiting", icon("hourglass", 17),
      h("span", `Waiting for their ${amount} deposit. Hold ends in ${timeLeft(b.holdExpiresAt)}.`));
  } else if (b.refundStatus === "owed") {
    alert = h("div.bk-alert.refund", icon("refund", 17), h("span", `Send back their ${amount} deposit, then mark it as refunded.`));
  }

  const actions = [];
  if (b.status === "awaiting_deposit") {
    actions.push(h("button.btn.primary.sm", { type: "button", onclick: () => confirmDeposit(b) }, icon("check", 15), "Deposit received"));
    actions.push(h("button.btn.ghost.sm", { type: "button", onclick: () => cancelBooking(b) }, "Decline"));
  } else if (b.status === "confirmed" && future) {
    actions.push(h("button.btn.ghost.sm", { type: "button", onclick: () => cancelBooking(b) }, "Cancel booking"));
  }
  if (b.refundStatus === "owed") {
    actions.push(h("button.btn.primary.sm", { type: "button", onclick: () => setRefund(b, "refunded") }, icon("check", 15), "Mark refunded"));
    actions.push(h("button.btn.ghost.sm", { type: "button", onclick: () => setRefund(b, "none") }, "No refund needed"));
  }

  return h("article.card.bk",
    h("div.bk-time", timeOnly(b.startsAt, tz), h("span", fmt(b.startsAt, tz, { weekday: "short", month: "short", day: "numeric" }))),
    h("div",
      h("div.bk-head",
        h("div", h("div.bk-name", b.clientName), h("div.bk-service", `${b.serviceName} · ${duration(minutes)}`)),
        h("div.row.tight", statusBadge(b), refundBadge(b))),
      alert,
      b.addons?.length ? h("div.row.tight", { style: { flexWrap: "wrap", marginTop: "10px" } }, b.addons.map((x) => h("span.chip", icon("plus", 13), x.name))) : null,
      b.cancelReason ? h("div.bk-notes", `“${b.cancelReason}”`) : null,
      b.notes ? h("div.bk-notes", b.notes) : null,
      h("div.bk-contacts",
        h("a", { href: `mailto:${b.clientEmail}` }, icon("mail", 14), h("span", b.clientEmail)),
        b.clientPhone ? h("a", { href: `tel:${b.clientPhone.replace(/[^\d+]/g, "")}` }, icon("phone", 14), h("span", b.clientPhone)) : null,
        ig ? h("a", { href: `https://instagram.com/${ig}`, target: "_blank", rel: "noopener noreferrer" }, icon("instagram", 14), h("span", "@" + ig)) : null,
        b.referenceUrl ? h("a", { href: b.referenceUrl, target: "_blank", rel: "noopener noreferrer" }, icon("image", 14), h("span", "Reference")) : null),
      b.depositCents ? h("div.bk-meta", h("span", `Deposit ${amount}`), h("span", "Ref ", h("span.mono", b.refCode))) : null,
      consentRow(b),
      actions.length ? h("div.bk-actions", actions) : null),
  );
}

// Consent status, when the artist uses consent forms (or this client signed one).
function consentRow(b) {
  const live = ["awaiting_deposit", "confirmed"].includes(b.status);
  if (b.consentSigned) {
    return h("div.bk-consent.ok", icon("check", 15), h("span", "Consent form signed"),
      h("a.link.small", { href: `/app/consent/${b.id}`, target: "_blank", rel: "noopener" }, "View & print"));
  }
  if (me.consentEnabled && live) return h("div.bk-consent", icon("edit", 15), h("span", "Consent form not signed yet. They can sign from their booking page."));
  return null;
}

async function afterChange(message) {
  toast(message);
  await refreshMeta();
  await route();
}

async function confirmDeposit(b) {
  const ok = await confirmDialog(`Confirm ${firstName(b.clientName)}'s deposit?`,
    `Only confirm once ${money(b.depositCents, b.currency)} with reference ${b.refCode} has actually arrived. ${firstName(b.clientName)} gets a confirmation email and the booking is locked in.`,
    { confirm: "Yes, it arrived" });
  if (!ok) return;
  await busy(null, async () => {
    await api(`/api/bookings/${b.id}/confirm-deposit`, { method: "POST", body: {} });
    await afterChange("Booking confirmed");
  });
}

async function cancelBooking(b) {
  const decline = b.status === "awaiting_deposit";
  const moneySent = b.depositCents > 0 && (b.depositPaid || !!b.depositReportedAt);
  const reason = h("textarea", {
    maxLength: 500, rows: 3,
    placeholder: decline ? "e.g. Sorry, I'm not taking this style right now." : "e.g. I'm unwell. Please book another time and I'll fit you in first.",
  });
  const name = `refund-${b.id}`;
  const choice = (value, label, checked) => h("label.choice", h("input", { type: "radio", name, value, checked }), label);
  const done = await modal({
    title: decline ? `Decline ${firstName(b.clientName)}'s request?` : `Cancel ${firstName(b.clientName)}'s booking?`,
    lead: "They'll get an email and the time opens up again.",
    body: [
      field("Message to them (optional)", reason),
      moneySent ? h("div.field", h("span.label", `Their ${money(b.depositCents, b.currency)} deposit`),
        h("div.choice-list", choice("refund", "I'll send it back to them", true), choice("keep", "Keep the deposit", false))) : null,
    ],
    actions: [
      { label: "Keep it", kind: "ghost", value: false },
      {
        label: decline ? "Decline request" : "Cancel booking", kind: "danger", value: true,
        onClick: async () => {
          const refund = moneySent && document.querySelector(`input[name="${name}"]:checked`)?.value === "refund";
          await api(`/api/bookings/${b.id}/cancel`, { method: "POST", body: { reason: reason.value, refund } });
        },
      },
    ],
  });
  if (done) await afterChange(decline ? "Request declined" : "Booking cancelled");
}

async function setRefund(b, status) {
  if (status === "none") {
    const ok = await confirmDialog("No refund needed?", "Use this if the deposit never arrived, or you've already sorted it out another way.", { confirm: "Clear it" });
    if (!ok) return;
  }
  await busy(null, async () => {
    await api(`/api/bookings/${b.id}/refund`, { method: "POST", body: { status } });
    await afterChange(status === "refunded" ? "Marked as refunded" : "Cleared");
  });
}

// ---- Services --------------------------------------------------------------

async function renderServices() {
  const { services } = await api("/api/services");
  const addBtn = h("button.btn.primary", { type: "button", onclick: () => serviceDialog() }, icon("plus", 17), "Add service");
  const needsPayment = !me.depositsReady && services.some((s) => s.active && s.depositCents > 0);
  fill(view,
    pageHead("Services", "What clients can book. The length decides which openings fit; the deposit is what they send to hold the slot.", addBtn),
    needsPayment ? h("div.notice.warn", { style: { marginBottom: "16px" } }, icon("alert", 18),
      h("span", "Clients can't book services with a deposit until you add how they pay you. ", h("a.link", { href: "#deposits" }, "Add a payment method"))) : null,
    services.length ? h("div", services.map(serviceRow))
      : emptyState("layers", "No services yet", `Start with a few typical ${config.business[me.businessType].label.toLowerCase()} services (edit them after), or add your own.`,
        h("div.row", { style: { justifyContent: "center" } },
          h("button.btn.primary", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
            const r = await api("/api/services/starters", { method: "POST", body: { businessType: me.businessType } });
            toast(`Added ${plural(r.added, "service")}. Tweak prices to suit you.`);
            await refreshMeta(); await route();
          }) }, icon("sparkle", 17), "Add starter services"),
          h("button.btn", { type: "button", onclick: () => serviceDialog() }, icon("plus", 17), "Add my own"))),
  );
}

function serviceRow(s) {
  const row = h("article.card.svc" + (s.active ? "" : ".off"));
  const sw = toggle(s.active, async (checked, input) => {
    try {
      await api(`/api/services/${s.id}`, { method: "PATCH", body: { active: checked } });
      row.classList.toggle("off", !checked);
      toast(checked ? "Showing on your page" : "Hidden from your page");
    } catch (err) {
      input.checked = !checked;
      toast(err.message, "error");
    }
  }, `Show ${s.name} on your page`);
  return fill(row,
    h("div.svc-body",
      h("div.svc-name", s.name),
      s.description ? h("div.svc-desc", s.description) : null,
      h("div.svc-meta",
        s.mode === "consult" ? h("span.badge.info", icon("message", 13), "Consult first") : null,
        h("span.badge", icon("clock", 13), duration(s.durationMin)),
        s.addons?.length ? h("span.badge", icon("plus", 13), plural(s.addons.length, "add-on")) : null,
        s.patchTestHours ? h("span.badge.warn", `Patch test ${s.patchTestHours}h`) : null,
        h("span.badge", s.priceCents === null ? "Price quoted" : money(s.priceCents, me.currency)),
        s.depositCents ? h("span.badge.accent", `${money(s.depositCents, me.currency)} deposit`) : h("span.badge", "No deposit"))),
    h("div.svc-actions",
      h("span", { title: s.active ? "Showing on your page" : "Hidden" }, sw.el),
      h("button.btn.sm", { type: "button", onclick: () => serviceDialog(s) }, icon("edit", 15), "Edit")),
  );
}

async function serviceDialog(s = {}) {
  const sym = currencySymbol(me.currency);
  const name = h("input", { value: s.name || "", maxLength: 100, placeholder: "e.g. Small custom (palm size)" });
  const desc = h("textarea", { maxLength: 600, rows: 3, placeholder: "What's included, size limits, anything clients should know" }, s.description || "");
  const lengths = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600, 720];
  const dur = selectOf(lengths.map((m) => [m, duration(m)]), s.durationMin || 120);
  const price = h("input", { value: fromCents(s.priceCents), inputMode: "decimal", placeholder: "Blank = quoted" });
  const deposit = h("input", { value: fromCents(s.depositCents ?? 5000), inputMode: "decimal", placeholder: "0" });
  const moneyBox = (input) => h("div.money-input", h("span", sym), input);
  const error = h("div.form-error", { role: "alert" });
  const mode = selectOf([["book", "Pick a time, send deposit"], ["consult", "Send idea first, you quote"]], s.mode || "book");
  const modeHint = h("div.hint");
  const syncMode = () => {
    modeHint.textContent = mode.value === "consult"
      ? "Clients describe their idea and add photos; you reply with a quote, then they book a time and send the deposit. Length, price and deposit below are your starting quote."
      : "Clients pick an opening straight away and send the deposit. Best for flash and set-price pieces.";
  };
  mode.addEventListener("change", syncMode);
  syncMode();

  // Add-ons: name, extra price, extra time.
  const addons = (s.addons || []).map((x) => ({ ...x }));
  const addonBox = h("div.addon-editor");
  const drawAddons = () => fill(addonBox,
    addons.map((x, i) => {
      const nm = h("input", { value: x.name, maxLength: 60, placeholder: "e.g. Nail art", "aria-label": "Add-on name" });
      nm.addEventListener("input", () => { x.name = nm.value; });
      const pr = h("input", { value: fromCents(x.priceCents), inputMode: "decimal", placeholder: "0", "aria-label": "Extra price" });
      pr.addEventListener("input", () => { x.priceCents = toCents(pr.value) ?? 0; });
      const mins = selectOf([0, 5, 10, 15, 20, 30, 45, 60, 90, 120].map((m) => [m, m ? `+${duration(m)}` : "No extra time"]), x.durationMin || 0);
      mins.classList.add("addon-min");
      mins.addEventListener("change", () => { x.durationMin = Number(mins.value); });
      return h("div.addon-row", nm, h("div.money-input", h("span", sym), pr), mins,
        h("button.btn.ghost.icon-only.sm", { type: "button", "aria-label": "Remove add-on", onclick: () => { addons.splice(i, 1); drawAddons(); } }, icon("trash", 16)));
    }),
    addons.length < 8 ? h("button.btn.sm", { type: "button", style: { alignSelf: "flex-start" }, onclick: () => { addons.push({ name: "", priceCents: 0, durationMin: 0 }); drawAddons(); addonBox.querySelector(".addon-row:last-of-type input")?.focus(); } }, icon("plus", 15), "Add an add-on") : null);
  drawAddons();
  const patch = selectOf([[0, "No patch test needed"], [24, "Patch test 24h before"], [48, "Patch test 48h before"], [72, "Patch test 72h before"]], s.patchTestHours || 0);

  const actions = [];
  if (s.id) {
    actions.push({
      label: "Delete", kind: "danger", value: "deleted",
      onClick: async () => {
        const ok = await confirmDialog(`Delete “${s.name}”?`, "Clients won't be able to book it. Existing bookings keep their details.", { confirm: "Delete", danger: true });
        if (!ok) return false;
        const r = await api(`/api/services/${s.id}`, { method: "DELETE" });
        toast(r.archived ? "Hidden from your page (it has bookings)" : "Service deleted");
      },
    }, { spacer: true });
  }
  actions.push({ label: "Cancel", kind: "ghost", value: null }, {
    label: s.id ? "Save changes" : "Add service", kind: "primary", value: "saved",
    onClick: async () => {
      error.textContent = "";
      const body = {
        name: name.value, description: desc.value, durationMin: Number(dur.value),
        priceCents: toCents(price.value), depositCents: toCents(deposit.value) ?? 0, mode: mode.value,
        addons: addons.filter((x) => x.name.trim()), patchTestHours: Number(patch.value),
      };
      try {
        await api(s.id ? `/api/services/${s.id}` : "/api/services", { method: s.id ? "PATCH" : "POST", body });
      } catch (err) {
        error.textContent = err.message;
        return false;
      }
      toast(s.id ? "Service saved" : "Service added");
    },
  });

  const result = await modal({
    title: s.id ? "Edit service" : "Add a service",
    wide: true,
    body: [
      field("Name", name),
      field("Description", desc, "Optional. Shown under the name on your page."),
      field("How clients book", mode, modeHint),
      h("div.grid-3.compact", field("Length", dur), field("Price", moneyBox(price)), field("Deposit", moneyBox(deposit), "0 = no deposit")),
      h("div.field", h("span.label", "Add-ons (optional)"), addonBox, h("div.hint", "Extras clients can tick, like nail art or removal. Extra time makes the appointment longer.")),
      field("Patch test", patch, "Clients confirm they've had one, and can't book sooner than this. Offer a free “Patch test” service too."),
      error,
    ],
    actions,
  });
  if (result) { await refreshMeta(); await route(); }
}

// ---- Availability ----------------------------------------------------------

async function renderAvailability() {
  const { rules, blocked } = await api("/api/availability");
  const byDay = Object.fromEntries(rules.map((r) => [r.weekday, r]));

  const rows = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const r = byDay[wd];
    const start = h("input", { type: "time", step: 900, value: minToTime(r ? r.startMin : 660), "aria-label": `${DAYS[wd]} opening time` });
    const end = h("input", { type: "time", step: 900, value: minToTime(r ? r.endMin : 1140), "aria-label": `${DAYS[wd]} closing time` });
    const times = h("div.times", start, h("span.muted", "to"), end);
    const closed = h("span.closed", "Closed");
    const sync = (on) => { times.classList.toggle("hidden", !on); closed.classList.toggle("hidden", on); };
    const sw = toggle(!!r, sync, `Open on ${DAYS[wd]}`);
    sync(!!r);
    return { wd, sw, start, end, el: h("div.week-row", h("div.day-name", sw.el, DAYS[wd]), h("div", times, closed)) };
  });

  const daysOff = [...blocked];
  const chips = h("div.chips");
  const drawChips = () => fill(chips, daysOff.length
    ? daysOff.sort().map((d) => h("span.chip",
      new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
      h("button", { type: "button", "aria-label": `Remove ${d}`, onclick: () => { daysOff.splice(daysOff.indexOf(d), 1); drawChips(); } }, icon("x", 14))))
    : h("span.muted.small", "No days off coming up."));
  drawChips();
  const dateInput = h("input", { type: "date", min: new Date().toISOString().slice(0, 10), "aria-label": "Day off" });
  const addDay = () => {
    if (dateInput.value && !daysOff.includes(dateInput.value)) { daysOff.push(dateInput.value); drawChips(); }
    dateInput.value = "";
  };

  const notice = selectOf([[0, "No minimum"], [1, "1 hour"], [2, "2 hours"], [4, "4 hours"], [8, "8 hours"], [12, "12 hours"], [24, "1 day"], [48, "2 days"], [72, "3 days"], [168, "1 week"]], me.minNoticeHours);
  const ahead = selectOf([[7, "1 week"], [14, "2 weeks"], [30, "1 month"], [60, "2 months"], [90, "3 months"], [180, "6 months"], [365, "1 year"]], me.maxDaysAhead);
  const step = selectOf([[15, "Every 15 minutes"], [30, "Every 30 minutes"], [60, "Every hour"]], me.slotStepMin);

  fill(view,
    pageHead("Availability", `When clients can book you, in your timezone (${me.timezone.replace(/_/g, " ")}). Appointments always fit inside these hours.`),
    h("div.stack",
      card("Weekly hours", null, rows.map((r) => r.el)),
      card("Days off", "Guest spots, conventions, holidays. Nobody can book these dates.",
        h("div.linkbox", dateInput, h("button.btn", { type: "button", onclick: addDay }, icon("plus", 16), "Add")),
        h("div", { style: { marginTop: "14px" } }, chips)),
      card("Booking rules", null,
        h("div.grid-3",
          field("Minimum notice", notice, "No bookings sooner than this."),
          field("Book up to", ahead, "How far ahead clients can book."),
          field("Start times", step, "How often appointments can start.")))),
    saveBar("Save availability", async () => {
      const out = [];
      for (const r of rows) {
        if (!r.sw.input.checked) continue;
        const startMin = timeToMin(r.start.value), endMin = timeToMin(r.end.value);
        if (!(endMin > startMin)) throw new Error(`${DAYS[r.wd]}: closing time must be after opening time.`);
        out.push({ weekday: r.wd, startMin, endMin });
      }
      await api("/api/availability", { method: "PUT", body: { rules: out, blocked: daysOff } });
      await api("/api/me", { method: "PATCH", body: { minNoticeHours: Number(notice.value), maxDaysAhead: Number(ahead.value), slotStepMin: Number(step.value) } });
      await refreshMeta();
      toast("Availability saved");
    }),
  );
}

// ---- Deposits --------------------------------------------------------------

function renderDeposits() {
  const types = config.paymentTypes;
  const methods = me.paymentMethods.map((m) => ({ ...m }));
  const list = h("div");

  const shown = (m) => (m.type === "venmo" ? "@" : m.type === "cashapp" ? "$" : "") + m.value;

  function row(m, i) {
    const t = types.find((x) => x.type === m.type) || types[0];
    const select = h("select", { "aria-label": "Payment method" }, types.map((x) => h("option", { value: x.type, selected: x.type === m.type }, x.label)));
    select.addEventListener("change", () => { m.type = select.value; m.value = ""; draw(); list.querySelectorAll(".pm-value input, .pm-value textarea")[i]?.focus(); });
    const input = t.multiline
      ? h("textarea", { rows: 3, maxLength: 600, placeholder: t.hint, "aria-label": `${t.label} details` }, m.value)
      : h("input", { value: m.value ? shown(m) : "", placeholder: t.hint, maxLength: 300, "aria-label": `${t.label} details`, autocapitalize: "none", spellcheck: "false" });
    input.addEventListener("input", () => { m.value = input.value; });
    return h("div.pm-row", select, h("div.pm-value", input),
      h("button.btn.ghost.icon-only", { type: "button", "aria-label": "Remove", onclick: () => { methods.splice(i, 1); draw(); } }, icon("trash", 17)));
  }

  function draw() {
    fill(list,
      methods.length ? methods.map(row) : h("div.notice.warn", icon("alert", 18), h("span", "Add at least one way to pay you, or clients can't book services that need a deposit.")),
      methods.length < config.maxPaymentMethods
        ? h("button.btn", { type: "button", style: { marginTop: "12px" }, onclick: () => {
          const used = new Set(methods.map((m) => m.type));
          methods.push({ type: (types.find((t) => !used.has(t.type)) || types[0]).type, value: "" });
          draw();
          [...list.querySelectorAll(".pm-value input, .pm-value textarea")].pop()?.focus();
        } }, icon("plus", 16), "Add payment method")
        : null);
  }
  draw();

  const note = h("textarea", { rows: 3, maxLength: 600, placeholder: "e.g. Put your name and the reference code in the payment note." }, me.paymentNote);
  const hold = selectOf([[2, "2 hours"], [6, "6 hours"], [12, "12 hours"], [24, "24 hours"], [48, "2 days"], [72, "3 days"]], me.holdHours);
  const policy = h("textarea", { rows: 5, maxLength: 2000, placeholder: "e.g. Your deposit comes off the final price. Cancel or reschedule at least 48 hours ahead to get it back. Late cancellations and no-shows lose the deposit." }, me.policy);
  const cutoff = selectOf([[0, "Any time before the appointment"], [24, "At least 24 hours before"], [48, "At least 48 hours before"], [72, "At least 3 days before"], [168, "At least 1 week before"], [336, "At least 2 weeks before"]], me.cancelWindowHours);

  fill(view,
    pageHead("Deposits", "Clients send deposits straight to you. Slotlock never touches the money; it just tells them how to pay and keeps track."),
    h("div.stack",
      card("How clients pay you", "They see these after requesting a time, with the amount and a reference code to put in the payment note.", list),
      card("Payment instructions", "Anything else clients should know when paying.", note),
      card("Holding unpaid requests", null,
        field("Hold the slot for", hold, "If the client doesn't mark the deposit as sent by then, the slot is released and they're emailed. Once they say they've paid, the slot stays held until you confirm or decline.")),
      card("Cancellations & refunds", null,
        field("Booking policy", policy, "Clients must agree to this before booking."),
        field("Clients get their deposit back if they cancel", cutoff, "Cancel later than this and you keep the deposit. Slotlock tells you when a refund is owed."))),
    saveBar("Save deposit settings", async () => {
      setMe((await api("/api/me", { method: "PATCH", body: {
        paymentMethods: methods.filter((m) => m.value.trim()),
        paymentNote: note.value, holdHours: Number(hold.value), policy: policy.value, cancelWindowHours: Number(cutoff.value),
      } })).artist);
      await refreshMeta();
      renderDeposits();
      toast("Deposit settings saved");
    }),
  );
}

// ---- My page ---------------------------------------------------------------

function renderPage() {
  const photoBox = h("div");
  const galleryBox = h("div");
  let theme = me.theme;

  const avatarInput = h("input.hidden", { type: "file", accept: "image/*" });
  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    avatarInput.value = "";
    if (!file) return;
    await busy(photoBox.querySelector(".btn"), async () => {
      const data = await resizeImage(file, { max: 640, square: true, quality: 0.88 });
      await api("/api/images", { method: "POST", body: { kind: "avatar", data } });
      await refreshMeta();
      drawPhoto();
      toast("Photo updated");
    });
  });

  function drawPhoto() {
    fill(photoBox, h("div.photo-row",
      avatarEl(me.avatarUrl, me.displayName),
      h("div.stack-sm",
        h("div.row.tight",
          h("button.btn", { type: "button", onclick: () => avatarInput.click() }, icon("upload", 16), me.avatarUrl ? "Change photo" : "Upload photo"),
          me.avatarUrl ? h("button.btn.ghost", { type: "button", onclick: removePhoto }, "Remove") : null),
        h("p.hint", "A clear photo of you or your logo. It's also what shows when your link is shared."))));
  }

  async function removePhoto() {
    const id = me.avatarUrl.split("/").pop();
    await busy(null, async () => {
      await api(`/api/images/${id}`, { method: "DELETE" });
      await refreshMeta();
      drawPhoto();
      toast("Photo removed");
    });
  }

  const galleryInput = h("input.hidden", { type: "file", accept: "image/*", multiple: true });
  galleryInput.addEventListener("change", async () => {
    const files = [...galleryInput.files].slice(0, 12 - me.portfolio.length);
    galleryInput.value = "";
    let done = 0;
    for (const file of files) {
      try {
        const data = await resizeImage(file, { max: 1400, quality: 0.84 });
        await api("/api/images", { method: "POST", body: { kind: "portfolio", data } });
        done++;
      } catch (err) {
        toast(err.message, "error");
        break;
      }
    }
    await refreshMeta();
    drawGallery();
    if (done) toast(done === 1 ? "Added to your portfolio" : `Added ${done} pieces`);
  });

  function drawGallery() {
    fill(galleryBox, h("div.gallery",
      me.portfolio.map((p) => h("div.tile", h("img", { src: p.url, alt: "Portfolio piece", loading: "lazy" }),
        h("button", { type: "button", "aria-label": "Remove this piece", onclick: async () => {
          if (!(await confirmDialog("Remove this piece?", "It will disappear from your booking page.", { confirm: "Remove", danger: true }))) return;
          await busy(null, async () => {
            await api(`/api/images/${p.id}`, { method: "DELETE" });
            await refreshMeta();
            drawGallery();
          });
        } }, icon("x", 16)))),
      me.portfolio.length < 12
        ? h("button.add", { type: "button", onclick: () => galleryInput.click() }, icon("plus", 22), "Add photos")
        : null),
      h("p.hint", { style: { marginTop: "10px" } }, `${me.portfolio.length} of 12. Healed work and flash look best, cropped square.`));
  }

  drawPhoto();
  drawGallery();

  const displayName = h("input", { value: me.displayName, maxLength: 80 });
  const handle = h("input", { value: me.handle, maxLength: 30, autocapitalize: "none", spellcheck: "false" });
  handle.addEventListener("input", () => { handle.value = handle.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); });
  const bio = h("textarea", { maxLength: 600, rows: 4, placeholder: me.businessType === "tattoo" ? "Your style, what you love to tattoo, what you don't take on." : "What you specialise in, your vibe, anything clients should know." }, me.bio);
  const location_ = h("input", { value: me.location, maxLength: 160, placeholder: "Studio name, street, city" });
  const instagram = h("input", { value: me.instagram, maxLength: 60, placeholder: "yourhandle", autocapitalize: "none", spellcheck: "false" });

  const swatches = h("div.swatches");
  const drawSwatches = () => fill(swatches, Object.entries(config.themes).map(([key, color]) =>
    h("button.swatch" + (key === theme ? ".active" : ""), { type: "button", title: key, "aria-label": `${key} colour`, "aria-pressed": String(key === theme), onclick: () => { theme = key; drawSwatches(); } },
      h("span", { style: { background: color } }))));
  drawSwatches();

  fill(view,
    pageHead("My page", "How your booking page looks to clients.",
      h("a.btn", { href: me.bookingUrl, target: "_blank", rel: "noopener" }, icon("eye", 16), "Preview")),
    h("div.stack",
      card("Photo", null, photoBox, avatarInput),
      card("Details", null,
        h("div.grid-2", field("Name or studio", displayName), field("Booking link", h("div.affix", h("span", `${window.location.host}/`), handle), "Changing this breaks the old link.")),
        field("Bio", bio),
        h("div.grid-2", field("Studio address", location_, "Shown on your page and in confirmations."), field("Instagram", h("div.affix", h("span", "@"), instagram)))),
      me.look === "ink" ? card("Page colour", "The accent colour on your booking page.", swatches)
        : card("Page colour", null, h("p.muted", `Your ${LOOK_PREVIEWS[me.look].name} look sets the colours. Switch to Ink in `, h("a.link", { href: "#settings" }, "Settings"), " to pick an accent colour.")),
      card("Portfolio", "Pieces shown at the top of your booking page.", galleryBox, galleryInput)),
    saveBar("Save page", async () => {
      setMe((await api("/api/me", { method: "PATCH", body: {
        displayName: displayName.value, handle: handle.value, bio: bio.value, location: location_.value, instagram: instagram.value, theme,
      } })).artist);
      await refreshMeta();
      toast("Page saved");
    }),
  );
}

// ---- Settings --------------------------------------------------------------

function renderSettings() {
  const calInput = h("input", { value: me.calendarUrl, readOnly: true, onclick: (e) => e.target.select(), "aria-label": "Calendar link" });
  const webcal = me.calendarUrl.replace(/^https?:/, "webcal:");
  const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];
  if (!zones.includes(me.timezone)) zones.unshift(me.timezone);
  const tz = h("select", zones.map((z) => h("option", { value: z, selected: z === me.timezone }, z.replace(/_/g, " "))));
  const currency = h("select", config.currencies.map((c) => h("option", { value: c, selected: c === me.currency }, `${c.toUpperCase()} (${currencySymbol(c)})`)));
  const current = h("input", { type: "password", autocomplete: "current-password" });
  const next = h("input", { type: "password", autocomplete: "new-password", minLength: 8 });

  const regionBtn = h("button.btn.primary", { type: "button", style: { marginTop: "18px" } }, "Save");
  regionBtn.addEventListener("click", () => busy(regionBtn, async () => {
    setMe((await api("/api/me", { method: "PATCH", body: { timezone: tz.value, currency: currency.value } })).artist);
    await refreshMeta();
    toast("Saved");
  }));
  const pwBtn = h("button.btn.primary", { type: "button", style: { marginTop: "18px" } }, "Change password");
  pwBtn.addEventListener("click", () => busy(pwBtn, async () => {
    await api("/api/me/password", { method: "POST", body: { current: current.value, next: next.value } });
    current.value = next.value = "";
    toast("Password changed. Other devices were logged out.");
  }));

  fill(view,
    pageHead("Settings", null),
    h("div.stack",
      lookCard(),
      card("Sync bookings to your calendar", "Confirmed bookings (and pending ones, marked as such) appear on your phone automatically.",
        h("div.linkbox", calInput, h("button.btn", { type: "button", onclick: () => copyText(me.calendarUrl, "Calendar link copied") }, icon("copy", 16), "Copy")),
        h("div.row.tight", { style: { marginTop: "12px" } },
          h("a.btn.sm", { href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`, target: "_blank", rel: "noopener" }, icon("calendar", 15), "Add to Google Calendar"),
          h("a.btn.sm", { href: webcal }, icon("calendar", 15), "Add to Apple Calendar")),
        h("ol.help-steps",
          h("li", "Google: open Google Calendar on a computer → Other calendars → + → From URL → paste the link."),
          h("li", "iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste the link.")),
        h("p.hint", { style: { marginTop: "12px" } }, "Keep this link private: anyone with it can see your bookings. ",
          h("button.link-btn", { type: "button", onclick: async () => {
            if (!(await confirmDialog("Make a new calendar link?", "The old link stops working. You'll need to add the new one to your calendar again.", { confirm: "Make new link" }))) return;
            await busy(null, async () => {
              setMe((await api("/api/me/calendar-token", { method: "POST", body: {} })).artist);
              renderSettings();
              toast("New calendar link ready");
            });
          } }, "Make a new link"))),
      card("Region", null,
        h("div.grid-2", field("Timezone", tz, "Your hours and bookings use this."), field("Currency", currency, "For prices and deposits on your page.")),
        regionBtn),
      card("Password", null, h("div.grid-2", field("Current password", current), field("New password", next, "At least 8 characters.")), pwBtn),
      card("Account", null,
        h("div.row.between",
          h("div", h("div.label", "Email"), h("div", me.email)),
          h("button.btn", { type: "button", onclick: logout }, icon("logout", 16), "Log out")))),
  );
}

// The one-tap switch: what kind of business, and how everything looks.
const LOOK_PREVIEWS = {
  ink: { name: "Ink", bg: "#0b0a09", bar: "#2a2623", accent: "#ff5c39", ink: "#f6f2eb", sans: true, sub: "Dark and bold" },
  blush: { name: "Blush", bg: "#fff5f7", bar: "#f8e1e9", accent: "#e0457f", ink: "#3d1f2c", sub: "Soft pink" },
  latte: { name: "Latte", bg: "#f7f1ea", bar: "#ebdfd1", accent: "#a8714d", ink: "#34261c", sub: "Nude & beige" },
};

function lookCard() {
  const types = Object.entries(config.business);
  const save = async (body, message) => {
    setMe((await api("/api/me", { method: "PATCH", body })).artist);
    await refreshMeta();
    toast(message);
    renderSettings();
  };
  const typeBtns = types.map(([key, b]) => h("button.look-type" + (key === me.businessType ? ".on" : ""), {
    type: "button", "aria-pressed": String(key === me.businessType),
    onclick: () => busy(null, async () => {
      if (key === me.businessType) return;
      const body = { businessType: key };
      // Switch the look along with the type, unless they've picked their own.
      if (me.look === config.business[me.businessType].look) body.look = b.look;
      await save(body, `Set up for ${b.label.toLowerCase()}`);
    }),
  }, b.label));
  const looks = Object.entries(LOOK_PREVIEWS).map(([key, l]) => h("button.look" + (key === me.look ? ".on" : ""), {
    type: "button", "aria-pressed": String(key === me.look), "aria-label": `${l.name} look`,
    onclick: () => busy(null, async () => { if (key !== me.look) await save({ look: key }, `${l.name} look on`); }),
  },
    key === me.look ? h("span.ck", "✓") : null,
    h("div.pv", { style: { background: l.bg } },
      h("span.t" + (l.sans ? ".sans" : ""), { style: { color: l.ink } }, firstName(me.displayName)),
      h("i", { style: { background: l.bar, width: "80%" } }), h("i", { style: { background: l.bar, width: "55%" } }),
      h("div.b", { style: { background: l.accent } })),
    h("div.nm", l.name)));
  return card("Business type & look", "Changes the look of your booking page and dashboard, the wording clients see, and your starting consent form and aftercare.",
    h("span.label", "What you do"), h("div.look-types", typeBtns),
    h("span.label", "Look"), h("div.looks", looks),
    h("p.hint", { style: { marginTop: "14px" } }, `Previewing? `, h("a.link", { href: me.bookingUrl, target: "_blank", rel: "noopener" }, "Open your page"), " after switching."));
}

// ---- Plan ------------------------------------------------------------------

function renderBilling() {
  const b = me.billing;
  const go = (path) => async (e) => {
    await busy(e.currentTarget, async () => { location.href = (await api(path, { method: "POST", body: {} })).url; });
  };

  if (!b.enabled) {
    return fill(view,
      pageHead("Plan", null),
      h("section.card", { style: { maxWidth: "560px" } },
        h("div.row.between", h("h2.card-title", "Early access"), h("span.badge.ok", icon("check", 13), "Free")),
        h("p.muted", { style: { marginTop: "12px" } },
          "Slotlock is free while we're in early access: every feature, no limits. When paid plans start it'll be $19/month, and you'll hear about it well before anything changes.")));
  }

  const status = b.subscribed
    ? h("span.badge.ok", b.status === "past_due" ? "Payment issue" : "Subscribed")
    : b.active ? h("span.badge.warn", `Trial: ${plural(b.trialDaysLeft, "day")} left`) : h("span.badge.danger", "Trial ended");

  fill(view,
    pageHead("Plan", null),
    new URLSearchParams(location.search).get("billing") === "success"
      ? h("div.notice.ok", { style: { marginBottom: "16px" } }, icon("check", 18), h("span", "Thanks! You're subscribed.")) : null,
    !b.active ? h("div.notice.warn", { style: { marginBottom: "16px" } }, icon("alert", 18), h("span", "Your trial has ended, so your page isn't taking new bookings. Subscribe to turn it back on.")) : null,
    h("section.card", { style: { maxWidth: "560px" } },
      h("div.row.between", h("h2.card-title", "Slotlock Pro"), status),
      h("div.price", { style: { marginTop: "14px" } }, "$19", h("small", " / month")),
      h("p.muted", { style: { margin: "10px 0 20px" } }, "Unlimited bookings, no commission. Cancel anytime."),
      b.subscribed
        ? h("button.btn", { type: "button", onclick: go("/api/billing/portal") }, "Manage billing")
        : h("button.btn.primary.lg", { type: "button", onclick: go("/api/billing/checkout") }, b.active ? "Subscribe (keeps your trial days)" : "Subscribe")),
  );
}

// ---- Consultation requests ---------------------------------------------------

let requestTab = "open";

async function renderRequests() {
  const tabs = [["open", "Open", stats.newRequests], ["closed", "Answered"]];
  const list = h("div", loading());
  fill(view,
    pageHead("Requests", "Consultation requests for services set to “consult first”. Send a quote and the client books a time and pays the deposit."),
    h("div.seg", { role: "tablist" }, tabs.map(([id, label, count]) => h("button" + (id === requestTab ? ".active" : ""),
      { type: "button", role: "tab", "aria-selected": String(id === requestTab), onclick: () => { requestTab = id; renderRequests(); } },
      label, count ? h("span.count", count) : null))),
    h("div", { style: { marginTop: "22px" } }, list));
  const { requests } = await api(`/api/requests?scope=${requestTab}`);
  if (!requests.length) {
    const { services } = await api("/api/services");
    const hasConsult = services.some((s) => s.mode === "consult" && s.active);
    return fill(list, requestTab === "open"
      ? emptyState("message", "No open requests", hasConsult
        ? "When a client sends their idea, it lands here with their photos."
        : "Set a service to “consult first” and clients send you their idea and reference photos before booking.",
        hasConsult ? null : h("a.btn.primary", { href: "#services" }, "Go to services"))
      : emptyState("check", "Nothing answered yet", "Requests you've quoted, declined or that got booked show up here."));
  }
  fill(list, requests.map(requestCard));
}

function requestBadge(r) {
  if (r.status === "new") return h("span.badge.accent", "New");
  if (r.status === "quoted") return h("span.badge.warn", "Quoted, waiting on client");
  if (r.status === "booked") return h("span.badge.ok", icon("check", 13), "Booked");
  if (r.status === "declined") return h("span.badge", "Declined");
  return h("span.badge", "Withdrawn");
}

function requestCard(r) {
  const ig = String(r.clientInstagram || "").replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "");
  const actions = [];
  if (["new", "quoted"].includes(r.status)) {
    actions.push(h("button.btn.primary.sm", { type: "button", onclick: () => quoteDialog(r) }, icon("send", 15), r.status === "quoted" ? "Edit quote" : "Send quote"));
    actions.push(h("button.btn.ghost.sm", { type: "button", onclick: () => declineRequest(r) }, "Decline"));
  }
  const q = r.quote;
  return h("article.card.bk.req",
    h("div",
      h("div.bk-head",
        h("div", h("div.bk-name", r.clientName), h("div.bk-service", `${r.serviceName} · ${relTime(r.createdAt)}`)),
        requestBadge(r)),
      h("div.bk-notes.pre", r.idea),
      r.placement || r.size || r.styleLabel ? h("div.row.tight", { style: { flexWrap: "wrap", marginTop: "10px" } },
        r.placement ? h("span.chip", icon("pin", 13), r.placement) : null,
        r.size ? h("span.chip", r.size) : null,
        r.styleLabel ? h("span.chip", r.styleLabel) : null) : null,
      r.photos.length ? h("div.ref-photos.view", r.photos.map((src, i) => h("button.ref-photo", { type: "button", "aria-label": `View reference ${i + 1}`, onclick: () => lightbox(src, "Reference photo") }, h("img", { src, alt: "" })))) : null,
      q ? h("div.bk-alert.waiting", icon("send", 17), h("span",
        `Quoted ${q.priceCents !== null ? money(q.priceCents, r.currency) + ", " : ""}${duration(q.durationMin)}, ${q.depositCents ? money(q.depositCents, r.currency) + " deposit" : "no deposit"}.` +
        (r.booking ? ` Booked for ${when(r.booking.startsAt, me.timezone)}${r.booking.status === "awaiting_deposit" ? " (deposit pending)" : ["expired", "cancelled"].includes(r.booking.status) ? ` (${r.booking.status}; they can pick a new time)` : ""}.` : ""))) : null,
      r.declineReason ? h("div.bk-notes", `You said: “${r.declineReason}”`) : null,
      h("div.bk-contacts",
        h("a", { href: `mailto:${r.clientEmail}` }, icon("mail", 14), h("span", r.clientEmail)),
        r.clientPhone ? h("a", { href: `tel:${r.clientPhone.replace(/[^\d+]/g, "")}` }, icon("phone", 14), h("span", r.clientPhone)) : null,
        ig ? h("a", { href: `https://instagram.com/${ig}`, target: "_blank", rel: "noopener noreferrer" }, icon("instagram", 14), h("span", "@" + ig)) : null),
      actions.length ? h("div.bk-actions", actions) : null));
}

async function quoteDialog(r) {
  const { services } = await api("/api/services");
  const svc = services.find((s) => s.id === r.serviceId) || {};
  const q = r.quote || { priceCents: svc.priceCents ?? null, depositCents: svc.depositCents ?? 0, durationMin: svc.durationMin || 120, message: "" };
  const sym = currencySymbol(me.currency);
  const moneyBox = (input) => h("div.money-input", h("span", sym), input);
  const price = h("input", { value: fromCents(q.priceCents), inputMode: "decimal", placeholder: "Optional" });
  const deposit = h("input", { value: fromCents(q.depositCents), inputMode: "decimal", placeholder: "0" });
  const lengths = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600, 720];
  const dur = selectOf(lengths.map((m) => [m, duration(m)]), q.durationMin);
  const message = h("textarea", { rows: 4, maxLength: 1000, placeholder: "e.g. Love this! I'd do it about 4 inches, fine line with light shading." }, q.message);
  const error = h("div.form-error", { role: "alert" });
  const sent = await modal({
    title: `Quote for ${firstName(r.clientName)}`,
    lead: "They'll get an email with this, then pick a time from your openings that fit the session length, and send the deposit.",
    wide: true,
    body: [
      h("div.grid-3.compact", field("Price", moneyBox(price), "Leave blank to discuss"), field("Deposit to book", moneyBox(deposit)), field("Session length", dur)),
      field("Message", message),
      !me.depositsReady ? h("div.notice.warn", icon("alert", 18), h("span", "To ask for a deposit, first add how clients pay you on the Deposits page.")) : null,
      error,
    ],
    actions: [
      { label: "Cancel", kind: "ghost", value: false },
      { label: r.quote ? "Update quote" : "Send quote", kind: "primary", value: true, onClick: async () => {
        error.textContent = "";
        try {
          await api(`/api/requests/${r.id}/quote`, { method: "POST", body: {
            priceCents: toCents(price.value), depositCents: toCents(deposit.value) ?? 0, durationMin: Number(dur.value), message: message.value,
          } });
        } catch (err) { error.textContent = err.message; return false; }
      } },
    ],
  });
  if (sent) await afterChange(r.quote ? "Quote updated" : "Quote sent");
}

async function declineRequest(r) {
  const reason = h("textarea", { rows: 3, maxLength: 500, placeholder: "e.g. Thanks! This isn't my style, but I'd recommend @someone." });
  const done = await modal({
    title: `Decline ${firstName(r.clientName)}'s request?`,
    lead: "They'll get a short email. Your message is included if you write one.",
    body: field("Message (optional)", reason),
    actions: [
      { label: "Keep it", kind: "ghost", value: false },
      { label: "Decline", kind: "danger", value: true, onClick: async () => { await api(`/api/requests/${r.id}/decline`, { method: "POST", body: { reason: reason.value } }); } },
    ],
  });
  if (done) await afterChange("Request declined");
}

// ---- Books & waitlist --------------------------------------------------------

async function renderWaitlist() {
  const { entries } = await api("/api/waitlist");
  const open = me.booksOpen;
  const message = h("textarea", { rows: 2, maxLength: 400, placeholder: "e.g. Books open again in November. Join the list to hear first." }, me.booksClosedMessage);

  const setBooks = async (next) => {
    await busy(null, async () => {
      setMe((await api("/api/me", { method: "PATCH", body: { booksOpen: next, booksClosedMessage: message.value } })).artist);
      await refreshMeta();
      toast(next ? "Books are open" : "Books are closed");
      if (next && entries.length && me.emailEnabled) await notifyWaitlist(entries.length, true);
      renderWaitlist();
    });
  };

  const statusCard = h("section.card.books-card" + (open ? ".open" : ".closed"),
    h("div.row.between", { style: { alignItems: "flex-start", gap: "16px" } },
      h("div",
        h("div.books-state", h("span.books-dot"), open ? "Books are open" : "Books are closed"),
        h("p.muted", { style: { marginTop: "6px" } }, open
          ? "Clients can book and send requests. Close your books when you're full; your page then collects a waitlist."
          : "Nobody can book or send requests. Your page shows your message and a “tell me when books open” form.")),
      h("button.btn" + (open ? "" : ".primary"), { type: "button", onclick: () => setBooks(!open) }, icon(open ? "lock" : "zap", 16), open ? "Close books" : "Open books")),
    h("div.field", { style: { marginTop: "18px" } }, h("label", "Message when books are closed"), message,
      h("button.btn.sm", { type: "button", style: { marginTop: "10px" }, onclick: (e) => busy(e.currentTarget, async () => {
        setMe((await api("/api/me", { method: "PATCH", body: { booksClosedMessage: message.value } })).artist);
        toast("Message saved");
      }) }, "Save message")));

  const emails = entries.map((w) => w.email);
  const notifyBtn = h("button.btn.primary", { type: "button", disabled: !entries.length, onclick: () => notifyWaitlist(entries.length, false) }, icon("send", 16), `Email everyone (${entries.length})`);
  const listCard = card(`Waitlist (${entries.length})`, "People who asked to hear when your books open.",
    entries.length ? h("div.wl-list", entries.map((w) => h("div.wl-row",
      h("div.grow", h("b", w.email), h("span.small.muted", `${w.name ? w.name + " · " : ""}joined ${relTime(w.createdAt)}${w.notifiedAt ? " · emailed " + relTime(w.notifiedAt) : ""}`)),
      h("button.btn.ghost.icon-only.sm", { type: "button", "aria-label": `Remove ${w.email}`, onclick: async () => {
        if (!(await confirmDialog(`Remove ${w.email}?`, "They won't be emailed when your books open.", { confirm: "Remove", danger: true }))) return;
        await busy(null, async () => { await api(`/api/waitlist/${w.id}`, { method: "DELETE" }); await refreshMeta(); renderWaitlist(); });
      } }, icon("trash", 16)))))
      : h("p.muted", open ? "Close your books and your page starts collecting a waitlist." : "Nobody yet. Share your link: people can join from your page."),
    entries.length ? h("div.row.tight", { style: { marginTop: "16px", flexWrap: "wrap" } },
      me.emailEnabled ? notifyBtn : null,
      h("button.btn", { type: "button", onclick: () => copyText(emails.join(", "), `${plural(emails.length, "email")} copied`) }, icon("copy", 16), "Copy all emails")) : null,
    entries.length && !me.emailEnabled ? h("p.hint", { style: { marginTop: "10px" } }, "Email isn't switched on for this site yet, so copy the addresses and send them a message yourself (use BCC).") : null);

  fill(view, pageHead("Books & waitlist", "Open and close your books, and tell your waitlist the moment they open."), h("div.stack", statusCard, listCard));
}

async function notifyWaitlist(count, justOpened) {
  const note = h("textarea", { rows: 3, maxLength: 1000, placeholder: "Optional: e.g. Flash day on the 13th! Custom spots for Nov–Dec." });
  const sent = await modal({
    title: justOpened ? `Tell your waitlist? (${count})` : `Email your waitlist (${count})`,
    lead: `Everyone on your list gets an email saying your books are open, with your booking link.`,
    body: field("Add a note (optional)", note),
    actions: [
      { label: justOpened ? "Not now" : "Cancel", kind: "ghost", value: false },
      { label: `Send to ${count}`, kind: "primary", value: true, onClick: async () => {
        const r = await api("/api/waitlist/notify", { method: "POST", body: { message: note.value } });
        setMe(r.artist);
        toast(`Emailed ${plural(r.sent, "person", "people")}`);
      } },
    ],
  });
  if (sent && !justOpened) renderWaitlist();
}

// ---- Consent & aftercare --------------------------------------------------------

function renderForms() {
  const t = { ...config.formTemplates, ...(() => { const b = config.business[me.businessType]; return { consentIntro: b.consent.intro, consentStatements: b.consent.statements, aftercareText: b.aftercare }; })() };
  let consentOn = me.consentEnabled, aftercareOn = me.aftercareEnabled;
  const intro = h("textarea", { rows: 3, maxLength: 4000 }, me.consentIntro || t.consentIntro);
  const statements = (me.consentStatements.length ? me.consentStatements : t.consentStatements).slice();
  const list = h("div.stmt-list");
  const draw = () => fill(list,
    statements.map((text, i) => {
      const input = h("textarea", { rows: 3, maxLength: 400, "aria-label": `Statement ${i + 1}` }, text);
      input.addEventListener("input", () => { statements[i] = input.value; });
      return h("div.stmt-row", h("span.stmt-n", i + 1), input,
        h("button.btn.ghost.icon-only.sm", { type: "button", "aria-label": "Remove statement", onclick: () => { statements.splice(i, 1); draw(); } }, icon("trash", 16)));
    }),
    statements.length < t.maxStatements ? h("button.btn.sm", { type: "button", onclick: () => { statements.push(""); draw(); list.querySelector(".stmt-row:last-of-type textarea")?.focus(); } }, icon("plus", 15), "Add statement") : null);
  draw();
  const aftercare = h("textarea", { rows: 10, maxLength: 4000 }, me.aftercareText || t.aftercareText);
  const review = h("input", { type: "url", value: me.reviewUrl, maxLength: 500, placeholder: "https://g.page/r/… (optional)" });

  const consentBody = h("div", { style: { marginTop: "16px" } },
    field("Intro", intro),
    h("div.field", h("span.label", "Clients tick each of these"), list),
    h("p.hint", "Clients also give their full legal name, date of birth (they must be 18+ on the day), any medical notes, and sign with their finger. You get a printable record for each booking."));
  const aftercareBody = h("div", { style: { marginTop: "16px" } },
    field("Aftercare instructions", aftercare, "Emailed 3 hours after the appointment ends, and shown on their booking page."),
    field("Review link", review, "Optional. Adds a “Leave a review” button (Google, Yelp…)."));
  const cTog = toggle(consentOn, (v) => { consentOn = v; consentBody.classList.toggle("hidden", !v); }, "Use a consent form");
  const aTog = toggle(aftercareOn, (v) => { aftercareOn = v; aftercareBody.classList.toggle("hidden", !v); }, "Send aftercare");
  consentBody.classList.toggle("hidden", !consentOn);
  aftercareBody.classList.toggle("hidden", !aftercareOn);

  fill(view,
    pageHead("Consent & aftercare", "Paperless consent forms before the appointment, and aftercare instructions after."),
    h("div.stack",
      h("section.card",
        h("div.row.between.side-by-side", h("div", h("h2.card-title", "Consent form"), h("p.card-sub", "Clients sign it on their phone from their booking page.")), cTog.el),
        consentBody),
      h("section.card",
        h("div.row.between.side-by-side", h("div", h("h2.card-title", "Aftercare"), h("p.card-sub", "Instructions sent automatically after each appointment.")), aTog.el),
        aftercareBody),
      !me.emailEnabled ? h("div.notice.info", icon("info", 18), h("span", "Email isn't switched on for this site yet: clients still see the consent form and aftercare on their booking page, but no emails go out.")) : null),
    saveBar("Save", async () => {
      setMe((await api("/api/me", { method: "PATCH", body: {
        consentEnabled: consentOn, consentIntro: intro.value, consentStatements: statements.filter((x) => x.trim()),
        aftercareEnabled: aftercareOn, aftercareText: aftercare.value, reviewUrl: review.value.trim(),
      } })).artist);
      await refreshMeta();
      toast("Saved");
    }),
  );
}

// ---- Router ----------------------------------------------------------------

const ROUTES = {
  home: renderHome, bookings: renderBookings, requests: renderRequests, services: renderServices, availability: renderAvailability,
  deposits: renderDeposits, waitlist: renderWaitlist, forms: renderForms, page: renderPage, settings: renderSettings, billing: renderBilling,
};

async function route() {
  const name = currentRoute();
  for (const a of document.querySelectorAll("[data-route]")) a.classList.toggle("active", a.dataset.route === name);
  try {
    await ROUTES[name]();
  } catch (err) {
    if (err.status === 401) return location.replace("/login");
    fill(view, h("div.notice.warn", icon("alert", 18), h("span", err.message)));
  }
}

async function start() {
  try {
    [config] = await Promise.all([getConfig(), refreshMeta()]);
  } catch (err) {
    if (err.status === 401) return location.replace("/login");
    return fill(view, h("div.notice.warn", icon("alert", 18), h("span", err.message)));
  }
  await route();
  window.addEventListener("hashchange", async () => {
    window.scrollTo(0, 0);
    await refreshMeta().catch(() => {});
    route();
  });

  if (new URLSearchParams(location.search).has("welcome")) {
    history.replaceState(null, "", "/app" + location.hash);
    modal({
      title: "Your page is live 🎉",
      lead: `It's at ${me.bookingUrl.replace(/^https?:\/\//, "")}. Three quick things before you share it:`,
      body: h("ol.help-steps", { style: { fontSize: "1rem" } },
        h("li", "Add the services you offer, with a deposit for each"),
        h("li", "Check your weekly hours"),
        h("li", "Add how clients pay you (PayPal, Venmo, bank…)")),
      actions: [{ label: "Let's go", kind: "primary", value: true }],
    }).then(() => { location.hash = "#services"; });
  }

  // Keep the "needs action" badge fresh while the dashboard is open.
  setInterval(() => { if (!document.hidden) refreshMeta().catch(() => {}); }, 60000);
}

start();
