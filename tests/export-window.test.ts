// export-data time-range mode: ?from=&to= (ISO) alongside the rolling ?days=.
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore -- plain JS Pages Function
import { onRequestGet } from "../functions/api/export-data.js";

const KEY = "k";
function makeEnv(rows: [string, string, string, string][]) {
  const sqlite = new Database(":memory:");
  sqlite.run(readFileSync(join(import.meta.dir, "../migrations/0001_site_events.sql"), "utf8"));
  for (const [ts, type, session, path] of rows)
    sqlite.run("INSERT INTO site_events (ts,type,path,session_id) VALUES (?,?,?,?)", [ts, type, path, session]);
  const SITE_EVENTS = {
    prepare: (sql: string) => ({
      bind: (...b: unknown[]) => ({ all: async () => ({ results: sqlite.query(sql).all(...(b as any[])) }) }),
    }),
  };
  return { EXPORT_API_KEY: KEY, SITE_EVENTS };
}
async function get(env: any, qs: string) {
  const res = await onRequestGet({
    request: new Request(`https://x.test/api/export-data?${qs}`, { headers: { "x-api-key": KEY } }),
    env,
  });
  return { status: res.status, body: (await res.json()) as any };
}

const rows: [string, string, string, string][] = [
  ["2026-10-01T09:59:59.999Z", "pageview", "a", "/before"],
  ["2026-10-01T10:00:00.000Z", "pageview", "a", "/in1"], // == from: included
  ["2026-10-01T10:30:00.000Z", "pageview", "b", "/in2"],
  ["2026-10-01T11:15:00.000Z", "pageview", "b", "/in3"],
  ["2026-10-01T12:00:00.000Z", "pageview", "c", "/at-to"], // == to: excluded
];

test("without from: rolling window, no range/hourly", async () => {
  const now = new Date().toISOString();
  const { status, body } = await get(makeEnv([[now, "pageview", "s", "/now"]]), "action=analytics&days=7");
  expect(status).toBe(200);
  expect(body.analytics.days).toBe(7);
  expect(body.analytics.totals.pageviews).toBe(1);
  expect("range" in body.analytics).toBe(false);
  expect("hourly" in body.analytics).toBe(false);
});

test("from/to is half-open and adds range + hourly", async () => {
  const { status, body } = await get(makeEnv(rows), "action=analytics&from=2026-10-01T10:00:00Z&to=2026-10-01T12:00:00Z");
  expect(status).toBe(200);
  const a = body.analytics;
  expect(a.range).toEqual({ from: "2026-10-01T10:00:00.000Z", to: "2026-10-01T12:00:00.000Z" });
  expect(a.days).toBe(1);
  expect(a.totals.pageviews).toBe(3);
  expect(a.totals.sessions).toBe(2);
  expect(a.top_paths.map((p: any) => p.path).sort()).toEqual(["/in1", "/in2", "/in3"]);
  expect(a.hourly).toEqual([
    { hour: "2026-10-01T10:00:00Z", pageviews: 2, sessions: 2 },
    { hour: "2026-10-01T11:00:00Z", pageviews: 1, sessions: 1 },
  ]);
  expect(a.daily.length).toBe(1);
});

test("summary honours the window; >7 day window has no hourly", async () => {
  const { body } = await get(makeEnv(rows), "action=summary&from=2026-09-01T00:00:00Z&to=2026-10-01T11:00:00Z");
  expect(body.days).toBe(31);
  expect(body.analytics.totals.pageviews).toBe(3);
  expect("hourly" in body.analytics).toBe(false);
});

test("to defaults to now", async () => {
  const from = new Date(Date.now() - 3600_000).toISOString();
  const now = new Date(Date.now() - 1000).toISOString();
  const { body } = await get(makeEnv([[now, "pageview", "s", "/now"]]), `action=analytics&from=${from}`);
  expect(body.analytics.totals.pageviews).toBe(1);
  expect(body.analytics.hourly.length).toBeGreaterThan(0);
});

test("invalid ranges are 400", async () => {
  const env = makeEnv([]);
  for (const qs of [
    "from=nope",
    "from=2026-10-01T00:00:00Z&to=nope",
    "from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z",
    "from=2026-10-01T00:00:00Z&to=2026-10-01T00:00:00Z",
    "from=2025-01-01T00:00:00Z&to=2026-10-01T00:00:00Z",
  ]) {
    const { status, body } = await get(env, `action=analytics&${qs}`);
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  }
});
