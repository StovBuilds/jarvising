// The abstract worlds of the story's silicon chapters — a stylised processor
// landscape (scenes 00–02) and a parallel-lanes GPU abstraction with the
// frame-build beat (scenes 08–09). They are explanatory, not literal (brief
// §5): blocks light in waves as work arrives, a cache layer sits close under
// the cores, thousands of lanes fire in parallel. They live in the same scene
// as the machine at remote origins so one renderer serves everything; the
// page cross-dips between them and the machine.
//
// Units: metres. Each world is ~40 m across so the camera can fly low through
// it with the same near/far planes as the machine.

import * as THREE from "three";

export const CPU_ORIGIN = new THREE.Vector3(0, -80, 0);
export const GPU_ORIGIN = new THREE.Vector3(120, -80, 0);

const _m = new THREE.Matrix4();
const _c = new THREE.Color();


/** Instance colours only tint the diffuse term; these worlds are made of light,
 * so the same colour is added as emission (bright instances glow, dark ones don't). */
function glowingInstances(mat: THREE.MeshStandardMaterial, boost = 1.6): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
#ifdef USE_COLOR
  totalEmissiveRadiance += pow(max(vColor.rgb, vec3(0.0)), vec3(1.6)) * ${boost.toFixed(2)};
#endif`,
    );
  };
  return mat;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Scene 01–02: core blocks, cache slabs, a low ground grid. */
export class CpuWorld {
  readonly group = new THREE.Group();
  private blocks: THREE.InstancedMesh;
  private cols = 44; private rows = 36;
  private heights: Float32Array;
  private cores: THREE.Vector2[] = [];
  private cache: THREE.Mesh[] = [];
  private baseColor = new THREE.Color(0x0e1116);
  private hot = new THREE.Color(0xffa25a);
  private cool = new THREE.Color(0x4f7fd6);
  /** how lit the landscape is (0 arrival → 1 processing) */
  activity = 0;
  /** 0..1 how far the cache reveal has come */
  cacheReveal = 0;
  /** 0..1 the arrival beat's single point of light (core 0) */
  spark = 0;
  /** 0..1 how much of the arrival pathway has drawn out from the core */
  pathway = 0;
  private pathLine: THREE.Line;
  private pathCount = 240;
  private slabEdges: THREE.LineSegments[] = [];
  private sparkMesh: THREE.Mesh;
  private key: THREE.PointLight;
  private fill: THREE.PointLight;

