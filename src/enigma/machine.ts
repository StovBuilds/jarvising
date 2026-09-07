// Procedural Enigma I for jarvising entry 001 (enigma) — no assets, everything modelled and
// textured at runtime. The machine is built as named layer parts (Kestrel-style
// vertical explode), the middle rotor additionally splits into its own labelled
// stack, and the signal-path beat gets two glowing tubes traced through the
// semi-exploded machine.
//
// Frame: y up, +z toward the viewer (plugboard face), x across. Case centred
// on the origin. Explode dirs are FULL displacements (page multiplies by the
// 0..1 envelope directly).

import * as THREE from "three";
import { Enigma, PLUG_PAIRS } from "./cipher";

export const ROWS = ["QWERTZUIO", "ASDFGHJK", "PYXCVBNML"];

export interface PartDef {
  obj: THREE.Object3D;
  base: THREE.Vector3;
  dir: THREE.Vector3;
  lag: number;
}

export interface MachineBuild {
  root: THREE.Group;
  parts: Map<string, PartDef>;
  rotors: THREE.Group[]; // set .rotation.x = -(pos/26)*2π to show a position
  rotorSub: Map<string, PartDef>;
  rotor1: THREE.Group;
  keys: Map<string, THREE.Group>;
  lamps: Map<string, { mat: THREE.MeshStandardMaterial; glow: THREE.Sprite }>;
  lidPivot: THREE.Group;
  pathFwd: THREE.Mesh;
  pathRet: THREE.Mesh;
  curveFwd: THREE.CatmullRomCurve3;
  curveRet: THREE.CatmullRomCurve3;
  demo: { press: string; lamp: string };
  trace: (press: string, lamp: string, e: number) => { fwd: THREE.CatmullRomCurve3; ret: THREE.CatmullRomCurve3 };
}

const GROT = "'Space Grotesk', system-ui, sans-serif";

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Shared materials ─────────────────────────────────────────────────────────

function oakTex(seed: number): THREE.CanvasTexture {
  return canvasTex(512, 512, (g) => {
    const r = rng(seed);
    g.fillStyle = "#8a5f34";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 70; i++) {
      const y = r() * 512;
      g.strokeStyle = `rgba(${40 + r() * 60},${25 + r() * 35},10,${0.12 + r() * 0.22})`;
      g.lineWidth = 1 + r() * 3.5;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + (r() - 0.5) * 26, 340, y + (r() - 0.5) * 26, 512, y + (r() - 0.5) * 14);
      g.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = r() * 512, y = r() * 512;
      g.strokeStyle = "rgba(48,28,10,0.4)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(x, y, 6 + r() * 12, 3 + r() * 5, r() * 3, 0, Math.PI * 2);
      g.stroke();
    }
    const v = g.createRadialGradient(256, 256, 120, 256, 256, 380);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(30,16,4,0.35)");
    g.fillStyle = v;
    g.fillRect(0, 0, 512, 512);
  });
}

function crinkleTex(): THREE.CanvasTexture {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = "#181a1c";
    g.fillRect(0, 0, 512, 512);
    const r = rng(77);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.028)" : "rgba(0,0,0,0.24)";
      g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
    }
  });
}

// ── Build ────────────────────────────────────────────────────────────────────

