// A hut at Bletchley Park, night, 1940 — the room the machine sits in.
// Everything procedural (canvas textures + primitives), same as the machine.
//
// Scale: the machine case is 3.0 units wide ≈ 34 cm, so 1 unit ≈ 11 cm.
// The desk top sits just under the case bottom (y ≈ −0.56); the floor is a
// desk-height (~75 cm ≈ 6.6 units) below that. Camera keys keep the viewer
// in front of the machine (+z), so the back wall carries the set dressing.

import * as THREE from "three";

export interface RoomBuild {
  root: THREE.Group;
  /** where the bombe (a lazily loaded GLB) stands: floor point + yaw */
  bombeSlot: { position: THREE.Vector3; rotationY: number };
  /** where the pendant bulb hangs — put the key light here */
  lampPos: THREE.Vector3;
  /** second pendant, over the bombe — a plain point light will do */
  lampPos2: THREE.Vector3;
  /** direction the blackout-window slit leaks moonlight from */
  moonDir: THREE.Vector3;
  /** meshes that should receive the machine's shadow */
  receivers: THREE.Mesh[];
}

const DESK_Y = -0.62;      // top surface of the desk board
const FLOOR_Y = -7.2;
const WALL_Z = -6.2;
const WALL_X = 16;          // wide enough for a 2 m bombe along the right wall
const CEIL_Y = 12.5;

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed = 1): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  let a = seed >>> 0;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  draw(c.getContext("2d")!, r);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'JetBrains Mono', 'Courier New', monospace";

