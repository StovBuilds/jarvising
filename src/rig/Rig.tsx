// jarvising.com/projects/rig/live — INSIDE THE RIG (entry 003, first built as a
// jstov.uk lab page on 7–8 September 2026). A scroll-led journey from inside the
// CPU to a complete flagship-class gaming PC, ending in an exploded, searchable
// atlas. Raw three.js: one renderer, one part tree, one explode engine shared
// by the story and the atlas. Copy lives in content.ts, geometry in parts/*,
// camera + flows in path.ts, story|brand skin in identity.ts. No brands, on
// purpose (tools/brand-scrub.mjs keeps it that way).
//
// QA params: ?p=0.42 pins scroll, ?atlas=1 opens the atlas, ?explode=0.72 pins
// the slider, ?mode=brand, ?tier=LOW, ?fx=0, ?flat=1 (no backdrop blur, for
// headless captures), ?dark=1, ?dive=<id>, ?lib=0 (procedural parts only),
// ?probe=1 (renderer.info for tools/measure-rig.mjs).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { getDeviceTier } from "./helpers";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";

import { CHAPTERS, CREDITS, PARTS } from "./content";
import { PART_IDS, type PartId } from "./ids";
import { SYSTEMS, type PartContent, type SystemId } from "./types";
import { resolveIdentity } from "./identity";
import { buildMachine, buildMachineAsync, lastSwapped, type Machine } from "./machine";
import { loadPartsLibrary, type PartsLibrary } from "./library";
import { CpuWorld, GpuWorld } from "./micro";
import { Field, FlowSystem } from "./flows";
import { EXPLODE_STOPS } from "./explode";
import { socketOf, socketsOn } from "./sockets";
import {
  ATLAS_HOME, FIELDS, FLOWS, accentLevel, chapterAt, cpuPathway, dipAmount, fanSpeed, fieldLevels, flowLevels,
  labAmount, samplePath, smooth, storyExplode, storyFades, storyHidden, storyOffsets,
} from "./path";
import { RigAmbience } from "./ambience";

const SCROLL_VH = 1400;
type Tier = "LOW" | "MEDIUM" | "HIGH" | "ULTRA";
const TIERS: Tier[] = ["LOW", "MEDIUM", "HIGH", "ULTRA"];
const ATLAS_AT = 0.985;
const PROBE = new URLSearchParams(window.location.search).get("probe") === "1";

const P = PARTS as Record<string, PartContent>;
const LEVEL_A = PART_IDS.filter((id) => P[id].level === "A");
const SYSTEM_COUNT: Record<SystemId, number> = SYSTEMS.reduce((acc, s) => {
  acc[s.id] = PART_IDS.filter((id) => P[id].system === s.id).length;
  return acc;
}, {} as Record<SystemId, number>);
const systemLabel = (s: SystemId) => SYSTEMS.find((x) => x.id === s)?.label ?? s;

const VIEWS: Record<string, [number, number, number]> = {
  quarter: [ATLAS_HOME.pos.x, ATLAS_HOME.pos.y, ATLAS_HOME.pos.z],
  front: [0.05, 0.42, 1.75],
  side: [1.75, 0.42, 0.02],
  back: [0.05, 0.42, -1.75],
  top: [0.02, 1.9, 0.3],
};

interface Ui {
  atlas: boolean;
  hover: string | null;
  selected: string | null;
  isolate: string | null;
  /** deep dive: the slider explodes only this product; the rest of the PC ghosts */
  dive: string | null;
  dark: boolean;
  explode: number;
  hiddenSystems: Set<SystemId>;
  autoRotate: boolean;
}

