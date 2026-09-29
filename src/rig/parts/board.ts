// The E-ATX motherboard (305 × 277) + the 8-core processor in its
// land-grid-array socket. Built in the machine frame: PCB face at x = -97,
// components protrude +X. Board spans y ∈ [244, 549], z ∈ [-309.5, -32.5];
// the rear I/O edge is at the rear (-Z), the top edge at y = 549.
//
// The "motherboard" node is the root of the whole board assembly: its own
// meshes are the PCB; the heatsinks, slots and sockets are children, and the
// assembler attaches the CPU, DIMMs and SSD as children too, so the assembly
// lifts off the tray as one piece in stage 2 and splits in stage 3.
//
// Emits: motherboard, vrm-heatsink-top, vrm-heatsink-side, io-shroud,
// chipset-heatsink, m2-heatsink, pcie-slot-1, pcie-slot-2, dimm-slots,
// atx-24pin-socket, eps-sockets, rear-io, cpu-socket, cpu, cpu-ihs,
// cpu-substrate.

import * as THREE from "three";
import type { PartNode } from "../types";
import { MAT, box, boxMin, chipRow, cyl, decor, finStack, glow, node } from "./prims";

export const BOARD = {
  x: -97,                 // PCB face
  y0: 244, y1: 549,
  z0: -309.5, z1: -32.5,
  socket: { y: 454, z: -214.5 },
  dimmZ: [-152.5, -142, -131.5, -121] as const,
  dimmY: 449,
  pcie1Y: 354, pcie2Y: 293,
  pcieZ: [-301.5, -212.5] as const,
  m2: { y: 394, z0: -250, z1: -170 },
} as const;

const X = BOARD.x;
const dark = new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.8, metalness: 0.4 });

function pcb(): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  parts.push(boxMin(2, BOARD.y1 - BOARD.y0, BOARD.z1 - BOARD.z0, MAT.pcb, [X - 2, BOARD.y0, BOARD.z0]));
  // a handful of small surface-mount bits so the board is not a bare slab
  parts.push(decor(chipRow(6, 14, 1.2, 6, 9, MAT.plastic, "z", [X + 0.6, 265, -140])));   // audio caps row
  parts.push(decor(chipRow(4, 12, 1.2, 5, 5, MAT.silicon, "z", [X + 0.6, 380, -80])));
  parts.push(decor(box(1.2, 18, 18, MAT.silicon, [X + 0.6, 300, -160])));                  // a controller
  parts.push(decor(box(1.2, 12, 12, MAT.silicon, [X + 0.6, 330, -70])));
  // front-panel header block + fan headers along the bottom edge
  for (let i = 0; i < 4; i++) parts.push(decor(box(8, 5, 10, MAT.plastic, [X + 4, BOARD.y0 + 6, -70 - i * 26])));
  // 4 mounting standoff screws
  for (const [y, z] of [[260, -300], [260, -45], [540, -300], [540, -45]] as const) {
    parts.push(decor(cyl(2.4, 1.2, MAT.nickel, "x", [X + 0.6, y, z], 12)));
  }
  return parts;
}

function cpuSocket(): PartNode {
  const { y, z } = BOARD.socket;
  const parts: THREE.Object3D[] = [];
  parts.push(box(6, 60, 60, MAT.plastic, [X + 3, y, z], 1.5));            // socket body
  parts.push(box(1.6, 42, 42, MAT.gold, [X + 6.2, y, z]));                 // LGA pad field
  // socket retention frame: two rails and a lever
  parts.push(decor(box(4, 66, 8, MAT.steel, [X + 8, y, z - 36])));
  parts.push(decor(box(4, 66, 8, MAT.steel, [X + 8, y, z + 36])));
  parts.push(decor(box(2, 3, 62, MAT.steel, [X + 9, y - 33, z])));
  parts.push(decor(cyl(1.8, 46, MAT.steel, "y", [X + 12, y - 12, z + 42], 10)));
  return node("cpu-socket", parts);
}

