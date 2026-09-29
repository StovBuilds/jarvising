#!/usr/bin/env node
// Test rig: measure the entries and write the numbers the home page shows.
//   node tools/measure-rig.mjs                 build dist/, measure every entry, write rig.json + frames + home HTML
//   node tools/measure-rig.mjs --entry 003     measure only that entry (001, 002, 003 or 004); the others keep
//                                              their numbers in rig.json
//   node tools/measure-rig.mjs --html          only re-render the home-page strips from rig.json
//
// Entries 001 and 003 are scroll pieces, measured at pinned ?p= beats (measureEntry).
// Entry 002 (Cortex) is a map with named states, not a scroll; it has its own method,
// described at measureViews() below. Its home strip is drawn by viewsStripHtml().
//
// Everything on the 001/003 strips comes from here and nowhere else:
//   payload   gzip -9 of every JS file the live page loads (its module + modulepreloads),
//             and the byte size of each GLB, all read from a fresh dist/
//   render    renderer.info (draw calls, triangles, textures, programs) of the last frame
//             at pinned ?p= beats, read through each piece's ?probe=1 hook (window.__enigmaProbe,
//             window.__rigProbe)
//   timing    time to first rendered frame (performance.now() at the end of the first
//             renderer.render), median of cold loads. Headless Chromium on SwiftShader,
//             i.e. SOFTWARE GL: a lab number for comparing builds, not a device frame rate
//   smoke     001: a cipher typed into the simulator at p=1 (same check as render-enigma.mjs);
//             003: the atlas search, driven through its real input, must list the memory modules
//   ci        conclusion + time of the latest ci.yml run on main (gh), taken at measure time
//   frames    small WebP screenshots at the same beats -> public/projects/<slug>/rig/
//
// Writes public/projects/rig.json, then rewrites the <!-- rig:<nnn> --> and
// <!-- rig:idle --> blocks in index.html so the page reads fully without JS.
// Entry 001's numbers sit at the top level of rig.json (measured_at, commit,
// method); later entries carry their own, since they can be measured separately.
// A strip is drawn from the data's shape: render.beats (scroll) or render.views (states).
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = path.join(ROOT, "public/projects/rig.json");
const W = 1440, H = 900;
const COLD_RUNS = 5;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };

// Each entry: its live page, where its GLBs are named, its probe, the pinned beats
// (page progress p; `qs` adds to the query, e.g. the atlas, which ?p= cannot pin)
// and its smoke test. `kind: "views"` swaps in measureViews(); `dirty` narrows the
// paths whose uncommitted changes mark the measurement dirty.
const ENTRIES = {
  "001": {
    slug: "enigma",
    live: "/projects/enigma/live/",
    glbFrom: ["src/enigma/Enigma.tsx"],
    probe: "__enigmaProbe",
    qs: "",
    beats: [
      { p: 0.04, name: "The machine" },
      { p: 0.31, name: "The assembly" },
      { p: 0.45, name: "The rotor" },
      { p: 0.6, name: "The path" },
      { p: 0.83, name: "The bombe" },
      { p: 0.95, name: "Your turn" },
    ],
    smoke: "cipher",
  },
  "002": {
    slug: "cortex",
    kind: "views",
    live: "/projects/cortex/live/",
    probe: "__cortexProbe",
    dirty: ["src/cortex", "projects/cortex"],
    views: [
      { tag: "table", name: "The table", qs: "", act: null },
      { tag: "search", name: "Search", qs: "", act: "search" },
      { tag: "live", name: "Live stream", qs: "", act: "live" },
      { tag: "globe", name: "The globe", qs: "view=globe", act: null },
    ],
    search: { query: "coyote", expect: "coyote time" },
  },
  "003": {
    slug: "rig",
    live: "/projects/rig/live/",
    glbFrom: ["src/rig/library.ts"],
    probe: "__rigProbe",
    // what a desktop GPU gets; the page's own guess on SwiftShader is LOW (no shadows, no bloom)
    qs: "tier=HIGH",
    beats: [
      { p: 0.1, name: "Inside the CPU" },
      { p: 0.21, name: "The package" },
      { p: 0.55, name: "Inside the GPU" },
      { p: 0.72, name: "Move the heat" },
      { p: 1, name: "The atlas", qs: "atlas=1&explode=0.75&flat=1" },
    ],
    smoke: "search",
    parts: "src/rig/ids.ts",
  },
  "004": {
    slug: "submarine",
    kind: "states",
    live: "/projects/submarine/live/",
    probe: "__subProbe",
    dirty: ["src/submarine", "projects/submarine"],
    // pinned, frozen states (the piece has no scroll): ?depth=<ft>&view=open&ping=<0..1 of the round trip>
    states: [
      { tag: "periscope", name: "Periscope depth", qs: "depth=40" },
      { tag: "ping", name: "Ping at the hull", qs: "depth=110&ping=0.52" },
      { tag: "below", name: "Below the layer", qs: "depth=280&ping=1.05" },
      { tag: "open", name: "Opened up", qs: "depth=280&view=open&ping=0.3" },
    ],
    // smoke: the same ping, echo home, above and below the layer
    echo: { above: "depth=110&ping=1.05", below: "depth=280&ping=1.05" },
  },
};
const ONLY = arg("--entry", null);

const sh = (cmd, args, opts = {}) => String(execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts }) ?? "").trim();

