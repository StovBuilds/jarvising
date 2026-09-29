#!/usr/bin/env node
// Brand scrub for entry 003 (Inside the Rig). The piece is modelled on a real
// flagship gaming PC but names no manufacturer, product line, model or
// trademark anywhere a visitor can see or fetch: copy, search synonyms, alt
// text, meta, canvas textures, GLB node/mesh/material names, code comments.
// Generic standards (DDR5, PCIe, NVMe, M.2, ATX, USB) are fine and not listed.
//
//   node tools/brand-scrub.mjs          scan; exit 1 on any hit
//   node tools/brand-scrub.mjs --list   print the decoded denylist
//   import { findBrands, scrubText }    used by tools/render-build-frames.mjs to
//                                       neutralise historical sources before rendering
//
// The denylist is stored ROT13-encoded so that this public file does not
// itself spell out the names it keeps out. Matching is case-insensitive with
// word boundaries (a term never matches inside a longer word or number).
// GLBs are checked through their JSON chunk: every string in it (node, mesh,
// material, texture, image, extras) is scanned; the binary buffer is not text.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rot13 = (s) => s.replace(/[a-z]/gi, (c) => String.fromCharCode(((c.toLowerCase().charCodeAt(0) - 97 + 13) % 26) + (c <= "Z" ? 65 : 97)));

// ROT13. Manufacturers, product lines, model numbers, platform/socket/chipset
// names, vendor technologies and certification marks. Add to it freely.
const ENCODED = [
  // board, GPU, case, cooling and power makers and their lines
  "nfhf", "ebt", "erchoyvp bs tnzref", "fgevk", "ghs tnzvat", "cevzr k", "ulcrevba", "elhwva", "gube", "nfgeny",
  "pebffunve", "qnex ureb", "znkvzhf", "cebneg", "nezbhel pengr", "nhen flap", "yvirqnfu", "navzr zngevk", "d-eryrnfr",
  "te701", "pbefnve", "amkg", "yvna yv", "yvna-yv", "or dhvrg", "abpghn", "senpgny qrfvta", "gureznygnxr", "frnfbavp",
  "ritn", "zfv", "tvtnolgr", "nbehf", "pbbyre znfgre", "cunagrxf", "ulgr", "qrrcpbby", "nepgvp serrmre",
  "gurezny tevmmyl", "mbgnp", "fnccuver avgeb", "nfebpx",
  // processors and graphics
  "nzq", "elmra", "enqrba", "rclp", "guernqevccre", "i-pnpur", "3q i-pnpur", "mra 5", "mra5", "mra 4", "k3q", "nz5",
  "nz4", "rkcb", "k870r", "k870", "k670r", "o650", "o850", "m790", "m890", "ytn1700", "ytn1851", "ytn 1700",
  "ytn 1851", "aivqvn", "trsbepr", "egk", "tgk", "phqn", "oynpxjryy", "nqn ybirynpr", "qyff", "sfe", "grafbe pber",
  "vagry", "pber hygen", "krba", "kzc", "nep n770", "5090", "4090", "5080", "4080", "7900 kgk", "9850k3q", "9950k3q",
  "9800k3q", "7800k3q", "9950k", "285x",
  // memory and storage
  "t.fxvyy", "tfxvyy", "t fxvyy", "gevqrag", "m5 arb", "fnzfhat", "i-anaq", "9100 ceb", "990 ceb", "jq_oynpx",
  "jq oynpx", "jrfgrea qvtvgny", "pehpvny", "xvatfgba", "ulcrek", "fx ulavk", "ulavk", "zvpeba", "frntngr", "sverphqn",
  "gfzp", "cuvfba",
  // interface and certification marks that are trademarks rather than open specs
  "uqzv", "qvfcynlcbeg", "guhaqreobyg", "jv-sv", "jvsv", "oyhrgbbgu", "80 cyhf", "80cyhf",
];
const TERMS = [...new Set(ENCODED.map(rot13))];
const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main && process.argv.includes("--list")) { console.log(TERMS.join("\n")); process.exit(0); }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s_-]?");
// word boundary that also treats digits as word characters, so a model number does not match inside a longer number
const ALT = `(?:${TERMS.map(esc).join("|")})`;
const RE = new RegExp(`(?<![a-z0-9.])${ALT}(?![a-z0-9])`, "gi");
// a run of listed terms, with any model-ish tokens between and after them ("III", "360", "OC"):
// case-sensitive on purpose, so the model-token class only takes capitals and digits
const ci = (t) => [...t].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : c === " " ? "[ _-]?" : c.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"))).join("");
const ALT_CI = `(?:${TERMS.map(ci).join("|")})`;
const RUN = new RegExp(`(?<![A-Za-z0-9.])${ALT_CI}(?:[ ·-]+(?:${ALT_CI}|[A-Z0-9][A-Z0-9]*[A-Za-z0-9]*))*(?![A-Za-z0-9])`, "g");

/** Every denylisted term in `text`. */
export const findBrands = (text) => [...text.matchAll(RE)].map((m) => m[0]);
/** Replace each run of brand words with a neutral word, for text we did not write here. */
export const scrubText = (text, replacement = "generic") => text.replace(RUN, replacement);

if (main) run();

function run() {
const TARGETS = [
  "src/rig", "projects/rig", "public/projects/rig", "public/projects/rig.json", "tools/build-frames/rig.json", "tools/blender/rig-parts.py",
];
const TEXT = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".html", ".css", ".txt", ".md", ".py", ".svg", ".xml"]);

const files = [];
const walk = (p) => {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  else files.push(p);
};
for (const t of TARGETS) walk(path.join(ROOT, t));
for (const f of fs.readdirSync(path.join(ROOT, "public/models"))) if (f.startsWith("rig")) files.push(path.join(ROOT, "public/models", f));

const hits = [];
let scanned = 0, glbs = 0;
const check = (file, text, where) => {
  for (const m of text.matchAll(RE)) {
    const line = text.slice(0, m.index).split("\n").length;
    hits.push(`${path.relative(ROOT, file)}${where ? ` [${where}]` : `:${line}`}  "${m[0]}"`);
  }
};
for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  if (ext === ".glb") {
    const b = fs.readFileSync(f);
    if (b.readUInt32LE(0) !== 0x46546c67) { hits.push(`${path.relative(ROOT, f)}: not a GLB`); continue; }
    const len = b.readUInt32LE(12);
    const json = JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
    const strings = [];
    const collect = (v, at) => {
      if (typeof v === "string") strings.push([at, v]);
      else if (Array.isArray(v)) v.forEach((x, i) => collect(x, `${at}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { strings.push([`${at}.key`, k]); collect(x, `${at}.${k}`); }
    };
    collect(json, "json");
    for (const [at, s] of strings) check(f, s, at);
    scanned++; glbs++;
  } else if (TEXT.has(ext)) {
    check(f, fs.readFileSync(f, "utf8"), null);
    scanned++;
  }
}

if (hits.length) {
  console.error(`brand-scrub: ${hits.length} hit(s) in ${scanned} files:`);
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}
console.log(`brand-scrub: clean. ${scanned} files scanned (${glbs} GLB JSON chunks), ${TERMS.length} terms, 0 hits.`);
}
