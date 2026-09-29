#!/usr/bin/env node
// Render "how it grew" frames for an entry: the live piece as it was at real
// commits, screenshotted at the same pinned progress (?p=), plus a manifest the
// entry page's scrubber (src/entry/scrubber.ts) reads.
//
//   node tools/render-build-frames.mjs --config tools/build-frames/enigma.json
//        [--p 0.31,0.5]      override the config's progress values (exploring)
//        [--only 164c3d0,…]  render just these shas
//        [--out <dir>]       write frames elsewhere and skip the manifest (exploring)
//        [--force]           re-render frames that already exist
//        [--dry-run]         list what would be built and shot, then stop
//
// Frame kinds (see tools/build-frames/*.json):
//   site     a commit of THIS site's repo: `git worktree add --detach` into a
//            temp dir, symlink our node_modules, `vite build`, serve dist,
//            shoot <livePath>?p=<x>. The worktree is removed afterwards.
//   workspace  a commit of another repo that builds its own demo (entry 002:
//            cortex-map, npm workspaces). `git worktree add --detach` that repo
//            into a temp dir, install ITS lockfile (cfg.workspace.install, e.g.
//            npm ci), run cfg.workspace.build in cfg.workspace.cwd, serve
//            cfg.workspace.dist, shoot "/". The worktree is removed afterwards.
//   harness  a commit of another repo where the piece was one page of a big
//            app: `git show <sha>:<path>` the component + its folder into a
//            temp Vite project that mounts only that component (react-router's
//            Link stubbed to <a>), build, serve, shoot /?p=<x>. The source
//            repo's working tree is never touched.
//            Optional per frame (harness.*):
//              aliases  { "module": "path/in/this/repo" }: stand-ins for modules
//                       this repo does not have (private packages, fonts); a module's
//                       subpaths map to the same file
//              public   { "served/path": "repo/path" }: files copied from the commit
//                       into the build's public dir, skipped if absent at that sha
//              scrub    true: run every extracted text file through
//                       tools/brand-scrub.mjs's scrubText, then refuse to build if
//                       any denylisted name is left (entry 003 names no brands)
// Dependencies come from this repo's node_modules (the pieces share react/three
// versions), except for `workspace` frames, which install their own. WebGL runs
// on SwiftShader through the Playwright in ~/repos/claude-design (PLAYWRIGHT_ROOT
// to override), which is why every piece needs a pinned state: in software GL,
// eased values never settle.
//
// States: by default each shot is <url>?p=<progress> (scroll pieces). A config
// with "states" instead names each shot ({ "table": { query, actions } }), and
// "progress" lists those names; a frame's "stateOverrides" replaces a state for
// that frame. Actions run after the page is ready: { "clickText": "Globe" }
// clicks the first button whose name starts with that text (no such button =
// the piece had no such state at that commit, so the shot is skipped), and
// { "key": "g" } presses a key. "ready" (CSS selector that means "drawn", default
// ".en-readout, [data-ready]"; "waitFor" is accepted as an alias), "settleMs" and
// "jiggle" (keep nudging the pointer, for render-on-demand loops) tune the wait.
// "qs" is extra query appended to every shot (entry 003: tier=HIGH).
// A frame that fails to build, or a shot that fails, is reported and left out;
// the rest still render.
//
//   --dry-run   resolve every frame's commit and print the URL each shot would load
//               and whether its file exists; builds nothing, launches no browser
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design", "package.json"))("playwright");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const home = (p) => p.replace(/^~(?=\/)/, os.homedir());

