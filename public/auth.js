const isSignup = location.pathname === "/signup";
const form = document.getElementById(isSignup ? "signup" : "login");
form.classList.remove("hidden");
document.title = isSignup ? "Sign up · Slotlock" : "Log in · Slotlock";

// Already logged in? Straight to the dashboard.
api("/api/me").then(() => location.replace("/app")).catch(() => {});

if (isSignup) {
  document.getElementById("s-origin").textContent = `${location.host}/`;
  const tzSelect = document.getElementById("s-tz");
  const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];
  // The browser can report a zone (e.g. "UTC") that isn't in the list.
  if (!zones.includes(guess)) zones.unshift(guess);
  for (const z of zones) tzSelect.append(h("option", { value: z, selected: z === guess }, z.replace(/_/g, " ")));

  const name = document.getElementById("s-name");
  const handle = document.getElementById("s-handle");
  let handleTouched = false;
  const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  name.addEventListener("input", () => { if (!handleTouched) handle.value = slug(name.value); });
  handle.addEventListener("input", () => { handleTouched = true; handle.value = handle.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    document.getElementById("s-error").textContent = "";
    try {
      await api("/api/auth/signup", { method: "POST", body: {
        displayName: name.value, handle: handle.value,
        email: document.getElementById("s-email").value,
        password: document.getElementById("s-password").value,
        timezone: tzSelect.value,
      }});
      location.href = "/app#setup";
    } catch (err) {
      document.getElementById("s-error").textContent = err.message;
      btn.disabled = false;
    }
  });
} else {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    document.getElementById("l-error").textContent = "";
    try {
      await api("/api/auth/login", { method: "POST", body: {
        email: document.getElementById("l-email").value,
        password: document.getElementById("l-password").value,
      }});
      location.href = "/app";
    } catch (err) {
      document.getElementById("l-error").textContent = err.message;
      btn.disabled = false;
    }
  });
}
