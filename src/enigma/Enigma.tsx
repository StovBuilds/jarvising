// jarvising.com/projects/enigma/live — ENIGMA. A scroll-driven teardown of the
// Enigma I (first shipped as jstov.uk/lab experiment 008, 2026-08-27): what it did,
// when it was built, and how it worked — the case lifts into six labelled
// layers (Kestrel-style), the middle rotor explodes into its own stack, one
// keypress is traced as glowing current, the rotors step like an odometer,
// and the final beat is a faithful, typeable Enigma I.
//
// QA: ?p=0.5 pins scroll progress (software-GL screenshots); window.__enigma
// exposes { press, progress } for driving the simulator headlessly.

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono";
import "@fontsource/special-elite";
import { buildMachine, ROWS, type MachineBuild, type PartsLib } from "./machine";
import { Enigma as EnigmaCipher } from "./cipher";
import { EnigmaAudio } from "./sound";
import { buildRoom } from "./room";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const SCROLL_VH = 1400;

// Exhibition / kiosk mode: ?kiosk=1 (optional &idle=<seconds>, default 60).
// Unattended loop, touch-first UI, no links out, fullscreen + wake-lock on the
// first touch, service worker for offline. ?p= still pins progress for setup.
const QS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const KIOSK = QS.get("kiosk") === "1";
const IDLE_MS = Math.max(3, Number(QS.get("idle") ?? 60)) * 1000;
const START_MS = Math.min(IDLE_MS, 8000);

// Scroll progress (0..1 over the page) → beat space. The machine choreography
// was authored against a seven-chapter timeline; two Bletchley chapters were
// added at 0.70–0.86 of the page, during which the machine holds the stepping
// beat (b 0.80→0.86) and the camera pulls back to take in the hut. Everything
// that moves the scene reads `b`; chapters, the rail and the ghost read `p`.
const toBeat = (p: number) =>
  p < 0.70 ? p * (0.80 / 0.70) : p < 0.86 ? 0.80 + ((p - 0.70) / 0.16) * 0.06 : p;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Chapter {
  from: number;
  to: number;
  ghost: string;
  kicker: string;
  head: string;
  body: string;
  specs?: [string, string][];
}

const CHAPTERS: Chapter[] = [
  {
    from: 0, to: 0.0875, ghost: "ENIGMA", kicker: "001 · THE MACHINE",
    head: "A secret\nin an oak box",
    body: "From 1926 to 1945, the German military poured its radio traffic through this device. Press a letter and a different one lights — and the scrambling changed with every single keypress. An estimated forty thousand or more of these boxes carried orders, U-boat positions and weather reports, all of it presumed unreadable. This one sits where it was read: a hut at Bletchley Park, on the night watch.",
  },
  {
    from: 0.0875, to: 0.21, ghost: "1918", kicker: "002 · THE TIMELINE",
    head: "Scherbius's\nslow-burn patent",
    body: "Arthur Scherbius patented the rotor cipher in February 1918 and spent the twenties failing to sell it to banks. Then the militaries arrived. Inside the lid, a printed card told the operator what he was holding — read it.",
    specs: [
      ["1918", "rotor cipher patented — A. Scherbius"],
      ["1923", "commercial Enigma exhibited"],
      ["1926", "Reichsmarine adopts it"],
      ["1930", "army model adds the plug board"],
      ["1932", "Rejewski reconstructs the wiring in Warsaw"],
      ["1938", "rotor choice grows to three-of-five"],
      ["1942", "U-boat M4 squeezes in a fourth rotor"],
    ],
  },
  {
    from: 0.21, to: 0.3675, ghost: "APART", kicker: "003 · THE ASSEMBLY",
    head: "Six layers,\nno mystery yet",
    body: "Lifted apart, it is an ordinary electric circuit: a battery, 26 switches under the keys, 26 torch bulbs behind the lamps, and wire. Every layer is honest. The deceit lives entirely in the copper.",
    specs: [
      ["01", "oak lid — instructions & spare bulbs"],
      ["02", "rotor basket — the scrambler"],
      ["03", "lamp panel — Lampenfeld"],
      ["04", "keyboard — Tastatur"],
      ["05", "plug board — Steckerbrett"],
      ["06", "oak case — ~12 kg carried"],
    ],
  },
  {
    from: 0.3675, to: 0.525, ghost: "ROTOR", kicker: "004 · THE ROTOR",
    head: "26 wires,\ncrossed on purpose",
    body: "Each Walze hides 26 wires crossing a bakelite core in a scrambled order — spring pins on one face, flat contacts on the other. Three in a row, each free to turn: 17,576 alignments before the geometry repeats, and the operator could rearrange or swap the wheels themselves.",
  },
  {
    from: 0.525, to: 0.6475, ghost: "CURRENT", kicker: "005 · THE PATH",
    head: "One keypress,\ntwice through",
    body: "Press T. The current detours through the plug board, threads all three rotors, strikes the reflector — and comes back through everything again before it lights a lamp. The reflector meant no letter could ever encrypt to itself. That tiny flaw became a crowbar at Bletchley Park.",
  },
  {
    from: 0.6475, to: 0.70, ghost: "STEP", kicker: "006 · THE STEP",
    head: "An odometer\nof chaos",
    body: "Every keypress ratchets the right rotor one notch before the current flows; at its turnover notch it kicks the middle wheel, which kicks the left. Same key, different lamp, every single time — the cipher alphabet died the moment it was used.",
    specs: [
      ["17,576", "rotor alignments"],
      ["60", "wheel orders — three of five"],
      ["150,738,274,937,250", "plug-board pairings"],
      ["≈1.6 × 10²⁰", "daily key space"],
    ],
  },
  {
    from: 0.70, to: 0.78, ghost: "HUT 6", kicker: "007 · BLETCHLEY",
    head: "A country house,\nand the huts",
    body: "In August 1939 the Government Code and Cypher School moved into a Victorian mansion fifty miles north of London and started building wooden huts on the lawn. Hut 6 took army and air-force Enigma; Hut 8, under Alan Turing, took the navy's. The Poles had handed Britain and France their reconstruction of the machine only weeks before, at a meeting outside Warsaw. By 1945 nearly nine thousand people worked here, three-quarters of them women, and almost none of them told anyone for thirty years.",
    specs: [
      ["1932", "Marian Rejewski breaks the wiring by pure mathematics"],
      ["Jul 1939", "Pyry meeting — Poland hands over its work"],
      ["Aug 1939", "GC&CS arrives at Bletchley Park"],
      ["Hut 6", "Heer & Luftwaffe traffic — Gordon Welchman"],
      ["Hut 8", "Kriegsmarine traffic — Alan Turing"],
      ["Flow", "Registration → Machine Room → Decoding → Hut 3"],
      ["1974", "the secret is finally published"],
    ],
  },
  {
    from: 0.78, to: 0.86, ghost: "BOMBE", kicker: "008 · THE BOMBE",
    head: "A machine\nto beat a machine",
    body: "You cannot try 10²⁰ keys by hand. Turing's bombe — built on a Polish idea, refined by Welchman's diagonal board — ran dozens of Enigmas in parallel against a crib: a guessed scrap of plaintext, a weather report, a routine sign-off. Because no letter could encrypt to itself, most guesses died instantly. The first bombe, Victory, arrived in March 1940; by the end some two hundred and ten had been built, tended around the clock by Wrens. Sir Harry Hinsley, the official historian of British intelligence, judged that reading Enigma shortened the war by not less than two years.",
    specs: [
      ["Mar 1940", "first bombe, Victory, installed"],
      ["Aug 1940", "diagonal board — the bombe comes good"],
      ["36", "Enigma equivalents per bombe"],
      ["~210", "bombes built by 1945"],
      ["Wrens", "the Women's Royal Naval Service ran them"],
    ],
  },
  {
    from: 0.86, to: 1.01, ghost: "TYPE", kicker: "009 · YOUR TURN",
    head: "Type.\nThe lamps answer",
    body: "A faithful Enigma I — rotors I·II·III at AAA, reflector B, ten plug pairs. Marian Rejewski broke this design on paper in 1932; Turing and Welchman's bombes broke it at scale. Type — and notice it never gives you your own letter back.",
  },
];

