// Inside the Rig — the flagship-class graphics card (quad fan, vapor
// chamber, nearly four slots thick). Built in its INSTALLED orientation: PCB horizontal,
// cooler hanging below it (fans face -Y), the card's "top edge" (power
// connector, light bar) facing +X = the glass. The assembler drops the whole
// node at the PCIe slot with a translation only.
//
// LOCAL FRAME: mm. Origin = centre of the PCIe edge connector's contact edge,
// on the PCB plane (PCB top face y = 0). +Z = toward the case front (away from
// the bracket), +X = up the card's height toward the glass, +Y = up.
//
// BOUNDING BOX (assembled, local mm):
//   x ∈ [-8,   141.2]   bracket lip at -8 … shroud wall 140 + facet strips
//   y ∈ [-72,  3.5]     bracket bottom -72 … backplate top 3.5
//   z ∈ [-51.5, 307.6]  bracket screw head -51.5 … cooler end 307.6 (357.6 incl. bracket)
//
// IDS EMITTED (every ids.ts id starting with "gpu", exactly once — 17):
//   gpu, gpu-pcb, gpu-edge-connector, gpu-shroud, gpu-fan-1, gpu-fan-2,
//   gpu-fan-3, gpu-fan-4, gpu-backplate, gpu-heatsink, gpu-vapor-chamber,
//   gpu-heatpipes, gpu-die, gpu-gddr7, gpu-vrm, gpu-power-connector, gpu-bracket
//
// DEVIATIONS FROM THE BRIEF (all geometric — see the report):
//   • PCB ends at z = 210 (brief: 260) so the flow-through zone is real and
//     fan 4 no longer intersects the PCB.
//   • fan 4 centre z = 258.6 (brief: 265): a 46 mm cutout at 265 would breach
//     the backplate end at 307.6. It sits at y = -8.3 (brief: +3) so the frame
//     is flush UNDER the backplate instead of standing 8.5 mm proud of it.
//   • fans 1–3 at y = -60 (brief: -62) so the frame hides behind the shroud's
//     round openings instead of sitting 1 mm proud of the underside.
//   • heatpipes are TubeGeometry that dip from y -9.5 to -22 after z ≈ 200,
//     clearing fan 4's blades; straight cylinders at -9.5 would run through them.
//   • fan rotation signs chosen so the ring/face side is the visible side
//     (fans 1–3 rotation.x = +90° → face -Y; fan 4 -90° → face +Y).
//
// ~17k triangles total (fans ≈ 2.3k each, fin stack 189 instances × 12).

import * as THREE from "three";
import type { PartNode } from "../types";
import type { PartId } from "../ids";
import { MAT, box, boxMin, cyl, plateWithHole, finStack, chipRow, fan, node, decor, deg, glow, fanNode } from "./prims";

type V3 = [number, number, number];

// ── layout constants (local mm) ─────────────────────────────────────────────
const CARD_START = -48;          // shroud + PCB start (bracket plate at -50)
const CARD_END = 307.6;          // far end of the cooler
const PCB_END = 210;             // PCB stops here; 210..307.6 is flow-through
const PCB_H = 128;               // PCB top edge (+X)
const SHROUD_X0 = 4, SHROUD_X1 = 140;
const SHROUD_Y0 = -71, SHROUD_Y1 = -4;
const WALL = 2.5;                // shroud sheet thickness
const FAN_Z = [30, 135, 240] as const;
const FAN_Y = -60;               // fans 1–3 centre (frame y -70..-50)
const FAN_X = 72;
const FAN4_Z = CARD_END - 49;    // 258.6 — 98 mm end panel centred here
const FAN4_Y = -8.3;             // frame y -17.3..0.7, flush under the backplate (y 1)
const PWR_Z0 = 125, PWR_Z1 = 145; // 16-pin connector z extent

const ringWhite = 0xdfe8ff;
const shroudAccent = glow(ringWhite, 0.7);

// ── small local helpers ─────────────────────────────────────────────────────