const Rig = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const dipRef = useRef<HTMLDivElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const identity = useMemo(() => resolveIdentity(window.location.search), []);
  const mode = identity.mode;

  const [phase, setPhase] = useState<"loading" | "ready" | "unsupported">("loading");
  const [chapterIdx, setChapterIdx] = useState(0);
  const [lab, setLab] = useState(false);
  const [atlas, setAtlas] = useState(false);
  const [autofly, setAutofly] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [isolate, setIsolate] = useState<string | null>(null);
  const [explode, setExplode] = useState(0.5);
  const [hiddenSystems, setHiddenSystems] = useState<Set<SystemId>>(new Set());
  const [query, setQuery] = useState("");
  const [autoRotate, setAutoRotate] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(!window.matchMedia("(pointer: coarse)").matches);
  const detailHeadRef = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);
  const [flat, setFlat] = useState(false);
  const [dive, setDive] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [sound, setSound] = useState(false);
  const ambienceRef = useRef(new RigAmbience());

  const ui = useRef<Ui>({ atlas: false, hover: null, selected: null, isolate: null, dive: null, dark: false, explode: 0.5, hiddenSystems: new Set(), autoRotate: false });
  ui.current = { atlas, hover, selected, isolate, dive, dark, explode, hiddenSystems, autoRotate };
  const autoflyRef = useRef(false);
  autoflyRef.current = autofly;
  const creditsOpenRef = useRef(false);
  creditsOpenRef.current = creditsOpen;

  // imperative hooks the engine exposes to the UI
  const api = useRef<{
    frame: (id: string | null) => void;
    view: (name: keyof typeof VIEWS) => void;
    toStory: () => void;
    toAtlas: () => void;
    childrenOf: (id: string) => string[];
    parentOf: (id: string) => string | undefined;
  } | null>(null);

  useEffect(() => {
    const prev = document.title;
    document.title = "INSIDE THE RIG — a teardown in scroll · jarvising";
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    let dead = false;
    let raf = 0;
    const ambience = ambienceRef.current;
    let renderer: THREE.WebGLRenderer | null = null;
    let composer: EffectComposer | null = null;
    let bloom: UnrealBloomPass | null = null;
    let controls: OrbitControls | null = null;
    let machine: Machine | null = null;
    let library: PartsLibrary | null = null;
    let cpuWorld: CpuWorld | null = null;
    let gpuWorld: GpuWorld | null = null;
    let flows: FlowSystem | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    const fields: Record<string, Field> = {};
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.003, 400);
    const pos = new THREE.Vector3();
    const target = new THREE.Vector3();
    const bg = new THREE.Color();
    const DARK = new THREE.Color(0x050608);
    const LAB = new THREE.Color(0xefefec);
    const LAB_DARK = new THREE.Color(0x0f1115);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDirty = false;
    let pointerDown: { x: number; y: number } | null = null;
    let progress = 0;
    let lastChapter = -1;
    let lastLab = false;
    let lastAtlas = false;
    let lastSeg: unknown = null;
    let camAnim: { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number } | null = null;
    const clock = new THREE.Clock();

    const params = new URLSearchParams(window.location.search);
    const forced = parseFloat(params.get("p") ?? "");
    const pinned = !Number.isNaN(forced);
    const openAtlas = params.get("atlas") === "1";
    const forcedExplode = parseFloat(params.get("explode") ?? "");
    const tierParam = (params.get("tier") ?? "").toUpperCase() as Tier;
    const tier: Tier = TIERS.includes(tierParam) ? tierParam : getDeviceTier();
    const fx = params.get("fx") !== "0";
    // ?flat=1 drops the panels' backdrop blur — headless SwiftShader captures come out black with it
    if (params.get("flat") === "1") setFlat(true);
    if (params.get("dark") === "1") setDark(true);
    // ?dive=gpu opens the atlas inside one product (QA + shareable deep links)
    const diveParam = params.get("dive");
    if (diveParam && P[diveParam]) { setDive(diveParam); setSelected(diveParam); setExplode((e) => Math.max(e, 0.5)); }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const shadows = fx && tier !== "LOW";
    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
    // ?atlas=1 holds progress at 1 (the atlas) until the user asks for the story
    let forceAtlas = openAtlas;
    const targetProgress = () => {
      if (pinned) return Math.min(1, Math.max(0, forced));
      if (forceAtlas) return 1;
      const max = maxScroll();
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    if (!Number.isNaN(forcedExplode)) setExplode(Math.min(1, Math.max(0, forcedExplode)));

    (async () => {
      try { await document.fonts.ready; } catch { /* system fonts */ }
      if (dead || !stageRef.current) return;
      let gl: WebGLRenderingContext | null = null;
      try { gl = document.createElement("canvas").getContext("webgl"); } catch { /* none */ }
      if (!gl) { setPhase("unsupported"); return; }

      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      if (PROBE) renderer.info.autoReset = false;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === "LOW" ? 1.25 : 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
      stageRef.current.appendChild(renderer.domElement);

      // environment + lights
      pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.6;
      scene.background = bg.copy(DARK);
      const key = new THREE.DirectionalLight(0xffffff, 1.7);
      key.position.set(1.5, 2.2, 1.2);
      key.target.position.set(0, 0.3, 0);
      if (shadows) {
        key.castShadow = true;
        key.shadow.mapSize.set(tier === "MEDIUM" ? 1024 : 2048, tier === "MEDIUM" ? 1024 : 2048);
        key.shadow.camera.left = key.shadow.camera.bottom = -1.1;
        key.shadow.camera.right = key.shadow.camera.top = 1.1;
        key.shadow.camera.near = 0.5; key.shadow.camera.far = 6;
        key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01;
      }
      scene.add(key, key.target);
      scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x30343a, 0.7));
      // interior fill: candela-scale point lights sit centimetres from every surface, so keep them tiny
      const inA = new THREE.PointLight(0xfff1e0, 0.02, 0.7, 2); inA.position.set(0.08, 0.5, -0.02); scene.add(inA);
      const inB = new THREE.PointLight(0xdfe8ff, 0.012, 0.6, 2); inB.position.set(0.06, 0.2, 0.14); scene.add(inB);

      // the machine + the abstract worlds + the flows. Opening on a machine chapter
      // needs the build up front; opening at the top lets it assemble product by
      // product behind the silicon beats (one per frame) — no second loading screen.
      // the Blender hero parts: fetched alongside, never waited on for long —
      // a slow or missing library just means the procedural parts stand (?lib=0 forces that)
      const wantLibrary = params.get("lib") !== "0";
      const libraryReady = wantLibrary ? loadPartsLibrary() : Promise.resolve(null);
      const needNow = pinned || openAtlas || targetProgress() > 0.12;
      if (needNow) library = await Promise.race([libraryReady, new Promise<null>((r) => setTimeout(() => r(null), 3500))]);
      if (dead) return;
      const buildOpts = { isProduct: (id: string) => P[id]?.level === "A", library };
      const tBuild = performance.now();
      let buildMs = 0;
      if (needNow) {
        machine = buildMachine(identity.accent, buildOpts);
        buildMs = performance.now() - tBuild;
        scene.add(machine.root);
      }
      cpuWorld = new CpuWorld(reduced);
      gpuWorld = new GpuWorld(reduced);
      scene.add(cpuWorld.group, gpuWorld.group);
      flows = new FlowSystem(tier === "LOW" ? 0.5 : tier === "MEDIUM" ? 0.75 : 1);
      for (const f of FLOWS) flows.add(f);
      scene.add(flows.group);
      for (const [id, f] of Object.entries(FIELDS)) {
        const field = new Field(f.color, f.scale);
        field.sprite.position.set(...f.at);
        scene.add(field.sprite);
        fields[id] = field;
      }
      // the lab floor: a soft-edged disc that fades in with the lab
      const fc = document.createElement("canvas"); fc.width = fc.height = 256;
      const fctx = fc.getContext("2d")!;
      const g = fctx.createRadialGradient(128, 128, 40, 128, 128, 128);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.7, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
      fctx.fillStyle = g; fctx.fillRect(0, 0, 256, 256);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.95, metalness: 0, transparent: true, opacity: 0, alphaMap: new THREE.CanvasTexture(fc) });
      const floor = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), floorMat);
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; floor.receiveShadow = true;
      scene.add(floor);

      // post
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.22, 0.4, 0.92);
      bloom.enabled = fx && tier !== "LOW";
      composer.addPass(bloom);
      composer.addPass(new OutputPass());

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enabled = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 0.08;
      controls.maxDistance = 4;
      controls.maxPolarAngle = Math.PI * 0.62;
      controls.target.copy(ATLAS_HOME.target);
      controls.autoRotateSpeed = 0.8;

      const resize = () => {
        if (!renderer) return;
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer?.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      // pointer → picking
      const el = renderer.domElement;
      const onMove = (e: PointerEvent) => {
        pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        pointerDirty = true;
        if (tipRef.current) { tipRef.current.style.left = `${e.clientX + 14}px`; tipRef.current.style.top = `${e.clientY + 14}px`; }
      };
      const onDown = (e: PointerEvent) => { pointerDown = { x: e.clientX, y: e.clientY }; };
      const onUp = (e: PointerEvent) => {
        if (!pointerDown || !ui.current.atlas || !machine) return;
        const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
        pointerDown = null;
        if (moved > 6) return; // a drag, not a click
        pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const id = pickAt();
        if (id) { setSelected(id); setPanelOpen(true); api.current?.frame(id); }
        else { setSelected(null); setIsolate(null); }
      };
      const onLeave = () => { setHover(null); };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointerleave", onLeave);

      const pickAt = (): string | null => {
        if (!machine) return null;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(machine.root, true);
        for (const h of hits) {
          const id = machine.pick(h.object);
          if (id) return ui.current.explode >= 0.5 || ui.current.dive ? id : machine.productOf(id);
        }
        return null;
      };

      // UI verbs
      const animateTo = (p1: THREE.Vector3, t1: THREE.Vector3, dur = 0.7) => {
        camAnim = { p0: camera.position.clone(), p1, t0: (controls?.target ?? target).clone(), t1, start: clock.elapsedTime, dur: reduced ? 0.01 : dur };
      };
      api.current = {
        frame: (id) => {
          if (!machine || !controls) return;
          if (!id) { animateTo(ATLAS_HOME.pos.clone(), ATLAS_HOME.target.clone()); return; }
          const b = machine.bounds(id);
          const c = b.getCenter(new THREE.Vector3());
          const r = Math.max(0.05, b.getSize(new THREE.Vector3()).length() * 0.5);
          const dir = camera.position.clone().sub(c).normalize();
          if (dir.lengthSq() < 0.5) dir.set(1, 0.5, 0.8).normalize();
          animateTo(c.clone().addScaledVector(dir, Math.max(0.16, r * 2.6)), c);
        },
        view: (name) => {
          if (!controls) return;
          animateTo(new THREE.Vector3(...VIEWS[name]), ATLAS_HOME.target.clone());
        },
        toStory: () => {
          // land on the end of the story first so the release does not replay the whole flight
          window.scrollTo(0, maxScroll());
          forceAtlas = false;
          if (controls) controls.enabled = false;
          window.scrollTo({ top: 0.86 * maxScroll(), behavior: reduced ? "auto" : "smooth" });
        },
        toAtlas: () => {
          window.scrollTo({ top: maxScroll(), behavior: reduced ? "auto" : "smooth" });
        },
        childrenOf: (id) => machine?.nodes.get(id)?.children.map((c) => c.id) ?? [],
        parentOf: (id) => machine?.parentOf.get(id),
      };

      // QA hook: probe what the camera sees without screenshots (see the lab skill)
      (window as unknown as { __rig?: unknown }).__rig = {
        scene, camera, flows, fields,
        get machine() { return machine; },
        get buildMs() { return buildMs; },
        get swapped() { return lastSwapped; },
        progress: () => progress,
        probe: (nx = 0, ny = 0, n = 6) => {
          raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
          return raycaster.intersectObjects(scene.children, true).slice(0, n).map((h) => ({
            type: h.object.type, name: h.object.name, id: h.object.userData.partId ?? null, d: +h.distance.toFixed(4),
          }));
        },
        sprites: () => {
          const out: { name: string; scale: number; visible: boolean; opacity: number; d: number }[] = [];
          scene.traverse((o) => {
            const sp = o as THREE.Sprite;
            if (sp.isSprite) out.push({ name: o.parent?.name ?? "", scale: sp.scale.x, visible: sp.visible, opacity: (sp.material as THREE.SpriteMaterial).opacity, d: sp.position.distanceTo(camera.position) });
          });
          return out;
        },
      };
      await new Promise((r) => setTimeout(r, 30));
      if (dead) return;
      setPhase("ready");
      if (openAtlas) { progress = 1; window.scrollTo(0, maxScroll()); }
      if (pinned) progress = targetProgress();

      const hiddenNow = (a: boolean) => {
        const hs = ui.current.hiddenSystems;
        return (id: string) => a && hs.has(P[id]?.system);
      };

      const loop = () => {
        if (dead) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, clock.getDelta());
        const t = clock.elapsedTime;
        if (autoflyRef.current && !pinned) {
          const max = maxScroll();
          window.scrollTo(0, Math.min(max, window.scrollY + (max * dt) / 90));
          if (window.scrollY >= max - 1) setAutofly(false);
        }
        if (pinned) progress = forced;
        else progress += (targetProgress() - progress) * Math.min(1, dt * (reduced ? 12 : 4.5));

        const inAtlas = !pinned && progress >= ATLAS_AT;
        if (inAtlas !== lastAtlas) {
          lastAtlas = inAtlas;
          setAtlas(inAtlas);
          if (controls) {
            controls.enabled = inAtlas;
            if (inAtlas) {
              // the story's last key IS the atlas home; a direct ?atlas=1 entry never flew there
              camera.position.copy(ATLAS_HOME.pos);
              controls.target.copy(ATLAS_HOME.target);
              if (diveParam && P[diveParam]) setTimeout(() => api.current?.frame(diveParam), 80);
            } else camAnim = null;
          }
        }
        const labA = inAtlas ? 1 : labAmount(progress);
        if ((labA > 0.5) !== lastLab) { lastLab = labA > 0.5; setLab(lastLab); }

        let explodeAmt: number;
        let segmentWorld: "cpu-micro" | "gpu-micro" | "machine" = "machine";
        if (!inAtlas) {
          const seg = samplePath(progress, pos, target);
          segmentWorld = seg.world;
          if (seg !== lastSeg) {
            lastSeg = seg;
            camera.near = seg.near; camera.fov = seg.fov; camera.updateProjectionMatrix();
          }
          if (!reduced) {
            pos.x += Math.sin(t * 0.37) * 0.002 * (seg.world === "machine" ? 1 : 60);
            pos.y += Math.sin(t * 0.53) * 0.0015 * (seg.world === "machine" ? 1 : 60);
          }
          camera.position.copy(pos);
          camera.lookAt(target);
          if (controls) controls.target.copy(target);
          if (cpuWorld) cpuWorld.group.visible = seg.world === "cpu-micro";
          if (gpuWorld) gpuWorld.group.visible = seg.world === "gpu-micro";
          if (machine) machine.root.visible = seg.world === "machine";
          floor.visible = seg.world === "machine";
          explodeAmt = storyExplode(progress);
          flows?.only(flowLevels(progress));
          const fl = fieldLevels(progress);
          for (const [id, v] of Object.entries(fl)) fields[id]?.set(v);
          if (cpuWorld) {
            cpuWorld.pathway = cpuPathway(progress);
            cpuWorld.spark = smooth(0.0, 0.035, progress);
            cpuWorld.activity = smooth(0.03, 0.09, progress);
            cpuWorld.cacheReveal = smooth(0.12, 0.16, progress);
          }
          if (gpuWorld) {
            gpuWorld.activity = smooth(0.49, 0.53, progress) * (1 - 0.5 * smooth(0.62, 0.64, progress));
            gpuWorld.frame = smooth(0.52, 0.585, progress);
            gpuWorld.memory = smooth(0.59, 0.62, progress);
          }
        } else {
          if (cpuWorld) cpuWorld.group.visible = false;
          if (gpuWorld) gpuWorld.group.visible = false;
          if (machine) machine.root.visible = true;
          floor.visible = true;
          if (camera.near !== 0.005) { camera.near = 0.005; camera.fov = 50; camera.updateProjectionMatrix(); }
          if (camAnim && controls) {
            const k = smooth(0, 1, (t - camAnim.start) / camAnim.dur);
            camera.position.lerpVectors(camAnim.p0, camAnim.p1, k);
            controls.target.lerpVectors(camAnim.t0, camAnim.t1, k);
            if (k >= 1) camAnim = null;
          }
          if (controls) { controls.autoRotate = ui.current.autoRotate && !reduced; controls.update(); }
          explodeAmt = ui.current.explode;
          flows?.only({});
          for (const f of Object.values(fields)) f.set(0);
        }

        // scene grade: void → lab (light or dark)
        const darkLab = inAtlas && ui.current.dark;
        bg.copy(DARK).lerp(darkLab ? LAB_DARK : LAB, labA);
        scene.environmentIntensity = 0.6 + 0.45 * labA * (darkLab ? 0.55 : 1);
        floorMat.opacity = labA;
        floorMat.color.setHex(darkLab ? 0x1a1c22 : 0xdedcd6);
        key.intensity = 1.7 + 0.6 * labA;
        if (bloom) bloom.strength = 0.22 * (1 - labA) + 0.05;

        const fans = fanSpeed(progress, inAtlas, reduced);
        ambience.update(fans, !inAtlas && segmentWorld !== "machine" ? 0 : 1, labA);
        if (machine) {
          machine.setExplode(explodeAmt, inAtlas ? ui.current.dive : null);
          machine.setAccent(accentLevel(progress, inAtlas));
          if (!inAtlas) {
            for (const [id, d] of Object.entries(storyOffsets(progress))) {
              const n = machine.nodes.get(id);
              if (n) { n.object.position.x += d[0]; n.object.position.y += d[1]; n.object.position.z += d[2]; }
            }
          }
          // hover (atlas only, not on touch)
          if (inAtlas && pointerDirty && !coarse) {
            pointerDirty = false;
            const id = pickAt();
            if (id !== ui.current.hover) setHover(id);
          }
          let fades: Record<string, number> | undefined;
          if (!inAtlas) {
            fades = storyFades(progress);
            // the glass fades in with distance from its plane: seen from just outside at
            // grazing incidence it is all Fresnel reflection and washed whole frames grey
            fades["glass-left"] = smooth(0.135, 0.5, camera.position.x);
          }
          machine.setEmphasis({
            hover: inAtlas ? ui.current.hover : null,
            // inside a dive the product itself is the stage, not a selection — only its parts glow
            selected: inAtlas && ui.current.selected !== ui.current.dive ? ui.current.selected : null,
            isolate: inAtlas ? (ui.current.isolate ?? ui.current.dive) : null,
            hidden: hiddenNow(inAtlas),
            hiddenSubtree: inAtlas ? undefined : ((sh) => (id: string) => sh.has(id))(storyHidden(progress)),
            fades,
          });
          machine.update(dt, fans);
        }
        flows?.update(t, dt);
        for (const f of Object.values(fields)) f.update(t, dt);
        cpuWorld?.update(t);
        gpuWorld?.update(t);

        if (dipRef.current) dipRef.current.style.opacity = inAtlas ? "0" : String(dipAmount(progress));
        if (PROBE) renderer!.info.reset();
        composer?.render();
        if (PROBE) {
          // ?probe=1 only: tools/measure-rig.mjs reads the whole frame's renderer.info
          // (autoReset is off under the probe, so every composer pass is counted)
          const i = renderer!.info, w = window as unknown as { __rigProbe?: Record<string, number> };
          w.__rigProbe = { frames: (w.__rigProbe?.frames ?? 0) + 1, firstFrameMs: w.__rigProbe?.firstFrameMs ?? performance.now(), calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0, machine: machine ? 1 : 0 };
        }

        if (railFillRef.current) railFillRef.current.style.height = `${progress * 100}%`;
        if (readoutRef.current) readoutRef.current.textContent = `${(progress * 100).toFixed(0)}%`;
        const idx = CHAPTERS.indexOf(chapterAt(progress));
        if (idx !== lastChapter) { lastChapter = idx; setChapterIdx(idx); }
      };
      loop();
      if (!needNow) {
        const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
        // the arrival beat gives the library all the time it needs
        libraryReady.then((lib) => {
          library = lib;
          buildOpts.library = lib;
          return buildMachineAsync(identity.accent, buildOpts, nextFrame);
        }).then((m) => {
          if (dead) { m.dispose(); return; }
          machine = m;
          buildMs = performance.now() - tBuild;
          scene.add(m.root);
        });
      }

      return () => {
        window.removeEventListener("resize", resize);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointerleave", onLeave);
      };
    })();

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      controls?.dispose();
      machine?.dispose();
      library?.dispose();
      cpuWorld?.dispose();
      gpuWorld?.dispose();
      flows?.dispose();
      pmrem?.dispose();
      composer?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      ambience.dispose();
      window.scrollTo(0, 0);
    };
  }, [identity]);

  const toggleSound = useCallback(() => {
    setSound((s) => {
      const next = !s;
      if (next) ambienceRef.current.start(); else ambienceRef.current.stop();
      return next;
    });
  }, []);

  // wheel / touch cancels auto-fly; in the atlas they must not scroll the page away
  // (panels keep their own scrolling); Escape clears the atlas selection
  useEffect(() => {
    const cancel = () => { if (autoflyRef.current) setAutofly(false); };
    const guard = (e: Event) => {
      if (!ui.current.atlas) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".rg-detail, .rg-systems, .rg-results, .rg-credits, .rg-search")) return;
      e.preventDefault();
    };
    window.addEventListener("wheel", guard, { passive: false });
    window.addEventListener("touchmove", guard, { passive: false });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (creditsOpenRef.current) { setCreditsOpen(false); return; }
      if (ui.current.isolate) setIsolate(null);
      else if (ui.current.selected) { setSelected(null); api.current?.frame(null); }
      else if (ui.current.dive) { setDive(null); api.current?.frame(null); }
      else setQuery("");
    };
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchmove", cancel, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("wheel", guard);
      window.removeEventListener("touchmove", guard);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchmove", cancel);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const jumpTo = useCallback((from: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: from * max, behavior: "smooth" });
  }, []);

  const within = useCallback((id: string, root: string) => {
    let cur: string | undefined = id;
    while (cur) { if (cur === root) return true; cur = api.current?.parentOf(cur); }
    return false;
  }, []);

  const select = useCallback((id: string | null, fromControl = false) => {
    setSelected(id);
    focusDetail.current = fromControl && !!id;
    if (id) {
      setPanelOpen(true);
      // picking something outside the dived product leaves the dive
      setDive((d) => (d && !within(id, d) ? null : d));
      api.current?.frame(id);
    } else { setIsolate(null); api.current?.frame(null); }
  }, [within]);

  const enterDive = useCallback((id: string) => {
    setDive(id); setIsolate(null); setSelected(id); setPanelOpen(true);
    setExplode((e) => Math.max(e, 0.5));
    api.current?.frame(id);
  }, []);

  const exitDive = useCallback(() => {
    setDive(null); setIsolate(null); setSelected(null);
    api.current?.frame(null);
  }, []);

  const toggleSystem = useCallback((s: SystemId) => {
    setHiddenSystems((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [] as PartContent[];
    const hit = (c: PartContent) =>
      c.name.toLowerCase().includes(q) || c.id.includes(q) ||
      (c.productName?.toLowerCase().includes(q) ?? false) ||
      c.tags.some((tg) => tg.includes(q));
    return PART_IDS.map((id) => P[id]).filter(hit).sort((a, b) => (a.level === b.level ? 0 : a.level === "A" ? -1 : 1)).slice(0, 8);
  }, [query]);

  // a selection made from a button (search result, chip, fallback list) moves
  // focus into the panel, so a keyboard reader lands on what they just opened
  useEffect(() => {
    if (focusDetail.current && detailHeadRef.current) {
      focusDetail.current = false;
      detailHeadRef.current.focus();
    }
  }, [selected]);

  const chapter = CHAPTERS[chapterIdx];
  const copy = chapter[mode];
  const visibleCount = PART_IDS.filter((id) => !hiddenSystems.has(P[id].system)).length;
  const sel = selected ? P[selected] : null;
  const selProduct = selected && sel ? (sel.level === "A" ? sel : P[LEVEL_A.find((a) => selected.startsWith(a.split("-")[0])) ?? selected]) : null;
  const hov = hover ? P[hover] : null;
  const stopIdx = Math.round(explode * 4);

  return (
    <div className={`rig ${lab ? "rg-lab" : ""} ${atlas ? "rg-atlas" : ""} ${flat ? "rg-flat" : ""} ${atlas && dark ? "rg-dark" : ""} ${atlas && selected ? "rg-has-detail" : ""}`} style={{ "--rg-accent": identity.accent } as React.CSSProperties}>
      <style>{CSS}</style>
      <div className="rg-spacer" style={{ height: `${SCROLL_VH}vh` }} />
      <div ref={stageRef} className="rg-stage" />
      <div ref={dipRef} className="rg-dip" aria-hidden />

      {phase === "loading" && (
        <div className="rg-loading">
          <div className="rg-load-mark" />
          <p>INSIDE THE RIG</p>
          <span>assembling the machine…</span>
        </div>
      )}

      {phase === "unsupported" && (
        <div className="rg-fallback">
          <h1>INSIDE THE RIG</h1>
          <p>This one needs WebGL. Here is the machine as a list — every major component and what it does:</p>
          <ol>
            {LEVEL_A.map((id) => (
              <li key={id}><strong>{P[id].name}</strong>{P[id].productName ? ` — ${P[id].productName}` : ""}: {P[id].short}</li>
            ))}
          </ol>
          <a href="/projects/rig/">← back to the entry</a>
        </div>
      )}

      {phase === "ready" && !atlas && (
        <>
          <header className="rg-masthead">
            <span className="rg-kicker">JARVISING · 003{mode === "brand" ? ` · ${identity.partner}` : ""}</span>
            <span className="rg-title">INSIDE THE RIG</span>
            {mode === "brand" && <span className="rg-brandline">{identity.headline}</span>}
          </header>

          <div className="rg-caption" key={chapter.id} role="status" aria-live="polite">
            <span className="rg-eyebrow">{copy.eyebrow}</span>
            <h2>{copy.title}</h2>
            <p>{copy.body}</p>
          </div>

          <div className="rg-rail">
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                className={`rg-tick ${c === chapter ? "on" : ""}`}
                style={{ top: `${((c.from + c.to) / 2) * 100}%` }}
                title={c[mode].title}
                onClick={() => jumpTo(c.from + 0.004)}
              />
            ))}
            <div className="rg-rail-track"><div ref={railFillRef} className="rg-rail-fill" /></div>
          </div>

          <div className="rg-controls">
            <button className={`rg-btn ${autofly ? "on" : ""}`} onClick={() => setAutofly((a) => !a)}>
              {autofly ? "■ HOLD" : "▶ AUTO-FLY"}
            </button>
            <button className={`rg-btn ${sound ? "on" : ""}`} onClick={toggleSound}>{sound ? "♪ AMBIENCE ON" : "♪ AMBIENCE OFF"}</button>
            <button className="rg-btn" onClick={() => api.current?.toAtlas()}>SKIP TO THE ATLAS ↓</button>
          </div>
          <div ref={readoutRef} className="rg-readout">0%</div>
          <div className="rg-hint">scroll to move through the machine</div>
        </>
      )}

      {phase === "ready" && atlas && (
        <>
          <header className="rg-atlas-head">
            <span className="rg-kicker">● INTERACTIVE ATLAS{mode === "brand" ? ` · ${identity.partner}` : ""}</span>
            <h1>Inside the Rig <sup>3D</sup></h1>
            <span className="rg-sub">{PART_IDS.length} modelled pieces · a flagship-class gaming PC, 2026</span>
          </header>

          <div className="rg-search">
            <input
              type="search"
              placeholder="Find a component"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Find a component"
            />
            {results.length > 0 && (
              <ul className="rg-results" role="listbox">
                {results.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => { select(r.id, true); setQuery(""); }}>
                      <span className="rg-dot" style={{ background: SYSTEMS.find((s) => s.id === r.system)?.tint }} />
                      <span>{r.name}</span>
                      <em>{r.productName ?? systemLabel(r.system)}</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className={`rg-systems ${panelOpen ? "" : "rg-collapsed"}`} aria-label="Systems">
            <div className="rg-panel-head">
              <span>Systems</span>
              <span className="rg-count">{SYSTEMS.length}</span>
              <button className="rg-fold" onClick={() => setPanelOpen((o) => !o)} aria-label="Toggle systems panel">{panelOpen ? "–" : "+"}</button>
            </div>
            <div className="rg-segments">
              <button className={hiddenSystems.size === 0 ? "on" : ""} onClick={() => setHiddenSystems(new Set())}>All</button>
              <button
                className={["power", "cooling", "chassis"].every((s) => hiddenSystems.has(s as SystemId)) && !hiddenSystems.has("compute") ? "on" : ""}
                onClick={() => setHiddenSystems(new Set<SystemId>(["power", "cooling", "chassis"]))}
              >Core</button>
              <button
                className={["compute", "graphics", "memory", "storage", "connectivity", "chassis"].every((s) => hiddenSystems.has(s as SystemId)) ? "on" : ""}
                onClick={() => setHiddenSystems(new Set<SystemId>(["compute", "graphics", "memory", "storage", "connectivity", "chassis"]))}
              >Thermal &amp; power</button>
            </div>
            <ul className="rg-syslist">
              {SYSTEMS.map((s) => (
                <li key={s.id} className={hiddenSystems.has(s.id) ? "off" : ""}>
                  <span className="rg-dot" style={{ background: s.tint }} />
                  <span className="rg-sysname">{s.label}</span>
                  <span className="rg-syscount">{SYSTEM_COUNT[s.id]}</span>
                  <button
                    role="switch"
                    aria-checked={!hiddenSystems.has(s.id)}
                    className={`rg-switch ${hiddenSystems.has(s.id) ? "" : "on"}`}
                    onClick={() => toggleSystem(s.id)}
                    aria-label={`${hiddenSystems.has(s.id) ? "Show" : "Hide"} ${s.label}`}
                  ><i /></button>
                </li>
              ))}
            </ul>
            <div className="rg-panel-foot">
              <span>{visibleCount} pieces visible</span>
              <button onClick={() => setHiddenSystems(hiddenSystems.size ? new Set() : new Set(SYSTEMS.map((s) => s.id)))}>
                {hiddenSystems.size ? "Show all" : "Hide all"}
              </button>
            </div>
          </aside>

          <div className="rg-views" role="group" aria-label="Views">
            <button title="Three-quarter view" aria-label="Three-quarter view" onClick={() => api.current?.view("quarter")}>¼</button>
            <button title="Front view" aria-label="Front view" onClick={() => api.current?.view("front")}>F</button>
            <button title="Side view" aria-label="Side view" onClick={() => api.current?.view("side")}>S</button>
            <button title="Back view" aria-label="Back view" onClick={() => api.current?.view("back")}>B</button>
            <button title="Top view" aria-label="Top view" onClick={() => api.current?.view("top")}>T</button>
            <button title="Reset everything" aria-label="Reset the view, the explode slider and the filters" onClick={() => { exitDive(); setExplode(0.5); setHiddenSystems(new Set()); }}>↺</button>
            <button title="Auto-rotate" aria-label="Auto-rotate" aria-pressed={autoRotate} className={autoRotate ? "on" : ""} onClick={() => setAutoRotate((a) => !a)}>⟳</button>
          </div>

          <div className="rg-explode">
            <div className="rg-explode-head">
              <span>{dive ? `Explode ${P[dive]?.name ?? "product"}` : "Explode PC"}</span>
              <span className="rg-pct">{Math.round(explode * 100)} %</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.005} value={explode}
              onChange={(e) => setExplode(parseFloat(e.target.value))}
              aria-label={dive ? `Explode the ${P[dive]?.name ?? "product"}` : "Explode the PC"}
              aria-valuetext={`${Math.round(explode * 100)} per cent, ${dive ? (explode < 0.25 ? "assembled" : explode < 0.75 ? "components" : "every piece") : EXPLODE_STOPS[stopIdx]?.label ?? ""}`}
              list="rg-stops"
            />
            <datalist id="rg-stops">{EXPLODE_STOPS.map((s) => <option key={s.at} value={s.at} label={s.label} />)}</datalist>
            <div className="rg-explode-foot">
              <span>Assembled</span>
              <span className="rg-stop-label">{dive ? (explode < 0.25 ? "Assembled" : explode < 0.75 ? "Components" : "Every piece") : EXPLODE_STOPS[stopIdx]?.label}</span>
              <span>Every piece</span>
            </div>
            <button className="rg-reset" onClick={() => setExplode(0)} title="Reassemble" aria-label="Reassemble">↺<small aria-hidden="true">Reset</small></button>
          </div>

          {hov && !sel && (
            <div ref={tipRef} className="rg-tip" aria-hidden="true">
              <span className="rg-eyebrow">{systemLabel(hov.system)}</span>
              <strong>{hov.productName ?? hov.name}</strong>
              {hov.productName && <em>{hov.name}</em>}
              <p>{hov.short}</p>
            </div>
          )}
          {hov && sel && <div ref={tipRef} className="rg-tip rg-tip-mini" aria-hidden="true"><strong>{hov.name}</strong></div>}

          {sel && (
            <aside className="rg-detail" aria-label={sel.name}>
              <button className="rg-close" onClick={() => select(null)} aria-label="Close">×</button>
              <span className="rg-eyebrow" style={{ color: SYSTEMS.find((s) => s.id === sel.system)?.tint }}>{systemLabel(sel.system)}</span>
              <h2 ref={detailHeadRef} tabIndex={-1}>{sel.name}</h2>
              {sel.productName && <p className="rg-product">{sel.productName}</p>}
              {mode === "brand" && sel.brand ? (
                <>
                  <span className="rg-eyebrow rg-brand-eyebrow">{sel.brand.eyebrow}</span>
                  <h3>{sel.brand.title}</h3>
                  <p className="rg-lede">{sel.brand.body}</p>
                </>
              ) : (
                <p className="rg-lede">{sel.short}</p>
              )}
              <dl className="rg-meta">
                <div><dt>Part ref</dt><dd>{sel.id}</dd></div>
                <div><dt>Level</dt><dd>{sel.level === "A" ? "Product" : "Component"}</dd></div>
              </dl>
              {(() => {
                // what this part plugs into, and what plugs into it
                const fits = socketOf(sel.id);
                const has = socketsOn(sel.id);
                if (!fits && !has) return null;
                return (
                  <p className="rg-sockets">
                    {fits && <span>Fits the <strong>{fits.label}</strong>.</span>}
                    {has && <span>{fits ? " " : ""}Carries {has.total} {has.total === 1 ? "socket" : "sockets"}{has.free > 0 ? `, ${has.free} still free` : ", all in use"}.</span>}
                  </p>
                );
              })()}
              <div className="rg-actions">
                {(api.current?.childrenOf(sel.id).length ?? 0) > 0 && (
                  <button className="rg-primary" onClick={() => (dive === sel.id ? exitDive() : enterDive(sel.id))}>
                    {dive === sel.id ? "Leave the internals" : "Explore internals ›"}
                  </button>
                )}
                <button className={(api.current?.childrenOf(sel.id).length ?? 0) > 0 ? "" : "rg-primary"} onClick={() => setIsolate(isolate === sel.id ? null : sel.id)}>
                  {isolate === sel.id ? "Show everything" : "Isolate component"}
                </button>
                <button onClick={() => select(null)}>Clear selection</button>
              </div>
              {(api.current?.childrenOf(sel.id).length ?? 0) > 0 && (
                <>
                  <h4>Inside this product</h4>
                  <div className="rg-chips">{api.current?.childrenOf(sel.id).map((k) => P[k] ? <button key={k} onClick={() => select(k, true)}>{P[k].name}</button> : null)}</div>
                </>
              )}
              {sel.whatItDoes && (<><h4>What it does</h4><p>{sel.whatItDoes}</p></>)}
              {sel.whyItMatters && (<><h4>Why it matters in games</h4><p>{sel.whyItMatters}</p></>)}
              {sel.buying && (<><h4>What matters when buying one</h4><p>{sel.buying}</p></>)}
              {sel.thisBuild && (<><h4>This build</h4><ul className="rg-bullets">{sel.thisBuild.map((b) => <li key={b}>{b}</li>)}</ul></>)}
              {sel.specs && sel.specs.length > 0 && (
                <>
                  <h4>Specifications</h4>
                  <table className="rg-specs"><tbody>{sel.specs.map((s) => <tr key={s.label}><th>{s.label}</th><td>{s.value}</td></tr>)}</tbody></table>
                </>
              )}
              {sel.related && sel.related.length > 0 && (
                <>
                  <h4>Related</h4>
                  <div className="rg-chips">{sel.related.map((r) => P[r] ? <button key={r} onClick={() => select(r, true)}>{P[r].name}</button> : null)}</div>
                </>
              )}
              {sel.level !== "A" && selProduct && selProduct.id !== sel.id && (
                <p className="rg-partof">Part of <button className="rg-link" onClick={() => select(selProduct.id, true)}>{selProduct.name}</button></p>
              )}
              {mode === "brand" && <p className="rg-disclosure">{identity.disclosure}</p>}
            </aside>
          )}

          <div className="rg-hints">Drag to orbit · Scroll to zoom · Click to inspect</div>
          <button className="rg-credits-btn" onClick={() => setCreditsOpen((o) => !o)}>Source &amp; credits ↗</button>
          {creditsOpen && (
            <div className="rg-credits" role="dialog" aria-label="Source and credits">
              <button className="rg-close" onClick={() => setCreditsOpen(false)} aria-label="Close">×</button>
              <h3>Source &amp; credits</h3>
              {CREDITS.map((c) => <p key={c}>{c}</p>)}
              {mode === "brand" && <p className="rg-disclosure">{identity.disclosure}</p>}
            </div>
          )}
          <nav className="rg-crumbs" aria-label="Where you are">
            <button onClick={() => api.current?.toStory()}>↑ Story</button>
            <span className="rg-sep">·</span>
            <button className={!dive && !selected ? "on" : ""} onClick={exitDive}>Inside the Rig</button>
            {dive && (<><span className="rg-sep">›</span><button className={selected === dive ? "on" : ""} onClick={() => select(dive)}>{P[dive]?.name}</button></>)}
            {selected && selected !== dive && (<><span className="rg-sep">›</span><span className="on">{P[selected]?.name}</span></>)}
          </nav>
          <button className={`rg-sound ${sound ? "on" : ""}`} onClick={toggleSound} title="Ambience" aria-label="Ambience" aria-pressed={sound}>{sound ? "♪ on" : "♪ off"}</button>
          <button className={`rg-sound rg-dark-toggle ${dark ? "on" : ""}`} onClick={() => setDark((d) => !d)} title="Dark or light lab" aria-label="Dark lab" aria-pressed={dark}>{dark ? "☀ light" : "☾ dark"}</button>

          <nav className="rg-sr" aria-label="Components of the build">
            <h2>Components of the build</h2>
            <p>Every major part, in the order it appears in the machine. Choosing one opens its details and moves the view to it.</p>
            <ol>
              {LEVEL_A.map((id) => (
                <li key={id}><button onClick={() => select(id, true)}>{P[id].name}{P[id].productName ? ` (${P[id].productName})` : ""}: {P[id].short}</button></li>
              ))}
            </ol>
          </nav>
        </>
      )}

      <a href="/projects/rig/" className="rg-escape" aria-label="Back to the entry page">← entry</a>
    </div>
  );
};

