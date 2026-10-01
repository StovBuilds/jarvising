// Entry 004, Below the Layer: the 3D scene. ./main.ts loads this module only when the
// browser can run three.js (WebGL2); otherwise it shows ./fallback.ts instead.
//
// A British T-class submarine hunted by a surface
// escort's ASDIC. Ported from a single-file claude.ai artifact (three 0.169 from a
// CDN) to this site's bundled three and a CSP with no third-party requests.
//
// URL switches (all optional):
//   ?depth=280&view=open&ping=0.4&t=12   a pinned, frozen state for QA, the rig and the
//        Etymology frames: keel depth in feet (40–350), assembled|open, a ping part-way
//        through its round trip to the boat (0 = just sent, 0.5 = at the hull, 1 = echo
//        home), and the scene clock in seconds (default 12). Time stops; nothing eases.
//   &shot=0..5   with a pin: frame the picture from cinematic shot n (hero/og renders)
//   &bare=1      hide the interface
//   ?kiosk=1     unattended attract loop: auto-ping, the boat works through its depths
//                and opens up, cinematic cameras (unless reduced motion); a touch
//                pauses the loop for a minute
//   ?probe=1     window.__subProbe: renderer.info for the whole frame (every composer
//                pass), first-frame time, and the boat's state, for tools/measure-rig.mjs
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  C_ECHO, C_PING, ESCORT_PERIOD, ESCORT_R, FT, FT_MAX, FT_MIN, KEEL, LAYER_FT, LAYER_Y, PING_EVERY, PSI_PER_M,
  TAU, TEST_FT, V_REAL, V_SHOWN, clamp, lerp, rng, smooth,
} from "./constants";
import { SH } from "./shaders";
import { makeMaterials } from "./materials";
import { COMPS, buildBoat, rPH } from "./boat";
import { showFallback } from "./fallback";
import { tryRenderer } from "../shared/webgl";
import { WRECK, buildWorld, seabedH } from "./world";
import { makeSound } from "./sound";
import { makeScope, type Contact, type PingRec } from "./scope";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const Q = new URLSearchParams(location.search);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PROBE = Q.get("probe") === "1";
const KIOSK = Q.get("kiosk") === "1";
const PINNED = ["depth", "view", "ping", "t", "shot"].some((k) => Q.has(k));
const num = (k: string, d: number) => { const v = Number(Q.get(k)); return Q.has(k) && Number.isFinite(v) ? v : d; };
const PIN = PINNED ? {
  depthFt: clamp(Math.round(num("depth", 40) / 5) * 5, FT_MIN, FT_MAX),
  open: Q.get("view") === "open",
  ping: Q.has("ping") ? clamp(num("ping", 0), 0, 1.5) : null,
  t: Math.max(0, num("t", 12)),
  shot: Q.has("shot") ? clamp(Math.round(num("shot", 0)), 0, 5) : null,
} : null;
if (KIOSK) document.documentElement.classList.add("kiosk");

