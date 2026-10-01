#!/usr/bin/env node
// No-WebGL guard: every live piece must degrade to a readable fallback when the
// browser has no WebGL (managed work laptops: "disabled by enterprise policy", a
// blocklisted GPU, hardware acceleration off), with no uncaught errors and no
// loader left spinning. Also checks WebGL1-only browsers (three r185 needs WebGL2,
// so they must fall back too) and, with --mode gl, that the normal 3D path still
// starts.
//
//   node tools/check-nogl.mjs                      # build first; serves dist/, modes nogl + webgl1
//   node tools/check-nogl.mjs --mode gl            # SwiftShader WebGL2: the 3D path, no fallbacks
//   node tools/check-nogl.mjs --mode nogl,webgl1,gl --shots /tmp/out
//   node tools/check-nogl.mjs --base https://<preview>.jarvising.pages.dev
//
// Playwright is not a dependency of this repo. The script looks for it in
// $PLAYWRIGHT_ROOT, then this repo, then ~/repos/claude-design (the VPS), and if
// none has it, prints a notice and exits 0 (skipped), so it never blocks a machine
// without a browser. CI installs it into a scratch dir and sets PLAYWRIGHT_ROOT.
//
// Locally it serves dist/ itself, with the Content-Security-Policy from
// dist/_headers on every response, so a CSP break in a fallback shows up here too.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const MODES = arg("--mode", "nogl,webgl1").split(",");
const SHOTS = arg("--shots", "");
let BASE = arg("--base", "");

// ── find Playwright, or skip ────────────────────────────────────────────────
let chromium = null;
for (const root of [process.env.PLAYWRIGHT_ROOT, ROOT, path.join(process.env.HOME ?? "", "repos/claude-design")]) {
  if (!root) continue;
  try { ({ chromium } = createRequire(path.join(root, "package.json"))("playwright")); break; } catch { /* next */ }
}
if (!chromium) {
  console.log("check-nogl: SKIPPED, Playwright is not installed here (set PLAYWRIGHT_ROOT to a dir that has it). Run it locally before shipping an entry.");
  process.exit(0);
}

