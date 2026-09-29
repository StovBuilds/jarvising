# Vendored: cortex-map

These files are copied from [StovBuilds/cortex-map](https://github.com/StovBuilds/cortex-map)
(MIT, © 2026 Jack Stovell; the licence is `./LICENSE`), `packages/cortex-map/src/`, at commit
**68db7b119258c29d434711676838d5a8bbd66ae1** (2026-07-23, "feat(globe): options").

cortex-map is not published to npm. Copying the source is the supported way to use it for now:
clone the repo and take `packages/cortex-map/src/`, or depend on the workspace package.

Changes made here, and nothing else:

- a two-line provenance header on every file;
- `import("three")` becomes `import("./three-subset")` (a named list of the classes used), so
  the shared three.js chunk stays tree-shaken;
- `CortexMapHandle` gains `wake(hold?)` and `graph()` (types.ts, CortexMap.tsx), so the page can
  drive the camera for the kiosk orbit and the arrow keys without the render-on-demand loop
  falling asleep mid-turn;
- `useMediaQuery` starts from `matchMedia(query).matches` instead of `false`, so a small screen
  (or reduced motion) goes straight to lite mode and never downloads the 3D renderer and three.js;
- the three HUD panels get class hooks (`cm-legend`, `cm-stats`, `cm-hover`) so the page can
  rearrange them on a phone.

`../Controls.tsx` and `../sampleData.ts` come from the same commit's `demo/src/`; their headers
say what changed.

Runtime dependencies (package.json): `react-force-graph-3d` and `react-force-graph-2d` 1.29.1,
and the site's existing `three` (0.185; cortex-map pins 0.184, and nothing it uses changed).
