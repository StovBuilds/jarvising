// POST /api/track — first-party, anonymous analytics collector (D1 `site_events`).
// The browser posts small batches of events from the same origin (see
// public/analytics.js); the fleet dashboard reads the aggregates back through
// /api/export-data.
//
// What is stored: event type, path, external referrer, a random per-tab session
// id, utm tags, a device bucket, the country Cloudflare reports, and a small
// props object. What is never stored: IP address, user agent, cookies. Our own
// traffic (fleet browsers, QA runs, curl) is dropped here, at the edge, so the
// numbers describe an audience rather than our automation.
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|gpt|claude|anthropic|perplexity|python-requests|python-httpx|curl\/|wget|node-fetch|undici|go-http-client|okhttp|playwright|puppeteer|jarvisfleet/i;
const INTERNAL_IPS = ['65.21.52.116', '2a01:4f9:c014:41c3'];
const ALLOWED_TYPES = new Set(['pageview', 'scroll', 'page_leave', 'outbound_click', 'cta_click']);
const MAX_BODY = 16_384;

const clip = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.SITE_EVENTS) return json({ ok: false, error: 'unavailable' }, 503);
  // Same-origin only: the page that loaded the tracker is the page that posts.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: 'forbidden' }, 403);
  const ip = (request.headers.get('cf-connecting-ip') || '').trim();
  if (BOT_RE.test(request.headers.get('user-agent') || '') || INTERNAL_IPS.some((p) => ip === p || ip.startsWith(p + ':'))) return json({ ok: true, stored: 0 });
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid' }, 400); }
  const raw = Array.isArray(body && body.events) ? body.events.slice(0, 20) : [];
  if (!raw.length) return json({ ok: false, error: 'invalid' }, 400);
  const cfCountry = request.cf && typeof request.cf.country === 'string' ? request.cf.country : request.headers.get('cf-ipcountry') || '';
  const country = /^[A-Za-z]{2}$/.test(cfCountry) ? cfCountry.toUpperCase() : '';
  const ts = new Date().toISOString();
  const rows = raw
    .filter((e) => e && typeof e === 'object' && ALLOWED_TYPES.has(String(e.type)))
    .map((e) => {
      const props = e.props && typeof e.props === 'object' && !Array.isArray(e.props)
        ? Object.fromEntries(Object.entries(e.props).slice(0, 12).map(([k, v]) => [k.slice(0, 40), typeof v === 'number' ? v : typeof v === 'boolean' ? v : clip(v, 200)]))
        : {};
      return [ts, clip(e.type, 40), clip(e.path, 300) || '/', clip(e.referrer, 300), clip(e.session_id, 64), clip(e.utm_source, 100), clip(e.utm_medium, 100), clip(e.utm_campaign, 100), clip(e.device, 20), country, JSON.stringify(props)];
    });
  if (!rows.length) return json({ ok: true, stored: 0 });
  const stmt = env.SITE_EVENTS.prepare('INSERT INTO site_events (ts,type,path,referrer,session_id,utm_source,utm_medium,utm_campaign,device,country,props) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  try { await env.SITE_EVENTS.batch(rows.map((r) => stmt.bind(...r))); } catch { return json({ ok: false, error: 'store_failed' }, 500); }
  return json({ ok: true, stored: rows.length });
}

export function onRequestGet() { return new Response(null, { status: 405, headers: { allow: 'POST' } }); }
