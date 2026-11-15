// /.well-known/ must never answer with the app page (Pages falls back to index.html for any
// unknown path). A personal agent refuses /.well-known/poppy.json if
// /.well-known/oauth-protected-resource is not a 404 or JSON (Poppy spec 3.2).
import { expect, test } from "bun:test";
// @ts-ignore -- plain JS Pages Function
import { onRequest } from "../functions/_middleware.js";

const SHELL = "<!doctype html><html><body><div id=\"root\"></div></body></html>";
const html = () => new Response(SHELL, { headers: { "content-type": "text/html; charset=utf-8" } });
const json = () => new Response("{}", { headers: { "content-type": "application/json" } });
const run = (url: string, next: () => Response) => onRequest({ request: new Request(url), next: async () => next() });

test("an unknown /.well-known/ path is a real 404, not the app page", async () => {
  const res = await run("https://jarvising.com/.well-known/oauth-protected-resource", html);
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).not.toContain("text/html");
});

test("a real /.well-known/ file passes through", async () => {
  const res = await run("https://jarvising.com/.well-known/poppy.json", json);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/json");
});

test("other paths still get the app page", async () => {
  const res = await run("https://jarvising.com/nonexistent", html);
  expect(res.status).toBe(200);
  expect(await res.text()).toBe(SHELL);
});

test("non-canonical hosts still redirect", async () => {
  const res = await run("https://www.jarvising.com/.well-known/poppy.json", json);
  expect(res.status).toBe(301);
});
