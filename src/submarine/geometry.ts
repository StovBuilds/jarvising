// Hull-building helpers: 1D curves sampled from control points, a superellipse
// cross-section, and a sweep that lofts those sections along x.
import * as THREE from "three";

export type Pt = [number, number];
export type Curve = (x: number) => number;
export type HullCurves = { a: Curve; b: Curve; m: Curve; t: Curve; dw: Curve };

export function curve1D(points: Pt[]): Curve {
  const c = new THREE.CatmullRomCurve3(points.map(([x, v]) => new THREE.Vector3(x, v, 0)), false, "centripetal");
  const s = c.getPoints(700);
  return (x) => {
    if (x <= s[0].x) return s[0].y;
    const n = s.length - 1;
    if (x >= s[n].x) return s[n].y;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].x < x) lo = m; else hi = m; }
    const t = (x - s[lo].x) / Math.max(1e-6, s[hi].x - s[lo].x);
    return s[lo].y + (s[hi].y - s[lo].y) * t;
  };
}
export function curveSet(o: Record<keyof HullCurves, Pt[]>): HullCurves {
  return { a: curve1D(o.a), b: curve1D(o.b), m: curve1D(o.m), t: curve1D(o.t), dw: curve1D(o.dw) };
}
export const bez = (p0: Pt, c: Pt, p2: Pt, s: number): Pt => {
  const u = 1 - s;
  return [u * u * p0[0] + 2 * u * s * c[0] + s * s * p2[0], u * u * p0[1] + 2 * u * s * c[1] + s * s * p2[1]];
};

// Starboard profile, keel (index 0) → side (12) → deck centre (24).
export type Profile = (x: number) => Pt[];
export function makeProfile(H: HullCurves, ex = 2.5): Profile {
  const e = 2 / ex;
  return (x) => {
    const a = Math.max(0.02, H.a(x)), b = H.b(x), m = H.m(x), t = H.t(x), dw = Math.min(H.dw(x), a * 0.96);
    const P: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const th = -Math.PI / 2 + (i / 12) * Math.PI / 2;
      P.push([a * Math.pow(Math.abs(Math.cos(th)), e), m - (m - b) * Math.pow(Math.abs(Math.sin(th)), e)]);
    }
    for (let i = 1; i <= 10; i++) P.push(bez([a, m], [a, t], [dw, t], i / 10));
    P.push([dw * 0.5, t], [0, t]);
    return P;
  };
}
export const ringUpper = (prof: Profile) => (x: number) => { const P = prof(x), r: Pt[] = []; for (let j = 12; j <= 24; j++) r.push(P[j]); for (let j = 23; j >= 12; j--) r.push([-P[j][0], P[j][1]]); return r; };
export const ringLower = (prof: Profile) => (x: number) => { const P = prof(x), r: Pt[] = []; for (let j = 12; j >= 1; j--) r.push([-P[j][0], P[j][1]]); for (let j = 0; j <= 12; j++) r.push(P[j]); return r; };

export function sweep(xs: number[], ringFn: (x: number) => Pt[]) {
  const rings = xs.map(ringFn), R = rings[0].length, S = xs.length;
  const pos = new Float32Array(S * R * 3), uv = new Float32Array(S * R * 2);
  for (let i = 0; i < S; i++) for (let j = 0; j < R; j++) {
    const k = i * R + j, [z, y] = rings[i][j];
    pos[k * 3] = xs[i]; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    uv[k * 2] = i / (S - 1); uv[k * 2 + 1] = j / (R - 1);
  }
  const idx: number[] = [];
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < R - 1; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const range = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D | null = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
