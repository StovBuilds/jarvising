// /mcp: read-only MCP server over the site's published pages (lib/mcp.ts, index built by
// tools/build-mcp-index.mjs). Shared template; the source of truth is guide-site-starter.
import { mcp, type McpEnv } from '../lib/mcp';

export const onRequest = async (ctx: { request: Request; env: McpEnv; waitUntil(p: Promise<unknown>): void }) => {
  const res = await mcp(ctx.request, ctx.env, ctx);
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
};