function cpu(): PartNode {
  const { y, z } = BOARD.socket;
  // the package sits on the pad field: substrate from x -91 → -89.8, IHS to -86.2
  const substrate = node("cpu-substrate", [box(1.2, 40, 40, MAT.substrate, [-90.4, y, z])]);
  // under the lid: two core chiplets + the I/O die + the stacked cache — the
  // physical counterpart of the micro scene; they lift a little once the lid is off
  const dies = node("cpu-dies", [
    box(0.8, 8, 9, MAT.silicon, [-89.4, y + 9, z - 9]),
    box(0.8, 8, 9, MAT.silicon, [-89.4, y - 9, z - 9]),
    box(0.8, 11, 14, MAT.silicon, [-89.4, y, z + 8]),
    box(0.4, 6, 7, MAT.nickel, [-88.8, y + 9, z - 9]),
  ], { explode: { stage: 4, dir: [1, 0, 0], dist: 12, lag: 0.4 } });
  const ihs = node("cpu-ihs", [box(3.6, 40, 40, MAT.nickel, [-88.0, y, z], 1.5)], {
    explode: { stage: 4, dir: [1, 0, 0], dist: 30 },
  });
  return node("cpu", [], { children: [substrate, dies, ihs], explode: { stage: 3, dir: [1, 0, 0], dist: 60 } });
}

function dimmSlots(): PartNode {
  const parts: THREE.Object3D[] = [];
  for (const z of BOARD.dimmZ) {
    parts.push(box(9, 147, 7.5, MAT.plastic, [X + 4.5, BOARD.dimmY, z]));
    parts.push(decor(box(4, 6, 5, MAT.plastic, [X + 11, BOARD.dimmY + 70, z])));   // latches
    parts.push(decor(box(4, 6, 5, MAT.plastic, [X + 11, BOARD.dimmY - 70, z])));
  }
  return node("dimm-slots", parts);
}

function pcieSlot(id: "pcie-slot-1" | "pcie-slot-2", y: number, reinforced: boolean): PartNode {
  const [z0, z1] = BOARD.pcieZ;
  const parts: THREE.Object3D[] = [box(11, 7.5, z1 - z0, MAT.plastic, [X + 5.5, y, (z0 + z1) / 2])];
  if (reinforced) parts.push(decor(box(11.6, 8.4, z1 - z0 + 4, MAT.steel, [X + 5.8, y, (z0 + z1) / 2])));
  parts.push(decor(box(4, 3, 8, MAT.plastic, [X + 12, y, z1 + 3])));            // latch
  return node(id, parts);
}

function atx24(): PartNode {
  const parts = [box(12, 52, 10, MAT.plastic, [X + 6, 455, -42.5])];
  parts.push(decor(box(2, 46, 6, dark, [X + 12, 455, -42.5])));
  return node("atx-24pin-socket", parts);
}

function eps(): PartNode {
  const parts: THREE.Object3D[] = [];
  for (const z of [-292, -278]) {
    parts.push(box(12, 10, 13, MAT.plastic, [X + 6, 541, z]));
    parts.push(decor(box(2, 6, 10, dark, [X + 12, 541, z])));
  }
  return node("eps-sockets", parts);
}

function rearIo(): PartNode {
  const parts: THREE.Object3D[] = [box(37, 105, 19.5, MAT.aluDark, [X + 18.5, 492.5, -299.75], 1)];
  // ports face -Z through the rear panel: a grid of dark recesses, two antenna posts
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    parts.push(decor(box(13, 6, 1.2, dark, [X + 8 + j * 14, 455 + i * 14, BOARD.z0 - 0.4])));
  }
  parts.push(decor(box(20, 14, 1.2, dark, [X + 18, 522, BOARD.z0 - 0.4])));           // LAN
  parts.push(decor(box(14, 6, 1.2, dark, [X + 18, 536, BOARD.z0 - 0.4])));            // USB4
  for (const y of [448, 542]) parts.push(decor(cyl(3, 6, MAT.gold, "z", [X + 30, y, BOARD.z0 - 3], 12)));
  return node("rear-io", parts);
}

