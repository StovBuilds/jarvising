#!/usr/bin/env node
// identity-render: write a site's company / founder / brand details from its synced identity.json.
// COPIED into each site repo by `~/bin/identity.mjs sync` (source: ~/registry/render/identity-render.mjs).
// Do not edit a site's copy; change the registry and re-sync. No dependencies.
//
//   node scripts/identity-render.mjs           rewrite every region listed in identity.render.json
//   node scripts/identity-render.mjs --check   exit 1 if any region is not what the data says (CI)
//
// identity.render.json (repo root):
//   { "source": "src/data/identity.json", "self": "<brand slug, optional>",
//     "regions": [ { "file": "...", "begin": "<text on the line before>", "end": "<text on the line after>", "template": "..." | [lines] } ],
//     "lines":   [ { "file": "...", "match": "<regex for one whole line>", "template": "..." } ] }
// Template: {{path}} value · {{json path}} JSON · {{jsonpretty path <indent>}} 2-space JSON, later lines indented
//   · {{#each path}}..{{.field}}..{{#sep}}, {{/sep}}..{{/each}} · paths start at org, people, brands, self, jsonld.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const cfg = JSON.parse(readFileSync(join(root, "identity.render.json"), "utf8"));
const id = JSON.parse(readFileSync(join(root, cfg.source), "utf8"));

export function orgNode(id, { founder = false } = {}) {
  const o = id.org;
  const node = {
    "@type": "Organization", "@id": o.id, name: o.legalName, legalName: o.legalName, alternateName: o.alternateName, url: o.url, logo: o.logo,
    description: o.description, email: o.email, areaServed: o.areaServed, foundingDate: o.foundingDate,
    address: { "@type": "PostalAddress", ...o.address },
    identifier: { "@type": "PropertyValue", propertyID: "Companies House", value: o.companyNumber },
    vatID: o.vatID,
  };
  if (founder) node.founder = { "@id": id.people[o.founder].id };
  node.knowsAbout = o.knowsAbout;
  node.sameAs = [...new Set([...o.sameAsExtra, ...o.socials.map((s) => s.url)])];
  return node;
}
const ctx = {
  ...id,
  self: cfg.self ? id.brands[cfg.self] : null,
  jsonld: { org: { "@context": "https://schema.org", ...orgNode(id) }, orgWithFounder: orgNode(id, { founder: true }) },
};

const get = (path, scope) => {
  if (path === ".") return scope;
  if (path.startsWith(".")) return path.slice(1).split(".").reduce((v, k) => v?.[k], scope);
  return path.split(".").reduce((v, k) => v?.[k], ctx);
};
function fill(tpl, scope = ctx) {
  tpl = tpl.replace(/\{\{#each ([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, p, inner) => {
    const arr = get(p.trim(), scope);
    if (!Array.isArray(arr)) throw new Error(`each: ${p} is not a list`);
    return arr.map((item, i) => fill(inner.replace(/\{\{#sep\}\}([\s\S]*?)\{\{\/sep\}\}/g, i < arr.length - 1 ? "$1" : ""), item)).join("");
  });
  return tpl.replace(/\{\{(json|jsonpretty)? ?([^}\s]+)(?: (\d+))?\}\}/g, (_, fn, p, ind) => {
    const v = get(p, scope);
    if (v === undefined) throw new Error(`template: no value at ${p}`);
    if (fn === "json") return JSON.stringify(v);
    if (fn === "jsonpretty") return JSON.stringify(v, null, 2).split("\n").join("\n" + " ".repeat(Number(ind || 0)));
    return String(v);
  });
}
const tplOf = (r) => (Array.isArray(r.template) ? r.template.join("\n") : r.template);

const files = new Map();
const read = (f) => { if (!files.has(f)) files.set(f, readFileSync(join(root, f), "utf8")); return files.get(f); };
const problems = [];
for (const r of cfg.regions ?? []) {
  const text = read(r.file); const lines = text.split("\n");
  const b = lines.findIndex((l) => l.includes(r.begin));
  const e = b < 0 ? -1 : lines.findIndex((l, i) => i > b && l.includes(r.end));
  if (b < 0 || e < 0) { problems.push(`${r.file}: markers "${r.begin}" / "${r.end}" not found`); continue; }
  const next = [...lines.slice(0, b + 1), fill(tplOf(r)), ...lines.slice(e)].join("\n");
  files.set(r.file, next);
}
for (const r of cfg.lines ?? []) {
  const text = read(r.file); const re = new RegExp(r.match);
  const lines = text.split("\n"); const i = lines.findIndex((l) => re.test(l));
  if (i < 0) { problems.push(`${r.file}: no line matches /${r.match}/`); continue; }
  lines[i] = fill(tplOf(r)); files.set(r.file, lines.join("\n"));
}
let changed = 0;
for (const [f, next] of files) {
  if (readFileSync(join(root, f), "utf8") === next) continue;
  changed++;
  if (process.argv.includes("--check")) problems.push(`${f}: out of date with ${cfg.source} (run node scripts/identity-render.mjs)`);
  else { writeFileSync(join(root, f), next); console.log(`rendered ${f}`); }
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
if (!changed) console.log("identity: every region matches", cfg.source);
