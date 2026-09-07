import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";

// Multi-page build. The holding page and the entry pages are hand-written HTML
// (no JS); only the live pieces mount a React/three bundle. public/ is copied
// through untouched (fonts, og images, _headers, robots, sitemap, llms.txt).
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    // Never inline assets as data: URIs — _headers ships `font-src 'self'`, and
    // Vite's default (<4 kB → base64) turned three small font subsets into
    // CSP violations on the live page (found on prod 2026-09-07).
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 600, // three.js alone is ~540 kB minified; it is its own cached chunk
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        enigma: resolve(__dirname, "projects/enigma/index.html"),
        enigmaLive: resolve(__dirname, "projects/enigma/live/index.html"),
      },
      output: {
        manualChunks: {
          three: ["three"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  server: { port: 4187 },
  preview: { port: 4187 },
});
