# jarvising.com

**jarvising** (verb): 1. The act of creating innovative projects at scale.
2. Giving people the tools to do it themselves.

An open portfolio of test projects, published as they are built. The home page
is the dictionary entry; each project is an entry page plus a live piece. No
third-party requests anywhere (fonts self-hosted; analytics are anonymous
first-party page counts, no cookies, no third parties; see [Analytics](#analytics)).

Public repo (2026-09-07): the site says "how to make your own", so the source is
here to read. Live at [jarvising.com](https://jarvising.com/).

```
index.html                    the holding page (hand-written HTML; only script is /analytics.js)
projects/<slug>/index.html    entry page: what it does / how it was made / how to make your own
projects/<slug>/live/         the live piece (mounts a React/three bundle from src/<slug>/)
src/<slug>/                   the piece's TypeScript
public/                       static: fonts, og images, _headers, robots, sitemap, llms.txt,
                              projects/<slug>/{hero.jpg,og.png}
functions/_middleware.js      Cloudflare Pages Function: canonical-host 301
functions/api/track.js        POST: first-party analytics collector (D1 `jarvising-events`)
functions/api/export-data.js  GET: aggregates for the Jarvis dashboard (x-api-key)
migrations/                   D1 schema (site_events)
tools/                        render-og.mjs (site OG), render-enigma.mjs (entry 001 imagery + smoke test),
                              qa-shots.mjs (pinned-progress screenshots, any live page), optimize-glb.mjs,
                              brand-scrub.mjs (CI gate: entry 003 names no manufacturer or product),
                              render-build-frames.mjs (an entry's build replayed: the piece rebuilt at
                              real commits, shot at a pinned ?p=, + manifest; config in build-frames/),
                              measure-rig.mjs (home-page test-rig strips → public/projects/rig.json),
                              blender/*.py (parametric assets → public/models/*.glb via ~/bin/blender-run.mjs)
```

Vite multi-page build (`vite.config.ts` lists every HTML entry). The hand-written
pages are progressive: they read fully with no JS, and load only small vanilla modules on top.
Every page loads `/analytics.js` (the anonymous tracker) and `public/motion/early.js` + `transitions.css`
(ink-bleed View Transitions, and the once-per-browser hot-metal headword). The home page also loads
`src/home/exploded.ts` (the "anatomy" section) and `src/home/rig.ts` (test-rig strips). Entry pages load
`src/entry/scrubber.ts` (the "Etymology" build replay, which reads `public/projects/<slug>/build/manifest.json`).
Only `live/` pages load a React/three bundle. Every motion honours `prefers-reduced-motion`, and the CSP forbids
inline scripts, so none are used. The full motion menu is in `docs/motion-directions.md`. `bun run typecheck`
is strict TS.

## Entries

| # | Slug | What | Origin |
|---|---|---|---|
| 001 | `enigma` | Scroll-driven procedural Three.js teardown of the Enigma I, ending in a faithful typeable machine | ported from `jstov/src/pages/lab/Enigma.tsx` (lab experiment 008, 2026-08-27); links changed, nothing else |
| 003 | `rig` | Inside the Rig: scroll from inside the processor out to a flagship-class gaming PC, then an exploded, searchable atlas of 104 pieces | ported from jstov.uk lab page 011 (2026-09-07/08) with every brand removed; `tools/brand-scrub.mjs` keeps it that way in CI |

Adding an entry: copy `projects/enigma/` (entry page + live shell), put the code
in `src/<slug>/`, add both HTML files to `rollupOptions.input`, render
`public/projects/<slug>/{hero.jpg,og.png}`, add the card to the home page's
"See also" block, and add both URLs to `public/sitemap.xml` + `public/llms.txt`
(CI checks every sitemap URL has a built page).

## Hosting

| Host | Serves | Notes |
|---|---|---|
| `jarvising.com` | the site (canonical) | Cloudflare Pages project `jarvising`, production branch `main` |
| `www.jarvising.com` | 301 → apex | via `functions/_middleware.js` |
| `jarvising.pages.dev` | 301 → apex | branch previews (`<branch>.jarvising.pages.dev`) stay |

Domain is registered at **Cloudflare Registrar** (not GoDaddy) and the zone
lives in the main Cloudflare account. DNS: proxied CNAMEs for apex + `www` →
`jarvising.pages.dev`. Always Use HTTPS is on.

## Deploying

**Not git-connected**, like the rest of the fleet: a push alone ships nothing.
The VPS cron `*/10 ~/bin/pages-deploy-all.sh` sweeps this repo with
`--if-changed`, builds `origin/main` in a throwaway worktree (`bun run build`
= copy `public/` → `dist/`) and runs `wrangler pages deploy dist --branch main`.
So: commit, push, wait ≤10 min, verify on the live domain.

Manual deploy when you cannot wait:

```bash
~/bin/pages-deploy.sh jarvising
```

`--branch main` is not optional on a hand-run `wrangler pages deploy`: any other
branch name lands on a preview alias and production never changes.

## Kiosk / exhibition mode (entry 001)

`https://jarvising.com/projects/enigma/live/?kiosk=1` runs the Enigma piece
unattended: attract loop (film on idle, reset after a quiet minute),
touch-first controls, no links out, fullscreen + wake-lock on first touch, and
a service worker (`public/sw.js`, kiosk-only) so it survives a dropped network.
`&idle=<seconds>` shortens the idle threshold for testing; `&p=0.42` pins
progress for setup. Launch with a kiosk browser, e.g.

```bash
chromium --kiosk --noerrdialogs --disable-infobars --autoplay-policy=no-user-gesture-required \
  "https://jarvising.com/projects/enigma/live/?kiosk=1"
```

## Analytics

Anonymous, first-party page counts, no cookies, no third parties, nothing to
consent to. `public/analytics.js` (loaded `defer` on every page) posts small
batches to `/api/track` on the same origin: event type (pageview, scroll depth,
page_leave with visible seconds, clicks into an entry, outbound host + path), the
path, the first external referrer, utm tags, a device bucket and a random per-tab
id held in `sessionStorage`. The collector adds the country Cloudflare reports and
never stores IP or user agent. It drops bots, headless browsers and the fleet VPS's
own IP by design, so a request from the VPS answers `stored: 0`. Global Privacy
Control, Do Not Track and the opt-out button in the home page footer
(`localStorage.analytics_opt_out`) all switch it off. Kiosk boots are tagged
`kiosk: true`; offline, events are simply dropped.

Storage is D1 `jarvising-events` (binding `SITE_EVENTS`, schema in
`migrations/`), bound on the Pages project with the `EXPORT_API_KEY` secret. The
Jarvis dashboard (jarvis.jstov.uk/analytics) reads
`/api/export-data?action=analytics&days=N` through claude-web-api's
`SITE_DATA_JARVISING_*` target.

## Regenerating the social image

```bash
node tools/render-og.mjs                 # og.png + apple-touch-icon.png
node tools/render-og.mjs --shot /tmp/j.png   # also desktop/mobile page screenshots
```

Uses the Playwright install in `~/repos/claude-design` (override with
`PLAYWRIGHT_ROOT`).

## Fonts

`public/fonts/*.woff2` are Google Fonts' own per-subset variable builds of
Fraunces and Inter (both SIL OFL), copied from the forematter holding page.
Self-hosted so the page makes no third-party requests.

## Adding projects

Each portfolio entry should show what it does, how it was made, and how to
make your own. Structure for that (per-project pages, an index) is the next
step; the "See also" block on the holding page is where the index will live.

## Licence

Code is [MIT](LICENSE). The bundled fonts (Fraunces, Inter, Space Grotesk,
JetBrains Mono, Special Elite) are under the SIL Open Font License and keep
their own terms.