async function measure() {
  if (ONLY && !ENTRIES[ONLY]) throw new Error(`no entry ${ONLY} in ENTRIES (have ${Object.keys(ENTRIES).join(", ")})`);
  fs.rmSync(path.join(ROOT, "dist"), { recursive: true, force: true });
  sh("bun", ["run", "build"], { stdio: ["ignore", "ignore", "inherit"] });
  const prev = fs.existsSync(JSON_OUT) ? JSON.parse(fs.readFileSync(JSON_OUT, "utf8")) : null;
  const ids = ONLY ? [ONLY] : Object.keys(ENTRIES);
  const results = {};
  for (const id of ids) {
    const E = ENTRIES[id];
    if (!E) throw new Error(`no entry ${id} in ENTRIES`);
    const r = E.kind === "views" ? await measureViews(id, E) : E.kind === "states" ? await measureStates(id, E) : await measureEntry(id, E);
    const stamp = {
      measured_at: new Date().toISOString(),
      commit: sh("git", ["rev-parse", "--short", "HEAD"]),
      dirty: sh("git", ["status", "--porcelain", "--", ...(E.dirty ?? ["src", "projects", "public/models"])]) !== "",
    };
    results[id] = { stamp, meta: r.meta, entry: r.entry };
  }
  const first = Object.values(results)[0];
  const rig = prev && ONLY ? prev : { schema: 1, ...first.stamp, method: first.meta, entries: { "001": null, "002": null, "003": null, "004": null } };
  for (const [id, { stamp, meta, entry }] of Object.entries(results)) {
    if (id === "001") { Object.assign(rig, stamp, { method: meta }); rig.entries[id] = entry; }
    else rig.entries[id] = { slug: entry.slug, ...stamp, method: meta, ...entry };
  }
  fs.writeFileSync(JSON_OUT, JSON.stringify(rig, null, 2) + "\n");
  console.log("wrote", path.relative(ROOT, JSON_OUT));
  return rig;
}

// ── headless: preview the built dist, SwiftShader Chromium ──
async function bench(portBase = 4500) {
  const PW_ROOT = process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design";
  const { chromium } = createRequire(path.join(PW_ROOT, "package.json"))("playwright");
  const port = portBase + Math.floor(Math.random() * 100);
  const base = `http://127.0.0.1:${port}`;
  const server = spawn("bun", ["x", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("vite preview did not start")), 30000);
    server.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } });
  });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const close = async () => { await browser.close(); server.kill(); };
  return { base, browser, close };
}

// ── CI on main, at measure time ──
function ciOnMain() {
  try {
    const [r] = JSON.parse(sh("gh", ["run", "list", "--repo", "StovBuilds/jarvising", "--workflow", "ci.yml", "--branch", "main", "--limit", "1", "--json", "conclusion,createdAt,headSha,url"]));
    return r ? { conclusion: r.conclusion, at: r.createdAt, sha: r.headSha.slice(0, 7), url: r.url } : null;
  } catch (e) { console.error("gh failed; CI left unmeasured:", e.message); return null; }
}

// 480×300 WebP: shown at ~240 px wide, so 2× for dense screens
const toWebp = (png, webp) => sh("python3", ["-c", `from PIL import Image; im=Image.open(${JSON.stringify(png)}).convert("RGB").resize((480,300), Image.LANCZOS); im.save(${JSON.stringify(webp)}, "WEBP", quality=62, method=6)`]);

const METHOD_NOTE = "Headless software rendering. Timing is for comparing builds on the same bench, not a real-device frame rate.";