// ─── renderer, scene, camera ─────────────────────────────────────────────
// tryRenderer returns null if the constructor throws; throwing here rejects main.ts's
// import() of this module, which then shows the still version
const renderer = tryRenderer(() => new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" })) ?? noRenderer();
function noRenderer(): never { throw new Error("Below the layer: no WebGL renderer"); }
const touch = matchMedia("(hover: none)").matches;
const PR = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 1.75);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
// three r180 retired PCFSoftShadowMap (it now falls back with a warning); PCFShadowMap is its soft successor
renderer.shadowMap.type = THREE.PCFShadowMap;
if (PROBE) renderer.info.autoReset = false;
$("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.5, 4000);

const hemi = new THREE.HemisphereLight(0x8cc6d8, 0x05101a, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xc6ecff, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(touch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 30, bottom: -30, near: 1, far: 160 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x2f6f8f, 0.9);
rim.position.set(-60, -40, -80);
scene.add(rim);

const M = makeMaterials();
const { sub, P } = buildBoat(M);
scene.add(sub);
const { escort, escortSonar, MINES, surfaceU, layerU, rays, snowU, SHELLS } = buildWorld(scene, M, PR);

// ─── post-processing ─────────────────────────────────────────────────────
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(PR);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.6, 0.5);
composer.addPass(bloom);
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec2 off = c * r2 * 0.014;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - smoothstep(0.1, 0.62, r2) * 0.5;
      float g = fract(sin(dot(floor(vUv * uRes) + fract(uTime * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      col *= 1.0 + (g - 0.5) * 0.12;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

// ─── state ───────────────────────────────────────────────────────────────
interface Wave { o: THREE.Vector3; t0: number; color: THREE.Color; s0: number; maxR: number; echo?: boolean }
interface Ping extends PingRec { o: THREE.Vector3; boatDone: boolean; returned: boolean; echoAt: THREE.Vector3 }
const S = {
  depth: 40 * FT, depthTarget: 40 * FT, depthFt: 40, vy: 0,
  explode: 0, explodeTarget: 0,
  auto: !reduceMotion && !PINNED, sound: false, cine: false, bare: false,
  lastPing: null as Ping | null, nextPing: 1.4,
  echo: null as { s: number; R: number } | null,
  hit: null as { t: number; s: number } | null,
};
const waves: Wave[] = [];
const subAxisY = () => -(S.depth - KEEL);
const random = rng(29);

// The scene clock. three r183 deprecated THREE.Clock (the original used it); this is
// the same thing: seconds since the first frame. Pinned, it stands still at PIN.t.
let clockStart = -1;
const elapsed = () => {
  if (PIN) return PIN.t;
  const now = performance.now();
  if (clockStart < 0) clockStart = now;
  return (now - clockStart) / 1000;
};

// camera defaults
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 16, maxDistance: 340, rotateSpeed: 0.6, zoomSpeed: 0.8, panSpeed: 0.7 });
controls.maxPolarAngle = Math.PI * 0.94;
const target = new THREE.Vector3(3, subAxisY() + 1.5, 0);
function defaultView() {
  const d = 1 + Math.max(0, 1 - camera.aspect) * 1.05;
  target.set(3, subAxisY() + 1.5 - 5.5 * smooth(S.explode), 0);
  controls.target.copy(target);
  camera.position.set(target.x + 53 * d, target.y + 4 * d, target.z + 101 * d);
  controls.update();
}
let idleSince = 0;
controls.addEventListener("start", () => { idleSince = Infinity; controls.autoRotate = false; if (S.cine) setCine(false); kioskPause(); });
controls.addEventListener("end", () => { idleSince = elapsed(); });

// ─── ping logic ──────────────────────────────────────────────────────────
const tmpV = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Color();
function closestOnSub(o: THREE.Vector3, out: THREE.Vector3) {
  sub.updateMatrixWorld();
  tmpA.set(-40, 0, 0).applyMatrix4(sub.matrixWorld);
  tmpB.set(42, 0, 0).applyMatrix4(sub.matrixWorld);
  const ab = tmpV.subVectors(tmpB, tmpA), t = clamp(new THREE.Vector3().subVectors(o, tmpA).dot(ab) / ab.lengthSq(), 0, 1);
  return out.copy(tmpA).addScaledVector(ab, t);
}
// how much of the boat's height (keel to periscope standards) sits below the layer
function echoStrength() {
  const lo = subAxisY() - 2.65, hi = subAxisY() + 7.1;
  const below = clamp((LAYER_Y - lo) / (hi - lo), 0, 1);
  return lerp(1, 0.13, smooth(below));
}
function firePing(T: number) {
  escort.updateMatrixWorld();
  const o = escortSonar.clone().applyMatrix4(escort.matrixWorld);
  const hit = closestOnSub(o, new THREE.Vector3());
  const toO = new THREE.Vector3().subVectors(o, hit).normalize();
  hit.addScaledVector(toO, 2.7);
  const R = o.distanceTo(hit), s = echoStrength();
  const below = (p: { y: number }) => (p.y < LAYER_Y ? 0.22 : 1);
  const contacts: Contact[] = [
    { kind: "boat", R, s, w: 5 },
    { kind: "seabed", R: o.y - seabedH(o.x, o.z), s: 0.55 * below({ y: -200 }), w: 0, tail: true },
    { kind: "wreck", R: o.distanceTo(WRECK) - 12, s: 0.6 * below(WRECK), w: 9 },
    ...MINES.map((m): Contact => ({ kind: "mine", R: o.distanceTo(m) - 1, s: 0.32, w: 2.4 })),
  ];
  S.lastPing = { t0: T, o, contacts, seed: random() * 100, boatDone: false, returned: false, echoAt: hit };
  waves.push({ o, t0: T, color: C_PING, s0: 1.0, maxR: 470 });
  const b = $("bPing");
  b.classList.remove("fired"); void b.offsetWidth; b.classList.add("fired");
  sound.ping();
}
function updatePing(T: number) {
  const p = S.lastPing;
  if (!p) return;
  const r = V_SHOWN * (T - p.t0);
  const boat = p.contacts[0];
  // Events are stamped with the moment they happened (t0 + R/V), not the frame that
  // noticed them: the original used the frame's time, which is the same thing at 60 fps
  // but leaves a pinned (frozen) clock with an echo shell of radius zero.
  if (!p.boatDone && r >= boat.R) {
    p.boatDone = true;
    const tHit = p.t0 + boat.R / V_SHOWN;
    S.hit = { t: tHit, s: boat.s };
    waves.push({ o: p.echoAt.clone(), t0: tHit, color: C_ECHO, s0: 0.2 + boat.s * 0.6, maxR: boat.R + 20, echo: true });
  }
  if (!p.returned && r >= boat.R * 2) {
    p.returned = true;
    S.echo = { s: boat.s, R: boat.R };
    sound.echo(boat.s);
    showEcho();
  }
}
function updateWaves(T: number) {
  for (let i = waves.length - 1; i >= 0; i--) if (V_SHOWN * (T - waves[i].t0) > waves[i].maxR) waves.splice(i, 1);
  const act = waves.slice(-4);
  for (let k = 0; k < 4; k++) {
    const w = act[k], sh = SHELLS[k];
    if (!w) { SH.uWaveC.value[k].set(0, 0, 0, 0); sh.visible = false; continue; }
    const r = V_SHOWN * (T - w.t0);
    const fade = (1 - smooth(clamp((r - w.maxR * 0.72) / (w.maxR * 0.28), 0, 1))) * (w.echo ? Math.exp(-r / 160) : 0.55 + 0.45 * Math.exp(-r / 260));
    const s = w.s0 * fade * smooth(clamp(r / 6, 0, 1));
    SH.uWave.value[k].set(w.o.x, w.o.y, w.o.z, r);
    SH.uWaveC.value[k].set(w.color.r, w.color.g, w.color.b, s);
    sh.visible = s > 0.002;
    sh.position.copy(w.o); sh.scale.setScalar(Math.max(0.01, r));
    const u = (sh.material as THREE.ShaderMaterial).uniforms;
    u.uColor.value.copy(w.color);
    u.uStrength.value = s * (w.echo ? 0.26 : 0.75);
    u.uOrigin.value.copy(w.o);
  }
}

const sound = makeSound(() => S.sound);

// ─── labels ──────────────────────────────────────────────────────────────
interface Label { el: HTMLElement; anchor: () => THREE.Vector3; vis: () => boolean; shown: boolean; w?: number }
const LBL: Label[] = [];
function label(text: string, cls: string, anchor: () => THREE.Vector3, vis: () => boolean) {
  const el = document.createElement("div"); el.className = "lbl " + cls; el.textContent = text;
  $("labels").appendChild(el); LBL.push({ el, anchor, vis, shown: false });
}
const worldOf = (obj: THREE.Object3D, x: number, y: number, z: number) => () => tmpV.set(x, y, z).applyMatrix4(obj.matrixWorld).clone();
const narrow = () => innerWidth < 620;
label("Escort", "quiet", () => escortSonar.clone().setY(-9).applyMatrix4(escort.matrixWorld), () => S.explode < 0.3);
label("Wreck", "quiet", () => WRECK.clone().setY(WRECK.y + 16), () => S.explode < 0.3);
label("The layer", "", () => new THREE.Vector3(target.x - 38, LAYER_Y, target.z + 28), () => S.explode < 0.3 && Math.abs(target.y - LAYER_Y) < 150);
COMPS.forEach((c, i) => label(c.name, "warm", () => worldOf(P.comps[i], (c.x0 + c.x1) / 2, rPH((c.x0 + c.x1) / 2) + 0.6, 0)(), () => S.explode > 0.7 && (!narrow() || i % 2 === 0)));
label("Casing & deck", "", worldOf(P.upper, -20, 3.5, 0), () => S.explode > 0.7);
label("Bridge & 4-inch gun", "", worldOf(P.tower, 4, 8.5, 0), () => S.explode > 0.7);
label("Saddle tank", "", worldOf(P.tankS, -4, 1.3, 1.1), () => S.explode > 0.7 && !narrow());
label("Keel & bulbous bow", "", worldOf(P.lower, 6, -2.9, 0), () => S.explode > 0.7 && !narrow());
const projV = new THREE.Vector3();
let avoidRects: DOMRect[] = [];
function measureAvoid() {
  avoidRects = S.bare ? [] : [".head", ".tools", "#console"].map((q) => document.querySelector(q)?.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
}
const inAvoid = (x: number, y: number) => avoidRects.some((r) => x > r.left - 12 && x < r.right + 12 && y > r.top - 6 && y < r.bottom + 28);
function updateLabels() {
  const W = innerWidth, Hh = innerHeight, hidden = S.cine || S.bare;
  for (const L of LBL) {
    let show = !hidden && L.vis();
    if (show) {
      projV.copy(L.anchor()).project(camera);
      show = projV.z < 1 && Math.abs(projV.x) < 1.05 && Math.abs(projV.y) < 1.05;
      if (show) {
        if (!L.w) L.w = L.el.offsetWidth || 120;
        const x = clamp((projV.x * 0.5 + 0.5) * W, L.w / 2 + 10, W - L.w / 2 - 10), y = (-projV.y * 0.5 + 0.5) * Hh;
        if (inAvoid(x, y)) show = false;
        else L.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
      }
    }
    if (show !== L.shown) { L.el.style.opacity = show ? "1" : "0"; L.shown = show; }
  }
}

// ─── UI wiring ───────────────────────────────────────────────────────────
const depthEl = $<HTMLInputElement>("depth");
document.documentElement.style.setProperty("--lay", `${((LAYER_FT - FT_MIN) / (FT_MAX - FT_MIN)) * 100}%`);
document.documentElement.style.setProperty("--test", `${((TEST_FT - FT_MIN) / (FT_MAX - FT_MIN)) * 100}%`);
function setDepth(ft: number) {
  S.depthFt = clamp(Math.round(ft / 5) * 5, FT_MIN, FT_MAX);
  S.depthTarget = S.depthFt * FT;
  depthEl.value = String(S.depthFt);
  $("depthOut").textContent = `${S.depthFt} ft · ${Math.round(S.depthTarget)} m`;
  document.querySelectorAll<HTMLButtonElement>(".depth .seg button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.d! === S.depthFt)));
}
depthEl.addEventListener("input", () => setDepth(+depthEl.value));
document.querySelectorAll<HTMLButtonElement>(".depth .seg button").forEach((b) => b.addEventListener("click", () => setDepth(+b.dataset.d!)));
$("bPing").addEventListener("click", () => { firePing(elapsed()); S.nextPing = elapsed() + PING_EVERY; });
function setAuto(on: boolean) { S.auto = on; $("bAuto").setAttribute("aria-pressed", String(on)); S.nextPing = elapsed() + 1.5; }
$("bAuto").addEventListener("click", () => setAuto(!S.auto));
function setExplode(on: boolean) { S.explodeTarget = on ? 1 : 0; $("bAsm").setAttribute("aria-pressed", String(!on)); $("bExp").setAttribute("aria-pressed", String(on)); }
$("bAsm").addEventListener("click", () => setExplode(false));
$("bExp").addEventListener("click", () => setExplode(true));
$("bSound").addEventListener("click", () => { sound.init(); S.sound = !S.sound; $("bSound").setAttribute("aria-pressed", String(S.sound)); });
function setBare(on: boolean) { S.bare = on; document.body.classList.toggle("bare", on); $("bHide").setAttribute("aria-pressed", String(on)); $("bHide").textContent = on ? "Show" : "Hide"; resize(); }
$("bHide").addEventListener("click", () => setBare(!S.bare));
const info = $("info");
const openInfo = (on: boolean) => { info.hidden = !on; if (on) $("bClose").focus(); };
$("bInfo").addEventListener("click", () => openInfo(true));
$("bClose").addEventListener("click", () => openInfo(false));
info.addEventListener("click", (e) => { if (e.target === info) openInfo(false); });
$("bCine").addEventListener("click", () => setCine(!S.cine));

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!info.hidden) { if (e.key === "Escape") openInfo(false); return; }
  const tag = (e.target as HTMLElement | null)?.tagName ?? "";
  const k = e.key;
  kioskPause();
  if (k === " " && (tag === "BUTTON" || tag === "INPUT" || tag === "A")) return;
  if (k === " ") { e.preventDefault(); $("bPing").click(); }
  else if (k === "1") setDepth(40);
  else if (k === "2") setDepth(110);
  else if (k === "3") setDepth(280);
  else if (k === "[") setDepth(S.depthFt - 10);
  else if (k === "]") setDepth(S.depthFt + 10);
  else if (k === "x" || k === "X") setExplode(S.explodeTarget < 0.5);
  else if (k === "c" || k === "C") setCine(!S.cine);
  else if (k === "r" || k === "R") { setCine(false); defaultView(); }
  else if (k === "/") { e.preventDefault(); setBare(!S.bare); }
  else if (k === "Escape" && S.cine) setCine(false);
});

function showEcho() {
  const e = S.echo;
  if (!e) return;
  const dd = $("rEchoDD");
  const word = e.s > 0.6 ? "Strong" : e.s > 0.3 ? "Weak" : "Faint";
  $("rEcho").textContent = word;
  $("rRange").textContent = `${Math.round(e.R)} m`;
  dd.className = e.s > 0.6 ? "strong" : e.s < 0.3 ? "faint" : "";
  const st = $("status");
  st.className = "status " + (e.s > 0.6 ? "fix" : e.s < 0.3 ? "hid" : "");
  // the real round trip at the real speed of sound, not the slowed one on screen
  $("statusText").textContent = e.s > 0.6 ? `Escort has a fix · echo in ${(2 * e.R / V_REAL).toFixed(2)} s` : e.s < 0.3 ? "Hidden below the layer" : "Straddling the layer";
}

const scope = makeScope($<HTMLCanvasElement>("scope"));

// ─── cinematic cameras ───────────────────────────────────────────────────
interface Shot { a: number[]; b: number[]; look?: number[]; track?: boolean; fov: number; dur: number }
const SHOTS: Shot[] = [
  { a: [-10, -28, 36], b: [-32, -25, 30], look: [8, 3, 0], fov: 34, dur: 10 },
  { a: [66, 2, 20], b: [56, 5, 28], look: [36, 1.5, 0], fov: 32, dur: 9 },
  { a: [-122, 12, -54], b: [-104, 18, -15], look: [2, 3, 0], fov: 34, dur: 10 },
  { a: [32, 40, 90], b: [-26, 44, 76], look: [0, -6, 0], fov: 40, dur: 10 },
  { a: [18, 10, 17], b: [2, 12, 18], look: [6, 6.5, 0], fov: 38, dur: 8 },
  { a: [-8, -16, 30], b: [8, -14, 34], track: true, fov: 42, dur: 9 },
];
const cine = { i: 0, t: 0, from: new THREE.Vector3(), fromLook: new THREE.Vector3(), fromFov: 36, blend: 1 };
function setCine(on: boolean) {
  S.cine = on; $("bCine").setAttribute("aria-pressed", String(on));
  controls.enabled = !on;
  if (on) { cine.i = 0; cine.t = 0; cine.from.copy(camera.position); cine.fromLook.copy(controls.target); cine.fromFov = camera.fov; cine.blend = 0; }
  else { controls.target.copy(target); camera.fov = baseFov; camera.updateProjectionMatrix(); }
}
const lookV = new THREE.Vector3(), camV = new THREE.Vector3();
function updateCine(dt: number) {
  const sh = SHOTS[cine.i], sp = sub.position;
  cine.t += dt;
  const u = smooth(clamp(cine.t / sh.dur, 0, 1));
  camV.set(lerp(sh.a[0], sh.b[0], u), lerp(sh.a[1], sh.b[1], u), lerp(sh.a[2], sh.b[2], u)).add(sp);
  if (sh.track || !sh.look) lookV.copy(escort.position).setY(-4); else lookV.set(sh.look[0], sh.look[1], sh.look[2]).add(sp);
  let fov = sh.fov * (camera.aspect < 1 ? 1.45 : 1);
  if (cine.blend < 1) {
    cine.blend = Math.min(1, cine.blend + dt / 2.2);
    const b = smooth(cine.blend);
    camV.lerpVectors(cine.from, camV, b); lookV.lerpVectors(cine.fromLook, lookV, b); fov = lerp(cine.fromFov, fov, b);
  }
  camV.y = Math.min(camV.y, -2.5);
  camera.position.copy(camV); camera.lookAt(lookV); camera.fov = fov; camera.updateProjectionMatrix();
  if (cine.t > sh.dur) { cine.from.copy(camera.position); cine.fromLook.copy(lookV); cine.fromFov = fov; cine.blend = 0; cine.t = 0; cine.i = (cine.i + 1) % SHOTS.length; }
  controls.target.copy(lookV);
}

// ─── layout ──────────────────────────────────────────────────────────────
let baseFov = 36;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h);
  finish.uniforms.uRes.value.set(w * PR, h * PR);
  camera.aspect = w / h;
  baseFov = camera.aspect < 1 ? lerp(36, 58, clamp((1 - camera.aspect) / 0.55, 0, 1)) : 36;
  if (!S.cine) camera.fov = baseFov;
  // the phone layout's title column stops short of the tool buttons, however wide they come out
  document.documentElement.style.setProperty("--toolsW", `${Math.ceil(document.querySelector(".tools")!.getBoundingClientRect().width)}px`);
  const con = $("console").getBoundingClientRect();
  document.documentElement.style.setProperty("--consoleH", `${Math.round(con.height)}px`);
  const head = document.querySelector(".head")!.getBoundingClientRect();
  const freeTop = w < 620 ? head.bottom : 0, freeBottom = S.bare ? h : con.top;
  const shift = h / 2 - (freeTop + freeBottom) / 2;
  camera.setViewOffset(w, h, 0, Math.round(shift), w, h);
  camera.updateProjectionMatrix();
  scope.size();
  measureAvoid();
}
addEventListener("resize", resize);

