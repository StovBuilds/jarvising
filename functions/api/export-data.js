// GET /api/export-data?action=analytics|summary&days=30 — the fleet dashboard
// (jarvis.jstov.uk/analytics, via claude-web-api's SITE_DATA_JARVISING_*
// target) reads aggregates over D1 `site_events` with an x-api-key. Same
// contract as the other sites' export-data functions: `{ ok, analytics }`, the
// analytics object being the `site_analytics_summary` shape (totals, daily,
// top_paths, top_referrers, utm_sources, devices, countries, event_counts,
// ai_referrals, blog_posts) plus site-specific extras the dashboard ignores.
// Aggregates only — no row ever leaves with a session id.
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

const AI_REFERRER = [
  [/chatgpt\.com|chat\.openai\.com/i, 'ChatGPT'], [/perplexity\.ai/i, 'Perplexity'], [/claude\.ai/i, 'Claude'],
  [/(gemini|bard)\.google\.com/i, 'Gemini'], [/copilot\.microsoft\.com/i, 'Copilot'], [/chat\.mistral\.ai/i, 'Mistral'],
  [/grok\.com|x\.ai/i, 'Grok'], [/you\.com/i, 'You.com'], [/poe\.com/i, 'Poe'],
];
function assistantFor(referrer, utm) {
  for (const [re, name] of AI_REFERRER) if (re.test(referrer) || re.test(utm)) return name;
  return null;
}

