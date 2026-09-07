// Procedural sound for jarvising entry 001 (enigma) — all WebAudio synthesis, no audio assets.
// Key clacks, lamp thunks, rotor ratchet ticks, a lid creak, and faint Morse
// under the hero. Everything is opt-in: the AudioContext is only created on
// the user's toggle gesture (autoplay policy), and every method no-ops while
// disabled.

const MORSE: Record<string, string> = {
  E: ".", N: "-.", I: "..", G: "--.", M: "--", A: ".-",
};

export class EnigmaAudio {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private morseOn = false;
  private morseTimer: number | null = null;

  /** Flip sound on/off (call from a user gesture). Returns the new state. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.boot();
      this.ctx?.resume();
    } else {
      this.setMorse(false);
      this.ctx?.suspend();
    }
    return this.enabled;
  }

  private boot() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 0.3);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private burst(freq: number, q: number, dur: number, gain: number, type: BiquadFilterType = "bandpass", when = 0) {
    if (!this.enabled || !this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, gain: number, when = 0, type: OscillatorType = "sine") {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  /** A dry mechanical key strike. */
  keyClack() {
    this.burst(2300, 1.4, 0.06, 0.5);
    this.tone(135, 0.09, 0.22, 0, "triangle");
  }

  /** The lamp landing a beat after the key. */
  lampThunk() {
    this.tone(185, 0.22, 0.26);
    this.burst(900, 2, 0.045, 0.12);
  }

  /** One rotor notch. */
  ratchet() {
    this.burst(3800, 3, 0.028, 0.2, "highpass");
    this.burst(1400, 4, 0.02, 0.08, "bandpass", 0.012);
  }

  /** Oak lid swinging open. */
  creak() {
    if (!this.enabled || !this.ctx) return;
    this.tone(64, 0.7, 0.1, 0, "sawtooth");
    for (let i = 0; i < 7; i++) {
      this.burst(420 + Math.random() * 520, 7, 0.11, 0.15, "bandpass", i * 0.085 + Math.random() * 0.03);
    }
  }

  /** Faint period radio traffic under the hero — loops "ENIGMA" in Morse. */
  setMorse(on: boolean) {
    if (on === this.morseOn) return;
    this.morseOn = on;
    if (on) this.morseLoop();
    else if (this.morseTimer !== null) {
      clearTimeout(this.morseTimer);
      this.morseTimer = null;
    }
  }

  private morseLoop() {
    if (!this.morseOn || !this.enabled) {
      this.morseOn = false;
      return;
    }
    const unit = 0.085;
    let t = 0.5;
    for (const ch of "ENIGMA") {
      for (const sym of MORSE[ch]) {
        const dur = sym === "." ? unit : unit * 3;
        this.tone(524, dur, 0.045, t);
        t += dur + unit;
      }
      t += unit * 2;
    }
    this.morseTimer = window.setTimeout(() => this.morseLoop(), (t + 1.8) * 1000);
  }

  dispose() {
    this.setMorse(false);
    this.ctx?.close();
    this.ctx = null;
  }
}
