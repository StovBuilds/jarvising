// The DDR5 memory kit — two 32GB DDR5-6000 DIMMs in slots A2/B2.
// A DDR5 module is 133.35 mm long; with its heatspreaders this one stands
// ~44 mm above the contact edge and ~8 mm thick. Built in the machine frame:
// the module is vertical (length along Y), plugged into a slot at z, its
// contact edge inside the slot at x = -93 and its RGB diffuser at the top of
// its height toward +X. It pulls OUT of the slot along +X in stage 3 — the
// same axis it was inserted on.
//
// Emits per DIMM: dimm-<k>, dimm-<k>-pcb, dimm-<k>-heatspreader-l/-r, dimm-<k>-diffuser.

import type { PartNode } from "../types";
import { BOARD } from "./board";
import { MAT, box, chipRow, decor, node } from "./prims";

const LEN = 133.35;

export function buildDimm(k: "a" | "b"): PartNode {
  const z = k === "a" ? BOARD.dimmZ[1] : BOARD.dimmZ[3];
  const y = BOARD.dimmY;
  const pcbX0 = -93;                       // contact edge inside the slot
  const pcb = node(`dimm-${k}-pcb`, [
    box(31, LEN, 1.2, MAT.pcb, [pcbX0 + 15.5, y, z]),
    decor(box(6, LEN - 8, 1.3, MAT.gold, [pcbX0 + 3, y, z])),                    // contact strip
  ]);
  const chips = node(`dimm-${k}-chips`, [
    chipRow(8, 15, 12, 11, 1, MAT.silicon, "y", [pcbX0 + 20, y, z + 1.1]),        // memory packages, both faces
    chipRow(8, 15, 12, 11, 1, MAT.silicon, "y", [pcbX0 + 20, y, z - 1.1]),
    decor(box(4, 10, 1, MAT.silicon, [pcbX0 + 9, y + 20, z + 1.1])),             // PMIC
  ], { explode: { stage: 4, dir: [1, 0, 0], dist: 12, lag: 0.3 } });
  const hsL = node(`dimm-${k}-heatspreader-l`, [
    box(36, LEN, 2, MAT.aluDark, [-88 + 18, y, z - 2.3], 0.8),
    decor(box(1, LEN - 20, 2.2, MAT.alu, [-88 + 30, y, z - 2.3])),               // a machined line
  ], { explode: { stage: 4, dir: [0, 0, -1], dist: 22 } });
  const hsR = node(`dimm-${k}-heatspreader-r`, [
    box(36, LEN, 2, MAT.aluDark, [-88 + 18, y, z + 2.3], 0.8),
    decor(box(1, LEN - 20, 2.2, MAT.alu, [-88 + 30, y, z + 2.3])),
  ], { explode: { stage: 4, dir: [0, 0, 1], dist: 22 } });
  const diffuser = node(`dimm-${k}-diffuser`, [
    box(4, LEN - 2, 7, MAT.rgb, [-52 + 2, y, z], 1.5),
  ], { explode: { stage: 4, dir: [1, 0, 0], dist: 25 } });
  return node(`dimm-${k}`, [], {
    children: [pcb, chips, hsL, hsR, diffuser],
    explode: { stage: 3, dir: [1, 0, 0], dist: 90, lag: k === "a" ? 0 : 0.1 },
  });
}
