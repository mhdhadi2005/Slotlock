// Renders an episode to a 1080x1920 MP4, one deterministic frame at a time.
//   node render.js <episode> [--preview t1,t2,...]
// Episodes live in episodes/<name>.html and expose window.DUR and window.render(t).
// Needs Playwright (preinstalled globally in Claude Code cloud sessions; run with
// NODE_PATH=$(npm root -g)) and `npm install` in this folder for three + ffmpeg.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const [scene, flag, times] = process.argv.slice(2);
const R = __dirname, PUB = path.join(R, "../../public"), ORIGIN = "http://reel.local", FPS = 30;
const FFMPEG = path.join(path.dirname(require.resolve("@ffmpeg-installer/linux-x64/package.json")), "ffmpeg");
const MARK = fs.readFileSync(`${PUB}/common.js`, "utf8").match(/const MARK_SVG = '(.*?)';/)[1];
const TYPES = { js: "text/javascript", css: "text/css", html: "text/html", woff2: "font/woff2" };
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const p = new URL(route.request().url()).pathname;
    let file;
    if (p === "/three.js") file = `${R}/node_modules/three/build/three.module.js`;
    else if (p.startsWith("/addons/")) file = `${R}/node_modules/three/examples/jsm/${p.slice(8)}`;
    else if (p === "/style.css" || p.startsWith("/fonts/")) file = PUB + p;
    else if (p.startsWith("/episodes/")) file = R + p;
    else file = R + p;
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "not found " + p });
    let body = fs.readFileSync(file);
    if (p.endsWith(".html")) body = body.toString().replace("</head>", `<script>window.MARK = ${JSON.stringify(MARK)};</script></head>`);
    route.fulfill({ contentType: TYPES[p.split(".").pop()] || "application/octet-stream", body });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.error("PAGE ERROR", e.message); process.exit(1); });
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.goto(`${ORIGIN}/episodes/${scene}.html`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
  const DUR = await page.evaluate(() => window.DUR);
  if (flag === "--preview") {
    for (const t of times.split(",").map(Number)) {
      await page.evaluate((t) => window.render(t), t);
      await page.screenshot({ path: `${R}/prev-${scene}-${t}.jpg`, type: "jpeg", quality: 75 });
    }
    console.log(`previews written: prev-${scene}-*.jpg`);
    await browser.close(); return;
  }
  const out = `${R}/frames/${scene}`;
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const n = Math.round(DUR * FPS), start = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    await page.screenshot({ path: `${out}/f${String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
    if (i % 150 === 0) console.log(`${scene}: frame ${i}/${n} ${((Date.now() - start) / 1000).toFixed(0)}s`);
  }
  await browser.close();
  fs.mkdirSync(`${R}/out`, { recursive: true });
  const mp4 = `${R}/out/${scene}.mp4`;
  execFileSync(FFMPEG, ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", `${out}/f%05d.jpg`,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-profile:v", "high", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", mp4]);
  fs.rmSync(out, { recursive: true, force: true });
  console.log(`${scene}: ${n} frames, ${DUR}s -> ${mp4}`);
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
