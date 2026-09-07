# Entry 001 — Enigma: plan

Jack's brief (2026-09-07): improve the product as a whole, lean into the
Bletchley Park history, and aim it at a possible exhibition / entry point for
Bletchley once polished. jarvising.com is the primary version from now on;
the jstov.uk lab copy gets backfilled when this is finished.

## Done — phase 1 (2026-09-07)

- **Callouts** anchored to the real meshes (invisible `Object3D`s parented to
  the lid board, lamp plate, keyboard, plug plate, axle, reflector, each rotor
  disc), placed to the near side, clamped inside the viewport and away from the
  copy/HUD, pushed apart when they overlap. Desktop and mobile gaps differ.
- **The hut.** `src/enigma/room.ts`: floorboards, painted board walls with a
  dado, blackout window with a moonlit slit and tape crosses, notice board
  (MOST SECRET, night rota, a crib, a reminder that no letter encrypts to
  itself), HUT 6 sign, wall clock at 23:40, the desk, a second desk and chair
  for depth, intercept pad, pencil, enamel mug, forms. One shadow-casting
  pendant spotlight is the key; a cool point light at the window slit and a
  directional rim stand in for moonlight. Shadows on desktop only (≥900 px,
  not reduced-motion).
- **Lid card.** The real lid held a printed *Zur Beachtung!* notice. Ours keeps
  the header and says plainly what the machine does; a new camera key at beat
  0.175 reads it, with a callout.
- **History.** Two new chapters (007 Bletchley, 008 The Bombe) with spec
  tables; 001/002 copy widened; a beat-space remap (`toBeat`) so the existing
  choreography did not need retuning. Rail now has nine ticks.
- **Legibility.** Radial dark backdrop + text shadow behind the chapter copy;
  translucent blurred panel behind the simulator.

## Phase 2 — Blender assets (`blender-assets` skill; harness `~/bin/blender-run.mjs`)

**Started 2026-09-07 — the bombe is in.** `tools/blender/bombe.py` (parametric
bpy, scene units, Z-up → exporter Y-up) → `public/models/bombe.glb` →
`tools/optimize-glb.mjs` (weld + quantize + prune via the 3d-kit gltf-transform
install; **no meshopt/Draco** because the CSP has no `wasm-unsafe-eval` and no
`blob:` workers) → 867 kB, 40.7k tris, 16 meshes. Loaded lazily by GLTFLoader
once beat > 0.55, stood along the right wall (room widened to ±16), two camera
keys for chapter 008 and a `bombe` callout anchor. Rebuild:
`node ~/bin/blender-run.mjs tools/blender/bombe.py --expect public/models/bombe.glb -- --out public/models/bombe.glb [--preview x.png]`
then `node tools/optimize-glb.mjs public/models/bombe.glb`.

Procedural primitives cap the fidelity. Remaining candidates, in order of payoff:

1. **The Enigma itself** as a GLB: proper rotor thumb-wheel serrations,
   bakelite key stems, the lamp-panel bezel, plug-board sockets with real
   cable sag, the case's dovetail corners and hinges. Keep the *same part
   names* so the explode choreography and anchors keep working.
2. ~~The bombe~~ — done (above). Next for it: a letter ring texture on the
   drum faces, the back-side menu plugging for a reverse shot, and a slow drum
   spin during chapter 008 (drums are joined per colour; spinning needs them
   as instances — export with linked duplicates + `EXT_mesh_gpu_instancing`).
3. Room dressing that primitives do badly: the pendant lamp's enamel shade,
   a Bakelite telephone, a Typex-style typewriter on the second desk, a
   coat on a hook, a stove.

Budget: GLBs ≤ 2 MB total, quantised only (no Draco/meshopt while the CSP
stays strict — see phase 2 note above); lazy-load anything not needed before
the rotor beat. A GLB that fails to load must leave the chapter readable from
the copy alone (the bombe already does).

## Phase 3 — exhibition / kiosk mode (`?kiosk=1`)

For a gallery screen or a Bletchley entry point, the piece needs to run
unattended:

- Attract loop: auto-run the film on idle, reset to the top after 60 s with
  no input, no share link, no external links, no keyboard shortcuts that
  leave the page.
- Touch-first: bigger simulator keys, a visible "scroll" affordance replaced
  by "touch to continue" and chapter buttons; the rail becomes tappable
  pills.
- Larger type and higher contrast for viewing at 1–2 m; no grain overlay.
- Fullscreen + wake-lock; offline-capable (service worker caching the bundle
  and fonts) so a flaky gallery network cannot take it down.
- A hidden `?p=` scrub still works for setup staff.

## Phase 4 — history depth and accuracy pass

Before any approach to Bletchley Park Trust, every historical claim on the
page gets a source. Current claims and where they came from (general
histories — Hinsley & Stripp *Codebreakers*, Copeland *The Essential Turing*,
Welchman *The Hut Six Story*, BP Trust's own site):

- Scherbius patent Feb 1918; commercial exhibition 1923; Reichsmarine 1926;
  army plug board 1930; three-of-five 1938; M4 1942.
- Rejewski's 1932 reconstruction; Pyry meeting July 1939; GC&CS to BP
  August 1939; Hut 6 (Welchman) army/air, Hut 8 (Turing) naval; ~9,000 staff
  by 1945, ~three-quarters women; public disclosure 1974 (Winterbotham).
- First bombe *Victory* March 1940; Welchman's diagonal board summer 1940
  (*Agnus Dei* / *Agnes*); 36 Enigma equivalents per bombe; ~200 bombes by
  1945; operated by Wrens.

Things to add once sourced: the Herivel tip and cillies; Banburismus in Hut 8;
the U-110 and U-559 pinches; the Shark blackout of 1942; Mavis Batey and
Matapan; what a shift in the Hut 6 machine room actually did with a decrypt
(Registration → Machine Room → Decoding Room → Hut 3).

## Phase 5 — approach Bletchley Park (Jack's call)

Bletchley Park Trust runs a learning programme and has taken digital
interactives before. Likely route: a short note to their Learning /
Collections team with the live URL, the kiosk build, and an offer of the
source under MIT. Needs Jack to decide the framing (personal project vs APE)
and who sends it. Tracked as a Decision Desk item.

## Backfill to jstov.uk/lab

When phase 2/3 land: copy `src/enigma/` back into
`jstov/src/pages/lab/enigma/` + `Enigma.tsx`, restoring the react-router
links and the `noindex` meta (the lab is hidden by design), and keep the
`/lab/enigma` share-link path there.
