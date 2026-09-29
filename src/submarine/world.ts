// The world around the boat: the escort, the seabed with its wreck and mines,
// the sea surface, the layer, light shafts, marine snow and the sonar shells.
import * as THREE from "three";
import { ESCORT_R, LAYER_Y, SEABED_Y, TAU, jFbm, jHash, rng } from "./constants";
import { curveSet, makeProfile, mesh, range, ringLower, ringUpper, sweep } from "./geometry";
import type { Materials } from "./materials";
import { GLSL, SH, WORLD_N_VS, WORLD_VS, std } from "./shaders";

export const WRECK = new THREE.Vector3(96, 0, -74);
export const seabedH = (x: number, z: number) => {
  let h = SEABED_Y + 20 * (jFbm(x * 0.003, z * 0.003) - 0.5) + 6 * (jFbm(x * 0.011 + 4, z * 0.011 - 2) - 0.5);
  const dw = Math.hypot(x - WRECK.x, z - WRECK.z);
  h -= 3 * Math.exp(-(dw * dw) / 900);
  return h;
};
WRECK.y = seabedH(WRECK.x, WRECK.z);

export function buildWorld(scene: THREE.Scene, M: Materials, pixelRatio: number) {
  // Background: a big sphere painted with the same water colour the fog uses.
  {
    const m = new THREE.ShaderMaterial({
      uniforms: SH, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: WORLD_VS,
      fragmentShader: GLSL + "varying vec3 vW; void main(){ vec3 dir = normalize(vW - cameraPosition); gl_FragColor = vec4(abyss(dir, cameraPosition.y + dir.y * 320.0), 1.0); }",
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), m);
    sky.renderOrder = -10; sky.frustumCulled = false;
    scene.add(sky);
  }

  // ── the escort ──
  const escort = new THREE.Group();
  scene.add(escort);
  {
    const E = curveSet({
      a: [[-47, 3.4], [-40, 4.6], [-20, 5.2], [10, 5.2], [28, 4.0], [40, 2.0], [48, 0.08]],
      b: [[-47, -1.4], [-40, -2.5], [-20, -3.4], [10, -3.4], [28, -3.2], [40, -2.4], [48, 0.2]],
      m: [[-47, 0.2], [0, -0.6], [48, 0.8]],
      t: [[-47, 3], [0, 3.2], [48, 6]],
      dw: [[-47, 3.4], [-40, 4.6], [-20, 5.2], [10, 5.2], [28, 4.0], [40, 2.0], [48, 0.08]],
    });
    const prof = makeProfile(E, 3.2), xs = range(-47, 48, 90);
    const em = std(0x3a444c, 0.7, 0.3, { noCaustic: true }, { side: THREE.DoubleSide });
    mesh(sweep(xs, ringUpper(prof)), em, 0, 0, 0, escort, false);
    mesh(sweep(xs, ringLower(prof)), em, 0, 0, 0, escort, false);
    for (const s of [1, -1]) {
      const sh = mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 8), M.steel, -38, -2.7, s * 1.9, escort, false); sh.rotation.z = Math.PI / 2;
      const hub = mesh(new THREE.SphereGeometry(0.9, 12, 8), M.bronze, -42.6, -2.7, s * 1.9, escort, false); hub.scale.set(0.5, 1.4, 1.4);
      mesh(new THREE.BoxGeometry(22, 0.5, 0.12), M.dark, -4, -2.8, s * 4.4, escort, false).rotation.x = s * 0.7;
    }
    mesh(new THREE.BoxGeometry(2.4, 2.6, 0.15), M.dark, -45.4, -2.2, 0, escort, false);
    const dome = mesh(new THREE.SphereGeometry(1, 20, 12), M.steel, 26, -3.6, 0, escort, false); dome.scale.set(1.7, 0.9, 1.0);
  }
  const escortSonar = new THREE.Vector3(26, -4.3, 0);

  // ── seabed, rocks, the wreck ──
  {
    const g = new THREE.PlaneGeometry(1800, 1800, 220, 220); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, seabedH(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const floor = mesh(g, std(0x6d7a80, 0.97, 0.0, { sand: true, sharp: "0.1" }), 0, 0, 0, scene, false);
    floor.receiveShadow = false;
    const rg = new THREE.IcosahedronGeometry(1, 1);
    { const q = rg.attributes.position; for (let i = 0; i < q.count; i++) { const f = 0.75 + 0.5 * jHash(q.getX(i) * 3.1, q.getZ(i) * 2.7 + q.getY(i)); q.setXYZ(i, q.getX(i) * f, q.getY(i) * f, q.getZ(i) * f); } rg.computeVertexNormals(); }
    const rocks = new THREE.InstancedMesh(rg, std(0x485359, 0.95, 0.0, { sharp: "0.12" }), 90);
    const d = new THREE.Object3D();
    for (let i = 0; i < 90; i++) {
      const a = jHash(i, 1) * TAU, r = 30 + jHash(i, 2) * 480, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 1.5 + Math.pow(jHash(i, 3), 2) * 9;
      d.position.set(x, seabedH(x, z) - s * 0.25, z); d.scale.set(s * (0.8 + jHash(i, 4) * 0.8), s * (0.4 + jHash(i, 5) * 0.4), s); d.rotation.set(0, jHash(i, 6) * TAU, 0);
      d.updateMatrix(); rocks.setMatrixAt(i, d.matrix);
    }
    scene.add(rocks);

    // the wreck: a freighter broken in two
    const F = curveSet({
      a: [[-40, 3.2], [-36, 5.2], [-25, 6.4], [20, 6.4], [30, 5.0], [36, 2.6], [40.5, 0.1]],
      b: [[-40, -2.2], [-36, -4.6], [-25, -5.2], [20, -5.2], [30, -5.0], [36, -3.8], [40.5, -0.8]],
      m: [[-40, -0.5], [-25, -1], [20, -1], [36, -0.5], [40.5, 0.5]],
      t: [[-40, 5], [-25, 4.6], [20, 4.6], [36, 5.2], [40.5, 6.0]],
      dw: [[-40, 3.2], [-36, 5.2], [-25, 6.4], [20, 6.4], [30, 5.0], [36, 2.6], [40.5, 0.1]],
    });
    const fp = makeProfile(F, 4.0);
    const rust = std(0x6a5244, 0.9, 0.2, { hull: true, sharp: "0.14" }, { side: THREE.DoubleSide });
    const wreck = new THREE.Group(); wreck.position.copy(WRECK); wreck.rotation.y = 0.6; scene.add(wreck);
    const fwd = new THREE.Group(); fwd.position.set(6, 2.2, 0); fwd.rotation.set(0.32, 0.12, 0.05); wreck.add(fwd);
    const xsF = range(-2, 40.5, 40);
    mesh(sweep(xsF, ringUpper(fp)), rust, 0, 0, 0, fwd); mesh(sweep(xsF, ringLower(fp)), rust, 0, 0, 0, fwd);
    mesh(new THREE.CylinderGeometry(0.25, 0.3, 14, 8), rust, 20, 10, 0, fwd).rotation.z = -0.35;
    for (const x of [8, 26]) mesh(new THREE.BoxGeometry(5, 1.2, 6), rust, x, 5.2, 0, fwd);
    const aft = new THREE.Group(); aft.position.set(-9, 1.4, 5); aft.rotation.set(-0.22, -0.42, -0.08); wreck.add(aft);
    const xsA = range(-40, -6, 34);
    mesh(sweep(xsA, ringUpper(fp)), rust, 0, 0, 0, aft); mesh(sweep(xsA, ringLower(fp)), rust, 0, 0, 0, aft);
    mesh(new THREE.BoxGeometry(9, 6, 10), rust, -26, 7.5, 0, aft);
    mesh(new THREE.BoxGeometry(5, 3, 7), rust, -26, 12, 0, aft);
    const funnel = mesh(new THREE.CylinderGeometry(1.7, 1.9, 8, 18, 1, true), rust, -18, -1, 12, wreck); funnel.rotation.set(1.3, 0, 0.5);
    mesh(new THREE.CylinderGeometry(0.22, 0.28, 16, 8), rust, -14, 8, 0, aft).rotation.z = 0.5;
  }

  // ── moored mines ──
  const MINES: THREE.Vector3[] = [];
  {
    const mm = std(0x2b3238, 0.6, 0.5, { sharp: "0.4" });
    const horn = new THREE.CylinderGeometry(0.06, 0.09, 0.4, 6);
    for (let i = 0; i < 6; i++) {
      const x = -130 + i * 50 + jHash(i, 9) * 12, z = 82 + (i % 2) * 9, y = -36 - jHash(i, 8) * 10;
      const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
      mesh(new THREE.SphereGeometry(0.85, 18, 12), mm, 0, 0, 0, g, false);
      for (let k = 0; k < 7; k++) {
        const h = mesh(horn, mm, 0, 0, 0, g, false);
        const th = (k / 7) * TAU, ph = k === 6 ? 0 : 1.0;
        const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        h.position.copy(dir.clone().multiplyScalar(0.9)); h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      }
      const floorY = seabedH(x, z), len = y - floorY;
      mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 5), mm, 0, -len / 2 - 0.8, 0, g, false);
      MINES.push(g.position);
    }
  }

  // ── the sea surface, seen from below (Snell's window, the escort's wake) ──
  const surfaceU = { uEscA: { value: 0 }, uEscR: { value: ESCORT_R } };
  {
    const g = new THREE.PlaneGeometry(4000, 4000, 1, 1); g.rotateX(Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: { ...SH, ...surfaceU }, side: THREE.DoubleSide, fog: false,
      vertexShader: WORLD_VS,
      fragmentShader: GLSL + /* glsl */ `
        uniform float uEscA; uniform float uEscR; varying vec3 vW;
        void main(){
          vec3 V = normalize(vW - cameraPosition);
          float cosT = V.y;
          float win = smoothstep(0.63, 0.7, cosT);
          float rimL = exp(-pow((cosT - 0.665) * 38.0, 2.0));
          float n = fbm(vW.xz * 0.018 + vec2(uTime * 0.02, -uTime * 0.013));
          float c = caustic(vW.xz * 0.05, uTime * 0.5);
          vec3 sky = vec3(0.4, 0.7, 0.78) * (0.85 + 0.6 * n) + vec3(0.6, 0.9, 1.0) * c * 0.35;
          vec3 tir = vec3(0.018, 0.075, 0.1) * (0.7 + 0.7 * n) + vec3(0.1, 0.25, 0.3) * c * 0.1;
          vec3 col = mix(tir, sky, win) + vec3(0.7, 0.95, 1.0) * rimL * 0.35;
          float r = length(vW.xz);
          float ang = atan(vW.z, vW.x);
          float behind = mod(uEscA - ang, 6.2831853);
          float arc = behind * uEscR;
          float wakeW = 3.5 + arc * 0.07;
          float wake = exp(-pow((r - uEscR) / wakeW, 2.0)) * exp(-arc / 120.0) * step(arc, 520.0);
          wake *= (0.5 + 0.9 * vnoise(vW.xz * 0.35 + uTime * 0.3)) * smoothstep(0.06, 0.32, cosT);
          col += vec3(0.85, 1.0, 1.0) * wake * 0.9;
          col += waveGlow(vW, 0.02) * 0.12;
          gl_FragColor = vec4(applyFog(col, vW, 0.72), 1.0);
        }`,
    });
    const surf = new THREE.Mesh(g, m); surf.renderOrder = -5; scene.add(surf);
  }

  // ── the layer: a faint contoured sheet at the thermocline ──
  const layerU = { uCenter: { value: new THREE.Vector3() } };
  {
    const g = new THREE.PlaneGeometry(1600, 1600, 1, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: { ...SH, ...layerU }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: WORLD_VS,
      fragmentShader: GLSL + /* glsl */ `
        uniform vec3 uCenter; varying vec3 vW;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float graze = 1.0 - abs(V.y);
          float n = fbm(vW.xz * 0.011 + vec2(uTime * 0.004, uTime * 0.003));
          float iso = n * 10.0; float fi = fract(iso); float fw = max(fwidth(iso), 1e-4);
          float line = 1.0 - smoothstep(0.0, fw * 1.5, min(fi, 1.0 - fi));
          float body = 0.012 + 0.07 * pow(graze, 4.0);
          float fade = 1.0 - smoothstep(240.0, 640.0, length(vW.xz - uCenter.xz));
          vec3 col = vec3(0.3, 0.85, 0.85) * (body * (0.5 + 0.9 * n) + line * 0.06);
          col += waveGlow(vW, 0.3) * 1.0;
          gl_FragColor = vec4(col * fade * fogKeep(vW, 0.9), 1.0);
        }`,
    });
    const layer = new THREE.Mesh(g, m); layer.position.y = LAYER_Y; layer.renderOrder = 2; scene.add(layer);
  }

  // ── light shafts ──
  const rays = new THREE.Group(); scene.add(rays);
  {
    const m = new THREE.ShaderMaterial({
      uniforms: SH, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: WORLD_N_VS,
      fragmentShader: GLSL + /* glsl */ `
        varying vec3 vW; varying vec3 vN;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float edge = pow(abs(dot(normalize(vN), V)), 4.0);
          float yf = smoothstep(-175.0, -2.0, vW.y);
          float flick = 0.55 + 0.45 * sin(uTime * 0.6 + vW.x * 0.05 + vW.z * 0.07);
          float a = edge * yf * yf * flick;
          gl_FragColor = vec4(vec3(0.45, 0.8, 0.9) * a * 0.06 * fogKeep(vW, 0.7), 1.0);
        }`,
    });
    for (let i = 0; i < 10; i++) {
      const rt = 1.2 + jHash(i, 21) * 3, rb = rt * (2.6 + jHash(i, 22) * 2), h = 190;
      const g = new THREE.CylinderGeometry(rt, rb, h, 24, 1, true); g.translate(0, -h / 2, 0);
      const r = new THREE.Mesh(g, m);
      r.userData = { ox: (jHash(i, 23) - 0.5) * 220, oz: (jHash(i, 24) - 0.5) * 220, ph: jHash(i, 25) * TAU };
      r.rotation.z = 0.2; r.rotation.x = 0.07; r.renderOrder = 3;
      rays.add(r);
    }
  }

  // ── marine snow, wrapped in a box that follows the camera target ──
  const snowU = { uCenter: { value: new THREE.Vector3() }, uPR: { value: pixelRatio } };
  {
    const rand = rng(1790666297);
    const N = 2600, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = rand() * 280; pos[i * 3 + 1] = rand() * 240; pos[i * 3 + 2] = rand() * 280; seed[i] = rand(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { ...SH, ...snowU }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: GLSL + /* glsl */ `
        uniform vec3 uCenter; uniform float uPR; attribute float aSeed; varying float vA; varying vec3 vG;
        void main(){
          vec3 box = vec3(280.0, 240.0, 280.0);
          vec3 p = position + vec3(sin(uTime * 0.1 + aSeed * 6.28) * 2.0, -uTime * (0.25 + aSeed * 0.5), cos(uTime * 0.08 + aSeed * 3.0) * 2.0);
          p = mod(p - uCenter + box * 0.5, box) - box * 0.5 + uCenter;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          gl_PointSize = clamp((1.2 + aSeed * 2.2) * uPR * (70.0 / max(dist, 1.0)), 1.0, 14.0);
          vA = smoothstep(3.0, 10.0, dist) * (1.0 - smoothstep(90.0, 180.0, dist)) * step(p.y, -0.6);
          vG = waveGlow(p, 0.04);
        }`,
      fragmentShader: `varying float vA; varying vec3 vG;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.05, length(c));
          gl_FragColor = vec4((vec3(0.32, 0.48, 0.52) * 0.28 + vG * 2.2) * a * vA, 1.0); }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  }

  // ── ping and echo shells ──
  const SHELLS = [0, 1, 2, 3].map(() => {
    const u = { ...SH, uColor: { value: new THREE.Color() }, uStrength: { value: 0 }, uOrigin: { value: new THREE.Vector3() } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: WORLD_N_VS,
      fragmentShader: GLSL + /* glsl */ `
        uniform vec3 uColor; uniform float uStrength; uniform vec3 uOrigin; varying vec3 vW; varying vec3 vN;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
          float surf = smoothstep(-1.0, -14.0, vW.y);
          float near = smoothstep(4.0, 45.0, length(vW - cameraPosition));
          vec3 rel = normalize(vW - uOrigin);
          float bands = 0.7 + 0.3 * sin(acos(clamp(rel.y, -1.0, 1.0)) * 70.0 - uTime * 2.0);
          float a = (0.012 + 0.3 * fres) * bands * uStrength * surf * near * layerAtt(uOrigin, vW);
          gl_FragColor = vec4(uColor * a * fogKeep(vW, 0.6), 1.0);
        }`,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), m);
    s.visible = false; s.frustumCulled = false; s.renderOrder = 4;
    scene.add(s);
    return s;
  });

  return { escort, escortSonar, MINES, surfaceU, layerU, rays, snowU, SHELLS };
}
export type World = ReturnType<typeof buildWorld>;