  constructor(reduced: boolean) {
    this.group.position.copy(CPU_ORIGIN);
    const n = this.cols * this.rows;
    const geo = new THREE.BoxGeometry(0.72, 1, 0.72);
    geo.translate(0, 0.5, 0);
    const mat = glowingInstances(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6 }), 1.8);
    this.blocks = new THREE.InstancedMesh(geo, mat, n);
    this.heights = new Float32Array(n);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // eight "core" regions + an I/O strip: taller blocks cluster around each core centre
    for (let i = 0; i < 8; i++) this.cores.push(new THREE.Vector2(-15 + (i % 4) * 10, i < 4 ? -7 : 7));
    let k = 0;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++, k++) {
      const x = (c - this.cols / 2) * 0.9, z = (r - this.rows / 2) * 0.9;
      let near = 99;
      for (const cc of this.cores) near = Math.min(near, Math.hypot(x - cc.x, z - cc.y));
      const h = 0.15 + Math.max(0, 2.2 - near * 0.35) * (0.5 + rnd()) + rnd() * 0.25;
      this.heights[k] = h;
      _m.makeScale(1, h, 1).setPosition(x, 0, z);
      this.blocks.setMatrixAt(k, _m);
      this.blocks.setColorAt(k, this.baseColor);
    }
    this.blocks.instanceMatrix.needsUpdate = true;
    this.blocks.castShadow = false;
    this.group.add(this.blocks);
    // ground: a dark reflective plane + a faint grid
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.62, metalness: 0.55 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    this.group.add(ground);
    const grid = new THREE.GridHelper(80, 80, 0x1b2230, 0x11151d);
    grid.position.y = 0.01;
    this.group.add(grid);
    // cache: three translucent slabs stacked under the landscape, revealed in scene 02
    for (let i = 0; i < 3; i++) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(18, 0.5, 6),
        new THREE.MeshPhysicalMaterial({ color: 0x1b3a5c, emissive: 0x2b6fd0, emissiveIntensity: 0.25, roughness: 0.62, metalness: 0.08, transparent: true, opacity: 0 }),
      );
      slab.position.set(0, 0.6 + i * 1.0, 20);
      slab.visible = false;
      this.cache.push(slab);
      this.group.add(slab);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(slab.geometry),
        new THREE.LineBasicMaterial({ color: 0x9cc4ff, transparent: true, opacity: 0 }),
      );
      edges.position.copy(slab.position);
      edges.visible = false;
      this.slabEdges.push(edges);
      this.group.add(edges);
    }
    // the arrival pathway: a line of light that draws out from core 0 toward where the camera starts
    const pathCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-15, 1.6, -7), new THREE.Vector3(-20, 2.0, 2), new THREE.Vector3(-27, 2.4, 12),
      new THREE.Vector3(-33, 2.8, 24), new THREE.Vector3(-36, 3.2, 32),
    ]);
    const pathGeo = new THREE.BufferGeometry().setFromPoints(pathCurve.getPoints(this.pathCount - 1));
    pathGeo.setDrawRange(0, 0);
    this.pathLine = new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.9 }));
    this.group.add(this.pathLine);
    // key light for the landscape
    this.key = new THREE.PointLight(0xffd2a8, reduced ? 20 : 28, 70, 1.6);
    this.key.position.set(6, 13, 4);
    this.group.add(this.key);
    this.fill = new THREE.PointLight(0x5a8cff, 12, 80, 1.8);
    this.fill.position.set(-14, 6, -10);
    this.group.add(this.fill);
    this.sparkMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0 }),
    );
    this.sparkMesh.position.set(-15, 1.6, -7);
    this.group.add(this.sparkMesh);
    this.group.visible = false;
  }

  /** Per frame. `t` seconds; activity + cacheReveal set by the page from scroll. */
  update(t: number): void {
    if (!this.group.visible) return;
    const a = this.activity;
    this.key.intensity = 28 * Math.max(0.04, a);
    this.fill.intensity = 12 * Math.max(0.1, a);
    const sp = this.spark * (1 - a * 0.7);
    this.sparkMesh.scale.setScalar(0.3 + 1.6 * sp + 0.1 * Math.sin(t * 6));
    (this.sparkMesh.material as THREE.MeshBasicMaterial).opacity = sp;
    this.pathLine.geometry.setDrawRange(0, Math.round(this.pathway * this.pathCount));
    (this.pathLine.material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - a * 0.75);
    let k = 0;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++, k++) {
      const x = (c - this.cols / 2) * 0.9, z = (r - this.rows / 2) * 0.9;
      // a wave of work sweeping across, plus each core pulsing at its own rhythm
      let e = 0;
      for (let i = 0; i < this.cores.length; i++) {
        const cc = this.cores[i];
        const d = Math.hypot(x - cc.x, z - cc.y);
        const beat = 0.5 + 0.5 * Math.sin(t * (1.6 + i * 0.13) + i * 1.9);
        e += Math.max(0, 1 - d / 4.5) * beat;
      }
      const sweep = 0.5 + 0.5 * Math.sin(x * 0.35 - t * 2.2);
      e = Math.min(1, e * 0.9 + sweep * 0.12) * a;
      _c.copy(this.baseColor).lerp(e > 0.55 ? this.hot : this.cool, e * 1.4);
      this.blocks.setColorAt(k, _c);
    }
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
    const cr = this.cacheReveal;
    this.cache.forEach((s, i) => {
      const o = smooth(i * 0.2, 0.5 + i * 0.2, cr) * 0.75;
      s.visible = o > 0.01;
      (s.material as THREE.MeshPhysicalMaterial).opacity = o;
      (s.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.3 + i));
      const e = this.slabEdges[i];
      e.visible = s.visible;
      (e.material as THREE.LineBasicMaterial).opacity = o * 1.1;
    });
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
  }
}

/** Scenes 08–09: lanes of parallel work and the frame assembling on a plane. */
export class GpuWorld {
  readonly group = new THREE.Group();
  private lanes: THREE.InstancedMesh;
  private laneCount: number;
  private laneX: Float32Array;
  private domain: Uint8Array;
  private framePlane: THREE.Mesh;
  private frameTex: THREE.CanvasTexture;
  private frameCtx: CanvasRenderingContext2D;
  private lastStep = -1;
  private palette = [new THREE.Color(0x66e0ff), new THREE.Color(0xa78bfa), new THREE.Color(0xffb35c), new THREE.Color(0x7dffb0)];
  /** 0..1 activity of the lanes */
  activity = 0;
  /** 0..1 progress of the frame-build beat (wire → geometry → materials → lighting → reflections → frame) */
  frame = 0;
  /** memory chapter: 0..1 pulls the lit region outward to the memory rings */
  memory = 0;
  private rings: THREE.Mesh[] = [];
  private labels: THREE.Sprite[] = [];
  private rays: THREE.LineSegments;
  /** domain band centres along X (four work domains across the lanes) */
  readonly domainX: number[] = [];