// ─── kiosk: an attract loop that works through the piece on its own ─────
const KIOSK_STEPS: { depth: number; open: boolean; hold: number }[] = [
  { depth: 40, open: false, hold: 22 },
  { depth: 110, open: false, hold: 22 },
  { depth: 280, open: false, hold: 26 },
  { depth: 280, open: true, hold: 20 },
  { depth: 110, open: true, hold: 16 },
  { depth: 40, open: false, hold: 18 },
];
const kiosk = { i: -1, next: 0, pausedUntil: 0 };
function kioskPause() { if (KIOSK) kiosk.pausedUntil = elapsed() + 60; }
if (KIOSK) addEventListener("pointerdown", kioskPause);
function updateKiosk(T: number) {
  if (!KIOSK || T < kiosk.pausedUntil || T < kiosk.next) return;
  kiosk.i = (kiosk.i + 1) % KIOSK_STEPS.length;
  const st = KIOSK_STEPS[kiosk.i];
  setDepth(st.depth); setExplode(st.open);
  if (!S.auto) setAuto(true);
  if (!reduceMotion && !S.cine && !st.open) setCine(true);
  if (st.open && S.cine) setCine(false); // the cutaway's labels need the orbit view
  kiosk.next = T + st.hold;
}

// ─── probe ───────────────────────────────────────────────────────────────
interface Probe { frames: number; firstFrameMs: number | null; calls: number; triangles: number; geometries: number; textures: number; programs: number; depthFt: number; explode: number; echo: { s: number; R: number; word: string; status: string } | null; pinned: boolean }
const probe: Probe | null = PROBE ? ((window as unknown as { __subProbe: Probe }).__subProbe = { frames: 0, firstFrameMs: null, calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, depthFt: 0, explode: 0, echo: null, pinned: !!PIN }) : null;

