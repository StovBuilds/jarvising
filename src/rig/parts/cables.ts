// Inside the Rig — the five power / signal cables. Unlike the products these
// are built directly in the MACHINE frame (absolute mm: +Y up, +Z case front,
// +X glass) and returned as five top-level nodes; the assembler adds them at
// the origin. Routes come from the layout numbers in types.ts (PSU modular panel at
// z ≈ -120, board 24-pin at (-85, 455, -42.5), EPS at the board's top-rear
// corner, GPU 16-pin on the card's top edge, front I/O header bottom-front).
//
// BOUNDING BOXES (machine mm, incl. connector heads — measured with Box3):
//   cable-24pin     x ∈ [-89, -42]    y ∈ [95, 481]   z ∈ [-119, -30]   (30 mm ribbon edge at the board's front edge)
//   cable-eps-a     x ∈ [-132, -73]   y ∈ [103, 559]  z ∈ [-328, -101]
//   cable-eps-b     x ∈ [-130, -73]   y ∈ [87, 558]   z ∈ [-308, -101]
//   cable-gpu-16pin x ∈ [-50, 79]     y ∈ [103, 357]  z ∈ [-132, 7]
//   cable-front-io  x ∈ [-121, -54]   y ∈ [245, 605]  z ∈ [-76, 306]
//
// IDS EMITTED (every ids.ts id starting with "cable", exactly once — 5):
//   cable-24pin, cable-eps-a, cable-eps-b, cable-gpu-16pin, cable-front-io
//
// DEVIATIONS FROM THE BRIEF (see the report):
//   • The 24-pin uses a local twisted ribbon, not prims.ts `ribbon()`: that one
//     spreads strands along X only, which at spread 30 puts four strands
//     behind the motherboard plane (x = -97) and cannot converge into a
//     10 mm-wide plug. Ours spreads along X at the PSU, rotates to Z up the
//     run, and bunches to ~15% over the last leg so it enters the head.
//   • eps-b's run is offset +20 in Z (brief +14: two 12.8 mm bundles 14 mm
//     apart touch) and +2 in X rather than -6 (-6 pushes the bundle through
//     the right side panel at x = -134); it still lands on board.ts's second
//     EPS socket at z -278.
//   • Board-side heads sit ON the sockets board.ts actually built (tops at
//     x = -85): 24-pin head centred x -80, EPS heads x -79 / y 543, front-io
//     onto the header row at (-84, 250, -70) rather than the brief's
//     (-86, 300, -45). The GPU 16-pin lands on the card's connector as placed
//     by gpu.ts + slot 1 (see GPU_PWR below), not at the brief's (62, 354, -107).
//   • EPS / 16-pin heads are 12 × 14–18 × 14–20 (brief 18 × 10 × 12): a 2×2
//     bundle of r 3.2 sleeves is 12.8 mm across and would poke out of a 10 mm plug.
//   • Cable tails are extended a few mm INSIDE their heads so the open tube
//     ends are never visible.
//
// ~28k triangles (26 TubeGeometry strands ≈ 1k each).

import * as THREE from "three";
import type { PartNode } from "../types";
import { MAT, box, sleeve, node } from "./prims";

type V3 = [number, number, number];

// ── local helpers ───────────────────────────────────────────────────────────

/** Per-point (u, w) frame perpendicular to the route tangent: u is world X
 * projected off the tangent (Z if the leg runs along X), w = t × u. Strand
 * offsets are expressed in this frame so a bundle stays a bundle whether the
 * leg runs up the board or across the PSU. */
function frames(points: V3[]): { u: THREE.Vector3; w: THREE.Vector3 }[] {
  const P = points.map((p) => new THREE.Vector3(...p));
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  return P.map((_, k) => {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
    const t = b.clone().sub(a).normalize();
    let u = X.clone().sub(t.clone().multiplyScalar(X.dot(t)));
    if (u.lengthSq() < 1e-3) u = Z.clone().sub(t.clone().multiplyScalar(Z.dot(t)));
    u.normalize();
    const w = t.clone().cross(u).normalize();
    return { u, w };
  });
}

