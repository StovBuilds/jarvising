// The flight plan. Four camera segments — two abstract worlds and two passes
// over the real machine — each with its own stamped keys (helpers.ts,
// stamped by scroll progress), joined by short black dips whose centres sit exactly
// on the chapter boundaries where the world changes. Also here: which flows
// light up when, the story-time part animations (the M.2 heatsink lifting, the
// cooler arriving on the CPU, the PSU opening), and the dark→lab lerp.
//
// Units: metres, world frame. Machine positions come from the mm layout in
// types.ts ÷ 1000.

import * as THREE from "three";
import { sampleStampedKeys, stampedKeys } from "./helpers";
import { CHAPTERS } from "./content";
import type { Chapter } from "./types";
import { CPU_ORIGIN, GPU_ORIGIN } from "./micro";
import type { FlowSpec } from "./flows";

export type World = Chapter["world"];

type Row = [number, number, number, number];
type Keys = ReturnType<typeof stampedKeys>;

interface Segment {
  from: number;
  to: number;
  world: World;
  cam: Keys;
  tgt: Keys;
  near: number;
  fov: number;
}

const rel = (origin: THREE.Vector3, rows: Row[]): Keys =>
  stampedKeys(rows.map(([p, x, y, z]) => [p, x + origin.x, y + origin.y, z + origin.z] as Row));

export const SEGMENTS: Segment[] = [
  {
    from: 0, to: 0.18, world: "cpu-micro", near: 0.05, fov: 68,
    cam: rel(CPU_ORIGIN, [
      [0.000, -36, 5.0, 34],
      [0.040, -27, 2.4, 16],
      [0.080, -12, 2.6, -1],
      [0.120, 5, 2.9, -3],
      [0.150, 7, 6.0, 4],
      [0.180, 11, 8.5, 8],
    ]),
    tgt: rel(CPU_ORIGIN, [
      [0.000, -15, 1.0, -7],
      [0.040, -15, 1.0, -7],
      [0.080, 0, 0.8, -6],
      [0.120, 14, 0.8, -6],
      [0.150, 1, 1.5, 20],
      [0.180, 0, 1.2, 20],
    ]),
  },
  {
    from: 0.18, to: 0.49, world: "machine", near: 0.003, fov: 55,
    cam: stampedKeys([
      [0.180, -0.040, 0.500, -0.160],
      [0.200, -0.010, 0.520, -0.130],
      [0.225, 0.050, 0.540, -0.090],
      [0.240, 0.090, 0.560, -0.070],
      [0.270, 0.030, 0.500, -0.110],
      [0.310, 0.050, 0.560, -0.150],
      [0.335, 0.040, 0.520, -0.020],
      [0.360, 0.030, 0.360, -0.040],
      [0.390, 0.020, 0.430, -0.180],
      [0.420, -0.030, 0.440, -0.150],
      [0.450, -0.045, 0.400, -0.180],
      [0.470, -0.065, 0.375, -0.200],
      [0.490, -0.090, 0.356, -0.245],
    ]),
    tgt: stampedKeys([
      [0.180, -0.086, 0.454, -0.2145],
      [0.200, -0.088, 0.452, -0.214],
      [0.225, -0.090, 0.450, -0.210],
      [0.240, -0.090, 0.450, -0.200],
      [0.270, -0.070, 0.450, -0.140],
      [0.310, -0.060, 0.470, -0.135],
      [0.335, -0.085, 0.455, -0.045],
      [0.360, -0.095, 0.300, -0.140],
      [0.390, -0.092, 0.400, -0.210],
      [0.420, -0.092, 0.394, -0.210],
      [0.450, -0.093, 0.380, -0.240],
      [0.470, -0.094, 0.356, -0.265],
      [0.490, -0.096, 0.352, -0.310],
    ]),
  },
  {
    from: 0.49, to: 0.64, world: "gpu-micro", near: 0.05, fov: 68,
    cam: rel(GPU_ORIGIN, [
      [0.490, 0, 1.4, 26],
      [0.520, -5, 2.6, 10],
      [0.550, 3, 3.0, -4],
      [0.590, 0, 5.0, 14],
      [0.615, 10, 8, 24],
      [0.640, 20, 13, 32],
    ]),
    tgt: rel(GPU_ORIGIN, [
      [0.490, 0, 0.6, 0],
      [0.520, 1, 0.8, -6],
      [0.550, 0, 1.0, -16],
      [0.590, 0, 6.0, -6],
      [0.615, 0, 3.0, -4],
      [0.640, 0, 1.0, 0],
    ]),
  },
  {
    from: 0.64, to: 1.0, world: "machine", near: 0.005, fov: 50,
    cam: stampedKeys([
      [0.640, -0.020, 0.245, -0.080],
      [0.665, 0.020, 0.150, 0.170],
      [0.690, 0.110, 0.300, 0.240],
      [0.710, 0.100, 0.500, -0.100],
      [0.730, 0.170, 0.520, 0.060],
      [0.750, 0.240, 0.720, 0.260],
      [0.770, 0.112, 0.125, -0.050],
      [0.790, 0.112, 0.200, 0.060],
      [0.810, 0.120, 0.400, 0.160],
      [0.830, 0.115, 0.430, 0.280],
      [0.860, 0.560, 0.450, 0.420],
      [0.880, 0.720, 0.430, 0.150],
      [0.900, 0.760, 0.420, -0.180],
      [0.920, 0.880, 0.480, 0.300],
      [0.940, 0.980, 0.520, 0.760],
      [0.970, 1.080, 0.620, 0.880],
      [1.000, 1.060, 0.600, 0.880],
    ]),
    tgt: stampedKeys([
      [0.640, -0.030, 0.320, -0.140],
      [0.665, -0.030, 0.290, -0.110],
      [0.690, -0.020, 0.330, -0.120],
      [0.710, -0.050, 0.454, -0.2145],
      [0.730, -0.040, 0.545, -0.020],
      [0.750, -0.030, 0.594, -0.020],
      [0.770, -0.050, 0.080, -0.220],
      [0.790, -0.050, 0.120, -0.180],
      [0.810, -0.060, 0.300, -0.120],
      [0.830, -0.040, 0.360, -0.120],
      [0.860, 0.000, 0.320, 0.000],
      [0.880, 0.000, 0.320, 0.000],
      [0.900, 0.000, 0.320, 0.000],
      [0.920, 0.000, 0.320, 0.000],
      [0.940, 0.000, 0.320, 0.000],
      [0.970, 0.020, 0.340, 0.000],
      [1.000, 0.020, 0.340, 0.000],
    ]),
  },
];