const CSS = `
.rig { --rg-fg: #e8e6df; --rg-bg-ui: rgba(10, 11, 14, .62); --rg-line: rgba(255,255,255,.14); --rg-mute: rgba(232,230,223,.74);
  font-family: Inter, system-ui, sans-serif; color: var(--rg-fg); position: relative; }
.rig.rg-lab { --rg-fg: #14161a; --rg-bg-ui: rgba(255,255,255,.9); --rg-line: rgba(20,22,26,.14); --rg-mute: rgba(20,22,26,.68); }
.rg-spacer { width: 100%; }
.rig :focus-visible { outline: 2px solid var(--rg-accent); outline-offset: 2px; border-radius: 6px; }
.rig .rg-stage canvas:focus { outline: none; }
.rg-flat * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
.rg-stage { position: fixed; inset: 0; z-index: 0; }
.rg-stage canvas { display: block; width: 100vw !important; height: 100vh !important; touch-action: none; }
.rg-dip { position: fixed; inset: 0; background: #000; pointer-events: none; z-index: 5; opacity: 0; }
.rg-escape { position: fixed; top: 16px; right: 18px; z-index: 30; font: 500 11px/1 Inter, system-ui; letter-spacing: .18em; text-transform: uppercase;
  color: var(--rg-mute); text-decoration: none; padding: 8px 10px; border: 1px solid var(--rg-line); border-radius: 999px; background: var(--rg-bg-ui); backdrop-filter: blur(8px); }
.rg-escape:hover { color: var(--rg-accent); border-color: var(--rg-accent); }

/* loading + fallback */
.rg-loading, .rg-fallback { position: fixed; inset: 0; z-index: 20; display: grid; place-content: center; text-align: center; background: #050608; color: #e8e6df; }
.rg-loading p { font: 700 clamp(28px, 5vw, 56px)/1 "Space Grotesk", sans-serif; letter-spacing: .08em; margin: 18px 0 8px; }
.rg-loading span { font: 400 12px/1 Inter; letter-spacing: .2em; text-transform: uppercase; color: rgba(232,230,223,.5); }
.rg-load-mark { width: 54px; height: 54px; margin: 0 auto; border: 2px solid rgba(232,230,223,.2); border-top-color: var(--rg-accent); border-radius: 50%; animation: rg-spin 1.1s linear infinite; }
@keyframes rg-spin { to { transform: rotate(360deg); } }
.rg-fallback { place-content: start center; padding: 10vh 6vw; overflow: auto; text-align: left; }
.rg-fallback h1 { font: 700 40px/1 "Space Grotesk"; letter-spacing: .06em; }
.rg-fallback ol { max-width: 60ch; line-height: 1.55; } .rg-fallback a { color: var(--rg-accent); }

/* story chrome */
.rg-masthead { position: fixed; top: 18px; left: 22px; z-index: 10; display: grid; gap: 4px; pointer-events: none; }
.rg-kicker { font: 500 10px/1 Inter; letter-spacing: .22em; text-transform: uppercase; color: var(--rg-mute); }
.rg-title { font: 700 18px/1 "Space Grotesk"; letter-spacing: .14em; }
.rg-brandline { font: 500 12px/1.3 Inter; color: var(--rg-accent); }
.rg-caption { position: fixed; left: 6vw; bottom: 14vh; z-index: 10; max-width: 520px; pointer-events: none; animation: rg-in .7s cubic-bezier(.2,.7,.2,1) both;
  text-shadow: 0 1px 2px rgba(0,0,0,.5), 0 2px 28px rgba(0,0,0,.45); }
.rg-caption::before { content: ""; position: absolute; inset: -60px -120px -60px -140px; z-index: -1; pointer-events: none;
  background: radial-gradient(ellipse at 35% 60%, rgba(4,5,8,.62), rgba(4,5,8,0) 70%); }
.rg-lab .rg-caption { text-shadow: none; } .rg-lab .rg-caption::before { display: none; }
@keyframes rg-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.rg-eyebrow { display: block; font: 600 10px/1 Inter; letter-spacing: .24em; text-transform: uppercase; color: var(--rg-accent); margin-bottom: 10px; }
.rg-caption h2 { font: 700 clamp(30px, 4.6vw, 60px)/1.02 "Space Grotesk"; letter-spacing: -.01em; margin: 0 0 12px; text-wrap: balance; }
.rg-caption p { font: 400 clamp(14px, 1.25vw, 17px)/1.5 Inter; color: var(--rg-fg); opacity: .84; margin: 0; max-width: 46ch; }
.rg-rail { position: fixed; right: 22px; top: 14vh; bottom: 14vh; width: 14px; z-index: 10; }
.rg-rail-track { position: absolute; left: 6px; top: 0; bottom: 0; width: 2px; background: var(--rg-line); }
.rg-rail-fill { width: 100%; background: var(--rg-accent); height: 0; }
.rg-tick { position: absolute; left: 1px; width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--rg-line); background: var(--rg-bg-ui); transform: translateY(-50%); cursor: pointer; padding: 0; }
.rg-tick.on { border-color: var(--rg-accent); background: var(--rg-accent); }
.rg-controls { position: fixed; left: 22px; bottom: 22px; z-index: 10; display: flex; gap: 8px; }
.rg-btn { font: 600 10px/1 Inter; letter-spacing: .18em; text-transform: uppercase; color: var(--rg-fg); background: var(--rg-bg-ui); border: 1px solid var(--rg-line);
  padding: 10px 12px; border-radius: 999px; cursor: pointer; backdrop-filter: blur(8px); }
.rg-btn.on, .rg-btn:hover { color: var(--rg-accent); border-color: var(--rg-accent); }
.rg-readout { position: fixed; right: 48px; bottom: 24px; z-index: 10; font: 500 11px/1 "JetBrains Mono", ui-monospace, monospace; color: var(--rg-mute); letter-spacing: .1em; }
.rg-hint { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 10; font: 500 10px/1 Inter; letter-spacing: .24em; text-transform: uppercase; color: var(--rg-mute); animation: rg-pulse 2.4s ease-in-out infinite; }
@keyframes rg-pulse { 50% { opacity: .35; } }

/* atlas chrome (light lab) */
.rg-atlas .rg-escape { top: 16px; right: 18px; }
.rg-atlas-head { position: fixed; top: 22px; left: 26px; z-index: 10; pointer-events: none; }
.rg-atlas-head h1 { font: 700 26px/1 "Space Grotesk"; margin: 8px 0 6px; letter-spacing: -.01em; }
.rg-atlas-head h1 sup { font: 600 10px/1 Inter; letter-spacing: .12em; color: var(--rg-mute); margin-left: 6px; vertical-align: super; }
.rg-atlas-head .rg-sub { font: 400 12px/1 Inter; color: var(--rg-mute); }
.rg-atlas-head .rg-kicker { color: var(--rg-accent); }
.rg-search { position: fixed; top: 22px; right: 70px; z-index: 12; width: min(300px, 46vw); }
.rg-search input { width: 100%; box-sizing: border-box; font: 500 13px/1 Inter; color: var(--rg-fg); background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 999px;
  padding: 11px 16px 11px 38px; outline: none; backdrop-filter: blur(10px); box-shadow: 0 6px 24px rgba(0,0,0,.06);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='2.2'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: 14px center; }
.rg-search input:focus { border-color: var(--rg-accent); }
.rg-results { position: absolute; top: 46px; left: 0; right: 0; margin: 0; padding: 6px; list-style: none; background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 14px; backdrop-filter: blur(12px); box-shadow: 0 12px 40px rgba(0,0,0,.12); }
.rg-results button { width: 100%; display: grid; grid-template-columns: 10px 1fr auto; gap: 10px; align-items: center; text-align: left; font: 500 13px/1.2 Inter; color: var(--rg-fg); background: none; border: 0; padding: 9px 10px; border-radius: 9px; cursor: pointer; }
.rg-results button:hover { background: rgba(127,127,127,.12); }
.rg-results em { font: 400 11px/1 Inter; color: var(--rg-mute); font-style: normal; }
.rg-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

.rg-systems { position: fixed; left: 26px; top: 50%; transform: translateY(-50%); z-index: 11; width: 262px; overscroll-behavior: contain; background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 18px;
  padding: 14px 14px 12px; backdrop-filter: blur(14px); box-shadow: 0 14px 44px rgba(0,0,0,.08); }
.rg-panel-head { display: flex; align-items: center; gap: 8px; font: 600 13px/1 Inter; margin-bottom: 12px; }
.rg-count { font: 500 10px/1 Inter; padding: 4px 7px; border-radius: 999px; background: rgba(127,127,127,.14); color: var(--rg-mute); }
.rg-fold { margin-left: auto; font: 500 14px/1 Inter; background: none; border: 0; color: var(--rg-mute); cursor: pointer; width: 24px; height: 24px; }
.rg-collapsed > *:not(.rg-panel-head) { display: none; }
.rg-segments { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 4px; padding: 4px; border-radius: 12px; background: rgba(127,127,127,.12); margin-bottom: 10px; }
.rg-segments button { font: 500 11px/1 Inter; padding: 8px 6px; border: 0; border-radius: 9px; background: none; color: var(--rg-mute); cursor: pointer; }
.rg-segments button.on { background: var(--rg-bg-ui); color: var(--rg-fg); box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.rg-syslist { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.rg-syslist li { display: grid; grid-template-columns: 10px 1fr auto 34px; gap: 10px; align-items: center; padding: 7px 6px; border-radius: 9px; font: 500 13px/1 Inter; }
.rg-syslist li:hover { background: rgba(127,127,127,.1); }
.rg-syslist li.off { color: var(--rg-mute); }
.rg-syscount { font: 400 11px/1 Inter; color: var(--rg-mute); }
.rg-switch { width: 32px; height: 18px; border-radius: 999px; border: 0; background: rgba(127,127,127,.3); position: relative; cursor: pointer; padding: 0; }
.rg-switch i { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .18s; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.rg-switch.on { background: var(--rg-accent); } .rg-switch.on i { transform: translateX(14px); }
.rg-panel-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--rg-line); font: 400 11px/1 Inter; color: var(--rg-mute); }
.rg-panel-foot button { font: 500 11px/1 Inter; color: var(--rg-fg); background: none; border: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }

.rg-views { position: fixed; right: 26px; top: 50%; transform: translateY(-50%); z-index: 11; display: grid; gap: 4px; background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 14px; padding: 5px; backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,.08); }
.rg-views button { width: 34px; height: 34px; border-radius: 9px; border: 0; background: none; color: var(--rg-fg); font: 600 12px/1 Inter; cursor: pointer; }
.rg-views button:hover, .rg-views button.on { background: var(--rg-accent); color: #fff; }

.rg-explode { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 11; width: min(560px, 82vw); background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 18px;
  padding: 12px 74px 10px 18px; backdrop-filter: blur(14px); box-shadow: 0 14px 44px rgba(0,0,0,.08); }
.rg-explode-head { display: flex; justify-content: space-between; align-items: center; font: 600 13px/1 Inter; margin-bottom: 8px; }
.rg-pct { font: 500 11px/1 "JetBrains Mono", ui-monospace, monospace; padding: 5px 8px; border-radius: 8px; background: rgba(127,127,127,.14); color: var(--rg-mute); }
.rg-explode input[type=range] { width: 100%; accent-color: var(--rg-accent); margin: 4px 0; }
.rg-explode-foot { display: flex; justify-content: space-between; font: 400 10px/1 Inter; color: var(--rg-mute); letter-spacing: .04em; }
.rg-stop-label { color: var(--rg-fg); font-weight: 600; }
.rg-reset { position: absolute; right: 12px; top: 12px; bottom: 10px; width: 52px; border-left: 1px solid var(--rg-line); background: none; border-top: 0; border-right: 0; border-bottom: 0; color: var(--rg-mute); font: 500 16px/1 Inter; cursor: pointer; display: grid; place-content: center; gap: 4px; }
.rg-reset small { font: 500 9px/1 Inter; letter-spacing: .06em; }
.rg-reset:hover { color: var(--rg-accent); }

.rg-tip { position: fixed; z-index: 14; pointer-events: none; max-width: 260px; background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 12px; padding: 10px 12px; backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,.1); }
.rg-tip .rg-eyebrow { margin-bottom: 6px; } .rg-tip strong { display: block; font: 600 13px/1.2 "Space Grotesk"; } .rg-tip em { display: block; font: 400 11px/1.3 Inter; font-style: normal; color: var(--rg-mute); margin-top: 2px; }
.rg-tip p { margin: 6px 0 0; font: 400 12px/1.4 Inter; color: var(--rg-fg); opacity: .85; }
.rg-tip-mini { padding: 6px 10px; } .rg-tip-mini strong { font-size: 12px; }

.rg-detail { position: fixed; right: 78px; top: 84px; bottom: 110px; z-index: 13; width: min(340px, 84vw); overflow: auto; overscroll-behavior: contain; background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 18px;
  padding: 18px 18px 22px; backdrop-filter: blur(16px); box-shadow: 0 16px 50px rgba(0,0,0,.12); scrollbar-width: thin; }
.rg-detail h2 { font: 700 24px/1.1 "Space Grotesk"; margin: 0 0 6px; padding-right: 26px; letter-spacing: -.01em; }
.rg-detail h3 { font: 700 18px/1.2 "Space Grotesk"; margin: 0 0 6px; }
.rg-detail h4 { font: 600 10px/1 Inter; letter-spacing: .2em; text-transform: uppercase; color: var(--rg-mute); margin: 18px 0 6px; }
.rg-detail p { font: 400 13px/1.5 Inter; margin: 0 0 6px; }
.rg-product { color: var(--rg-mute); font-size: 12px !important; }
.rg-lede { font-size: 14px !important; }
.rg-brand-eyebrow { margin-top: 12px; }
.rg-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0; padding: 12px 0; border-top: 1px solid var(--rg-line); border-bottom: 1px solid var(--rg-line); }
.rg-meta dt { font: 500 10px/1 Inter; letter-spacing: .12em; text-transform: uppercase; color: var(--rg-mute); margin-bottom: 5px; }
.rg-meta dd { margin: 0; font: 500 12px/1 "JetBrains Mono", ui-monospace, monospace; }
.rg-actions { display: grid; gap: 6px; }
.rg-actions button { font: 600 12px/1 Inter; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--rg-line); background: none; color: var(--rg-fg); cursor: pointer; text-align: left; }
.rg-actions .rg-primary { background: #14161a; color: #fff; border-color: #14161a; }
.rig:not(.rg-lab) .rg-actions .rg-primary { background: var(--rg-accent); border-color: var(--rg-accent); }
.rg-actions button:hover { border-color: var(--rg-accent); }
.rg-bullets { margin: 0; padding-left: 16px; font: 400 13px/1.5 Inter; }
.rg-specs { width: 100%; border-collapse: collapse; font: 400 12px/1.35 Inter; }
.rg-specs th { text-align: left; font-weight: 500; color: var(--rg-mute); padding: 5px 8px 5px 0; vertical-align: top; width: 42%; border-bottom: 1px solid var(--rg-line); }
.rg-specs td { padding: 5px 0; border-bottom: 1px solid var(--rg-line); }
.rg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.rg-chips button { font: 500 11px/1 Inter; padding: 7px 10px; border-radius: 999px; border: 1px solid var(--rg-line); background: none; color: var(--rg-fg); cursor: pointer; }
.rg-chips button:hover { border-color: var(--rg-accent); color: var(--rg-accent); }
.rg-sockets { margin: -4px 0 14px !important; font-size: 12px !important; color: var(--rg-mute); }
.rg-sockets strong { color: var(--rg-fg); font-weight: 600; }
.rg-partof { margin-top: 14px !important; color: var(--rg-mute); font-size: 12px !important; }
.rg-link { font: inherit; color: var(--rg-accent); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.rg-ext { display: inline-block; margin-top: 14px; font: 500 12px/1 Inter; color: var(--rg-accent); text-decoration: none; }
.rg-disclosure { margin-top: 14px !important; font-size: 11px !important; color: var(--rg-mute); }
.rg-close { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border-radius: 50%; border: 0; background: rgba(127,127,127,.12); color: var(--rg-fg); font: 400 18px/1 Inter; cursor: pointer; }

.rg-hints { position: fixed; left: 26px; bottom: 26px; z-index: 10; font: 400 11px/1 Inter; color: var(--rg-mute); letter-spacing: .02em; }
.rg-credits-btn { position: fixed; right: 26px; bottom: 26px; z-index: 10; font: 400 11px/1 Inter; color: var(--rg-mute); background: none; border: 0; cursor: pointer; }
.rg-credits-btn:hover { color: var(--rg-accent); }
.rg-credits { position: fixed; right: 26px; bottom: 56px; z-index: 15; width: min(380px, 86vw); background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 16px; padding: 18px; backdrop-filter: blur(16px); box-shadow: 0 16px 50px rgba(0,0,0,.14); }
.rg-credits h3 { font: 700 16px/1 "Space Grotesk"; margin: 0 0 10px; } .rg-credits h4 { font: 600 10px/1 Inter; letter-spacing: .2em; text-transform: uppercase; color: var(--rg-mute); margin: 14px 0 6px; }
.rg-credits p, .rg-credits li { font: 400 12px/1.5 Inter; margin: 0 0 6px; } .rg-credits ul { margin: 0; padding-left: 16px; } .rg-credits a { color: var(--rg-accent); }
.rg-story { position: fixed; top: 22px; left: 50%; transform: translateX(-50%); z-index: 12; font: 600 10px/1 Inter; letter-spacing: .18em; text-transform: uppercase; color: var(--rg-fg); background: var(--rg-bg-ui); border: 1px solid var(--rg-line); padding: 10px 14px; border-radius: 999px; cursor: pointer; backdrop-filter: blur(8px); }
.rg-story:hover { color: var(--rg-accent); border-color: var(--rg-accent); }
.rg-crumbs { position: fixed; top: 22px; left: 50%; transform: translateX(-50%); z-index: 12; display: flex; align-items: center; gap: 4px; padding: 5px 8px 5px 5px; max-width: 62vw;
  background: var(--rg-bg-ui); border: 1px solid var(--rg-line); border-radius: 999px; backdrop-filter: blur(8px); font: 600 10px/1 Inter; letter-spacing: .14em; text-transform: uppercase; color: var(--rg-mute); }
.rg-crumbs button { font: inherit; color: var(--rg-mute); background: none; border: 0; padding: 7px 9px; border-radius: 999px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 22ch; }
.rg-crumbs button:first-child { color: var(--rg-fg); background: rgba(127,127,127,.14); }
.rg-crumbs button:hover, .rg-crumbs .on { color: var(--rg-fg); }
.rg-crumbs span.on { padding: 7px 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 22ch; }
.rg-crumbs .rg-sep { color: var(--rg-mute); opacity: .5; }
.rig.rg-lab.rg-dark { --rg-fg: #e8e6df; --rg-bg-ui: rgba(16,17,22,.86); --rg-line: rgba(255,255,255,.14); --rg-mute: rgba(232,230,223,.74); }
.rg-dark .rg-actions .rg-primary { background: var(--rg-accent); border-color: var(--rg-accent); color: #fff; }
.rg-dark .rg-segments button.on { background: rgba(255,255,255,.1); }
.rg-dark .rg-switch i { background: #e8e6df; }
.rg-dark-toggle { top: 118px !important; }
.rg-sound { position: fixed; right: 26px; top: 84px; z-index: 12; font: 600 10px/1 Inter; letter-spacing: .14em; text-transform: uppercase; color: var(--rg-mute); background: var(--rg-bg-ui); border: 1px solid var(--rg-line); padding: 8px 10px; border-radius: 999px; cursor: pointer; backdrop-filter: blur(8px); }
.rg-sound.on, .rg-sound:hover { color: var(--rg-accent); border-color: var(--rg-accent); }
.rg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.rg-sr button:focus { position: fixed; left: 26px; top: 90px; width: auto; height: auto; clip: auto; z-index: 40; background: #fff; color: #000; padding: 8px; }

@media (max-width: 760px) {
  /* story */
  .rg-caption { left: 5vw; right: 5vw; bottom: 16vh; max-width: none; }
  .rg-caption h2 { font-size: clamp(26px, 8vw, 38px); margin-bottom: 8px; }
  .rg-caption p { font-size: 14px; max-width: none; }
  .rg-controls { left: 10px; right: 10px; bottom: 10px; gap: 6px; }
  .rg-controls .rg-btn { flex: 1 1 0; padding: 12px 4px; font-size: 8.5px; letter-spacing: .06em; text-align: center; white-space: nowrap; }
  .rg-readout, .rg-hint { display: none; }
  .rg-rail { right: 10px; top: 18vh; bottom: 22vh; width: 12px; }
  .rg-masthead { top: 12px; left: 14px; }

  /* atlas — three bands down the top, three up from the bottom, nothing stacked */
  .rg-atlas-head { top: 10px; left: 14px; right: 84px; }
  .rg-atlas-head h1 { font-size: 19px; margin: 4px 0 0; }
  .rg-atlas-head .rg-sub, .rg-atlas-head h1 sup { display: none; }
  .rg-escape { top: 10px; right: 10px; padding: 8px 10px; }
  .rg-crumbs { top: 58px; left: 10px; right: 10px; transform: none; max-width: none; justify-content: flex-start;
    overflow-x: auto; scrollbar-width: none; }
  .rg-crumbs::-webkit-scrollbar { display: none; }
  .rg-search { top: 102px; left: 10px; right: 10px; width: auto; }

  /* the view/sound/dark strip moves off the top edge and rides above the slider */
  .rg-views { top: auto; bottom: 104px; left: 10px; right: auto; transform: none; grid-auto-flow: column; padding: 3px; }
  .rg-views button { width: 30px; height: 30px; }
  .rg-sound { top: auto !important; bottom: 104px; right: 10px; padding: 9px 10px; }
  .rg-dark-toggle { top: auto !important; bottom: 104px; right: 78px; }

  /* the slider owns the bottom edge; a sheet sits above the strip */
  .rg-explode { bottom: 8px; left: 10px; right: 10px; width: auto; transform: none; padding: 10px 62px 8px 14px; }
  .rg-explode-head { font-size: 12px; }
  .rg-systems, .rg-detail { left: 10px; right: 10px; top: auto; bottom: 150px; width: auto; max-height: min(46vh, 380px); overflow: auto; transform: none; }
  .rg-systems { width: auto; }
  .rg-systems.rg-collapsed { max-height: none; overflow: visible; }
  /* one sheet at a time: reading a part beats filtering while you read it */
  .rg-has-detail .rg-systems { display: none; }
  .rg-detail { padding: 16px 14px 18px; }
  .rg-detail h2 { font-size: 21px; }
  .rg-actions button { padding: 13px 12px; }
  .rg-chips button { padding: 9px 12px; }

  .rg-hints, .rg-credits-btn, .rg-tip { display: none; }
}

/* a phone in landscape has no vertical room for a sheet AND a slider */
@media (max-height: 460px) and (max-width: 900px) {
  .rg-systems, .rg-detail { max-height: 60vh; bottom: 150px; }
  .rg-caption { bottom: 12vh; } .rg-caption h2 { font-size: 24px; }
  .rg-crumbs { top: 52px; } .rg-search { top: 94px; }
}

/* last, so it wins on source order over the rules it disables */
@media (prefers-reduced-motion: reduce) {
  .rig .rg-caption { animation: none; }
  .rig .rg-hint { animation: none; }
  .rig .rg-load-mark { animation-duration: 3s; }
  .rig .rg-switch i { transition: none; }
}
`;

export default Rig;