const cfgPath = path.resolve(ROOT, arg("--config", "tools/build-frames/enigma.json"));
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const progress = (arg("--p", null)?.split(",").map((v) => (Number.isNaN(Number(v)) ? v : Number(v)))) ?? cfg.progress;
const only = arg("--only", null)?.split(",");
const outArg = arg("--out", null);
const OUT = outArg ? path.resolve(outArg) : path.join(ROOT, cfg.out);
const writeManifest = !outArg;
const force = has("--force");
const dryRun = has("--dry-run");
const VP = cfg.viewport ?? { width: 1200, height: 675 };
const QUALITY = cfg.quality ?? 74;
if (!dryRun) fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "build-frames-"));

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const git = (repo, ...args) => run("git", ["-C", repo, ...args]);
const pTag = (p) => (typeof p === "number" ? "p" + String(p).replace(".", "_") : String(p));
const READY = cfg.ready ?? cfg.waitFor ?? ".en-readout, [data-ready]";
const SETTLE_MS = cfg.settleMs ?? 7000;
// where the pointer rests while shooting, as fractions of the viewport (default: centre)
const PTR = { x: (cfg.pointer?.[0] ?? 0.5) * VP.width, y: (cfg.pointer?.[1] ?? 0.5) * VP.height };
const withQs = (q) => [q, cfg.qs].filter(Boolean).join("&");
const stateFor = (frame, p) => {
  if (!cfg.states) return { query: withQs(`p=${p}`), actions: [] };
  const st = frame.stateOverrides?.[p] ?? cfg.states[p];
  if (!st) throw new Error(`no state "${p}" in ${cfgPath}`);
  return { query: withQs(st.query ?? ""), actions: st.actions ?? [] };
};

// ---- static server over a dist folder ------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff",
  ".glb": "model/gltf-binary", ".txt": "text/plain", ".xml": "application/xml", ".ico": "image/x-icon" };
function serve(dir) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = path.join(dir, rel);
    if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---- building one frame's source -----------------------------------------
function buildSite(frame, repo) {
  const dir = path.join(TMP, `${frame.repo}-${frame.sha}`);
  git(repo, "worktree", "add", "--detach", dir, frame.sha);
  try {
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    run("bun", ["x", "vite", "build", "--logLevel", "error"], { cwd: dir });
    const dist = path.join(TMP, `${frame.repo}-${frame.sha}-dist`);
    fs.renameSync(path.join(dir, "dist"), dist);
    return { dist, url: cfg.livePath };
  } finally {
    git(repo, "worktree", "remove", "--force", dir);
  }
}

function buildWorkspace(frame, repo) {
  const ws = { ...cfg.workspace, ...frame.workspace };
  const dir = path.join(TMP, `${frame.repo}-${frame.sha}`);
  git(repo, "worktree", "add", "--detach", dir, frame.sha);
  try {
    const [icmd, ...iargs] = ws.install;
    run(icmd, iargs, { cwd: dir });
    const [bcmd, ...bargs] = ws.build;
    run(bcmd, bargs, { cwd: path.join(dir, ws.cwd ?? ".") });
    const dist = path.join(TMP, `${frame.repo}-${frame.sha}-dist`);
    fs.renameSync(path.join(dir, ws.dist), dist);
    return { dist, url: "/" };
  } finally {
    git(repo, "worktree", "remove", "--force", dir);
  }
}

