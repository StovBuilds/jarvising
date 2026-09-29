import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";

// Multi-page build. The holding page and the entry pages are hand-written HTML
// that reads fully without JS (small vanilla modules add motion on top); only
// the live pieces mount a React/three bundle. public/ is copied
// through untouched (fonts, og images, _headers, robots, sitemap, llms.txt).
export default defineConfig({
  plugins: [react()],
  resolve: {
    // entry 002: keep three's WebGPU build out of the bundle (src/cortex/webgpu-stub.ts)
    // and ngraph's eval-built layout out of it too (src/cortex/ngraph-stub.ts: CSP has no unsafe-eval)
    alias: [
      { find: /^three\/webgpu$/, replacement: resolve(__dirname, "src/cortex/webgpu-stub.ts") },
      { find: /^ngraph\.forcelayout$/, replacement: resolve(__dirname, "src/cortex/ngraph-stub.ts") },
    ],
  },
  build: {
    target: "es2020",
    // Never inline assets as data: URIs — _headers ships `font-src 'self'`, and
    // Vite's default (<4 kB → base64) turned three small font subsets into
    // CSP violations on the live page (found on prod 2026-09-07).
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 650, // three.js alone is ~610 kB minified (entry 003 pulls in more of the core); it is its own cached chunk
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        enigma: resolve(__dirname, "projects/enigma/index.html"),
        enigmaLive: resolve(__dirname, "projects/enigma/live/index.html"),
        cortex: resolve(__dirname, "projects/cortex/index.html"),
        cortexLive: resolve(__dirname, "projects/cortex/live/index.html"),
        rig: resolve(__dirname, "projects/rig/index.html"),
        rigLive: resolve(__dirname, "projects/rig/live/index.html"),
        submarine: resolve(__dirname, "projects/submarine/index.html"),
        submarineLive: resolve(__dirname, "projects/submarine/live/index.html"),
      },
      output: {
        manualChunks: {
          // entry 002's named three re-export (lib/three-subset.ts) rides in the same chunk, so importing them
          // lazily never drags an extra chunk (or the modulepreload polyfill) into a page
          three: ["three", "./src/cortex/lib/three-subset.ts"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  server: { port: 4187 },
  preview: { port: 4187 },
});
