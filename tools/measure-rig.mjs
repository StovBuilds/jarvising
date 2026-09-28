#!/usr/bin/env node
// Test rig: measure entry 001 and write the numbers the home page shows.
//   node tools/measure-rig.mjs            build dist/, measure, write rig.json + frames + home HTML
//   node tools/measure-rig.mjs --html     only re-render the home-page strip from rig.json
//
// Everything on the strip comes from here and nowhere else:
//   payload   gzip -9 of every JS file the live page loads (its module + modulepreloads),
//             and the byte size of each GLB, all read from a fresh dist/
//   render    renderer.info (draw calls, triangles, textures, programs) of the last frame
//             at pinned ?p= beats, read through the ?probe=1 hook in src/enigma/Enigma.tsx
//   timing    time to first rendered frame (performance.now() at the end of the first
//             renderer.render), median of cold loads. Headless Chromium on SwiftShader,
//             i.e. SOFTWARE GL: a lab number for comparing builds, not a device frame rate
//   cipher    a smoke test typed into the simulator at p=1 (same check as render-enigma.mjs)
//   ci        conclusion + time of the latest ci.yml run on main (gh), taken at measure time
//   frames    small WebP screenshots at the same beats -> public/projects/enigma/rig/
//
// Writes public/projects/rig.json, then rewrites the <!-- rig:001 --> and
// <!-- rig:idle --> blocks in index.html so the page reads fully without JS.
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = path.join(ROOT, "public/projects/rig.json");
const FRAMES = path.join(ROOT, "public/projects/enigma/rig");
const W = 1440, H = 900;
// pinned beats: page progress p (the chapters read p), one per chapter worth seeing
const BEATS = [
  { p: 0.04, name: "The machine" },
  { p: 0.31, name: "The assembly" },
  { p: 0.45, name: "The rotor" },
  { p: 0.6, name: "The path" },
  { p: 0.83, name: "The bombe" },
  { p: 0.95, name: "Your turn" },
];
const COLD_RUNS = 5;

const sh = (cmd, args, opts = {}) => String(execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts }) ?? "").trim();

async function measure() {
  // ── payload, from a fresh build ──
  fs.rmSync(path.join(ROOT, "dist"), { recursive: true, force: true });
  sh("bun", ["run", "build"], { stdio: ["ignore", "ignore", "inherit"] });
  const liveHtml = fs.readFileSync(path.join(ROOT, "dist/projects/enigma/live/index.html"), "utf8");
  const jsRefs = [...new Set([
    // the piece's own bundle: its module + modulepreloads (not the site-wide /analytics.js counter)
    ...[...liveHtml.matchAll(/<script[^>]+src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]),
    ...[...liveHtml.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)].map((m) => m[1]),
  ])];
  const js = jsRefs.map((ref) => {
    const buf = fs.readFileSync(path.join(ROOT, "dist", ref));
    return { file: ref, bytes: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  });
  const glbNames = [...new Set([...fs.readFileSync(path.join(ROOT, "src/enigma/Enigma.tsx"), "utf8").matchAll(/"\/models\/([a-z0-9-]+\.glb)"/g)].map((m) => m[1]))].sort();
  const glb = glbNames.map((n) => ({ file: `/models/${n}`, bytes: fs.statSync(path.join(ROOT, "dist/models", n)).size }));

  // ── headless: preview the built dist, SwiftShader Chromium ──
  const PW_ROOT = process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design";
  const { chromium } = createRequire(path.join(PW_ROOT, "package.json"))("playwright");
  const port = 4500 + Math.floor(Math.random() * 100);
  const base = `http://127.0.0.1:${port}`;
  const server = spawn("bun", ["x", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("vite preview did not start")), 30000);
    server.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } });
  });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const chromiumVersion = browser.version();
  const probeOf = (page) => page.evaluate(() => window.__enigmaProbe ?? null);
  const open = async (qs) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "dark" }); // fresh context = cold HTTP cache
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    await page.goto(`${base}/projects/enigma/live/?${qs}`, { waitUntil: "load" });
    await page.waitForFunction(() => (window.__enigmaProbe?.frames ?? 0) >= 1, null, { timeout: 180000, polling: 100 });
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

  let beats = [], cold = [], cipher = null;
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
      const { ctx, page } = await open(`p=${b.p}&probe=1`);
      await page.mouse.move(W / 2, H / 2);
      const pr = await settle(page);
      const tag = `p${String(b.p).replace(".", "_")}`;
      const png = path.join(FRAMES, `${tag}.png`);
      await page.screenshot({ path: png, timeout: 180000 });
      // 480×300 WebP: shown at ~240 px wide, so 2× for dense screens
      sh("python3", ["-c", `from PIL import Image; im=Image.open(${JSON.stringify(png)}).convert("RGB").resize((480,300), Image.LANCZOS); im.save(${JSON.stringify(path.join(FRAMES, tag + ".webp"))}, "WEBP", quality=62, method=6)`]);
      fs.rmSync(png);
      beats.push({ p: b.p, name: b.name, frame: `/projects/enigma/rig/${tag}.webp`, calls: pr.calls, triangles: Math.round(pr.triangles), textures: pr.textures, geometries: pr.geometries, programs: pr.programs });
      console.log("beat", b.p, JSON.stringify(pr));
      await ctx.close();
    }
    // cipher smoke: type HELLO into the simulator
    {
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
  } finally {
    await browser.close();
    server.kill();
  }

  // ── CI on main, at measure time ──
  let ci = null;
  try {
    const [r] = JSON.parse(sh("gh", ["run", "list", "--repo", "StovBuilds/jarvising", "--workflow", "ci.yml", "--branch", "main", "--limit", "1", "--json", "conclusion,createdAt,headSha,url"]));
    if (r) ci = { conclusion: r.conclusion, at: r.createdAt, sha: r.headSha.slice(0, 7), url: r.url };
  } catch (e) { console.error("gh failed; CI left unmeasured:", e.message); }

  const sorted = [...cold].sort((a, b) => a - b);
  const rig = {
    schema: 1,
    measured_at: new Date().toISOString(),
    commit: sh("git", ["rev-parse", "--short", "HEAD"]),
    dirty: sh("git", ["status", "--porcelain", "--", "src", "projects", "public/models"]) !== "",
    method: {
      tool: "tools/measure-rig.mjs",
      browser: `Chromium ${chromiumVersion} headless, SwiftShader (software GL)`,
      viewport: `${W}×${H} @1x, dark scheme`,
      note: "Headless software rendering. Timing is for comparing builds on the same bench, not a real-device frame rate.",
    },
    entries: {
      "001": {
        slug: "enigma",
        payload: {
          js_gzip: js.reduce((s, f) => s + f.gzip, 0),
          js_bytes: js.reduce((s, f) => s + f.bytes, 0),
          js,
          glb_bytes: glb.reduce((s, f) => s + f.bytes, 0),
          glb,
          compression: "gzip -9 (node zlib); GLBs are raw file size",
        },
        render: { beats, source: "renderer.info after the last frame, at ?p=<beat>&probe=1, once the scene stopped growing" },
        first_frame_ms: { median: sorted[Math.floor(sorted.length / 2)], runs: cold, source: "performance.now() after the first renderer.render, cold context, top of page" },
        cipher,
        ci,
      },
      "002": null,
      "003": null,
    },
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(rig, null, 2) + "\n");
  console.log("wrote", path.relative(ROOT, JSON_OUT));
  return rig;
}

