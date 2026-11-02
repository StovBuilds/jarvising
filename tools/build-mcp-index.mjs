#!/usr/bin/env node
// Build the read-only MCP index (worker/mcp.ts) from what the site already publishes:
// sitemap.xml says which pages exist, each page's Markdown twin (/foo/ → dist/foo.md) is
// its content, and llms.txt's heading + blockquote name the site. No page is indexed
// that the sitemap does not list, so noindex/draft pages never reach an agent.
//
//   node tools/build-mcp-index.mjs [distDir]   (runs at the end of `build`)
//
// Writes dist/mcp-index.json (read by the worker through ASSETS), dist/.well-known/mcp.json
// (a discovery card) and appends an "AI agents" section to dist/llms.txt.
// Shared across the fleet: the source of truth is guide-site-starter; copy, don't fork.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const read = p => readFileSync(join(dist, p), 'utf8');

const sitemap = read('sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
// <lastmod> per URL: the fallback "updated" date when a page's own front matter has none.
const lastmod = new Map([...sitemap.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/url>/g)].map(m => [m[1].replace(/&amp;/g, '&'), m[0].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1]?.slice(0, 10) ?? null]));
if (!urls.length) throw new Error('build-mcp-index: sitemap.xml lists no URLs');
const origin = new URL(urls[0]).origin;

