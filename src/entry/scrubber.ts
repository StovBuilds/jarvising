// "How it grew": replay an entry's build from real screenshots at real commits.
//
// Markup contract (progressive enhancement: everything inside reads without JS):
//   <div class="scrub" data-scrubber data-manifest="/projects/<slug>/build/manifest.json">
//     <div class="scrub-stage"><img …the latest frame…></div>
//     <p class="scrub-caption">…</p>
//     <ol class="scrub-cites"><li data-sha="abc1234">…</li>…</ol>
//   </div>
// The manifest is written by tools/render-build-frames.mjs. The slider value is
// a continuous frame position: between frames i and i+1 the later frame is
// wiped in over the earlier one with a clip-path, so dragging scrubs the build.
// Keys, play and citation clicks animate to whole frames; with reduced motion
// they switch instantly and nothing plays on its own.

interface Frame {
  repo: string;
  sha: string;
  date: string;
  subject: string;
  kind: string;
  note?: string;
  shots: Record<string, string>;
}
interface Manifest {
  entry: string;
  base: string;
  /** scroll positions (entry 001) or named states (entry 002: "table", "globe") */
  progress: (number | string)[];
  viewport: { width: number; height: number };
  frames: Frame[];
  /** optional per-beat alt-text phrase, e.g. { "globe": "switched to the globe view" } */
  beatAlt?: Record<string, string>;
  /** optional per-beat note for a frame that predates that state */
  beatMissing?: Record<string, string>;
  beatGroupLabel?: string;
}

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const STEP_MS = 620; // one frame's wipe
const HOLD_MS = 1700; // pause on each frame while playing
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};
// Dates only, never a clock time: public pages must not show when Jack was at work
// on something during the day. The manifests are published date-only as well.
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function mount(root: HTMLElement) {
  const url = root.dataset.manifest;
  if (!url) return;
  let m: Manifest;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    m = (await res.json()) as Manifest;
  } catch {
    return; // the static fallback stays as it is
  }
  const frames = m.frames;
  if (frames.length < 2) return;
  const n = frames.length;
  // A beat every frame has is a full replay. A beat only later frames have (a
  // state the piece grew into) is offered too; earlier frames fall back to the
  // first full beat and say so in the caption.
  const all = m.progress.map(String);
  const full = all.filter((p) => frames.every((f) => f.shots[p]));
  if (!full.length) return;
  const beats = all.filter((p) => full.includes(p) || frames.filter((f) => f.shots[p]).length >= 2);
  let beat = root.dataset.progress && beats.includes(root.dataset.progress) ? root.dataset.progress : full[0];
  const shotOf = (i: number) => frames[i].shots[beat] ?? frames[i].shots[full[0]];
  const src = (i: number) => m.base + shotOf(i);

  // ---- stage: two stacked images, the upper one wiped in ------------------
  const stage = root.querySelector<HTMLElement>(".scrub-stage") ?? root.appendChild(h("div", "scrub-stage"));
  stage.textContent = "";
  // "file" frames are a published page with no git history (entry 004's claude.ai artifact): a version, not a commit
  const builtAt = (f: Frame) => (f.kind === "file" ? `as published (${f.repo}, version ${f.sha})` : `as built at ${f.repo} commit ${f.sha}`);
  const alt = (i: number) =>
    `The ${m.entry} piece ${builtAt(frames[i])}, ${fmtDate(frames[i].date)}, ${
      frames[i].shots[beat] ? (m.beatAlt?.[beat] ?? `pinned at ${beat} of the scroll`) : (m.beatAlt?.[full[0]] ?? `pinned at ${full[0]} of the scroll`)}.`;
  const lower = h("img", "scrub-img");
  const upper = h("img", "scrub-img scrub-upper");
  const edge = h("span", "scrub-edge");
  edge.setAttribute("aria-hidden", "true");
  for (const img of [lower, upper]) {
    img.width = m.viewport.width;
    img.height = m.viewport.height;
    img.decoding = "async";
    img.draggable = false;
  }
  upper.alt = "";
  upper.setAttribute("aria-hidden", "true");
  stage.append(lower, upper, edge);
  stage.style.aspectRatio = `${m.viewport.width} / ${m.viewport.height}`;

  // ---- caption --------------------------------------------------------------
  const caption = root.querySelector<HTMLElement>(".scrub-caption") ?? h("p", "scrub-caption");
  caption.textContent = "";
  caption.setAttribute("aria-live", "polite");
  const capCount = h("span", "scrub-count");
  const capDate = h("time", "scrub-date");
  const capSha = h("code", "scrub-sha");
  const capRepo = h("span", "scrub-repo");
  const capSubject = h("span", "scrub-subject");
  const capNote = h("span", "scrub-note");
  const capMeta = h("span", "scrub-meta");
  capMeta.append(capCount, capDate, capRepo, capSha);
  caption.append(capMeta, capSubject, capNote);
  stage.after(caption);

  // ---- controls -------------------------------------------------------------
  const controls = h("div", "scrub-controls");
  const play = h("button", "scrub-play");
  play.type = "button";
  const playLabel = h("span", "scrub-play-label", "Play");
  const playIcon = h("span", "scrub-play-icon");
  playIcon.setAttribute("aria-hidden", "true");
  play.append(playIcon, playLabel);
  const rangeWrap = h("div", "scrub-range");
  const range = h("input");
  range.type = "range";
  range.min = "0";
  range.max = String(n - 1);
  range.step = "any";
  range.setAttribute("aria-label", "Commit");
  const ticks = h("div", "scrub-ticks");
  ticks.setAttribute("aria-hidden", "true");
  frames.forEach((_, i) => {
    const t = h("span");
    t.style.left = `${(i / (n - 1)) * 100}%`;
    ticks.append(t);
  });
  rangeWrap.append(ticks, range);
  controls.append(play, rangeWrap);

  let beatGroup: HTMLElement | null = null;
  if (beats.length > 1) {
    beatGroup = h("div", "scrub-beats");
    beatGroup.setAttribute("role", "group");
    beatGroup.setAttribute("aria-label", m.beatGroupLabel ?? "Point in the scroll");
    const names = (root.dataset.beatNames ?? "").split("|");
    beats.forEach((b, i) => {
      const btn = h("button", "scrub-beat", names[i] || `p = ${b}`);
      btn.type = "button";
      btn.dataset.beat = b;
      btn.title = /^[\d.]+$/.test(b) ? `Every frame pinned at ?p=${b}` : `Every frame in the ${b} state`;
      btn.setAttribute("aria-pressed", String(b === beat));
      btn.addEventListener("click", () => setBeat(b));
      beatGroup!.append(btn);
    });
    controls.append(beatGroup);
  }
  caption.after(controls);

  // citations list: the static <ol> becomes the index
  const cites = [...root.querySelectorAll<HTMLElement>(".scrub-cites li[data-sha]")];
  const citeFor = (i: number) => cites.find((li) => li.dataset.sha === frames[i].sha);
  cites.forEach((li) => {
    const i = frames.findIndex((f) => f.sha === li.dataset.sha);
    if (i < 0) return;
    li.tabIndex = -1;
    const btn = h("button", "scrub-cite-btn");
    btn.type = "button";
    btn.append(...li.childNodes);
    btn.addEventListener("click", () => { stop(); goTo(i); });
    li.append(btn);
  });

  root.classList.add("is-live");

  // ---- state ----------------------------------------------------------------
  let pos = n - 1; // start on the finished piece; play rewinds to day one
  let shown = -1;
  let anim = 0;
  let playing = false;
  let playTimer = 0;
  const preloaded = new Set<string>();
  const preload = (s: string) => {
    if (preloaded.has(s)) return;
    preloaded.add(s);
    const i = new Image();
    i.decoding = "async";
    i.src = s;
  };

  function render() {
    pos = Math.max(0, Math.min(n - 1, pos));
    const a = Math.floor(pos);
    const b = Math.min(a + 1, n - 1);
    const t = pos - a;
    if (lower.dataset.src !== src(a)) { lower.src = src(a); lower.dataset.src = src(a); }
    if (b !== a && t > 0.0005) {
      if (upper.dataset.src !== src(b)) { upper.src = src(b); upper.dataset.src = src(b); }
      upper.style.visibility = "visible";
      upper.style.clipPath = `inset(0 ${((1 - t) * 100).toFixed(3)}% 0 0)`;
      edge.style.opacity = "1";
      edge.style.transform = `translateX(${(t * stage.clientWidth).toFixed(1)}px)`;
    } else {
      upper.style.visibility = "hidden";
      edge.style.opacity = "0";
    }
    range.value = String(pos);
    const near = Math.round(pos);
    if (near !== shown) {
      shown = near;
      const f = frames[near];
      lower.alt = alt(t > 0.5 ? b : a);
      capCount.textContent = `${near + 1} / ${n}`;
      if (!playing) playLabel.textContent = near >= n - 1 ? "Replay" : "Play";
      capDate.dateTime = f.date;
      capDate.textContent = fmtDate(f.date);
      capRepo.textContent = f.repo;
      capSha.textContent = f.sha;
      capSubject.textContent = f.subject;
      const gap = f.shots[beat] ? "" : (m.beatMissing?.[beat] ?? "This state did not exist yet at this commit; showing the first view.");
      const note = [gap, f.note ?? ""].filter(Boolean).join(" ");
      capNote.textContent = note;
      capNote.hidden = !note;
      range.setAttribute("aria-valuetext", `${near + 1} of ${n}: ${fmtDate(f.date)}, ${f.repo} ${f.sha}, ${f.subject}`);
      cites.forEach((li) => li.classList.remove("is-current"));
      citeFor(near)?.classList.add("is-current");
      for (const j of [near - 1, near + 1, near + 2]) if (j >= 0 && j < n) preload(src(j));
    }
  }

  function goTo(target: number, ms = STEP_MS * Math.min(2.2, Math.max(1, Math.abs(target - pos)))) {
    cancelAnimationFrame(anim);
    target = Math.max(0, Math.min(n - 1, target));
    if (reduce.matches || ms <= 0) { pos = target; render(); return Promise.resolve(); }
    const from = pos;
    const t0 = performance.now();
    return new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const k = Math.max(0, Math.min(1, (now - t0) / ms)); // rAF stamps can predate t0
        pos = from + (target - from) * ease(k);
        render();
        if (k < 1) anim = requestAnimationFrame(tick);
        else resolve();
      };
      anim = requestAnimationFrame(tick);
    });
  }

  function setBeat(b: string) {
    if (b === beat) return;
    beat = b;
    beatGroup?.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.beat === b)));
    shown = -1;
    lower.dataset.src = "";
    upper.dataset.src = "";
    render();
  }

  // ---- play -----------------------------------------------------------------
  function setPlaying(on: boolean) {
    playing = on;
    root.classList.toggle("is-playing", on);
    playLabel.textContent = on ? "Pause" : Math.round(pos) >= n - 1 ? "Replay" : "Play";
    play.setAttribute("aria-label", on ? "Pause the replay" : "Play the build from the first commit");
  }
  function stop() {
    clearTimeout(playTimer);
    cancelAnimationFrame(anim);
    if (playing) setPlaying(false);
    else playLabel.textContent = Math.round(pos) >= n - 1 ? "Replay" : "Play";
  }
  async function advance() {
    if (!playing) return;
    const next = Math.round(pos) + 1;
    if (next > n - 1) { setPlaying(false); return; }
    await goTo(next, STEP_MS * 1.25);
    if (!playing) return;
    if (next >= n - 1) { setPlaying(false); return; }
    playTimer = window.setTimeout(advance, reduce.matches ? HOLD_MS + STEP_MS : HOLD_MS);
  }
  async function startPlay() {
    setPlaying(true);
    if (Math.round(pos) >= n - 1) {
      await goTo(0, reduce.matches ? 0 : 520);
      if (!playing) return;
      playTimer = window.setTimeout(advance, reduce.matches ? HOLD_MS : 700);
    } else {
      advance();
    }
  }
  play.addEventListener("click", () => (playing ? stop() : startPlay()));

  // ---- slider: drag scrubs continuously, release snaps -------------------------
  range.addEventListener("input", () => {
    stop();
    cancelAnimationFrame(anim);
    pos = Number(range.value);
    render();
  });
  range.addEventListener("change", () => goTo(Math.round(Number(range.value)), 260));
  range.addEventListener("keydown", (e) => {
    const cur = Math.round(pos);
    const map: Record<string, number> = {
      ArrowRight: cur + 1, ArrowUp: cur + 1, ArrowLeft: cur - 1, ArrowDown: cur - 1,
      PageUp: cur + 2, PageDown: cur - 2, Home: 0, End: n - 1,
    };
    if (!(e.key in map)) {
      if (e.key === " " || e.key === "k") { e.preventDefault(); playing ? stop() : startPlay(); }
      return;
    }
    e.preventDefault();
    stop();
    goTo(map[e.key]);
  });

  // ---- drag on the picture itself (mouse or touch; vertical pans still scroll) --
  let drag: { x: number; pos: number; id: number } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    stop();
    drag = { x: e.clientX, pos, id: e.pointerId };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / Math.max(1, stage.clientWidth);
    pos = Math.max(0, Math.min(n - 1, drag.pos + dx * (n - 1) * 0.9));
    root.classList.add("is-dragging");
    render();
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    root.classList.remove("is-dragging");
    goTo(Math.round(pos), 260);
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", () => render(), { passive: true });

  render();
  setPlaying(false);

  // Play once, from day one, the first time the stage is properly in view.
  // Never with reduced motion, and never after the reader has touched anything.
  let touched = false;
  for (const ev of ["pointerdown", "keydown", "focusin"]) root.addEventListener(ev, () => (touched = true), { once: true, passive: true });
  if (!reduce.matches && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      io.disconnect();
      frames.forEach((_, i) => preload(src(i)));
      window.setTimeout(() => { if (!touched && !reduce.matches) startPlay(); }, 500);
    }, { threshold: 0.6 });
    io.observe(stage);
  }
}

document.querySelectorAll<HTMLElement>("[data-scrubber]").forEach((el) => void mount(el));

// A module, not a global script: keeps its names out of the shared TS scope.
export {};
