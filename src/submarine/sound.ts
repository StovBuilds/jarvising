// Sound, off until asked for: a synthesised ping (a sine with a slight droop,
// through a feedback delay for the sea's reverb) and a quieter echo.
export function makeSound(isOn: () => boolean) {
  let ac: AudioContext | null = null, out: GainNode | null = null, wet: GainNode | null = null;
  function init() {
    if (ac) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ac = new AC(); out = ac.createGain(); out.gain.value = 0.55; out.connect(ac.destination);
    const delay = ac.createDelay(1.5); delay.delayTime.value = 0.27;
    const fb = ac.createGain(); fb.gain.value = 0.42;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    wet = ac.createGain(); wet.gain.value = 0.5;
    wet.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(out);
  }
  function blip(freq: number, gain: number, dur: number) {
    if (!ac || !out || !wet || !isOn()) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.985, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); g.connect(wet); o.start(t); o.stop(t + dur + 0.05);
  }
  return {
    init,
    ping() { blip(1180, 0.32, 1.5); blip(2360, 0.04, 0.5); },
    echo(s: number) { blip(1196, 0.05 + 0.26 * s, 0.9); },
  };
}
