#!/usr/bin/env node
// Weld + quantize a GLB in place (KHR_mesh_quantization — decoded natively by
// three, no WASM). Deliberately NOT meshopt/Draco: the site's CSP is
// `script-src 'self'` with no 'wasm-unsafe-eval' and no blob: workers, and a
// smaller file is not worth loosening it. Uses the gltf-transform install in
// ~/repos/3d-kit-design (override with GLTF_TOOLS_ROOT).
//
//   node tools/optimize-glb.mjs public/models/bombe.glb
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.GLTF_TOOLS_ROOT ?? "/home/jack/repos/3d-kit-design";
const req = createRequire(path.join(ROOT, "package.json"));
const { NodeIO } = req("@gltf-transform/core");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");
const { weld, quantize, prune, dedup } = req("@gltf-transform/functions");

const file = process.argv[2];
if (!file) { console.error("usage: optimize-glb.mjs <file.glb>"); process.exit(2); }
const before = fs.statSync(file).size;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
await doc.transform(dedup(), weld(), quantize(), prune());
await io.write(file, doc);
const after = fs.statSync(file).size;
let tris = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const idx = prim.getIndices();
  tris += idx ? idx.getCount() / 3 : prim.getAttribute("POSITION").getCount() / 3;
}
console.log(`${path.basename(file)}: ${(before / 1024).toFixed(0)} kB → ${(after / 1024).toFixed(0)} kB, ${tris} triangles, ${doc.getRoot().listMeshes().length} meshes`);
