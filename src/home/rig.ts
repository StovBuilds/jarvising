// Test-rig strips: power the instrument on when it scrolls into view.
// The readings are already in the HTML (tools/measure-rig.mjs writes them from
// public/projects/rig.json), so this only animates what is there: hairlines
// draw, numbers count up to their measured value, the trace sweeps in, and the
// QA filmstrip flicks through its pinned beats. Reduced motion: nothing moves,
// the filmstrip is stepped by hand.

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (v: number, d: number) => v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function countUp(el: HTMLElement, delay: number) {
  const to = Number(el.dataset.n), d = Number(el.dataset.d ?? 0);
  const dur = 950;
  let t0 = 0;
  const step = (now: number) => {
    if (!t0) t0 = now + delay;
    const k = Math.min(1, Math.max(0, (now - t0) / dur));
    el.textContent = fmt(to * easeOut(k), d);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// the cipher reading settles like a rotor window: each letter spins, then stops, left to right
function scramble(el: HTMLElement, delay: number) {
  const final = el.dataset.final ?? "";
  let t0 = 0;
  const step = (now: number) => {
    if (!t0) t0 = now + delay;
    const e = now - t0;
    let out = "", done = true;
    for (let i = 0; i < final.length; i++) {
      if (e > 380 + i * 110) out += final[i];
      else { done = false; out += e < 0 ? "·" : LETTERS[(Math.floor(e / 45) + i * 7) % 26]; }
    }
    el.textContent = out;
    if (!done) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function filmstrip(rig: HTMLElement) {
  const film = rig.querySelector<HTMLElement>("[data-film]");
  if (!film) return { start() {}, stop() {} };
  const box = film.querySelector<HTMLElement>(".rig-frames")!;
  const imgs = [...box.querySelectorAll<HTMLImageElement>("img")];
  const ticks = [...film.querySelectorAll<HTMLButtonElement>(".rig-ticks button")];
  const dots = [...rig.querySelectorAll<HTMLElement>(".rig-dots i")];
  const capP = film.querySelector<HTMLElement>("[data-cap-p]");
  const capName = film.querySelector<HTMLElement>("[data-cap-name]");
  const capOf = film.querySelector<HTMLElement>("[data-cap-of]");
  let cur = 0, timer = 0, visible = false, hover = false, heldUntil = 0;

  const show = (i: number) => {
    cur = (i + imgs.length) % imgs.length;
    imgs.forEach((im, j) => im.classList.toggle("on", j === cur));
    ticks.forEach((b, j) => b.setAttribute("aria-current", String(j === cur)));
    dots.forEach((d, j) => d.classList.toggle("on", j === cur));
    const im = imgs[cur];
    if (capP) capP.textContent = `p ${im.dataset.p}`;
    if (capName) capName.textContent = im.dataset.name ?? "";
    if (capOf) capOf.textContent = `${cur + 1}/${imgs.length}`;
  };
  // slow on its own while in view; quick while pointed at or focused; never under reduced motion
  const schedule = () => {
    clearTimeout(timer);
    if (reduced || !visible || document.hidden) return;
    const wait = hover ? 650 : Math.max(2800, heldUntil - performance.now());
    timer = window.setTimeout(() => { if (hover || performance.now() >= heldUntil) show(cur + 1); schedule(); }, wait);
  };
  const on = () => { hover = true; if (!reduced) show(cur + 1); schedule(); };
  const off = () => { hover = false; schedule(); };
  box.addEventListener("pointerenter", on);
  box.addEventListener("pointerleave", off);
  box.addEventListener("focus", on);
  box.addEventListener("blur", off);
  box.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    show(cur + (e.key === "ArrowRight" ? 1 : -1));
    heldUntil = performance.now() + 8000; hover = false; schedule();
  });
  ticks.forEach((b, j) => b.addEventListener("click", () => { show(j); heldUntil = performance.now() + 8000; schedule(); }));
  document.addEventListener("visibilitychange", schedule);
  show(0);
  return {
    start() { visible = true; schedule(); },
    stop() { visible = false; clearTimeout(timer); },
  };
}

for (const rig of document.querySelectorAll<HTMLElement>("[data-rig]")) {
  const film = filmstrip(rig);
  const nums = [...rig.querySelectorAll<HTMLElement>(".rig-n")];
  const codes = [...rig.querySelectorAll<HTMLElement>("[data-scramble]")];
  const channels = [...rig.querySelectorAll<HTMLElement>(".rig-ch > div")];
  if (!reduced) {
    rig.classList.add("rig-armed");
    channels.forEach((c, i) => c.style.setProperty("--i", String(i)));
    rig.querySelectorAll<HTMLElement>(".rig-dots i").forEach((d) => d.style.setProperty("--x", String(parseFloat(d.style.left) / 100)));
    for (const n of nums) n.textContent = fmt(0, Number(n.dataset.d ?? 0));
    for (const c of codes) { c.dataset.final = c.textContent ?? ""; c.textContent = "·".repeat(c.dataset.final.length); }
  }
  let powered = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        if (!powered && !reduced) {
          powered = true;
          const plot = rig.querySelector<HTMLElement>(".rig-plot:not(.rig-flat)");
          if (plot) plot.style.setProperty("--w", `${plot.clientWidth}px`);
          rig.classList.add("on");
          nums.forEach((n) => countUp(n, 380 + channels.indexOf(n.closest(".rig-ch > div") as HTMLElement) * 70));
          codes.forEach((c) => scramble(c, 520));
        }
        film.start();
      } else film.stop();
    }
  }, { threshold: 0.3 });
  io.observe(rig);
}