function ioShroud(): PartNode {
  const parts: THREE.Object3D[] = [];
  // an angular cover over the I/O block and the side VRM, open toward the socket
  parts.push(box(42, 119, 39.5, MAT.aluDark, [X + 21, 489.5, -289.75], 3));
  parts.push(decor(box(2, 60, 3, glow(0xe8a33a, 0.7), [X + 42.3, 500, -282])));     // accent line
  parts.push(decor(box(30, 2, 30, dark, [X + 22, 548.6, -286])));                    // top vent
  return node("io-shroud", parts, { explode: { stage: 3, dir: [1, 0, 0], dist: 90, lag: 0.2 } });
}

function vrmTop(): PartNode {
  const parts: THREE.Object3D[] = [];
  parts.push(box(8, 45, 102, MAT.aluDark, [X + 4, 522.5, -211]));                     // base
  parts.push(finStack(24, 4.1, 27, 43, 1.2, MAT.aluDark, "z", [X + 21.5, 522.5, -211]));
  parts.push(decor(chipRow(8, 12, 6, 5, 7, MAT.plastic, "z", [X + 3, 522.5 - 24, -211])));  // chokes under the fins
  return node("vrm-heatsink-top", parts, { explode: { stage: 3, dir: [1, 0, 0], dist: 70, lag: 0.1 } });
}

function vrmSide(): PartNode {
  const parts: THREE.Object3D[] = [];
  parts.push(box(8, 105, 23, MAT.aluDark, [X + 4, 447.5, -258.5]));
  parts.push(finStack(20, 5.2, 21, 27, 1.2, MAT.aluDark, "y", [X + 21.5, 447.5, -258.5]));
  return node("vrm-heatsink-side", parts, { explode: { stage: 3, dir: [1, 0, 0], dist: 70, lag: 0.15 } });
}

function m2Heatsink(): PartNode {
  const parts: THREE.Object3D[] = [];
  parts.push(box(8, 28, 84, MAT.aluDark, [X + 11, BOARD.m2.y, (BOARD.m2.z0 + BOARD.m2.z1) / 2 - 2], 1.5));
  parts.push(decor(box(0.8, 22, 78, MAT.pad, [X + 6.8, BOARD.m2.y, (BOARD.m2.z0 + BOARD.m2.z1) / 2 - 2])));  // thermal pad
  parts.push(decor(box(8.4, 2, 84, glow(0xe8a33a, 0.6), [X + 11, BOARD.m2.y + 14.8, (BOARD.m2.z0 + BOARD.m2.z1) / 2 - 2])));
  return node("m2-heatsink", parts, { explode: { stage: 3, dir: [1, 0, 0], dist: 110 } });
}

function chipsetHeatsink(): PartNode {
  const parts: THREE.Object3D[] = [];
  // one broad low plate over the chipset and the lower M.2 bays
  parts.push(box(5.5, 90, 190, MAT.aluDark, [X + 2.75, 295, -140], 1));
  parts.push(decor(box(0.6, 60, 60, dark, [X + 5.9, 300, -80])));                    // a matte inset
  parts.push(decor(chipRow(3, 30, 1, 8, 8, MAT.nickel, "z", [X + 5.9, 275, -200])));  // M.2 screw posts
  return node("chipset-heatsink", parts, { explode: { stage: 3, dir: [1, 0, 0], dist: 80, lag: 0.25 } });
}

/** The board assembly. `extra` = CPU-adjacent nodes built elsewhere (DIMMs, SSD)
 * that must ride with the board in stage 2. */
export function buildBoard(extra: PartNode[]): PartNode {
  const children: PartNode[] = [
    cpuSocket(), cpu(), dimmSlots(),
    pcieSlot("pcie-slot-1", BOARD.pcie1Y, true), pcieSlot("pcie-slot-2", BOARD.pcie2Y, false),
    atx24(), eps(), rearIo(), ioShroud(), vrmTop(), vrmSide(), m2Heatsink(), chipsetHeatsink(),
    ...extra,
  ];
  return node("motherboard", pcb(), { children, explode: { stage: 2, dir: [1, 0, 0], dist: 70 } });
}
