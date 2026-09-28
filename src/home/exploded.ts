// Anatomy: the home page, exploded into its real layers.
//
// The same technique as entry 001's Enigma teardown, in 2D-with-perspective
// instead of three.js: one smoothed scroll value `e` drives everything, each
// layer sits at base + dir × clamp(E × (1 + lag) − lag), and every beat is a
// smoothstep window over `e`. No timers; a rAF loop runs only while the
// section is near the viewport and `e` is still catching up.
//
// Without JS, or with prefers-reduced-motion, the CSS lays the layers out flat
// beside their labels, so this file only ever adds the live version.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// top → bottom: type, grid, paper, markup, machinery. The top sheet lifts
// first; on the way back the bottom ones settle first, like a restacked pile.
const LAG = [0, 0.14, 0.28, 0.42, 0.56];
// in-plane slide at full explode (sheet px), so the buried sheets show more of themselves
const DX = [0, 0, 0, -64, 0];
const SIDE: ("l" | "r")[] = ["r", "l", "r", "l", "r"];
const GAP = 165; // px between neighbouring sheets at full explode (sheet space)
const SHEET_W = 360, SHEET_H = 460;
const DEG = Math.PI / 180;

function mount(sec: HTMLElement): () => void {
  const track = sec.querySelector<HTMLElement>(".anat-track")!;
  const stage = sec.querySelector<HTMLElement>(".anat-stage")!;
  const model = sec.querySelector<HTMLElement>(".anat-model")!;
  const readout = sec.querySelector<HTMLElement>(".anat-e")!;
  const svg = sec.querySelector<SVGSVGElement>(".anat-leaders")!;
  const layers = Array.from(sec.querySelectorAll<HTMLElement>(".anat-layer"));
  const pins = layers.map((l) => l.querySelector<HTMLElement>(".anat-pin")!);
  const labels = Array.from(sec.querySelectorAll<HTMLLIElement>(".anat-labels li"));
  const n = layers.length;

  sec.classList.add("is-live");

  const NS = "http://www.w3.org/2000/svg";
  const leaders = labels.map(() => {
    const g = document.createElementNS(NS, "g");
    const path = document.createElementNS(NS, "path");
    const pin = document.createElementNS(NS, "circle");
    const end = document.createElementNS(NS, "circle");
    pin.setAttribute("r", "3.2"); pin.setAttribute("class", "pin");
    end.setAttribute("r", "2.6"); end.setAttribute("class", "end");
    g.append(path, end, pin);
    svg.append(g);
    return { g, path, pin, end };
  });

  // metrics, refreshed on resize
  let W = 0, H = 0, narrow = false, lw = 250;
  let labelH: number[] = [];
  const measure = () => {
    W = stage.clientWidth; H = stage.clientHeight;
    narrow = W < 900;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    lw = narrow ? Math.min(W - 8, 420) : Math.min(270, Math.max(210, (W - 640) / 2 - 40));
    labels.forEach((li, i) => {
      li.style.width = `${lw}px`;
      li.style.textAlign = !narrow && SIDE[i] === "l" ? "right" : "left";
    });
    labelH = labels.map((li) => li.offsetHeight);
  };

  const target = () => {
    const r = track.getBoundingClientRect();
    const run = r.height - window.innerHeight;
    return run > 0 ? clamp01(-r.top / run) : 0;
  };

  let e = target();
  let raf = 0, last = 0, near = false, lastText = "";

  const frame = (now: number) => {
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    const goal = target();
    e += (goal - e) * (1 - Math.pow(0.9, dt / 16.67));
    if (Math.abs(goal - e) < 0.0004) e = goal;
    render();
    raf = near && e !== goal ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  };
  const kick = () => { if (!raf && near) raf = requestAnimationFrame(frame); };

  function render() {
    // beats, all smoothstep windows over e
    const tilt = smooth(0.03, 0.2, e) * (1 - smooth(0.86, 0.98, e));
    const E = smooth(0.14, 0.44, e) * (1 - smooth(0.7, 0.9, e));
    const drift = smooth(0.4, 0.74, e);
    const fu = (e - (narrow ? 0.3 : 0.42)) / ((narrow ? 0.78 : 0.72) - (narrow ? 0.3 : 0.42)) * n; // focus sweep, in layers

    const ax = (narrow ? 52 : 57) * tilt;
    const az = -(narrow ? 24 : 30) * tilt + 5 * tilt * drift;

    // Enigma's rule: base + dir × clamp(E × (1 + lag) − lag), then recentre
    const sep = LAG.map((lag) => clamp01(E * (1 + lag) - lag));
    // one at a time: each label is fully out before the next comes in
    const focus = labels.map((_, i) => (i === 0 ? 1 : smooth(i + 0.02, i + 0.16, fu)) * (i === n - 1 ? 1 : 1 - smooth(i + 0.84, i + 0.98, fu)));
    // (n - 1 - i) * 0.6 keeps the stack order right while the sheets are coplanar
    const z = sep.map((s, i) => (n - 1 - i) * (0.6 + GAP * s) + 24 * focus[i] * s);
    const mid = (Math.max(...z) + Math.min(...z)) / 2;

    // fit the sheet stack into the free region, whatever the state
    const rz = Math.abs(az) * DEG, rx = ax * DEG;
    const bw = SHEET_W * Math.cos(rz) + SHEET_H * Math.sin(rz);
    const bh = (SHEET_W * Math.sin(rz) + SHEET_H * Math.cos(rz)) * Math.cos(rx) + (Math.max(...z) - Math.min(...z)) * Math.sin(rx);
    const top = 64, bottom = narrow ? Math.max(...labelH) + 40 : 28;
    const regW = narrow ? W - 16 : W - 2 * (lw + 70);
    const regH = H - top - bottom;
    const s = Math.min(narrow ? 1 : 1.3, regW / (bw * 1.08), regH / (bh * 1.1));
    const cy = top + regH / 2 - H / 2;

    model.style.transform =
      `translate3d(0, ${cy.toFixed(1)}px, 0) scale(${s.toFixed(4)}) rotateX(${ax.toFixed(2)}deg) rotateZ(${az.toFixed(2)}deg)`;
    layers.forEach((l, i) => {
      l.style.transform = `translate3d(${(DX[i] * sep[i]).toFixed(1)}px, 0, ${(z[i] - mid).toFixed(1)}px)`;
      l.style.setProperty("--s", sep[i].toFixed(3));
    });

    const txt = `e = ${e.toFixed(2)}`;
    if (txt !== lastText) { readout.textContent = txt; lastText = txt; }

    // callouts: anchors are real points on the transformed sheets
    const sr = stage.getBoundingClientRect();
    const at = pins.map((p) => {
      const r = p.getBoundingClientRect();
      return { x: r.left - sr.left, y: r.top - sr.top };
    });
    type P = { i: number; y: number; x: number; h: number; vis: number };
    const placed: P[] = [];
    labels.forEach((li, i) => {
      const vis = narrow
        ? focus[i] * smooth(0.5, 0.95, sep[i])
        : smooth(0.55, 0.97, sep[i]);
      li.classList.toggle("on", !narrow && focus[i] > 0.5);
      if (vis < 0.01) { li.style.opacity = "0"; leaders[i].g.style.opacity = "0"; return; }
      const x = narrow ? (W - lw) / 2 : SIDE[i] === "l" ? 0 : W - lw;
      const y = narrow ? H - labelH[i] - 22 : at[i].y - 12;
      placed.push({ i, x, y, h: labelH[i], vis });
    });
    if (!narrow) {
      for (const side of ["l", "r"] as const) {
        const col = placed.filter((q) => SIDE[q.i] === side).sort((a, b) => a.y - b.y);
        let floor = top;
        for (const q of col) { q.y = Math.max(q.y, floor); floor = q.y + q.h + 18; }
        let ceil = H - 24;
        for (let k = col.length - 1; k >= 0; k--) {
          const q = col[k];
          q.y = Math.min(q.y, ceil - q.h); ceil = q.y - 18;
        }
      }
    }
    for (const q of placed) {
      const li = labels[q.i], L = leaders[q.i], a = at[q.i];
      li.style.opacity = q.vis.toFixed(3);
      li.style.transform = `translate3d(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0)`;
      let ex: number, ey: number, kx: number, ky: number;
      if (narrow) {
        ex = Math.min(Math.max(a.x, q.x + 12), q.x + lw - 12); ey = q.y - 10; kx = ex; ky = ey;
      } else {
        const left = SIDE[q.i] === "l";
        ex = left ? q.x + lw + 10 : q.x - 10; ey = q.y + 11;
        kx = left ? ex + 22 : ex - 22; ky = ey;
      }
      L.g.style.opacity = q.vis.toFixed(3);
      L.path.setAttribute("d", `M${ex.toFixed(1)} ${ey.toFixed(1)}L${kx.toFixed(1)} ${ky.toFixed(1)}L${a.x.toFixed(1)} ${a.y.toFixed(1)}`);
      L.end.setAttribute("cx", ex.toFixed(1)); L.end.setAttribute("cy", ey.toFixed(1));
      L.pin.setAttribute("cx", a.x.toFixed(1)); L.pin.setAttribute("cy", a.y.toFixed(1));
    }
  }

  const io = new IntersectionObserver((entries) => {
    near = entries.some((en) => en.isIntersecting);
    kick();
  }, { rootMargin: "25% 0px" });
  io.observe(track);
  const onScroll = () => kick();
  const onResize = () => { measure(); render(); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  measure();
  render();
  // webfonts change label heights once they land
  document.fonts?.ready.then(() => { measure(); render(); });

  return () => {
    io.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    if (raf) cancelAnimationFrame(raf);
    sec.classList.remove("is-live");
    svg.replaceChildren();
    for (const el of [model, ...layers, ...labels]) { el.removeAttribute("style"); el.classList.remove("on"); }
    readout.textContent = "e = 0.00";
  };
}

const sec = document.querySelector<HTMLElement>(".anat");
if (sec) {
  const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
  let unmount: (() => void) | null = rm.matches ? null : mount(sec);
  rm.addEventListener("change", () => {
    if (rm.matches && unmount) { unmount(); unmount = null; }
    else if (!rm.matches && !unmount) unmount = mount(sec);
  });
}

// A module, not a global script: keeps its names out of the shared TS scope.
export {};