export async function onRequestGet({ request, env }) {
  if (!env.EXPORT_API_KEY) return json({ ok: false, error: 'not_configured' }, 404);
  const key = request.headers.get('x-api-key') || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key || key.length !== env.EXPORT_API_KEY.length || key !== env.EXPORT_API_KEY) return json({ ok: false, error: 'unauthorised' }, 401);
  if (!env.SITE_EVENTS) return json({ ok: false, error: 'unavailable' }, 503);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'summary';
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days') || 30) || 30));
  if (action !== 'analytics' && action !== 'summary') return json({ ok: false, error: `Unknown action '${action}'. Use analytics | summary.` }, 400);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = env.SITE_EVENTS;
  const q = async (sql, ...binds) => (await db.prepare(sql).bind(...binds).all()).results;
  // "Engaged" = a session a person plausibly sat in, as opposed to a headless
  // scanner that loads the page, fires every scroll mark and leaves inside one
  // 2.5 s batch (most early sessions on the sister sites looked like that): a
  // second pageview, any interaction event, ≥5 s visible at page_leave, or
  // events spread ≥10 s apart. Counted per session, then per day, so the
  // dashboard can show visits next to hits.
  const ENGAGED = `SELECT session_id, substr(MIN(ts),1,10) AS date FROM site_events WHERE ts>=? AND session_id<>'' GROUP BY session_id
      HAVING SUM(type='pageview')>=2 OR SUM(type IN ('cta_click','outbound_click'))>0
          OR MAX(CASE WHEN type='page_leave' THEN json_extract(props,'$.seconds') END)>=5
          OR (julianday(MAX(ts))-julianday(MIN(ts)))*86400>=10`;
  const [totals, daily, topPaths, referrers, utms, devices, countries, eventCounts, entries, outbound, scroll, leave, aiRefs, ctas, kiosk, engaged, engagedDaily] = await Promise.all([
    q(`SELECT SUM(type='pageview') AS pageviews, COUNT(DISTINCT CASE WHEN session_id<>'' THEN session_id END) AS sessions, COUNT(*) AS events FROM site_events WHERE ts>=?`, since),
    q(`SELECT substr(ts,1,10) AS date, SUM(type='pageview') AS pageviews, COUNT(DISTINCT CASE WHEN session_id<>'' THEN session_id END) AS sessions FROM site_events WHERE ts>=? GROUP BY date ORDER BY date`, since),
    q(`SELECT path, COUNT(*) AS pageviews, COUNT(DISTINCT session_id) AS sessions FROM site_events WHERE ts>=? AND type='pageview' GROUP BY path ORDER BY pageviews DESC LIMIT 50`, since),
    q(`SELECT referrer, COUNT(*) AS pageviews FROM site_events WHERE ts>=? AND type='pageview' AND referrer<>'' GROUP BY referrer ORDER BY pageviews DESC LIMIT 30`, since),
    q(`SELECT utm_source AS source, COUNT(*) AS pageviews FROM site_events WHERE ts>=? AND type='pageview' AND utm_source<>'' GROUP BY utm_source ORDER BY pageviews DESC LIMIT 20`, since),
    q(`SELECT device, COUNT(*) AS pageviews FROM site_events WHERE ts>=? AND type='pageview' GROUP BY device ORDER BY pageviews DESC`, since),
    q(`SELECT country, COUNT(*) AS pageviews FROM site_events WHERE ts>=? AND type='pageview' GROUP BY country ORDER BY pageviews DESC LIMIT 30`, since),
    q(`SELECT type, COUNT(*) AS count FROM site_events WHERE ts>=? GROUP BY type ORDER BY count DESC`, since),
    // Entry pages (/projects/<slug>/) are this site's long-form content: views,
    // sessions, and how many sessions scrolled to the end (read_completes).
    q(`SELECT p.path, COUNT(*) AS pageviews, COUNT(DISTINCT p.session_id) AS sessions,
         (SELECT COUNT(DISTINCT s.session_id) FROM site_events s WHERE s.type='scroll' AND s.path=p.path AND s.ts>=? AND json_extract(s.props,'$.depth')>=100) AS read_completes
       FROM site_events p WHERE p.ts>=? AND p.type='pageview' AND json_extract(p.props,'$.kind')='entry' GROUP BY p.path ORDER BY pageviews DESC LIMIT 100`, since, since),
    q(`SELECT json_extract(props,'$.host') AS host, json_extract(props,'$.url') AS url, COUNT(*) AS clicks FROM site_events WHERE ts>=? AND type='outbound_click' GROUP BY host, url ORDER BY clicks DESC LIMIT 50`, since),
    q(`SELECT json_extract(props,'$.depth') AS depth, COUNT(*) AS count FROM site_events WHERE ts>=? AND type='scroll' GROUP BY depth ORDER BY depth`, since),
    q(`SELECT COUNT(*) AS n, AVG(json_extract(props,'$.seconds')) AS avg_seconds, AVG(json_extract(props,'$.max_depth')) AS avg_max_depth FROM site_events WHERE ts>=? AND type='page_leave'`, since),
    q(`SELECT ts, path, referrer, utm_source FROM site_events WHERE ts>=? AND type='pageview' AND (referrer<>'' OR utm_source<>'') ORDER BY ts DESC LIMIT 500`, since),
    // Calls to action: entry cards on the home page, "open the live piece" links.
    q(`SELECT json_extract(props,'$.target') AS target, json_extract(props,'$.from') AS from_kind, COUNT(*) AS clicks FROM site_events WHERE ts>=? AND type='cta_click' GROUP BY target, from_kind ORDER BY clicks DESC LIMIT 50`, since),
    // Kiosk (exhibition) boots of the live piece, kept apart from web visits.
    q(`SELECT COUNT(*) AS n FROM site_events WHERE ts>=? AND type='pageview' AND json_extract(props,'$.kiosk')=1`, since),
    q(`SELECT COUNT(*) AS n FROM (${ENGAGED})`, since),
    q(`SELECT date, COUNT(*) AS engaged_sessions FROM (${ENGAGED}) GROUP BY date ORDER BY date`, since),
  ]);
  const ai_referrals = aiRefs
    .map((r) => ({ assistant: assistantFor(r.referrer, r.utm_source), ts: r.ts, path: r.path, referrer: r.referrer, utm_source: r.utm_source }))
    .filter((r) => r.assistant)
    .slice(0, 200);
  const t = totals[0] || {};
  const engagedByDate = new Map(engagedDaily.map((r) => [r.date, Number(r.engaged_sessions || 0)]));
  const analytics = {
    days, generated_at: new Date().toISOString(),
    totals: { pageviews: Number(t.pageviews || 0), sessions: Number(t.sessions || 0), events: Number(t.events || 0), engaged_sessions: Number((engaged[0] || {}).n || 0) },
    daily: daily.map((d) => ({ ...d, engaged_sessions: engagedByDate.get(d.date) || 0 })), top_paths: topPaths, top_referrers: referrers, utm_sources: utms, devices, countries, event_counts: eventCounts,
    ai_referrals, blog_posts: entries,
    // jarvising-specific extras (the dashboard ignores what it does not know)
    outbound_clicks: outbound, scroll_depth: scroll,
    reading: { page_leaves: Number((leave[0] || {}).n || 0), avg_visible_seconds: Math.round(Number((leave[0] || {}).avg_seconds || 0)), avg_max_depth: Math.round(Number((leave[0] || {}).avg_max_depth || 0)) },
    cta_clicks: ctas, kiosk_boots: Number((kiosk[0] || {}).n || 0),
  };
  if (action === 'analytics') return json({ ok: true, site: 'jarvising', action, analytics });
  return json({ ok: true, site: 'jarvising', action, days, analytics, recent_posts: [], subscribers: null });
}

export function onRequestPost() { return new Response(null, { status: 405, headers: { allow: 'GET' } }); }
