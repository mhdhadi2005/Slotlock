// A client's own booking, addressed by the unguessable token in the URL.
// While a deposit is due it shows how to pay the artist; afterwards it's the
// booking's status page.
const token = decodeURIComponent(location.pathname.split("/")[2] || "");
const main = document.getElementById("main");
const base = `/api/public/bookings/${encodeURIComponent(token)}`;
let booking = null;
let ticker = null;
let poller = null;

const PM_LETTER = { paypal: "P", venmo: "V", cashapp: "$", zelle: "Z", revolut: "R", monzo: "M", upi: "₹" };
const PM_ICON = { bank: "bank", link: "link", other: "info" };

async function load() {
  try {
    booking = (await api(base)).booking;
  } catch {
    return fill(main, h("div.status-hero", { style: { paddingTop: "64px" } },
      h("div.status-icon.off", icon("alert", 28)), h("h1", "Booking not found"), h("p", "Check the link in your email, or ask the artist.")));
  }
  remember();
  render();
}

// Lets the artist's page show "you have a booking here" on this device.
function remember() {
  const saved = store.get("slotlock:bookings", []);
  if (!saved.some((b) => b.token === token) && booking.status !== "expired") {
    saved.push({ token, handle: booking.artist.handle, startsAt: booking.startsAt, service: booking.serviceName });
    store.set("slotlock:bookings", saved.slice(-20));
  }
}

function render() {
  clearInterval(ticker);
  clearInterval(poller);
  const b = booking, a = b.artist;
  setAccent(a.accent);
  document.title = `${b.serviceName} with ${a.displayName}`;
  const amount = money(b.depositCents, b.currency);
  const awaiting = b.status === "awaiting_deposit";

  const top = h("a.bs-top", { href: `/${a.handle}` }, avatarEl(a.avatarUrl, a.displayName), h("div", h("b", a.displayName), h("span", "Back to booking page")));

  let hero;
  if (awaiting && !b.depositReported) {
    const countdown = h("span.countdown", icon("hourglass", 15), h("span", `Held for you for ${timeLeft(b.holdExpiresAt)}`));
    ticker = setInterval(() => {
      if (Date.parse(b.holdExpiresAt) <= Date.now()) return load();
      countdown.lastChild.textContent = `Held for you for ${timeLeft(b.holdExpiresAt)}`;
    }, 30000);
    hero = h("div.status-hero",
      h("div.status-icon.accent", icon("banknote", 28)),
      h("h1", "Send your deposit to lock it in"),
      h("p", `${a.displayName} is holding ${b.when} for you. Send the ${amount} deposit using one of the options below, then let them know.`),
      countdown);
  } else if (awaiting) {
    hero = h("div.status-hero",
      h("div.status-icon.wait", icon("clock", 28)),
      h("h1", `Waiting for ${a.displayName.split(" ")[0]} to confirm`),
      h("p", `Thanks! You said you sent the ${amount} deposit. You'll get an email as soon as ${a.displayName} confirms it arrived. Your time stays held until then.`));
    poller = setInterval(async () => {
      if (document.hidden) return;
      try { booking = (await api(base)).booking; if (booking.status !== "awaiting_deposit") render(); } catch {}
    }, 20000);
  } else if (b.status === "confirmed") {
    hero = h("div.status-hero",
      h("div.status-icon.ok", icon("calcheck", 28)),
      h("h1", "You're booked!"),
      h("p", a.isDemo
        ? "On a real page, the artist confirms here once your deposit arrives. That's the whole flow. Want one of your own?"
        : `See you ${b.when}. A confirmation is on its way to your inbox.`));
  } else if (b.status === "expired") {
    hero = h("div.status-hero",
      h("div.status-icon.off", icon("hourglass", 28)),
      h("h1", "This hold expired"),
      h("p", "The deposit wasn't marked as sent in time, so the slot was released. If you already paid, message the artist directly."));
  } else {
    const who = b.cancelledBy === "artist" ? `${a.displayName} cancelled this booking.` : "This booking was cancelled.";
    let moneyLine = "";
    if (b.refundStatus === "owed") moneyLine = ` ${a.displayName} will send your ${amount} deposit back.`;
    else if (b.refundStatus === "refunded") moneyLine = ` Your ${amount} deposit was refunded.`;
    else if (b.depositPaid) moneyLine = ` The ${amount} deposit wasn't refundable this close to the appointment.`;
    hero = h("div.status-hero", h("div.status-icon.off", icon("x", 28)), h("h1", "Booking cancelled"), h("p", who + moneyLine));
  }

  const showTimeline = b.depositCents > 0 && ["awaiting_deposit", "confirmed"].includes(b.status);
  const stepClass = (i) => {
    const at = b.status === "confirmed" ? 3 : b.depositReported ? 2 : 1;
    return i < at ? ".done" : i === at ? ".now" : "";
  };
  const timeline = showTimeline ? h("div.timeline",
    ["Requested", "Deposit sent", "Confirmed"].map((label, i) => h("div.tl-step" + stepClass(i),
      h("span.tl-dot", stepClass(i) === ".done" ? icon("check", 14) : null), label))) : null;

  fill(main,
    top,
    a.isDemo ? h("div.notice.accent", { style: { marginTop: "8px" } }, icon("sparkle", 18),
      h("span", "This is the example page. Nothing here is real, so go ahead and click around. ", h("a.link", { href: "/signup" }, "Make your own page"))) : null,
    hero,
    timeline,
    awaiting && !b.depositReported ? paymentBlock() : null,
    b.status === "confirmed" ? h("div.row", { style: { marginTop: "22px" } },
      h("a.btn.primary", { href: b.googleCalendarUrl, target: "_blank", rel: "noopener" }, icon("calendar", 16), "Google Calendar"),
      h("a.btn", { href: `${base}/ics` }, icon("calendar", 16), "Apple / Outlook")) : null,
    a.isDemo && b.status === "confirmed" ? h("a.btn.light", { href: "/signup", style: { marginTop: "12px" } }, "Create my free page", icon("arrow", 16)) : null,
    detailsCard(),
    b.cancellable ? cancelCard() : null,
    ["expired", "cancelled"].includes(b.status) ? h("a.btn.primary", { href: `/${a.handle}`, style: { marginTop: "20px" } }, "Pick a new time") : null,
    !["expired", "cancelled"].includes(b.status) ? h("p.fine.center", { style: { marginTop: "24px" } },
      "Bookmark this page to check on your booking. ", h("button.link-btn", { type: "button", onclick: () => copyText(location.href, "Link copied") }, "Copy link")) : null,
  );
}

