// "Leave the waitlist" link from a books-open email. Asks before removing, so
// email link scanners that open every URL can't unsubscribe anyone.
const token = decodeURIComponent(location.pathname.split("/")[3] || "");
const main = document.getElementById("main");
const base = `/api/public/waitlist/${encodeURIComponent(token)}`;

async function load() {
  let info;
  try {
    info = await api(base);
  } catch {
    return done("You're not on this waitlist", "Nothing to do: you won't get any more emails from it.");
  }
  const btn = h("button.btn.danger.lg", { type: "button" }, "Leave the waitlist");
  btn.addEventListener("click", () => busy(btn, async () => {
    await api(`${base}/leave`, { method: "POST", body: {} });
    done("You've left the waitlist", `You won't get any more emails about ${info.artistName}'s books.`);
  }));
  fill(main, h("div.status-hero", { style: { paddingTop: "64px" } },
    h("div.status-icon.wait", icon("bell", 28)),
    h("h1", `Leave ${info.artistName}'s waitlist?`),
    h("p", `${info.email} won't get an email next time their books open.`),
    btn));
}

function done(title, text) {
  fill(main, h("div.status-hero", { style: { paddingTop: "64px" } }, h("div.status-icon.ok", icon("check", 28)), h("h1", title), h("p", text)));
}

load();