/** The atlas starts where the story ends. */
export const ATLAS_HOME = { pos: new THREE.Vector3(1.06, 0.6, 0.88), target: new THREE.Vector3(0.02, 0.34, 0) };

export function segmentAt(p: number): Segment {
  for (const s of SEGMENTS) if (p < s.to) return s;
  return SEGMENTS[SEGMENTS.length - 1];
}

export function samplePath(p: number, pos: THREE.Vector3, target: THREE.Vector3): Segment {
  const s = segmentAt(p);
  sampleStampedKeys(s.cam, p, pos);
  sampleStampedKeys(s.tgt, p, target);
  return s;
}

export function chapterAt(p: number): Chapter {
  for (const c of CHAPTERS) if (p < c.to) return c;
  return CHAPTERS[CHAPTERS.length - 1];
}

// ── dips ───────────────────────────────────────────────────────────────────
const DIPS = [0.18, 0.49, 0.64];
const DIP_HW = 0.009;

/** 0..1 blackness of the join between worlds. */
export function dipAmount(p: number): number {
  let d = 0;
  for (const c of DIPS) d = Math.max(d, 1 - Math.abs(p - c) / DIP_HW);
  return Math.max(0, Math.min(1, d));
}

// ── helpers ────────────────────────────────────────────────────────────────
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const win = (a: number, b: number, p: number, edge = 0.01) => smooth(a, a + edge, p) * (1 - smooth(b - edge, b, p));
const tri = (a: number, m: number, b: number, p: number) => (p < m ? smooth(a, m, p) : 1 - smooth(m, b, p));