export function buildMachine(): MachineBuild {
  const root = new THREE.Group();
  const parts = new Map<string, PartDef>();
  const rotorSub = new Map<string, PartDef>();
  const keys = new Map<string, THREE.Group>();
  const lamps = new Map<string, { mat: THREE.MeshStandardMaterial; glow: THREE.Sprite }>();

  const oak = new THREE.MeshStandardMaterial({ map: oakTex(11), roughness: 0.72, metalness: 0.04 });
  const oakDark = new THREE.MeshStandardMaterial({ map: oakTex(31), roughness: 0.8, metalness: 0.02, color: "#b99668" });
  const crinkle = new THREE.MeshStandardMaterial({ map: crinkleTex(), roughness: 0.9, metalness: 0.22 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: "#141518", roughness: 0.55, metalness: 0.45 });
  const brass = new THREE.MeshStandardMaterial({ color: "#8a6b32", roughness: 0.35, metalness: 0.85 });
  const bakelite = new THREE.MeshStandardMaterial({ color: "#3a2b20", roughness: 0.5, metalness: 0.1 });
  const nickel = new THREE.MeshStandardMaterial({ color: "#9aa0a8", roughness: 0.3, metalness: 0.9 });

  const addPart = (name: string, dir: THREE.Vector3, lag: number): THREE.Group => {
    const g = new THREE.Group();
    root.add(g);
    parts.set(name, { obj: g, base: new THREE.Vector3(), dir, lag });
    return g;
  };

  // ── Case (open oak box) ────────────────────────────────────────────────────
  const caseG = addPart("case", new THREE.Vector3(0, -1.2, 0), 0.05);
  const W = 3.0, D = 3.6, H = 1.1, T = 0.09;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), oak);
  bottom.position.y = -H / 2 + T / 2;
  caseG.add(bottom);
  // walls run past the deck so the closed lid clears the rotor crowns
  const WALL_H = 1.3, WALL_CY = 0.1;
  for (const [sx, sw, sz, sd] of [
    [0, W, -D / 2 + T / 2, T], [0, W, D / 2 - T / 2, T],
    [-W / 2 + T / 2, T, 0, D - 2 * T], [W / 2 - T / 2, T, 0, D - 2 * T],
  ] as const) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sw, WALL_H, sd), oak);
    wall.position.set(sx, WALL_CY, sz);
    caseG.add(wall);
  }
  // carry handle on the left face
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20, Math.PI), blackMetal);
  handle.position.set(-W / 2 - 0.02, 0.05, 0);
  handle.rotation.y = Math.PI / 2;
  caseG.add(handle);

  // ── Lid (hinged at the back edge) ─────────────────────────────────────────
  const lidPart = addPart("lid", new THREE.Vector3(0, 2.4, -0.4), 0);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.75, -D / 2);
  lidPart.add(lidPivot);
  const lidBoard = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, D), oakDark);
  lidBoard.position.set(0, 0.04, D / 2);
  lidPivot.add(lidBoard);
  const sheetTex = canvasTex(512, 380, (g) => {
    g.fillStyle = "#e7ddc2";
    g.fillRect(0, 0, 512, 380);
    g.strokeStyle = "#6a5a3a";
    g.strokeRect(10, 10, 492, 360);
    g.fillStyle = "#232018";
    g.font = "bold 34px Georgia, serif";
    g.textAlign = "center";
    g.fillText("Zur Beachtung!", 256, 58);
    g.textAlign = "left";
    g.fillStyle = "#4a4436";
    const r = rng(5);
    for (let i = 0; i < 15; i++) {
      const y = 92 + i * 19;
      g.fillRect(34, y, 150 + r() * 290, 3.2);
    }
  });
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.26),
    new THREE.MeshStandardMaterial({ map: sheetTex, roughness: 0.92 }),
  );
  sheet.rotation.x = Math.PI / 2;
  sheet.position.set(-0.45, -0.005, D / 2 - 0.1);
  lidPivot.add(sheet);
  const filter = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.8),
    new THREE.MeshStandardMaterial({ color: "#2e5c36", roughness: 0.4, transparent: true, opacity: 0.85 }),
  );
  filter.rotation.x = Math.PI / 2;
  filter.position.set(0.85, -0.005, D / 2 - 0.35);
  lidPivot.add(filter);
  for (let i = 0; i < 4; i++) { // spare bulbs
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8), nickel);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(0.55 + i * 0.12, -0.02, D / 2 + 0.62);
    lidPivot.add(bulb);
  }

  // ── Chassis face plate ────────────────────────────────────────────────────
  const chassis = addPart("chassis", new THREE.Vector3(0, 0.55, 0), 0.12);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W - 0.26, 0.05, D - 0.5), crinkle);
  deck.position.set(0, 0.42, 0.05);
  chassis.add(deck);
  // power selector knob (right, by the rotors)
  const knobBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.05, 20), blackMetal);
  knobBase.position.set(1.08, 0.47, -1.0);
  chassis.add(knobBase);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), bakelite);
  knob.position.set(1.08, 0.51, -1.0);
  knob.rotation.y = 0.6;
  chassis.add(knob);

  // ── Inner guts (visible mid-explode) ──────────────────────────────────────
  const guts = addPart("guts", new THREE.Vector3(0, 0.3, 0), 0.14);
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: "#5a5348", roughness: 0.85 }));
  battery.position.set(-0.85, 0, -0.15);
  guts.add(battery);
  const bus = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.14), brass);
  bus.position.set(0.25, -0.1, 0.2);
  guts.add(bus);
  const loom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), new THREE.MeshStandardMaterial({ color: "#6a4a2a", roughness: 0.8 }));
  loom.rotation.z = Math.PI / 2;
  loom.position.set(0, -0.05, 0.75);
  guts.add(loom);

  // ── Lamp panel ────────────────────────────────────────────────────────────
  const lampPanel = addPart("lampPanel", new THREE.Vector3(0, 1.55, 0), 0.06);
  const lampPlate = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.04, 1.05), crinkle);
  lampPlate.position.set(0, 0.47, -0.42);
  lampPanel.add(lampPlate);
  const lampRowsZ = [-0.75, -0.42, -0.09];
  const glowTex = canvasTex(64, 64, (g) => {
    const rad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    rad.addColorStop(0, "rgba(255,224,150,0.95)");
    rad.addColorStop(1, "rgba(255,200,90,0)");
    g.fillStyle = rad;
    g.fillRect(0, 0, 64, 64);
  });
  ROWS.forEach((row, ri) => {
    [...row].forEach((ch, i) => {
      const x = (i - (row.length - 1) / 2) * 0.29;
      const z = lampRowsZ[ri];
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 22), blackMetal);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, 0.495, z);
      lampPanel.add(rim);
      const faceTex = canvasTex(64, 64, (g) => {
        g.fillStyle = "#2a2620";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#d8cba8";
        g.font = `bold 38px ${GROT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(ch, 32, 35);
      });
      const mat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.4, emissive: new THREE.Color("#ffbe5a"), emissiveMap: faceTex, emissiveIntensity: 0 });
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.088, 22), mat);
      glass.rotation.x = -Math.PI / 2;
      glass.position.set(x, 0.492, z);
      lampPanel.add(glass);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(x, 0.55, z);
      glow.scale.setScalar(0.55);
      lampPanel.add(glow);
      lamps.set(ch, { mat, glow });
    });
  });

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const keyboard = addPart("keyboard", new THREE.Vector3(0, 1.0, 0), 0.09);
  const keyRowsZ = [0.38, 0.7, 1.02];
  ROWS.forEach((row, ri) => {
    [...row].forEach((ch, i) => {
      const x = (i - (row.length - 1) / 2) * 0.29;
      const z = keyRowsZ[ri];
      const key = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 10), blackMetal);
      stem.position.y = 0.47;
      key.add(stem);
      const capTex = canvasTex(64, 64, (g) => {
        g.fillStyle = "#101012";
        g.beginPath();
        g.arc(32, 32, 31, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#e8e4da";
        g.font = `bold 34px ${GROT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(ch, 32, 35);
      });
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.035, 22),
        [blackMetal, new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.5 }), blackMetal],
      );
      cap.position.y = 0.54;
      key.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.012, 8, 22), nickel);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.557;
      key.add(ring);
      key.position.set(x, 0, z);
      keyboard.add(key);
      keys.set(ch, key);
    });
  });

  // ── Plugboard (front face) ────────────────────────────────────────────────
  const plugboard = addPart("plugboard", new THREE.Vector3(0, -0.1, 1.3), 0.1);
  const pbPlate = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.78, 0.05), crinkle);
  pbPlate.position.set(0, -0.06, D / 2 + 0.03);
  plugboard.add(pbPlate);
  const sockets = new Map<string, THREE.Vector3>();
  ROWS.forEach((row, ri) => {
    [...row].forEach((ch, i) => {
      const x = (i - (row.length - 1) / 2) * 0.29;
      const y = 0.16 - ri * 0.24;
      const zc = D / 2 + 0.06;
      const letterTex = canvasTex(32, 32, (g) => {
        g.fillStyle = "#c8bfa4";
        g.font = `bold 22px ${GROT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(ch, 16, 17);
      });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshBasicMaterial({ map: letterTex, transparent: true }));
      tag.position.set(x, y + 0.075, zc + 0.005);
      plugboard.add(tag);
      for (const dy of [0, -0.075]) {
        const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.05, 10), bakelite);
        jack.rotation.x = Math.PI / 2;
        jack.position.set(x, y + dy, zc);
        plugboard.add(jack);
      }
      sockets.set(ch, new THREE.Vector3(x, y - 0.037, zc + 0.02));
    });
  });
  const cableMat = new THREE.MeshStandardMaterial({ color: "#1c1a17", roughness: 0.75 });
  for (const [a, b] of PLUG_PAIRS.slice(0, 6)) {
    const pa = sockets.get(a)!, pb = sockets.get(b)!;
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y -= 0.34 + Math.abs(pa.x - pb.x) * 0.06;
    mid.z += 0.1;
    const curve = new THREE.CatmullRomCurve3([pa, mid, pb]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.02, 6), cableMat);
    plugboard.add(cable);
    for (const p of [pa, pb]) {
      const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.09, 10), bakelite);
      plug.rotation.x = Math.PI / 2;
      plug.position.copy(p);
      plugboard.add(plug);
    }
  }

  // ── Rotor basket ──────────────────────────────────────────────────────────
  const basket = addPart("rotorBasket", new THREE.Vector3(0, 2.1, 0), 0.03);
  const axleY = 0.4, axleZ = -1.16;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 12), nickel);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0.1, axleY, axleZ);
  basket.add(axle);
  for (const sx of [-0.72, 0.95]) { // end cheeks
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.55), blackMetal);
    cheek.position.set(sx, axleY - 0.02, axleZ);
    basket.add(cheek);
  }
  const reflector = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 26), bakelite);
  reflector.rotation.z = Math.PI / 2;
  reflector.position.set(-0.58, axleY, axleZ);
  basket.add(reflector);
  const entry = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.09, 26), blackMetal);
  entry.rotation.z = Math.PI / 2;
  entry.position.set(0.82, axleY, axleZ);
  basket.add(entry);

  const knurlTex = canvasTex(128, 32, (g) => {
    g.fillStyle = "#26272b";
    g.fillRect(0, 0, 128, 32);
    for (let x = 0; x < 128; x += 4) {
      g.fillStyle = "rgba(255,255,255,0.16)";
      g.fillRect(x, 0, 1.6, 32);
    }
  });
  knurlTex.wrapS = THREE.RepeatWrapping;
  knurlTex.repeat.x = 4;
  const alphaTex = () => canvasTex(1024, 64, (g) => {
    g.fillStyle = "#c9c2ae";
    g.fillRect(0, 0, 1024, 64);
    g.fillStyle = "#17150f";
    g.font = `bold 30px ${GROT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (let i = 0; i < 26; i++) {
      g.save();
      g.translate(i * (1024 / 26) + 1024 / 52, 32);
      g.rotate(Math.PI / 2);
      g.fillText(String.fromCharCode(65 + i), 0, 0);
      g.restore();
    }
  });

  const rotors: THREE.Group[] = [];
  let rotor1 = new THREE.Group();
  const buildRotor = (x: number, solo: boolean): THREE.Group => {
    const rg = new THREE.Group();
    rg.position.set(x, axleY, axleZ);
    const mk = (name: string, obj: THREE.Object3D, dx: number) => {
      const holder = new THREE.Group();
      holder.add(obj);
      rg.add(holder);
      if (solo) rotorSub.set(name, { obj: holder, base: new THREE.Vector3(), dir: new THREE.Vector3(dx, 0, 0), lag: 0 });
    };
    // thumbwheel (serrated, pokes up through the deck line)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.055, 40), new THREE.MeshStandardMaterial({ map: knurlTex, roughness: 0.6, metalness: 0.3 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.x = 0.12;
    mk("rt_wheel", wheel, 0.85);
    // alphabet ring
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.085, 52), new THREE.MeshStandardMaterial({ map: alphaTex(), roughness: 0.55 }));
    ring.rotation.z = Math.PI / 2;
    ring.position.x = 0.035;
    mk("rt_ring", ring, 0.45);
    // bakelite core with cross-wiring
    const coreG = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 32), bakelite);
    core.rotation.z = Math.PI / 2;
    coreG.add(core);
    const r = rng(400 + x * 100);
    const wireCols = ["#b06a3a", "#c4b598", "#7a2e2a", "#4a5a3a"];
    for (let i = 0; i < 13; i++) {
      const a1 = r() * Math.PI * 2, a2 = a1 + 1 + r() * 4;
      const p1 = new THREE.Vector3(-0.05, Math.cos(a1) * 0.17, Math.sin(a1) * 0.17);
      const p2 = new THREE.Vector3(0.05, Math.cos(a2) * 0.17, Math.sin(a2) * 0.17);
      const len = p1.distanceTo(p2);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 5), new THREE.MeshStandardMaterial({ color: wireCols[i % 4], roughness: 0.6 }));
      wire.position.copy(p1).add(p2).multiplyScalar(0.5);
      wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
      coreG.add(wire);
    }
    coreG.position.x = -0.05;
    mk("rt_core", coreG, 0);
    // spring contact pins
    const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.013, 0.013, 0.035, 6), brass, 26);
    const pm = new THREE.Matrix4();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      pm.makeRotationZ(Math.PI / 2);
      pm.setPosition(-0.125, Math.cos(a) * 0.19, Math.sin(a) * 0.19);
      pins.setMatrixAt(i, pm);
    }
    const pinsG = new THREE.Group();
    pinsG.add(pins);
    mk("rt_pins", pinsG, -0.45);
    // flat contact plate
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 32), nickel);
    plate.rotation.z = Math.PI / 2;
    plate.position.x = -0.17;
    mk("rt_plate", plate, -0.85);
    return rg;
  };
  [-0.42, -0.05, 0.32].forEach((x, i) => {
    const rg = buildRotor(x, i === 1);
    basket.add(rg);
    rotors.push(rg);
    if (i === 1) rotor1 = rg;
  });

  // ── Signal-path factory ───────────────────────────────────────────────────
  // Computes the two current curves (key → reflector, reflector → lamp) for
  // any key/lamp pair at any explode envelope e, tracking each layer's lag and
  // the plug board's explode tilt. The authored demo tubes use e = 0.35; the
  // simulator spawns a live trace per keypress at e = 0.
  const partnerOf = (ch: string) =>
    PLUG_PAIRS.find(([a]) => a === ch)?.[1] ?? PLUG_PAIRS.find(([, b]) => b === ch)?.[0] ?? ch;
  const tracePoints = (press: string, lampCh: string, e: number) => {
    const pe = (part: string) => {
      const lag = parts.get(part)!.lag;
      return Math.max(0, Math.min(1, e * (1 + lag) - lag));
    };
    const off = (part: string) => parts.get(part)!.dir.clone().multiplyScalar(pe(part));
    const keyPos = (ch: string) => {
      const ri = ROWS.findIndex((rw) => rw.includes(ch));
      const i = ROWS[ri].indexOf(ch);
      return new THREE.Vector3((i - (ROWS[ri].length - 1) / 2) * 0.29, 0.58, keyRowsZ[ri]).add(off("keyboard"));
    };
    const lampPos = (ch: string) => {
      const ri = ROWS.findIndex((rw) => rw.includes(ch));
      const i = ROWS[ri].indexOf(ch);
      return new THREE.Vector3((i - (ROWS[ri].length - 1) / 2) * 0.29, 0.5, lampRowsZ[ri]).add(off("lampPanel"));
    };
    const tilt = -0.35 * pe("plugboard");
    const xAxis = new THREE.Vector3(1, 0, 0);
    const sockPos = (ch: string) =>
      sockets.get(ch)!.clone().applyAxisAngle(xAxis, tilt).add(off("plugboard"));
    const rotorX = [-0.58, -0.42, -0.05, 0.32, 0.82];
    const basketOff = off("rotorBasket");
    const rp = (x: number, spread: number) => new THREE.Vector3(x, axleY + spread, axleZ).add(basketOff);
    const plugFrom = partnerOf(press);
    const kp = keyPos(press);
    const fwd = [
      kp,
      kp.clone().setY(kp.y - 0.5),
      sockPos(press),
      sockPos(press).add(new THREE.Vector3(0, -0.3, 0.12)),
      sockPos(plugFrom),
      new THREE.Vector3(1.25, 0.2, 0.6).add(basketOff.clone().multiplyScalar(0.4)),
      rp(rotorX[4], -0.16),
      rp(rotorX[3], 0.18),
      rp(rotorX[2], -0.2),
      rp(rotorX[1], 0.14),
      rp(rotorX[0], -0.05),
    ];
    const ret = [
      rp(rotorX[0], 0.16),
      rp(rotorX[1], -0.16),
      rp(rotorX[2], 0.22),
      rp(rotorX[3], -0.12),
      rp(rotorX[4], 0.2),
      new THREE.Vector3(1.1, 0.55, -0.35).add(basketOff.clone().multiplyScalar(0.5)),
      lampPos(lampCh).add(new THREE.Vector3(0, 0.35, 0)),
      lampPos(lampCh),
    ];
    return { fwd, ret };
  };
  const traceCurves = (press: string, lampCh: string, e: number) => {
    const pts = tracePoints(press, lampCh, e);
    return { fwd: new THREE.CatmullRomCurve3(pts.fwd), ret: new THREE.CatmullRomCurve3(pts.ret) };
  };

  const sim = new Enigma();
  const demoPress = "T";
  const demoLamp = sim.press(demoPress);
  const demo = traceCurves(demoPress, demoLamp, 0.35);
  const curveFwd = demo.fwd;
  const curveRet = demo.ret;
  const mkPath = (curve: THREE.CatmullRomCurve3, color: string) => {
    const geo = new THREE.TubeGeometry(curve, 220, 0.017, 6);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.visible = false;
    root.add(mesh);
    return mesh;
  };
  const pathFwd = mkPath(curveFwd, "#ffb84d");
  const pathRet = mkPath(curveRet, "#ff5a3c");

  return {
    root, parts, rotors, rotorSub, rotor1, keys, lamps, lidPivot,
    pathFwd, pathRet, curveFwd, curveRet,
    demo: { press: demoPress, lamp: demoLamp },
    trace: traceCurves,
  };
}
