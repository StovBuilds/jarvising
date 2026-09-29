#!/usr/bin/env node
// Render entry-003 imagery from the live piece (Vite dev server, SwiftShader):
//   public/projects/rig/hero.jpg  (1600×900, the machine exploded in the atlas)
//   public/projects/rig/og.png    (1200×630, the same)
// The atlas chrome (panels, search, slider) is hidden for these two pictures
// only; ?flat=1 because backdrop blur comes out black on SwiftShader.
//   node tools/render-rig.mjs [--explode 0.75] [--shot <dir>]   (--shot also saves the pictures with chrome)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/projects/rig");
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design", "package.json"))("playwright");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const EXPLODE = arg("--explode", "0.75");
const shotDir = arg("--shot", null);

const port = 4300 + Math.floor(Math.random() * 100);
const server = spawn("bun", ["x", "vite", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("vite did not start")), 30000);
  server.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } });
});
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const CHROMELESS = ".rig > :not(.rg-stage) { display: none !important; }";

async function shoot(vp, file, type, chrome = false) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, colorScheme: "dark" });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.route("**/motion/transitions.css", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(`http://127.0.0.1:${port}/projects/rig/live/?atlas=1&flat=1&tier=HIGH&explode=${EXPLODE}&probe=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector(".rg-atlas-head", { timeout: 180000 });
  await page.waitForFunction(() => (window.__rigProbe?.frames ?? 0) >= 3 && window.__rigProbe?.machine === 1, null, { timeout: 180000, polling: 250 });
  if (!chrome) await page.addStyleTag({ content: CHROMELESS });
  await page.waitForTimeout(6000); // the camera eases home; the library swap lands
  await page.screenshot({ path: file, type, ...(type === "jpeg" ? { quality: 86 } : {}), timeout: 180000 });
  console.log("wrote", path.relative(ROOT, file));
  await page.close();
}

try {
  await shoot({ width: 1600, height: 900 }, path.join(OUT, "hero.jpg"), "jpeg");
  await shoot({ width: 1200, height: 630 }, path.join(OUT, "og.png"), "png");
  if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await shoot({ width: 1440, height: 900 }, path.join(shotDir, "atlas-chrome.png"), "png", true); }
} finally {
  await browser.close();
  server.kill();
}
