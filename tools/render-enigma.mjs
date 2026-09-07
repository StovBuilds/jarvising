#!/usr/bin/env node
// Render entry-001 imagery from the live piece and smoke-test it headlessly.
//   public/projects/enigma/hero.jpg  (1600×900, the exploded assembly)
//   public/projects/enigma/og.png    (1200×630)
// plus QA screenshots of the entry + home pages when --shot <dir> is given.
//
// Runs the Vite dev server (serves public/ and compiles src/ on the fly, so no
// rebuild is needed between renders) and Chromium on SwiftShader — WebGL in
// software renders at seconds per frame, which is why the piece has a `?p=`
// parameter that pins scroll progress instead of easing toward it.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/projects/enigma");
fs.mkdirSync(OUT, { recursive: true });
const PW_ROOT = process.env.PLAYWRIGHT_ROOT ?? "/home/jack/repos/claude-design";
const { chromium } = createRequire(path.join(PW_ROOT, "package.json"))("playwright");

const shotIdx = process.argv.indexOf("--shot");
const shotDir = shotIdx > -1 ? process.argv[shotIdx + 1] : null;
const port = 4300 + Math.floor(Math.random() * 100);
const base = `http://127.0.0.1:${port}`;

const server = spawn("bun", ["x", "vite", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
  cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("vite did not start")), 30000);
  server.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); resolve(); } });
  server.stderr.on("data", (d) => process.stderr.write(d));
});

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const live = async (p, vp) => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, colorScheme: "dark" });
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    await page.goto(`${base}/projects/enigma/live/?p=${p}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".en-readout", { timeout: 120000 });
    await page.waitForTimeout(6000); // a few software-GL frames so callouts/lamps settle
    return page;
  };

  const hero = await live(0.31, { width: 1600, height: 900 });
  await hero.mouse.move(800, 450);
  await hero.waitForTimeout(2500);
  await hero.screenshot({ path: path.join(OUT, "hero.jpg"), type: "jpeg", quality: 86, timeout: 120000 });
  console.log("wrote hero.jpg");
  await hero.close();

  const og = await live(0.31, { width: 1200, height: 630 });
  await og.screenshot({ path: path.join(OUT, "og.png"), type: "png", timeout: 120000 });
  console.log("wrote og.png");
  await og.close();

  // smoke test: the simulator beat must accept keypresses and light lamps
  const sim = await live(1, { width: 1280, height: 800 });
  const result = await sim.evaluate(async () => {
    const api = window.__enigma;
    for (const ch of "HELLO") api.press(ch);
    await new Promise((r) => setTimeout(r, 400));
    const outRow = document.querySelector(".en-tape-out");
    return {
      progress: api.progress(),
      tapeOut: outRow ? outRow.textContent : null,
      windows: document.querySelector(".en-windows")?.dataset.pos,
      trace: api.trace(),
    };
  });
  console.log("sim smoke:", JSON.stringify(result));
  if (!result.tapeOut || result.tapeOut.length !== 5 || /[HELO]{5}/.test(result.tapeOut) && result.tapeOut === "HELLO") {
    throw new Error("simulator did not encrypt: " + JSON.stringify(result));
  }
  if (shotDir) await sim.screenshot({ path: path.join(shotDir, "enigma-live-sim.png"), timeout: 120000 });
  await sim.close();

  if (shotDir) {
    for (const [name, url, vp, scheme] of [
      ["entry-desktop", "/projects/enigma/", { width: 1280, height: 900 }, "light"],
      ["entry-mobile", "/projects/enigma/", { width: 390, height: 844 }, "dark"],
      ["home-desktop", "/", { width: 1280, height: 900 }, "light"],
    ]) {
      const p = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, colorScheme: scheme });
      await p.goto(`${base}${url}`, { waitUntil: "networkidle" });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(900);
      await p.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
      console.log("wrote", name);
      await p.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
