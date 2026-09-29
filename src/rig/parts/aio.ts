// Inside the Rig — the 360 mm all-in-one CPU liquid cooler. Procedural, built directly in the machine frame (mm, +Y up,
// +Z case front, +X glass side — see ../types.ts). The assembler adds the
// root at the origin with no transform.
//
// Layout (assembled):
//   block   x ∈ [-86.2, -15.4]  y ∈ [415, 493]      z ∈ [-253.5, -175.5]  (on the CPU IHS at x = -86)
//   tubes   leave the block's +Z face at x -50, rise in front of the DIMMs, enter the front tank from below
//   rad     x ∈ [-90, 30]       y ∈ [579, 609]      z ∈ [-219.75, 179.75]  (399.5 × 120 × 30)
//   fans    x ∈ [-90, 30]       y ∈ [554, 579]      z ∈ [-200, 160]        (3 × 120, blowing +Y)
// ROOT BOUNDING BOX (assembled): x ∈ [-90, 30], y ∈ [415, 609], z ∈ [-253.5, 179.75].
//
// Node tree:
//   aio (no meshes; explode stage 2 +Y 230; userData.rotors = 3 rad-fan rotors)
//   ├─ aio-block (stage 3 +X 120)
//   │   ├─ aio-lcd (stage 4 +X 90)
//   │   ├─ aio-cold-plate (stage 4 −X 40)
//   │   └─ aio-pump (stage 4 −X 18)
//   ├─ aio-tube-a, aio-tube-b (no own explode — ride the root)
//   ├─ aio-radiator (no own explode)
//   │   └─ aio-radiator-core (stage 4 +X 90)
//   └─ aio-fan-1..3 (stage 3 −Y 110, lag 0 / 0.15 / 0.3)
// Every ids.ts entry starting with "aio" is emitted exactly once: aio, aio-block,
// aio-lcd, aio-cold-plate, aio-pump, aio-tube-a, aio-tube-b, aio-radiator,
// aio-radiator-core, aio-fan-1, aio-fan-2, aio-fan-3 (12 ids, 12 node() calls).
//
// Budget: ~18k triangles (3 fans ≈ 7.4k, two tubes ≈ 3.1k, fin core 2.4k
// instanced, halo 1.5k, rounded shells ≈ 3.5k, the rest small).

import * as THREE from "three";
import type { ExplodeSpec, PartNode } from "../types";
import { MAT, box, cyl, chipRow, finStack, sleeve, fan, screen, node, decor, deg, glow, fanNode } from "./prims";

type V3 = [number, number, number];

/** Block centre x, and the socket centre (y, z) everything on the CPU is centred on. */
const BX = -50;
const CY = 454;
const CZ = -214.5;

/** Radiator centre (x, y, z) — y ∈ [579, 609], z ∈ [-219.75, 179.75]. */
const RX = -30;
const RY = 594;
const RZ = -20;

// ── material variants (never mutate MAT.*) ─────────────────────────────────

/** Lighter, slightly rougher aluminium so the fin core reads against the alu shell. */
const FIN_ALU = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.45 });
/** The LCD cover: MAT.tint's look, but clear enough that the screen glows through
 * (MAT.tint at 0.85 opacity would leave ~15% of the readout visible). */
const LCD_GLASS = MAT.tint.clone();
LCD_GLASS.opacity = 0.5;
/** ARGB halo around the block's face edge. */
const HALO = glow(0xe8a33a, 0.7);

// ── helpers ────────────────────────────────────────────────────────────────

/** A closed rounded-square loop in the YZ plane at x, half-size `half`,
 * corner radius r — straight edges + cubic-Bézier quarter arcs, so the tube
 * hugs the shell's rounded vertical edges without Catmull-Rom wobble. */
function roundedLoop(x: number, cy: number, cz: number, half: number, r: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const k = 0.5523 * r; // circular-arc Bézier constant
  const a = half - r; // corner-centre offset
  const V = (y: number, z: number) => new THREE.Vector3(x, cy + y, cz + z);
  path.add(new THREE.LineCurve3(V(half, -a), V(half, a)));
  path.add(new THREE.CubicBezierCurve3(V(half, a), V(half, a + k), V(a + k, half), V(a, half)));
  path.add(new THREE.LineCurve3(V(a, half), V(-a, half)));
  path.add(new THREE.CubicBezierCurve3(V(-a, half), V(-a - k, half), V(-half, a + k), V(-half, a)));
  path.add(new THREE.LineCurve3(V(-half, a), V(-half, -a)));
  path.add(new THREE.CubicBezierCurve3(V(-half, -a), V(-half, -a - k), V(-a - k, -half), V(-a, -half)));
  path.add(new THREE.LineCurve3(V(-a, -half), V(a, -half)));
  path.add(new THREE.CubicBezierCurve3(V(a, -half), V(a + k, -half), V(half, -a - k), V(half, -a)));
  return path;
}