  constructor(reduced: boolean) {
    this.group.position.copy(GPU_ORIGIN);
    const perRow = reduced ? 64 : 112;
    const rows = 4;
    this.laneCount = perRow * rows;
    const geo = new THREE.BoxGeometry(0.26, 0.12, 40);
    const mat = glowingInstances(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.5 }), 2.2);
    this.lanes = new THREE.InstancedMesh(geo, mat, this.laneCount);
    this.laneX = new Float32Array(this.laneCount);
    this.domain = new Uint8Array(this.laneCount);
    let k = 0;
    for (let r = 0; r < rows; r++) for (let i = 0; i < perRow; i++, k++) {
      const x = (i - perRow / 2) * 0.36;
      this.laneX[k] = x;
      this.domain[k] = Math.floor((i / perRow) * 4); // GEOMETRY / SHADING / RAY TRACING / AI
      _m.makeTranslation(x, r * 0.7, 0);
      this.lanes.setMatrixAt(k, _m);
      this.lanes.setColorAt(k, new THREE.Color(0x0b0d12));
    }
    this.lanes.instanceMatrix.needsUpdate = true;
    this.group.add(this.lanes);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.6, metalness: 0.55 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.3;
    this.group.add(floor);
    // memory: two rings of "packages" around the lanes, lit in scene 09
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 3), new THREE.MeshStandardMaterial({ color: 0x0f131b, emissive: 0xa78bfa, emissiveIntensity: 0, roughness: 0.4, metalness: 0.5 }));
      m.position.set(Math.cos(a) * 26, 0.2, Math.sin(a) * 26);
      m.rotation.y = -a;
      this.rings.push(m);
      this.group.add(m);
    }
    // domain labels above each band of lanes (storyboard: GEOMETRY / SHADING / RAY TRACING / AI)
    const bandW = perRow * 0.36;
    const names = ["GEOMETRY", "SHADING", "RAY TRACING", "AI / UPSCALING"];
    const css = ["#66e0ff", "#a78bfa", "#ffb35c", "#7dffb0"];
    for (let d = 0; d < 4; d++) {
      const cx = -bandW / 2 + (d + 0.5) * (bandW / 4);
      this.domainX.push(cx);
      const c = document.createElement("canvas");
      c.width = 512; c.height = 128;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = css[d];
      ctx.font = "600 44px 'Space Grotesk', system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.letterSpacing = "8px";
      ctx.fillText(names[d], 256, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      sp.scale.set(7, 1.75, 1);
      sp.position.set(cx, 3.0, -2);
      this.labels.push(sp);
      this.group.add(sp);
    }
    // the lighting beat: a fan of rays from a light toward the frame plane
    const rayPts: number[] = [];
    let rs = 99;
    const rr = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
    for (let i = 0; i < 28; i++) {
      rayPts.push(0, 6, 3, -7 + rr() * 14, 2.5 + rr() * 7, -6);
    }
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute("position", new THREE.Float32BufferAttribute(rayPts, 3));
    this.rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0 }));
    this.rays.visible = false;
    this.group.add(this.rays);
    // the frame: a floating plane the scene draws itself onto in five steps
    const c = document.createElement("canvas");
    c.width = 768; c.height = 432;
    this.frameCtx = c.getContext("2d")!;
    this.frameTex = new THREE.CanvasTexture(c);
    this.frameTex.colorSpace = THREE.SRGBColorSpace;
    this.framePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 9),
      new THREE.MeshBasicMaterial({ map: this.frameTex, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.framePlane.position.set(0, 6, -6);
    this.group.add(this.framePlane);
    const key = new THREE.PointLight(0x9fd8ff, reduced ? 18 : 30, 90, 1.5);
    key.position.set(0, 14, 8);
    this.group.add(key);
    this.group.visible = false;
    this.drawFrame(0);
  }

  /** Draw the stylised game scene at build step 0..5 (wire → complete). */
  private drawFrame(step: number): void {
    if (step === this.lastStep) return;
    this.lastStep = step;
    const ctx = this.frameCtx, W = 768, H = 432;
    ctx.clearRect(0, 0, W, H);
    const wire = step <= 1;
    const bg = step >= 3;
    if (bg) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, step >= 4 ? "#1a2a4a" : "#243352"); g.addColorStop(1, step >= 4 ? "#0a0e18" : "#0c101a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else { ctx.fillStyle = "#05060a"; ctx.fillRect(0, 0, W, H); }
    // ground
    ctx.fillStyle = step >= 2 ? (step >= 3 ? "#232a2c" : "#3a3a3a") : "transparent";
    if (step >= 2) ctx.fillRect(0, H * 0.62, W, H * 0.38);
    // buildings
    const bl = [[60, 160], [180, 230], [330, 120], [480, 200], [610, 260]];
    bl.forEach(([x, h], i) => {
      const w = 90 + (i % 2) * 30, y = H * 0.62 - h;
      if (wire) {
        ctx.strokeStyle = step === 0 ? "#3fd3ff" : "#66e0ff"; ctx.lineWidth = 1.2;
        ctx.strokeRect(x, y, w, h);
        for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x, y + (h * k) / 4); ctx.lineTo(x + w, y + (h * k) / 4); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke();
      } else {
        ctx.fillStyle = step >= 3 ? ["#4b5563", "#374151", "#52525b", "#3f3f46", "#44403c"][i] : "#6b7280";
        ctx.fillRect(x, y, w, h);
        if (step >= 3) { // lit windows
          ctx.fillStyle = "#ffd27a";
          for (let r = 0; r < Math.floor(h / 26); r++) for (let c = 0; c < 3; c++) if ((r * 3 + c + i) % 3 !== 0) ctx.fillRect(x + 12 + c * 26, y + 10 + r * 26, 10, 12);
        }
        if (step >= 4) { // reflection strip
          ctx.globalAlpha = 0.18; ctx.fillStyle = "#9fd8ff";
          ctx.fillRect(x, H * 0.62, w, h * 0.35); ctx.globalAlpha = 1;
        }
      }
    });
    if (step >= 3) { // a sun and a soft haze
      ctx.fillStyle = "#ffb35c"; ctx.beginPath(); ctx.arc(650, 90, 34, 0, Math.PI * 2); ctx.fill();
    }
    if (step >= 5) { // finished frame: vignette + a tiny HUD
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8e6df"; ctx.font = "600 18px system-ui"; ctx.fillText("FRAME 04812", 24, 30);
    }
    this.frameTex.needsUpdate = true;
  }

  update(t: number): void {
    if (!this.group.visible) return;
    const a = this.activity;
    for (let k = 0; k < this.laneCount; k++) {
      const x = this.laneX[k];
      const d = this.domain[k];
      // work pulses travel down each lane; each domain has its own tempo
      const phase = Math.sin(x * 0.9 + t * (3.2 + d * 0.6) + k * 0.37);
      const e = Math.max(0, phase) * a * (0.55 + 0.45 * Math.sin(t * 0.8 + d));
      _c.setRGB(0.04, 0.05, 0.07).lerp(this.palette[d], e);
      this.lanes.setColorAt(k, _c);
    }
    if (this.lanes.instanceColor) this.lanes.instanceColor.needsUpdate = true;
    const step = Math.min(5, Math.floor(this.frame * 5.999));
    this.drawFrame(step);
    (this.framePlane.material as THREE.MeshBasicMaterial).opacity = smooth(0, 0.12, this.frame) * (1 - smooth(0.97, 1, this.frame) * 0.4);
    this.framePlane.position.y = 6 + Math.sin(t * 0.6) * 0.15;
    const labelA = a * (1 - smooth(0.35, 0.65, this.frame)) * (1 - this.memory);
    this.labels.forEach((l, i) => {
      (l.material as THREE.SpriteMaterial).opacity = labelA * (0.75 + 0.25 * Math.sin(t * 1.4 + i));
      l.position.y = 3.0 + Math.sin(t * 0.7 + i * 1.3) * 0.12;
    });
    const rayA = smooth(0.5, 0.6, this.frame) * (1 - smooth(0.85, 0.95, this.frame));
    this.rays.visible = rayA > 0.01;
    (this.rays.material as THREE.LineBasicMaterial).opacity = rayA * (0.3 + 0.3 * Math.max(0, Math.sin(t * 9)));
    this.rings.forEach((r, i) => {
      (r.material as THREE.MeshStandardMaterial).emissiveIntensity = this.memory * (0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + i * 0.8)));
    });
  }

  dispose(): void {
    this.frameTex.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
  }
}