async function measureEntry(id, E) {
  const FRAMES = path.join(ROOT, `public/projects/${E.slug}/rig`);
  const BEATS = E.beats;
  // ── payload, from the fresh build ──
  const liveHtml = fs.readFileSync(path.join(ROOT, `dist${E.live}index.html`), "utf8");
  const jsRefs = [...new Set([
    // the piece's own bundle: its module + modulepreloads (not the site-wide /analytics.js counter)
    ...[...liveHtml.matchAll(/<script[^>]+src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]),
    ...[...liveHtml.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)].map((m) => m[1]),
  ])];
  const js = jsRefs.map((ref) => {
    const buf = fs.readFileSync(path.join(ROOT, "dist", ref));
    return { file: ref, bytes: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  });
  const glbNames = [...new Set(E.glbFrom.flatMap((f) => [...fs.readFileSync(path.join(ROOT, f), "utf8").matchAll(/"\/models\/([a-z0-9-]+\.glb)"/g)].map((m) => m[1])))].sort();
  const glb = glbNames.map((n) => ({ file: `/models/${n}`, bytes: fs.statSync(path.join(ROOT, "dist/models", n)).size }));

  const { base, browser, close } = await bench();
  const chromiumVersion = browser.version();
  const probeOf = (page) => page.evaluate((k) => window[k] ?? null, E.probe);
  const open = async (qs) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "dark" }); // fresh context = cold HTTP cache
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    // headless Chromium hangs screenshots after a cross-document View Transition
    await page.route("**/motion/transitions.css", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await page.goto(`${base}${E.live}?${[qs, E.qs].filter(Boolean).join("&")}`, { waitUntil: "load" });
    await page.waitForFunction((k) => (window[k]?.frames ?? 0) >= 1, E.probe, { timeout: 180000, polling: 100 });
    return { ctx, page };
  };
  // wait until the scene stops growing (GLBs land after first paint; the bombe on demand)
  const settle = async (page) => {
    await page.waitForLoadState("networkidle");
    let prev = -1, same = 0;
    for (let i = 0; i < 40 && same < 3; i++) {
      await page.waitForTimeout(1500);
      const pr = await probeOf(page);
      same = pr && pr.triangles === prev ? same + 1 : 0;
      prev = pr?.triangles ?? -1;
    }
    return probeOf(page);
  };

  let beats = [], cold = [], cipher = null, search = null;
  try {
    // time to first frame: the natural top of the page, cold, median of N
    for (let i = 0; i < COLD_RUNS; i++) {
      const { ctx, page } = await open("probe=1");
      cold.push(Math.round((await probeOf(page)).firstFrameMs));
      await ctx.close();
    }
    fs.rmSync(FRAMES, { recursive: true, force: true });
    fs.mkdirSync(FRAMES, { recursive: true });
    for (const b of BEATS) {
      const { ctx, page } = await open(b.qs ? `${b.qs}&probe=1` : `p=${b.p}&probe=1`);
      await page.mouse.move(W / 2, H / 2);
      const pr = await settle(page);
      const tag = `p${String(b.p).replace(".", "_")}`;
      const png = path.join(FRAMES, `${tag}.png`);
      await page.screenshot({ path: png, timeout: 180000 });
      // 480×300 WebP: shown at ~240 px wide, so 2× for dense screens
      toWebp(png, path.join(FRAMES, `${tag}.webp`));
      fs.rmSync(png);
      beats.push({ p: b.p, name: b.name, ...(b.qs ? { qs: b.qs } : {}), frame: `/projects/${E.slug}/rig/${tag}.webp`, calls: pr.calls, triangles: Math.round(pr.triangles), textures: pr.textures, geometries: pr.geometries, programs: pr.programs });
      console.log("beat", b.p, JSON.stringify(pr));
      await ctx.close();
    }
    // cipher smoke: type HELLO into the simulator
    if (E.smoke === "cipher") {
      const { ctx, page } = await open("p=1&probe=1");
      await settle(page);
      cipher = await page.evaluate(async () => {
        for (const ch of "HELLO") window.__enigma.press(ch);
        await new Promise((r) => setTimeout(r, 3000));
        return { typed: "HELLO", out: document.querySelector(".en-tape-out")?.textContent ?? "" };
      });
      const ok = cipher.out.length === 5 && [...cipher.out].every((c, i) => /[A-Z]/.test(c) && c !== "HELLO"[i]);
      cipher.pass = ok;
      console.log("cipher", JSON.stringify(cipher));
      await ctx.close();
    }
    // atlas smoke: type into the real search box, read the real result list
    if (E.smoke === "search") {
      const { ctx, page } = await open("atlas=1&flat=1&probe=1");
      await page.waitForSelector(".rg-search input", { timeout: 180000 });
      await page.fill(".rg-search input", "memory");
      await page.waitForTimeout(500);
      const names = await page.$$eval(".rg-results li button > span:nth-child(2)", (els) => els.map((e) => e.textContent ?? ""));
      search = { query: "memory", results: names.length, first: names.slice(0, 3), pass: names.some((n) => /DIMM/i.test(n)) };
      console.log("search", JSON.stringify(search));
      await ctx.close();
    }
  } finally {
    await close();
  }
  const ci = ciOnMain();

  const sorted = [...cold].sort((a, b) => a - b);
  const parts = E.parts ? (fs.readFileSync(path.join(ROOT, E.parts), "utf8").match(/^\s+"[a-z0-9-]+",$/gm) ?? []).length : null;
  const meta = {
    tool: "tools/measure-rig.mjs",
    browser: `Chromium ${chromiumVersion} headless, SwiftShader (software GL)`,
    viewport: `${W}×${H} @1x, dark scheme`,
    ...(E.qs ? { query: `?${E.qs} on every load` } : {}),
    note: METHOD_NOTE,
  };
  return {
    meta,
    entry: {
        slug: E.slug,
        payload: {
          js_gzip: js.reduce((s, f) => s + f.gzip, 0),
          js_bytes: js.reduce((s, f) => s + f.bytes, 0),
          js,
          glb_bytes: glb.reduce((s, f) => s + f.bytes, 0),
          glb,
          compression: "gzip -9 (node zlib); GLBs are raw file size",
        },
        render: { beats, source: `renderer.info after the last frame, at ?p=<beat>&probe=1 (or the beat's own query), once the scene stopped growing${E.probe === "__rigProbe" ? "; counted across every post-processing pass" : ""}` },
        first_frame_ms: { median: sorted[Math.floor(sorted.length / 2)], runs: cold, source: "performance.now() after the first renderer.render, cold context, top of page" },
        ...(cipher ? { cipher } : {}),
        ...(search ? { search } : {}),
        ...(parts != null ? { parts: { count: parts, source: E.parts } } : {}),
        ci,
    },
  };
}

