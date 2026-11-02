// Read-only remote MCP server for the site's published pages (POST /mcp, Streamable HTTP,
// stateless JSON responses, no key). Generic: everything it knows comes from
// dist/mcp-index.json, which tools/build-mcp-index.mjs builds from the sitemap and the
// pages' Markdown twins, so a page an agent can find is a page the site already publishes.
//   GET  /mcp   a JSON card describing the server (also at /.well-known/mcp.json)
//   POST /mcp   JSON-RPC: initialize, tools/list, tools/call (search_site, get_page, list_pages)
// Each tools/call is logged to site_events as type 'mcp_call' with the tool name and a coarse
// client label (never the user agent, IP or the query text); fleet traffic is skipped.
// Shared across the fleet: the source of truth is guide-site-starter; copy, don't fork.

type Ctx = { waitUntil(promise: Promise<unknown>): void } | undefined;
export interface McpEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SITE_URL: string;
  EVENTS?: D1Database;
  DB?: D1Database;
  SITE_EVENTS?: D1Database;
}

interface Page { path: string; url: string; section: string; title: string; description: string; updated: string | null; headings: string[]; markdown: string | null; html?: string | null; fields: Record<string, string>; text: string }
interface Index { version: number; built: string; postings: Record<string, number[]>; site: { title: string; description: string; origin: string; endpoint: string }; pages: Page[] }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, accept, mcp-protocol-version, mcp-session-id', 'Access-Control-Expose-Headers': 'mcp-session-id' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const MAX_MARKDOWN = 60_000;

// One parse per isolate; a deploy brings a new isolate and so a new index.
let cached: Promise<Index> | null = null;
function loadIndex(env: McpEnv, request: Request): Promise<Index> {
  cached ??= env.ASSETS.fetch(new Request(new URL('/mcp-index.json', request.url))).then(async r => {
    if (!r.ok) throw new Error(`index unavailable (${r.status})`);
    return await r.json() as Index;
  }).catch(e => { cached = null; throw e; });
  return cached;
}

// ── search ────────────────────────────────────────────────────────────────────
// Tokeniser: must match tools/build-mcp-index.mjs.
const STOP = new Set('a an and are as at be by can could do does for from how i if in into is it its me my of on or should that the this to use using was what when where which who why will with you your'.split(' '));
const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? [];
const stem = (w: string) => w.length > 4 ? w.replace(/(ies|es|s|ing|ed)$/, '') : w;
const terms = (q: string) => [...new Set(words(q).filter(w => !STOP.has(w)).map(stem))];

// Scores come precomputed from the build (postings: term → [page index, score, …]); rarer
// words count for more, so "cv" outweighs "chatgpt" on a site about ChatGPT.
function search(ix: Index, qs: string[], phrase: string, allowed: Set<number> | null): { i: number; s: number }[] {
  const total = new Map<number, number>(), matched = new Map<number, number>();
  for (const q of qs) {
    const post = Object.hasOwn(ix.postings, q) ? ix.postings[q] : null; // "constructor" is a word, not a prototype key
    if (!post) continue;
    const idf = Math.log(1 + ix.pages.length / (post.length / 2));
    for (let j = 0; j < post.length; j += 2) {
      const i = post[j];
      if (allowed && !allowed.has(i)) continue;
      total.set(i, (total.get(i) ?? 0) + post[j + 1] * idf);
      matched.set(i, (matched.get(i) ?? 0) + 1);
    }
  }
  return [...total].map(([i, s]) => ({ i, s: (s + (phrase && ix.pages[i].title.toLowerCase().includes(phrase) ? 10 : 0)) * (0.4 + 0.6 * matched.get(i)! / qs.length) })); // pages matching every term rank first
}
function snippet(text: string, qs: string[]): string {
  const lower = text.toLowerCase();
  const at = qs.map(q => lower.search(new RegExp(`\\b${q}`))).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 100);
  return (start ? '…' : '') + text.slice(start, start + 280).trim() + (start + 280 < text.length ? '…' : '');
}
// Pages with no Markdown twin: the readable text of <main> (the index keeps only a capped copy).
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', middot: '·', pound: '£' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
function htmlText(html: string): string {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<body[\s\S]*?<\/body>/i)?.[0] || html;
  return decode(main
    .replace(/<(script|style|nav|footer|header|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<h([1-3])[^>]*>/gi, (_, n: string) => `\n\n${'#'.repeat(+n)} `)
    .replace(/<\/(p|li|h[1-6]|tr|div|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const summary = (p: Page) => ({ title: p.title, url: p.url, section: p.section, description: p.description, updated: p.updated, ...(Object.keys(p.fields).length ? { fields: p.fields } : {}) });

// ── tools ─────────────────────────────────────────────────────────────────────
function tools(ix: Index) {
  const sections = [...new Set(ix.pages.map(p => p.section))];
  const site = `${ix.site.title} (${ix.site.origin})`;
  return [
    {
      name: 'search_site', title: `Search ${ix.site.title}`,
      description: `Keyword search over every published page on ${site}: titles, descriptions, headings and full text. Returns up to 10 pages (max 25) with URL, last-updated date, a one-line description and a snippet around the match. Read-only; cite the page URL. Use get_page for a page's full text.`,
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for, e.g. "cover letter" or "robots.txt AI crawlers".' }, section: { type: 'string', description: `Optional: limit to one section (${sections.join(', ')}).` }, limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Default 10.' } }, required: ['query'], additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'get_page', title: 'Read one page',
      description: `The full text of one page on ${site} as Markdown, with its title, URL, last-updated date and any structured fields (verdicts, categories and so on). Pass the page URL or its path, as returned by search_site or list_pages. Read-only.`,
      inputSchema: { type: 'object', properties: { url: { type: 'string', description: `Full URL (${ix.site.origin}/…) or path ("/about/").` } }, required: ['url'], additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'list_pages', title: 'List pages',
      description: `Every published page on ${site}, newest first, with URL, section, last-updated date and description. ${ix.pages.length} pages in total; filter by section and page through with offset.`,
      inputSchema: { type: 'object', properties: { section: { type: 'string', description: `Optional: ${sections.join(', ')}.` }, offset: { type: 'integer', minimum: 0, description: 'Default 0.' }, limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 50.' } }, additionalProperties: false },
      annotations: READ_ONLY,
    },
  ];
}

type Result = { content: { type: 'text'; text: string }[]; structuredContent?: unknown; isError?: boolean };
const ok = (v: unknown): Result => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 1) }], structuredContent: v });
const fail = (text: string): Result => ({ content: [{ type: 'text', text }], isError: true });

