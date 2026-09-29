#!/usr/bin/env node
// Render entry-002 imagery from the live piece:
//   public/projects/cortex/hero.jpg  (1600×900)
//   public/projects/cortex/og.png    (1200×630)
// Builds dist/, serves it with `vite preview`, and shoots the map on SwiftShader
// with the HUD hidden and the camera set to a three-quarter view of the table
// (through the ?probe=1 hook, which exposes the graph as window.__cortexGraph).
// The live stream runs for a few seconds first so some memories are mid-flash.
// Fictional demo data only, like the page itself.
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/projects/cortex");
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design", "package.json"))("playwright");

execFileSync("bun", ["run", "build"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
const port = 4700 + Math.floor(Math.random() * 100);
const server = spawn("bun", ["x", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("vite preview did not start")), 30000);
  server.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } });
});
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

const CAMERA = { x: 540, y: 400, z: 960 }, LOOK = { x: 0, y: 20, z: 60 };
async function shoot(vp, file, opts) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, colorScheme: "dark" });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`http://127.0.0.1:${port}/projects/cortex/live/?intro=0&probe=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__cortexProbe?.firstFrameMs != null, null, { timeout: 180000 });
  const nudge = async (n) => { for (let i = 0; i < n; i++) { await page.mouse.move(vp.width / 2 + (i % 2) * 4, 30); await page.waitForTimeout(1000); } };
  await nudge(6);
  await page.addStyleTag({ content: ".cx-bar,.cm-panel,.cm-controls,.cx-customise,.cx-selected,.scene-tooltip,.float-tooltip-kap,.scene-nav-info{display:none!important}" });
  await page.evaluate(([c, l]) => window.__cortexGraph().cameraPosition(c, l, 0), [CAMERA, LOOK]);
  await page.keyboard.press("l"); // the live stream: a few memories mid-flash
  await nudge(10);
  await page.screenshot({ path: path.join(OUT, file), ...opts, timeout: 180000 });
  console.log("wrote", file, Math.round(fs.statSync(path.join(OUT, file)).size / 1024), "kB");
  await page.close();
}
try {
  await shoot({ width: 1600, height: 900 }, "hero.jpg", { type: "jpeg", quality: 86 });
  await shoot({ width: 1200, height: 630 }, "og.png", { type: "png" });
} finally {
  await browser.close();
  server.kill();
}
