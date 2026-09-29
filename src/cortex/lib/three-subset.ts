// jarvising addition (see SOURCE.md). cortex-map loads `import("three")` and uses
// the namespace dynamically, which forces the bundler to keep ALL of three and
// fattened the three chunk entry 001 shares by ~42 kB gzip. These are exactly the
// names lib/*.ts reads off that namespace (grep "THREE\.[A-Z]"); CortexMap.tsx
// imports this module instead, so everything else tree-shakes away as before.
export {
  ACESFilmicToneMapping, AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  CylinderGeometry, DoubleSide, FogExp2, Group, LinearFilter, LineBasicMaterial, LineLoop, LineSegments, Mesh,
  MeshBasicMaterial, NormalBlending, PlaneGeometry, Points, PointsMaterial, QuadraticBezierCurve3, RingGeometry,
  ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, TubeGeometry, Vector2, Vector3, Vector4,
} from "three";
