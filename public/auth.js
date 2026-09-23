// Sign up, log in, forgot password and reset password: one page, four modes.
const card = document.getElementById("card");
const path = location.pathname;
const mode = path === "/signup" ? "signup" : path === "/forgot" ? "forgot" : path.startsWith("/reset/") ? "reset" : "login";

const logo = () => h("a.brand", { href: "/" }, brandMark(), wordmark());

function field(label, input, hint) {
  input.id ||= "f-" + Math.random().toString(36).slice(2);
  return h("div.field", h("label", { for: input.id }, label), input, hint ? h("div.hint", hint) : null);
}

function passwordInput(autocomplete) {
  const input = h("input", { type: "password", autocomplete, minLength: 8, required: true });
  const toggle = h("button", { type: "button", "aria-label": "Show password" }, icon("eye", 18));
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    fill(toggle, icon(show ? "eyeoff" : "eye", 18));
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  return { input, el: h("div.pw-wrap", input, toggle) };
}

function form(onSubmit, ...children) {
  const error = h("div.form-error", { role: "alert" });
  const el = h("form", { novalidate: true }, children, error);
  el.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const btn = el.querySelector("button[type=submit]");
    btn.classList.add("loading");
    try {
      await onSubmit();
    } catch (err) {
      error.textContent = err.message;
    } finally {
      btn.classList.remove("loading");
    }
  });
  return el;
}

function signup() {
  document.title = "Create your page · Slotlock";
  const name = h("input", { autocomplete: "name", required: true, placeholder: "Rosa Vega Tattoo" });
  const handle = h("input", { autocapitalize: "none", spellcheck: "false", required: true, placeholder: "rosavega" });
  const email = h("input", { type: "email", autocomplete: "email", required: true });
  const pw = passwordInput("new-password");
  const tz = h("select");
  const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];
  // The browser can report a zone (e.g. "UTC") that isn't in the list.
  if (!zones.includes(guess)) zones.unshift(guess);
  for (const z of zones) tz.append(h("option", { value: z, selected: z === guess }, z.replace(/_/g, " ")));

  let touched = false;
  const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  name.addEventListener("input", () => { if (!touched) handle.value = slug(name.value); });
  handle.addEventListener("input", () => { touched = true; handle.value = handle.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); });

  fill(card,
    logo(),
    h("h1", "Create your booking page"),
    h("p.sub", "Free during early access. Takes about 10 minutes to set up."),
    form(async () => {
      await api("/api/auth/signup", { method: "POST", body: {
        displayName: name.value, handle: handle.value, email: email.value, password: pw.input.value, timezone: tz.value,
      } });
      location.href = "/app?welcome=1";
    },
      field("Your name or studio", name),
      field("Your booking link", h("div.affix", h("span", `${location.host}/`), handle), "Lowercase letters, numbers and dashes. You can change it later."),
      field("Email", email),
      field("Password", pw.el, "At least 8 characters."),
      field("Timezone", tz, "Your hours and bookings use this."),
      h("button.btn.primary.lg.block", { type: "submit" }, "Create my page", icon("arrow", 18)),
    ),
    h("p.auth-foot", "Already have a page? ", h("a.link", { href: "/login" }, "Log in")),
  );
}

function login() {
  document.title = "Log in · Slotlock";
  const email = h("input", { type: "email", autocomplete: "email", required: true });
  const pw = passwordInput("current-password");
  fill(card,
    logo(),
    h("h1", "Welcome back"),
    h("p.sub", "Log in to see your bookings."),
    form(async () => {
      await api("/api/auth/login", { method: "POST", body: { email: email.value, password: pw.input.value } });
      location.href = "/app";
    },
      field("Email", email),
      field("Password", pw.el),
      h("div", { style: { margin: "-6px 0 18px", textAlign: "right" } }, h("a.link.small", { href: "/forgot" }, "Forgot your password?")),
      h("button.btn.primary.lg.block", { type: "submit" }, "Log in"),
    ),
    h("p.auth-foot", "New here? ", h("a.link", { href: "/signup" }, "Create a free page")),
  );
}

function forgot() {
  document.title = "Reset password · Slotlock";
  const email = h("input", { type: "email", autocomplete: "email", required: true });
  const done = h("div.notice.ok.hidden", icon("mail", 18), h("span", "If there's an account for that email, a reset link is on its way. It works for one hour."));
  // Without an email service the link can't be sent, so don't promise it.
  // (The server writes it to its log, where the site owner can find it.)
  const noEmail = h("div.notice.warn.hidden", { style: { marginBottom: "18px" } }, icon("alert", 18),
    h("span", "Email isn't switched on for this site yet, so reset links can't be emailed. Contact the Slotlock team and they'll reset it for you."));
  getConfig().then((c) => { if (!c.emailEnabled) noEmail.classList.remove("hidden"); }).catch(() => {});
  fill(card,
    logo(),
    h("h1", "Forgot your password?"),
    h("p.sub", "Enter your email and we'll send you a link to choose a new one."),
    noEmail,
    done,
    form(async () => {
      await api("/api/auth/forgot", { method: "POST", body: { email: email.value } });
      if (noEmail.classList.contains("hidden")) done.classList.remove("hidden");
      else toast("Request received. It can't be emailed until email is switched on.", "info");
    },
      field("Email", email),
      h("button.btn.primary.lg.block", { type: "submit" }, "Send reset link"),
    ),
    h("p.auth-foot", h("a.link", { href: "/login" }, "Back to log in")),
  );
}

function reset() {
  document.title = "Choose a new password · Slotlock";
  const token = decodeURIComponent(path.split("/")[2] || "");
  const pw = passwordInput("new-password");
  fill(card,
    logo(),
    h("h1", "Choose a new password"),
    h("p.sub", "You'll be logged in straight after."),
    form(async () => {
      await api("/api/auth/reset", { method: "POST", body: { token, password: pw.input.value } });
      location.href = "/app";
    },
      field("New password", pw.el, "At least 8 characters."),
      h("button.btn.primary.lg.block", { type: "submit" }, "Save and log in"),
    ),
    h("p.auth-foot", h("a.link", { href: "/forgot" }, "Need a new link?")),
  );
}

({ signup, login, forgot, reset })[mode]();

// Already logged in? Straight to the dashboard (except when resetting).
if (mode === "login" || mode === "signup") api("/api/me").then(() => location.replace("/app")).catch(() => {});