/** Offset a route by (a, b) in each point's (u, w) frame; `scale(k)` tapers it. */
function offsetRoute(points: V3[], fr: ReturnType<typeof frames>, a: number, b: number, scale: (k: number) => number = () => 1): V3[] {
  return points.map((p, k) => {
    const s = scale(k);
    const { u, w } = fr[k];
    return [
      p[0] + (u.x * a + w.x * b) * s,
      p[1] + (u.y * a + w.y * b) * s,
      p[2] + (u.z * a + w.z * b) * s,
    ] as V3;
  });
}

/** A bundle of sleeves around one route (2×2 or 1×2 packing, `spread` = centre pitch). */
function bundle(points: V3[], count: 2 | 4, spread: number, r: number, mat: THREE.Material = MAT.sleeve): THREE.Group {
  const fr = frames(points);
  const g = new THREE.Group();
  const h = spread / 2;
  const offs: [number, number][] = count === 4 ? [[-h, -h], [h, -h], [-h, h], [h, h]] : [[-h, 0], [h, 0]];
  for (const [a, b] of offs) g.add(sleeve(offsetRoute(points, fr, a, b), r, mat, 48));
  return g;
}

/** A flat ribbon whose spread axis rotates from u (≈X) at the start to w
 * (≈Z on a vertical leg) by `twistEnd` of the route, and bunches to
 * `endScale` over the last `taperFrom..1` so it can enter a narrow plug.
 * Fractions are of the point index, so put route points where the bends are. */
function twistedRibbon(
  points: V3[], strands: number, r: number, spread: number,
  opts: { twistEnd?: number; taperFrom?: number; endScale?: number } = {}, mat: THREE.Material = MAT.sleeve,
): THREE.Group {
  const twistEnd = opts.twistEnd ?? 0.3, taperFrom = opts.taperFrom ?? 0.75, endScale = opts.endScale ?? 0.15;
  const fr = frames(points);
  const n = points.length - 1;
  const g = new THREE.Group();
  for (let i = 0; i < strands; i++) {
    const o = -spread / 2 + (spread * i) / Math.max(1, strands - 1);
    const pts = points.map((p, k) => {
      const t = k / n;
      const th = (Math.min(1, t / twistEnd) * Math.PI) / 2;
      const s = t <= taperFrom ? 1 : 1 + ((endScale - 1) * (t - taperFrom)) / (1 - taperFrom);
      const { u, w } = fr[k];
      const a = Math.cos(th) * o * s, b = Math.sin(th) * o * s;
      return [p[0] + u.x * a + w.x * b, p[1] + u.y * a + w.y * b, p[2] + u.z * a + w.z * b] as V3;
    });
    g.add(sleeve(pts, r, mat, 40));
  }
  return g;
}

/** Connector head — a plastic block centred at `at`. */
const head = (w: number, h: number, d: number, at: V3) => box(w, h, d, MAT.plastic, at, 0.8);

/** Extend a route a few mm past its last point along the final leg (buries the tube end). */
function extendEnd(points: V3[], mm: number): V3[] {
  const a = points[points.length - 2], b = points[points.length - 1];
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize().multiplyScalar(mm);
  return [...points, [b[0] + d.x, b[1] + d.y, b[2] + d.z]];
}

// ── where the cables land (machine mm) ──────────────────────────────────────
// Board-side targets are read off parts/board.ts (socket tops at x = -85):
//   24-pin socket  box 12×52×10 at (-91, 455, -42.5)   → plug sits on x -85
//   EPS sockets    box 12×10×18 at (-91, 541, -292 | -278)
//   front-panel header row  boxes at (-93, 250, -70 …)
// The GPU 16-pin position ASSUMES the assembler drops the card's origin at
// slot 1: x ≈ -94 (board.ts slot body x -97..-86), y 354, z -257; gpu.ts puts
// the connector at local x 122..132, y -14..0, z 125..145. Shift this one
// constant if the card moves.
const GPU_PWR = { x: 38, y: 347, z: -130 };   // +X face centre of the card's 16-pin
const PSU_HEAD_Z = -107;   // PSU-side heads sit just proud of the PSU's socket blocks (z ≈ -113)

// ── builder ────────────────────────────────────────────────────────────────