// ── entry 002: Cortex ────────────────────────────────────────────────────────────
//   payload   gzip -9 of every JS file the live page actually FETCHED (network log),
//             read from a fresh dist/: once in 3D at 1440×900, once at 390×844 where the
//             library opens in its flat lite mode (react-force-graph-2d, no three.js).
//             The map loads its renderer lazily, so the HTML's modulepreloads undercount.
//   render    renderer.info summed over one whole frame (scene + bloom passes), read
//             through the ?probe=1 hook in src/cortex/probe.ts, once the scene settles,
//             in the named states of E.views
//   timing    first frame = performance.now() at the page's first WebGL draw call,
//             median of cold loads (fresh context, SwiftShader: a bench, not a device)
//   search    smoke: press "/", type a query, Enter; the inspector must open on the node
//             whose label matches, and the HUD must count the demo's nodes/links/clusters
//   ci, frames  as for 001; frames -> public/projects/cortex/rig/
async function measureViews(id, E) {
  const OUT = path.join(ROOT, `public/projects/${E.slug}/rig`);
  const { base, browser, close } = await bench(4600);
  const chromiumVersion = browser.version();
  const probeOf = (page) => page.evaluate((k) => window[k] ?? null, E.probe);
  const open = async (qs, vp = { width: W, height: H }, waitProbe = true) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: "dark" });
    // headless Chromium hangs screenshots after a cross-document View Transition
    await ctx.route("**/motion/transitions.css", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    const page = await ctx.newPage();
    const js = new Set();
    page.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/assets/") && u.pathname.endsWith(".js")) js.add(u.pathname); });
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    await page.goto(`${base}${E.live}?intro=0&probe=1${qs ? "&" + qs : ""}`, { waitUntil: "load" });
    if (waitProbe) await page.waitForFunction((k) => window[k]?.firstFrameMs != null, E.probe, { timeout: 180000, polling: 100 });
    return { ctx, page, js };
  };
  // render-on-demand: the loop sleeps when idle, so nudge the pointer (over empty sky) while
  // waiting, until the frame's triangle count stops changing
  const settle = async (page) => {
    let prev = -1, same = 0;
    for (let i = 0; i < 40 && same < 3; i++) {
      await page.mouse.move(W / 2 + (i % 2) * 4, 130);
      await page.waitForTimeout(1500);
      const pr = await probeOf(page);
      same = pr && pr.frames > 0 && pr.triangles === prev ? same + 1 : 0;
      prev = pr?.triangles ?? -1;
    }
    return probeOf(page);
  };
  const gz = (paths) => [...paths].sort().map((ref) => {
    const buf = fs.readFileSync(path.join(ROOT, "dist", ref));
    return { file: ref, bytes: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  });

  let views = [], cold = [], js3d = [], jsLite = [], search = null, counts = null;
  try {
    for (let i = 0; i < COLD_RUNS; i++) {
      const { ctx, page, js } = await open("");
      cold.push(Math.round((await probeOf(page)).firstFrameMs));
      if (i === 0) {
        await settle(page);
        await page.waitForLoadState("networkidle");
        js3d = gz(js);
        counts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".cm-stats .cm-row")].map((r) => [r.children[0].textContent.trim().toLowerCase(), r.children[1].textContent.trim()])));
      }
      await ctx.close();
    }
    {
      const { ctx, page, js } = await open("", { width: 390, height: 844 }, false);
      await page.waitForSelector("canvas", { timeout: 180000 });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000);
      jsLite = gz(js);
      await ctx.close();
    }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    for (const v of E.views) {
      const { ctx, page } = await open(v.qs);
      await settle(page);
      if (v.act === "search") {
        await page.keyboard.press("/");
        await page.waitForSelector(".cm-search input", { timeout: 20000 });
        await page.keyboard.type(E.search.query, { delay: 80 });
        await page.waitForTimeout(600);
        await page.keyboard.press("Enter");
        await page.waitForSelector(".cm-pane-head .title", { timeout: 20000 });
        await page.waitForTimeout(4000); // the camera's two-leg swoop
        const title = (await page.textContent(".cm-pane-head .title"))?.trim() ?? "";
        search = { query: E.search.query, found: title, pass: title === E.search.expect };
        console.log("search", JSON.stringify(search));
      }
      if (v.act === "live") {
        await page.keyboard.press("l");
        for (let t = 0; t < 12; t++) { await page.mouse.move(W / 2 + (t % 2) * 4, 130); await page.waitForTimeout(1000); }
      }
      const pr = v.act ? await probeOf(page) : await settle(page);
      const png = path.join(OUT, `${v.tag}.png`);
      await page.screenshot({ path: png, timeout: 180000 });
      toWebp(png, path.join(OUT, `${v.tag}.webp`));
      fs.rmSync(png);
      views.push({ tag: v.tag, name: v.name, frame: `/projects/${E.slug}/rig/${v.tag}.webp`, calls: pr.calls, triangles: Math.round(pr.triangles), textures: pr.textures, geometries: pr.geometries, programs: pr.programs });
      console.log("view", v.tag, JSON.stringify(pr));
      await ctx.close();
    }
  } finally {
    await close();
  }
  const ci = ciOnMain();

  const sorted = [...cold].sort((a, b) => a - b);
  const sum = (a, k) => a.reduce((t, f) => t + f[k], 0);
  return {
    meta: {
      tool: `tools/measure-rig.mjs --entry ${id}`,
      browser: `Chromium ${chromiumVersion} headless, SwiftShader (software GL)`,
      viewport: `${W}×${H} @1x, dark scheme`,
      note: METHOD_NOTE,
    },
    entry: {
      slug: E.slug,
      payload: {
        js_gzip: sum(js3d, "gzip"), js_bytes: sum(js3d, "bytes"), js: js3d,
        lite_js_gzip: sum(jsLite, "gzip"), lite_js: jsLite,
        compression: "gzip -9 (node zlib) of the JS files the page fetched; 3D at 1440×900, lite at 390×844",
      },
      data: counts,
      render: { views, source: "renderer.info summed over the latest whole frame (scene + bloom passes), via ?probe=1, once the scene stopped changing" },
      first_frame_ms: { median: sorted[Math.floor(sorted.length / 2)], runs: cold, source: "performance.now() at the first WebGL draw call, cold context, ?intro=0" },
      search,
      ci,
    },
  };
}

