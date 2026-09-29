// Inside the Rig — the 1600 W ATX power supply (200 × 150 × 86 mm,
// fully modular, magnetic OLED power readout, 135 mm fan). Built in its
// installed orientation: fan DOWN (-Y), AC inlet at the rear (-Z), modular
// panel at the front (+Z), OLED on the glass side (+X). The assembler places
// it with a translation only.
//
// LOCAL FRAME: mm. Origin = centre of the PSU's BOTTOM face.
//   body x ∈ [-75, 75], y ∈ [0, 86], z ∈ [-100, 100]
//
// BOUNDING BOX (assembled, local mm):
//   x ∈ [-75,    76.6]   shell … OLED glass proud on +X
//   y ∈ [-1.1,   86]     grille rings just under the bottom face … shell top
//   z ∈ [-108.3, 106.8]  C14 inlet blades proud at the rear … socket blocks proud at the front
//
// IDS EMITTED (every ids.ts id starting with "psu", exactly once — 8):
//   psu, psu-shell, psu-fan, psu-grille, psu-oled, psu-modular-panel,
//   psu-ac-inlet, psu-internals
//   ("psu-shroud" in ids.ts is the CASE's PSU shroud — a chassis part, not
//   built here.)
//
// DEVIATIONS FROM THE BRIEF (see the report):
//   • The shell is a HOLLOW six-plate box (bottom plate has a round fan
//     opening) rather than a solid RoundedBox: a solid shell's bottom face
//     would render across the fan, so the fan/grille could never be seen.
//     Corners are square as a result (sheet-steel look).
//   • Internals hang from the TOP (PCB at y 77), not y 8: with the fan in the
//     bottom face there is no room for a PCB at y 8 — real PSUs put the PCB on
//     the face opposite the fan.
//   • The tint "cover" is a black-glass bezel BEHIND the OLED plane, not in
//     front of it — MAT.tint is 85% opaque and would black out the readout.
//   • Rear honeycomb is 80 × 64 (brief 100 × 60) so it clears the inlet+switch.
//
// ~13k triangles (fan ≈ 1.4k, grille ≈ 3.8k, fins 24 instances, caps 6×24-seg).

import * as THREE from "three";
import type { PartNode } from "../types";
import { MAT, box, cyl, plateWithHole, finStack, chipRow, fan, screen, node, decor, deg, fanNode } from "./prims";

// ── layout constants (local mm) ─────────────────────────────────────────────
const W = 150, H = 86, L = 200;     // X, Y, Z
const T = 2;                        // sheet thickness
const FAN_HOLE_R = 66;              // bottom-plate opening (outermost grille ring)
const OLED_Y = 52, OLED_Z = -20;

// Local material variants (never mutate MAT.*)
const socketMat = new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 0.7, metalness: 0.1 });
const rockerRed = new THREE.MeshStandardMaterial({ color: 0xb3241f, roughness: 0.6, metalness: 0.05 });

