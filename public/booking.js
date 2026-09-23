const token = location.pathname.split("/")[2];
const params = new URLSearchParams(location.search);
const main = document.getElementById("main");
const base = `/api/public/bookings/${encodeURIComponent(token)}`;

async function init() {
  try {
    // Came back from Stripe via "back": release the held slot.
    const { booking } = params.has("abandon")
      ? await api(`${base}/abandon`, { method: "POST", body: {} })
      : await api(base);
    history.replaceState(null, "", location.pathname + (params.has("demo_pay") ? "?demo_pay=1" : ""));
    render(booking);
    // The Stripe webhook usually lands within seconds of the redirect.
    if (params.has("paid") && booking.status === "pending_payment") poll(0);
  } catch {
    fill(main, h("h1", "Booking not found"), h("p.muted", "Check the link in your email."));
  }
}

async function poll(n) {
  if (n > 15) return;
  await new Promise((r) => setTimeout(r, 2000));
  const { booking } = await api(base);
  render(booking);
  if (booking.status === "pending_payment") poll(n + 1);
}

function render(b) {
  const a = b.artist;
  const rebook = h("a.btn", { href: `/${a.handle}` }, "Pick a new time");
  const details = h("div.card",
    h("div.summary-line", h("span.muted", "With"), h("b", a.displayName)),
    h("div.summary-line", h("span.muted", "Service"), h("span", b.serviceName)),
    h("div.summary-line", h("span.muted", "When"), h("b", b.when)),
    a.location ? h("div.summary-line", h("span.muted", "Where"), h("span", { style: "text-align:right" }, a.location)) : null,
    b.depositCents ? h("div.summary-line", h("span.muted", "Deposit"),
      h("span", money(b.depositCents, b.currency) + (b.refunded ? " (refunded)" : b.depositPaid ? " paid" : " unpaid"))) : null,
  );

  let head, actions = [];
  if (b.status === "confirmed") {
    head = [h("h1", "You're booked ✓"), h("p.muted", `A confirmation has been sent to your email. See you there, ${b.clientName.split(" ")[0]}!`)];
    actions.push(h("div.row",
      h("a.btn", { href: b.googleCalendarUrl, target: "_blank", rel: "noopener" }, "Add to Google Calendar"),
      h("a.btn", { href: `${base}/ics` }, "Apple / Outlook (.ics)")));
  } else if (b.status === "pending_payment") {
    if (params.has("demo_pay") && b.demoPayments) {
      head = [h("h1", "Pay your deposit"), h("p.muted", "Demo mode: this button stands in for the card payment page. Nothing is charged.")];
      const pay = h("button.btn.primary.block", { onclick: async () => {
        pay.disabled = true;
        try { const r = await api(`${base}/demo-pay`, { method: "POST", body: {} }); history.replaceState(null, "", location.pathname); params.delete("demo_pay"); render(r.booking); }
        catch (err) { alert(err.message); pay.disabled = false; }
      } }, `Pay ${money(b.depositCents, b.currency)} (demo)`);
      actions.push(pay);
    } else {
      head = [h("h1", "Confirming your payment…"), h("p.muted", "This usually takes a few seconds. You'll get an email once it's through.")];
    }
  } else if (b.status === "expired") {
    head = [h("h1", "This time wasn't booked"), h("p.muted", "The deposit wasn't completed, so the slot was released.")];
    actions.push(rebook);
  } else {
    head = [h("h1", "Booking cancelled"),
      h("p.muted", b.refunded ? "Your deposit has been refunded. It can take 5–10 days to show up on your statement."
        : b.depositPaid ? "The deposit was kept per the booking policy." : "")];
    actions.push(rebook);
  }

  if (b.cancellable && b.status === "confirmed") {
    const note = b.depositPaid
      ? (b.refundOnCancel ? "You'll get your deposit back if you cancel now."
        : `It's less than ${a.cancelWindowHours} hours away, so the deposit won't be refunded.`)
      : "";
    const cancel = h("button.btn.danger", { onclick: async () => {
      if (!confirm(`Cancel this appointment?${note ? "\n\n" + note : ""}`)) return;
      cancel.disabled = true;
      try { render((await api(`${base}/cancel`, { method: "POST", body: {} })).booking); }
      catch (err) { alert(err.message); cancel.disabled = false; }
    } }, "Cancel appointment");
    actions.push(h("div.card.stack", h("b", "Need to cancel?"), note ? h("p.small.muted", note) : null,
      a.policy ? h("details", h("summary.small", "Booking policy"), h("p.policy", a.policy)) : null, h("div", cancel)));
  }

  fill(main, ...head, details, ...actions);
}

init();
