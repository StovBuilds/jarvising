// Entry 004, Below the Layer: the entry point. It decides, before anything builds a
// renderer, whether this browser can run the 3D scene (./scene.ts, three.js, WebGL2).
// If not (WebGL switched off by a work laptop's policy, a blocklisted GPU, WebGL1
// only) it shows the still version (./fallback.ts) and never loads three.js.
// `?nogl=1` forces the still version for QA.
import "./style.css";
import { hasWebGL } from "../shared/webgl";
import { showFallback } from "./fallback";

if (!hasWebGL()) {
  showFallback("no-webgl");
} else {
  import("./scene").catch((e) => {
    console.warn("Below the layer: the 3D scene could not start; showing the still version.", e);
    showFallback("crashed");
  });
}