// ── block assembly (shell + LCD + cold plate + pump) ───────────────────────

/** 3.5-inch LCD behind a dark glass cover on the block's +X face. */
function buildLcd(): PartNode {
  const lcd = screen(74, 52, ["CPU 61°C", "PUMP 2810 RPM", "LIQUID 34°C"], { accent: "#e8a33a" });
  // PlaneGeometry faces +Z; +90° about Y turns it to face +X (the viewer), and
  // its canvas left→right then runs +Z→-Z, which is left→right for someone on the glass side.
  lcd.rotation.y = deg(90);
  lcd.position.set(-16.7, CY, CZ); // 0.3 proud of the shell face (-17), 0.1 behind the glass
  const cover = box(1.2, 78, 78, LCD_GLASS, [-16, CY, CZ]); // x ∈ [-16.6, -15.4]
  return node("aio-lcd", [lcd, cover], { explode: { stage: 4, dir: [1, 0, 0], dist: 90 } });
}

/** Copper cold plate on the IHS (x ∈ [-86, -83]) with its paste layer. */
function buildColdPlate(): PartNode {
  const plate = box(3, 56, 56, MAT.copper, [-84.5, CY, CZ]);
  const paste = decor(box(0.4, 40, 40, MAT.pad, [-86.2, CY, CZ])); // x ∈ [-86.4, -86.0], under the plate
  return node("aio-cold-plate", [plate, paste], { explode: { stage: 4, dir: [-1, 0, 0], dist: 40 } });
}

/** Pump abstraction: a drum inside the shell with a copper impeller on its
 * cold-plate side. Hidden by the shell until stage 3/4 pulls the stack apart. */
function buildPump(): PartNode {
  // Inset 0.4 from the shell's −X face so no face is coplanar with it: x ∈ [-82.6, -58.6].
  const housing = cyl(30, 24, MAT.plastic, "x", [-70.6, CY, CZ], 40);
  const impeller = new THREE.Group();
  impeller.add(cyl(24, 1.2, MAT.copper, "x", [-82.8, CY, CZ], 32)); // x ∈ [-83.4, -82.2]
  for (let i = 0; i < 6; i++) {
    // radial vanes on the disc's −X face, spanning r 5..20
    const vane = box(0.8, 1.2, 15, MAT.copper, [-83.8, CY, CZ]);
    vane.geometry.translate(0, 0, 12.5);
    vane.rotation.x = deg(60 * i);
    impeller.add(vane);
  }
  return node("aio-pump", [housing, decor(impeller)], { explode: { stage: 4, dir: [-1, 0, 0], dist: 18 } });
}

/** The squared-off tower on the CPU: rounded shell + ARGB halo just behind the face. */
function buildBlock(): PartNode {
  const shell = box(66, 78, 78, MAT.aluDark, [BX, CY, CZ], 6); // x ∈ [-83, -17]
  // Halo: a 0.9 mm emissive loop around the shell at x = -23 (where the +X face's
  // edge rounding starts), centre-line 0.1 proud so it sits on the surface.
  const halo = decor(new THREE.Mesh(
    new THREE.TubeGeometry(roundedLoop(-23, CY, CZ, 39.1, 6.1), 128, 0.45, 6, true),
    HALO,
  ));
  return node("aio-block", [shell, halo], {
    explode: { stage: 3, dir: [1, 0, 0], dist: 120 },
    children: [buildLcd(), buildColdPlate(), buildPump()],
  });
}

// ── coolant tubes ──────────────────────────────────────────────────────────

// Both tubes leave the block's +Z face (z = -175.5) at x = -50, bow out to
// x ≈ -42 so they pass in FRONT of (+X of) the DIMMs (which reach x = -53 over
// z ∈ [-150, -115], y ∈ [382, 516]), climb across the open bay below the
// radiator fans (fan underside y = 554; tubes stay ≤ 547.5 incl. radius until
// z > 160, the front edge of fan 3), then turn up at z ≈ 166–170 into the front
// tank's underside (y = 579). Start/end points sit 0.5 mm inside the bodies
// they meet so the open tube ends are never visible.
const TUBE_A: V3[] = [
  [-50, 438, -176], [-45, 442, -150], [-42, 456, -112], [-46, 486, -50],
  [-54, 512, 40], [-58, 526, 120], [-60, 541, 166], [-60, 579.5, 168],
];
const TUBE_B: V3[] = [
  [-50, 470, -176], [-45, 474, -150], [-42, 488, -112], [-42, 512, -50],
  [-42, 530, 40], [-41, 540, 120], [-40, 545, 166], [-40, 579.5, 168],
];

