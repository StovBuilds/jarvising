#!/usr/bin/env node
// Screenshot the live piece at pinned progress values on SwiftShader.
//   node tools/qa-shots.mjs --p 0.3,0.5,0.66 --out /tmp/dir [--w 1440 --h 900]
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design", "package.json"))("playwright");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const ps = arg("--p", "0.3").split(",").map(Number);
const out = arg("--out", "/tmp"); fs.mkdirSync(out, { recursive: true });
const W = +arg("--w", 1440), H = +arg("--h", 900);
const port = 4400 + Math.floor(Math.random() * 100);
const server = spawn("bun", ["x", "vite", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("vite did not start")), 30000); server.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } }); });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, colorScheme: "dark" });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  for (const p of ps) {
    await page.goto(`http://127.0.0.1:${port}/projects/enigma/live/?p=${p}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".en-readout", { timeout: 120000 });
    await page.mouse.move(W / 2, H / 2);
    await page.waitForTimeout(5000);
    const f = path.join(out, `p${String(p).replace(".", "_")}.png`);
    await page.screenshot({ path: f, timeout: 120000 });
    console.log("wrote", f);
  }
} finally { await browser.close(); server.kill(); }
