/* jarvising.com: first-party, anonymous page counts. No cookies, no IP, no
   user agent, no third parties. A random per-tab id in sessionStorage groups
   one visit's events and is gone when the tab closes. Honours Global Privacy
   Control, Do Not Track and the opt-out switch in the home page footer.
   Batches land at /api/track on this origin (functions/api/track.js); the
   fleet dashboard reads aggregates back through /api/export-data. Every call
   is fail-silent, so an offline kiosk just drops its events. */
(function () {
  var OPT_OUT = 'analytics_opt_out', queue = [], timer = 0;
  function enabled() {
    try { return !(navigator.globalPrivacyControl || navigator.doNotTrack === '1' || localStorage.getItem(OPT_OUT) === '1'); } catch (e) { return true; }
  }
  function sid() { try { var s = sessionStorage.getItem('jv_sid'); if (!s) { s = crypto.randomUUID(); sessionStorage.setItem('jv_sid', s); } return s; } catch (e) { return ''; } }
  function referrer() { try { if (sessionStorage.getItem('jv_ref') === '1') return ''; sessionStorage.setItem('jv_ref', '1'); var r = document.referrer; return r && new URL(r).host !== location.host ? r : ''; } catch (e) { return ''; } }
  function utm(k) { try { return new URLSearchParams(location.search).get(k) || ''; } catch (e) { return ''; } }
  function flush(beacon) {
    if (!queue.length) return;
    var body = JSON.stringify({ events: queue.splice(0, 20) });
    try {
      if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      else fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  function track(type, props, beacon) {
    if (!enabled()) return;
    queue.push({ type: type, path: location.pathname, referrer: type === 'pageview' ? referrer() : '', session_id: sid(), utm_source: utm('utm_source'), utm_medium: utm('utm_medium'), utm_campaign: utm('utm_campaign'), device: innerWidth < 768 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop', props: props || {} });
    if (beacon) { clearTimeout(timer); timer = 0; flush(true); return; }
    if (!timer) timer = setTimeout(function () { timer = 0; flush(); }, 2500);
  }

  // Page kind from the path: home, an entry page, or an entry's live piece.
  var path = location.pathname;
  var kind = path === '/' ? 'home' : /^\/projects\/[^/]+\/live\//.test(path) ? 'live' : /^\/projects\/[^/]+\/$/.test(path) ? 'entry' : 'page';
  var kiosk = false;
  try { kiosk = kind === 'live' && new URLSearchParams(location.search).get('kiosk') === '1'; } catch (e) {}
  track('pageview', kiosk ? { kind: kind, kiosk: true } : { kind: kind });

  // Scroll depth: 25/50/75/100 once each per page. On a live piece, scroll is
  // the story's progress, so this doubles as "how far into the teardown".
  var maxDepth = 0, sent = {};
  function depth() {
    var doc = document.documentElement, total = doc.scrollHeight - innerHeight;
    var d = total <= 0 ? 100 : Math.min(100, Math.round(((scrollY + innerHeight) / doc.scrollHeight) * 100));
    if (d > maxDepth) maxDepth = d;
    [25, 50, 75, 100].forEach(function (m) { if (d >= m && !sent[m]) { sent[m] = 1; track('scroll', { depth: m, kind: kind }); } });
  }
  addEventListener('scroll', function () { requestAnimationFrame(depth); }, { passive: true });
  // Live pieces mount after load, so measure once the page has its height.
  if (kind === 'live') addEventListener('load', function () { setTimeout(depth, 1500); }); else depth();

  // Visible time on the page, sent once when the visitor leaves.
  var visibleSince = document.visibilityState === 'visible' ? Date.now() : 0, visible = 0, left = false;
  function leave() { if (left) return; left = true; if (visibleSince) visible += Date.now() - visibleSince; track('page_leave', { seconds: Math.round(visible / 1000), max_depth: maxDepth, kind: kind }, true); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { if (visibleSince) visible += Date.now() - visibleSince; visibleSince = 0; leave(); } else visibleSince = Date.now(); });
  addEventListener('pagehide', leave);

  // Clicks: into an entry or its live piece (cta_click), and outbound links
  // (host + path only). Beaconed, because the page is leaving.
  document.addEventListener('click', function (event) {
    var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!a) return;
    var u; try { u = new URL(a.href); } catch (e) { return; }
    if (u.host !== location.host) { if (/^https?:$/.test(u.protocol)) track('outbound_click', { host: u.host, url: u.pathname.slice(0, 120), from: kind }, true); return; }
    if (/^\/projects\//.test(u.pathname) && u.pathname !== location.pathname) track('cta_click', { target: u.pathname, from: kind, text: (a.textContent || '').trim().slice(0, 60) }, true);
  }, { capture: true });

  // Opt-out switch in the home page footer.
  var opt = document.querySelector('[data-analytics-optout]');
  if (opt) {
    var render = function () { var off = false; try { off = localStorage.getItem(OPT_OUT) === '1'; } catch (e) {} opt.textContent = off ? 'Page counts are off for this browser. Switch back on' : 'Switch page counts off for this browser'; opt.setAttribute('aria-pressed', off ? 'true' : 'false'); };
    opt.addEventListener('click', function () { try { localStorage.getItem(OPT_OUT) === '1' ? localStorage.removeItem(OPT_OUT) : localStorage.setItem(OPT_OUT, '1'); } catch (e) {} render(); });
    opt.hidden = false;
    render();
  }
})();