// ── serve dist/ (unless --base) ─────────────────────────────────────────────
let server = null;
if (!BASE) {
  if (!fs.existsSync(path.join(DIST, "index.html"))) { console.error("check-nogl: no dist/, run `bun run build` first"); process.exit(1); }
  const headers = fs.existsSync(path.join(DIST, "_headers")) ? fs.readFileSync(path.join(DIST, "_headers"), "utf8") : "";
  const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1]?.trim();
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".glb": "model/gltf-binary",
    ".txt": "text/plain", ".xml": "application/xml", ".ico": "image/x-icon" };
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname.startsWith("/api/")) { res.writeHead(204).end(); return; } // first-party analytics: Pages Functions, not here
    let f = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (!f.startsWith(DIST)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
    const h = { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" };
    if (csp) h["content-security-policy"] = csp;
    res.writeHead(200, h);
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
}
BASE = BASE.replace(/\/$/, "");

// ── what each piece must show ───────────────────────────────────────────────
// fallback: visible when 3D cannot run; loader: must be gone (or never shown);
// ready: visible when 3D runs (mode gl).
const PIECES = [
  { slug: "enigma", fallback: ".en-fallback", loader: ".en-loading", ready: ".en-readout", text: /needs WebGL/i },
  { slug: "cortex", fallback: ".cx-nogl", loader: null, ready: ".cx-stage canvas", text: /3D is off in this browser/i, readyText: /Mode\s*3D/ },
  { slug: "rig", fallback: ".rg-fallback", loader: ".rg-loading", ready: ".rg-masthead", text: /needs WebGL/i },
  { slug: "submarine", fallback: "#still", loader: "#loader:not(.gone)", ready: "body[data-ready='1']", text: /switched off in this browser/i },
];
const ARGS = {
  nogl: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"],
  webgl1: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-webgl2"],
  gl: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
};
// console noise that is the browser reporting the missing GPU, not our code failing
// (three.js's own errors are never benign: they mean a renderer was built anyway)
const BENIGN = /GPU stall|GroupMarkerNotSet|Automatic fallback to software|swiftshader/i;

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m.split("\n")[0]}`); };
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

for (const mode of MODES) {
  if (!ARGS[mode]) { console.error(`unknown mode ${mode}`); process.exit(1); }
  const fallsBack = mode !== "gl";
  console.log(`\n== mode ${mode} (${fallsBack ? "expect fallbacks" : "expect the 3D path"}) against ${BASE}`);
  const browser = await chromium.launch({ args: ARGS[mode] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  // headless Chromium hangs every screenshot after a cross-document View Transition
  await ctx.route("**/motion/transitions.css", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  for (const p of PIECES) {
    // the live piece
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(`pageerror: ${String(e.message ?? e).slice(0, 160)}`));
    page.on("console", (m) => { if (m.type() === "error" && !BENIGN.test(m.text())) errs.push(`console: ${m.text().slice(0, 160)}`); });
    await page.goto(`${BASE}/projects/${p.slug}/live/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const level = await page.evaluate(() => { const c = document.createElement("canvas"); return c.getContext("webgl2") ? "webgl2" : c.getContext("webgl") ? "webgl1" : "none"; });
    const want = fallsBack ? p.fallback : p.ready;
    let shown = true;
    try { await page.waitForSelector(want, { state: "visible", timeout: fallsBack ? 45000 : 120000 }); } catch { shown = false; }
    await page.waitForTimeout(fallsBack ? 2500 : 4000); // let anything that would throw late throw
    const bad = [];
    if (!shown) bad.push(`${want} never became visible`);
    if (fallsBack) {
      const txt = await page.evaluate(() => document.body.innerText);
      if (!p.text.test(txt)) bad.push(`fallback text ${p.text} not on the page`);
      if (p.loader && await page.locator(p.loader).first().isVisible().catch(() => false)) bad.push(`loader ${p.loader} still showing`);
    } else {
      if (await page.locator(p.fallback).first().isVisible().catch(() => false)) bad.push(`fallback ${p.fallback} showing with WebGL on`);
      if (p.readyText && !p.readyText.test(await page.evaluate(() => document.body.innerText))) bad.push(`expected ${p.readyText} with WebGL on`);
    }
    bad.push(...errs);
    if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${mode}-${p.slug}.png`), timeout: fallsBack ? 20000 : 90000, fullPage: fallsBack }); } catch { /* best effort */ } }
    console.log(`  ${bad.length ? "✗" : "✓"} ${p.slug} live (browser webgl: ${level})`);
    for (const b of bad) fail(`${p.slug} live: ${b}`);
    await page.close();

    // the entry page: the "Open …" door carries the note only when 3D cannot run
    const entry = await ctx.newPage();
    const eerrs = [];
    entry.on("pageerror", (e) => eerrs.push(`pageerror: ${String(e.message ?? e).slice(0, 160)}`));
    await entry.goto(`${BASE}/projects/${p.slug}/`, { waitUntil: "load", timeout: 60000 });
    await entry.waitForTimeout(800);
    const note = await entry.locator(".door-nogl").count();
    const ebad = [...eerrs];
    if (fallsBack && note !== 1) ebad.push(`expected one .door-nogl note, found ${note}`);
    if (!fallsBack && note !== 0) ebad.push(`.door-nogl note shown with WebGL on`);
    if (SHOTS && fallsBack) { try { await entry.evaluate(() => document.querySelector(".door-nogl")?.scrollIntoView({ block: "end", behavior: "instant" })); await entry.screenshot({ path: path.join(SHOTS, `${mode}-${p.slug}-entry.png`), timeout: 20000 }); } catch { /* best effort */ } }
    console.log(`  ${ebad.length ? "✗" : "✓"} ${p.slug} entry page (door note: ${note})`);
    for (const b of ebad) fail(`${p.slug} entry: ${b}`);
    await entry.close();
  }
  await browser.close();
}

server?.close();
console.log(failures ? `\ncheck-nogl: ${failures} failure(s)` : "\ncheck-nogl: all pieces passed");
process.exit(failures ? 1 : 0);
