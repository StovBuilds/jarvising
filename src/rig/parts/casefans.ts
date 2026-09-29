// Inside the Rig — the case's stock fans: three 140 mm
// front intakes and one 140 mm rear exhaust, all blowing toward −Z (front →
// rear). Built directly in the machine frame (mm, +Y up, +Z case front, +X
// glass side — see ../types.ts); the assembler adds each node at the origin.
//
// BOUNDING BOXES (assembled, per node — 140 × 140 × 28):
//   fan-front-1  x ∈ [-90, 50]  y ∈ [105, 245]  z ∈ [270.5, 298.5]
//   fan-front-2  x ∈ [-90, 50]  y ∈ [255, 395]  z ∈ [270.5, 298.5]
//   fan-front-3  x ∈ [-90, 50]  y ∈ [405, 545]  z ∈ [270.5, 298.5]
//   fan-rear     x ∈ [-90, 50]  y ∈ [400, 540]  z ∈ [-318.5, -290.5]
//
// Every ids.ts entry starting with "fan-" is emitted exactly once: fan-front-1,
// fan-front-2, fan-front-3, fan-rear (4 ids, 4 node() calls). Each node carries
// `object.userData.rotors = [rotor]` for animate().
//
// Budget: ~2.5k triangles per fan → ~10k total.

import type { ExplodeSpec, PartNode } from "../types";
import { fan, fanNode } from "./prims";

type V3 = [number, number, number];
type FanId = "fan-front-1" | "fan-front-2" | "fan-front-3" | "fan-rear";

function caseFan(id: FanId, at: V3, explode: ExplodeSpec): PartNode {
  const { group, rotor } = fan(140, 28, { rgb: 0xe8a33a });
  // prims.ts fan() blows along local +Z; a half-turn about Y sends the airflow to −Z.
  group.rotation.y = Math.PI;
  group.position.set(...at);
  // the rotor pops out of the intake face (against the airflow) when the atlas reaches "every piece"
  const part = fanNode(id, `${id}-rotor`, { group, rotor }, { explode, rotorDir: [0, 0, -1] });
  part.object.userData.rotors = [rotor];
  return part;
}

export function buildCaseFans(): PartNode[] {
  return [
    caseFan("fan-front-1", [-20, 175, 284.5], { stage: 2, dir: [0, 0, 1], dist: 200, lag: 0 }),
    caseFan("fan-front-2", [-20, 325, 284.5], { stage: 2, dir: [0, 0, 1], dist: 200, lag: 0.15 }),
    caseFan("fan-front-3", [-20, 475, 284.5], { stage: 2, dir: [0, 0, 1], dist: 200, lag: 0.3 }),
    caseFan("fan-rear", [-20, 470, -304.5], { stage: 2, dir: [0, 0, -1], dist: 160 }),
  ];
}
