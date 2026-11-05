// IndexNow: tell Bing (and the other IndexNow engines) that every URL in the
// sitemap may have changed. ChatGPT search and Copilot lean on Bing's index;
// Google ignores IndexNow (Search Console covers it).
// Run after a deploy (~/bin/pages-deploy.sh POSTDEPLOY) or by hand:
//   node tools/indexnow.mjs
// The key is public by design: <KEY>.txt is served at the site root so the
// engines can check we own the host.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "jarvising.com";
const KEY = "9f24eb24da81ab254b1cb815925674ee";
// The freshly built sitemap, if the build writes one; right after a deploy the
// live copy can still be the previous version for a minute.
const LOCAL = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

async function read(name) {
  const local = join(LOCAL, name);
  if (existsSync(local)) return readFileSync(local, "utf8");
  const res = await fetch(`https://${HOST}/${name}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${name} → ${res.status}`);
  return res.text();
}

// Follows a sitemap index one level down (Astro writes sitemap-index.xml → sitemap-0.xml).
async function urls(name) {
  const xml = await read(name);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (!/<sitemapindex/.test(xml)) return locs;
  const out = [];
  for (const loc of locs) out.push(...(await urls(new URL(loc).pathname.slice(1))));
  return out;
}

const key = await fetch(`https://${HOST}/${KEY}.txt`, { signal: AbortSignal.timeout(20_000) })
  .then((r) => r.text()).catch(() => "");
if (key.trim() !== KEY) throw new Error(`https://${HOST}/${KEY}.txt is not live yet; deploy first`);

const urlList = [...new Set(await urls("sitemap.xml"))].filter((u) => new URL(u).hostname === HOST);
if (!urlList.length) throw new Error("no URLs in the sitemap");

let failed = false;
for (let i = 0; i < urlList.length; i += 10_000) {
  const batch = urlList.slice(i, i + 10_000);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: batch }),
    signal: AbortSignal.timeout(30_000),
  });
  // 200 = accepted, 202 = accepted with the key still being checked: both are success.
  // A brand-new key can 403 SiteVerificationNotCompleted for a few minutes; rerun later.
  console.log(`${HOST}: submitted ${batch.length} URLs → HTTP ${res.status}`);
  if (res.status >= 400) { console.error(await res.text()); failed = true; }
}
if (failed) process.exitCode = 1;
