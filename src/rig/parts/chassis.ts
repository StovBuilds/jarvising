// The full-tower case — 268 × 639 × 659 mm (W × H × D).
// Machine frame: x ∈ [-134, 134], y ∈ [0, 639], z ∈ [-329.5, 329.5].
// The frame is the anchor of the whole exploded view (it never moves); the
// panels, the shroud, the front I/O and the feet come off it in stage 1–3.
// No logos or marks: a plain full tower with glass on the viewer's side.
//
// Emits: case-frame, glass-left, panel-right, panel-front, panel-top,
// psu-shroud, front-io, case-feet (each exactly once).

import * as THREE from "three";
import type { PartNode } from "../types";
import { MAT, box, boxMin, cyl, decor, glow, node, plateWithHole } from "./prims";

const W = 268, H = 639, D = 659;
const X0 = -W / 2, X1 = W / 2;
const Z0 = -D / 2, Z1 = D / 2;
const BASE = 30;        // body starts above the feet
const TOP = 609;        // interior ceiling (top frame plate)
const TRAY_X = -100;    // motherboard tray plane (board face at -97)

const vent = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.8, metalness: 0.4 });

function frame(): PartNode {
  const rz = Z0 + 4.5;
  // floor + PSU rail
  const floorParts: THREE.Object3D[] = [
    boxMin(W - 8, 4, D - 34, MAT.steel, [X0 + 4, BASE, Z0 + 4]),
    boxMin(W - 8, 3, 210, MAT.steel, [X0 + 4, 36, Z0 + 4]),
  ];
  // rear panel: a square with the rear-fan opening (fan at x 30, y 470, r 72)
  // plus four plain plates filling the rest of the rear face
  const rearParts: THREE.Object3D[] = [
    plateWithHole(160, 160, 3, 74, MAT.steel, "z", [30, 470, rz], 4),
    boxMin(-50 - (X0 + 4), TOP - BASE, 3, MAT.steel, [X0 + 4, BASE, rz - 1.5]),      // tray side
    boxMin(X1 - 4 - 110, TOP - BASE, 3, MAT.steel, [110, BASE, rz - 1.5]),            // glass side
    boxMin(160, 390 - BASE, 3, MAT.steel, [-50, BASE, rz - 1.5]),                     // below the fan
    boxMin(160, TOP - 550, 3, MAT.steel, [-50, 550, rz - 1.5]),                       // above the fan
    decor(boxMin(44, 112, 2, vent, [-99, 438, Z0 + 2])),                              // rear I/O opening
  ];
  // PCIe slot covers: 8 vented steel tabs below the top slot, next to the tray
  for (let i = 0; i < 8; i++) {
    const y = 356 - i * 20.32;
    rearParts.push(decor(boxMin(112, 16, 1.2, MAT.steel, [-96, y - 8, Z0 + 5.5])));
    rearParts.push(decor(boxMin(90, 1.6, 1.4, vent, [-85, y - 1, Z0 + 5.4])));
  }
  // motherboard tray + cable grommets
  const trayParts: THREE.Object3D[] = [boxMin(2, TOP - 180, D - 60, MAT.steel, [TRAY_X - 1, 180, Z0 + 20])];
  for (const [y, z] of [[300, -60], [440, -60], [560, -60], [230, -300]] as const) {
    trayParts.push(decor(box(2.4, 80, 22, vent, [TRAY_X, y, z], 6)));
  }
  // top frame plate (perforated look: dark vent with a steel rim)
  const topParts: THREE.Object3D[] = [
    boxMin(W - 8, 3, D - 34, vent, [X0 + 4, TOP, Z0 + 4]),
    decor(boxMin(W - 8, 3.4, 14, MAT.steel, [X0 + 4, TOP - 0.2, Z0 + 4])),
    decor(boxMin(W - 8, 3.4, 14, MAT.steel, [X0 + 4, TOP - 0.2, Z1 - 30])),
  ];
  // corner posts stay with the frame — it is the anchor of the exploded view
  const posts: THREE.Object3D[] = [];
  for (const x of [X0 + 12, X1 - 12]) for (const z of [Z0 + 12, Z1 - 40]) {
    posts.push(box(20, TOP - BASE, 20, MAT.aluDark, [x, (TOP + BASE) / 2, z], 3));
  }
  return node("case-frame", posts, {
    children: [
      node("case-floor", floorParts, { explode: { stage: 4, dir: [0, -1, 0], dist: 60, lag: 0.2 } }),
      node("case-rear", rearParts, { explode: { stage: 4, dir: [0, 0, -1], dist: 90, lag: 0.1 } }),
      node("case-tray", trayParts, { explode: { stage: 4, dir: [-1, 0, 0], dist: 70 } }),
      node("case-top-frame", topParts, { explode: { stage: 4, dir: [0, 1, 0], dist: 70, lag: 0.3 } }),
    ],
  });
}

function glassLeft(): PartNode {
  const g = box(4, 590, 620, MAT.glass, [X1 - 2, 40 + 295, Z0 + 10 + 310]);
  g.castShadow = false;
  // hinge + latch trims
  const trimTop = decor(box(5, 6, 620, MAT.aluDark, [X1 - 2.5, 40 + 590 - 3, Z0 + 10 + 310]));
  const trimBot = decor(box(5, 6, 620, MAT.aluDark, [X1 - 2.5, 43, Z0 + 10 + 310]));
  return node("glass-left", [g, trimTop, trimBot], { explode: { stage: 1, dir: [1, 0, 0], dist: 260 } });
}

function panelRight(): PartNode {
  const p = box(4, 590, 620, MAT.steel, [X0 + 2, 40 + 295, Z0 + 10 + 310], 2);
  const vents = decor(boxMin(1, 200, 60, vent, [X0 + 4, 380, Z1 - 120]));
  return node("panel-right", [p, vents], { explode: { stage: 1, dir: [-1, 0, 0], dist: 200 } });
}

