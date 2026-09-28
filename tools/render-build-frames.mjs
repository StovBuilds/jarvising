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
//
// Frame kinds (see tools/build-frames/*.json):
//   site     a commit of THIS site's repo: `git worktree add --detach` into a
//            temp dir, symlink our node_modules, `vite build`, serve dist,
//            shoot <livePath>?p=<x>. The worktree is removed afterwards.
//   harness  a commit of another repo where the piece was one page of a big
//            app: `git show <sha>:<path>` the component + its folder into a
//            temp Vite project that mounts only that component (react-router's
//            Link stubbed to <a>), build, serve, shoot /?p=<x>. The source
//            repo's working tree is never touched.
// Dependencies come from this repo's node_modules (the pieces share react/three
// versions). WebGL runs on SwiftShader through the Playwright in
// ~/repos/claude-design (PLAYWRIGHT_ROOT to override), which is why every piece
// needs the ?p= pin: in software GL, eased values never settle.
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
const progress = (arg("--p", null)?.split(",").map(Number)) ?? cfg.progress;
const only = arg("--only", null)?.split(",");
const outArg = arg("--out", null);
const OUT = outArg ? path.resolve(outArg) : path.join(ROOT, cfg.out);
const writeManifest = !outArg;
const force = has("--force");
const VP = cfg.viewport ?? { width: 1200, height: 675 };
const QUALITY = cfg.quality ?? 74;
fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "build-frames-"));

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const git = (repo, ...args) => run("git", ["-C", repo, ...args]);
const pTag = (p) => "p" + String(p).replace(".", "_");

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

function buildHarness(frame, repo) {
  const dir = path.join(TMP, `${frame.repo}-${frame.sha}`);
  const { component, dir: partsDir } = frame.harness;
  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const files = git(repo, "ls-tree", "-r", "--name-only", frame.sha, partsDir).split("\n").filter(Boolean);
  for (const f of [component, ...files]) {
    const dest = path.join(srcDir, path.relative(path.dirname(component), f));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, git(repo, "show", `${frame.sha}:${f}`) + "\n");
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
export default defineConfig({ plugins: [react()], resolve: { alias: { "react-router-dom": "/src/router-stub.tsx" } }, build: { target: "es2020", assetsInlineLimit: 0 } });
`);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  run("bun", ["x", "vite", "build", "--logLevel", "error"], { cwd: dir });
  return { dist: path.join(dir, "dist"), url: "/" };
}

// ---- main ------------------------------------------------------------------
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
      const { dist, url } = frame.kind === "harness" ? buildHarness(frame, repo) : buildSite(frame, repo);
      const server = await serve(dist);
      const port = server.address().port;
      try {
        for (const [p, f] of missing) {
          const page = await browser.newPage({ viewport: VP, deviceScaleFactor: 1, colorScheme: "dark" });
          page.on("pageerror", (e) => console.error(`  pageerror @${entry.sha}:`, e.message));
          await page.goto(`http://127.0.0.1:${port}${url}?p=${p}`, { waitUntil: "networkidle", timeout: 180000 });
          await page.waitForSelector(".en-readout, [data-ready]", { timeout: 180000 });
          await page.mouse.move(VP.width / 2, VP.height / 2);
          await page.waitForTimeout(7000); // several software-GL frames: late GLBs, callouts, lamps
          await page.screenshot({ path: path.join(OUT, f), type: "jpeg", quality: QUALITY, timeout: 180000 });
          console.log(`  wrote ${f} (${Math.round(fs.statSync(path.join(OUT, f)).size / 1024)} kB)`);
          await page.close();
        }
      } finally { server.close(); }
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
    generated: previous && JSON.stringify(previous.frames) === JSON.stringify(out) ? previous.generated : new Date().toISOString(),
    frames: out,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${path.relative(ROOT, manifestPath)} (${out.length} frames)`);
}
