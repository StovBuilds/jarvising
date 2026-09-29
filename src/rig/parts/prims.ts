// Shared builder helpers for the rig's procedural parts. Every product
// builder (chassis, motherboard, gpu, aio, psu…) composes from these so the
// whole machine shares one material vocabulary and one node convention.
//
// Frame + units: millimetres, +Y up, +Z case front, +X glass side (types.ts).
// Builders return PartNodes; `node()` tags every mesh with its part id so
// picking can walk from a hit mesh back to the node. Materials are shared
// here on purpose — the assembler clones per node before the atlas mutates
// them for hover/isolate, so never mutate a MAT.* instance in a builder.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ExplodeSpec, PartNode } from "../types";
import type { PartId } from "../ids";

// ── materials ──────────────────────────────────────────────────────────────

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o);

export const MAT = {
  /** Matte black PCB (motherboard, GPU, DIMM). */
  pcb: std({ color: 0x14161a, roughness: 0.62, metalness: 0.15 }),
  /** Dark anodised aluminium — heatsinks, shrouds, the case. */
  aluDark: std({ color: 0x2b2e33, roughness: 0.42, metalness: 0.9 }),
  /** Brushed/silver aluminium — radiator tanks, PSU, fins. */
  alu: std({ color: 0x8d9299, roughness: 0.5, metalness: 0.9 }),
  /** Painted steel case panels. */
  steel: std({ color: 0x1c1e22, roughness: 0.55, metalness: 0.7 }),
  /** Matte black plastic — fan frames, shrouds, connectors. */
  plastic: std({ color: 0x17181b, roughness: 0.78, metalness: 0.05 }),
  /** Fan blades — slightly translucent grey-black. */
  blade: phys({ color: 0x25272c, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.92 }),
  /** Copper — cold plate, vapor chamber, heatpipes. */
  copper: std({ color: 0xb87333, roughness: 0.32, metalness: 1.0 }),
  /** Nickel-plated — heatpipes, IHS. */
  nickel: std({ color: 0xc9ccd1, roughness: 0.28, metalness: 1.0 }),
  /** Tempered glass side panel. */
  /** Plain alpha glass, not transmission: transmission blurs the whole interior to
   * a grey fog on the software renderer and costs a full extra pass on real GPUs. */
  glass: phys({
    color: 0xe8eef4, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.14,
    side: THREE.FrontSide, depthWrite: false, envMapIntensity: 0.22, specularIntensity: 0.15,
  }),
  /** Dark tinted glass / acrylic (LCD covers, front glass). */
  tint: phys({ color: 0x0c0d10, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.85 }),
  /** Braided sleeved cable. */
  sleeve: std({ color: 0x0f1012, roughness: 0.9, metalness: 0.0 }),
  /** Rubber coolant tube. */
  tube: std({ color: 0x0b0c0e, roughness: 0.72, metalness: 0.02 }),
  /** Gold edge contacts. */
  gold: std({ color: 0xd4a83a, roughness: 0.3, metalness: 1.0 }),
  /** Silicon die / chips. */
  silicon: std({ color: 0x1a1d24, roughness: 0.25, metalness: 0.6 }),
  /** Green-black substrate (CPU package). */
  substrate: std({ color: 0x1f3a2a, roughness: 0.6, metalness: 0.1 }),
  /** Thermal pads. */
  pad: std({ color: 0x8fa5c9, roughness: 0.9, metalness: 0 }),
  /** White label. */
  label: std({ color: 0xe9e6dd, roughness: 0.85, metalness: 0 }),
  /** Mesh / perforated steel — dark with a hint of sheen. */
  mesh: std({ color: 0x0f1013, roughness: 0.7, metalness: 0.5 }),
  /** Soft-white RGB diffuser (emissive; the atlas dims it). */
  rgb: std({ color: 0x9aa3b8, emissive: 0xcfd8ff, emissiveIntensity: 0.32, roughness: 0.9 }),
} as const;

/** An emissive accent material in a given colour — RGB rings, status LEDs. */
export function glow(hex: number, intensity = 1.2): THREE.MeshStandardMaterial {
  const m = std({ color: hex, emissive: hex, emissiveIntensity: intensity, roughness: 0.8 });
  m.userData.accent = true; // the story dims accents until "the whole system becomes alive"
  return m;
}
MAT.rgb.userData.accent = true;

// ── geometry primitives ────────────────────────────────────────────────────

type V3 = [number, number, number];

/** A box of w×h×d (X×Y×Z) centred at `at`; `r` rounds the edges (mm). */
export function box(
  w: number, h: number, d: number, mat: THREE.Material,
  at: V3 = [0, 0, 0], r = 0,
): THREE.Mesh {
  const geo = r > 0
    ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2))
    : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...at);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A box whose minimum corner is at `min` — handy when dimensions are edge-referenced. */