async function call(name: string, args: Record<string, unknown>, ix: Index, env: McpEnv, request: Request): Promise<Result> {
  const section = typeof args.section === 'string' && args.section ? args.section : null;
  const pool = section ? ix.pages.filter(p => p.section === section) : ix.pages;
  if (section && !pool.length) return fail(`Unknown section "${section}". Sections: ${[...new Set(ix.pages.map(p => p.section))].join(', ')}.`);
  if (name === 'search_site') {
    const query = String(args.query ?? '').trim().slice(0, 200);
    const qs = terms(query);
    if (!qs.length) return fail('query needs at least one word that is not a stop word.');
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
    const allowed = section ? new Set(ix.pages.flatMap((p, i) => p.section === section ? [i] : [])) : null;
    const hits = search(ix, qs, query.toLowerCase(), allowed).sort((a, b) => b.s - a.s).slice(0, limit).map(h => ({ p: ix.pages[h.i] }));
    return ok({ query, count: hits.length, results: hits.map(({ p }) => ({ ...summary(p), snippet: snippet(p.text, qs) })) });
  }
  if (name === 'get_page') {
    let path = String(args.url ?? '').trim();
    try { const u = new URL(path, ix.site.origin); if (u.origin !== ix.site.origin) return fail(`Only pages on ${ix.site.origin} are available.`); path = u.pathname; } catch { return fail('url must be a URL or a path.'); }
    const norm = (s: string) => s.replace(/\.md$/, '').replace(/\/?$/, '/');
    const page = ix.pages.find(p => norm(p.path) === norm(path));
    if (!page) return fail(`No published page at ${path}. Use search_site or list_pages to find one.`);
    let markdown = page.text;
    const asset = page.markdown ?? page.html;
    if (asset) {
      const r = await env.ASSETS.fetch(new Request(new URL(asset, request.url)));
      if (r.ok) markdown = page.markdown ? await r.text() : htmlText(await r.text()) || page.text;
    }
    const truncated = markdown.length > MAX_MARKDOWN;
    return ok({ ...summary(page), markdown_url: page.markdown ? `${ix.site.origin}${page.markdown}` : null, markdown: truncated ? markdown.slice(0, MAX_MARKDOWN) : markdown, truncated });
  }
  if (name === 'list_pages') {
    const offset = Math.max(Number(args.offset) || 0, 0);
    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 100);
    const sorted = [...pool].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
    return ok({ total: sorted.length, offset, pages: sorted.slice(offset, offset + limit).map(summary), next_offset: offset + limit < sorted.length ? offset + limit : null });
  }
  return fail(`Unknown tool: ${name}`);
}