function paymentBlock() {
  const b = booking, a = b.artist, p = b.payment;
  const amount = money(b.depositCents, b.currency);

  const methods = p.methods.map((m) => {
    const logo = PM_LETTER[m.type] ? h("div.pm-logo." + m.type, PM_LETTER[m.type]) : h("div.pm-logo." + m.type, icon(PM_ICON[m.type] || "wallet", 20));
    let action = null;
    if (m.href) {
      action = h("a.btn.primary.sm", { href: m.href, target: "_blank", rel: "noopener noreferrer" }, "Pay", icon("external", 14));
    } else if (m.copy) {
      action = h("button.btn.sm", { type: "button", onclick: () => copyText(m.copy, `${m.label} details copied`) }, icon("copy", 14), "Copy");
    } else if (a.isDemo) {
      action = h("button.btn.primary.sm", { type: "button", onclick: () => toast("On a real page, this opens the app to pay the artist.", "info") }, "Pay", icon("external", 14));
    }
    return h("div.pm", logo, h("div", { style: { minWidth: 0 } }, h("div.pm-name", m.label), h("div.pm-value", m.display)), action);
  });

  const report = h("button.btn.primary.lg.block", { type: "button" }, icon("check", 18), "I've sent the deposit");
  report.addEventListener("click", reportDeposit);

  return h("div.stack", { style: { marginTop: "26px" } },
    h("div.amount-card",
      h("div", h("div.lbl", "Deposit to send"), h("div.amt", amount)),
      h("div", h("div.lbl", "Put this in the payment note"),
        h("button.ref", { type: "button", title: "Copy reference", onclick: () => copyText(b.refCode, "Reference copied") }, b.refCode, icon("copy", 16)))),
    methods.length ? h("div.pay-methods", methods) : null,
    p.note ? h("div.pay-note", p.note) : null,
    h("div.bottom-cta", report,
      h("p.fine.center", { style: { marginTop: "10px" } }, `Tap this once you've paid. ${a.displayName} checks it arrived, then confirms your booking.`)),
  );
}