// ── entry 004: Below the Layer ────────────────────────────────────────────────────
//   payload   gzip -9 of the live page's module + modulepreloads (no assets: everything is
//             built in code), from a fresh dist/
//   render    renderer.info for the whole frame (scene + bloom + finishing passes), via
//             ?probe=1, in pinned, frozen states (E.states): the clock stands still, so
//             one frame is every frame; read after a few frames have drawn
//   timing    first frame = performance.now() after the first composer.render, median of
//             cold loads, unpinned (the page as a visitor opens it)
//   echo      smoke: the same ping, echo home (?ping=1.05), with the boat above the layer
//             (110 ft) and below it (280 ft); the page's own readout must say the echo
//             got weaker, and the round-trip time it prints must equal 2 × range ÷ 1,500 m/s
//   ci, frames  as for 001; frames -> public/projects/submarine/rig/
async function measureStates(id, E) {
  const OUT = path.join(ROOT, `public/projects/${E.slug}/rig`);
  const liveHtml = fs.readFileSync(path.join(ROOT, `dist${E.live}index.html`), "utf8");
  const refs = [...new Set([
    ...[...liveHtml.matchAll(/<script[^>]+src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]),
    ...[...liveHtml.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)].map((m) => m[1]),
  ])];
  const js = refs.map((ref) => {
    const buf = fs.readFileSync(path.join(ROOT, "dist", ref));
    return { file: ref, bytes: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  });
  const { base, browser, close } = await bench(4700);
  const chromiumVersion = browser.version();
  const probeOf = (page) => page.evaluate((k) => window[k] ?? null, E.probe);
  const open = async (qs) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "dark" });
    await ctx.route("**/motion/transitions.css", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    await page.goto(`${base}${E.live}?probe=1${qs ? "&" + qs : ""}`, { waitUntil: "load" });
    await page.waitForFunction((k) => (window[k]?.frames ?? 0) >= 1, E.probe, { timeout: 180000, polling: 100 });
    return { ctx, page };
  };
  const settle = async (page) => {
    await page.waitForFunction((k) => (window[k]?.frames ?? 0) >= 6, E.probe, { timeout: 180000, polling: 250 });
    await page.waitForTimeout(1500); // the loader's fade
    return probeOf(page);
  };
  let states = [], cold = [], echo = null;
  try {
    for (let i = 0; i < COLD_RUNS; i++) {
      const { ctx, page } = await open("");
      cold.push(Math.round((await probeOf(page)).firstFrameMs));
      await ctx.close();
    }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    for (const v of E.states) {
      const { ctx, page } = await open(v.qs);
      const pr = await settle(page);
      const png = path.join(OUT, `${v.tag}.png`);
      await page.screenshot({ path: png, timeout: 180000 });
      toWebp(png, path.join(OUT, `${v.tag}.webp`));
      fs.rmSync(png);
      states.push({ tag: v.tag, name: v.name, qs: v.qs, frame: `/projects/${E.slug}/rig/${v.tag}.webp`, calls: pr.calls, triangles: Math.round(pr.triangles), textures: pr.textures, geometries: pr.geometries, programs: pr.programs });
      console.log("state", v.tag, JSON.stringify(pr));
      await ctx.close();
    }
    const read = async (qs) => {
      const { ctx, page } = await open(qs);
      const pr = await settle(page);
      const r = { qs, depth_ft: Math.round(pr.depthFt), strength: pr.echo?.s ?? null, word: pr.echo?.word ?? null, range_m: pr.echo ? Math.round(pr.echo.R) : null, status: pr.echo?.status ?? null };
      await ctx.close();
      return r;
    };
    const above = await read(E.echo.above), below = await read(E.echo.below);
    const t = Number(above.status?.match(/echo in ([\d.]+) s/)?.[1]);
    const expectT = above.range_m != null ? (2 * above.range_m) / 1500 : NaN;
    echo = {
      above, below,
      round_trip: { shown_s: t, expected_s: +expectT.toFixed(3), pass: Math.abs(t - expectT) < 0.006 },
      pass: above.strength != null && below.strength != null && below.strength < above.strength && above.word === "Strong" && below.word === "Faint" && Math.abs(t - expectT) < 0.006,
    };
    console.log("echo", JSON.stringify(echo));
  } finally {
    await close();
  }
  const ci = ciOnMain();
  const sorted = [...cold].sort((a, b) => a - b);
  return {
    meta: {
      tool: `tools/measure-rig.mjs --entry ${id}`,
      browser: `Chromium ${chromiumVersion} headless, SwiftShader (software GL)`,
      viewport: `${W}×${H} @1x, dark scheme`,
      note: METHOD_NOTE,
    },
    entry: {
      slug: E.slug,
      payload: { js_gzip: js.reduce((a, f) => a + f.gzip, 0), js_bytes: js.reduce((a, f) => a + f.bytes, 0), js, compression: "gzip -9 (node zlib) of the module and its modulepreloads; no assets, the scene is built in code" },
      render: { states, source: "renderer.info summed over one whole frame (scene + bloom + finishing passes), via ?probe=1, in pinned frozen states" },
      first_frame_ms: { median: sorted[Math.floor(sorted.length / 2)], runs: cold, source: "performance.now() after the first composer.render, cold context, unpinned" },
      echo,
      ci,
    },
  };
}