// Painted timber boards — the huts were wooden, boarded inside, painted a
// tired cream over a dark dado. Used for the walls.
function boardsTex(seed: number, w = 1024, h = 1024): THREE.CanvasTexture {
  return tex(w, h, (g, r) => {
    g.fillStyle = "#5d5a46";
    g.fillRect(0, 0, w, h);
    const bh = h / 14;
    for (let i = 0; i < 14; i++) {
      const y = i * bh;
      const shade = 0.88 + r() * 0.16;
      g.fillStyle = `rgb(${Math.round(93 * shade)},${Math.round(90 * shade)},${Math.round(70 * shade)})`;
      g.fillRect(0, y, w, bh - 3);
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(0, y + bh - 3, w, 3);
      for (let k = 0; k < 24; k++) {
        g.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.07})`;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        const yy = y + r() * bh;
        g.moveTo(0, yy);
        g.bezierCurveTo(w * 0.3, yy + (r() - 0.5) * 6, w * 0.6, yy + (r() - 0.5) * 6, w, yy + (r() - 0.5) * 4);
        g.stroke();
      }
    }
    // grime gradient — darker toward the floor
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(0,0,0,0.15)");
    gr.addColorStop(0.6, "rgba(0,0,0,0.25)");
    gr.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, seed);
}

function floorTex(): THREE.CanvasTexture {
  const t = tex(1024, 1024, (g, r) => {
    g.fillStyle = "#3a2a18";
    g.fillRect(0, 0, 1024, 1024);
    const pw = 1024 / 8;
    for (let i = 0; i < 8; i++) {
      const off = (i % 2) * 300;
      for (let seg = -1; seg < 3; seg++) {
        const y0 = seg * 512 + off;
        const shade = 0.75 + r() * 0.4;
        g.fillStyle = `rgb(${Math.round(70 * shade)},${Math.round(50 * shade)},${Math.round(28 * shade)})`;
        g.fillRect(i * pw + 2, y0 + 2, pw - 4, 508);
        for (let k = 0; k < 30; k++) {
          g.strokeStyle = `rgba(20,10,0,${0.08 + r() * 0.15})`;
          g.lineWidth = 1 + r() * 1.5;
          g.beginPath();
          const x = i * pw + 6 + r() * (pw - 12);
          g.moveTo(x, y0);
          g.bezierCurveTo(x + (r() - 0.5) * 10, y0 + 170, x + (r() - 0.5) * 10, y0 + 340, x + (r() - 0.5) * 6, y0 + 512);
          g.stroke();
        }
      }
    }
    const v = g.createRadialGradient(512, 512, 200, 512, 512, 760);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = v;
    g.fillRect(0, 0, 1024, 1024);
  }, 9);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

// The cork board: index cards, a MOST SECRET sheet, a duty rota. Drawn flat.
function noticeTex(): THREE.CanvasTexture {
  return tex(1024, 768, (g, r) => {
    g.fillStyle = "#7a5a34";
    g.fillRect(0, 0, 1024, 768);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = r() > 0.5 ? "rgba(255,220,160,0.05)" : "rgba(0,0,0,0.12)";
      g.fillRect(r() * 1024, r() * 768, 2 + r() * 3, 2 + r() * 3);
    }
    g.fillStyle = "#3a2a16";
    g.fillRect(0, 0, 1024, 26); g.fillRect(0, 742, 1024, 26); g.fillRect(0, 0, 26, 768); g.fillRect(998, 0, 26, 768);
    const card = (x: number, y: number, w: number, h: number, rot: number, draw: () => void) => {
      g.save();
      g.translate(x + w / 2, y + h / 2);
      g.rotate(rot);
      g.translate(-w / 2, -h / 2);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(4, 6, w, h);
      g.fillStyle = "#e9dfc4";
      g.fillRect(0, 0, w, h);
      draw();
      // drawing pin
      g.fillStyle = "#b8332a";
      g.beginPath(); g.arc(w / 2, 10, 7, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    card(60, 70, 420, 300, -0.03, () => {
      g.fillStyle = "#b8332a";
      g.font = `bold 34px ${SERIF}`;
      g.fillText("MOST SECRET", 30, 60);
      g.fillStyle = "#2a2418";
      g.font = `20px ${MONO}`;
      const lines = [
        "TO BE KEPT UNDER LOCK AND KEY",
        "",
        "No document bearing this mark",
        "leaves the hut. Not to be",
        "discussed in the canteen,",
        "the billet, or the bus.",
        "",
        "         — Hut 6 Watch",
      ];
      lines.forEach((l, i) => g.fillText(l, 30, 100 + i * 26));
    });
    card(540, 60, 400, 220, 0.02, () => {
      g.fillStyle = "#2a2418";
      g.font = `bold 22px ${MONO}`;
      g.fillText("WATCH ROTA — NIGHT", 24, 40);
      g.font = `18px ${MONO}`;
      ["00:00  Registration", "02:00  Machine room", "04:00  Relief — tea", "06:00  Decoding room"].forEach((l, i) => g.fillText(l, 24, 80 + i * 30));
      g.strokeStyle = "#8a8272";
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(20, 56 + i * 30); g.lineTo(380, 56 + i * 30); g.stroke(); }
    });
    card(560, 320, 380, 200, -0.015, () => {
      g.fillStyle = "#2a2418";
      g.font = `bold 20px ${MONO}`;
      g.fillText("CRIB — RED, 14 Nov", 24, 40);
      g.font = `18px ${MONO}`;
      g.fillText("WETTERVORHERSAGE", 24, 80);
      g.fillText("KEINEBESONDEREN", 24, 108);
      g.fillText("EREIGNISSE", 24, 136);
      g.fillStyle = "#b8332a";
      g.font = `italic 17px ${SERIF}`;
      g.fillText("(guess the plaintext first)", 24, 172);
    });
    card(90, 420, 380, 260, 0.025, () => {
      g.fillStyle = "#2a2418";
      g.font = `bold 20px ${MONO}`;
      g.fillText("REMEMBER", 24, 40);
      g.font = `17px ${MONO}`;
      ["A letter never encrypts", "to itself.", "", "If the crib's A lands on", "an A, slide it along.", "", "The reflector did that.", "Thank the reflector."].forEach((l, i) => g.fillText(l, 24, 76 + i * 24));
    });
  }, 3);
}

function hutSignTex(): THREE.CanvasTexture {
  return tex(512, 192, (g) => {
    g.fillStyle = "#1f2a24";
    g.fillRect(0, 0, 512, 192);
    g.strokeStyle = "#c9c2ae";
    g.lineWidth = 6;
    g.strokeRect(12, 12, 488, 168);
    g.fillStyle = "#e9dfc4";
    g.font = `bold 120px ${SERIF}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("HUT 6", 256, 100);
  });
}