interface Callout {
  /** beat-space window */
  window: [number, number];
  label: string;
  sub: string;
  /** name of an anchor Object3D parented to the real mesh (machine.ts) */
  anchor: string;
}

const CALLOUTS: Callout[] = [
  { window: [0.15, 0.235], label: "ZUR BEACHTUNG!", sub: "the lid card says what it does", anchor: "lidText" },
  { window: [0.27, 0.41], label: "OAK LID", sub: "instructions · spare bulbs", anchor: "lid" },
  { window: [0.28, 0.41], label: "ROTOR BASKET", sub: "three Walzen + reflector", anchor: "rotorBasket" },
  { window: [0.28, 0.41], label: "LAMPENFELD", sub: "26 glow lamps", anchor: "lampPanel" },
  { window: [0.29, 0.41], label: "TASTATUR", sub: "26 sprung keys", anchor: "keyboard" },
  { window: [0.29, 0.41], label: "STECKERBRETT", sub: "the plug board", anchor: "plugboard" },
  { window: [0.47, 0.58], label: "THUMB WHEEL", sub: "sets the start position", anchor: "rt_wheel" },
  { window: [0.475, 0.58], label: "ALPHABET RING", sub: "A–Z round the rim", anchor: "rt_ring" },
  { window: [0.48, 0.58], label: "WIRING CORE", sub: "26 in · 26 out, scrambled", anchor: "rt_core" },
  { window: [0.485, 0.58], label: "CONTACT PINS", sub: "sprung, face to face", anchor: "rt_pins" },
  { window: [0.62, 0.72], label: "UMKEHRWALZE", sub: "the reflector — turns it back", anchor: "reflector" },
  { window: [0.836, 0.862], label: "BOMBE", sub: "108 drums · 36 Enigmas at once", anchor: "bombe" },
];

interface OrbitKey { p: number; theta: number; phi: number; r: number; tx: number; ty: number; tz: number; fov?: number }
const FOV = 38;
const ORBIT: OrbitKey[] = [
  { p: 0.0, theta: 2.2, phi: 1.22, r: 8.6, tx: 0, ty: 0.1, tz: 0 },
  { p: 0.1, theta: 1.28, phi: 1.0, r: 6.8, tx: 0, ty: 0.4, tz: 0 },
  { p: 0.175, theta: 1.55, phi: 1.13, r: 5.0, tx: 0.1, ty: 2.25, tz: -2.3 }, // reading the lid card
  { p: 0.235, theta: 1.05, phi: 0.9, r: 9.2, tx: 0, ty: 1.55, tz: 0 },
  { p: 0.34, theta: 1.8, phi: 0.86, r: 10.0, tx: 0, ty: 1.7, tz: 0 },
  { p: 0.45, theta: 1.35, phi: 1.08, r: 3.5, tx: 0.1, ty: 1.95, tz: 0.3 },
  { p: 0.57, theta: 0.85, phi: 1.22, r: 3.3, tx: 0.1, ty: 1.9, tz: 0.3 },
  { p: 0.63, theta: 1.5, phi: 0.92, r: 7.8, tx: 0, ty: 0.75, tz: 0 },
  { p: 0.74, theta: 1.5, phi: 0.55, r: 3.8, tx: 0.05, ty: 0.45, tz: -1.0 },
  { p: 0.79, theta: 1.5, phi: 0.55, r: 3.8, tx: 0.05, ty: 0.45, tz: -1.0 },
  { p: 0.815, theta: 2.25, phi: 1.2, r: 11.5, tx: -0.5, ty: 1.4, tz: -0.5 }, // the hut, machine stepping to itself
  { p: 0.833, theta: 2.15, phi: 1.28, r: 14.8, tx: 10.5, ty: 2.2, tz: 4, fov: 64 }, // 008: the whole bombe — it is a wardrobe, so go wide
  { p: 0.853, theta: 1.15, phi: 1.17, r: 7.4, tx: 13.0, ty: 2.4, tz: 4, fov: 46 },   // …pushing in on the drums
  { p: 0.875, theta: 1.95, phi: 1.08, r: 7.0, tx: 0, ty: 0.25, tz: 0.2 },
  { p: 1.0, theta: 1.3, phi: 1.14, r: 6.3, tx: 0, ty: 0.15, tz: 0.3 },
];

function sampleOrbit(p: number): OrbitKey {
  let i = 0;
  while (i < ORBIT.length - 2 && ORBIT[i + 1].p <= p) i++;
  const a = ORBIT[i], b = ORBIT[i + 1];
  const t = smooth(a.p, b.p, p);
  const fa = a.fov ?? FOV, fb = b.fov ?? FOV;
  return {
    p,
    fov: fa + (fb - fa) * t,
    theta: a.theta + (b.theta - a.theta) * t,
    phi: a.phi + (b.phi - a.phi) * t,
    r: a.r + (b.r - a.r) * t,
    tx: a.tx + (b.tx - a.tx) * t,
    ty: a.ty + (b.ty - a.ty) * t,
    tz: a.tz + (b.tz - a.tz) * t,
  };
}

interface TapeEntry { plain: string; cipher: string }