// ─── the loop ────────────────────────────────────────────────────────────
let prevT = 0, uiT = -1;
const leadPos = P.leaders.geometry.attributes.position as THREE.BufferAttribute;
// Guarded: if a frame throws (the GPU process dying, a lost context the driver will
// not restore), stop the loop and show the still version rather than a frozen sea.
let dead = false;
function frame() {
  if (dead) return;
  try {
    step();
  } catch (e) {
    dead = true;
    console.warn("Below the layer: the render loop stopped; showing the still version.", e);
    showFallback("crashed");
    return;
  }
  requestAnimationFrame(frame);
}
function step() {
  const T = elapsed(), dt = Math.min(0.05, Math.max(0, T - prevT)); prevT = T;
  SH.uTime.value = T; finish.uniforms.uTime.value = T;
  updateKiosk(T);

  // boat: depth, trim, screws, periscopes
  const maxV = 7;
  const dErr = S.depthTarget - S.depth;
  const want = clamp(dErr * 0.6, -maxV, maxV);
  S.vy = lerp(S.vy, want, 1 - Math.exp(-dt * 1.4));
  S.depth += S.vy * dt;
  const y0 = subAxisY();
  const bob = reduceMotion ? 0 : Math.sin(T * 0.35) * 0.18;
  sub.position.set(0, y0 + bob, 0);
  sub.rotation.z = clamp(-S.vy * 0.018, -0.13, 0.13) + (reduceMotion ? 0 : Math.sin(T * 0.23) * 0.004);
  sub.rotation.x = reduceMotion ? 0 : Math.sin(T * 0.31) * 0.012;
  for (const pr of P.props) pr.g.rotation.x += dt * (1.6 + Math.abs(S.vy) * 0.8) * pr.dir;
  const raise = S.depth < 16 ? 1 : 0;
  const sa = P.scopeA.userData as { r?: number };
  sa.r = PIN ? raise : lerp(sa.r ?? raise, raise, 1 - Math.exp(-dt * 1.2));
  P.scopeA.position.y = lerp(5.25, 7.4, sa.r);
  P.scopeB.position.y = lerp(5.5, 7.1, sa.r);

  // exploded view
  S.explode = lerp(S.explode, S.explodeTarget, 1 - Math.exp(-dt * 2.4));
  if (Math.abs(S.explode - S.explodeTarget) < 1e-4) S.explode = S.explodeTarget;
  const E = smooth(S.explode);
  P.upper.position.set(0, 0, 0);
  P.tower.position.set(0, 3.5 * E, 0);
  P.lower.position.set(0, -13 * E, 0);
  P.tankS.position.set(0, -10.5 * E, 5.5 * E);
  P.tankP.position.set(0, -10.5 * E, -5.5 * E);
  P.stern.position.set(-7 * E, -6.5 * E, 0);
  P.wires.visible = E < 0.01;
  P.inner.visible = E > 0.01;
  P.inner.position.y = -6.5 * E;
  P.comps.forEach((g, i) => { g.position.x = (2.5 - i) * 4.2 * E; });
  if (S.hit) {
    const a = T - S.hit.t, k = S.hit.s;
    SH.uHit.value.copy(C_PING).multiplyScalar(0.13 * k * Math.exp(-a * 3.2))
      .add(tmpC.copy(C_ECHO).multiplyScalar(0.09 * k * Math.exp(-a * 1.1) * (1 - Math.exp(-a * 5))));
    if (a > 6) { S.hit = null; SH.uHit.value.setRGB(0, 0, 0); }
  }
  SH.uInterior.value = 0.55 * E;
  {
    const segs: [number, number, number][][] = [
      [[-20, -2.4 - 13 * E, 0], [-20, 0.1, 0]],
      [[20, -2.3 - 13 * E, 0], [20, 0.2, 0]],
      [[4, 3.15, 0], [4, 2.7 + 3.5 * E, 0]],
      [[2, -0.5, 2.5], [2, -0.55 - 10.5 * E, 2.7 + 5.5 * E]],
      [[2, -0.5, -2.5], [2, -0.55 - 10.5 * E, -2.7 - 5.5 * E]],
      [[-35, -1.0, 0], [-35 - 7 * E, -1.0 - 6.5 * E, 0]],
    ];
    segs.forEach(([a, b], i) => { leadPos.setXYZ(i * 2, ...a); leadPos.setXYZ(i * 2 + 1, ...b); });
    leadPos.needsUpdate = true;
    P.leaders.computeLineDistances();
    P.leaders.material.opacity = 0.55 * E;
    P.leaders.visible = E > 0.01;
  }

  // escort circling on the surface
  const ea = (T / ESCORT_PERIOD) * TAU + 0.9;
  escort.position.set(Math.cos(ea) * ESCORT_R, 0, Math.sin(ea) * ESCORT_R);
  escort.rotation.y = Math.atan2(-Math.cos(ea), -Math.sin(ea));
  escort.updateMatrixWorld();
  surfaceU.uEscA.value = ea;

  // pings
  if (S.auto && T >= S.nextPing) { firePing(T); S.nextPing = T + PING_EVERY; }
  if (PIN && PIN.ping != null && !S.lastPing) {
    // a pinned ping: fired far enough back that it is PIN.ping of the way through its round trip
    sub.updateMatrixWorld();
    firePing(T);
    const p = S.lastPing as Ping | null;
    if (p) { p.t0 = T - PIN.ping * (2 * p.contacts[0].R) / V_SHOWN; waves[waves.length - 1].t0 = p.t0; }
  }
  updatePing(T);
  updateWaves(T);

  // camera follows the boat
  const newTarget = tmpV.set(3, sub.position.y + 1.5 - 5.5 * E, 0);
  const delta = new THREE.Vector3().subVectors(newTarget, target);
  target.copy(newTarget);
  if (S.cine) updateCine(dt);
  else {
    camera.position.add(delta); controls.target.add(delta);
    if (!reduceMotion && !PIN && T - idleSince > 10) { controls.autoRotate = true; controls.autoRotateSpeed = 0.28; }
    controls.update();
    if (camera.position.y > -2.5) camera.position.y = -2.5;
  }
  sun.position.set(sub.position.x + 30, sub.position.y + 90, sub.position.z + 25);
  sun.target.position.copy(sub.position);
  rays.children.forEach((r) => { r.position.set(target.x + r.userData.ox + Math.sin(T * 0.05 + r.userData.ph) * 6, 0, target.z + r.userData.oz); });
  snowU.uCenter.value.copy(target);
  layerU.uCenter.value.copy(target);

  if (probe) renderer.info.reset();
  composer.render();
  if (probe) {
    const i = renderer.info;
    probe.frames++;
    if (probe.firstFrameMs == null) probe.firstFrameMs = performance.now();
    Object.assign(probe, { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0, depthFt: S.depth / FT, explode: S.explode });
    probe.echo = S.echo ? { s: S.echo.s, R: S.echo.R, word: $("rEcho").textContent ?? "", status: $("statusText").textContent ?? "" } : null;
  }
  updateLabels();
  scope.draw(T, S.lastPing);
  if (T - uiT > 0.1 || PIN) {
    uiT = T;
    const d = Math.max(0, S.depth), ft = d / FT;
    $("rDepth").textContent = String(Math.round(ft));
    $("rDepthDD").className = ft > TEST_FT + 1 ? "warn" : "";
    $("rPress").textContent = String(Math.round(d * PSI_PER_M));
  }
}