const llms = existsSync(join(dist, 'llms.txt')) ? read('llms.txt') : '';
const title = (llms.match(/^#\s+(.+)$/m)?.[1] || new URL(origin).hostname).trim();
const description = (llms.match(/^>\s+(.+)$/m)?.[1] || '').trim();

// ── Markdown → plain parts ─────────────────────────────────────────────────────
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fields: {}, body: md };
  const fields = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv || !kv[2]) continue; // nested/list keys are skipped: scalars only
    fields[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { fields, body: md.slice(m[0].length) };
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', middot: '·', pound: '£', euro: '€', copy: '©' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const plain = s => decode(s
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/^\s*[#>|*-]+\s*/gm, '')
  .replace(/[*_`]+/g, '')
  .replace(/\s+/g, ' '))
  .trim();
function fromHtml(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<body[\s\S]*?<\/body>/i)?.[0] || html;
  const t = main.replace(/<(script|style|nav|footer|header|svg)[\s\S]*?<\/\1>/gi, ' ');
  const headings = [...t.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m => plain(m[1]));
  const desc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || '';
  const ttl = html.match(/<title>([^<]*)<\/title>/i)?.[1] || '';
  return { title: decode(ttl).trim(), description: decode(desc).trim(), headings, text: plain(t) };
}

const pages = [];
for (const url of urls) {
  const u = new URL(url);
  const path = u.pathname;
  const slug = path.replace(/^\/|\/$/g, '');
  const mdRel = slug ? `${slug}.md` : 'index.md';
  const htmlRel = slug ? (existsSync(join(dist, slug, 'index.html')) ? `${slug}/index.html` : `${slug}.html`) : 'index.html';
  let page;
  if (existsSync(join(dist, mdRel))) {
    const { fields, body } = frontmatter(read(mdRel));
    const h1 = body.match(/^#\s+(.+)$/m)?.[1];
    const headings = [...body.matchAll(/^#{2,3}\s+(.+)$/gm)].map(m => plain(m[1]));
    const firstPara = body.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !p.startsWith('#') && !/^(Author|Published|Updated|Canonical|Publisher|Contact|Source|Language):/i.test(p)) || '';
    page = { title: fields.title || plain(h1 || ''), description: fields.description || plain(firstPara).slice(0, 300), headings, text: plain(body), markdown: `/${mdRel}`, fields, body };
  } else if (existsSync(join(dist, htmlRel))) {
    page = { ...fromHtml(read(htmlRel)), markdown: null, fields: {} };
  } else continue;
  for (const k of ['title', 'url', 'description']) delete page.fields[k];
  pages.push({
    path, url, section: slug.split('/')[0] && slug.includes('/') ? slug.split('/')[0] : (slug ? 'pages' : 'home'),
    title: page.title || title, description: page.description, updated: page.fields.updated || page.fields.published || page.body?.match(/^Updated:\s*(\d{4}-\d{2}-\d{2})/mi)?.[1] || lastmod.get(url) || null,
    headings: page.headings.slice(0, 40), markdown: page.markdown, html: page.markdown ? null : `/${htmlRel}`, fields: page.fields,
    text: page.text,
  });
}
// Search postings, built here so the worker never tokenises a page: term → [page, score, …].
// Tokeniser and weights must match worker/mcp.ts (words, stem, field weights 8/4/3/2, body 0.5 × min(tf, 6)).
const STOP = new Set('a an and are as at be by can could do does for from how i if in into is it its me my of on or should that the this to use using was what when where which who why will with you your'.split(' '));
const words = t => t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) ?? [];
const stem = w => w.length > 4 ? w.replace(/(ies|es|s|ing|ed)$/, '') : w;
const postings = Object.create(null); // words like "constructor" must not hit Object.prototype
pages.forEach((p, i) => {
  const score = new Map();
  const add = (k, v) => { if (!STOP.has(k)) score.set(k, (score.get(k) ?? 0) + v); };
  for (const [f, w] of [[p.title, 8], [p.description, 4], [p.headings.join(' '), 3], [Object.values(p.fields).join(' '), 2]]) for (const k of new Set(words(f).map(stem))) add(k, w);
  const tf = new Map(); for (const w of words(p.text)) { const k = stem(w); tf.set(k, (tf.get(k) ?? 0) + 1); }
  for (const [k, n] of tf) add(k, Math.min(n, 6) * 0.5);
  for (const [k, v] of score) (postings[k] ??= []).push(i, v);
});
// Body text is kept only for snippets (and as get_page's last resort): ~1 MB in all.
const perPage = Math.max(1_500, Math.min(40_000, Math.floor(1_000_000 / Math.max(pages.length, 1))));
for (const p of pages) p.text = p.text.slice(0, perPage);

const index = { version: 2, postings, built: new Date().toISOString(), site: { title, description, origin, endpoint: `${origin}/mcp` }, pages };
writeFileSync(join(dist, 'mcp-index.json'), JSON.stringify(index));

const card = {
  name: new URL(origin).hostname, title, description,
  endpoint: `${origin}/mcp`, transport: 'streamable-http', protocol: '2025-06-18', auth: 'none', readOnly: true,
  tools: ['search_site', 'get_page', 'list_pages'], llms: `${origin}/llms.txt`,
};
mkdirSync(join(dist, '.well-known'), { recursive: true });
writeFileSync(join(dist, '.well-known', 'mcp.json'), JSON.stringify(card, null, 2) + '\n');

// The "AI agents" lines for llms.txt and llms-full.txt. The /mcp-server/ help page is listed only
// when the site has one. Skipped when the source file already names the endpoint itself.
const helpPage = ['mcp-server/index.html', 'mcp-server.html'].some(f => existsSync(join(dist, f)));
const agentLines = `\n## AI agents\n\n- [MCP server](${origin}/mcp): Read-only remote MCP server (Streamable HTTP, no key). Tools: search_site, get_page, list_pages. Covers every page in the sitemap, with its URL and last-updated date.\n`
  + (helpPage ? `- [Connect the MCP server](${origin}/mcp-server/): How to add it to Claude, ChatGPT, Claude Code, Cursor or VS Code, what each tool does and what we record.\n` : '')
  + `- [MCP discovery card](${origin}/.well-known/mcp.json): The server's endpoint, transport and tools as JSON.\n`;
const namesEndpoint = t => new RegExp(`${origin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/mcp(?![\\w/-])`).test(t);
for (const f of ['llms.txt', 'llms-full.txt']) {
  if (!existsSync(join(dist, f))) continue;
  const t = read(f);
  if (!namesEndpoint(t)) writeFileSync(join(dist, f), t.replace(/\s*$/, '\n') + agentLines);
}

const bytes = JSON.stringify(index).length;
console.log(`build-mcp-index: ${pages.length}/${urls.length} sitemap page(s) indexed, ${(bytes / 1024).toFixed(0)} KB`);
if (pages.length < urls.length) console.log(`build-mcp-index: no .md or .html for ${urls.length - pages.length} sitemap URL(s)`);
