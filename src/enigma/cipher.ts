// A faithful Enigma I (Wehrmacht) — rotors I·II·III, reflector B, plugboard.
// Historical wirings, public domain. Powers the "try it" beat of jarvising entry 001 (enigma).

const A = 65;
const mod = (n: number) => ((n % 26) + 26) % 26;

export const ROTOR_WIRINGS = [
  "EKMFLGDQVZNTOWYHXUSPAIBRCJ", // I,   notch Q
  "AJDKSIRUXBLHWTMCQGZNPYFVOE", // II,  notch E
  "BDFHJLCPRTXVZNYEIWGAKMUSQO", // III, notch V
];
export const NOTCHES = [16, 4, 21]; // Q, E, V
export const REFLECTOR_B = "YRUHQSLDPXNGOKMIEBFZCWVJAT";

// Shown physically on the plugboard model too — keep the two in sync.
export const PLUG_PAIRS: [string, string][] = [
  ["A", "V"], ["B", "S"], ["C", "G"], ["D", "L"], ["F", "U"],
  ["H", "Z"], ["I", "N"], ["K", "M"], ["O", "W"], ["R", "T"],
];

export class Enigma {
  /** rotor positions, left→right, 0 = 'A' showing in the window */
  positions = [0, 0, 0];

  private plug = new Map<number, number>();
  private fwd: number[][] = [];
  private rev: number[][] = [];
  private ref: number[] = [];

  constructor() {
    for (const w of ROTOR_WIRINGS) {
      const f = [...w].map((c) => c.charCodeAt(0) - A);
      const r = new Array<number>(26);
      f.forEach((v, i) => { r[v] = i; });
      this.fwd.push(f);
      this.rev.push(r);
    }
    this.ref = [...REFLECTOR_B].map((c) => c.charCodeAt(0) - A);
    for (const [x, y] of PLUG_PAIRS) {
      this.plug.set(x.charCodeAt(0) - A, y.charCodeAt(0) - A);
      this.plug.set(y.charCodeAt(0) - A, x.charCodeAt(0) - A);
    }
  }

  reset(positions: [number, number, number] = [0, 0, 0]) {
    this.positions = [...positions];
  }

  /** Advance rotors as the keypress lands — includes the double-step anomaly. */
  private step() {
    const [_, m, r] = this.positions;
    const midAtNotch = m === NOTCHES[1];
    const rightAtNotch = r === NOTCHES[2];
    if (midAtNotch) {
      this.positions[0] = mod(this.positions[0] + 1);
      this.positions[1] = mod(this.positions[1] + 1); // double step
    } else if (rightAtNotch) {
      this.positions[1] = mod(this.positions[1] + 1);
    }
    this.positions[2] = mod(this.positions[2] + 1);
  }

  /** Encrypt one letter A–Z; returns the lamp that lights. */
  press(ch: string): string {
    const c = ch.toUpperCase().charCodeAt(0) - A;
    if (c < 0 || c > 25) return ch;
    this.step();
    let x = this.plug.get(c) ?? c;
    for (let i = 2; i >= 0; i--) {
      const off = this.positions[i];
      x = mod(this.fwd[i][mod(x + off)] - off);
    }
    x = this.ref[x];
    for (let i = 0; i <= 2; i++) {
      const off = this.positions[i];
      x = mod(this.rev[i][mod(x + off)] - off);
    }
    x = this.plug.get(x) ?? x;
    return String.fromCharCode(A + x);
  }
}
