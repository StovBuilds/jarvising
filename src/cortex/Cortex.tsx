// Entry 002, the live piece: cortex-map's war table over a fictional studio's
// second brain, framed for jarvising.com.
//
// Everything that draws the map is the vendored library in ./lib (MIT, see
// ./lib/SOURCE.md). This file is only the frame around it: a short intro, the
// site bar, the demo's theming panel, a "live brain" stream, keyboard, and the
// unattended modes.
//
// URL switches:
//   ?kiosk=1   exhibition loop: no intro, no links out, the camera orbits and the
//              stream runs; after &idle=<seconds> (default 60) untouched it resets.
//   ?intro=0   skip the intro card (the build-frame and rig tools use this).
//   ?probe=1   expose window.__cortexProbe (renderer.info per frame, first frame
//              time) for tools/measure-rig.mjs. Wired in ./probe.ts.
//   ?view=globe  start on the globe projection.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CortexMap, DEFAULT_THEME, type ClusterDef, type CortexMapHandle, type CortexMapNode, type CortexMapTheme } from "./lib";
import { CLUSTERS, makeSampleData } from "./sampleData";
import { Controls } from "./Controls";

const QS = new URLSearchParams(window.location.search);
const KIOSK = QS.get("kiosk") === "1";
const PROBE = QS.get("probe") === "1";
const NO_INTRO = KIOSK || PROBE || QS.get("intro") === "0";
const IDLE_MS = Math.max(3, Number(QS.get("idle") ?? 60)) * 1000;
const START_VIEW: "table" | "globe" = QS.get("view") === "globe" ? "globe" : "table";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = window.matchMedia("(max-width: 820px)").matches;
const ORBIT_RAD_PER_S = 0.07; // one lap in ~90 s: slow enough to read labels