function clockTex(): THREE.CanvasTexture {
  return tex(256, 256, (g) => {
    g.fillStyle = "#e9e2cf";
    g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1a1a1a";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const len = i % 5 === 0 ? 16 : 6;
      g.lineWidth = i % 5 === 0 ? 4 : 2;
      g.strokeStyle = "#1a1a1a";
      g.beginPath();
      g.moveTo(128 + Math.sin(a) * 110, 128 - Math.cos(a) * 110);
      g.lineTo(128 + Math.sin(a) * (110 - len), 128 - Math.cos(a) * (110 - len));
      g.stroke();
    }
    g.font = `bold 30px ${SERIF}`;
    g.textAlign = "center"; g.textBaseline = "middle";
    [["12", 128, 46], ["3", 208, 128], ["6", 128, 210], ["9", 48, 128]].forEach(([n, x, y]) => g.fillText(String(n), Number(x), Number(y)));
    // 23:40 — the night watch
    const hand = (a: number, len: number, w: number) => {
      g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke();
    };
    hand(((11 + 40 / 60) / 12) * Math.PI * 2, 62, 7);
    hand((40 / 60) * Math.PI * 2, 92, 4);
    g.fillStyle = "#1a1a1a";
    g.beginPath(); g.arc(128, 128, 6, 0, Math.PI * 2); g.fill();
  });
}

function padTex(): THREE.CanvasTexture {
  return tex(512, 704, (g, r) => {
    g.fillStyle = "#efe7cf";
    g.fillRect(0, 0, 512, 704);
    g.strokeStyle = "#b9b0a0";
    g.lineWidth = 1;
    for (let y = 130; y < 690; y += 28) { g.beginPath(); g.moveTo(24, y); g.lineTo(488, y); g.stroke(); }
    g.fillStyle = "#2a2418";
    g.font = `bold 22px ${MONO}`;
    g.fillText("G.C. & C.S.  —  INTERCEPT", 24, 44);
    g.font = `16px ${MONO}`;
    g.fillText("STATION   CHICKSANDS      FREQ 4780", 24, 74);
    g.fillText("TIME OF ORIGIN   2317    GROUPS 128", 24, 98);
    g.font = `20px ${MONO}`;
    g.fillStyle = "#3a3428";
    let y = 152;
    for (let row = 0; row < 12; row++) {
      let s = "";
      for (let k = 0; k < 8; k++) {
        let grp = "";
        for (let j = 0; j < 5; j++) grp += String.fromCharCode(65 + Math.floor(r() * 26));
        s += grp + " ";
      }
      g.fillText(s, 24, y);
      y += 28;
    }
    g.fillStyle = "rgba(184,51,42,0.85)";
    g.font = `bold 26px ${SERIF}`;
    g.save(); g.translate(360, 120); g.rotate(-0.12); g.fillText("RED", 0, 0); g.restore();
  }, 21);
}