async function reportDeposit() {
  const b = booking;
  const methods = b.payment.methods;
  const name = "paid-with";
  const body = methods.length > 1
    ? h("div.field", h("span.label", "How did you pay?"),
      h("div.choice-list", methods.map((m, i) => h("label.choice", h("input", { type: "radio", name, value: m.type, checked: i === 0 }), m.label))))
    : null;
  const ok = await modal({
    title: `Sent ${money(b.depositCents, b.currency)} to ${b.artist.displayName}?`,
    lead: `Only tap yes once the payment has gone through, with ${b.refCode} in the note.`,
    body,
    actions: [
      { label: "Not yet", kind: "ghost", value: false },
      {
        label: "Yes, I've sent it", kind: "primary", value: true,
        onClick: async () => {
          const method = methods.length > 1 ? document.querySelector(`input[name="${name}"]:checked`)?.value : methods[0]?.type;
          booking = (await api(`${base}/report-deposit`, { method: "POST", body: { method: method || "" } })).booking;
        },
      },
    ],
  });
  if (ok) {
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function detailsCard() {
  const b = booking, a = b.artist;
  const minutes = Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000);
  const depositText = b.depositCents
    ? `${money(b.depositCents, b.currency)} · ${b.refundStatus === "refunded" ? "refunded" : b.refundStatus === "owed" ? "refund on its way" : b.depositPaid ? "received" : b.depositReported ? "sent, awaiting confirmation" : "not sent yet"}`
    : "None";
  return h("section.card", { style: { marginTop: "26px" } },
    h("dl.details",
      h("dt", "Service"), h("dd", b.serviceName),
      h("dt", "When"), h("dd", h("b", b.when)),
      h("dt", "Length"), h("dd", duration(minutes)),
      a.location ? [h("dt", "Where"), h("dd", a.location)] : null,
      h("dt", "Deposit"), h("dd", depositText),
      b.depositCents ? [h("dt", "Reference"), h("dd.mono", b.refCode)] : null,
      h("dt", "Name"), h("dd", b.clientName)),
    b.cancelReason ? h("div.notice", { style: { marginTop: "16px" } }, icon("message", 18), h("span", `“${b.cancelReason}”`)) : null);
}

function cancelCard() {
  const b = booking, a = b.artist;
  const amount = money(b.depositCents, b.currency);
  const sent = b.depositCents > 0 && (b.depositPaid || b.depositReported);
  const note = !sent ? "" : b.refundOnCancel
    ? `You'll get your ${amount} deposit back if you cancel now.`
    : `It's less than ${a.cancelWindowHours} hours away, so the deposit won't be refunded if you cancel.`;

  const cancel = h("button.btn.danger", { type: "button" }, "Cancel booking");
  cancel.addEventListener("click", async () => {
    const reason = h("textarea", { rows: 3, maxLength: 500, placeholder: "Let them know why (optional)" });
    const ok = await modal({
      title: "Cancel this booking?",
      lead: note || "The time will be released for someone else.",
      body: h("div.field", h("label", "Message"), reason),
      actions: [
        { label: "Keep booking", kind: "ghost", value: false },
        { label: "Cancel booking", kind: "danger", value: true, onClick: async () => {
          booking = (await api(`${base}/cancel`, { method: "POST", body: { reason: reason.value } })).booking;
        } },
      ],
    });
    if (ok) { render(); toast("Booking cancelled"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });

  return h("section.card", { style: { marginTop: "12px" } },
    h("div.card-head", h("div", h("h2.card-title", "Need to cancel?"), h("p.card-sub", note || "You can cancel any time before the appointment."))),
    a.policy ? h("details", { style: { marginBottom: "16px" } }, h("summary.small.muted", { style: { cursor: "pointer" } }, "Booking policy"), h("p.pre.small.text-2", { style: { marginTop: "10px" } }, a.policy)) : null,
    cancel);
}

load();
