// Small helpers the piece needs: a device-tier guess, a soft round sprite
// texture, and a camera-key sampler. Written for this repo; nothing here is
// copied from any other package.

import * as THREE from "three";

// ── device tier ─────────────────────────────────────────────────────────────

export type DeviceTier = "LOW" | "MEDIUM" | "HIGH" | "ULTRA";

/** A coarse guess at how much GPU the visitor has, from what the browser
 * will say without a benchmark: touch-first + few cores + little memory is a
 * phone; a software rasteriser is always LOW. `?tier=` overrides it. */
export function getDeviceTier(): DeviceTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 8;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const small = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080) < 700;
  let renderer = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch { /* no GL at all: the page handles that separately */ }
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return "LOW";
  if ((coarse && small) || cores <= 4 || mem <= 3) return coarse ? "LOW" : "MEDIUM";
  if (coarse || cores <= 6 || mem <= 4) return "MEDIUM";
  if (cores >= 12 && mem >= 8) return "ULTRA";
  return "HIGH";
}

// ── sprites ─────────────────────────────────────────────────────────────────

/** A radial-gradient disc on a canvas: `inner` at the centre fading to
 * `outer` at the rim. Used for glows, flow particles and heat fields. */
export function radialSpriteTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── camera keys stamped with scroll progress ────────────────────────────────

/** Keys sorted by their progress stamp. Rows are [p, x, y, z]. */
export interface StampedKeys {
  t: number[];
  v: THREE.Vector3[];
}

export function stampedKeys(rows: [number, number, number, number][]): StampedKeys {
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  return { t: sorted.map((r) => r[0]), v: sorted.map((r) => new THREE.Vector3(r[1], r[2], r[3])) };
}

const _m0 = new THREE.Vector3();
const _m1 = new THREE.Vector3();

// tangent at key i as a velocity (units per unit p): the chord across the two
// neighbouring keys over their time span (a Catmull-Rom on the stamps rather
// than on the key index, so unevenly stamped keys keep an even pace); at the
// first and last key, the slope of the one segment there
function tangent(k: StampedKeys, i: number, out: THREE.Vector3): THREE.Vector3 {
  const n = k.t.length;
  const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
  const span = k.t[b] - k.t[a];
  if (span <= 0) return out.set(0, 0, 0);
  return out.subVectors(k.v[b], k.v[a]).divideScalar(span);
}

/** Position at progress p: a cubic Hermite through every key, held at the
 * first/last key outside the stamped range. Writes into `out`. */
export function sampleStampedKeys(k: StampedKeys, p: number, out: THREE.Vector3): THREE.Vector3 {
  const n = k.t.length;
  if (n === 0) return out.set(0, 0, 0);
  if (n === 1 || p <= k.t[0]) return out.copy(k.v[0]);
  if (p >= k.t[n - 1]) return out.copy(k.v[n - 1]);
  let i = 0;
  while (i < n - 2 && p >= k.t[i + 1]) i++;
  const t0 = k.t[i], t1 = k.t[i + 1], dt = t1 - t0;
  if (dt <= 0) return out.copy(k.v[i + 1]);
  const s = (p - t0) / dt, s2 = s * s, s3 = s2 * s;
  tangent(k, i, _m0).multiplyScalar(dt);
  tangent(k, i + 1, _m1).multiplyScalar(dt);
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return out.copy(k.v[i]).multiplyScalar(h00).addScaledVector(_m0, h10).addScaledVector(k.v[i + 1], h01).addScaledVector(_m1, h11);
}