export function buildRoom(): RoomBuild {
  const root = new THREE.Group();
  const receivers: THREE.Mesh[] = [];

  const wallMat = new THREE.MeshStandardMaterial({ map: boardsTex(4), roughness: 0.95, metalness: 0 });
  const wallMat2 = new THREE.MeshStandardMaterial({ map: boardsTex(8), roughness: 0.95, metalness: 0 });
  const darkWood = new THREE.MeshStandardMaterial({ color: "#3b2a18", roughness: 0.8 });
  const oak = new THREE.MeshStandardMaterial({ color: "#6b4a2a", roughness: 0.75, map: null });

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * WALL_X, 40), new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, 6);
  root.add(floor);
  receivers.push(floor);

  // walls + ceiling
  const wallH = CEIL_Y - FLOOR_Y;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * WALL_X, wallH), wallMat);
  back.position.set(0, FLOOR_Y + wallH / 2, WALL_Z);
  root.add(back);
  receivers.push(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(40, wallH), wallMat2);
    side.position.set(sx * WALL_X, FLOOR_Y + wallH / 2, 6);
    side.rotation.y = -sx * Math.PI / 2;
    root.add(side);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * WALL_X, 40), new THREE.MeshStandardMaterial({ color: "#2a2820", roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL_Y, 6);
  root.add(ceil);
  // dado rail + skirting on the back wall
  const dado = new THREE.Mesh(new THREE.BoxGeometry(2 * WALL_X, 0.18, 0.08), darkWood);
  dado.position.set(0, FLOOR_Y + 5.2, WALL_Z + 0.04);
  root.add(dado);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2 * WALL_X, 0.5, 0.1), darkWood);
  skirt.position.set(0, FLOOR_Y + 0.25, WALL_Z + 0.05);
  root.add(skirt);

  // blackout window, back-left: frame, black cloth, a moonlit slit down one edge, tape cross
  const win = new THREE.Group();
  win.position.set(-8.4, 3.6, WALL_Z + 0.02);
  root.add(win);
  const WW = 4.2, WH = 4.8;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshStandardMaterial({ color: "#07080c", roughness: 1 }));
  win.add(cloth);
  const frameMat = new THREE.MeshStandardMaterial({ color: "#d8cfb8", roughness: 0.7 });
  for (const [x, y, w, h] of [[0, WH / 2, WW + 0.3, 0.16], [0, -WH / 2, WW + 0.3, 0.2], [-WW / 2, 0, 0.16, WH], [WW / 2, 0, 0.16, WH], [0, 0, 0.1, WH], [0, 0, WW, 0.1]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat);
    bar.position.set(x, y, 0.06);
    win.add(bar);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(WW + 0.6, 0.14, 0.5), frameMat);
  sill.position.set(0, -WH / 2 - 0.1, 0.2);
  win.add(sill);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.07, WH - 0.3), new THREE.MeshBasicMaterial({ color: "#9fb4e0" }));
  slit.position.set(WW / 2 - 0.16, 0, 0.01);
  win.add(slit);
  const slitGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, WH - 0.3), new THREE.MeshBasicMaterial({ color: "#6f86b8", transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  slitGlow.position.set(WW / 2 - 0.3, 0, 0.02);
  win.add(slitGlow);
  const tapeMat = new THREE.MeshStandardMaterial({ color: "#c9c2ae", roughness: 0.9 });
  for (const s of [-1, 1]) {
    for (const [cx, cy] of [[-WW / 4, WH / 4], [WW / 4, WH / 4], [-WW / 4, -WH / 4], [WW / 4, -WH / 4]]) {
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.1, Math.hypot(WW / 2, WH / 2) * 0.95), tapeMat);
      tape.position.set(cx, cy, 0.03);
      tape.rotation.z = s * Math.atan2(WW / 2, WH / 2);
      win.add(tape);
    }
  }

  // notice board, back-right
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.45), new THREE.MeshStandardMaterial({ map: noticeTex(), roughness: 0.95 }));
  board.position.set(3.2, 3.4, WALL_Z + 0.05);
  root.add(board);

  // HUT 6 sign, high right
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshStandardMaterial({ map: hutSignTex(), roughness: 0.6 }));
  sign.position.set(7.6, 6.4, WALL_Z + 0.04);
  root.add(sign);

  // wall clock, centre high
  const clock = new THREE.Group();
  clock.position.set(-2.4, 6.6, WALL_Z + 0.08);
  root.add(clock);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 10, 40), darkWood);
  clock.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.7, 40), new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.5 }));
  clock.add(face);

  // desk
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(13, 0.14, 7.8), new THREE.MeshStandardMaterial({ color: "#5a3d22", roughness: 0.7 }));
  deskTop.position.set(0, DESK_Y - 0.07, 0.3);
  root.add(deskTop);
  receivers.push(deskTop);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.6, 7.4), darkWood);
  apron.position.set(0, DESK_Y - 0.44, 0.3);
  root.add(apron);
  const legH = DESK_Y - 0.14 - FLOOR_Y;
  for (const [lx, lz] of [[-6, -3.2], [6, -3.2], [-6, 3.6], [6, 3.6]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, legH, 0.34), darkWood);
    leg.position.set(lx, FLOOR_Y + legH / 2, lz);
    root.add(leg);
  }
  // a second desk further back-left, unlit, for depth
  const desk2 = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 5), new THREE.MeshStandardMaterial({ color: "#4a3320", roughness: 0.8 }));
  desk2.position.set(-11.5, DESK_Y - 0.07, -2.5);
  root.add(desk2);
  const chair = new THREE.Group();
  chair.position.set(-11, FLOOR_Y, 1.8);
  root.add(chair);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.7), darkWood);
  seat.position.y = 4.1;
  chair.add(seat);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.2, 0.12), darkWood);
  backrest.position.set(0, 5.2, -0.8);
  chair.add(backrest);
  for (const [cx, cz] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.1, 0.14), darkWood);
    cl.position.set(cx, 2.05, cz);
    chair.add(cl);
  }

  // desk props: intercept pad, pencil, enamel mug, a stack of forms
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 2.9), [oak, oak, new THREE.MeshStandardMaterial({ map: padTex(), roughness: 0.9 }), oak, oak, oak]);
  pad.position.set(3.6, DESK_Y + 0.03, 2.2);
  pad.rotation.y = -0.18;
  root.add(pad);
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), new THREE.MeshStandardMaterial({ color: "#c9a24a", roughness: 0.6 }));
  pencil.rotation.z = Math.PI / 2;
  pencil.rotation.y = 0.4;
  pencil.position.set(3.4, DESK_Y + 0.1, 3.7);
  root.add(pencil);
  const mug = new THREE.Group();
  mug.position.set(5.0, DESK_Y, -2.2);
  root.add(mug);
  const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.95, 20), new THREE.MeshStandardMaterial({ color: "#e8e4da", roughness: 0.35 }));
  mugBody.position.y = 0.475;
  mug.add(mugBody);
  const mugRim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24), new THREE.MeshStandardMaterial({ color: "#2b4a7a", roughness: 0.4 }));
  mugRim.rotation.x = Math.PI / 2;
  mugRim.position.y = 0.95;
  mug.add(mugRim);
  const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20, Math.PI), new THREE.MeshStandardMaterial({ color: "#e8e4da", roughness: 0.35 }));
  mugHandle.position.set(0.44, 0.5, 0);
  mugHandle.rotation.z = -Math.PI / 2;
  mug.add(mugHandle);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), new THREE.MeshStandardMaterial({ color: "#5a3a1a", roughness: 0.2 }));
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 0.86;
  mug.add(tea);
  const forms = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 2.3), new THREE.MeshStandardMaterial({ color: "#b9b09a", roughness: 0.95 }));
  forms.position.set(-5.4, DESK_Y + 0.16, -2.9);
  forms.rotation.y = 0.12;
  root.add(forms);

  // pendants: one over the machine (the key light), one over the bombe
  const pendant = (pos: THREE.Vector3) => {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, CEIL_Y - pos.y, 6), new THREE.MeshStandardMaterial({ color: "#1a1a1a" }));
    cord.position.set(pos.x, (CEIL_Y + pos.y) / 2, pos.z);
    root.add(cord);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(1.35, 0.9, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: "#1f4a3a", roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }),
    );
    shade.position.set(pos.x, pos.y + 0.4, pos.z);
    root.add(shade);
    const shadeInner = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 0.86, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: "#fff4dc", emissive: "#ffd9a0", emissiveIntensity: 0.9, side: THREE.BackSide }),
    );
    shadeInner.position.copy(shade.position);
    root.add(shadeInner);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: "#fff8e6", emissive: "#fff1c8", emissiveIntensity: 3 }));
    bulb.position.copy(pos);
    root.add(bulb);
  };
  const lampPos = new THREE.Vector3(0.3, 6.9, 0.6);
  const lampPos2 = new THREE.Vector3(WALL_X - 10, 11.3, 4.0); // above the bombe top (y ≈ 11.2) and 4 units out from its face
  pendant(lampPos);
  pendant(lampPos2);

  // a duckboard runner where the bombe will stand, so it does not float
  const runner = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.12, 21), darkWood);
  runner.position.set(WALL_X - 3.4, FLOOR_Y + 0.06, 4.0);
  root.add(runner);
  receivers.push(runner);

  return {
    root, lampPos, lampPos2, receivers,
    moonDir: new THREE.Vector3(-6.4, 3.6, WALL_Z),
    bombeSlot: { position: new THREE.Vector3(WALL_X - 2.9, FLOOR_Y + 0.12, 4.0), rotationY: -Math.PI / 2 }, // 19.4 long: z −5.7…13.7 stays inside the back wall
  };
}
