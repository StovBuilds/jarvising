#!/usr/bin/env node
// Render entry-004 imagery from the live piece (Vite dev server, SwiftShader), in a pinned,
// frozen state: the boat just above the layer, framed by cinematic shot 3, the escort's ping
// passing over the hull.
//   public/projects/submarine/hero.jpg  (1600×900, no interface)
//   public/projects/submarine/og.png    (1200×630, the title only)
//   node tools/render-submarine.mjs [--qs "depth=110&ping=0.58&shot=3"]
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/projects/submarine");
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design", "package.json"))("playwright");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const QS = arg("--qs", "depth=110&ping=0.58&shot=3");

const port = 4300 + Math.floor(Math.random() * 100);
const server = spawn("bun", ["x", "vite", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("vite did not start")), 30000);
  server.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } });
});
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const HIDE = {
  hero: ".ui, #labels { display: none !important; }",
  og: ".console, .keys, .tools, .lede, .read, .status, #labels { display: none !important; } .ui::before { opacity: .8; }",
};

async function shoot(vp, file, type, hide) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, colorScheme: "dark" });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.route("**/motion/transitions.css", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(`http://127.0.0.1:${port}/projects/submarine/live/?${QS}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("#loader.gone", { timeout: 240000 });
  await page.addStyleTag({ content: hide });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: file, type, ...(type === "jpeg" ? { quality: 86 } : {}), timeout: 240000 });
  console.log("wrote", path.relative(ROOT, file));
  await page.close();
}

try {
  await shoot({ width: 1600, height: 900 }, path.join(OUT, "hero.jpg"), "jpeg", HIDE.hero);
  await shoot({ width: 1200, height: 630 }, path.join(OUT, "og.png"), "png", HIDE.og);
} finally {
  await browser.close();
  server.kill();
}