/** Instanced cylinders standing along Y (capacitor banks). */
function capRow(count: number, pitch: number, r: number, len: number, mat: THREE.Material, at: V3, along: "x" | "z"): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, len, 12), mat, count);
  const m = new THREE.Matrix4();
  const span = (count - 1) * pitch;
  for (let i = 0; i < count; i++) {
    const p: V3 = [at[0], at[1], at[2]];
    p[along === "x" ? 0 : 2] += -span / 2 + i * pitch;
    m.makeTranslation(...p);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = im.receiveShadow = true;
  return im;
}

/** A heatpipe that runs straight under the vapor chamber then dips into the
 * fin stack for the flow-through zone (clears fan 4). */
function heatpipe(x: number): THREE.Mesh {
  const pts = [
    new THREE.Vector3(x, -9.5, -20),
    new THREE.Vector3(x, -9.5, 60),
    new THREE.Vector3(x, -9.5, 190),
    new THREE.Vector3(x, -22, 222),
    new THREE.Vector3(x, -22, 280),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 3, 10, false), MAT.nickel);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ── builder ────────────────────────────────────────────────────────────────

export function buildGpu(): PartNode {
  // PCB — 1.6 thick, top face at y = 0 ------------------------------------
  const pcb = node("gpu-pcb", [
    boxMin(PCB_H, 1.6, PCB_END - CARD_START, MAT.pcb, [0, -1.6, CARD_START]),
  ]);

  // PCIe x16 edge connector: gold fingers both faces, keyed 11 + 64 pins ----
  const fingers: THREE.Mesh[] = [];
  for (const [y0] of [[-0.05], [-1.9]] as [number][]) {
    fingers.push(boxMin(9, 0.35, 11, MAT.gold, [0, y0, -44.5]));      // short side of the key
    fingers.push(boxMin(9, 0.35, 76, MAT.gold, [0, y0, -31.5]));      // long side of the key
  }
  const edgeConnector = node("gpu-edge-connector", fingers);

  // Shroud — dark frame under the PCB with three round fan openings ---------
  const shroudParts: THREE.Object3D[] = [];
  const panelY = SHROUD_Y0 + WALL / 2;
  for (const z of FAN_Z) {
    shroudParts.push(plateWithHole(SHROUD_X1 - SHROUD_X0, 105, WALL, 51, MAT.plastic, "y", [FAN_X, panelY, z], 0.5));
  }
  // filler strips either end of the three fan panels (z -48..-22.5 and 292.5..307.6)
  shroudParts.push(boxMin(SHROUD_X1 - SHROUD_X0, WALL, FAN_Z[0] - 52.5 - CARD_START, MAT.plastic, [SHROUD_X0, SHROUD_Y0, CARD_START]));
  shroudParts.push(boxMin(SHROUD_X1 - SHROUD_X0, WALL, CARD_END - (FAN_Z[2] + 52.5), MAT.plastic, [SHROUD_X0, SHROUD_Y0, FAN_Z[2] + 52.5]));
  // slot-side wall (toward the motherboard): up to just under the PCB
  shroudParts.push(boxMin(WALL, -1.9 - SHROUD_Y0, CARD_END - CARD_START, MAT.aluDark, [SHROUD_X0, SHROUD_Y0, CARD_START]));
  // glass-side wall: rises to meet the backplate, notched around the 16-pin
  const wallX = SHROUD_X1 - WALL;
  const wallTop = 0.7;                       // 0.3 under the backplate (y 1)
  const notchZ0 = PWR_Z0 - 7, notchZ1 = PWR_Z1 + 7;
  shroudParts.push(boxMin(WALL, wallTop - SHROUD_Y0, notchZ0 - CARD_START, MAT.aluDark, [wallX, SHROUD_Y0, CARD_START]));
  shroudParts.push(boxMin(WALL, -17 - SHROUD_Y0, notchZ1 - notchZ0, MAT.aluDark, [wallX, SHROUD_Y0, notchZ0]));
  shroudParts.push(boxMin(WALL, wallTop - SHROUD_Y0, CARD_END - notchZ1, MAT.aluDark, [wallX, SHROUD_Y0, notchZ1]));
  // end cap at the flow-through end
  shroudParts.push(boxMin(SHROUD_X1 - SHROUD_X0, wallTop - SHROUD_Y0, WALL, MAT.aluDark, [SHROUD_X0, SHROUD_Y0, CARD_END - WALL]));
  // two angular facet strips on the glass-side wall (set dressing) + light bar
  shroudParts.push(decor(box(1.2, 6, 150, MAT.plastic, [SHROUD_X1 + 0.6, -30, 40])));
  shroudParts.push(decor(box(1.2, 6, 120, MAT.plastic, [SHROUD_X1 + 0.6, -52, 230])));
  shroudParts.push(decor(box(0.8, 2.6, 110, shroudAccent, [SHROUD_X1 + 0.4, -9, 225])));
  const shroud = node("gpu-shroud", shroudParts, { explode: { stage: 4, dir: [0, -1, 0], dist: 70 } });

  // Fans 1–3 (100 mm, face down) + fan 4 (90 mm, face up, in the backplate) --
  const rotors: THREE.Group[] = [];
  const fanIds = ["gpu-fan-1", "gpu-fan-2", "gpu-fan-3"] as const satisfies readonly PartId[];
  const fanLags = [0.2, 0.3, 0.4];
  const fanNodes: PartNode[] = fanIds.map((id, i) => {
    const f = fan(100, 20, { rgb: ringWhite });
    f.group.rotation.x = deg(90);            // fan face (ring) → -Y, struts inside
    f.group.position.set(FAN_X, FAN_Y, FAN_Z[i]);
    rotors.push(f.rotor);
    return fanNode(id, `${id}-rotor`, f, { explode: { stage: 4, dir: [0, -1, 0], dist: 130, lag: fanLags[i] } });
  });
  const f4 = fan(90, 18);
  f4.group.rotation.x = deg(-90);            // fan face → +Y, struts under the blades
  f4.group.position.set(FAN_X, FAN4_Y, FAN4_Z);
  rotors.push(f4.rotor);
  fanNodes.push(fanNode("gpu-fan-4", "gpu-fan-4-rotor", f4, { explode: { stage: 4, dir: [0, 1, 0], dist: 70 } }));

  // Backplate — solid over the PCB, round cutout over fan 4 ------------------
  const bpX0 = 4, bpW = 134, bpY0 = 1, bpT = 2.5;
  const endPanelL = 98;                      // z 209.6..307.6, hole r 46 → 212.6..304.6
  const backplate = node("gpu-backplate", [
    boxMin(bpW, bpT, CARD_END - endPanelL - CARD_START, MAT.aluDark, [bpX0, bpY0, CARD_START]),
    plateWithHole(bpW, endPanelL, bpT, 46, MAT.aluDark, "y", [bpX0 + bpW / 2, bpY0 + bpT / 2, FAN4_Z], 1),
    decor(box(60, 0.4, 0.8, MAT.alu, [80, bpY0 + bpT + 0.2, 60])),     // etched line
    decor(box(0.8, 0.4, 90, MAT.alu, [110, bpY0 + bpT + 0.2, 105])),
  ], { explode: { stage: 4, dir: [0, 1, 0], dist: 45 } });

  // Heatsink — one fin stack, fins perpendicular to Z, z -40..300 ------------
  const finCount = Math.floor(340 / 1.8) + 1; // 189
  const heatsink = node("gpu-heatsink", [
    finStack(finCount, 1.8, 120, 40, 0.35, MAT.alu, "z", [FAN_X, -26, 130]),
  ], { explode: { stage: 4, dir: [0, -1, 0], dist: 32 } });

  // Vapor chamber ------------------------------------------------------------
  const vapor = node("gpu-vapor-chamber", [
    box(110, 5, 130, MAT.copper, [FAN_X, -6.5, 110]),
  ], { explode: { stage: 4, dir: [0, -1, 0], dist: 14 } });

  // Heatpipes — 8 nickel tubes fanned across x 20..124 ----------------------
  const pipes: THREE.Object3D[] = [];
  for (let i = 0; i < 8; i++) pipes.push(heatpipe(20 + (104 * i) / 7));
  const heatpipes = node("gpu-heatpipes", pipes, { explode: { stage: 4, dir: [0, -1, 0], dist: 22, lag: 0.1 } });

  // GPU package on the PCB underside ----------------------------------------
  const die = node("gpu-die", [
    box(45, 0.4, 45, MAT.nickel, [FAN_X, -1.9, 110]),        // stiffener / IHS frame
    box(32, 1.2, 32, MAT.silicon, [FAN_X, -2.5, 110]),       // the GB202 die
  ]);

  // 16 GDDR7 packages in a ring ~35 mm from the die centre, 4 per side ------
  const gddr: THREE.Object3D[] = [];
  const offs = [-22.5, -7.5, 7.5, 22.5];
  for (const o of offs) {
    gddr.push(box(12, 1, 14, MAT.silicon, [FAN_X - 35, -1.9, 110 + o]));
    gddr.push(box(12, 1, 14, MAT.silicon, [FAN_X + 35, -1.9, 110 + o]));
    gddr.push(box(14, 1, 12, MAT.silicon, [FAN_X + o, -1.9, 110 - 35]));
    gddr.push(box(14, 1, 12, MAT.silicon, [FAN_X + o, -1.9, 110 + 35]));
  }
  const gddr7 = node("gpu-gddr7", gddr);

  // VRM — choke rows along both long edges + capacitor banks -----------------
  const vrm = node("gpu-vrm", [
    chipRow(8, 9, 7, 5, 7, MAT.plastic, "z", [20, -3.9, 120]),
    chipRow(8, 9, 7, 5, 7, MAT.plastic, "z", [124, -3.9, 120]),
    capRow(8, 9, 2.2, 6, MAT.plastic, [30, -4.2, 120], "z"),
    capRow(8, 9, 2.2, 6, MAT.plastic, [114, -4.2, 120], "z"),
  ]);

  // 16-pin (12V-2×6) power connector at the top edge, mating toward +X ------
  const pwr: THREE.Object3D[] = [boxMin(10, 14, 20, MAT.plastic, [122, -14, PWR_Z0])];
  const pinX = 130.5;                        // 4 mm pins, 0.5 proud of the x = 132 face
  for (const row of [-5.5, -8.5]) {
    for (let i = 0; i < 6; i++) pwr.push(cyl(0.45, 4, MAT.gold, "x", [pinX, row, 135 - 7.5 + i * 3], 6));
  }
  for (let i = 0; i < 4; i++) pwr.push(cyl(0.35, 4, MAT.gold, "x", [pinX, -12, 135 - 2.25 + i * 1.5], 6));
  const powerConnector = node("gpu-power-connector", pwr, { explode: { stage: 4, dir: [1, 0, 0], dist: 25 } });

  // Rear I/O bracket — steel plate in XY at z = -50 ---------------------------
  const bracket = node("gpu-bracket", [
    boxMin(128, 76, 1.2, MAT.steel, [-8, -72, -50.6]),
    box(16, 5.5, 2.4, MAT.plastic, [18, -8, -50]),           // display output
    box(16, 5.5, 2.4, MAT.plastic, [38, -8, -50]),           // display output
    box(15, 5.5, 2.4, MAT.plastic, [58, -8, -50]),           // display output
    decor(box(44, 46, 0.6, MAT.mesh, [86, -42, -50.9])),      // vent slots
    decor(cyl(2.2, 1.2, MAT.alu, "z", [112, -60, -50.9], 12)),  // bracket screw head
  ], { explode: { stage: 4, dir: [0, 0, -1], dist: 30 } });

  const root = node("gpu", [], {
    explode: { stage: 2, dir: [1, -0.25, 0], dist: 220 },
    children: [
      pcb, edgeConnector, shroud, ...fanNodes, backplate, heatsink, vapor, heatpipes,
      die, gddr7, vrm, powerConnector, bracket,
    ],
  });
  root.object.userData.rotors = rotors;
  return root;
}
