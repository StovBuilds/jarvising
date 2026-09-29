// three-render-objects (under react-force-graph-3d) statically imports
// WebGPURenderer from "three/webgpu" but only constructs it when a caller passes
// useWebGPU: true, which cortex-map never does. Left alone, that one import
// pulls three's whole WebGPU/TSL build into the bundle and fattens the shared
// three chunk that entry 001 also loads. vite.config.ts aliases "three/webgpu"
// here instead. If anything ever does ask for WebGPU, it fails loudly.
export class WebGPURenderer {
  constructor() {
    throw new Error("WebGPURenderer is stubbed out in this build (see src/cortex/webgpu-stub.ts)");
  }
}