function buildTube(id: "aio-tube-a" | "aio-tube-b", pts: V3[]): PartNode {
  const hose = sleeve(pts, 6.5, MAT.tube, 64);
  const [sx, sy] = pts[0];
  const [ex, , ez] = pts[pts.length - 1];
  // Block-end fitting: axis Z, z ∈ [-176, -166] (0.5 into the shell face at -175.5).
  const fitBlock = decor(cyl(8, 10, MAT.alu, "z", [sx, sy, -171], 24));
  // Tank-end fitting: axis Y, y ∈ [569.5, 579.5] (0.5 into the tank); r 7.5 keeps
  // 0.5 mm clear of fan 3's front face at z = 160.
  const fitTank = decor(cyl(7.5, 10, MAT.alu, "y", [ex, 574.5, ez], 24));
  return node(id, [hose, fitBlock, fitTank]);
}

// ── radiator ───────────────────────────────────────────────────────────────

/** Fin core: 12 flat coolant tubes across x ∈ [-80, 20] plus 200 fins
 * perpendicular to Z (air passes through along Y). Tube/fin ends bury ≥ 1 mm
 * into the tanks so no sliver shows where the tank edges round away. */
function buildRadiatorCore(): PartNode {
  const tubes = chipRow(12, 100 / 11, 1.8, 26, 354, MAT.alu, "x", [RX, RY, RZ]);
  const fins = finStack(200, 1.7, 100, 24, 0.3, FIN_ALU, "z", [RX, RY, RZ]);
  return node("aio-radiator-core", [tubes, fins], { explode: { stage: 4, dir: [1, 0, 0], dist: 90 } });
}

/** Radiator shell: two end tanks + two side rails; the core is a child so the
 * top stays open (visible through the case's top vents). */
function buildRadiator(): PartNode {
  const tankRear = box(120, 30, 24, MAT.alu, [RX, RY, -207.75], 3); // z ∈ [-219.75, -195.75]
  const tankFront = box(120, 30, 24, MAT.alu, [RX, RY, 167.75], 3); // z ∈ [155.75, 179.75]
  // Rails inset 0.3 from the tank ends (no coplanar faces) and 3.25 mm into each tank.
  const railL = box(8, 30, 358, MAT.alu, [-85.7, RY, RZ], 1.5);
  const railR = box(8, 30, 358, MAT.alu, [25.7, RY, RZ], 1.5);
  return node("aio-radiator", [tankRear, tankFront, railL, railR], { children: [buildRadiatorCore()] });
}

// ── radiator fans ──────────────────────────────────────────────────────────

function buildRadFan(id: "aio-fan-1" | "aio-fan-2" | "aio-fan-3", z: number, lag: number) {
  const { group, rotor } = fan(120, 25, { rgb: 0xe8a33a });
  // prims.ts fan() blows along local +Z; Rx(−90°) maps +Z → +Y (up through the radiator).
  group.rotation.x = deg(-90);
  group.position.set(RX, 566.5, z); // y ∈ [554, 579], frame top touching the radiator underside
  const explode: ExplodeSpec = { stage: 3, dir: [0, -1, 0], dist: 110, lag };
  return { part: fanNode(id, `${id}-rotor`, { group, rotor }, { explode, rotorDir: [0, 0, -1] }), rotor };
}

// ── root ───────────────────────────────────────────────────────────────────

export function buildAio(): PartNode {
  const f1 = buildRadFan("aio-fan-1", -140, 0);
  const f2 = buildRadFan("aio-fan-2", -20, 0.15);
  const f3 = buildRadFan("aio-fan-3", 100, 0.3);
  const root = node("aio", [], {
    explode: { stage: 2, dir: [0, 1, 0], dist: 230 },
    children: [
      buildBlock(),
      buildTube("aio-tube-a", TUBE_A),
      buildTube("aio-tube-b", TUBE_B),
      buildRadiator(),
      f1.part, f2.part, f3.part,
    ],
  });
  root.object.userData.rotors = [f1.rotor, f2.rotor, f3.rotor];
  return root;
}