export function boxMin(
  w: number, h: number, d: number, mat: THREE.Material, min: V3, r = 0,
): THREE.Mesh {
  return box(w, h, d, mat, [min[0] + w / 2, min[1] + h / 2, min[2] + d / 2], r);
}

/** A cylinder of radius r, length len along `axis`, centred at `at`. */
export function cyl(
  r: number, len: number, mat: THREE.Material, axis: "x" | "y" | "z" = "y",
  at: V3 = [0, 0, 0], segments = 32, rTop = r,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, len, segments), mat);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  if (axis === "z") m.rotation.x = Math.PI / 2;
  m.position.set(...at);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A flat plate with a circular hole (fan frames, grilles), thickness along `axis`. */
export function plateWithHole(
  w: number, h: number, thick: number, holeR: number, mat: THREE.Material,
  axis: "x" | "y" | "z" = "z", at: V3 = [0, 0, 0], cornerR = 6,
): THREE.Mesh {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + cornerR, y);
  shape.lineTo(x + w - cornerR, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + cornerR);
  shape.lineTo(x + w, y + h - cornerR);
  shape.quadraticCurveTo(x + w, y + h, x + w - cornerR, y + h);
  shape.lineTo(x + cornerR, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - cornerR);
  shape.lineTo(x, y + cornerR);
  shape.quadraticCurveTo(x, y, x + cornerR, y);
  const hole = new THREE.Path();
  hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 40 });
  geo.translate(0, 0, -thick / 2);
  const m = new THREE.Mesh(geo, mat);
  if (axis === "x") m.rotation.y = Math.PI / 2;
  if (axis === "y") m.rotation.x = -Math.PI / 2;
  m.position.set(...at);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A stack of `count` thin fins (heatsink / radiator core) as one InstancedMesh.
 * Each fin is `finW × finH` in the plane perpendicular to `along`, `thick` thick,
 * pitched `pitch` apart along that axis; the stack is centred at `at`. */
export function finStack(
  count: number, pitch: number, finW: number, finH: number, thick: number,
  mat: THREE.Material, along: "x" | "y" | "z", at: V3 = [0, 0, 0],
): THREE.InstancedMesh {
  const size: V3 = along === "x" ? [thick, finH, finW] : along === "y" ? [finW, thick, finH] : [finW, finH, thick];
  const geo = new THREE.BoxGeometry(...size);
  const im = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const span = (count - 1) * pitch;
  for (let i = 0; i < count; i++) {
    const o = -span / 2 + i * pitch;
    const p: V3 = [at[0], at[1], at[2]];
    p[along === "x" ? 0 : along === "y" ? 1 : 2] += o;
    m.makeTranslation(...p);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = im.receiveShadow = true;
  return im;
}

/** A row of `count` identical small parts (DIMM chips, NAND packages, VRM chokes). */
export function chipRow(
  count: number, pitch: number, w: number, h: number, d: number,
  mat: THREE.Material, along: "x" | "y" | "z", at: V3 = [0, 0, 0],
): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, d), mat, count);
  const m = new THREE.Matrix4();
  const span = (count - 1) * pitch;
  for (let i = 0; i < count; i++) {
    const p: V3 = [at[0], at[1], at[2]];
    p[along === "x" ? 0 : along === "y" ? 1 : 2] += -span / 2 + i * pitch;
    m.makeTranslation(...p);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = im.receiveShadow = true;
  return im;
}

/** A sleeved cable / coolant tube along a smooth curve through `points`. */
export function sleeve(points: V3[], radius: number, mat: THREE.Material = MAT.sleeve, segments = 48): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.5);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 12, false), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A flat ribbon cable (24-pin style): several sleeved strands side by side. */
export function ribbon(points: V3[], strands: number, strandR: number, spread: number, mat: THREE.Material = MAT.sleeve): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < strands; i++) {
    const o = -spread / 2 + (spread * i) / Math.max(1, strands - 1);
    g.add(sleeve(points.map(([x, y, z]) => [x + o, y, z] as V3), strandR, mat, 40));
  }
  return g;
}

/** An axial fan: square frame with a round opening, hub and swept blades.
 * Built in the XY plane with its airflow axis along +Z and centred on the
 * origin; rotate the returned group to aim it. `rotor` spins in animate(). */
