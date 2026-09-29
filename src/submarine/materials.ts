import * as THREE from "three";
import { std } from "./shaders";

export function makeMaterials() {
  const M = {
    hull: std(0x66727b, 0.62, 0.4, { hull: true, hit: true }, { side: THREE.DoubleSide }),
    steel: std(0x6a7680, 0.5, 0.45),
    dark: std(0x1c232a, 0.7, 0.3),
    black: std(0x05070a, 0.9, 0.0, { noCaustic: true }),
    deck: deckMaterial(),
    bronze: std(0x9c7a44, 0.35, 0.85),
    tank: std(0x5c6871, 0.62, 0.4, { hull: true, hit: true }),
    ph: std(0x55626c, 0.5, 0.45, { hull: true }),
    phIn: std(0xc7b49b, 0.8, 0.0, { interior: true, noCaustic: true }, { side: THREE.BackSide }),
    bulk: std(0xb9a68d, 0.8, 0.05, { interior: true, noCaustic: true }, { side: THREE.DoubleSide }),
    mach: std(0x5d6a72, 0.45, 0.6, { interior: true, noCaustic: true }),
    paint: std(0x8d8472, 0.7, 0.1, { interior: true, noCaustic: true }),
    batt: std(0x1f262c, 0.6, 0.2, { interior: true, noCaustic: true }),
    torp: std(0x7d8a8f, 0.35, 0.7, { interior: true, noCaustic: true }),
    bunk: std(0x6a5e4c, 0.9, 0.0, { interior: true, noCaustic: true }),
    lampR: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.1, 0.5) }),
    lampA: new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 2.6, 0.8) }),
    lampG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 4.0, 2.0) }),
    hatch: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.0, 0.45) }),
  };
  return M;
}
export type Materials = ReturnType<typeof makeMaterials>;

// Casing deck: painted steel plates with rivet lines, drawn once into a canvas.
function deckMaterial() {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
  const g = cv.getContext("2d")!;
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "hsl(206 7% 34%)"; g.fillRect(0, 0, cv.width, cv.height);
  const rows = 4, h = cv.height / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 120;
    while (x < cv.width) {
      const len = 90 + rnd() * 80;
      g.fillStyle = `hsl(206 ${4 + rnd() * 5}% ${30 + rnd() * 9}%)`; g.fillRect(x, r * h, len, h);
      g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(x, r * h, 1.5, h);
      g.fillStyle = "rgba(0,0,0,.3)";
      for (let k = 5; k < len; k += 11) { g.fillRect(x + k, r * h + 3, 1.6, 1.6); g.fillRect(x + k, r * h + h - 5, 1.6, 1.6); }
      for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`; g.fillRect(x, r * h + rnd() * h, len, 0.8); }
      x += len;
    }
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, r * h, cv.width, 1.5);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return std(0xffffff, 0.85, 0.2, { hit: true }, { map: tex });
}