export default function Cortex() {
  const { nodes, edges } = useMemo(() => makeSampleData(), []);
  const mapRef = useRef<CortexMapHandle>(null);
  const [selected, setSelected] = useState<CortexMapNode | null>(null);
  const [intro, setIntro] = useState(!NO_INTRO);

  // theming state, deferred into the map exactly as the cortex-map demo does it
  const [theme, setTheme] = useState<CortexMapTheme>(() => ({ ...DEFAULT_THEME }));
  const [clusters, setClusters] = useState<ClusterDef[]>(() => CLUSTERS.map((c) => ({ ...c })));
  const [projection, setProjection] = useState<"table" | "globe">(START_VIEW);
  const deferredTheme = useDeferredValue(theme);
  const deferredClusters = useDeferredValue(clusters);
  const patchTheme = (patch: Partial<CortexMapTheme>) => setTheme((t) => ({ ...t, ...patch }));
  const patchCluster = (name: string, patch: Partial<ClusterDef>) =>
    setClusters((cs) => cs.map((c) => (c.name === name ? { ...c, ...patch } : c)));
  const reset = () => {
    setTheme({ ...DEFAULT_THEME });
    setClusters(CLUSTERS.map((c) => ({ ...c })));
  };

  // "live brain": a node flashes every few seconds, sometimes a chain ignites,
  // which is what the real map does as memories arrive and get recalled
  const [live, setLive] = useState(KIOSK && !reduceMotion);
  useEffect(() => {
    if (!live) return;
    const iv = window.setInterval(() => {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      if (Math.random() < 0.2) mapRef.current?.ignite(n.id);
      else mapRef.current?.flash(n.id);
    }, 2600);
    return () => window.clearInterval(iv);
  }, [live, nodes]);

  // ── camera: orbit about the aim point (kiosk attract loop, arrow keys) ──
  const orbit = useCallback((rad: number, hold = 800) => {
    const map = mapRef.current;
    const fg = map?.graph();
    if (!map || !fg?.cameraPosition || !fg.camera) return; // 2D lite mode has no camera to swing
    const look = theme.cameraLook;
    const c = fg.camera().position as { x: number; y: number; z: number };
    const dx = c.x - look.x, dz = c.z - look.z;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    fg.cameraPosition({ x: look.x + dx * cos - dz * sin, y: c.y, z: look.z + dx * sin + dz * cos }, look, 0);
    map.wake(hold);
  }, [theme.cameraLook]);

  const lastTouch = useRef(performance.now());
  useEffect(() => {
    if (!KIOSK) return;
    const touch = () => { lastTouch.current = performance.now(); };
    const evs = ["pointerdown", "wheel", "keydown"] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    let raf = 0, prev = performance.now(), wasIdle = false;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const quiet = now - lastTouch.current;
      // attract: the camera drifts round the table whenever nobody is touching it
      if (quiet > 4000 && !reduceMotion) orbit(ORBIT_RAD_PER_S * dt);
      // a long silence puts the room back as it was
      const idle = quiet > IDLE_MS;
      if (idle && !wasIdle) {
        mapRef.current?.clearSelection();
        setProjection(START_VIEW);
        setLive(!reduceMotion);
      }
      wasIdle = idle;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      evs.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [orbit]);

  // kiosk: fullscreen + wake-lock on the first touch (both need a gesture)
  useEffect(() => {
    if (!KIOSK) return;
    const first = () => {
      document.documentElement.requestFullscreen?.().catch(() => {});
      (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request("screen").catch(() => {});
    };
    window.addEventListener("pointerdown", first, { once: true });
    return () => window.removeEventListener("pointerdown", first);
  }, []);

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (intro && (e.key === "Escape" || e.key === "Enter")) { e.preventDefault(); setIntro(false); return; }
      if (e.key === "/") {
        // the library opens its search palette on ⌘K / Ctrl-K; "/" is the web's usual key for it
        e.preventDefault();
        setIntro(false);
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
      } else if (e.key === "l" || e.key === "L") {
        setLive((v) => !v);
      } else if (e.key === "g" || e.key === "G") {
        setProjection((p) => (p === "globe" ? "table" : "globe"));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        orbit(e.key === "ArrowLeft" ? -0.12 : 0.12, 1200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [intro, orbit]);

  // ?probe=1: hand the graph instance to probe.ts (it wraps the renderer once it exists)
  useEffect(() => {
    if (PROBE) (window as unknown as { __cortexGraph?: () => unknown }).__cortexGraph = () => mapRef.current?.graph();
  }, []);

  // move focus into the dialog, and back to the map when it closes
  const enterRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (intro) enterRef.current?.focus();
    else stageRef.current?.focus({ preventScroll: true });
  }, [intro]);

  return (
    <div className={`cx${KIOSK ? " cx-kiosk" : ""}`} style={{ background: theme.background }}>
      <header className="cx-bar">
        {KIOSK ? (
          <span className="cx-brand">jarvising <i>·</i> entry 002 <i>·</i> <b>Cortex</b></span>
        ) : (
          <a className="cx-brand" href="/projects/cortex/">
            <span aria-hidden="true">←</span> <span className="cx-long">jarvising <i>·</i> </span>entry 002 <i>·</i> <b>Cortex</b>
          </a>
        )}
        <span className="cx-note">a fictional studio's second brain</span>
        <span className="cx-grow" />
        <button type="button" className={`cx-live${live ? " on" : ""}`} aria-pressed={live} aria-label="Simulate a live brain" onClick={() => setLive((v) => !v)}>
          <span className="cx-live-dot" aria-hidden="true" />
          <span className="cx-long">{live ? "Stop the stream" : "Simulate a live brain"}</span>
          <span className="cx-short" aria-hidden="true">{live ? "Stop" : "Live"}</span>
        </button>
        {!KIOSK && (
          <button type="button" className="cx-help" onClick={() => setIntro(true)} aria-label="About this map">?</button>
        )}
      </header>

      <div className="cx-stage" ref={stageRef} tabIndex={-1} aria-label="The map. Drag to orbit, scroll or pinch to zoom, click an orb to inspect it, press / to search.">
        <CortexMap
          ref={mapRef}
          nodes={nodes}
          edges={edges}
          clusters={deferredClusters}
          theme={deferredTheme}
          projection={projection}
          onNodeSelect={setSelected}
        />
        {!KIOSK && (
          <Controls
            theme={theme}
            onTheme={patchTheme}
            clusters={clusters}
            baseClusters={CLUSTERS}
            onCluster={patchCluster}
            projection={projection}
            onProjection={setProjection}
            onReset={reset}
            defaultOpen={false}
          />
        )}
        {selected && !small && (
          <p className="cx-selected" aria-live="polite">selected: <b>{selected.label}</b></p>
        )}
      </div>

      {intro && (
        <div className="cx-intro" role="dialog" aria-modal="true" aria-labelledby="cx-intro-h" onClick={(e) => { if (e.target === e.currentTarget) setIntro(false); }}>
          <div className="cx-card">
            <p className="cx-kicker">Entry 002 · the tools, handed on</p>
            <h1 id="cx-intro-h">cor<span>·</span>tex</h1>
            <p>
              The memory of a fleet of AI agents, drawn as a war table. Each orb is a memory, each cluster a part of
              the mind, and the bright arcs are links the machine found on its own.
            </p>
            <p>
              The real one maps Jack's brain and stays private. This is the same renderer, open source, holding a
              fictional game studio's notes so you can take it apart.
            </p>
            <ul className="cx-keys" aria-label="Controls">
              <li><b>Drag</b> orbit · <b>scroll</b> or <b>pinch</b> zoom</li>
              <li><b>Click</b> an orb to see what it touches; twice to fly there</li>
              <li><kbd>/</kbd> search · <kbd>L</kbd> live stream · <kbd>G</kbd> globe · <kbd>←</kbd><kbd>→</kbd> turn</li>
            </ul>
            <div className="cx-actions">
              <button type="button" ref={enterRef} className="cx-enter" onClick={() => setIntro(false)}>Enter the map</button>
              <a href="/projects/cortex/">Read the entry</a>
            </div>
            {small && !reduceMotion && <p className="cx-fine">On a small screen the map opens in its flat lite mode. The 3D switch is bottom right.</p>}
            {reduceMotion && <p className="cx-fine">Reduced motion is on, so the map stays flat and still.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