async function buildHarness(frame, repo) {
  const dir = path.join(TMP, `${frame.repo}-${frame.sha}`);
  const { component, dir: partsDir, aliases = {}, public: pub = {}, scrub = false } = frame.harness;
  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const files = git(repo, "ls-tree", "-r", "--name-only", frame.sha, partsDir).split("\n").filter(Boolean);
  const brands = scrub ? await import("./brand-scrub.mjs") : null;
  const left = [];
  for (const f of [...new Set([component, ...files])]) {
    const dest = path.join(srcDir, path.relative(path.dirname(component), f));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let text = git(repo, "show", `${frame.sha}:${f}`) + "\n";
    if (brands) {
      text = brands.scrubText(text);
      for (const b of brands.findBrands(text)) left.push(`${f}: ${b}`);
    }
    fs.writeFileSync(dest, text);
  }
  if (left.length) throw new Error(`scrub left ${left.length} denylisted name(s) at ${frame.sha}:\n${left.join("\n")}`);
  // each alias replaces the module AND any subpath of it ("@fontsource/x/400.css")
  const alias = [["react-router-dom", "/src/router-stub.tsx"], ...Object.entries(aliases).map(([m, stub]) => [m, path.join(ROOT, stub)])]
    .map(([m, to]) => `{ find: /^${m.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(\\/.*)?$/, replacement: ${JSON.stringify(to)} }`);
  for (const [served, from] of Object.entries(pub)) {
    const r = spawnSync("git", ["-C", repo, "show", `${frame.sha}:${from}`], { maxBuffer: 256 << 20 });
    if (r.status !== 0) continue; // not in the repo yet at this commit
    const dest = path.join(dir, "public", served);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, r.stdout);
  }
  const compName = path.basename(component).replace(/\.tsx?$/, "");
  fs.writeFileSync(path.join(srcDir, "router-stub.tsx"),
    `import type { AnchorHTMLAttributes } from "react";
export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) { return <a href={to} {...rest} />; }
export const useNavigate = () => () => {};
export const useLocation = () => ({ pathname: "/", search: location.search, hash: "" });
`);
  fs.writeFileSync(path.join(srcDir, "main.tsx"),
    `import { createRoot } from "react-dom/client";
import Piece from "./${compName}";
createRoot(document.getElementById("root")!).render(<Piece />);
`);
  // Same shell as this site's live pages: dark body, #root, nothing else.
  fs.writeFileSync(path.join(dir, "index.html"),
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html, body { margin: 0; background: #0b0b0d; color: #ddd6c8; } #root { min-height: 100vh; }</style></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
`);
  fs.writeFileSync(path.join(dir, "vite.config.mjs"),
    `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
export default defineConfig({ plugins: [react()], resolve: { alias: [${alias.join(", ")}] }, build: { target: "es2020", assetsInlineLimit: 0 } });
`);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  run("bun", ["x", "vite", "build", "--logLevel", "error"], { cwd: dir });
  return { dist: path.join(dir, "dist"), url: "/" };
}


// ---- main ------------------------------------------------------------------
if (dryRun) {
  for (const frame of cfg.frames) {
    const repo = home(frame.repoPath);
    const full = git(repo, "rev-parse", frame.sha);
    const url = frame.kind === "site" ? cfg.livePath : "/";
    if (!["site", "harness", "workspace"].includes(frame.kind)) throw new Error(`unknown frame kind "${frame.kind}" at ${frame.sha}`);
    if (frame.kind === "workspace" && !{ ...cfg.workspace, ...frame.workspace }.build) throw new Error(`workspace frame ${frame.sha} has no build command`);
    if (frame.kind === "harness") for (const stub of Object.values(frame.harness.aliases ?? {})) if (!fs.existsSync(path.join(ROOT, stub))) throw new Error(`alias stub ${stub} missing`);
    const extras = frame.kind === "harness" ? Object.keys(frame.harness).filter((k) => !["component", "dir"].includes(k)) : [];
    console.log(`${frame.repo}@${full.slice(0, 7)} ${frame.kind}${extras.length ? ` [${extras.join(", ")}]` : ""}`);
    for (const p of progress) {
      const st = stateFor(frame, p);
      const f = `${frame.repo}-${full.slice(0, 7)}-${pTag(p)}.jpg`;
      console.log(`  ${fs.existsSync(path.join(OUT, f)) ? "have" : "MISS"} ${f}  <- ${url}${st.query ? `?${st.query}` : ""}${st.actions.length ? `  then ${JSON.stringify(st.actions)}` : ""}`);
    }
  }
  console.log(`ready "${READY}", settle ${SETTLE_MS} ms${cfg.jiggle ? " (jiggle)" : ""}, out ${path.relative(ROOT, OUT)}`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
}

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const manifestPath = path.join(OUT, "manifest.json");
const previous = writeManifest && fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
const out = [];
try {
  for (const frame of cfg.frames) {
    const repo = home(frame.repoPath);
    const full = git(repo, "rev-parse", frame.sha);
    const [date, subject] = git(repo, "log", "-1", "--format=%aI%x00%s", full).split("\0");
    const entry = { repo: frame.repo, sha: full.slice(0, 7), date, subject, kind: frame.kind, ...(frame.note ? { note: frame.note } : {}), shots: {} };
    const want = progress.map((p) => [p, `${frame.repo}-${entry.sha}-${pTag(p)}.jpg`]);
    const skip = only && !only.includes(entry.sha);
    const missing = want.filter(([, f]) => force || !fs.existsSync(path.join(OUT, f)));
    if (!skip && missing.length) {
      console.log(`build ${frame.repo}@${entry.sha} (${frame.kind}) …`);
      let built = null;
      try {
        built = frame.kind === "harness" ? await buildHarness(frame, repo) : frame.kind === "workspace" ? buildWorkspace(frame, repo) : buildSite(frame, repo);
      } catch (e) {
        // an honest gap: say which commit would not build, and carry on with the rest
        console.error(`  could not build ${frame.repo}@${entry.sha}; left out:\n    ${String(e.message).split("\n").slice(0, 12).join("\n    ")}`);
      }
      if (built) {
      const { dist, url } = built;
      const server = await serve(dist);
      const port = server.address().port;
      try {
        for (const [p, f] of missing) {
          const page = await browser.newPage({ viewport: VP, deviceScaleFactor: 1, colorScheme: "dark" });
          page.on("pageerror", (e) => console.error(`  pageerror @${entry.sha}:`, e.message));
          // headless Chromium hangs screenshots after a cross-document View Transition
          await page.route("**/motion/transitions.css", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
          const st = stateFor(frame, p);
          await page.goto(`http://127.0.0.1:${port}${url}${st.query ? `?${st.query}` : ""}`, { waitUntil: "networkidle", timeout: 180000 });
          await page.waitForSelector(READY, { timeout: 180000 });
          await page.mouse.move(PTR.x, PTR.y);
          let absent = false;
          for (const a of st.actions) {
            if (a.wait) await page.waitForTimeout(a.wait);
            if (a.key) await page.keyboard.press(a.key);
            if (a.clickText) {
              const btn = page.getByRole("button", { name: new RegExp(`^\\W*${a.clickText}`, "i") }).first();
              if (!(await btn.count())) { absent = true; break; }
              await btn.click();
              await page.mouse.move(PTR.x, PTR.y);
            }
          }
          if (absent) { console.log(`  no "${p}" state at ${entry.sha}; skipped`); await page.close(); continue; }
          if (cfg.jiggle) {
            // render-on-demand pieces sleep when idle; keep them awake while they settle
            for (let t = 0; t < SETTLE_MS; t += 1000) { await page.mouse.move(PTR.x + (t % 2000 ? 4 : 0), PTR.y); await page.waitForTimeout(1000); }
          } else {
            await page.waitForTimeout(SETTLE_MS); // several software-GL frames: late GLBs, callouts, lamps
          }
          try {
            await page.screenshot({ path: path.join(OUT, f), type: "jpeg", quality: QUALITY, timeout: 420000 });
            console.log(`  wrote ${f} (${Math.round(fs.statSync(path.join(OUT, f)).size / 1024)} kB)`);
          } catch (e) { console.error(`  shot ${f} failed (left out): ${e.message.split("\n")[0]}`); }
          await page.close();
        }
      } finally { server.close(); }
      }
    }
    for (const [p, f] of want) if (fs.existsSync(path.join(OUT, f))) entry.shots[String(p)] = f;
    if (Object.keys(entry.shots).length) out.push(entry);
    else console.log(`  (no frames for ${frame.repo}@${entry.sha}; left out of the manifest)`);
  }
} finally {
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

if (writeManifest) {
  out.sort((a, b) => a.date.localeCompare(b.date));
  const manifest = {
    entry: cfg.entry,
    livePath: cfg.livePath,
    progress,
    viewport: VP,
    base: "/" + path.relative(path.join(ROOT, "public"), OUT).split(path.sep).join("/") + "/",
    ...(cfg.milestones ? { milestones: cfg.milestones } : {}),
    ...(cfg.brief ? { brief: cfg.brief } : {}),
    ...(cfg.beatAlt ? { beatAlt: cfg.beatAlt } : {}),
    ...(cfg.beatMissing ? { beatMissing: cfg.beatMissing } : {}),
    ...(cfg.beatGroupLabel ? { beatGroupLabel: cfg.beatGroupLabel } : {}),
    generated: previous && JSON.stringify(previous.frames) === JSON.stringify(out) ? previous.generated : new Date().toISOString(),
    frames: out,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${path.relative(ROOT, manifestPath)} (${out.length} frames)`);
}
