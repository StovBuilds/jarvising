// The parts library: Blender-authored replacements for the hero parts, dropped
// into the procedural tree by id. Nothing else changes — the explode data, the
// copy, the picking and the atlas all key off the same node ids, so a part is
// either the primitive we build in code or a better mesh with the same name in
// the same place.
//
// Contract (see tools/blender/rig-parts.py):
//   • one GLB, meshes named `<libId>__<matKey>` (matKey ∈ MAT, or "accent")
//   • geometry in MILLIMETRES, authored in the same LOCAL frame as the
//     primitive it replaces, so it drops in with an identity transform
//   • no materials in the file; the runtime assigns MAT.* by name
// Anything missing from the library keeps its procedural version, so a failed
// or slow fetch costs detail and never the page.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MAT, glow } from "./parts/prims";
import type { PartNode } from "./types";

export const LIBRARY_URL = "/models/rig-parts.glb";

interface LibPiece {
  geometry: THREE.BufferGeometry;
  matKey: string;
}

export interface PartsLibrary {
  pieces: Map<string, LibPiece[]>;
  dispose(): void;
}

const MAT_KEYS = new Set(Object.keys(MAT));

/** Fetch and parse the library. Resolves null on any failure — the caller
 * carries on with the procedural machine. */
export async function loadPartsLibrary(url = LIBRARY_URL, timeoutMs = 8000): Promise<PartsLibrary | null> {
  try {
    const gltf = await Promise.race([
      new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        new GLTFLoader().load(url, resolve, undefined, reject);
      }),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!gltf) return null;

    const pieces = new Map<string, LibPiece[]>();
    const keep = new Set<THREE.BufferGeometry>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const [libId, matKey] = m.name.split("__");
      if (!libId || !matKey) {
        console.warn(`[rig] library mesh "${m.name}" is not <libId>__<matKey>`);
        return;
      }
      if (matKey !== "accent" && !MAT_KEYS.has(matKey)) {
        console.warn(`[rig] library mesh "${m.name}" names an unknown material`);
        return;
      }
      const geometry = m.geometry;
      // the authored frame is the part's local frame, so any node transform the
      // exporter left behind has to be baked in (safe: the library ships
      // unquantised, so positions are float and nothing clamps)
      if (!m.matrixWorld.equals(IDENTITY)) geometry.applyMatrix4(m.matrixWorld);
      geometry.computeBoundingSphere();
      keep.add(geometry);
      const list = pieces.get(libId) ?? [];
      list.push({ geometry, matKey });
      pieces.set(libId, list);
    });
    if (pieces.size === 0) return null;
    return {
      pieces,
      dispose: () => { for (const g of keep) g.dispose(); pieces.clear(); },
    };
  } catch (err) {
    console.warn("[rig] parts library unavailable, using the procedural build", err);
    return null;
  }
}

const IDENTITY = new THREE.Matrix4();

/** Swap every part the library carries into the tree. Returns the ids swapped.
 * Call BEFORE the assembler indexes the tree and clones materials. */
export function applyLibrary(tops: PartNode[], lib: PartsLibrary, accent: string): string[] {
  const accentMat = glow(new THREE.Color(accent).getHex(), 0.8);
  const swapped: string[] = [];

  const visit = (n: PartNode) => {
    // a node can name a shape rather than itself — every 120 mm fan reuses one rotor
    const libId = (n.object.userData.libId as string | undefined) ?? n.id;
    const parts = lib.pieces.get(libId);
    if (parts && n.meshes.length > 0) {
      // the replacements go where the originals were: a fan rotor's meshes live
      // under the spinning group, not under the node group
      const parent = n.meshes[0].parent ?? n.object;
      for (const m of n.meshes) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      const fresh: THREE.Mesh[] = [];
      for (const p of parts) {
        const mat = p.matKey === "accent" ? accentMat : MAT[p.matKey as keyof typeof MAT];
        const mesh = new THREE.Mesh(p.geometry, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.partId = n.id;
        parent.add(mesh);
        fresh.push(mesh);
      }
      n.meshes.length = 0;
      n.meshes.push(...fresh);
      swapped.push(n.id);
    }
    for (const c of n.children) visit(c);
  };
  for (const t of tops) visit(t);
  return swapped;
}
