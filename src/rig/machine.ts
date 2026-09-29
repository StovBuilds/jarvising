// The assembler: builds every product, places it, indexes the tree by id,
// clones materials per node (so the atlas can dim/glow one part without
// touching its neighbours), and exposes the few verbs the page needs —
// explode, emphasise, spin, bounds. Geometry stays in parts/*; copy stays in
// content.ts; this file knows only positions and ids.

import * as THREE from "three";
import type { PartId } from "./ids";
import { PART_IDS } from "./ids";
import type { PartNode } from "./types";
import { applyExplode } from "./explode";
import { applyLibrary, type PartsLibrary } from "./library";
import { buildChassis } from "./parts/chassis";
import { buildBoard } from "./parts/board";
import { buildDimm } from "./parts/memory";
import { buildSsd } from "./parts/storage";
import { buildGpu } from "./parts/gpu";
import { buildPsu } from "./parts/psu";
import { buildCables } from "./parts/cables";
import { buildAio } from "./parts/aio";
import { buildCaseFans } from "./parts/casefans";

export interface EmphasisState {
  hover: string | null;
  selected: string | null;
  /** Isolate: everything outside this subtree becomes a ghost. */
  isolate: string | null;
  /** Filtered-out nodes (by system) are hidden outright — this node only. */
  hidden: (id: string) => boolean;
  /** Story hides: a match hides the node AND its whole subtree. */
  hiddenSubtree?: (id: string) => boolean;
  /** Explicit opacity factors (story reveals) — override the computed fade. */
  fades?: Record<string, number>;
}

interface MatState {
  mat: THREE.MeshStandardMaterial;
  accent: boolean;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  emissive: THREE.Color;
  emissiveIntensity: number;
}

interface NodeState {
  node: PartNode;
  mats: MatState[];
  fade: number;     // current opacity factor
  fadeTo: number;
  glow: number;     // current highlight
  glowTo: number;
  pickable: boolean;
}

export interface Machine {
  root: THREE.Group;
  tops: PartNode[];
  nodes: Map<string, PartNode>;
  parentOf: Map<string, string | undefined>;
  rotors: THREE.Group[];
  /** World-space bounds (metres) of a node's subtree. */
  bounds(id: string): THREE.Box3;
  /** The whole machine's bounds (assembled). */
  extent: THREE.Box3;
  setExplode(amount: number, scopeId?: string | null): void;
  setEmphasis(e: EmphasisState): void;
  /** 0..1 brightness of the RGB accents (rings, diffusers, status lines). */
  setAccent(k: number): void;
  /** Walk from a hit object to the node id it belongs to (null for decor / misses). */
  pick(hit: THREE.Object3D): string | null;
  /** The Level-A ancestor (or itself) — what a hover names. */
  productOf(id: string): string;
  update(dt: number, fanSpeed: number): void;
  dispose(): void;
}

/** Set a node's assembled position (and its explode home) in one go. */
function place(n: PartNode, x: number, y: number, z: number): PartNode {
  n.object.position.set(x, y, z);
  n.home.copy(n.object.position);
  return n;
}

function shift(n: PartNode, dx: number, dy: number, dz: number): PartNode {
  n.object.position.x += dx; n.object.position.y += dy; n.object.position.z += dz;
  n.home.copy(n.object.position);
  return n;
}

export interface BuildOptions {
  isProduct: (id: string) => boolean;
  /** Blender-authored replacements for the hero parts; omit for the procedural build. */
  library?: PartsLibrary | null;
}

/** The products, one thunk each, so the build can yield between them. */
function steps(): (() => PartNode[])[] {
  return [
    () => buildChassis(),
    () => [buildBoard([buildDimm("a"), buildDimm("b"), buildSsd()])],
    // GPU: local origin = the edge connector's contact edge on the PCB mid-plane.
    // The slot is at y 354 with its centre at z -257; the card sits 8 mm rearward
    // so its bracket meets the rear panel.
    () => [place(buildGpu(), -95, 354, -265)],
    // PSU: local origin = centre of its bottom face.
    () => [place(buildPsu(), -50, 40, -220)],
    () => buildCables(),
    () => [buildAio()],
    () => {
      const fans = buildCaseFans();
      // The rear fan sits beside the I/O block, not over it.
      const rear = fans.find((f) => f.id === "fan-rear");
      if (rear) shift(rear, 50, 0, 0);
      return fans;
    },
  ];
}

