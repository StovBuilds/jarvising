// World constants (metres) and small helpers shared by every module of the piece.
import * as THREE from "three";

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);

export const FT = 0.3048;
export const LAYER_FT = 180;
export const TEST_FT = 300;
export const LAYER_Y = -LAYER_FT * FT;
export const SEABED_Y = -150;
export const KEEL = 2.65;
/** the ping is drawn this slowly (m/s) so you can watch it travel; life is ~1,500 m/s */
export const V_SHOWN = 42;
export const V_REAL = 1500;
export const ESCORT_R = 120;
export const ESCORT_PERIOD = 150;
export const PING_EVERY = 9;
export const FT_MIN = 40;
export const FT_MAX = 350;
/** gauge pressure per metre of seawater: 1025 kg/m³ × 9.80665 m/s² = 10,052 Pa = 1.458 psi */
export const PSI_PER_M = 1.4585;
export const C_PING = new THREE.Color(0.52, 0.9, 1.0);
export const C_ECHO = new THREE.Color(1.0, 0.3, 0.16);

// Seeded random for the marine snow and the scope's noise, so a pinned state
// (?depth=…&ping=…) draws the same picture on every load. The original used
// Math.random(); nothing about the look depends on which numbers come out.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// JS value noise for the terrain and the scattered rocks
export const jHash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const jNoise = (x: number, z: number) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(jHash(ix, iz), jHash(ix + 1, iz), ux), lerp(jHash(ix, iz + 1), jHash(ix + 1, iz + 1), ux), uz);
};
export const jFbm = (x: number, z: number) => { let a = 0.5, s = 0; for (let i = 0; i < 5; i++) { s += a * jNoise(x, z); x = x * 2.02 + 13.1; z = z * 2.02 + 7.7; a *= 0.5; } return s; };
