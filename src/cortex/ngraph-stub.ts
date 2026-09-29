// three-forcegraph can lay a graph out with either d3-force-3d (its default) or
// ngraph.forcelayout. cortex-map pins every node and only ever uses the d3
// engine, while ngraph.forcelayout builds its integrators with `new Function`,
// which this site's CSP (script-src 'self', no 'unsafe-eval') forbids. It is
// never called, but vite.config.ts aliases it here so no eval-shaped code ships.
export default function createLayout(): never {
  throw new Error("ngraph.forcelayout is stubbed out in this build (see src/cortex/ngraph-stub.ts)");
}
