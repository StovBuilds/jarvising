// Kiosk service worker for /projects/enigma/live/ — keeps the piece running
// when a gallery network drops. Registered ONLY in ?kiosk=1 mode (Enigma.tsx),
// so ordinary visitors get no caching layer.
//
// Strategy:
//   • navigations: network first, cached shell on failure
//   • /assets/, /fonts/, /models/: cache first (hashed / immutable), revalidate
//     in the background so a redeploy is picked up on the next idle reload
//   • on activate: crawl the live page for its <script>/<link> assets and the
//     CSS for its font urls, and warm the cache with them + the three models
const CACHE = "enigma-kiosk-v1";
const SHELL = "/projects/enigma/live/";
const MODELS = ["/models/enigma.glb", "/models/bombe.glb", "/models/props.glb"];

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    await self.clients.claim();
    const cache = await caches.open(CACHE);
    try {
      const shell = await fetch(SHELL + "?kiosk=1", { cache: "no-cache" });
      const html = await shell.clone().text();
      await cache.put(SHELL, shell);
      const urls = new Set(MODELS);
      for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+|\/fonts\/[^"]+|\/favicon\.svg)"/g)) urls.add(m[1]);
      const cssUrls = [...urls].filter((u) => u.endsWith(".css"));
      for (const css of cssUrls) {
        const r = await fetch(css).catch(() => null);
        if (!r) continue;
        await cache.put(css, r.clone());
        for (const m of (await r.text()).matchAll(/url\((\/assets\/[^)]+)\)/g)) urls.add(m[1]);
      }
      await Promise.all([...urls].map(async (u) => {
        if (await cache.match(u)) return;
        const r = await fetch(u).catch(() => null);
        if (r && r.ok) await cache.put(u, r);
      }));
    } catch { /* offline at activate — fine, we cache as we go */ }
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(SHELL, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(SHELL)) || Response.error();
      }
    })());
    return;
  }

  if (/^\/(assets|fonts|models)\//.test(url.pathname) || url.pathname === "/favicon.svg") {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const revalidate = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(revalidate); return hit; }
      const r = await revalidate;
      return r || Response.error();
    })());
  }
});
