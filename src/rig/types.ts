// Inside the Rig (jarvising entry 003) — shared types for the content catalogue, the
// procedural part builders, the explode engine and the atlas UI. Everything
// that talks about a component talks about it through these shapes, so a part
// id in content.ts is the same id on the mesh the user hovers.
//
// UNITS + FRAME (all builders): millimetres, +Y up, +Z = the FRONT of the
// case (toward someone standing in front of it), +X = the tempered-glass side.
// The machine group is scaled ×0.001 into metres for the camera. Explode
// directions are given in this frame; distances in mm.
//
// LAYOUT (every builder and every camera key agrees on these):
//   case envelope  268 × 639 × 659 mm: x ∈ [−134, 134], y ∈ [0, 639], z ∈ [−329.5, 329.5]
//   board plane    PCB face at x = −97, components protrude +X. E-ATX (305 × 277)
//                  spans y ∈ [244, 549], z ∈ [−309.5, −32.5]. Socket centre (y 454,
//                  z −214.5). PCIe slot 1 at y 354, connector centre z −257. DIMM
//                  A/B at z −142 / −121, centred y 449. M.2_1 at y 394, z ∈ [−250, −170].
//   top radiator   y ∈ [579, 609], its fans y ∈ [554, 579], x ∈ [−90, 30],
//                  z ∈ [−219.75, 179.75]
//   front fans     z 284.5, x −20, y 175 / 325 / 475; rear fan (−20, 470, −304.5)
//   PSU            y ∈ [40, 126], x ∈ [−125, 25], z ∈ [−320, −120]; shroud y ∈ [30, 150]

import type * as THREE from "three";

/** Atlas filter categories — the left "Systems" panel. */
export type SystemId =
  | "compute"
  | "graphics"
  | "memory"
  | "storage"
  | "power"
  | "cooling"
  | "connectivity"
  | "chassis";

export const SYSTEMS: { id: SystemId; label: string; tint: string }[] = [
  { id: "compute", label: "Compute", tint: "#e0642a" },
  { id: "graphics", label: "Graphics", tint: "#3b82f6" },
  { id: "memory", label: "Memory", tint: "#a855f7" },
  { id: "storage", label: "Storage", tint: "#14b8a6" },
  { id: "power", label: "Power", tint: "#eab308" },
  { id: "cooling", label: "Cooling", tint: "#38bdf8" },
  { id: "connectivity", label: "Connectivity", tint: "#84cc16" },
  { id: "chassis", label: "Chassis", tint: "#9ca3af" },
];

export type Mode = "story" | "brand";

/** One caption in the scroll story — the same beat has a story and a brand version. */
export interface CopyBlock {
  eyebrow: string;
  title: string;
  body: string;
}

export interface Spec {
  label: string;
  value: string;
}

/** Content for one inspectable node. Level A = major products, B = their parts. */
export interface PartContent {
  id: string;
  /** Plain-English label ("Graphics Card"). */
  name: string;
  /** What kind of product the node is, generically ("Flagship-class graphics card"). Never a brand. */
  productName?: string;
  system: SystemId;
  level: "A" | "B" | "C";
  /** Search synonyms: "gpu", "graphics card", "video card". */
  tags: string[];
  /** Hover tooltip / panel lede — 8–15 words. */
  short: string;
  /** Modal sections (story mode). Level B parts may only have `short`. */
  whatItDoes?: string;
  whyItMatters?: string;
  buying?: string;
  /** "This build" bullets — generic facts only, no product-identifying numbers. */
  thisBuild?: string[];
  specs?: Spec[];
  /** Brand-mode card for this node (fact-led, no slogans). */
  brand?: CopyBlock;
  /** Ids of related nodes — rendered as chips. */
  related?: string[];
}

/** How a node moves when the atlas explodes. Stage = which quarter of the
 * slider it moves in (1 panels, 2 systems, 3 components, 4 every piece). */
export interface ExplodeSpec {
  stage: 1 | 2 | 3 | 4;
  /** Direction in the machine frame; normalised by the engine. */
  dir: [number, number, number];
  /** Millimetres of travel at the end of its stage. */
  dist: number;
  /** 0..1 — a lagged part starts later within its stage (staggered waves). */
  lag?: number;
}

/** One node in the part tree — a group with its meshes and its children. The
 * engine moves `object` (children ride along, so a GPU fan gets the GPU's
 * stage-2 travel plus its own stage-4 travel). */
export interface PartNode {
  id: string;
  object: THREE.Group;
  /** Meshes owned directly by this node (not its children) — for picking + emphasis. */
  meshes: THREE.Mesh[];
  children: PartNode[];
  explode?: ExplodeSpec;
  /** Assembled local position (captured at build; the engine never loses it). */
  home: THREE.Vector3;
}

/** Scene table row for the scroll story. Progress ranges are 0..1 of the spacer. */
export interface Chapter {
  id: string;
  from: number;
  to: number;
  /** Which world the camera is in. Micro worlds are abstract; "machine" is the real build. */
  world: "cpu-micro" | "gpu-micro" | "machine";
  story: CopyBlock;
  brand: CopyBlock;
}