// ─── start ───────────────────────────────────────────────────────────────
if (KIOSK) $("keys").hidden = true;
if (PIN) {
  // snap straight to the pinned state: no descent, no easing
  setDepth(PIN.depthFt);
  S.depth = S.depthTarget; S.vy = 0;
  setExplode(PIN.open); S.explode = S.explodeTarget;
  setAuto(false);
  if (Q.get("bare") === "1") setBare(true);
} else {
  setDepth(40);
  if (reduceMotion) setAuto(false);
}
resize();
defaultView();
if (PIN && PIN.shot != null) {
  // frame the picture from one cinematic shot, at the middle of its move
  const sh = SHOTS[PIN.shot], sp = new THREE.Vector3(0, subAxisY(), 0);
  camera.position.set(lerp(sh.a[0], sh.b[0], 0.5), lerp(sh.a[1], sh.b[1], 0.5), lerp(sh.a[2], sh.b[2], 0.5)).add(sp);
  camera.position.y = Math.min(camera.position.y, -2.5);
  controls.target.copy(sh.look ? new THREE.Vector3(sh.look[0], sh.look[1], sh.look[2]).add(sp) : new THREE.Vector3(escort.position.x, -4, escort.position.z));
  camera.fov = sh.fov * (camera.aspect < 1 ? 1.45 : 1); camera.updateProjectionMatrix();
  controls.update();
}
idleSince = 0;
(async () => {
  try { await renderer.compileAsync(scene, camera); } catch { /* compile on first frame instead */ }
  requestAnimationFrame(() => {
    frame();
    setTimeout(() => { $("loader").classList.add("gone"); document.body.dataset.ready = "1"; }, 250);
  });
})();