// ── static HTML for the home page (the no-JS truth; src/home/rig.ts only animates it) ──
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso, year = true) => { const d = new Date(iso); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ""}`; };
const kB = (b) => b / 1000;
const num = (v, d = 0, cls = "") => `<b class="rig-n${cls}" data-n="${v}" data-d="${d}">${v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })}</b>`;

function stripHtml(rig) {
  const e = rig.entries["001"];
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
  const frames = beats.map((b, i) => `<img src="${b.frame}" width="480" height="300" data-p="${b.p.toFixed(2)}" data-name="${esc(b.name)}" alt="Headless render of the live piece at p ${b.p.toFixed(2)}: ${esc(b.name.toLowerCase())}" loading="lazy" decoding="async"${i === 0 ? ' class="on"' : ""}>`).join("\n          ");
  const ticks = beats.map((b, i) => `<li><button type="button" data-i="${i}" aria-label="Show frame at p ${b.p.toFixed(2)}, ${esc(b.name.toLowerCase())}"${i === 0 ? ' aria-current="true"' : ""}></button></li>`).join("");
  const dots = beats.map((b, i) => `<i${i === 0 ? ' class="on"' : ""} style="left:${X(i).toFixed(2)}%;top:${Y(b.triangles).toFixed(2)}%" data-i="${i}" title="p ${b.p.toFixed(2)}: ${b.triangles.toLocaleString("en-GB")} triangles, ${b.calls} draw calls"></i>`).join("");
  const axis = beats.map((b, i) => `<li style="left:${X(i).toFixed(2)}%">${b.p.toFixed(2)}</li>`).join("");
  return `<div class="rig" data-rig>
      <div class="rig-head"><span class="rig-title"><span class="rig-led" aria-hidden="true"></span>Test rig</span><span class="rig-when">measured <time datetime="${rig.measured_at}">${day(rig.measured_at)}</time> · <a href="/projects/rig.json">rig.json</a></span></div>
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
        ${e.cipher ? `<div><dt>Cipher</dt><dd class="rig-v rig-code"><b class="rig-txt">${esc(e.cipher.typed)}</b><u>→</u><b class="rig-txt" data-scramble>${esc(e.cipher.out)}</b></dd><dd class="rig-fn">${e.cipher.pass ? "typed headless; no letter maps to itself" : "smoke test FAILED"}</dd></div>` : ""}
      </dl>
      <p class="rig-foot">${esc(rig.method.browser.replace(/ headless.*/, ""))}, headless on SwiftShader at ${esc(rig.method.viewport.replace(", dark scheme", ""))}: a bench for comparing builds, not a device frame rate.</p>
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
  put("001", stripHtml(rig));
  put("idle", idleHtml());
  fs.writeFileSync(f, s);
  console.log("rewrote index.html rig blocks");
}

const rig = process.argv.includes("--html") ? JSON.parse(fs.readFileSync(JSON_OUT, "utf8")) : await measure();
writeHtml(rig);
