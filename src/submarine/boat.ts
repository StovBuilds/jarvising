// The submarine: an early British T-class, bulbous bow and all.
// x runs from the stern (−42) to the bow (+42): 84 m overall.
import * as THREE from "three";
import { TAU, clamp, lerp } from "./constants";
import { bez, curveSet, makeProfile, mesh, range, ringLower, ringUpper, sweep } from "./geometry";
import type { Materials } from "./materials";

export const COMPS = [
  { x0: 25, x1: 33, name: "Tube space" },
  { x0: 12, x1: 25, name: "Torpedo stowage & mess" },
  { x0: 0, x1: 12, name: "Control room" },
  { x0: -10, x1: 0, name: "Wardroom, galley & battery" },
  { x0: -23, x1: -10, name: "Engine room" },
  { x0: -33, x1: -23, name: "Motor room & steering" },
];

// pressure hull radius along the boat
export const rPH = (x: number) => {
  const mid = 2.45;
  if (x > 24) return mid - (mid - 1.55) * Math.pow(Math.min(1, (x - 24) / 9), 1.6);
  if (x < -23) return mid - (mid - 1.0) * Math.pow(Math.min(1, (-23 - x) / 10), 1.6);
  return mid;
};

export function buildBoat(M: Materials) {
  const H = curveSet({
    a: [[-42, .04], [-39.5, .6], [-35, 1.45], [-28, 2.3], [-18, 2.72], [0, 2.8], [18, 2.76], [27, 2.45], [33, 1.95], [37.5, 1.5], [40, 1.22], [41.5, 1.06], [42.5, .9], [43.2, .62], [43.5, .36], [43.68, .04]],
    b: [[-42, .5], [-39.5, -.55], [-35, -1.5], [-28, -2.3], [-18, -2.62], [0, -2.65], [18, -2.62], [27, -2.45], [33, -2.0], [37.5, -1.3], [39.5, -.8], [41, -.35], [42.3, .1], [43.1, .55], [43.5, .95], [43.68, 1.3]],
    m: [[-42, 1.0], [-35, .4], [-28, .2], [0, .1], [27, .2], [33, .45], [37.5, .8], [40.5, 1.1], [42.3, 1.3], [43.68, 1.35]],
    t: [[-42, 1.9], [-38, 2.35], [-32, 2.8], [-24, 3.05], [0, 3.15], [22, 3.15], [30, 3.3], [36, 3.6], [40, 3.9], [41.5, 4.0], [42.4, 3.72], [43.1, 3.0], [43.5, 2.1], [43.68, 1.4]],
    dw: [[-42, .03], [-38, .4], [-32, .9], [-24, 1.2], [0, 1.35], [22, 1.3], [30, 1.05], [36, .7], [40, .35], [41.5, .15], [42.4, .04], [43.68, .02]],
  });
  const subProfile = makeProfile(H, 2.5);
  const sub = new THREE.Group();
  const P = { // exploded-view parts
    upper: new THREE.Group(), lower: new THREE.Group(), tower: new THREE.Group(),
    tankS: new THREE.Group(), tankP: new THREE.Group(), stern: new THREE.Group(),
    inner: new THREE.Group(), wires: new THREE.Group(),
    leaders: null as unknown as THREE.LineSegments<THREE.BufferGeometry, THREE.LineDashedMaterial>,
    props: [] as { g: THREE.Group; dir: number }[],
    scopeA: null as unknown as THREE.Mesh,
    scopeB: null as unknown as THREE.Mesh,
    comps: [] as THREE.Group[],
  };
  sub.add(P.upper, P.lower, P.tower, P.tankS, P.tankP, P.stern, P.inner, P.wires);

  {
    const xs = [...range(-42, 40.9, 166), ...range(41.05, 43.68, 22)];
    mesh(sweep(xs, ringUpper(subProfile)), M.hull, 0, 0, 0, P.upper);
    mesh(sweep(xs, ringLower(subProfile)), M.hull, 0, 0, 0, P.lower);

    // casing deck
    const dx = range(-38, 40.5, 110), pos: number[] = [], uv: number[] = [], idx: number[] = [];
    dx.forEach((x, i) => {
      const w = H.dw(x) * 0.93, y = H.t(x) + 0.03;
      pos.push(x, y, -w, x, y, w); uv.push(x / 7, 0, x / 7, 1);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    dg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    dg.setIndex(idx); dg.computeVertexNormals();
    mesh(dg, M.deck, 0, 0, 0, P.upper, false);

    // free-flooding holes along the casing
    const holes: number[] = [];
    for (let x = -33; x <= 33.5; x += 0.9) { if (x > -5.8 && x < 15) continue; holes.push(x); }
    const hm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.2, 0.12), M.black, holes.length * 2);
    const d = new THREE.Object3D(); let k = 0;
    for (const x of holes) for (const side of [1, -1]) {
      const Pp = subProfile(x), p0 = Pp[12], p2 = Pp[22];
      const ctl: [number, number] = [p0[0], H.t(x)];
      const [z, y] = bez(p0, ctl, p2, 0.5), [z2, y2] = bez(p0, ctl, p2, 0.52);
      const nz = (y2 - y), ny = -(z2 - z);
      d.position.set(x, y, z * side);
      d.lookAt(x, y + ny, (z + nz * 3) * side);
      d.updateMatrix(); hm.setMatrixAt(k++, d.matrix);
    }
    P.upper.add(hm);

    // the bulbous bow (built into the sections above) holds the two external bow tubes
    for (const s of [1, -1]) {
      const mouth = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.9, 20), M.black, 43.05, 1.3, s * 0.4, P.lower, false);
      mouth.rotation.z = Math.PI / 2;
      mesh(new THREE.TorusGeometry(0.29, 0.045, 8, 24), M.steel, 43.48, 1.3, s * 0.4, P.lower, false).rotation.y = Math.PI / 2;
    }

    // saddle tanks
    const tankGeo = (() => {
      const pts = range(-24, 26, 56).map((x) => new THREE.Vector2(Math.max(0.001, Math.pow(Math.sin(Math.PI * (x + 24) / 50), 0.38)), x));
      const g = new THREE.LatheGeometry(pts, 40); g.rotateZ(-Math.PI / 2); g.scale(1, 2.0, 0.95); return g;
    })();
    mesh(tankGeo, M.tank, 0, -0.5, 2.55, P.tankS);
    mesh(tankGeo, M.tank, 0, -0.5, -2.55, P.tankP);

    // keel, the boat's own ASDIC dome, bow planes
    mesh(new THREE.BoxGeometry(52, 0.3, 0.44), M.dark, 0, -2.74, 0, P.lower);
    const dome = mesh(new THREE.SphereGeometry(0.6, 20, 12), M.steel, 29, H.b(29) - 0.05, 0, P.lower); dome.scale.set(1.4, 0.75, 1);
    for (const s of [1, -1]) {
      const bp = mesh(new THREE.BoxGeometry(2.1, 0.1, 1.9), M.steel, 35.2, H.t(35.2) - 0.75, s * (H.dw(35.2) + 1.35), P.upper);
      bp.rotation.x = s * -0.05;
    }

    // two external tubes amidships, angled out and firing forward
    for (const s of [1, -1]) {
      const g = new THREE.Group(); g.position.set(11.0, 2.15, s * 2.5); g.rotation.y = -s * 0.06; P.upper.add(g);
      mesh(new THREE.CylinderGeometry(0.4, 0.4, 7.0, 18), M.hull, 0, 0, 0, g).rotation.z = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 18), M.black, 3.52, 0, 0, g, false).rotation.z = Math.PI / 2;
    }

    // stern gear: twin screws on brackets, one rudder, stern planes
    const bs = new THREE.Shape();
    bs.moveTo(0.1, -0.08); bs.quadraticCurveTo(0.5, -0.36, 0.86, -0.12); bs.quadraticCurveTo(0.96, 0.06, 0.8, 0.2); bs.quadraticCurveTo(0.4, 0.3, 0.1, 0.1); bs.lineTo(0.1, -0.08);
    const bg = new THREE.ShapeGeometry(bs, 8); bg.rotateY(Math.PI / 2); bg.rotateX(Math.PI / 2); bg.scale(1.05, 1.05, 1.05);
    for (const s of [1, -1]) {
      mesh(new THREE.CylinderGeometry(0.13, 0.13, 6.6, 12), M.steel, -36.2, -1.0, s * 1.5, P.stern).rotation.z = Math.PI / 2;
      mesh(new THREE.BoxGeometry(0.55, 1.5, 0.1), M.steel, -38.6, -0.45, s * 1.15, P.stern).rotation.x = s * 0.55;
      const prop = new THREE.Group(); prop.position.set(-39.7, -1.0, s * 1.5);
      mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.6, 16), M.bronze, 0, 0, 0, prop).rotation.z = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const holder = new THREE.Group(); holder.rotation.x = i * TAU / 3;
        mesh(bg, M.bronze, 0, 0, 0, holder).rotation.y = 0.55 * s;
        prop.add(holder);
      }
      P.stern.add(prop); P.props.push({ g: prop, dir: s });
    }
    mesh(new THREE.BoxGeometry(1.7, 2.9, 0.12), M.steel, -41.9, -0.95, 0, P.stern);
    mesh(new THREE.BoxGeometry(1.5, 0.1, 6.8), M.steel, -41.0, -0.95, 0, P.stern);

    // net cutter at the stem, bollards, hatches
    const nc = new THREE.Shape();
    nc.moveTo(0, 0); nc.lineTo(2.3, 0.15); nc.lineTo(3.1, 1.75);
    for (let i = 1; i <= 7; i++) { const t = i / 7; nc.lineTo(lerp(3.1, 0, t) + 0.12, lerp(1.75, 0.35, t) + (i % 2 ? 0.28 : 0)); }
    nc.lineTo(0, 0);
    const ncg = new THREE.ExtrudeGeometry(nc, { depth: 0.07, bevelEnabled: false }); ncg.translate(0, 0, -0.035);
    mesh(ncg, M.steel, 38.8, H.t(38.8) - 0.05, 0, P.upper);
    for (const x of [34, 26, -22, -31]) for (const s of [1, -1]) mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 10), M.dark, x, H.t(x) + 0.17, s * 0.8, P.upper);
    mesh(new THREE.BoxGeometry(1.7, 0.14, 0.9), M.dark, 27, H.t(27) + 0.07, 0, P.upper);
    mesh(new THREE.BoxGeometry(1.2, 0.12, 0.8), M.dark, -16, H.t(-16) + 0.06, 0, P.upper);
  }

  // The bridge fairwater: 4-inch gun forward behind its breastwork, periscope standards, radar, Oerlikon aft
  {
    const T = P.tower;
    const ext = (shape: THREE.Shape, depth: number, y: number) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 18 }); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };
    const bridge = (k = 1) => {
      const s = new THREE.Shape();
      s.moveTo(-5.9 * k, 0.6 * k); s.lineTo(2.6 * k, 1.22 * k);
      s.quadraticCurveTo(5.6 * k, 1.22 * k, 5.9 * k, 0); s.quadraticCurveTo(5.6 * k, -1.22 * k, 2.6 * k, -1.22 * k);
      s.lineTo(-5.9 * k, -0.6 * k); s.quadraticCurveTo(-6.4 * k, 0, -5.9 * k, 0.6 * k);
      return s;
    };
    // rake: the front leans back and the sides draw in as the fairwater rises
    const rake = (geo: THREE.BufferGeometry, y0: number, y1: number, front: number, side: number) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const f = clamp((p.getY(i) - y0) / (y1 - y0), 0, 1), x = p.getX(i);
        p.setX(i, x > 0 ? x * (1 - front * f) : x * (1 - 0.03 * f));
        p.setZ(i, p.getZ(i) * (1 - side * f));
      }
      geo.computeVertexNormals();
      return geo;
    };
    const BX = 2.2, BR = (g: THREE.BufferGeometry) => rake(g, 2.7, 7.2, 0.16, 0.1);
    mesh(BR(ext(bridge(1), 3.4, 2.7)), M.hull, BX, 0, 0, T);
    const wall = bridge(0.96); wall.holes.push(bridge(0.87));
    mesh(BR(ext(wall, 1.1, 6.0)), M.hull, BX, 0, 0, T);
    const lip = bridge(1.02); lip.holes.push(bridge(0.9));
    mesh(BR(ext(lip, 0.12, 7.08)), M.steel, BX, 0, 0, T);
    mesh(BR(ext(bridge(0.87), 0.04, 6.2)), M.dark, BX, 0, 0, T, false);

    // gun platform and breastwork, lower than the bridge
    const gunDeck = (k = 1) => {
      const s = new THREE.Shape();
      s.moveTo(-2.9 * k, 1.12 * k); s.lineTo(0.6 * k, 1.12 * k);
      s.quadraticCurveTo(2.8 * k, 1.08 * k, 3.0 * k, 0); s.quadraticCurveTo(2.8 * k, -1.08 * k, 0.6 * k, -1.12 * k);
      s.lineTo(-2.9 * k, -1.12 * k); s.lineTo(-2.9 * k, 1.12 * k);
      return s;
    };
    const GX = 9.8, GR = (g: THREE.BufferGeometry) => rake(g, 2.7, 5.9, 0.1, 0.08);
    mesh(GR(ext(gunDeck(1), 2.15, 2.7)), M.hull, GX, 0, 0, T);
    const bw = gunDeck(1); bw.holes.push(gunDeck(0.9));
    mesh(GR(ext(bw, 1.0, 4.85)), M.hull, GX, 0, 0, T);
    mesh(GR(ext(gunDeck(0.9), 0.04, 4.9)), M.dark, GX, 0, 0, T, false);

    // QF 4-inch gun
    const gun = new THREE.Group(); gun.position.set(10.3, 4.95, 0); T.add(gun);
    mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.14, 24), M.steel, 0, 0.07, 0, gun);
    mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.95, 16), M.steel, 0, 0.58, 0, gun);
    const cradle = new THREE.Group(); cradle.position.set(0, 1.15, 0); cradle.rotation.z = 0.05; gun.add(cradle);
    mesh(new THREE.BoxGeometry(1.6, 0.45, 0.52), M.steel, 0.05, 0, 0, cradle);
    mesh(new THREE.BoxGeometry(0.6, 0.38, 0.4), M.dark, -1.0, 0.02, 0, cradle);
    mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 14), M.steel, 3.05, 0.08, 0, cradle).rotation.z = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 12), M.steel, 1.45, -0.17, 0, cradle).rotation.z = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.2, 14), M.dark, 5.3, 0.08, 0, cradle).rotation.z = Math.PI / 2;
    for (const s of [1, -1]) mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), M.dark, -0.35, -0.58, s * 0.5, cradle);

    // periscope standards fairing and the two periscopes
    const fin = new THREE.Shape(); fin.absellipse(0, 0, 2.0, 0.4, 0, TAU, false);
    mesh(ext(fin, 2.2, 6.1), M.hull, 2.6, 0, 0, T);
    P.scopeA = mesh(new THREE.CylinderGeometry(0.085, 0.1, 6, 10), M.steel, 3.7, 5.25, 0, T);
    mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.45, 10), M.dark, 0, 2.9, 0, P.scopeA);
    P.scopeB = mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.5, 10), M.steel, 1.6, 5.5, 0, T);
    mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.3, 10), M.dark, 0, 2.8, 0, P.scopeB);

    // radar mast with its dipole aerial
    mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8), M.steel, 0.1, 7.8, 0, T, false);
    const ae = new THREE.Group(); ae.position.set(0.1, 9.55, 0); T.add(ae);
    mesh(new THREE.BoxGeometry(0.08, 0.08, 1.5), M.steel, 0, 0, 0, ae, false);
    for (const z of [-0.6, -0.2, 0.2, 0.6]) mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), M.steel, 0, 0, z, ae, false);

    // Oerlikon on its bandstand, aft of the bridge
    const OX = -4.9;
    mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.4, 16), M.hull, OX, 4.3, 0, T);
    mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 28), M.steel, OX, 5.5, 0, T);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), M.steel, OX + Math.cos(a) * 1.05, 6.0, Math.sin(a) * 1.05, T, false); }
    mesh(new THREE.TorusGeometry(1.05, 0.035, 6, 36), M.steel, OX, 6.45, 0, T, false).rotation.x = Math.PI / 2;
    const oe = new THREE.Group(); oe.position.set(OX, 5.56, 0); T.add(oe);
    mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 10), M.steel, 0, 0.45, 0, oe);
    const og = new THREE.Group(); og.position.y = 1.0; og.rotation.z = 0.5; oe.add(og);
    mesh(new THREE.BoxGeometry(0.6, 0.2, 0.2), M.dark, 0, 0, 0, og);
    mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.4, 8), M.steel, 0.95, 0, 0, og).rotation.z = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.05, 0.55, 0.8), M.steel, 0.35, 0.1, 0, og);
  }

  // Jumping wires (hidden while opened up)
  {
    const wire = (a: [number, number, number], b: [number, number, number]) => {
      const c = new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b));
      mesh(new THREE.TubeGeometry(c, 1, 0.035, 5), M.steel, 0, 0, 0, P.wires, false);
    };
    wire([42.0, 5.55, 0], [4.6, 8.3, 0]);
    wire([0.6, 8.2, 0], [-40.4, 2.9, 0]);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), M.steel, -40.4, 2.35, 0, P.wires, false);
  }

  // Pressure hull, split into compartments with their contents
  {
    const OPEN = Math.PI * 1.5;
    const lamps = [M.lampR, M.lampA, M.lampG];
    type G = THREE.Object3D;
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, g: G) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, g);
    const cyl = (r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, g: G) => { const m = mesh(new THREE.CylinderGeometry(r, r, len, 18), mat, x, y, z, g); m.rotation.z = Math.PI / 2; return m; };
    const lampRow = (g: G, x0: number, x1: number, y: number, z: number, n: number) => { for (let i = 0; i < n; i++) mesh(new THREE.SphereGeometry(0.045, 8, 6), lamps[(i * 7 + Math.round(x0)) % 3], lerp(x0, x1, (i + 0.5) / n), y, z, g, false); };
    const battery = (g: G, x0: number, x1: number) => {
      const cells: [number, number][] = [];
      for (let x = x0 + 0.5; x < x1 - 0.4; x += 0.44) for (const z of [0.4, 0.85, 1.3]) cells.push([x, z]);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.8, 0.38), M.batt, cells.length);
      const d = new THREE.Object3D();
      cells.forEach(([x, z], i) => { d.position.set(x, -1.55, z); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      im.castShadow = false; g.add(im);
      box(x1 - x0 - 0.3, 0.08, 2.2, M.paint, (x0 + x1) / 2, -1.05, -0.95, g);
    };
    const bunks = (g: G, x0: number, x1: number, z: number) => { for (const y of [-0.3, 0.45]) box(x1 - x0 - 0.6, 0.07, 0.7, M.bunk, (x0 + x1) / 2, y, z, g); };

    P.comps = COMPS.map((c, i) => {
      const g = new THREE.Group(); P.inner.add(g);
      const pts = range(c.x0, c.x1, Math.max(3, Math.ceil((c.x1 - c.x0) / 0.5))).map((x) => new THREE.Vector2(rPH(x), x));
      const shell = new THREE.LatheGeometry(pts, 44, 0, OPEN); shell.rotateZ(-Math.PI / 2);
      mesh(shell, M.ph, 0, 0, 0, g);
      mesh(shell, M.phIn, 0, 0, 0, g, false);
      for (const x of [c.x0, c.x1]) {
        const r = rPH(x) * 0.985;
        const disc = new THREE.CircleGeometry(r, 44, Math.PI, OPEN); disc.rotateY(Math.PI / 2);
        mesh(disc, M.bulk, x, 0, 0, g, false);
        if (r > 1.9) {
          const ring = new THREE.RingGeometry(0.44, 0.52, 36); ring.rotateY(Math.PI / 2);
          for (const s of [1, -1]) mesh(ring, M.hatch, x + s * 0.02, -0.25, 0, g, false);
          const hole = new THREE.CircleGeometry(0.44, 36); hole.rotateY(Math.PI / 2);
          for (const s of [1, -1]) mesh(hole, M.black, x + s * 0.015, -0.25, 0, g, false);
        }
      }
      const xm = (c.x0 + c.x1) / 2;
      if (i === 0) { // six internal bow tubes, running forward out of the pressure hull
        for (const y of [0.85, 0, -0.85]) for (const z of [0.52, -0.52]) {
          cyl(0.27, 6.2, M.torp, 30.6, y, z, g);
          cyl(0.33, 0.14, M.mach, 27.45, y, z, g);
        }
        box(1.6, 0.06, 2.4, M.paint, 26.2, -1.3, 0, g);
        lampRow(g, 25.6, 27.2, 1.0, -1.3, 3);
      } else if (i === 1) { // reload torpedoes, then the seamen's mess
        box(12.4, 0.08, 3.6, M.paint, 18.5, -1.45, 0, g);
        for (const y of [-1.05, -0.35]) for (const z of [1.1, -1.1]) {
          cyl(0.27, 6.7, M.torp, 21.2, y, z, g);
          const nose = mesh(new THREE.SphereGeometry(0.27, 14, 10), M.dark, 24.55, y, z, g); nose.scale.x = 1.8;
        }
        bunks(g, 12.3, 17.4, -1.55);
        box(2.0, 0.06, 0.8, M.paint, 14.8, -0.25, 0.5, g);
        lampRow(g, 12.5, 24.5, 1.55, -1.1, 7);
      } else if (i === 2) { // control room
        box(11.7, 0.08, 4.0, M.paint, xm, -1.1, 0, g);
        for (const x of [1.6, 3.7]) mesh(new THREE.CylinderGeometry(0.17, 0.17, 3.2, 14), M.mach, x, 0.5, 0, g);
        for (const x of [6.4, 7.4]) mesh(new THREE.TorusGeometry(0.34, 0.045, 6, 22), M.mach, x, -0.1, -1.45, g);
        box(1.3, 0.9, 0.7, M.paint, 9.8, -0.55, 1.4, g);
        box(2.6, 1.0, 0.08, M.mach, 3.0, 0.85, -1.85, g);
        lampRow(g, 1.8, 4.2, 0.95, -1.8, 7);
        for (let k = 0; k < 5; k++) mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 16), M.lampR, 8.6 + k * 0.45, 0.4, -1.9, g, false);
        mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 20), M.mach, 11.2, 0, 0, g).rotation.y = Math.PI / 2;
        lampRow(g, 8.6, 10.6, -0.1, -1.8, 5);
        for (const z of [0.25, -0.25]) box(0.05, 3.0, 0.05, M.mach, 5.5, 0.4, z, g);
      } else if (i === 3) { // wardroom and galley over the battery
        battery(g, c.x0, c.x1);
        bunks(g, -9.6, -5.2, -1.6);
        box(2.2, 0.06, 0.9, M.paint, -3.2, -0.25, -0.9, g);
        box(1.1, 0.9, 0.7, M.mach, -1.2, -0.55, -1.35, g);
        mesh(new THREE.SphereGeometry(0.05, 8, 6), M.lampA, -1.2, 0.0, -1.0, g, false);
        lampRow(g, -9.4, -0.6, 1.5, -1.1, 5);
      } else if (i === 4) { // two diesels
        box(c.x1 - c.x0 - 0.3, 0.08, 1.0, M.paint, xm, -1.05, 0, g);
        for (const z of [1.05, -1.05]) {
          box(9.4, 1.1, 0.9, M.mach, xm, -0.5, z, g);
          for (let k = 0; k < 8; k++) box(0.6, 0.35, 0.55, M.steel, xm - 4.2 + k * 1.2, 0.22, z, g);
          cyl(0.13, 9.6, M.bronze, xm, 0.55, z * 1.35, g);
        }
        lampRow(g, c.x0 + 0.8, c.x1 - 0.8, 1.55, -0.6, 6);
      } else if (i === 5) { // main motors, switchboard, steering gear
        box(5.0, 0.08, 2.6, M.paint, -25.8, -1.0, 0, g);
        for (const z of [0.8, -0.8]) cyl(0.5, 2.4, M.mach, -25.6, -0.4, z, g);
        box(2.2, 1.3, 0.12, M.mach, -24.8, 0.55, -1.7, g);
        lampRow(g, -25.8, -23.9, 0.75, -1.62, 8);
        box(1.4, 0.8, 1.0, M.mach, -30.2, -0.2, 0, g);
      }
      g.userData = { i, c, base: 0 };
      return g;
    });
    P.inner.visible = false;
  }

  // Exploded-view leader lines
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 12), 3));
    const m = new THREE.LineDashedMaterial({ color: 0x8fe6ee, dashSize: 0.5, gapSize: 0.45, transparent: true, opacity: 0, depthWrite: false });
    P.leaders = new THREE.LineSegments(g, m);
    P.leaders.frustumCulled = false;
    sub.add(P.leaders);
  }
  sub.traverse((o) => { if ((o as THREE.Mesh).isMesh && !((o as THREE.Mesh).material as THREE.Material & { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial) o.receiveShadow = true; });

  return { sub, P };
}
export type Boat = ReturnType<typeof buildBoat>;