/** dark void → product lab (scene 15). */
export const labAmount = (p: number) => smooth(0.90, 0.94, p);
/** the explode chapter drives the slider to "systems separated". */
export const storyExplode = (p: number) => smooth(0.94, 1.0, p) * 0.5;

// ── flows ──────────────────────────────────────────────────────────────────
const cx = CPU_ORIGIN.x, cy = CPU_ORIGIN.y, cz = CPU_ORIGIN.z;

const gx = GPU_ORIGIN.x, gy = GPU_ORIGIN.y, gz = GPU_ORIGIN.z;
const GPU_DOMAIN_X = [-15.12, -5.04, 5.04, 15.12];
const GPU_PALETTE = [0x66e0ff, 0xa78bfa, 0xffb35c, 0x7dffb0];

export const FLOWS: FlowSpec[] = [
  // silicon: instruction pulses down the streets between core blocks, threads branching from a core
  ...[[0.45, "x"], [-6.75, "x"], [-4.95, "z"], [5.85, "z"]].map(([k, axis], i): FlowSpec => ({
    id: `cpu-street-${i + 1}`, style: "pulse", color: 0xffd9a8, size: 0.12, spread: 0, speed: 0.6, count: 36,
    points: axis === "x"
      ? [[cx - 20, cy + 0.35, cz + (k as number)], [cx, cy + 0.35, cz + (k as number)], [cx + 20, cy + 0.35, cz + (k as number)]]
      : [[cx + (k as number), cy + 0.35, cz - 16], [cx + (k as number), cy + 0.35, cz], [cx + (k as number), cy + 0.35, cz + 16]],
  })),
  { id: "cpu-branch-1", style: "pulse", color: 0x9cc4ff, size: 0.14, spread: 0, speed: 0.45, count: 30, points: [[cx - 5, cy + 1.0, cz - 7], [cx, cy + 1.3, cz - 3], [cx + 6, cy + 1.0, cz + 1]] },
  { id: "cpu-branch-2", style: "pulse", color: 0x9cc4ff, size: 0.14, spread: 0, speed: 0.45, count: 30, points: [[cx - 5, cy + 1.0, cz - 7], [cx - 1, cy + 1.3, cz - 11], [cx + 4, cy + 1.0, cz - 14]] },
  // gpu: massively parallel streams down each work-domain band
  ...GPU_DOMAIN_X.map((x, d): FlowSpec => ({
    id: `gpu-lane-${d}`, style: "pulse", color: GPU_PALETTE[d], size: 0.16, spread: 400, flat: true, speed: 0.5, count: 110,
    points: [[gx + x, gy + 2.35, gz + 20], [gx + x, gy + 2.35, gz], [gx + x, gy + 2.35, gz - 20]],
  })),
  { id: "cache-hit", style: "pulse", color: 0x66e0ff, points: [[cx - 5, cy + 1.6, cz - 7], [cx - 4, cy + 1.8, cz + 6], [cx - 4, cy + 2.0, cz + 20]], size: 0.18, spread: 4 },
  { id: "mem-far", style: "pulse", color: 0xffa25a, points: [[cx - 5, cy + 1.6, cz - 7], [cx + 2, cy + 2.2, cz + 14], [cx + 6, cy + 2.5, cz + 30], [cx + 8, cy + 2.8, cz + 44]], size: 0.18, spread: 4, speed: 0.22 },
  { id: "cpu-ram", style: "packet", color: 0xc4b5fd, bidirectional: true, points: [[-0.083, 0.454, -0.2145], [-0.072, 0.452, -0.175], [-0.060, 0.450, -0.142], [-0.058, 0.452, -0.121]] },
  { id: "board-a", style: "pulse", color: 0xa3e635, size: 0.004, points: [[-0.090, 0.50, -0.30], [-0.088, 0.47, -0.25], [-0.086, 0.45, -0.19], [-0.086, 0.44, -0.13], [-0.086, 0.46, -0.05]] },
  { id: "board-b", style: "pulse", color: 0xa3e635, size: 0.004, points: [[-0.090, 0.30, -0.06], [-0.090, 0.30, -0.15], [-0.090, 0.35, -0.24], [-0.090, 0.40, -0.28]] },
  { id: "storage", style: "block", color: 0x2dd4bf, size: 0.0045, points: [[-0.089, 0.394, -0.20], [-0.080, 0.38, -0.235], [-0.084, 0.36, -0.26], [-0.090, 0.354, -0.28], [-0.06, 0.35, -0.20], [-0.03, 0.35, -0.12]] },
  { id: "pcie", style: "pulse", color: 0x60a5fa, speed: 0.9, size: 0.0035, points: [[-0.092, 0.36, -0.30], [-0.093, 0.355, -0.26], [-0.093, 0.352, -0.22], [-0.06, 0.352, -0.20]] },
  { id: "coolant", style: "packet", color: 0x7dd3fc, points: [[-0.05, 0.438, -0.175], [-0.048, 0.43, -0.12], [-0.05, 0.47, -0.02], [-0.058, 0.54, 0.11], [-0.06, 0.579, 0.168], [-0.05, 0.594, 0.1], [-0.04, 0.594, -0.15]] },
  { id: "power-gpu", style: "power", color: 0xfacc15, points: [[-0.04, 0.11, -0.118], [0, 0.15, -0.04], [0.04, 0.24, 0], [0.072, 0.33, -0.06], [0.062, 0.354, -0.107]] },
  { id: "power-eps", style: "power", color: 0xfacc15, points: [[-0.10, 0.11, -0.124], [-0.122, 0.14, -0.30], [-0.126, 0.30, -0.32], [-0.122, 0.52, -0.318], [-0.10, 0.552, -0.30], [-0.086, 0.546, -0.292]] },
  { id: "power-24", style: "power", color: 0xfacc15, points: [[-0.06, 0.10, -0.118], [-0.062, 0.14, -0.07], [-0.084, 0.19, -0.048], [-0.086, 0.30, -0.05], [-0.086, 0.42, -0.05], [-0.085, 0.452, -0.044]] },
  ...[0.175, 0.325, 0.475].map((y, i): FlowSpec => ({ id: `air-${i + 1}`, style: "air", color: 0xbfe6ff, points: [[0.0, y, 0.34], [0.0, y, 0.10], [0.01, y + 0.02, -0.15], [0.03, y + 0.04, -0.36]] })),
  { id: "air-top", style: "air", color: 0xbfe6ff, points: [[-0.03, 0.40, 0.0], [-0.03, 0.55, 0.0], [-0.03, 0.62, 0.0], [-0.03, 0.72, 0.0]] },
  { id: "air-rear", style: "air", color: 0xbfe6ff, points: [[0.03, 0.47, -0.20], [0.03, 0.47, -0.31], [0.03, 0.47, -0.42]] },
  { id: "air-gpu", style: "air", color: 0xbfe6ff, points: [[0.0, 0.30, 0.26], [-0.02, 0.30, 0.0], [0.0, 0.27, -0.30]] },
];

