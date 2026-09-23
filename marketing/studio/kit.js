// Character kit for the 3D reels: toon-shaded characters built from primitives,
// posed purely from numbers so every frame is a function of time.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export { THREE };
export const W = 1080, H = 1920;

// ---- Renderer, camera, lights ------------------------------------------------
export function setup({ camPos = [0, 2.3, 15], look = [0, 1.55, 0], fov = 30 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById("gl").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 100);
  camera.position.set(...camPos);
  camera.lookAt(...look);
  scene.add(new THREE.HemisphereLight(0xfff3ea, 0x4a2c1c, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(4, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8a5c, 1.6);
  rim.position.set(-6, 5, -5);
  scene.add(rim);
  scene.add(spotFloor());
  const look3 = new THREE.Vector3(...look);
  return {
    renderer, scene, camera,
    frame() { renderer.render(scene, camera); },
    // Screen position (CSS px) of a world point, for speech bubbles.
    toScreen(v) {
      const p = v.clone().project(camera);
      return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H };
    },
    aim(pos, target = look3) { camera.position.copy(pos); camera.lookAt(target); },
  };
}

function radialTexture(stops) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function spotFloor() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, "rgba(255,120,80,0.34)"], [0.45, "rgba(255,92,57,0.12)"], [1, "rgba(255,92,57,0)"]]), transparent: true, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.001;
  return m;
}
const shadowTex = radialTexture([[0, "rgba(0,0,0,0.55)"], [0.6, "rgba(0,0,0,0.25)"], [1, "rgba(0,0,0,0)"]]);
export function blobShadow(w = 1.4, d = 0.9) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.005; m.renderOrder = 1;
  return m;
}

