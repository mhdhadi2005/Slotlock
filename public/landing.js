// Landing page touches that depend on the server it's running on.
(() => {
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  document.getElementById("year").textContent = new Date().getFullYear();
  for (const el of document.querySelectorAll("[data-host]")) el.textContent = location.host;

  // The phone mockup shows the live example's real portfolio.
  const art = document.querySelector(".mock-art");
  api(`/api/public/artists/${document.body.dataset.demo || "demo"}`)
    .then(({ artist }) => {
      art.querySelectorAll("img").forEach((img, i) => {
        if (artist.portfolio[i]) img.src = artist.portfolio[i];
        else img.remove();
      });
    })
    .catch(() => art.remove());

  getConfig()
    .then((c) => {
      if (!c.billingEnabled) return;
      document.getElementById("price-note").textContent = `Free for ${c.trialDays} days, then $19/month. No card needed to start.`;
      document.getElementById("price-cta").textContent = `Start your ${c.trialDays}-day free trial`;
    })
    .catch(() => {});
})();
