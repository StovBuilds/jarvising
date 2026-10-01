// Can this browser run the live pieces' 3D? One answer for all four entries.
//
// WebGL is often switched off on managed work laptops ("disabled by enterprise
// policy", a blocklisted GPU, hardware acceleration turned off). three.js r185
// needs WebGL2, so a browser that only offers WebGL1 counts as "no WebGL" here.
//
// Deliberately three-free: the entry pages and the submarine's fallback import it
// without pulling the three chunk. `?nogl=1` forces the no-WebGL path for QA.

export type WebGLLevel = "webgl2" | "webgl1" | "none";

let cached: WebGLLevel | null = null;

function probe(kind: "webgl2" | "webgl"): boolean {
  try {
    const gl = document.createElement("canvas").getContext(kind) as WebGLRenderingContext | null;
    if (!gl) return false;
    const ok = typeof gl.isContextLost !== "function" || !gl.isContextLost();
    gl.getExtension("WEBGL_lose_context")?.loseContext(); // hand the context back: browsers cap live ones
    return ok;
  } catch {
    return false;
  }
}

/** What the browser offers: webgl2, webgl1 only, or nothing. Tries webgl2, then webgl. */
export function webglLevel(): WebGLLevel {
  if (cached) return cached;
  if (typeof document === "undefined") return "none";
  try {
    if (new URLSearchParams(location.search).get("nogl") === "1") return (cached = "none");
  } catch { /* no location */ }
  cached = probe("webgl2") ? "webgl2" : probe("webgl") ? "webgl1" : "none";
  return cached;
}

/** True when the pieces' three.js renderer can run (WebGL2). WebGL1-only is false. */
export function hasWebGL(): boolean {
  return webglLevel() === "webgl2";
}

/**
 * Build the renderer, or return null if the constructor throws ("Error creating
 * WebGL context" can still happen after a successful probe, e.g. when the GPU
 * process dies). Marks the browser as no-WebGL so later checks agree.
 */
export function tryRenderer<T>(make: () => T): T | null {
  if (!hasWebGL()) return null;
  try {
    return make();
  } catch (e) {
    console.warn("WebGL renderer failed to start; showing the still version.", e);
    cached = "none";
    return null;
  }
}

/** The plain-words why and how-to-fix, shared by every fallback. */
export const NOGL_WHY =
  "3D graphics (WebGL) are switched off in this browser. That's common on work laptops, where IT turns off hardware acceleration.";
export const NOGL_FIX =
  "Try it on a phone or a personal computer, or turn on “Use graphics acceleration” in your browser settings if you’re allowed to.";
