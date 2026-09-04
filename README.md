# jarvising.com

**jarvising** (verb): 1. The act of creating innovative projects at scale.
2. Giving people the tools to do it themselves.

An open portfolio of test projects, published as they are built. Right now this
repo is the holding page: a single dictionary-entry landing page, no framework,
no third-party requests.

```
public/            the site (static). index.html, fonts, og.png, robots, sitemap, llms.txt
functions/         Cloudflare Pages Functions: _middleware.js = canonical-host 301
tools/             render-og.mjs regenerates og.png + apple-touch-icon.png from tools/og.html
```

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
