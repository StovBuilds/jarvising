// Optional sound layer (brief: "low mechanical ambience, restrained electrical
// texture, fan airflow, tonal changes by subsystem; never autoplay; complete
// when muted"). Everything is synthesised: two low sines for the machine hum,
// filtered noise for the fans (its colour and level follow fan speed), a thin
// high tone for the silicon worlds. Off until the user asks; fades in and out.

export class RigAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private toneGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  running = false;

  start(): void {
    if (this.running) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      this.master = master;

      // machine hum: two detuned sines an octave apart
      const humGain = ctx.createGain();
      humGain.gain.value = 0.02;
      humGain.connect(master);
      this.humGain = humGain;
      for (const [f, g] of [[55, 1], [110.5, 0.55], [164, 0.18]] as const) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og).connect(humGain);
        o.start();
        this.nodes.push(o);
      }

      // silicon worlds: a thin electrical tone with a slow beat
      const toneGain = ctx.createGain();
      toneGain.gain.value = 0;
      toneGain.connect(master);
      this.toneGain = toneGain;
      const tone = ctx.createOscillator();
      tone.type = "triangle";
      tone.frequency.value = 1760;
      const toneLevel = ctx.createGain();
      toneLevel.gain.value = 0.0045;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3.1;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.002;
      lfo.connect(lfoGain).connect(toneLevel.gain);
      tone.connect(toneLevel).connect(toneGain);
      tone.start(); lfo.start();
      this.nodes.push(tone, lfo);

      // fans: looped white noise through a low-pass whose cutoff follows fan speed
      const seconds = 2;
      const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      filter.Q.value = 0.7;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.01;
      noise.connect(filter).connect(noiseGain).connect(master);
      noise.start();
      this.nodes.push(noise);
      this.filter = filter;
      this.noiseGain = noiseGain;

      master.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
      this.running = true;
    } catch {
      this.running = false;
    }
  }

  /** `fanSpeed` in rad/s as the page drives the rotors; `machine` 1 in the real
   * build, 0 in the silicon worlds; `lab` 1 in the atlas (quieter, cleaner). */
  update(fanSpeed: number, machine: number, lab: number): void {
    if (!this.running || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = Math.min(1, Math.max(0, fanSpeed / 27));
    this.filter?.frequency.setTargetAtTime(380 + 1500 * f, t, 0.35);
    this.noiseGain?.gain.setTargetAtTime((0.008 + 0.045 * f) * machine * (1 - 0.5 * lab), t, 0.35);
    this.humGain?.gain.setTargetAtTime((0.006 + 0.016 * machine) * (1 - 0.4 * lab), t, 0.5);
    this.toneGain?.gain.setTargetAtTime(1 - machine, t, 0.5);
  }

  stop(): void {
    if (!this.running || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    this.running = false;
    const nodes = this.nodes;
    this.nodes = [];
    setTimeout(() => {
      for (const n of nodes) { try { n.stop(); } catch { /* already stopped */ } }
      ctx.close().catch(() => undefined);
    }, 1200);
    this.ctx = null; this.master = null; this.humGain = null; this.toneGain = null; this.noiseGain = null; this.filter = null;
  }

  dispose(): void { this.stop(); }
}
