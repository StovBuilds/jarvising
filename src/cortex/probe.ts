// ?probe=1 only: the numbers tools/measure-rig.mjs reads for the home-page strip.
//
// window.__cortexProbe holds, for the latest frame the map drew:
//   calls / triangles    renderer.info summed over the whole frame. The map renders
//                        through 3d-force-graph with a bloom pass, so one frame is
//                        several renderer.render() calls (the scene, then the
//                        post-processing passes); three resets renderer.info on each
//                        call, which would leave only the last full-screen pass. The
//                        wrapper turns that reset off and resets once per animation
//                        frame instead.
//   geometries/textures/programs   renderer.info.memory / programs
//   firstFrameMs         performance.now() at the first WebGL draw call on the page
//                        (three builds WebGLRenderer.render inside its constructor,
//                        so the renderer can only be wrapped once it exists; the
//                        draw-call hook catches the very first frame either way)
//   frames               frames drawn since the wrapper attached
// Cortex.tsx exposes the graph instance as window.__cortexGraph in probe mode.
type Info = { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number }; programs?: unknown[] | null; autoReset: boolean; reset(): void };
type Renderer = { info: Info; render: (...a: unknown[]) => unknown; __probed?: boolean };
type Probe = { frames: number; firstFrameMs: number | null; calls: number; triangles: number; geometries: number; textures: number; programs: number };

export function installProbe(): void {
  const w = window as unknown as { __cortexProbe?: Probe; __cortexGraph?: () => { renderer?: () => Renderer } | null | undefined };
  const p: Probe = (w.__cortexProbe = { frames: 0, firstFrameMs: null, calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 });

  // first frame: the first draw call of any WebGL context
  for (const Ctx of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!Ctx) continue;
    const proto = Ctx.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = proto[name];
      if (typeof orig !== "function") continue;
      proto[name] = function (this: unknown, ...a: unknown[]) {
        if (p.firstFrameMs == null) p.firstFrameMs = performance.now();
        return orig.apply(this, a);
      };
    }
  }

  // per-frame renderer.info: wrap the renderer instance as soon as it exists
  let frameId = 0, current = -1;
  const tick = () => {
    frameId++;
    const r = w.__cortexGraph?.()?.renderer?.();
    if (r && !r.__probed) {
      r.__probed = true;
      const render = r.render;
      r.info.autoReset = false;
      r.render = function (this: Renderer, ...a: unknown[]) {
        if (current !== frameId) { current = frameId; r.info.reset(); p.frames++; }
        const out = render.apply(this, a);
        const i = r.info;
        p.calls = i.render.calls;
        p.triangles = i.render.triangles;
        p.geometries = i.memory.geometries;
        p.textures = i.memory.textures;
        p.programs = i.programs?.length ?? 0;
        return out;
      };
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