export function buildPsu(): PartNode {
  // Shell — hollow sheet-steel box, round fan opening in the bottom plate ----
  const shell = node("psu-shell", [
    plateWithHole(W, L, T, FAN_HOLE_R, MAT.aluDark, "y", [0, T / 2, 0], 3),          // bottom, y 0..2
    box(W, T, L, MAT.aluDark, [0, H - T / 2, 0]),                                    // top, y 84..86
    box(T, H - 2 * T, L, MAT.aluDark, [-(W / 2 - T / 2), H / 2, 0]),                 // -X side
    box(T, H - 2 * T, L, MAT.aluDark, [W / 2 - T / 2, H / 2, 0]),                    // +X side (glass)
    box(W - 2 * T, H - 2 * T, T, MAT.aluDark, [0, H / 2, -(L / 2 - T / 2)]),         // rear (-Z)
    box(W - 2 * T, H - 2 * T, T, MAT.aluDark, [0, H / 2, L / 2 - T / 2]),            // front (+Z)
  ], { explode: { stage: 4, dir: [1, 0, 0], dist: 160 } });

  // Fan — 135 mm, face down, frame tucked 0.5 mm inside the bottom plate -----
  const pf = fan(135, 20);
  pf.group.rotation.x = deg(90);      // fan face → -Y (toward the grille), struts inside
  pf.group.position.set(0, 11.5, 0);  // frame y 1.5..21.5
  const psuFan = fanNode("psu-fan", "psu-fan-rotor", pf, { explode: { stage: 4, dir: [0, -1, 0], dist: 60 } });

  // Grille — nine concentric wire rings + four spokes + centre badge disc ----
  const grilleParts: THREE.Object3D[] = [];
  for (let i = 0; i < 9; i++) {
    const r = 8 + (i * (FAN_HOLE_R - 8)) / 8;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.6, 5, Math.max(20, Math.round(r * 0.9))), MAT.nickel);
    ring.rotation.x = deg(90);        // torus XY → XZ
    ring.position.y = -0.5;
    ring.castShadow = ring.receiveShadow = true;
    grilleParts.push(ring);
  }
  for (let k = 0; k < 4; k++) {
    const spoke = box(1.6, 0.9, 2 * FAN_HOLE_R + 2, MAT.nickel, [0, -0.55, 0]);
    spoke.rotation.y = deg(45 * k);
    grilleParts.push(decor(spoke));
  }
  grilleParts.push(decor(cyl(12, 0.9, MAT.nickel, "y", [0, -0.55, 0], 24)));
  const grille = node("psu-grille", grilleParts, { explode: { stage: 4, dir: [0, -1, 0], dist: 90 } });

  // OLED power readout on the +X face, black-glass bezel behind it ----------
  const oledPlane = screen(58, 26, ["1600 W", "OUT 812 W"], { accent: "#e8a33a" });
  oledPlane.rotation.y = deg(90);     // plane normal +Z → +X; text reads left→right for a +X viewer
  oledPlane.position.set(W / 2 + 1.6, OLED_Y, OLED_Z);
  const oled = node("psu-oled", [
    box(1, 30, 62, MAT.tint, [W / 2 + 0.8, OLED_Y, OLED_Z]),                          // x 75.3..76.3, lies in the +X face
    oledPlane,                                                                       // x 76.6
  ], { explode: { stage: 4, dir: [1, 0, 0], dist: 200, lag: 0.2 } });

  // Modular connector panel on the +Z face -----------------------------------
  const panelZ = L / 2 + 0.3 + 0.75;  // plate z 100.3..101.8
  const sockZ = L / 2 + 1.8 + 2.5;    // socket blocks z 101.8..106.8
  const modularPanel = node("psu-modular-panel", [
    box(140, 70, 1.5, MAT.plastic, [0, 43, panelZ]),
    // top row: 24-pin split 18+10, then three 8-pin CPU/PCIe
    box(28, 10, 5, socketMat, [-48, 64, sockZ]),
    box(18, 10, 5, socketMat, [-22, 64, sockZ]),
    chipRow(3, 18, 14, 10, 5, socketMat, "x", [28, 64, sockZ]),
    // middle row: six 8-pin PCIe / CPU sockets
    chipRow(6, 20, 16, 10, 5, socketMat, "x", [-10, 43, sockZ]),
    // bottom row: two 16-pin (12V-2×6) sockets + three peripheral / SATA
    chipRow(2, 30, 24, 10, 5, socketMat, "x", [-40, 22, sockZ]),
    chipRow(3, 20, 16, 10, 5, socketMat, "x", [25, 22, sockZ]),
  ], { explode: { stage: 4, dir: [0, 0, 1], dist: 60 } });

  // AC inlet, rocker switch and honeycomb exhaust on the -Z face --------------
  const rearZ = -L / 2;               // shell face at z = -100
  const acParts: THREE.Object3D[] = [
    box(28, 20, 8, MAT.plastic, [-45, 30, rearZ - 3.5]),                             // C14, z -107.5..-99.5
    box(12, 20, 4, MAT.plastic, [-20, 30, rearZ - 1.5]),                             // rocker body
    box(8, 15, 0.8, rockerRed, [-20, 30, rearZ - 3.7]),                              // rocker face
    box(80, 64, 1, MAT.mesh, [32, 43, rearZ - 0.2]),                                 // honeycomb, 0.7 proud
  ];
  for (const dx of [-6, 0, 6]) acParts.push(decor(box(1.5, 4, 1.2, MAT.gold, [-45 + dx, 30, rearZ - 7.7])));  // C14 blades
  const acInlet = node("psu-ac-inlet", acParts, { explode: { stage: 4, dir: [0, 0, -1], dist: 50 } });

  // Internals — PCB on the top face, power electronics hanging toward the fan -
  const pcbY = 77;                                    // 76.2..77.8, under the top plate
  const tall = 40.5, midY = pcbY - 0.8 - tall / 2 + 0.3; // bodies 36..76.5, 0.3 embedded in the PCB
  const internalsParts: THREE.Object3D[] = [
    box(140, 1.6, 190, MAT.pcb, [0, pcbY, 0]),
    // main + auxiliary transformers: copper windings with a dark ferrite band
    box(40, tall, 45, MAT.copper, [15, midY, -55]),
    box(44, 16, 49, MAT.silicon, [15, midY, -55]),
    box(40, tall, 45, MAT.copper, [-30, midY, 55]),
    box(44, 16, 49, MAT.silicon, [-30, midY, 55]),
    // primary / secondary heatsinks (fins perpendicular to X)
    finStack(12, 3, 60, 38, 1.2, MAT.alu, "x", [-45, 57, -45]),
    finStack(12, 3, 50, 38, 1.2, MAT.alu, "x", [40, 57, 50]),
  ];
  for (let i = 0; i < 6; i++) {
    const x = -50 + i * 20;
    internalsParts.push(cyl(9, tall, MAT.plastic, "y", [x, midY, 8], 24));
    internalsParts.push(cyl(8.6, 1.2, MAT.alu, "y", [x, midY - tall / 2 + 0.4, 8], 24));   // vented end cap
  }
  const internals = node("psu-internals", internalsParts);

  const root = node("psu", [], {
    explode: { stage: 2, dir: [1, -0.3, 0.2], dist: 220 },
    children: [shell, psuFan, grille, oled, modularPanel, acInlet, internals],
  });
  root.object.userData.rotors = [pf.rotor];
  return root;
}
