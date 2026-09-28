-- First-party, anonymous site events (D1 `jarvising-events`, binding SITE_EVENTS).
-- No IP, no user agent, no cookie: session_id is a random per-tab value the
-- browser forgets when the tab closes. Read by /api/export-data for the fleet
-- dashboard (jarvis.jstov.uk/analytics). Applied 2026-09-28 via the D1 query API.
CREATE TABLE IF NOT EXISTS site_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  props TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_site_events_ts ON site_events(ts);
CREATE INDEX IF NOT EXISTS idx_site_events_type_ts ON site_events(type, ts);