// entry 004's strip: pinned states, and the echo smoke test
function statesStripHtml(e) {
  const views = e.render.states;
  const maxTri = Math.max(...views.map((b) => b.triangles));
  const maxCalls = Math.max(...views.map((b) => b.calls));
  const top = Math.ceil(maxTri / 50000) * 50000;
  const X = (i) => 3 + (i / (views.length - 1)) * 94;
  const Y = (t) => 100 - (t / top) * 100;
  const pts = views.map((b, i) => `${X(i).toFixed(2)},${Y(b.triangles).toFixed(2)}`).join(" ");
  const fmtK = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const ci = e.ci, ec = e.echo;
  const frames = views.map((b, i) => `<img src="${b.frame}" width="480" height="300" data-tag="${esc(b.tag)}" data-name="${esc(b.name)}" alt="Headless render of the live piece, pinned: ${esc(b.name.toLowerCase())}" loading="lazy" decoding="async"${i === 0 ? ' class="on"' : ""}>`).join("\n          ");
  const ticks = views.map((b, i) => `<li><button type="button" data-i="${i}" aria-label="Show frame: ${esc(b.name.toLowerCase())}"${i === 0 ? ' aria-current="true"' : ""}></button></li>`).join("");
  const dots = views.map((b, i) => `<i${i === 0 ? ' class="on"' : ""} style="left:${X(i).toFixed(2)}%;top:${Y(b.triangles).toFixed(2)}%" data-i="${i}" title="${esc(b.name)}: ${b.triangles.toLocaleString("en-GB")} triangles, ${b.calls} draw calls"></i>`).join("");
  const axis = views.map((b, i) => `<li style="left:${X(i).toFixed(2)}%">${esc(b.tag)}</li>`).join("");
  return `<div class="rig" data-rig>
      <div class="rig-head"><span class="rig-title"><span class="rig-led" aria-hidden="true"></span>Test rig</span><span class="rig-when">measured <time datetime="${e.measured_at}">${day(e.measured_at)}</time> · <a href="/projects/rig.json">rig.json</a></span></div>
      <div class="rig-bench">
        <figure class="rig-film" data-film>
          <div class="rig-frames" tabindex="0" aria-label="QA frames in ${views.length} pinned states; hover or focus to flick through">
          ${frames}
          </div>
          <figcaption><span class="rig-p" data-cap-p>${esc(views[0].tag)}</span><span data-cap-name>${esc(views[0].name)}</span><span class="rig-of" data-cap-of>1/${views.length}</span></figcaption>
          <ol class="rig-ticks" aria-label="Frames">${ticks}</ol>
        </figure>
        <div class="rig-trace">
          <div class="rig-label"><span>Triangles per frame</span><span class="rig-scale">0–${fmtK(top)}</span></div>
          <div class="rig-plot" aria-hidden="true">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="rig-grid" d="M0 25H100M0 50H100M0 75H100"/><polyline class="rig-line" points="${pts}"/></svg>
            <span class="rig-dots">${dots}</span>
            <span class="rig-sweep"></span>
          </div>
          <ol class="rig-axis" aria-hidden="true">${axis}</ol>
          <p class="rig-sr">Triangles per frame, ${views.map((b) => `${b.name.toLowerCase()}: ${b.triangles.toLocaleString("en-GB")}`).join("; ")}.</p>
        </div>
      </div>
      <dl class="rig-ch">
        <div><dt>Payload</dt><dd class="rig-v">${num(+kB(e.payload.js_gzip).toFixed(1), 1)}<u>kB</u></dd><dd class="rig-fn">JS, gzip · no assets, built in code</dd></div>
        <div><dt>Draw calls</dt><dd class="rig-v">${num(maxCalls)}<u>peak</u></dd><dd class="rig-fn">max ${fmtK(maxTri)} tris · bloom included</dd></div>
        <div><dt>First frame</dt><dd class="rig-v">${num(+(e.first_frame_ms.median / 1000).toFixed(2), 2)}<u>s</u></dd><dd class="rig-fn">median of ${e.first_frame_ms.runs.length} cold loads · ${(Math.min(...e.first_frame_ms.runs) / 1000).toFixed(1)}–${(Math.max(...e.first_frame_ms.runs) / 1000).toFixed(1)} s</dd></div>
        ${ci ? `<div><dt>CI · main</dt><dd class="rig-v"><b class="rig-txt rig-ci" data-ci="${esc(ci.conclusion)}">${esc(ci.conclusion === "success" ? "pass" : ci.conclusion || "running")}</b></dd><dd class="rig-fn">${day(ci.at, false)} · ${esc(ci.sha)}</dd></div>` : ""}
        ${ec ? `<div><dt>Echo</dt><dd class="rig-v rig-code"><b class="rig-txt">${ec.above.depth_ft} ft ${esc(ec.above.word ?? "?")}</b><u>→</u><b class="rig-txt">${ec.below.depth_ft} ft ${esc(ec.below.word ?? "?")}</b></dd><dd class="rig-fn">${ec.pass ? `same ping, read headless · ${ec.above.range_m} m in ${ec.round_trip.shown_s} s = 2 × range ÷ 1,500 m/s` : "smoke test FAILED"}</dd></div>` : ""}
      </dl>
      <p class="rig-foot">${esc(e.method.browser.replace(/ headless.*/, ""))}, headless on SwiftShader at ${esc(e.method.viewport.replace(", dark scheme", ""))}, pinned states: a bench for comparing builds, not a device frame rate.</p>
    </div>`;
}