// ---- Materials ---------------------------------------------------------------
const grad = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
export const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...o });
export const flat = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
const outlineCache = new Map();
function outlineMat(th) {
  if (!outlineCache.has(th)) {
    const m = new THREE.MeshBasicMaterial({ color: 0x1a0f0a, side: THREE.BackSide });
    m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = position + normal * ${th.toFixed(4)};`); };
    outlineCache.set(th, m);
  }
  return outlineCache.get(th);
}
// A mesh plus an inverted-hull outline child.
export function mesh(geo, mat, th = 0.03) {
  const m = new THREE.Mesh(geo, mat);
  if (th) { const o = new THREE.Mesh(geo, outlineMat(th)); m.add(o); m.userData.outline = o; }
  return m;
}
const S = (r, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);

// ---- Face parts --------------------------------------------------------------
function eye(r) {
  const g = new THREE.Group();
  const white = mesh(S(r), toon(0xffffff), 0.018); white.scale.z = 0.55; g.add(white);
  const pupil = new THREE.Group(); g.add(pupil);
  const p = new THREE.Mesh(S(r * 0.6), flat(0x16100c)); p.scale.z = 0.5; p.position.z = r * 0.36; pupil.add(p);
  const hl = new THREE.Mesh(S(r * 0.2, 12, 8), flat(0xffffff)); hl.position.set(r * 0.22, r * 0.26, r * 0.58); pupil.add(hl);
  g.userData = { pupil, r };
  return g;
}
function mouth(r = 0.12) {
  const g = new THREE.Group();
  const smile = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.22, 8, 24, Math.PI), flat(0x2a130a));
  smile.rotation.z = Math.PI; g.add(smile);
  const o = new THREE.Mesh(S(r * 0.62), flat(0x2a130a)); o.scale.set(1, 1.2, 0.35); g.add(o);
  const flatM = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.2, r * 1.3, 4, 8), flat(0x2a130a)); flatM.rotation.z = Math.PI / 2; g.add(flatM);
  const frown = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, r * 0.2, 8, 24, Math.PI), flat(0x2a130a)); frown.position.y = -r * 0.5; g.add(frown);
  g.userData = { smile, o, flat: flatM, frown };
  return g;
}
function setMouth(m, kind) { for (const k of ["smile", "o", "flat", "frown"]) m.userData[k].visible = k === kind; }
function cheeks(x, y, z, r = 0.1) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CircleGeometry(r, 20), flat(0xff8f9e, { transparent: true, opacity: 0.55 })); c.position.set(s * x, y, z); c.scale.y = 0.7; g.add(c); }
  return g;
}
// Common pose logic shared by characters with eyes/mouth/arms.
function applyFace(c, p) {
  const blink = p.blink ?? 0;
  for (const e of c.eyes) {
    e.scale.y = Math.max(0.08, 1 - blink);
    e.userData.pupil.position.set((p.lookX ?? 0) * e.userData.r * 0.35, (p.lookY ?? 0) * e.userData.r * 0.35, 0);
  }
  if (c.mouth) setMouth(c.mouth, p.mouth ?? "smile");
}
function arm(len, r, color, side) {
  const pivot = new THREE.Group();
  const a = mesh(new THREE.CapsuleGeometry(r, len, 6, 12), toon(color), 0.02); a.position.y = -len / 2 - r * 0.3; pivot.add(a);
  const hand = mesh(S(r * 1.35), toon(color), 0.02); hand.position.y = -len - r; pivot.add(hand);
  pivot.userData = { hand, side };
  return pivot;
}
// Blink curve: quick blinks every few seconds.
export function blinkAt(t, offset = 0) {
  const k = ((t + offset) % 3.1) / 3.1;
  return k > 0.95 ? Math.sin((k - 0.95) / 0.05 * Math.PI) : 0;
}

// ---- Lockie, the padlock mascot ------------------------------------------------
export function makeLockie() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  root.add(blobShadow(1.8, 1.0));
  const box = mesh(new RoundedBoxGeometry(1.34, 1.12, 0.84, 6, 0.3), toon(0xff5c39), 0.035);
  box.position.y = 0.76; body.add(box);
  const shackle = new THREE.Group(); body.add(shackle);
  const metal = toon(0xd9d2c8);
  const arc = mesh(new THREE.TorusGeometry(0.4, 0.105, 14, 36, Math.PI), metal, 0.03); shackle.add(arc);
  for (const s of [-1, 1]) { const leg = mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.36, 14), metal, 0.03); leg.position.set(s * 0.4, -0.18, 0); shackle.add(leg); }
  const face = new THREE.Group(); face.position.set(0, 0.84, 0.43); body.add(face);
  const eyes = [-1, 1].map((s) => { const e = eye(0.17); e.position.set(s * 0.26, 0.08, 0); face.add(e); return e; });
  const m = mouth(0.1); m.position.set(0, -0.19, 0.02); face.add(m);
  face.add(cheeks(0.46, -0.12, 0.005, 0.1));
  const kh = new THREE.Group(); kh.position.set(0, 0.36, 0.425); body.add(kh);
  kh.add(new THREE.Mesh(new THREE.CircleGeometry(0.065, 20), flat(0x5a1a0a)));
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.12), flat(0x5a1a0a)); slot.position.y = -0.07; kh.add(slot);
  const arms = [-1, 1].map((s) => { const a = arm(0.3, 0.085, 0xff5c39, s); a.position.set(s * 0.66, 0.92, 0); body.add(a); return a; });
  for (const s of [-1, 1]) { const f = mesh(S(0.17), toon(0xe0482a), 0.025); f.scale.set(1.15, 0.6, 1.3); f.position.set(s * 0.3, 0.1, 0.05); root.add(f); }
  // Sunglasses for the bouncer.
  const shades = new THREE.Group(); shades.position.set(0, 0.09, 0.08); face.add(shades); shades.visible = false;
  for (const s of [-1, 1]) { const l = mesh(new RoundedBoxGeometry(0.34, 0.2, 0.06, 3, 0.05), flat(0x111111), 0.015); l.position.x = s * 0.26; shades.add(l); }
  const br = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.04), flat(0x111111)); shades.add(br);
  const c = { root, body, shackle, eyes, mouth: m, arms, shades, face };
  c.pose = (p = {}) => {
    const s = p.squash ?? 0;
    body.scale.set(1 + s * 0.18, 1 - s * 0.2, 1 + s * 0.18);
    body.rotation.z = p.tilt ?? 0;
    shackle.position.y = 1.38 + (p.open ?? 0) * 0.22;
    shackle.rotation.y = (p.open ?? 0) * 0.5;
    arms[0].rotation.z = -(p.armL ?? 0.25); arms[1].rotation.z = (p.armR ?? 0.25);
    arms[0].rotation.x = p.armLx ?? 0; arms[1].rotation.x = p.armRx ?? 0;
    applyFace(c, p);
  };
  c.pose();
  return c;
}

// ---- The ghost (a no-show client) ------------------------------------------------
export function makeGhost() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shadow = blobShadow(1.3, 0.7); root.add(shadow);
  const prof = [[0.001, 1.62], [0.3, 1.58], [0.5, 1.46], [0.62, 1.26], [0.66, 1.0], [0.68, 0.7], [0.72, 0.42], [0.78, 0.2], [0.82, 0.06]].reverse().map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(prof, 64);
  const base = geo.attributes.position.array.slice();
  const mat = toon(0xf5f2ff, { transparent: true });
  const sheet = mesh(geo, mat, 0.03); body.add(sheet);
  sheet.userData.outline.material = sheet.userData.outline.material.clone();
  sheet.userData.outline.material.transparent = true;
  const face = new THREE.Group(); face.position.set(0, 1.08, 0.6); body.add(face);
  const eyes = [-1, 1].map((s) => { const e = new THREE.Group(); const b = new THREE.Mesh(S(0.085), flat(0x16100c, { transparent: true })); b.scale.set(1, 1.45, 0.4); e.add(b); e.position.set(s * 0.19, 0.04, 0); e.userData = { pupil: new THREE.Group(), r: 0.08 }; face.add(e); return e; });
  const m = mouth(0.08); m.position.set(0, -0.2, 0.02); face.add(m);
  face.add(cheeks(0.36, -0.1, 0.0, 0.08));
  const nubs = [-1, 1].map((s) => { const n = mesh(S(0.14), mat, 0.025); n.scale.set(0.9, 1.2, 0.8); n.position.set(s * 0.68, 0.85, 0.05); body.add(n); return n; });
  const sweat = new THREE.Group(); sweat.position.set(0.42, 1.42, 0.45); body.add(sweat); sweat.visible = false;
  const drop = mesh(S(0.07), toon(0x7cc7ff), 0.012); sweat.add(drop);
  const tip = mesh(new THREE.ConeGeometry(0.068, 0.12, 12), toon(0x7cc7ff), 0.012); tip.position.y = 0.08; sweat.add(tip);
  const c = { root, body, eyes, mouth: m, nubs, sweat, shadow };
  c.pose = (p = {}, t = 0) => {
    // Wavy hem that ripples over time.
    const a = geo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      if (y < 0.45) { const ang = Math.atan2(z, x); a.array[i * 3 + 1] = y + Math.sin(ang * 7 + t * 5) * 0.06 * (1 - y / 0.45); }
    }
    a.needsUpdate = true;
    const o = p.opacity ?? 1;
    mat.opacity = o; sheet.userData.outline.material.opacity = o;
    for (const e of eyes) e.children[0].material.opacity = o;
    shadow.material.opacity = o * (p.shadow ?? 1);
    body.position.y = 0.25 + (p.float ?? 0);
    body.rotation.z = p.tilt ?? 0;
    body.scale.setScalar(p.scale ?? 1);
    nubs[0].position.y = 0.85 + (p.waveL ?? 0); nubs[1].position.y = 0.85 + (p.waveR ?? 0);
    sweat.visible = !!p.sweat;
    applyFace(c, p);
  };
  c.pose();
  return c;
}

// ---- The tattoo artist -------------------------------------------------------
export function makeArtist() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  root.add(blobShadow(1.4, 0.8));
  const torso = mesh(new THREE.CapsuleGeometry(0.46, 0.5, 8, 20), toon(0x2b2724), 0.03); torso.position.y = 0.72; body.add(torso);
  const apronStrap = mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 30, Math.PI), toon(0xff5c39), 0); apronStrap.rotation.x = Math.PI / 2; apronStrap.position.y = 1.02; body.add(apronStrap);
  const head = new THREE.Group(); head.position.y = 1.62; body.add(head);
  const skull = mesh(S(0.5, 32, 24), toon(0xf1bf98), 0.03); head.add(skull);
  const beanie = mesh(new THREE.SphereGeometry(0.53, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(0x2fa37c), 0.03); beanie.position.y = 0.06; head.add(beanie);
  const rim = mesh(new THREE.TorusGeometry(0.5, 0.09, 10, 36), toon(0x268a68), 0.025); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; head.add(rim);
  const pom = mesh(S(0.13), toon(0x2fa37c), 0.02); pom.position.y = 0.62; head.add(pom);
  const face = new THREE.Group(); face.position.set(0, -0.06, 0.45); head.add(face);
  const eyes = [-1, 1].map((s) => { const e = eye(0.12); e.position.set(s * 0.17, 0.02, 0); face.add(e); return e; });
  const m = mouth(0.08); m.position.set(0, -0.19, 0.03); face.add(m);
  face.add(cheeks(0.3, -0.1, -0.02, 0.07));
  const arms = [-1, 1].map((s) => { const a = arm(0.42, 0.1, 0xf1bf98, s); a.position.set(s * 0.52, 1.02, 0); body.add(a); return a; });
  // Tattoo machine in the right hand.
  const machine = new THREE.Group(); arms[1].userData.hand.add(machine);
  const grip = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 12), toon(0x3b3f47), 0.015); grip.rotation.x = Math.PI / 2; grip.position.z = 0.12; machine.add(grip);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), flat(0xcccccc)); needle.rotation.x = Math.PI / 2; needle.position.z = 0.34; machine.add(needle);
  for (const s of [-1, 1]) { const f = mesh(S(0.15), toon(0x1c1917), 0.02); f.scale.set(1.1, 0.6, 1.4); f.position.set(s * 0.22, 0.09, 0.06); root.add(f); }
  const c = { root, body, head, eyes, mouth: m, arms, machine };
  c.pose = (p = {}) => {
    const s = p.squash ?? 0;
    body.scale.set(1 + s * 0.15, 1 - s * 0.18, 1 + s * 0.15);
    head.rotation.z = p.headTilt ?? 0;
    head.rotation.x = p.headNod ?? 0;
    head.position.y = 1.62 - (p.slump ?? 0) * 0.12;
    arms[0].rotation.z = -(p.armL ?? 0.15); arms[1].rotation.z = (p.armR ?? 0.15);
    arms[0].rotation.x = p.armLx ?? 0; arms[1].rotation.x = p.armRx ?? 0;
    applyFace(c, p);
  };
  c.pose();
  return c;
}

// ---- Gumdrop clients -----------------------------------------------------------
export const BLOB_COLORS = [0x8fc1ff, 0x9fd8a8, 0xd7a6ff, 0xffc56b, 0xff8fb1, 0x7fe0d4];
export function makeBlob(color = BLOB_COLORS[0], size = 1) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.scale.setScalar(size);
  root.add(blobShadow(1.1, 0.6));
  const b = mesh(S(0.5, 32, 24), toon(color), 0.03); b.scale.set(1, 0.9, 0.95); b.position.y = 0.48; body.add(b);
  const face = new THREE.Group(); face.position.set(0, 0.55, 0.44); body.add(face);
  const eyes = [-1, 1].map((s) => { const e = eye(0.1); e.position.set(s * 0.15, 0.04, 0); face.add(e); return e; });
  const m = mouth(0.065); m.position.set(0, -0.12, 0.03); face.add(m);
  face.add(cheeks(0.27, -0.06, -0.01, 0.06));
  const arms = [-1, 1].map((s) => { const a = arm(0.16, 0.06, color, s); a.position.set(s * 0.45, 0.55, 0); body.add(a); return a; });
  const c = { root, body, eyes, mouth: m, arms };
  c.pose = (p = {}) => {
    const s = p.squash ?? 0;
    body.scale.set(1 + s * 0.2, 1 - s * 0.22, 1 + s * 0.2);
    body.rotation.z = p.tilt ?? 0;
    arms[0].rotation.z = -(p.armL ?? 0.3); arms[1].rotation.z = (p.armR ?? 0.3);
    applyFace(c, p);
  };
  c.pose();
  return c;
}

// ---- Props ---------------------------------------------------------------------
export function makeCoin() {
  const g = new THREE.Group();
  const c = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 32), toon(0xffc53d, { emissive: 0x5a3a00 }), 0.02); c.rotation.x = Math.PI / 2; g.add(c);
  const tex = textTexture("$", { size: 128, font: "900 96px 'Bricolage Grotesque'", color: "#8a5a00", bg: null });
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); f.position.z = s * 0.037; if (s < 0) f.rotation.y = Math.PI; g.add(f); }
  return g;
}
export function textTexture(text, { size = 256, w = size, h = size, font = "800 60px 'Bricolage Grotesque'", color = "#1a0905", bg = "#ffffff", radius = 0, lines } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, radius); g.fill(); }
  const ls = lines || [text];
  // Shrink the font until the widest line fits.
  let px = parseInt(font.match(/(\d+)px/)[1]);
  g.font = font;
  while (px > 10 && Math.max(...ls.map((l) => g.measureText(l).width)) > w * 0.9) { px -= 2; g.font = font.replace(/\d+px/, px + "px"); }
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
  const lh = px * 1.05;
  ls.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (ls.length - 1) / 2) * lh));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// A handheld sign on a stick.
export function makeSign(lines, { w = 1.5, h = 0.8, bg = "#ffffff", color = "#1a0905" } = {}) {
  const g = new THREE.Group();
  const stick = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), toon(0x8a5a3a), 0.015); stick.position.y = -0.1; g.add(stick);
  const board = mesh(new RoundedBoxGeometry(w, h, 0.06, 3, 0.05), toon(0xffffff), 0.025); board.position.y = 0.55; g.add(board);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.9), new THREE.MeshBasicMaterial({
    map: textTexture("", { w: 512, h: Math.round(512 * h / w), font: "900 92px 'Bricolage Grotesque'", color, bg, radius: 18, lines }),
  }));
  face.position.set(0, 0.55, 0.035); g.add(face);
  return g;
}
export function makeClock() {
  const g = new THREE.Group();
  const rim = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 40), toon(0xff5c39), 0.03); rim.rotation.x = Math.PI / 2; g.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.52, 40), toon(0xfff8f0)); face.position.z = 0.075; g.add(face);
  for (let i = 0; i < 12; i++) { const tick = new THREE.Mesh(new THREE.BoxGeometry(0.03, i % 3 ? 0.06 : 0.11, 0.01), flat(0x2a1a12)); const a = i / 12 * Math.PI * 2; tick.position.set(Math.sin(a) * 0.43, Math.cos(a) * 0.43, 0.08); tick.rotation.z = -a; g.add(tick); }
  const hand = (len, wid) => { const p = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.02), flat(0x2a1a12)); b.position.y = len / 2 - 0.04; p.add(b); p.position.z = 0.09; g.add(p); return p; };
  const hr = hand(0.28, 0.05), mn = hand(0.4, 0.035);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), flat(0xff5c39)); dot.position.z = 0.1; g.add(dot);
  g.userData.setTime = (minutes) => { mn.rotation.z = -minutes / 60 * Math.PI * 2; hr.rotation.z = -minutes / 720 * Math.PI * 2; };
  return g;
}
export function makeChair() {
  const g = new THREE.Group(), leather = toon(0x6b2f25), chrome = toon(0xbdb6ad);
  const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), chrome, 0.02); post.position.y = 0.3; g.add(post);
  const foot = mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.08, 24), chrome, 0.02); foot.position.y = 0.04; g.add(foot);
  const seat = mesh(new RoundedBoxGeometry(1.5, 0.22, 0.7, 4, 0.08), leather, 0.03); seat.position.set(0, 0.62, 0); g.add(seat);
  const back = mesh(new RoundedBoxGeometry(0.22, 1.0, 0.7, 4, 0.08), leather, 0.03); back.position.set(-0.72, 1.05, 0); back.rotation.z = 0.35; g.add(back);
  const head = mesh(new RoundedBoxGeometry(0.2, 0.3, 0.45, 4, 0.08), leather, 0.03); head.position.set(-0.95, 1.62, 0); head.rotation.z = 0.35; g.add(head);
  return g;
}
export function makeTumbleweed() {
  const g = new THREE.Group();
  const geo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.35, 1));
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xa87a4a })); g.add(l);
  const l2 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.28, 1)), new THREE.LineBasicMaterial({ color: 0x7d5832 })); l2.rotation.set(0.5, 0.3, 0.2); g.add(l2);
  return g;
}
// Seeded random for deterministic particles.
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function makeConfetti(n = 90, seed = 7) {
  const g = new THREE.Group(), r = rng(seed), cols = [0xff5c39, 0xffc53d, 0x8fc1ff, 0x9fd8a8, 0xff8fb1, 0xffffff];
  const parts = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.16), flat(cols[i % cols.length], { side: THREE.DoubleSide }));
    parts.push({ m, vx: (r() - 0.5) * 5, vy: 3 + r() * 4, vz: (r() - 0.5) * 2, rx: r() * 10, ry: r() * 10 }); g.add(m);
  }
  g.userData.at = (t) => {
    for (const p of parts) {
      const tt = Math.max(0, t);
      p.m.visible = t > 0 && t < 3;
      p.m.position.set(p.vx * tt, p.vy * tt - 4.5 * tt * tt, p.vz * tt);
      p.m.rotation.set(p.rx * tt, p.ry * tt, 0);
    }
  };
  return g;
}
// White puff for poofs: a cluster of soft spheres that swell and fade.
export function makePoof(n = 14, seed = 3) {
  const g = new THREE.Group(), r = rng(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9a948c, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(S(0.3, 16, 12), mat); const a = (i / n) * Math.PI * 2 + r();
    parts.push({ m, dx: Math.cos(a) * (0.35 + r() * 0.45), dy: Math.sin(a) * (0.35 + r() * 0.35) + 0.2, dz: (r() - 0.5) * 0.4, s: 0.7 + r() * 0.8 }); g.add(m);
  }
  g.userData.at = (k) => {
    for (const p of parts) {
      p.m.visible = k > 0 && k < 1;
      const e = 1 - Math.pow(1 - k, 3);
      p.m.position.set(p.dx * e, p.dy * e + k * 0.3, p.dz);
      p.m.scale.setScalar(p.s * (0.5 + e * 0.9));
      p.m.material.opacity = Math.min(1, (1 - k) * 1.6);
    }
  };
  return g;
}