export const FIELDS = {
  "gpu-heat": { at: [-0.025, 0.34, -0.155] as [number, number, number], color: 0xff6a2a, scale: 0.045 },
  "cpu-heat": { at: [-0.08, 0.454, -0.2145] as [number, number, number], color: 0xff6a2a, scale: 0.05 },
  "vrm-heat": { at: [-0.075, 0.52, -0.21] as [number, number, number], color: 0xff6a2a, scale: 0.035 },
};

/** Which flows are alive at progress p (all off after the overlays fade at 0.87). */
export function flowLevels(p: number): Record<string, number> {
  if (p >= 0.88) return {};
  const air = Math.max(0.5 * win(0.65, 0.69, p), win(0.81, 0.875, p));
  const streets = win(0.05, 0.185, p, 0.02);
  const lanes = win(0.495, 0.635, p, 0.015);
  return {
    "cpu-street-1": streets, "cpu-street-2": streets, "cpu-street-3": streets, "cpu-street-4": streets,
    "cpu-branch-1": win(0.08, 0.18, p, 0.02), "cpu-branch-2": win(0.09, 0.18, p, 0.02),
    "gpu-lane-0": lanes, "gpu-lane-1": lanes, "gpu-lane-2": lanes, "gpu-lane-3": lanes,
    "air-rear": air, "air-gpu": air,
    "cache-hit": tri(0.12, 0.15, 0.185, p),
    "mem-far": tri(0.14, 0.17, 0.185, p),
    "cpu-ram": win(0.23, 0.32, p),
    "board-a": win(0.31, 0.40, p),
    "board-b": win(0.32, 0.40, p),
    storage: win(0.40, 0.50, p),
    pcie: win(0.45, 0.50, p),
    coolant: win(0.69, 0.76, p),
    "power-gpu": win(0.755, 0.875, p),
    "power-eps": win(0.77, 0.875, p),
    "power-24": win(0.78, 0.875, p),
    "air-1": air, "air-2": air, "air-3": air,
    "air-top": win(0.81, 0.875, p),
  };
}