// ── static HTML for the home page (the no-JS truth; src/home/rig.ts only animates it) ──
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso, year = true) => { const d = new Date(iso); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ""}`; };
const kB = (b) => b / 1000;
const num = (v, d = 0, cls = "") => `<b class="rig-n${cls}" data-n="${v}" data-d="${d}">${v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })}</b>`;

function stripHtml(e, stamp) {
  const beats = e.render.beats;
  const maxTri = Math.max(...beats.map((b) => b.triangles));
  const maxCalls = Math.max(...beats.map((b) => b.calls));
  const top = Math.ceil(maxTri / 100000) * 100000; // y-axis ceiling, round
  // trace: x by scroll position p (inset 3% each side so end dots are not clipped), y by triangles
  const p0 = beats[0].p, p1 = beats[beats.length - 1].p;
  const X = (i) => 3 + ((beats[i].p - p0) / (p1 - p0)) * 94;
  const Y = (t) => 100 - (t / top) * 100;
  const pts = beats.map((b, i) => `${X(i).toFixed(2)},${Y(b.triangles).toFixed(2)}`).join(" ");
  const fmtK = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const ci = e.ci;
  const glbList = e.payload.glb.map((g) => `${g.file.replace("/models/", "")} ${(g.bytes / 1e6).toFixed(2)} MB`).join(", ");
  const frames = beats.map((b, i) => `<img src="${b.frame}" width="480" height="300" data-p="${b.p.toFixed(2)}" data-name="${esc(b.name)}" alt="Headless render of the live piece at ${b.qs ? "the atlas" : `p ${b.p.toFixed(2)}`}: ${esc(b.name.toLowerCase())}" loading="lazy" decoding="async"${i === 0 ? ' class="on"' : ""}>`).join("\n          ");
  const ticks = beats.map((b, i) => `<li><button type="button" data-i="${i}" aria-label="Show frame at p ${b.p.toFixed(2)}, ${esc(b.name.toLowerCase())}"${i === 0 ? ' aria-current="true"' : ""}></button></li>`).join("");
  const dots = beats.map((b, i) => `<i${i === 0 ? ' class="on"' : ""} style="left:${X(i).toFixed(2)}%;top:${Y(b.triangles).toFixed(2)}%" data-i="${i}" title="p ${b.p.toFixed(2)}: ${b.triangles.toLocaleString("en-GB")} triangles, ${b.calls} draw calls"></i>`).join("");
  const axis = beats.map((b, i) => `<li style="left:${X(i).toFixed(2)}%">${b.p.toFixed(2)}</li>`).join("");
  return `<div class="rig" data-rig>
      <div class="rig-head"><span class="rig-title"><span class="rig-led" aria-hidden="true"></span>Test rig</span><span class="rig-when">measured <time datetime="${stamp.measured_at}">${day(stamp.measured_at)}</time> · <a href="/projects/rig.json">rig.json</a></span></div>
      <div class="rig-bench">
        <figure class="rig-film" data-film>
          <div class="rig-frames" tabindex="0" aria-label="QA frames at ${beats.length} pinned scroll positions; hover or focus to flick through">
          ${frames}
          </div>
          <figcaption><span class="rig-p" data-cap-p>p ${beats[0].p.toFixed(2)}</span><span data-cap-name>${esc(beats[0].name)}</span><span class="rig-of" data-cap-of>1/${beats.length}</span></figcaption>
          <ol class="rig-ticks" aria-label="Frames">${ticks}</ol>
        </figure>
        <div class="rig-trace">
          <div class="rig-label"><span>Triangles per frame</span><span class="rig-scale">0–${fmtK(top)}</span></div>
          <div class="rig-plot" aria-hidden="true">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="rig-grid" d="M0 25H100M0 50H100M0 75H100"/><polyline class="rig-line" points="${pts}"/></svg>
            <span class="rig-dots">${dots}</span>
            <span class="rig-sweep"></span>
          </div>
          <ol class="rig-axis" aria-hidden="true">${axis}</ol>
          <p class="rig-sr">Triangles per frame at p ${beats.map((b) => `${b.p.toFixed(2)}: ${b.triangles.toLocaleString("en-GB")}`).join("; ")}.</p>
        </div>
      </div>
      <dl class="rig-ch">
        <div><dt>Payload</dt><dd class="rig-v">${num(+kB(e.payload.js_gzip).toFixed(1), 1)}<u>kB</u></dd><dd class="rig-fn">JS, gzip · + ${e.payload.glb.length} GLB, ${(e.payload.glb_bytes / 1e6).toFixed(2)} MB<span class="rig-sr"> (${esc(glbList)})</span></dd></div>
        <div><dt>Draw calls</dt><dd class="rig-v">${num(maxCalls)}<u>peak</u></dd><dd class="rig-fn">max ${fmtK(maxTri)} tris · ${Math.max(...beats.map((b) => b.textures))} textures</dd></div>
        <div><dt>First frame</dt><dd class="rig-v">${num(+(e.first_frame_ms.median / 1000).toFixed(2), 2)}<u>s</u></dd><dd class="rig-fn">median of ${e.first_frame_ms.runs.length} cold loads · ${(Math.min(...e.first_frame_ms.runs) / 1000).toFixed(1)}–${(Math.max(...e.first_frame_ms.runs) / 1000).toFixed(1)} s</dd></div>
        ${ci ? `<div><dt>CI · main</dt><dd class="rig-v"><b class="rig-txt rig-ci" data-ci="${esc(ci.conclusion)}">${esc(ci.conclusion === "success" ? "pass" : ci.conclusion || "running")}</b></dd><dd class="rig-fn">${day(ci.at, false)} · ${esc(ci.sha)}</dd></div>` : ""}
        ${e.parts ? `<div><dt>Pieces</dt><dd class="rig-v">${num(e.parts.count)}<u>ids</u></dd><dd class="rig-fn">every one modelled, described and searchable</dd></div>` : ""}${e.search ? `<div><dt>Atlas search</dt><dd class="rig-v rig-code"><b class="rig-txt">${esc(e.search.query)}</b><u>→</u><b class="rig-txt">${e.search.results}</b></dd><dd class="rig-fn">${e.search.pass ? `typed headless; the list (8 at most) opens ${esc(e.search.first.slice(0, 2).join(", "))}…` : "smoke test FAILED"}</dd></div>` : ""}${e.cipher ? `<div><dt>Cipher</dt><dd class="rig-v rig-code"><b class="rig-txt">${esc(e.cipher.typed)}</b><u>→</u><b class="rig-txt" data-scramble>${esc(e.cipher.out)}</b></dd><dd class="rig-fn">${e.cipher.pass ? "typed headless; no letter maps to itself" : "smoke test FAILED"}</dd></div>` : ""}
      </dl>
      <p class="rig-foot">${esc(stamp.method.browser.replace(/ headless.*/, ""))}, headless on SwiftShader at ${esc(stamp.method.viewport.replace(", dark scheme", ""))}${stamp.method.query ? `, <code>${esc(stamp.method.query.replace(/ on every load$/, ""))}</code>` : ""}: a bench for comparing builds, not a device frame rate.</p>
    </div>`;
}

// entry 002's strip: same instrument, but its beats are named states, not scroll positions
function viewsStripHtml(e) {
  const views = e.render.views;
  const maxTri = Math.max(...views.map((b) => b.triangles));
  const maxCalls = Math.max(...views.map((b) => b.calls));
  const top = Math.ceil(maxTri / 50000) * 50000;
  const X = (i) => 3 + (i / (views.length - 1)) * 94;
  const Y = (t) => 100 - (t / top) * 100;
  const pts = views.map((b, i) => `${X(i).toFixed(2)},${Y(b.triangles).toFixed(2)}`).join(" ");
  const fmtK = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const ci = e.ci;
  const d = e.data ?? {};
  const frames = views.map((b, i) => `<img src="${b.frame}" width="480" height="300" data-tag="${esc(b.tag)}" data-name="${esc(b.name)}" alt="Headless render of the live piece: ${esc(b.name.toLowerCase())}" loading="lazy" decoding="async"${i === 0 ? ' class="on"' : ""}>`).join("\n          ");
  const ticks = views.map((b, i) => `<li><button type="button" data-i="${i}" aria-label="Show frame: ${esc(b.name.toLowerCase())}"${i === 0 ? ' aria-current="true"' : ""}></button></li>`).join("");
  const dots = views.map((b, i) => `<i${i === 0 ? ' class="on"' : ""} style="left:${X(i).toFixed(2)}%;top:${Y(b.triangles).toFixed(2)}%" data-i="${i}" title="${esc(b.name)}: ${b.triangles.toLocaleString("en-GB")} triangles, ${b.calls} draw calls"></i>`).join("");
  const axis = views.map((b, i) => `<li style="left:${X(i).toFixed(2)}%">${esc(b.tag)}</li>`).join("");
  const s = e.search;
  return `<div class="rig" data-rig>
      <div class="rig-head"><span class="rig-title"><span class="rig-led" aria-hidden="true"></span>Test rig</span><span class="rig-when">measured <time datetime="${e.measured_at}">${day(e.measured_at)}</time> · <a href="/projects/rig.json">rig.json</a></span></div>
      <div class="rig-bench">
        <figure class="rig-film" data-film>
          <div class="rig-frames" tabindex="0" aria-label="QA frames in ${views.length} states; hover or focus to flick through">
          ${frames}
          </div>
          <figcaption><span class="rig-p" data-cap-p>${esc(views[0].tag)}</span><span data-cap-name>${esc(views[0].name)}</span><span class="rig-of" data-cap-of>1/${views.length}</span></figcaption>
          <ol class="rig-ticks" aria-label="Frames">${ticks}</ol>
        </figure>
        <div class="rig-trace">
          <div class="rig-label"><span>Triangles per frame</span><span class="rig-scale">0–${fmtK(top)}</span></div>
          <div class="rig-plot" aria-hidden="true">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="rig-grid" d="M0 25H100M0 50H100M0 75H100"/><polyline class="rig-line" points="${pts}"/></svg>
            <span class="rig-dots">${dots}</span>
            <span class="rig-sweep"></span>
          </div>
          <ol class="rig-axis" aria-hidden="true">${axis}</ol>
          <p class="rig-sr">Triangles per frame, ${views.map((b) => `${b.name.toLowerCase()}: ${b.triangles.toLocaleString("en-GB")}`).join("; ")}.</p>
        </div>
      </div>
      <dl class="rig-ch">
        <div><dt>Payload</dt><dd class="rig-v">${num(+kB(e.payload.js_gzip).toFixed(1), 1)}<u>kB</u></dd><dd class="rig-fn">JS, gzip, in 3D · lite mode ${kB(e.payload.lite_js_gzip).toFixed(0)} kB · no assets</dd></div>
        <div><dt>Draw calls</dt><dd class="rig-v">${num(maxCalls)}<u>peak</u></dd><dd class="rig-fn">max ${fmtK(maxTri)} tris · bloom included</dd></div>
        <div><dt>First frame</dt><dd class="rig-v">${num(+(e.first_frame_ms.median / 1000).toFixed(2), 2)}<u>s</u></dd><dd class="rig-fn">median of ${e.first_frame_ms.runs.length} cold loads · ${(Math.min(...e.first_frame_ms.runs) / 1000).toFixed(1)}–${(Math.max(...e.first_frame_ms.runs) / 1000).toFixed(1)} s</dd></div>
        ${ci ? `<div><dt>CI · main</dt><dd class="rig-v"><b class="rig-txt rig-ci" data-ci="${esc(ci.conclusion)}">${esc(ci.conclusion === "success" ? "pass" : ci.conclusion || "running")}</b></dd><dd class="rig-fn">${day(ci.at, false)} · ${esc(ci.sha)}</dd></div>` : ""}
        ${s ? `<div><dt>Search</dt><dd class="rig-v rig-code"><b class="rig-txt">/${esc(s.query)}</b><u>→</u><b class="rig-txt rig-hit">${esc(s.found || "nothing")}</b></dd><dd class="rig-fn">${s.pass ? `found headless · ${esc(d.nodes ?? "?")} nodes, ${esc(d.links ?? "?")} links` : "smoke test FAILED"}</dd></div>` : ""}
      </dl>
      <p class="rig-foot">${esc(e.method.browser.replace(/ headless.*/, ""))}, headless on SwiftShader at ${esc(e.method.viewport.replace(", dark scheme", ""))}: a bench for comparing builds, not a device frame rate.</p>
    </div>`;
}

function idleHtml() {
  return `<div class="rig rig-idle" data-rig>
      <div class="rig-head"><span class="rig-title"><span class="rig-led" aria-hidden="true"></span>Test rig</span><span class="rig-when">idle</span></div>
      <div class="rig-plot rig-flat" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="rig-grid" d="M0 50H100"/></svg></div>
      <p class="rig-foot">Not yet measured. Numbers appear here once there is something to measure.</p>
    </div>`;
}

function writeHtml(rig) {
  const f = path.join(ROOT, "index.html");
  let s = fs.readFileSync(f, "utf8");
  const put = (tag, html) => {
    const re = new RegExp(`(<!-- rig:${tag} -->)[\\s\\S]*?(<!-- /rig:${tag} -->)`, "g");
    if (!re.test(s)) throw new Error(`index.html has no <!-- rig:${tag} --> block`);
    s = s.replace(re, (_m, a, b) => `${a}\n    ${html}\n    ${b}`);
  };
  for (const [id, e] of Object.entries(rig.entries)) {
    if (!e) continue;
    put(id, e.render.states ? statesStripHtml(e) : e.render.views ? viewsStripHtml(e) : stripHtml(e, id === "001" ? rig : e));
  }
  // the idle placeholder only stands while some entry is still unmeasured
  if (s.includes("<!-- rig:idle -->")) put("idle", idleHtml());
  fs.writeFileSync(f, s);
  console.log("rewrote index.html rig blocks");
}

const rig = process.argv.includes("--html") ? JSON.parse(fs.readFileSync(JSON_OUT, "utf8")) : await measure();
writeHtml(rig);