/** Build everything in one go (needed when the page opens on a machine chapter). */
export function buildMachine(accent: string, opts: BuildOptions): Machine {
  const tops: PartNode[] = [];
  for (const step of steps()) tops.push(...step());
  return assemble(tops, accent, opts);
}

/** Swapped-in part ids from the last build — the QA hook reports them. */
export let lastSwapped: string[] = [];

/** Build one product per `pause` (a frame) so the arrival beat never stalls
 * (brief §39: the first scene should not wait for the whole atlas). */
export async function buildMachineAsync(accent: string, opts: BuildOptions, pause: () => Promise<void>): Promise<Machine> {
  const tops: PartNode[] = [];
  for (const step of steps()) {
    tops.push(...step());
    await pause();
  }
  return assemble(tops, accent, opts);
}

function assemble(tops: PartNode[], accent: string, opts: BuildOptions): Machine {
  // the library swaps meshes by id BEFORE anything is indexed or cloned
  lastSwapped = opts.library ? applyLibrary(tops, opts.library, accent) : [];
  const root = new THREE.Group();
  root.name = "rig";
  root.scale.setScalar(0.001); // mm → m
  for (const t of tops) root.add(t.object);

  // ── index ───────────────────────────────────────────────────────────────
  const nodes = new Map<string, PartNode>();
  const parentOf = new Map<string, string | undefined>();
  const rotors: THREE.Group[] = [];
  const states = new Map<string, NodeState>();
  const accentColor = new THREE.Color(accent);

  const visit = (n: PartNode, parent?: PartNode) => {
    if (nodes.has(n.id)) console.warn(`[rig] duplicate node id ${n.id}`);
    nodes.set(n.id, n);
    parentOf.set(n.id, parent?.id);
    const r = n.object.userData.rotors as THREE.Group[] | undefined;
    if (r) rotors.push(...r);
    // clone materials per node so emphasis is local
    const cloneOf = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const mats: MatState[] = [];
    for (const m of n.meshes) {
      const src = m.material as THREE.MeshStandardMaterial;
      let c = cloneOf.get(src);
      if (!c) {
        c = src.clone() as THREE.MeshStandardMaterial;
        cloneOf.set(src, c);
        mats.push({
          mat: c, accent: c.userData.accent === true, opacity: c.opacity, transparent: c.transparent, depthWrite: c.depthWrite,
          emissive: c.emissive.clone(), emissiveIntensity: c.emissiveIntensity,
        });
      }
      m.material = c;
    }
    states.set(n.id, { node: n, mats, fade: 1, fadeTo: 1, glow: 0, glowTo: 0, pickable: true });
    for (const c of n.children) visit(c, n);
  };
  for (const t of tops) visit(t);
  for (const id of PART_IDS) if (!nodes.has(id)) console.warn(`[rig] no geometry for ${id}`);

  root.updateMatrixWorld(true);
  const extent = new THREE.Box3().setFromObject(root);

  // ── verbs ───────────────────────────────────────────────────────────────
  const isDescendant = (id: string, ancestor: string): boolean => {
    let cur: string | undefined = id;
    while (cur) {
      if (cur === ancestor) return true;
      cur = parentOf.get(cur);
    }
    return false;
  };

  const productOf = (id: string): string => {
    let cur: string | undefined = id;
    let best = id;
    while (cur) {
      if (opts.isProduct(cur)) best = cur;
      cur = parentOf.get(cur);
    }
    return best;
  };

  // hidden applies to a node and everything under it (a root with no meshes of
  // its own, like "aio", still hides its children) — but a hidden node's
  // filtered-in descendants are decided by the predicate, so a hidden
  // motherboard keeps a visible CPU when only the board's system is off.
  const hiddenDeep = (id: string, pred: (id: string) => boolean): boolean => {
    let cur: string | undefined = id;
    while (cur) {
      if (pred(cur)) return true;
      cur = parentOf.get(cur);
    }
    return false;
  };

  const setEmphasis = (e: EmphasisState) => {
    const anyFocus = !!(e.hover || e.selected);
    for (const s of states.values()) {
      const id = s.node.id;
      // hide MESHES, not the group, so hierarchy visibility stays a per-node decision
      const hidden = e.hidden(id) || (e.hiddenSubtree ? hiddenDeep(id, e.hiddenSubtree) : false);
      for (const m of s.node.meshes) m.visible = !hidden;
      if (hidden) { s.pickable = false; continue; }
      const inIsolate = !e.isolate || isDescendant(id, e.isolate);
      if (!inIsolate) { s.fadeTo = 0.06; s.glowTo = 0; s.pickable = false; continue; }
      s.pickable = true;
      const hot = e.hover && isDescendant(id, e.hover) ? 1 : e.selected && isDescendant(id, e.selected) ? 0.6 : 0;
      s.fadeTo = anyFocus && hot === 0 ? 0.35 : 1;
      s.glowTo = hot;
    }
    if (e.fades) {
      // a fade names a node and applies to its whole subtree (roots like "aio" own no meshes)
      for (const [id, f] of Object.entries(e.fades)) {
        for (const s of states.values()) if (isDescendant(s.node.id, id)) s.fadeTo = f;
      }
    }
  };

  const pick = (hit: THREE.Object3D): string | null => {
    const id = hit.userData.partId as string | undefined;
    if (!id || !hit.visible) return null;
    const s = states.get(id);
    return s && s.pickable ? id : null;
  };

  const setExplode = (amount: number, scopeId: string | null = null) => {
    applyExplode(tops, amount, scopeId ? nodes.get(scopeId) ?? null : null);
  };

  const _box = new THREE.Box3();
  const bounds = (id: string) => {
    const n = nodes.get(id);
    if (!n) return extent.clone();
    n.object.updateWorldMatrix(true, true);
    return _box.setFromObject(n.object).clone();
  };

  let accentK = 1;
  const setAccent = (k: number) => {
    if (Math.abs(k - accentK) < 0.003) return;
    accentK = k;
    for (const s of states.values()) {
      for (const m of s.mats) if (m.accent) m.mat.emissiveIntensity = Math.max(m.emissiveIntensity * k, s.glow * 0.9);
    }
  };

  const _c = new THREE.Color();
  const update = (dt: number, fanSpeed: number) => {
    const k = Math.min(1, dt * 9);
    for (const s of states.values()) {
      if (Math.abs(s.fade - s.fadeTo) < 0.002 && Math.abs(s.glow - s.glowTo) < 0.002) continue;
      s.fade += (s.fadeTo - s.fade) * k;
      s.glow += (s.glowTo - s.glow) * k;
      const faded = s.fade < 0.995;
      for (const m of s.mats) {
        m.mat.opacity = m.opacity * s.fade;
        m.mat.transparent = m.transparent || faded;
        m.mat.depthWrite = faded && s.fade < 0.5 ? false : m.depthWrite;
        _c.copy(m.emissive).lerp(accentColor, s.glow * 0.55);
        m.mat.emissive.copy(_c);
        m.mat.emissiveIntensity = Math.max(m.emissiveIntensity * (m.accent ? accentK : 1), s.glow * 0.9);
      }
    }
    if (fanSpeed > 0) for (const r of rotors) r.rotation.z += dt * fanSpeed;
  };

  const dispose = () => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material;
        mat.dispose();
      }
    });
  };

  return { root, tops, nodes, parentOf, rotors, bounds, extent, setExplode, setEmphasis, setAccent, pick, productOf, update, dispose };
}

export type { PartId };