export function fan(
  size: number, thick: number, opts: { blades?: number; rgb?: number; hubR?: number } = {},
): { group: THREE.Group; rotor: THREE.Group } {
  const blades = opts.blades ?? 9;
  const hubR = opts.hubR ?? size * 0.17;
  const g = new THREE.Group();
  const holeR = size * 0.47;
  g.add(plateWithHole(size, size, thick, holeR, MAT.plastic, "z", [0, 0, 0], size * 0.06));
  // corner screw bosses
  const off = size / 2 - 7.5;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    g.add(cyl(2.2, thick + 0.4, MAT.alu, "z", [sx * off, sy * off, 0], 12));
  }
  const rotor = new THREE.Group();
  // every fan of a size shares one rotor shape in the parts library
  rotor.userData.libId = `fan-rotor-${size}`;
  rotor.add(cyl(hubR, thick * 0.8, MAT.plastic, "z", [0, 0, 0], 32));
  const bladeLen = holeR - hubR - 1.5;
  const bladeGeo = new THREE.BoxGeometry(bladeLen, size * 0.14, 1.2);
  bladeGeo.translate(hubR + bladeLen / 2, 0, 0);
  for (let i = 0; i < blades; i++) {
    const b = new THREE.Mesh(bladeGeo, MAT.blade);
    b.rotation.z = (i / blades) * Math.PI * 2;
    b.rotateX(0.62); // pitch
    b.castShadow = true;
    rotor.add(b);
  }
  g.add(rotor);
  // three struts holding the hub
  for (let i = 0; i < 3; i++) {
    const s = box(holeR - hubR * 0.6, 4, 2, MAT.plastic, [0, 0, -thick / 2 + 1.5]);
    s.geometry.translate((holeR + hubR * 0.6) / 2, 0, 0);
    s.rotation.z = (i / 3) * Math.PI * 2 + Math.PI / 6;
    g.add(s);
  }
  if (opts.rgb) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(holeR + 1.2, 1.4, 8, 64), glow(opts.rgb, 0.9));
    ring.position.z = thick / 2 - 1;
    g.add(ring);
  }
  return { group: g, rotor };
}

/** A canvas-drawn status screen (LCD / OLED) — generic readouts only, no marks. */
export function screen(
  w: number, h: number, lines: string[], opts: { bg?: string; fg?: string; accent?: string } = {},
): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 512; c.height = Math.round((512 * h) / w);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = opts.bg ?? "#06070a";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = opts.accent ?? "#e8a33a";
  ctx.fillRect(24, 24, c.width - 48, 4);
  ctx.fillStyle = opts.fg ?? "#e8e6df";
  const size = Math.floor(c.height / (lines.length + 1.2));
  ctx.font = `600 ${size}px "Space Grotesk", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, 28, 44 + i * size * 1.05));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.3 }),
  );
  return m;
}

// ── nodes ──────────────────────────────────────────────────────────────────

/** Wrap objects as one inspectable node. Meshes in `objects` (recursively)
 * are tagged with the id; `children` nodes are parented under it so the
 * explode offsets accumulate down the tree. */
export function node(
  id: PartId, objects: THREE.Object3D[], opts: { explode?: ExplodeSpec; children?: PartNode[]; at?: V3 } = {},
): PartNode {
  const group = new THREE.Group();
  group.name = id;
  const meshes: THREE.Mesh[] = [];
  for (const o of objects) {
    group.add(o);
    if (o.userData.libId) group.userData.libId = o.userData.libId;
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.userData.partId = id;
        meshes.push(c as THREE.Mesh);
      }
    });
  }
  const children = opts.children ?? [];
  for (const ch of children) group.add(ch.object);
  if (opts.at) group.position.set(...opts.at);
  return { id, object: group, meshes, children, explode: opts.explode, home: group.position.clone() };
}

/** A fan as an inspectable node with its rotor as a child node. The rotor node is
 * re-parented INTO the fan's own group so it inherits the fan's orientation and
 * position; the part tree still records it as a child, so it explodes along the
 * fan's LOCAL axis (`rotorDir`; local +Z is the airflow direction). */
export function fanNode(
  id: PartId, rotorId: PartId, f: { group: THREE.Group; rotor: THREE.Group },
  opts: { explode?: ExplodeSpec; rotorDir?: [number, number, number]; rotorDist?: number } = {},
): PartNode {
  const rotorNode = node(rotorId, [f.rotor], { explode: { stage: 4, dir: opts.rotorDir ?? [0, 0, 1], dist: opts.rotorDist ?? 45 } });
  const fanN = node(id, [f.group], { explode: opts.explode, children: [rotorNode] });
  f.group.add(rotorNode.object); // three re-parents it; the tree keeps it as a child
  return fanN;
}

/** Tag a node's meshes as non-pickable set dressing (screws, struts) — they still render. */
export function decor<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { c.userData.decor = true; });
  return o;
}

/** Degrees → radians, for readable rotations in builders. */
export const deg = (d: number) => (d * Math.PI) / 180;
