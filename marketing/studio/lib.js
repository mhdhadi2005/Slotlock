// Tiny deterministic timeline: every scene exposes render(t) and the recorder
// screenshots it frame by frame, so nothing depends on real-time animation.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: (k) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
const $ = (s) => document.querySelector(s);
const style = (el, { o, x = 0, y = 0, s = 1, r = 0, blur }) => {
  if (o != null) el.style.opacity = o;
  el.style.transform = `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
  if (blur != null) el.style.filter = blur ? `blur(${blur}px)` : "none";
};
// Enter/exit envelope: 0→1 over `fin` after t0, 1→0 over `fout` before t1.
const env = (t, t0, t1, fin = 0.35, fout = 0.25) => Math.min(E.out(prog(t, t0, t0 + fin)), 1 - prog(t, t1 - fout, t1));
// Keyframes [[t, v], ...] with eased interpolation.
const keys = (t, ks, ease = E.inOut) => {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) return lerp(ks[i - 1][1], ks[i][1], ease(prog(t, ks[i - 1][0], ks[i][0])));
  return ks[ks.length - 1][1];
};

function base({ foot = true } = {}) {
  document.body.insertAdjacentHTML("afterbegin", `<div class="glow"></div><div id="cap"></div>`);
  const word = '<span class="wordmark">sl<span class="wm-key"></span>tl<span class="wm-dot"></span>ck</span>';
  const brand = `<span class="brand"><span class="brand-mark">${window.MARK}</span>${word}</span>`;
  if (foot) document.body.insertAdjacentHTML("beforeend", `<div id="foot">${brand}</div>`);
  document.body.insertAdjacentHTML("beforeend", `<div id="outro"><div>${brand}<h2 id="o-h"></h2><p id="o-p"></p><div class="cta" id="o-cta"></div></div></div>`);
}

let capNow = null;
function captions(t, list) {
  const c = list.find((x) => t >= x.t0 && t < x.t1);
  const el = $("#cap");
  if (!c) { el.style.opacity = 0; return; }
  if (capNow !== c) { el.innerHTML = c.html; capNow = c; }
  const k = env(t, c.t0, c.t1, 0.3, 0.22);
  style(el, { o: k, y: (1 - k) * 22 });
}

function phone(parent, shots) {
  const el = document.createElement("div"); el.className = "phone";
  el.innerHTML = `<div class="screen">${shots.map((s) => `<img data-n="${s}" src="/__shots/${s}.png">`).join("")}<div class="tap"></div></div>`;
  parent.appendChild(el);
  const imgs = Object.fromEntries([...el.querySelectorAll("img")].map((i) => [i.dataset.n, i]));
  return {
    el,
    // layers: [{ n, t0, t1, scroll: [[t, y], ...] }] — crossfades between screens.
    screens(t, layers, fade = 0.35) {
      for (const i of Object.values(imgs)) i.style.opacity = 0;
      for (const L of layers) {
        const i = imgs[L.n];
        const o = Math.min(prog(t, L.t0, L.t0 + fade), 1 - prog(t, L.t1, L.t1 + fade));
        if (o <= 0) continue;
        i.style.opacity = o;
        i.style.transform = `translateY(${-(L.scroll ? keys(t, L.scroll) : 0)}px)`;
      }
    },
    // taps: [{ t, x, y }] in screen (390-wide) coordinates.
    taps(t, list) {
      const tap = el.querySelector(".tap");
      const c = list.find((x) => t > x.t - 0.4 && t < x.t + 0.35);
      if (!c) { tap.style.opacity = 0; return; }
      tap.style.left = c.x + "px"; tap.style.top = c.y + "px";
      const k = t < c.t ? E.out(prog(t, c.t - 0.4, c.t - 0.1)) : 1 - prog(t, c.t + 0.1, c.t + 0.35);
      style(tap, { o: k, s: t < c.t ? lerp(0.5, 1, k) : lerp(0.85, 1, 1 - k) });
    },
  };
}

function outro(t, t0, { h, p, cta = 'DM "BOOK"' }) {
  const o = $("#outro");
  $("#o-h").innerHTML = h; $("#o-p").innerHTML = p; $("#o-cta").textContent = cta;
  const k = E.out(prog(t, t0, t0 + 0.5));
  o.style.opacity = k;
  const kk = E.back(prog(t, t0 + 0.2, t0 + 0.8));
  style($("#o-cta"), { s: lerp(0.8, 1, kk), o: clamp(kk * 1.4) });
}
