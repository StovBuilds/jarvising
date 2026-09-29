// Data / energy / heat / air — the illustrative flows of the scroll story
// (brief §16). Each flow is one Points cloud whose particles ride a curve;
// visually distinct per system: instructions are sharp pulses, memory packets
// are small dots in both directions, storage streams are fat blocks, power is
// thick and slow, heat is a diffuse sprite that swells, air is thin ribbons.
// Normal blending throughout — additive stacks overflow bloom (see the
// wembley notes) — and intensity 0 costs nothing (drawRange 0).
//
// All curves are given in METRES in the page's world frame.

import * as THREE from "three";
import { radialSpriteTexture } from "./helpers";

export type FlowStyle = "pulse" | "packet" | "block" | "power" | "air";

export interface FlowSpec {
  id: string;
  points: [number, number, number][];
  style: FlowStyle;
  color: number;
  /** particles on the curve */
  count?: number;
  /** curve lengths per second */
  speed?: number;
  /** world-unit size */
  size?: number;
  /** 0..1 lateral jitter (metres × 0.01) */
  spread?: number;
  /** move both ways (memory) */
  bidirectional?: boolean;
  /** jitter sideways only (streams that must stay on a floor) */
  flat?: boolean;
  closed?: boolean;
}

const STYLE: Record<FlowStyle, { count: number; speed: number; size: number; spread: number; opacity: number }> = {
  pulse: { count: 90, speed: 0.55, size: 0.006, spread: 0.2, opacity: 0.95 },
  packet: { count: 60, speed: 0.35, size: 0.005, spread: 0.6, opacity: 0.9 },
  block: { count: 40, speed: 0.25, size: 0.012, spread: 0.8, opacity: 0.85 },
  power: { count: 70, speed: 0.12, size: 0.009, spread: 0.3, opacity: 0.8 },
  air: { count: 140, speed: 0.2, size: 0.004, spread: 2.0, opacity: 0.55 },
};

interface Flow {
  spec: FlowSpec;
  curve: THREE.CatmullRomCurve3;
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  phase: Float32Array;
  jitter: Float32Array;
  dirs: Float32Array;
  count: number;
  speed: number;
  intensity: number;
  target: number;
  baseOpacity: number;
}

export class FlowSystem {
  readonly group = new THREE.Group();
  private flows = new Map<string, Flow>();
  private sprite: THREE.Texture;
  private _p = new THREE.Vector3();
  private _t = new THREE.Vector3();
  private _n = new THREE.Vector3();
  private _b = new THREE.Vector3();

  constructor(private tierScale = 1) {
    this.sprite = radialSpriteTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)");
    this.group.name = "flows";
  }

  add(spec: FlowSpec): void {
    const st = STYLE[spec.style];
    const count = Math.max(4, Math.round((spec.count ?? st.count) * this.tierScale));
    const curve = new THREE.CatmullRomCurve3(spec.points.map((p) => new THREE.Vector3(...p)), spec.closed ?? false, "catmullrom", 0.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({
      color: spec.color, size: spec.size ?? st.size, map: this.sprite, transparent: true,
      opacity: 0, depthWrite: false, sizeAttenuation: true, blending: THREE.NormalBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    const phase = new Float32Array(count);
    const jitter = new Float32Array(count * 2);
    const dirs = new Float32Array(count);
    let seed = 1234 + spec.id.length * 97;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < count; i++) {
      phase[i] = spec.style === "block" ? (i / count) : rnd();
      jitter[i * 2] = (rnd() - 0.5) * 2;
      jitter[i * 2 + 1] = (rnd() - 0.5) * 2;
      dirs[i] = spec.bidirectional && rnd() < 0.5 ? -1 : 1;
    }
    this.group.add(points);
    this.flows.set(spec.id, {
      spec, curve, points, mat, phase, jitter, dirs, count,
      speed: spec.speed ?? st.speed, intensity: 0, target: 0, baseOpacity: st.opacity,
    });
  }

  /** Set the target intensity (0..1) of a flow; it eases there over a few frames. */
  set(id: string, v: number): void {
    const f = this.flows.get(id);
    if (f) f.target = Math.min(1, Math.max(0, v));
  }

  /** Zero everything not in `keep` — chapters switch flows on and off by name. */
  only(keep: Record<string, number>): void {
    for (const [id, f] of this.flows) f.target = keep[id] ?? 0;
  }

  update(t: number, dt: number): void {
    const k = Math.min(1, dt * 4);
    for (const f of this.flows.values()) {
      f.intensity += (f.target - f.intensity) * k;
      if (f.intensity < 0.01) { f.points.visible = false; continue; }
      f.points.visible = true;
      f.mat.opacity = f.baseOpacity * f.intensity;
      const pos = f.points.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const spread = (f.spec.spread ?? STYLE[f.spec.style].spread) * 0.01;
      const shown = Math.max(2, Math.round(f.count * (0.35 + 0.65 * f.intensity)));
      for (let i = 0; i < shown; i++) {
        let u = (f.phase[i] + t * f.speed * f.dirs[i]) % 1;
        if (u < 0) u += 1;
        f.curve.getPointAt(u, this._p);
        if (spread > 0) {
          f.curve.getTangentAt(u, this._t);
          // a frame around the tangent for lateral jitter
          this._n.set(0, 1, 0);
          if (Math.abs(this._t.dot(this._n)) > 0.9) this._n.set(1, 0, 0);
          this._b.crossVectors(this._t, this._n).normalize();
          this._n.crossVectors(this._b, this._t).normalize();
          if (!f.spec.flat) this._p.addScaledVector(this._n, f.jitter[i * 2] * spread);
          this._p.addScaledVector(this._b, f.jitter[i * 2 + 1] * spread);
        }
        arr[i * 3] = this._p.x; arr[i * 3 + 1] = this._p.y; arr[i * 3 + 2] = this._p.z;
      }
      f.points.geometry.setDrawRange(0, shown);
      pos.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const f of this.flows.values()) { f.points.geometry.dispose(); f.mat.dispose(); }
    this.sprite.dispose();
  }
}

/** A diffuse field that swells with intensity — heat off a die, the glow of a
 * lit system. One Sprite, normal blending, so it can sit over anything. */
export class Field {
  readonly sprite: THREE.Sprite;
  private target = 0;
  private cur = 0;
  constructor(color: number, private baseScale: number, tex: THREE.Texture = radialSpriteTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)")) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending,
    }));
    this.sprite.visible = false;
  }
  set(v: number): void { this.target = Math.min(1, Math.max(0, v)); }
  update(t: number, dt: number): void {
    this.cur += (this.target - this.cur) * Math.min(1, dt * 3);
    if (this.cur < 0.01) { this.sprite.visible = false; return; }
    this.sprite.visible = true;
    const s = this.baseScale * (0.6 + 0.6 * this.cur) * (1 + 0.06 * Math.sin(t * 2.1));
    this.sprite.scale.set(s, s, 1);
    (this.sprite.material as THREE.SpriteMaterial).opacity = 0.4 * this.cur;
  }
}
