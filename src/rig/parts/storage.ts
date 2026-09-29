// The 4TB NVMe SSD — M.2 2280 (22 × 80 mm), PCIe 5.0 x4 NVMe. Sits in
// M.2_1 under the board's m2-heatsink, raised ~3.5 mm off the PCB by the
// socket, running along Z from the socket at the rear end toward the front.
//
// Emits: ssd, ssd-pcb, ssd-controller, ssd-nand, ssd-label.

import type { PartNode } from "../types";
import { BOARD } from "./board";
import { MAT, box, chipRow, decor, node } from "./prims";

export function buildSsd(): PartNode {
  const { y, z0, z1 } = BOARD.m2;
  const zc = (z0 + z1) / 2;
  const xPcb = -93.1;                              // PCB mid-plane
  const pcb = node("ssd-pcb", [
    box(0.8, 22, 80, MAT.pcb, [xPcb, y, zc]),
    decor(box(1.0, 18, 5, MAT.gold, [xPcb, y, z0 + 2.5])),                    // M-key edge
    decor(box(0.6, 3, 3, MAT.nickel, [xPcb, y, z1 - 3])),                     // mounting screw
  ]);
  const controller = node("ssd-controller", [
    box(1.1, 12, 12, MAT.silicon, [xPcb + 0.95, y, z0 + 16]),
  ], { explode: { stage: 4, dir: [1, 0, 0], dist: 8 } });
  const nand = node("ssd-nand", [
    chipRow(2, 22, 1.2, 14, 18, MAT.silicon, "z", [xPcb + 1.0, y, z0 + 47]),
  ], { explode: { stage: 4, dir: [1, 0, 0], dist: 8, lag: 0.1 } });
  const label = node("ssd-label", [
    box(0.15, 18, 58, MAT.label, [xPcb + 1.75, y, z0 + 44]),
  ], { explode: { stage: 4, dir: [1, 0, 0], dist: 14 } });
  return node("ssd", [], {
    children: [pcb, controller, nand, label],
    explode: { stage: 3, dir: [1, 0, 0], dist: 50, lag: 0.1 },
  });
}
