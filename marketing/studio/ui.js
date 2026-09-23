// Speech bubbles and sound-effect words pinned to 3D positions.
export function bubbles(defs) {
  const layer = document.getElementById("bubbles");
  return defs.map((d) => {
    const el = document.createElement("div");
    el.className = (d.sfx ? "sfx" : "bub") + (d.cls ? " " + d.cls : "");
    el.innerHTML = d.text; layer.appendChild(el);
    if (d.tail) el.style.setProperty("--tail", d.tail);
    return { ...d, el };
  });
}
// Show each bubble inside [t0, t1], anchored above a world point (from anchor()).
export function showBubbles(t, list, toScreen) {
  for (const b of list) {
    const k = Math.min(E.back(prog(t, b.t0, b.t0 + 0.35)), 1 - prog(t, b.t1 - 0.18, b.t1));
    if (k <= 0) { b.el.style.opacity = 0; continue; }
    const p = toScreen(b.anchor(t));
    const w = b.el.offsetWidth, h = b.el.offsetHeight;
    let x = p.x - w * (b.align ?? 0.5), y = p.y - h - 30 + (b.dy ?? 0);
    x = Math.max(40, Math.min(1080 - 40 - w, x));
    b.el.style.opacity = clamp(k * 1.3);
    b.el.style.transform = `translate(${x}px, ${y}px) scale(${lerp(0.5, 1, k)}) rotate(${b.rot ?? 0}deg)`;
  }
}