function panelFront(): PartNode {
  const parts: THREE.Object3D[] = [];
  // angular front assembly: a shell 30 mm deep with a large mesh intake
  parts.push(boxMin(W, 24, 30, MAT.aluDark, [X0, BASE, Z1 - 30]));                 // bottom lip
  parts.push(boxMin(W, 40, 30, MAT.aluDark, [X0, TOP - 16, Z1 - 30]));            // top lip
  parts.push(boxMin(34, TOP - BASE, 30, MAT.aluDark, [X0, BASE, Z1 - 30]));       // side pillars
  parts.push(boxMin(34, TOP - BASE, 30, MAT.aluDark, [X1 - 34, BASE, Z1 - 30]));
  parts.push(boxMin(W - 68, TOP - BASE - 64, 3, MAT.mesh, [X0 + 34, BASE + 24, Z1 - 4]));   // intake mesh
  // two vertical accent light bars either side of the intake
  parts.push(decor(box(4, TOP - BASE - 90, 2, glow(0xe8a33a, 0.8), [X0 + 36, (TOP + BASE) / 2, Z1 - 1])));
  parts.push(decor(box(4, TOP - BASE - 90, 2, glow(0xe8a33a, 0.8), [X1 - 36, (TOP + BASE) / 2, Z1 - 1])));
  // front dust filter behind the mesh
  parts.push(decor(boxMin(W - 80, TOP - BASE - 80, 1, vent, [X0 + 40, BASE + 32, Z1 - 30])));
  return node("panel-front", parts, { explode: { stage: 1, dir: [0, 0, 1], dist: 260 } });
}

function panelTop(): PartNode {
  const parts: THREE.Object3D[] = [];
  parts.push(boxMin(W, 6, D - 30, MAT.aluDark, [X0, H - 6, Z0], 2));
  // long vent insert over the radiator
  parts.push(decor(boxMin(150, 1, 420, MAT.mesh, [-110, H - 0.4, -240])));
  // magnetic dust filter frame
  parts.push(decor(boxMin(158, 1.4, 428, MAT.aluDark, [-114, H - 0.2, -244])));
  return node("panel-top", parts, { explode: { stage: 1, dir: [0, 1, 0], dist: 300 } });
}

function psuShroud(): PartNode {
  const parts: THREE.Object3D[] = [];
  const y0 = BASE + 4, y1 = 150;
  const z0 = Z0 + 6, z1 = 60;
  // top of the shroud
  parts.push(boxMin(X1 - 8 - (TRAY_X + 2), 3, z1 - z0, MAT.steel, [TRAY_X + 2, y1 - 3, z0]));
  // viewer-side face, with a window over the PSU's display (y 92 ± 15, z -140 ± 35)
  const faceX = X1 - 10;
  parts.push(boxMin(3, y1 - y0, (-175) - z0, MAT.steel, [faceX, y0, z0]));           // rear part
  parts.push(boxMin(3, y1 - y0, z1 - (-105), MAT.steel, [faceX, y0, -105]));        // front part
  parts.push(boxMin(3, 77 - y0 + 0, 70, MAT.steel, [faceX, y0, -175]));              // below window
  parts.push(boxMin(3, y1 - 107, 70, MAT.steel, [faceX, 107, -175]));                // above window
  // front face of the shroud + a cable pass-through slot on top
  parts.push(boxMin(X1 - 8 - (TRAY_X + 2), y1 - y0, 3, MAT.steel, [TRAY_X + 2, y0, z1 - 3]));
  parts.push(decor(box(60, 2, 12, vent, [40, y1 - 2.4, -40], 4)));
  parts.push(decor(box(60, 2, 12, vent, [40, y1 - 2.4, 20], 4)));
  return node("psu-shroud", parts, { explode: { stage: 3, dir: [1, 0, 0], dist: 240, lag: 0.3 } });
}

function frontIo(): PartNode {
  const parts: THREE.Object3D[] = [];
  const y = 618, z = Z1 - 60;
  parts.push(box(150, 14, 40, MAT.aluDark, [-20, y, z], 3));
  // power button (lit ring), two USB-A, one USB-C, audio jack
  parts.push(decor(cyl(6, 2, MAT.plastic, "y", [-70, y + 7.5, z], 24)));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.8, 8, 40), glow(0xe8a33a, 1));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-70, y + 7.6, z);
  parts.push(decor(ring));
  for (const x of [-40, -24]) parts.push(decor(box(13, 2, 6, vent, [x, y + 7.6, z])));
  parts.push(decor(box(9, 2, 3.2, vent, [-6, y + 7.6, z], 1.5)));
  parts.push(decor(cyl(3, 2, vent, "y", [10, y + 7.6, z], 16)));
  return node("front-io", parts, { explode: { stage: 3, dir: [0, 1, 0], dist: 80 } });
}

function feet(): PartNode {
  const parts: THREE.Object3D[] = [];
  for (const x of [X0 + 50, X1 - 50]) {
    parts.push(box(46, BASE, 560, MAT.aluDark, [x, BASE / 2, 0], 6));
    for (const z of [-250, 250]) parts.push(decor(box(40, 4, 60, MAT.tube, [x, 2, z], 2)));
  }
  return node("case-feet", parts, { explode: { stage: 1, dir: [0, -1, 0], dist: 80 } });
}

/** The chassis as top-level nodes (the frame first — it is the explode anchor). */
export function buildChassis(): PartNode[] {
  return [frame(), glassLeft(), panelRight(), panelFront(), panelTop(), psuShroud(), frontIo(), feet()];
}
