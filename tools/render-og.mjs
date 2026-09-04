#!/usr/bin/env node
// Render public/og.png (1200×630) and public/apple-touch-icon.png (180×180)
// from tools/og.html + public/favicon.svg, plus a preview screenshot of the
// page itself for eyeballing. Uses the Playwright install already present in
// ~/repos/claude-design (nothing to install here); serves public/ over a
// throwaway python http.server so absolute /fonts/ URLs resolve.
//
//   node tools/render-og.mjs [--shot /path/to/preview.png]
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const PW_ROOT = process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design";
const { chromium } = createRequire(path.join(PW_ROOT, "package.json"))("playwright");

const shotIdx = process.argv.indexOf("--shot");
const shotPath = shotIdx > -1 ? process.argv[shotIdx + 1] : null;

// tools/og.html needs /fonts/ — serve from a temp dir that overlays both.
const serveDir = fs.mkdtempSync("/tmp/jarvising-og-");
fs.cpSync(PUBLIC, serveDir, { recursive: true });
fs.copyFileSync(path.join(ROOT, "tools/og.html"), path.join(serveDir, "og.html"));

const port = 8900 + Math.floor(Math.random() * 100);
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: serveDir, stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 700));

try {
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${port}`;

  const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await og.goto(`${base}/og.html`, { waitUntil: "networkidle" });
  await og.evaluate(() => document.fonts.ready);
  await og.screenshot({ path: path.join(PUBLIC, "og.png"), type: "png" });
  console.log("wrote public/og.png");

  const icon = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await icon.setContent(
    `<style>html,body{margin:0;background:#1B1D20}img{display:block;width:180px;height:180px}</style>` +
    `<img src="${base}/favicon.svg">`, { waitUntil: "networkidle" });
  await icon.screenshot({ path: path.join(PUBLIC, "apple-touch-icon.png"), type: "png" });
  console.log("wrote public/apple-touch-icon.png");

  if (shotPath) {
    for (const [name, vp, scheme] of [
      ["desktop", { width: 1280, height: 900 }, "light"],
      ["mobile", { width: 390, height: 844 }, "dark"],
    ]) {
      const p = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, colorScheme: scheme });
      await p.goto(`${base}/`, { waitUntil: "networkidle" });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(900); // let the entrance animation finish
      const out = shotPath.replace(/\.png$/, `-${name}.png`);
      await p.screenshot({ path: out, fullPage: true });
      console.log("wrote", out);
    }
  }
  await browser.close();
} finally {
  server.kill();
  fs.rmSync(serveDir, { recursive: true, force: true });
}