export function fieldLevels(p: number): Record<keyof typeof FIELDS, number> {
  return { "gpu-heat": win(0.64, 0.70, p), "cpu-heat": win(0.69, 0.73, p), "vrm-heat": 0.7 * win(0.69, 0.735, p) };
}

/** RGB accents stay dim until the power chapter switches the system on. */
export function accentLevel(p: number, atlas: boolean): number {
  if (atlas) return 1;
  return 0.3 + 0.7 * smooth(0.79, 0.815, p);
}

/** The arrival pathway draws out from the first lit core. */
export const cpuPathway = (p: number) => smooth(0.004, 0.04, p);

/** Story-time part offsets (mm, added after the explode engine has placed
 * everything). Returned as id → [dx, dy, dz]; the page applies them. */
export function storyOffsets(p: number): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  // storage: the M.2 heatsink lifts, the SSD half-explodes
  const m2 = win(0.395, 0.46, p, 0.025);
  if (m2 > 0) {
    out["m2-heatsink"] = [42 * m2, 0, 0];
    out["ssd-controller"] = [6 * m2, 0, 0];
    out["ssd-nand"] = [6 * m2, 0, 0];
    out["ssd-label"] = [11 * m2, 0, 0];
  }
  // gpu thermal: the cooler stack opens so the layers read
  const gt = win(0.645, 0.69, p, 0.02);
  if (gt > 0) {
    out["gpu-shroud"] = [0, -40 * gt, 0];
    out["gpu-fan-1"] = [0, -80 * gt, 0];
    out["gpu-fan-2"] = [0, -80 * gt, 0];
    out["gpu-fan-3"] = [0, -80 * gt, 0];
    out["gpu-heatsink"] = [0, -16 * gt, 0];
    out["gpu-vapor-chamber"] = [0, -6 * gt, 0];
  }
  // power: the PSU shell lifts off the supply (sliding toward the viewer put the camera inside it)
  const ps = win(0.755, 0.815, p, 0.02);
  if (ps > 0) out["psu-shell"] = [0, 95 * ps, 0];
  return out;
}

/** Nodes hidden outright at progress p (story only). */
export function storyHidden(p: number): Set<string> {
  const s = new Set<string>();
  if (p < 0.685) s.add("aio");                   // the CPU chapters need the socket in view
  return s;
}

/** Fades (0..1 opacity factor) for story reveals — the PSU shroud ghosts while the PSU is on stage. */
export function storyFades(p: number): Record<string, number> {
  const out: Record<string, number> = {};
  const ps = win(0.75, 0.815, p, 0.015);
  if (ps > 0) out["psu-shroud"] = 1 - 0.94 * ps;
  // the cooler materialises on the CPU as its chapter opens
  const arrive = smooth(0.685, 0.715, p);
  if (arrive < 1 && p >= 0.685) out["aio"] = arrive;
  return out;
}

export function fanSpeed(p: number, atlas: boolean, reduced: boolean): number {
  if (reduced) return 0;
  if (atlas) return 3;
  return 5 + 22 * win(0.64, 0.87, p, 0.02);
}