// ── usage log (site_events, no UA/IP/query stored) ────────────────────────────
const CLIENTS: [RegExp, string][] = [[/claude|anthropic/i, 'claude'], [/openai|chatgpt/i, 'openai'], [/cursor/i, 'cursor'], [/gemini|google/i, 'google'], [/perplexity/i, 'perplexity'], [/copilot|vscode|microsoft/i, 'microsoft'], [/mcp-remote|inspector/i, 'mcp-tooling']];
// Our own probes and tests are not usage (same VPS addresses as worker/events.ts's FLEET_IPS).
const FLEET_IPS = ['65.21.52.116', '2a01:4f9:c014:41c3'];
const isFleet = (r: Request) => !!r.headers.get('x-fleet-probe') || FLEET_IPS.some(p => { const ip = r.headers.get('CF-Connecting-IP') || ''; return ip === p || ip.startsWith(p + ':'); });
function logCall(env: McpEnv, request: Request, ctx: Ctx, tool: string, isError: boolean) {
  const db = env.EVENTS ?? env.DB ?? env.SITE_EVENTS;
  if (!db || isFleet(request)) return;
  const ua = request.headers.get('user-agent') || '';
  const client = CLIENTS.find(([re]) => re.test(ua))?.[1] ?? 'other';
  const write = db.prepare('INSERT INTO site_events (ts,type,path,country,props) VALUES (?,?,?,?,?)')
    .bind(new Date().toISOString(), 'mcp_call', '/mcp', (request.headers.get('cf-ipcountry') || '').slice(0, 2).toUpperCase(), JSON.stringify({ tool, client, error: isError }))
    .run().catch(() => {});
  ctx?.waitUntil(write);
}

// ── JSON-RPC over HTTP, stateless ─────────────────────────────────────────────
type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
const rpc = (id: Rpc['id'], result?: unknown, error?: { code: number; message: string }) => Response.json({ jsonrpc: '2.0', id: id ?? null, ...(error ? { error } : { result }) }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });

export async function mcp(request: Request, env: McpEnv, ctx?: Ctx): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'DELETE') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'GET') {
    // An SSE stream is never offered: this server sends nothing unprompted.
    if ((request.headers.get('accept') || '').includes('text/event-stream') && !(request.headers.get('accept') || '').includes('json')) return new Response(null, { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } });
    return env.ASSETS.fetch(new Request(new URL('/.well-known/mcp.json', request.url))).then(r => new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } }));
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...CORS, Allow: 'GET, POST, DELETE, OPTIONS' } });
  if (Number(request.headers.get('content-length') ?? 0) > 65_536) return rpc(null, undefined, { code: -32600, message: 'request too large' });
  let msg: Rpc | Rpc[];
  try { msg = await request.json() as Rpc | Rpc[]; } catch { return rpc(null, undefined, { code: -32700, message: 'parse error' }); }
  if (Array.isArray(msg)) return rpc(null, undefined, { code: -32600, message: 'batches are not supported' });
  if (!msg || typeof msg.method !== 'string') return rpc(null, undefined, { code: -32600, message: 'invalid request' });
  const { id, method, params = {} } = msg;
  if (method.startsWith('notifications/')) return new Response(null, { status: 202, headers: CORS });
  let ix: Index;
  try { ix = await loadIndex(env, request); } catch (e) { return rpc(id, undefined, { code: -32603, message: (e as Error).message }); }
  switch (method) {
    case 'initialize': {
      const asked = String((params as { protocolVersion?: string }).protocolVersion ?? '');
      return rpc(id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: new URL(ix.site.origin).hostname, title: ix.site.title, version: ix.built.slice(0, 10) },
        instructions: `${ix.site.title}: ${ix.site.description} Read-only access to the ${ix.pages.length} published pages. Call search_site with the person's question in a few words, then get_page for the full text of the best match. Cite page URLs; each page carries its last-updated date.`,
      });
    }
    case 'ping': return rpc(id, {});
    case 'tools/list': return rpc(id, { tools: tools(ix) });
    case 'tools/call': {
      const name = String(params.name ?? '');
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (!tools(ix).some(t => t.name === name)) return rpc(id, undefined, { code: -32602, message: `unknown tool ${name}` });
      let result: Result;
      try { result = await call(name, args, ix, env, request); } catch (e) { result = fail(`Tool failed: ${(e as Error).message}`); }
      logCall(env, request, ctx, name, !!result.isError);
      return rpc(id, result);
    }
    case 'prompts/list': return rpc(id, { prompts: [] });
    case 'resources/list': return rpc(id, { resources: [] });
    case 'resources/templates/list': return rpc(id, { resourceTemplates: [] });
    default: return rpc(id, undefined, { code: -32601, message: `method not found: ${method}` });
  }
}