const Enigma = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const windowsRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "unsupported">("loading");
  const [chapterIdx, setChapterIdx] = useState(0);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const [auto, setAuto] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastMap, setLastMap] = useState("");
  const simRef = useRef(new EnigmaCipher());
  const litRef = useRef<{ ch: string; t: number } | null>(null);
  const keyAnimRef = useRef(new Map<string, number>());
  const progressRef = useRef(0);
  const demoRef = useRef({ press: "T", lamp: "?" });
  const audioRef = useRef<EnigmaAudio | null>(null);
  const autoRef = useRef(false);
  const tapeLenRef = useRef(0);
  const startKeyRef = useRef<[number, number, number]>([0, 0, 0]);
  const bridgeRef = useRef<{ spawnTrace: (press: string, lamp: string) => void; traceInfo?: () => unknown } | null>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const partsLibRef = useRef<string>("unknown");
  const [noAnim] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [attract, setAttract] = useState(false);
  const lastTouchRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  autoRef.current = auto;

  useEffect(() => {
    document.title = "ENIGMA — a teardown in scroll · jarvising";
  }, []);

  const simPress = useCallback((ch: string) => {
    const up = ch.toUpperCase();
    if (!/^[A-Z]$/.test(up)) return;
    if (tapeLenRef.current === 0) startKeyRef.current = [...simRef.current.positions] as [number, number, number];
    const out = simRef.current.press(up);
    litRef.current = { ch: out, t: performance.now() };
    keyAnimRef.current.set(up, performance.now());
    tapeLenRef.current += 1;
    setTape((t) => [...t.slice(-40), { plain: up, cipher: out }]);
    setLastMap(`${up} lights ${out}`);
    bridgeRef.current?.spawnTrace(up, out);
    const audio = audioRef.current;
    if (audio?.enabled) {
      audio.keyClack();
      audio.ratchet();
      window.setTimeout(() => audio.lampThunk(), 70);
    }
  }, []);

  const simReset = useCallback(() => {
    simRef.current.reset([0, 0, 0]);
    litRef.current = null;
    tapeLenRef.current = 0;
    startKeyRef.current = [0, 0, 0];
    setTape([]);
  }, []);

  const setKeyAt = useCallback((i: number, d: number) => {
    const p = simRef.current.positions;
    p[i] = ((p[i] + d) % 26 + 26) % 26;
    litRef.current = null;
    tapeLenRef.current = 0;
    setTape([]);
  }, []);

  const shareSecret = useCallback((entries: TapeEntry[]) => {
    const key = startKeyRef.current.map((p) => String.fromCharCode(65 + p)).join("");
    const msg = entries.map((e) => e.cipher).join("").slice(0, 64);
    const url = `${window.location.origin}/projects/enigma/live/?key=${key}&msg=${msg}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }, []);

  const toggleSound = useCallback(() => {
    if (!audioRef.current) audioRef.current = new EnigmaAudio();
    setSoundOn(audioRef.current.toggle());
  }, []);

  useEffect(() => {
    let dead = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    const clock = new THREE.Clock();
    let progress = 0;
    let lastChapter = -1;
    let build: MachineBuild | null = null;
    const pointer = { x: 0, y: 0 };
    let stepTimer = 0;
    const stepSim = new EnigmaCipher();
    const rotorHome = new THREE.Vector3();
    const rotorStage = new THREE.Vector3(0.1, 1.75, 0.55);
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), new THREE.MeshBasicMaterial({ color: "#ffd9a0", depthTest: false, transparent: true }));
    pulse.renderOrder = 31;
    pulse.visible = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let prevLid = 0;
    let dust: THREE.Points | null = null;
    let dustBase: Float32Array | null = null;
    const liveTrace: { fwd: THREE.Mesh | null; ret: THREE.Mesh | null; t0: number; cf: THREE.CatmullRomCurve3 | null; cr: THREE.CatmullRomCurve3 | null } = { fwd: null, ret: null, t0: 0, cf: null, cr: null };
    const killTrace = () => {
      for (const k of ["fwd", "ret"] as const) {
        liveTrace[k]?.geometry.dispose();
        ((liveTrace[k]?.material as THREE.Material) ?? null)?.dispose();
        liveTrace[k]?.removeFromParent();
        liveTrace[k] = null;
      }
    };

    let loadBombe: (() => void) | null = null;
    const drumSets: { mesh: THREE.InstancedMesh; rest: Float32Array; ys: number[]; row?: number[] }[] = [];
    let drumAngle = 0;
    const drumM = new THREE.Matrix4(), drumR = new THREE.Matrix4();
    const forced = parseFloat(new URLSearchParams(window.location.search).get("p") ?? "");
    const targetProgress = () => {
      if (!Number.isNaN(forced)) return Math.min(1, Math.max(0, forced));
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    // The Blender parts library replaces the machine's primitives when it
    // arrives; primitives remain the fallback (slow network, blocked file).
    // Quantised GLBs carry the dequantise transform on the NODE, so bake each
    // mesh's world matrix into the geometry before handing it over.
    const loadParts = (): Promise<PartsLib | undefined> => new Promise((resolve) => {
      const done = (v?: PartsLib) => { clearTimeout(timer); resolve(v); };
      const timer = window.setTimeout(() => done(undefined), 6000);
      new GLTFLoader().load("/models/enigma.glb", (gltf) => {
        const lib: PartsLib = new Map();
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const g = m.geometry.clone();
          // positions must be float before the bake: a normalised-int attribute
          // clamps at 1.0 and silently flattens anything larger than a unit
          const p = g.attributes.position;
          if (!(p.array instanceof Float32Array)) {
            const f = new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
            for (let i = 0; i < p.count; i++) f.setXYZ(i, p.getX(i), p.getY(i), p.getZ(i));
            g.setAttribute("position", f);
          }
          g.applyMatrix4(m.matrixWorld);
          lib.set(m.name, g);
        });
        done(lib);
      }, undefined, () => done(undefined));
    });

    let partsLib: PartsLib | undefined;
    (async () => {
      try {
        const [, lib] = await Promise.all([
          Promise.all([
            document.fonts.load("700 40px 'Space Grotesk'"),
            document.fonts.load("400 14px 'JetBrains Mono'"),
            document.fonts.load("400 16px 'Special Elite'"),
            document.fonts.ready,
          ]),
          loadParts(),
        ]);
        partsLib = lib;
        partsLibRef.current = lib ? `library:${lib.size}` : "primitives";
      } catch { /* fallback stacks hold */ }
      if (dead || !stageRef.current) return;
      let gl: WebGLRenderingContext | null = null;
      try { gl = document.createElement("canvas").getContext("webgl"); } catch { /* none */ }
      if (!gl) {
        setPhase("unsupported");
        return;
      }
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const shadows = window.innerWidth >= 900 && !reduced;
      renderer.shadowMap.enabled = shadows;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      stageRef.current.appendChild(renderer.domElement);

      // the hut: a night watch in Hut 6. One pendant over the desk is the key
      // light; a slit of moonlight past the blackout is the rim.
      const room = buildRoom();
      scene.add(room.root);
      scene.fog = new THREE.Fog("#0b0b0d", 9, 34);
      const key = new THREE.SpotLight("#ffe9c4", 280, 40, 0.82, 0.7, 1.6);
      key.position.copy(room.lampPos);
      key.target.position.set(0, -0.5, 0.3);
      scene.add(key, key.target);
      if (shadows) {
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.bias = -0.0004;
        key.shadow.normalBias = 0.02;
        key.shadow.camera.near = 1;
        key.shadow.camera.far = 30;
        for (const m of room.receivers) m.receiveShadow = true;
      }
      // second pendant over the bombe: no shadows, just enough to read the drums
      const lamp2 = new THREE.PointLight("#ffe2b0", 60, 22, 1.8);
      lamp2.position.copy(room.lampPos2);
      scene.add(lamp2);
      const rim = new THREE.DirectionalLight("#8fa8d8", 1.3);
      rim.position.copy(room.moonDir);
      scene.add(rim);
      scene.add(new THREE.AmbientLight("#3c3a38", 0.9));
      // cool spill from the blackout slit so the back wall reads at all
      const moon = new THREE.PointLight("#6f86b8", 7, 16, 2);
      moon.position.set(-6.6, 3.6, -5.2);
      scene.add(moon);
      const fill = new THREE.PointLight("#ffd9a4", 16, 24, 2);
      fill.position.set(0, 2.2, 5);
      scene.add(fill);

      build = buildMachine(partsLib);
      scene.add(build.root);
      if (shadows) build.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });

      // The bombe is a Blender-built GLB (tools/blender/bombe.py), the first
      // non-procedural asset in the piece. It is only needed from chapter 007,
      // so it loads once the reader is past the rotor beat; a callout anchor
      // is registered up front so the label works the moment it appears.
      const bombeAnchor = new THREE.Object3D();
      bombeAnchor.position.copy(room.bombeSlot.position).add(new THREE.Vector3(-2.8, 9.5, -1.5));
      scene.add(bombeAnchor);
      build.anchors.set("bombe", bombeAnchor);
      // Room props (tools/blender/props.py): small, so they load right after
      // first paint; runtime materials by part name, like the machine.
      {
        const propMats: Record<string, THREE.Material> = {
          telephone: new THREE.MeshStandardMaterial({ color: "#151315", roughness: 0.25, metalness: 0.05 }),
          typewriter: new THREE.MeshStandardMaterial({ color: "#2f3a33", roughness: 0.7, metalness: 0.3 }),
          stove: new THREE.MeshStandardMaterial({ color: "#17181a", roughness: 0.6, metalness: 0.55 }),
          coat: new THREE.MeshStandardMaterial({ color: "#4a4636", roughness: 1.0, metalness: 0.0 }),
        };
        new GLTFLoader().load("/models/props.glb", (gltf) => {
          if (dead) return;
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const slot = room.propSlots[m.name];
            if (!slot) return;
            const mesh = new THREE.Mesh(m.geometry, propMats[m.name] ?? new THREE.MeshStandardMaterial({ color: "#333" }));
            mesh.position.copy(slot.position);
            mesh.rotation.y = slot.rotationY;
            mesh.castShadow = shadows; mesh.receiveShadow = shadows;
            scene.add(mesh);
          });
        }, undefined, () => { /* dressing only */ });
      }

      let bombeRequested = false;
      loadBombe = () => {
        if (bombeRequested) return;
        bombeRequested = true;
        new GLTFLoader().load("/models/bombe.glb", (gltf) => {
          if (dead) return;
          const g = gltf.scene;
          g.position.copy(room.bombeSlot.position);
          g.rotation.y = room.bombeSlot.rotationY;
          g.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) { m.castShadow = shadows; m.receiveShadow = shadows; }
            const im = o as THREE.InstancedMesh;
            if (im.isInstancedMesh) {
              // one InstancedMesh per drum colour; remember each drum's rest
              // matrix and which row of its bank it sits in (0 = top = fast)
              const rest = new Float32Array(im.instanceMatrix.array);
              const ys: number[] = [];
              const mtx = new THREE.Matrix4(), pos = new THREE.Vector3();
              for (let i = 0; i < im.count; i++) { mtx.fromArray(rest, i * 16); pos.setFromMatrixPosition(mtx); ys.push(pos.y); }
              drumSets.push({ mesh: im, rest, ys });
            }
          });
          // rows: nine distinct heights, top first; row-in-bank = index % 3
          const allY = [...new Set(drumSets.flatMap((d) => d.ys.map((y) => Math.round(y * 10) / 10)))].sort((a, b2) => b2 - a);
          for (const d of drumSets) d.row = d.ys.map((y) => allY.indexOf(Math.round(y * 10) / 10) % 3);
          scene.add(g);
        }, undefined, () => { /* no bombe: the chapter still reads from the copy */ });
      };
      build.root.add(pulse);
      demoRef.current = build.demo;
      rotorHome.copy(build.rotor1.position);

      // dust motes in the key light
      {
        const N = 220;
        const arr = new Float32Array(N * 3);
        dustBase = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          arr[i * 3] = (Math.random() - 0.5) * 9;
          arr[i * 3 + 1] = Math.random() * 6;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 9;
          dustBase.set(arr.subarray(i * 3, i * 3 + 3), i * 3);
        }
        const dg = new THREE.BufferGeometry();
        dg.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        const dc = document.createElement("canvas");
        dc.width = dc.height = 32;
        const dctx = dc.getContext("2d")!;
        const dgrad = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        dgrad.addColorStop(0, "rgba(255,240,210,0.9)");
        dgrad.addColorStop(1, "rgba(255,240,210,0)");
        dctx.fillStyle = dgrad;
        dctx.fillRect(0, 0, 32, 32);
        dust = new THREE.Points(dg, new THREE.PointsMaterial({
          map: new THREE.CanvasTexture(dc), size: 0.025, transparent: true, opacity: 0.32,
          depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
        }));
        scene.add(dust);
      }

      // live per-keypress current trace (sim beat)
      bridgeRef.current = {
        spawnTrace: (press: string, lampCh: string) => {
          if (!build || progressRef.current < 0.84) return;
          killTrace();
          const curves = build.trace(press, lampCh, 0);
          const mk = (curve: THREE.CatmullRomCurve3, color: string) => {
            const m = new THREE.Mesh(
              new THREE.TubeGeometry(curve, 160, 0.03, 6),
              // depthTest off: the machine is assembled here, so the current
              // reads as an x-ray glow through the case
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
            );
            m.renderOrder = 30;
            m.geometry.setDrawRange(0, 0);
            build!.root.add(m);
            return m;
          };
          liveTrace.fwd = mk(curves.fwd, "#ffb84d");
          liveTrace.ret = mk(curves.ret, "#ff5a3c");
          liveTrace.cf = curves.fwd;
          liveTrace.cr = curves.ret;
          liveTrace.t0 = performance.now();
        },
        traceInfo: () => {
          if (!liveTrace.fwd) return "no-trace";
          return {
            age: performance.now() - liveTrace.t0,
            draw: liveTrace.fwd.geometry.drawRange.count,
            total: liveTrace.fwd.geometry.index?.count,
            opacity: (liveTrace.fwd.material as THREE.MeshBasicMaterial).opacity,
            parented: !!liveTrace.fwd.parent,
            visible: liveTrace.fwd.visible,
            p0: liveTrace.cf?.getPointAt(0.05).toArray(),
            pulseVis: pulse.visible,
            pulsePos: pulse.position.toArray(),
            rootPos: build!.root.position.toArray(),
          };
        },
      };

      const resize = () => {
        if (!renderer) return;
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);
      setPhase("ready");
      loop();
      return () => window.removeEventListener("resize", resize);
    })();

    const project = new THREE.Vector3();

    function loop() {
      if (dead || !build) return;
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta(); // before elapsedTime — getElapsedTime would zero it
      const t = clock.elapsedTime;
      if (autoRef.current) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.min(max, window.scrollY + (max * dt) / 80));
        if (window.scrollY >= max - 1) { setAuto(false); lastTouchRef.current = performance.now(); }
      }
      if (!Number.isNaN(forced)) progress = forced;
      else progress += (targetProgress() - progress) * 0.08;
      const b = toBeat(progress);
      progressRef.current = b;
      if (b > 0.55 && loadBombe) { loadBombe(); loadBombe = null; }

      // explode envelope: full at assembly → 0.15 for the rotor beat →
      // 0.35 for the path beat (tubes are built for exactly that) → 0
      const e = smooth(0.25, 0.34, b)
        - smooth(0.42, 0.47, b) * 0.85
        + smooth(0.58, 0.62, b) * 0.2
        - smooth(0.72, 0.78, b) * 0.35;
      for (const [name, part] of build.parts) {
        const pe = Math.max(0, Math.min(1, e * (1 + part.lag) - part.lag));
        part.obj.position.copy(part.base).addScaledVector(part.dir, pe);
        // the plug board tilts its face toward the high camera as it separates
        if (name === "plugboard") part.obj.rotation.x = -0.35 * pe;
      }

      // lid opens through the timeline beat
      const lidA = smooth(0.1, 0.2, b);
      build.lidPivot.rotation.x = -1.95 * lidA;
      if (lidA > 0.03 && prevLid <= 0.03) audioRef.current?.creak();
      prevLid = lidA;
      audioRef.current?.setMorse(b < 0.1);

      // rotor solo — the machine slides offstage; the rotor holds a fixed
      // world pose (compensating for the root shift and basket explode)
      const solo = smooth(0.44, 0.5, b) * (1 - smooth(0.56, 0.61, b));
      build.root.position.z = -1.5 * solo;
      build.root.position.x = -9.5 * solo; // slides off to the left, out of frame (not through the back wall)
      const basketObj = build.parts.get("rotorBasket")!.obj;
      const stageLocal = rotorStage.clone().sub(build.root.position).sub(basketObj.position);
      build.rotor1.position.lerpVectors(rotorHome, stageLocal, solo);
      if (solo > 0.01) build.rotor1.rotation.x += dt * 0.5 * solo;
      const sub = smooth(0.475, 0.53, b) * (1 - smooth(0.55, 0.6, b));
      for (const part of build.rotorSub.values()) {
        part.obj.position.copy(part.base).addScaledVector(part.dir, sub);
      }

      // signal path
      const f1 = smooth(0.615, 0.665, b);
      const f2 = smooth(0.668, 0.715, b);
      const inPath = b > 0.6 && b < 0.745;
      build.pathFwd.visible = inPath && f1 > 0.001;
      build.pathRet.visible = inPath && f2 > 0.001;
      const setRange = (mesh: THREE.Mesh, frac: number) => {
        const idx = (mesh.geometry as THREE.BufferGeometry).index;
        if (idx) mesh.geometry.setDrawRange(0, Math.floor(idx.count * Math.min(1, frac)));
      };
      setRange(build.pathFwd, f1);
      setRange(build.pathRet, f2);
      pulse.visible = inPath && (f1 > 0.01 && f1 < 1 || f2 > 0.01 && f2 < 1);
      if (pulse.visible) {
        const curve = f1 < 1 ? build.curveFwd : build.curveRet;
        const frac = f1 < 1 ? f1 : f2;
        curve.getPointAt(Math.min(0.999, frac), pulse.position);
      }
      if (inPath && f2 >= 1) {
        const lamp = build.lamps.get(build.demo.lamp);
        if (lamp) { lamp.mat.emissiveIntensity = 2.2; lamp.glow.material.opacity = 0.85; }
      } else if (b < 0.84) {
        const lamp = build.lamps.get(build.demo.lamp);
        if (lamp) { lamp.mat.emissiveIntensity = 0; lamp.glow.material.opacity = 0; }
      }

      // stepping beat: the machine types to itself
      const inStep = b > 0.745 && b < 0.86;
      if (inStep) {
        stepTimer += dt;
        if (stepTimer > 0.55) {
          stepTimer = 0;
          stepSim.press("A");
          audioRef.current?.ratchet();
        }
      }
      // live sim positions elsewhere; stepping beat shows stepSim's
      const positions = inStep ? stepSim.positions : simRef.current.positions;
      build.rotors.forEach((rg, i) => {
        const target = -(positions[i] / 26) * Math.PI * 2;
        if (i === 1 && solo > 0.01) return; // solo rotor spins freely
        const cur = rg.rotation.x % (Math.PI * 2);
        let d = target - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        rg.rotation.x = cur + d * Math.min(1, dt * 10);
      });

      // sim lamps + key presses
      const lit = litRef.current;
      if (lit) {
        const age = (performance.now() - lit.t) / 900;
        const lamp = build.lamps.get(lit.ch);
        if (lamp) {
          // incandescent: fast filament warm-up, slow cool-off
          const k = age < 1 ? Math.min(1, age * 7) ** 0.5 * (1 - smooth(0.45, 1, age)) : 0;
          lamp.mat.emissiveIntensity = 2.4 * k;
          lamp.glow.material.opacity = 0.9 * k;
        }
        if (age >= 1) litRef.current = null;
      }
      for (const [ch, t0] of keyAnimRef.current) {
        const age = (performance.now() - t0) / 260;
        const keyG = build.keys.get(ch);
        if (keyG) keyG.position.y = age < 1 ? -0.045 * Math.sin(Math.min(1, age) * Math.PI) : 0;
        if (age >= 1) keyAnimRef.current.delete(ch);
      }

      // live trace sweep: forward, then return, then fade
      if (liveTrace.fwd && liveTrace.ret) {
        const age = (performance.now() - liveTrace.t0) / 1000;
        const f = Math.min(1, age / 0.55);
        const r2 = Math.max(0, Math.min(1, (age - 0.57) / 0.55));
        setRange(liveTrace.fwd, f);
        setRange(liveTrace.ret, r2);
        const fade = age > 1.8 ? Math.max(0, 1 - (age - 1.8) / 0.8) : 1;
        (liveTrace.fwd.material as THREE.MeshBasicMaterial).opacity = 0.95 * fade;
        (liveTrace.ret.material as THREE.MeshBasicMaterial).opacity = 0.95 * fade;
        if (liveTrace.cf && liveTrace.cr && age < 1.15) {
          pulse.visible = true;
          const curve = f < 1 ? liveTrace.cf : liveTrace.cr;
          const frac = f < 1 ? f : r2;
          curve.getPointAt(Math.min(0.999, Math.max(0.001, frac)), pulse.position);
        }
        if (fade <= 0) {
          killTrace();
          pulse.visible = false;
        }
      }

      // the bombe runs while the hut chapters play: top drum of each stack
      // spins, the middle steps once per revolution, the bottom sits still
      if (drumSets.length && b > 0.79 && !reduced) {
        drumAngle += dt * 7;
        const midAngle = Math.floor(drumAngle / (Math.PI * 2)) * (Math.PI * 2 / 26);
        for (const d of drumSets) {
          for (let i = 0; i < d.mesh.count; i++) {
            const r = d.row?.[i] ?? 2;
            if (r === 2) continue;
            drumM.fromArray(d.rest, i * 16);
            drumR.makeRotationY(r === 0 ? drumAngle : midAngle); // the shared drum mesh's own axis is Y
            drumM.multiply(drumR);
            d.mesh.setMatrixAt(i, drumM);
          }
          d.mesh.instanceMatrix.needsUpdate = true;
        }
      }

      // dust drift
      if (dust && dustBase && !reduced) {
        const dp = dust.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < dp.count; i++) {
          dp.setXYZ(
            i,
            dustBase[i * 3] + Math.sin(t * 0.1 + i) * 0.3,
            dustBase[i * 3 + 1] + Math.cos(t * 0.06 + i * 1.7) * 0.24,
            dustBase[i * 3 + 2] + Math.sin(t * 0.045 + i * 0.9) * 0.2,
          );
        }
        dp.needsUpdate = true;
      }

      // camera
      const o = sampleOrbit(b);
      const spin = !reduced && b < 0.06 ? t * 0.1 : 0;
      const theta = o.theta + spin + pointer.x * 0.08;
      const phi = Math.max(0.3, Math.min(2.4, o.phi + pointer.y * 0.06));
      camera.position.set(
        Math.sin(phi) * Math.cos(theta) * o.r,
        Math.cos(phi) * o.r,
        Math.sin(phi) * Math.sin(theta) * o.r,
      );
      camera.lookAt(o.tx, o.ty, o.tz);
      if (Math.abs(camera.fov - (o.fov ?? FOV)) > 0.01) { camera.fov = o.fov ?? FOV; camera.updateProjectionMatrix(); }
      build.root.position.y = -2.2 * solo; // sits on the desk
      renderer!.render(scene, camera);

      // HUD
      if (readoutRef.current) {
        let txt: string;
        if (inPath) txt = `${build.demo.press} → ${build.demo.lamp}  ·  LIVE TRACE`;
        else if (inStep) txt = `WINDOW  ${positions.map((p) => String.fromCharCode(65 + p)).join(" ")}`;
        else if (b > 0.86) txt = `ROTORS  ${simRef.current.positions.map((p) => String.fromCharCode(65 + p)).join(" ")}`;
        else if (e > 0.01) txt = `EXPLODE  ${(e * 100).toFixed(0)}%`;
        else txt = `ORBIT  ${(((theta * 57.3) % 360 + 360) % 360).toFixed(0)}°`;
        if (readoutRef.current.textContent !== txt) readoutRef.current.textContent = txt;
      }
      if (windowsRef.current) {
        const show = b > 0.86;
        windowsRef.current.style.opacity = show ? "1" : "0";
        if (show) {
          const txt = simRef.current.positions.map((p) => String.fromCharCode(65 + p)).join("");
          if (windowsRef.current.dataset.pos !== txt) {
            windowsRef.current.dataset.pos = txt;
            windowsRef.current.querySelectorAll(".en-letter").forEach((el, i) => { el.textContent = txt[i]; });
          }
        }
      }
      if (railFillRef.current) railFillRef.current.style.height = `${progress * 100}%`;
      if (ghostRef.current) {
        const ch = CHAPTERS.find((c) => progress >= c.from && progress < c.to);
        const txt = ch?.ghost ?? "";
        if (ghostRef.current.textContent !== txt) ghostRef.current.textContent = txt;
      }

      // callouts: anchors live on the real meshes, so they track explode,
      // hinge and rotor moves for free. Labels sit 120px to the near side,
      // are clamped inside the viewport and away from the copy block / HUD,
      // and are pushed apart when two land on top of each other.
      if (svgRef.current && labelHost.current) {
        const w = window.innerWidth, h = window.innerHeight;
        const kids = labelHost.current.children;
        const narrow = w < 720;
        const placed: { el: HTMLDivElement; sx: number; sy: number; lx: number; ly: number; left: boolean; vis: number; wpx: number; hpx: number }[] = [];
        CALLOUTS.forEach((c, i) => {
          const el = kids[i] as HTMLDivElement;
          const vis = smooth(c.window[0], c.window[0] + 0.02, b) * (1 - smooth(c.window[1] - 0.02, c.window[1], b));
          const a = build!.anchors.get(c.anchor);
          if (vis <= 0.02 || !a) { el.style.opacity = "0"; return; }
          a.getWorldPosition(project);
          project.project(camera);
          if (project.z > 1 || Math.abs(project.x) > 1.3 || Math.abs(project.y) > 1.3) { el.style.opacity = "0"; return; }
          const sx = (project.x * 0.5 + 0.5) * w;
          const sy = (-project.y * 0.5 + 0.5) * h;
          const left = sx < w / 2;
          const wpx = el.offsetWidth, hpx = el.offsetHeight;
          const gap = narrow ? 56 : 120;
          let lx = left ? sx - gap - wpx : sx + gap;
          let ly = sy - 42;
          const pad = 16, top = narrow ? 70 : 100;
          const bottomLimit = narrow ? h - 330 : left ? h - 430 : h - 130;
          lx = Math.min(Math.max(lx, pad), w - pad - wpx);
          ly = Math.min(Math.max(ly, top), bottomLimit - hpx);
          el.classList.toggle("left", left);
          placed.push({ el, sx, sy, lx, ly, left, vis, wpx, hpx });
        });
        for (const side of [true, false]) {
          const list = placed.filter((q) => q.left === side).sort((q1, q2) => q1.ly - q2.ly);
          for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1], cur = list[i];
            const xOverlap = cur.lx < prev.lx + prev.wpx + 12 && prev.lx < cur.lx + cur.wpx + 12;
            if (xOverlap && cur.ly < prev.ly + prev.hpx + 10) cur.ly = prev.ly + prev.hpx + 10;
          }
        }
        let svg = "";
        for (const q of placed) {
          q.el.style.opacity = String(q.vis);
          q.el.style.transform = `translate(${q.lx}px, ${q.ly}px)`;
          const ex = q.left ? q.lx + q.wpx + 8 : q.lx - 8;
          const ey = q.ly + 14;
          svg += `<line x1="${q.sx}" y1="${q.sy}" x2="${ex}" y2="${ey}" stroke="rgba(217,164,65,${0.6 * q.vis})" stroke-width="1"/>` +
            `<circle cx="${q.sx}" cy="${q.sy}" r="2.8" fill="#d9a441" opacity="${q.vis}"/>`;
        }
        svgRef.current.innerHTML = svg;
      }

      const idx = CHAPTERS.findIndex((c) => progress >= c.from && progress < c.to);
      if (idx !== lastChapter && idx >= 0) {
        lastChapter = idx;
        setChapterIdx(idx);
      }
    }

    const onPointer = (ev: PointerEvent) => {
      pointer.x = (ev.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (ev.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      killTrace();
      audioRef.current?.dispose();
      audioRef.current = null;
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial;
          mat.map?.dispose();
          mat.emissiveMap?.dispose();
          mat.dispose();
        }
      });
      renderer?.dispose();
      renderer?.domElement.remove();
      window.scrollTo(0, 0);
    };
  }, []);

  // physical keyboard drives the simulator in the final beat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (progressRef.current < 0.84) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        simPress(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [simPress]);

  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const g = c.getContext("2d")!;
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (grainRef.current) grainRef.current.style.backgroundImage = `url(${c.toDataURL()})`;
  }, []);

  useEffect(() => {
    const touch = (ev?: Event) => {
      lastTouchRef.current = performance.now();
      const t = ev?.target as HTMLElement | null;
      if (autoRef.current && !(t && t.closest && t.closest(".en-controls"))) setAuto(false);
    };
    const cancel = () => touch();
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("touchstart", touch, { passive: true });
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("touchstart", touch);
      window.removeEventListener("keydown", touch);
    };
  }, []);

  // kiosk: attract loop, fullscreen + wake-lock on first touch, service worker
  useEffect(() => {
    if (!KIOSK || phase !== "ready") return;
    let lock: { release: () => Promise<void> } | null = null;
    const tick = window.setInterval(() => {
      const idle = performance.now() - lastTouchRef.current;
      const atTop = progressRef.current < 0.02;
      if (!autoRef.current && atTop && idle > START_MS) {
        // sitting at the title: start the film
        setAttract(false);
        setAuto(true);
      } else if (!autoRef.current && !atTop && idle > IDLE_MS) {
        // abandoned mid-way (or the film finished and held): back to the top, then run again
        simReset();
        window.scrollTo({ top: 0, behavior: "smooth" });
        lastTouchRef.current = performance.now() - START_MS + 1500; // film restarts ~1.5 s after arriving
      }
      setAttract(!autoRef.current && atTop && idle > 1500);
    }, 500);
    const firstTouch = async () => {
      window.removeEventListener("pointerdown", firstTouch);
      try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); } catch { /* not allowed here */ }
      try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* unsupported */ }
    };
    window.addEventListener("pointerdown", firstTouch);
    const onVis = () => { if (document.visibilityState === "visible" && !lock) firstTouch(); };
    document.addEventListener("visibilitychange", onVis);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/projects/enigma/" }).catch(() => { /* offline support is best-effort */ });
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("pointerdown", firstTouch);
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => { /* fine */ });
    };
  }, [phase, simReset]);

  // arriving with ?key=ABC&msg=CIPHER: set the key, ride to the machine, and
  // type the ciphertext — Enigma is reciprocal, so the plaintext comes out
  useEffect(() => {
    if (phase !== "ready") return;
    const q = new URLSearchParams(window.location.search);
    const msg = (q.get("msg") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 64);
    if (!msg) return;
    const key = ((q.get("key") ?? "").toUpperCase().replace(/[^A-Z]/g, "") + "AAA").slice(0, 3);
    simRef.current.reset([key.charCodeAt(0) - 65, key.charCodeAt(1) - 65, key.charCodeAt(2) - 65]);
    tapeLenRef.current = 0;
    setTape([]);
    const scrollT = window.setTimeout(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: max * 0.94, behavior: "smooth" });
    }, 800);
    let i = 0;
    let typer = 0;
    const startT = window.setTimeout(() => {
      typer = window.setInterval(() => {
        if (i >= msg.length) {
          clearInterval(typer);
          return;
        }
        simPress(msg[i]);
        i += 1;
      }, 200);
    }, 3200);
    return () => {
      clearTimeout(scrollT);
      clearTimeout(startT);
      if (typer) clearInterval(typer);
    };
  }, [phase, simPress]);

  useEffect(() => {
    (window as unknown as { __enigma?: object }).__enigma = {
      press: simPress,
      parts: () => partsLibRef.current,
      kiosk: () => ({ on: KIOSK, idleMs: IDLE_MS, auto: autoRef.current, idle: performance.now() - lastTouchRef.current }),
      reset: simReset,
      progress: () => progressRef.current,
      trace: () => bridgeRef.current?.traceInfo?.(),
    };
  }, [simPress, simReset]);

  const ch = CHAPTERS[chapterIdx];
  const showSim = chapterIdx === CHAPTERS.length - 1;

  return (
    <div className={`enigma ${showSim ? "sim-on" : ""} ${noAnim ? "no-anim" : ""} ${KIOSK ? "kiosk" : ""}`}>
      <style>{CSS}</style>
      <div className="en-spacer" style={{ height: `${SCROLL_VH}vh` }} />
      <div ref={ghostRef} className="en-ghost">ENIGMA</div>
      <div ref={stageRef} className="en-stage" />
      <div ref={grainRef} className="en-grain" aria-hidden="true" />
      <div className="en-vignette" aria-hidden="true" />
      <div className="en-sr" aria-live="polite">{lastMap}</div>
      <svg ref={svgRef} className="en-lines" />

      {phase === "loading" && (
        <div className="en-loading"><span>ENIGMA</span><p>winding the rotors…</p></div>
      )}
      {phase === "unsupported" && (
        <div className="en-fallback">
          <h1>ENIGMA</h1>
          <p>This teardown needs WebGL. The chapters it would run:</p>
          <ol>{CHAPTERS.map((c) => <li key={c.kicker}>{c.kicker} — {c.head.replace("\n", " ")}</li>)}</ol>
          {!KIOSK && <a href="/projects/enigma/">← back to the entry</a>}
        </div>
      )}

      {phase === "ready" && (
        <>
          <header className="en-chrome">
            <span className="en-brand">ENIGMA <em>I</em></span>
            <span className="en-series">CHIFFRIERMASCHINE · 1918–1945</span>
            <span className="en-cta">GEHEIM</span>
          </header>
          {!KIOSK && <a href="/projects/enigma/" className="en-escape">← jarvising · 001</a>}
          <div ref={readoutRef} className="en-readout">ORBIT 0°</div>

          <section className="en-copy" key={chapterIdx}>
            <span className="en-kicker">{ch.kicker}</span>
            <h2>{ch.head.split("\n").map((l) => <span key={l}>{l}<br /></span>)}</h2>
            <p>{ch.body}</p>
            {ch.specs && (
              <table className="en-specs"><tbody>
                {ch.specs.map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ))}
              </tbody></table>
            )}
          </section>

          {showSim && (
            <div className="en-sim">
              <div ref={windowsRef} className="en-windows" data-pos="AAA">
                <label>FENSTER</label>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="en-win">
                    <button aria-label={`rotor ${i + 1} forward`} onClick={() => setKeyAt(i, 1)}>▴</button>
                    <span className="en-letter">A</span>
                    <button aria-label={`rotor ${i + 1} back`} onClick={() => setKeyAt(i, -1)}>▾</button>
                  </span>
                ))}
                <button className="en-reset" onClick={simReset}>RESET</button>
              </div>
              <div className="en-tape">
                {tape.length === 0 ? (
                  <em>type on your keyboard — or tap below</em>
                ) : (
                  <>
                    <div className="en-tape-row">{tape.map((e2, i) => <b key={i}>{e2.plain}</b>)}</div>
                    <div className="en-tape-row en-tape-out">{tape.map((e2, i) => <b key={i}>{e2.cipher}</b>)}</div>
                  </>
                )}
              </div>
              {tape.length > 0 && !KIOSK && (
                <button className="en-share" onClick={() => shareSecret(tape)}>
                  {copied ? "COPIED — SEND IT TO SOMEONE" : "COPY SECRET LINK"}
                </button>
              )}
              <div className="en-keys">
                {ROWS.map((row) => (
                  <div key={row} className="en-keyrow">
                    {[...row].map((c) => (
                      <button key={c} onClick={() => simPress(c)}>{c}</button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={labelHost} className="en-labels">
            {CALLOUTS.map((c) => (
              <div key={c.label} className="en-label">
                <strong>{c.label}</strong><span>{c.sub}</span>
              </div>
            ))}
          </div>

          <div className="en-rail">
            {CHAPTERS.map((c) => (
              <button
                key={c.kicker}
                className={`en-tick ${ch === c ? "on" : ""}`}
                style={{ top: `${((c.from + Math.min(c.to, 1)) / 2) * 100}%` }}
                title={c.kicker}
                onClick={() => {
                  const max = document.documentElement.scrollHeight - window.innerHeight;
                  window.scrollTo({ top: (c.from + 0.01) * max, behavior: "smooth" });
                }}
              />
            ))}
            <div className="en-rail-track"><div ref={railFillRef} className="en-rail-fill" /></div>
          </div>
          <div className="en-controls">
            {!KIOSK && <button className={auto ? "on" : ""} onClick={() => setAuto((a) => !a)}>{auto ? "■ HOLD" : "▶ RUN FILM"}</button>}
            <button className={soundOn ? "on" : ""} onClick={toggleSound}>{soundOn ? "♪ SOUND ON" : "♪ SOUND OFF"}</button>
          </div>
          {KIOSK ? (
            <>
              <nav className="en-chapters" aria-label="Chapters">
                {CHAPTERS.map((c, i) => (
                  <button
                    key={c.kicker}
                    className={ch === c ? "on" : ""}
                    onClick={() => {
                      setAuto(false);
                      const max = document.documentElement.scrollHeight - window.innerHeight;
                      window.scrollTo({ top: (c.from + 0.01) * max, behavior: "smooth" });
                    }}
                  >
                    <b>{String(i + 1).padStart(3, "0")}</b><span>{c.kicker.split(" · ")[1]}</span>
                  </button>
                ))}
              </nav>
              {attract && <div className="en-attract">TOUCH TO BEGIN</div>}
            </>
          ) : (
            <div className="en-hint">scroll to decode</div>
          )}
        </>
      )}
    </div>
  );
};

const CSS = `
.enigma { background: #0b0b0d; color: #ddd6c8; font-family: 'Space Grotesk', system-ui, sans-serif; }
.enigma .en-spacer { pointer-events: none; }
.en-stage { position: fixed; inset: 0; }
.en-stage canvas { width: 100%; height: 100%; display: block; }
.en-ghost {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: clamp(90px, 22vw, 300px); letter-spacing: 0.04em;
  color: rgba(221,214,200,0.05); pointer-events: none; user-select: none; z-index: 0;
}
.en-lines { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3; }
.en-chrome {
  position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between;
  padding: 22px 30px; z-index: 5; font-size: 13px; letter-spacing: 2px;
}
.en-brand { font-weight: 700; font-size: 16px; }
.en-brand em { font-style: normal; color: #d9a441; }
.en-series { color: #8a8272; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
.en-cta { font-family: 'Special Elite', monospace; color: #b03a2e; border: 1.5px solid #b03a2e; padding: 3px 10px; transform: rotate(-4deg); font-size: 12px; }
.en-escape { position: fixed; top: 60px; left: 30px; color: #8a8272; text-decoration: none; font-size: 13px; z-index: 5; }
.en-escape:hover { color: #d9a441; }
.en-readout {
  position: fixed; top: 62px; right: 30px; font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: #d9a441; letter-spacing: 1.5px; z-index: 5;
}
.en-copy {
  position: fixed; left: 30px; bottom: 40px; max-width: 400px; z-index: 5;
  animation: en-in 0.5s ease both;
  text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 22px rgba(0,0,0,0.7);
}
.en-copy::before {
  content: ""; position: absolute; inset: -60px -80px -50px -40px; z-index: -1; pointer-events: none;
  background: radial-gradient(ellipse at 30% 60%, rgba(11,11,13,0.82) 30%, rgba(11,11,13,0.5) 60%, rgba(11,11,13,0) 78%);
}
@keyframes en-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; } }
.en-kicker { font-family: 'Special Elite', monospace; color: #d9a441; font-size: 13px; letter-spacing: 2px; }
.en-copy h2 { font-size: clamp(26px, 3.4vw, 40px); line-height: 1.04; margin: 10px 0 12px; font-weight: 700; }
.en-copy p { font-size: 13.5px; line-height: 1.6; color: #a89f8e; }
.en-specs { margin-top: 14px; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; }
.en-specs td { border-top: 1px solid #26241f; padding: 5px 14px 5px 0; color: #8a8272; }
.en-specs td:first-child { color: #d9a441; white-space: nowrap; }
.en-sim { position: fixed; right: 30px; bottom: 58px; z-index: 6; width: min(360px, 92vw); display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 12px; background: rgba(11,11,13,0.62); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border: 1px solid rgba(58,52,39,0.6); }
.en-windows { display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; transition: opacity 0.4s; }
.en-windows label { font-size: 10px; color: #8a8272; letter-spacing: 2px; }
.en-windows .en-letter { background: #17150f; border: 1px solid #3a3427; color: #ffd98a; padding: 3px 9px; font-size: 16px; }
.en-windows .en-reset { margin-left: auto; background: none; border: 1px solid #3a3427; color: #8a8272; font-family: inherit; font-size: 10px; padding: 4px 10px; cursor: pointer; }
.en-win { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; }
.en-win > button { background: none; border: none; color: #6a6355; font-size: 9px; cursor: pointer; padding: 0 8px; line-height: 1.2; }
.en-win > button:hover { color: #d9a441; }
.en-windows .en-reset:hover { color: #d9a441; border-color: #d9a441; }
.en-tape { background: #14130f; border: 1px solid #2a2820; padding: 10px 12px; min-height: 58px; font-family: 'Special Elite', monospace; }
.en-tape em { color: #6a6355; font-size: 12.5px; }
.en-tape-row { display: flex; flex-wrap: wrap; gap: 2px; font-size: 14px; color: #8a8272; }
.en-tape-row b { font-weight: 400; }
.en-tape-out { color: #ffd98a; border-top: 1px dashed #2a2820; margin-top: 4px; padding-top: 4px; }
.en-keys { display: flex; flex-direction: column; gap: 5px; align-items: center; }
.en-keyrow { display: flex; gap: 5px; }
.en-keys button {
  width: 30px; height: 30px; border-radius: 50%; background: #17171a; color: #d8d2c4;
  border: 1px solid #34322c; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 12px; cursor: pointer;
}
.en-keys button:hover { border-color: #d9a441; color: #ffd98a; }
.en-labels { position: fixed; inset: 0; pointer-events: none; z-index: 4; }
.en-label { position: absolute; top: 0; left: 0; opacity: 0; transition: opacity 0.2s; max-width: 200px; }
.en-label.left { text-align: right; }
.en-label strong { display: block; font-size: 12px; letter-spacing: 1.5px; color: #ecdfc2; text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.8); }
.en-label span { font-size: 11px; color: #a89f8e; font-family: 'JetBrains Mono', monospace; text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.8); }
.en-rail { position: fixed; right: 14px; top: 18vh; bottom: 18vh; width: 14px; z-index: 5; }
.en-rail-track { position: absolute; left: 6px; top: 0; bottom: 0; width: 2px; background: #26241f; }
.en-rail-fill { width: 2px; background: #d9a441; height: 0; }
.en-tick { position: absolute; left: 0; width: 14px; height: 14px; border-radius: 50%; border: 1px solid #4a463c; background: #0b0b0d; cursor: pointer; z-index: 1; }
.en-tick.on { border-color: #d9a441; background: #d9a441; }
.en-hint { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); font-family: 'Special Elite', monospace; font-size: 11px; color: #5a5548; z-index: 5; }
.en-grain { position: fixed; inset: -60%; pointer-events: none; z-index: 2; opacity: 0.05; animation: en-grain 0.85s steps(5) infinite; }
@keyframes en-grain {
  0% { transform: translate(0, 0); } 20% { transform: translate(-3%, 2%); } 40% { transform: translate(2%, -3%); }
  60% { transform: translate(-2%, -2%); } 80% { transform: translate(3%, 2%); } 100% { transform: translate(0, 0); }
}
.no-anim .en-grain { animation: none; }
.en-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 2; background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.4) 100%); }
.en-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.en-controls { position: fixed; bottom: 12px; right: 40px; display: flex; gap: 8px; z-index: 6; }
.en-controls button { background: rgba(11,11,13,0.7); border: 1px solid #3a3427; color: #8a8272; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 1.5px; padding: 6px 12px; cursor: pointer; }
.en-controls button.on, .en-controls button:hover { color: #d9a441; border-color: #d9a441; }
.en-share { background: none; border: 1px solid #8a6b32; color: #d9a441; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 1.5px; padding: 7px 12px; cursor: pointer; }
.en-share:hover { border-color: #ffd98a; color: #ffd98a; }
.en-loading, .en-fallback {
  position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; z-index: 10; background: #0b0b0d;
}
.en-loading span { font-size: 44px; font-weight: 700; letter-spacing: 6px; }
.en-loading p { color: #8a8272; font-family: 'Special Elite', monospace; font-size: 13px; }
.en-fallback h1 { font-size: 40px; }
.en-fallback ol { color: #8a8272; line-height: 2; }
.en-fallback a { color: #d9a441; }
/* ── kiosk / exhibition mode ─────────────────────────────────────────── */
.kiosk { cursor: default; }
.kiosk .en-grain, .kiosk .en-rail, .kiosk .en-series { display: none; }
.kiosk .en-copy { left: 40px; bottom: 96px; max-width: 560px; }
.kiosk .en-copy::before { background: radial-gradient(ellipse at 30% 60%, rgba(11,11,13,0.9) 30%, rgba(11,11,13,0.6) 60%, rgba(11,11,13,0) 80%); }
.kiosk .en-kicker { font-size: 16px; }
.kiosk .en-copy h2 { font-size: clamp(34px, 3.8vw, 58px); }
.kiosk .en-copy p { font-size: 18px; color: #d8d0c0; }
.kiosk .en-specs { font-size: 14px; }
.kiosk .en-specs td { color: #b8b0a0; padding: 7px 18px 7px 0; }
.kiosk .en-label strong { font-size: 15px; }
.kiosk .en-label span { font-size: 13px; color: #c0b8a8; }
.kiosk .en-readout { font-size: 13px; }
.kiosk .en-brand { font-size: 20px; }
.kiosk .en-sim { width: min(470px, 92vw); bottom: 100px; gap: 14px; padding: 18px; }
.kiosk .en-keys button { width: 42px; height: 42px; font-size: 16px; }
.kiosk .en-keyrow { gap: 7px; }
.kiosk .en-win > button { font-size: 14px; padding: 4px 12px; }
.kiosk .en-windows .en-letter { font-size: 22px; padding: 5px 13px; }
.kiosk .en-windows .en-reset { font-size: 13px; padding: 8px 14px; }
.kiosk .en-tape { min-height: 70px; }
.kiosk .en-tape em { font-size: 15px; }
.kiosk .en-tape-row { font-size: 18px; }
.kiosk .en-controls { bottom: 24px; right: 40px; }
.kiosk .en-controls button { font-size: 12px; padding: 10px 16px; }
.en-chapters {
  position: fixed; left: 40px; right: 200px; bottom: 22px; z-index: 6;
  display: flex; gap: 8px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none;
}
.en-chapters button {
  flex: 1 0 auto; min-height: 48px; padding: 8px 14px; border-radius: 999px;
  background: rgba(11,11,13,0.72); border: 1px solid #3a3427; color: #a89f8e;
  font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: 1.2px; cursor: pointer;
  display: flex; align-items: center; gap: 10px; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
}
.en-chapters button b { color: #d9a441; font-weight: 400; }
.en-chapters button.on { border-color: #d9a441; color: #ecdfc2; background: rgba(217,164,65,0.12); }
.en-attract {
  position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); z-index: 7;
  font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 22px; letter-spacing: 6px; color: #ffd98a;
  padding: 16px 30px; border: 1px solid rgba(217,164,65,0.6); border-radius: 999px; background: rgba(11,11,13,0.6);
  animation: en-pulse 1.8s ease-in-out infinite;
}
@keyframes en-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
@media (max-width: 720px) {
  .en-copy { left: 18px; right: 18px; bottom: 30px; max-width: none; }
  .sim-on .en-copy p, .sim-on .en-copy h2 { display: none; }
  .sim-on .en-copy { bottom: 14px; }
  .en-rail { display: none; }
  .en-copy p { font-size: 12.5px; }
  .en-sim { right: 12px; left: 12px; width: auto; bottom: 210px; }
  .en-keys button { width: 26px; height: 26px; font-size: 11px; }
  .en-series, .en-cta { display: none; }
  .en-readout { top: 24px; right: 18px; }
  .en-escape { top: 22px; left: unset; right: 60px; }
  .en-hint { display: none; }
  .en-controls { right: 12px; }
  .en-windows label { display: none; }
  .en-brand { z-index: 6; }
}
`;

export default Enigma;
