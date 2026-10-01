// The pressure hull's compartments, bow (x = +33) to stern (x = -33), in world metres.
// Kept free of three.js: the boat builds its cutaway from it, and the no-WebGL
// fallback (./fallback.ts) lists it without loading the 3D bundle.
export const COMPS = [
  { x0: 25, x1: 33, name: "Tube space" },
  { x0: 12, x1: 25, name: "Torpedo stowage & mess" },
  { x0: 0, x1: 12, name: "Control room" },
  { x0: -10, x1: 0, name: "Wardroom, galley & battery" },
  { x0: -23, x1: -10, name: "Engine room" },
  { x0: -33, x1: -23, name: "Motor room & steering" },
];