export function buildCables(): PartNode[] {
  // 24-pin ATX: PSU panel → up the front edge of the board → 24-pin socket ---
  // (brief route + two extra control points at y 400/430 so the funnel into
  //  the plug is controlled rather than a Catmull-Rom overshoot)
  const r24: V3[] = [
    [-60, 100, -118], [-62, 140, -70], [-84, 190, -48], [-86, 300, -50],
    [-86, 400, -50], [-86, 430, -48], [-85, 452, -44],
  ];
  const c24 = node("cable-24pin", [
    // flat along X leaving the PSU, flat toward the glass (Z) from y 190 up, funnels over the last 52 mm
    twistedRibbon(r24, 12, 1.4, 30, { twistEnd: 2 / 6, taperFrom: 4 / 6, endScale: 0.15 }),
    head(36, 10, 12, [-60, 100, PSU_HEAD_Z]),           // PSU side (18+10 split block)
    head(12, 52, 10, [-80, 455, -42.5]),                // board side: on the socket (x -86..-74), long axis along Y
  ], { explode: { stage: 3, dir: [1, 0, 0], dist: 140, lag: 0 } });

  // EPS CPU power ×2: behind the motherboard tray, over the top edge ---------
  // (b runs 20 mm in front of a so the two 12.8 mm bundles never touch, then
  //  lands on the second socket at z -278)
  const rEpsA: V3[] = [[-100, 110, -124], [-122, 140, -300], [-126, 300, -320], [-122, 520, -318], [-100, 552, -300], [-86, 546, -292]];
  const rEpsB: V3[] = [[-100, 94, -124], [-120, 140, -280], [-124, 300, -300], [-120, 520, -298], [-98, 552, -282], [-86, 546, -278]];
  const epsA = node("cable-eps-a", [
    bundle(extendEnd(rEpsA, 5), 4, 6, 3.2),
    head(20, 14, 12, [-100, 110, PSU_HEAD_Z]),
    head(12, 18, 14, [-79, 543, -292]),                 // on the socket top (x -85..-73)
  ], { explode: { stage: 3, dir: [1, 0, 0], dist: 140, lag: 0.1 } });
  const epsB = node("cable-eps-b", [
    bundle(extendEnd(rEpsB, 5), 4, 6, 3.2),
    head(20, 14, 12, [-100, 94, PSU_HEAD_Z]),
    head(12, 18, 14, [-79, 543, -278]),
  ], { explode: { stage: 3, dir: [1, 0, 0], dist: 140, lag: 0.15 } });

  // GPU 16-pin (12V-2×6): PSU panel, sweeping up in front of the board, then
  // turning to plug into the card's top edge toward -X
  const rGpu: V3[] = [
    [-40, 110, -118], [0, 150, -40], [40, 240, 0], [72, 330, -60], [64, 350, -100],
    [GPU_PWR.x + 14, GPU_PWR.y, GPU_PWR.z], [GPU_PWR.x + 4, GPU_PWR.y, GPU_PWR.z],
  ];
  const gpu16 = node("cable-gpu-16pin", [
    bundle(rGpu, 4, 6, 3.2),
    head(20, 14, 12, [-40, 110, PSU_HEAD_Z]),
    head(12, 14, 20, [GPU_PWR.x + 6, GPU_PWR.y, GPU_PWR.z]),   // -X face is the plug face, on the connector
  ], { explode: { stage: 3, dir: [1, 0, 0], dist: 140, lag: 0.2 } });

  // Front I/O harness: case top-front, down behind the front fans, onto the
  // front-panel header row at the board's bottom edge
  const rIo: V3[] = [[-60, 600, 300], [-110, 560, 250], [-116, 450, 100], [-112, 380, 0], [-88, 254, -70]];
  const frontIo = node("cable-front-io", [
    bundle(extendEnd(rIo, 4), 2, 4.8, 2.2),
    head(12, 10, 12, [-60, 600, 300]),
    head(10, 8, 12, [-84, 250, -70]),                   // on the header (x -89..-79)
  ], { explode: { stage: 3, dir: [1, 0, 0], dist: 140, lag: 0.3 } });

  return [c24, epsA, epsB, gpu16, frontIo];
}
