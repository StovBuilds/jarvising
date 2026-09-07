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

1. ~~The Enigma itself~~ — done 2026-09-07 as a **parts library**
   (`tools/blender/enigma-parts.py` → `public/models/enigma.glb`, 20 parts,
   ~10k tris, 387 kB, `--no-quantize`). `buildMachine(lib?)` swaps each
   primitive for the named library geometry via `libMesh()` and keeps every
   position/anchor/trace; primitives remain the fallback (6 s load timeout).
   ⚠️ Trap hit: quantised positions are normalised int16 with the scale on the
   node — baking the node matrix into them clamps at 1.0 and flattened the
   case/lid/deck. The loader now converts positions to float first and the
   library is exported unquantised. Engraved key letters added the same day
   (26 `keyLetter_X` parts from Blender text). Not done: the rotor cover
   plate with three windows (needs choreography changes).
2. ~~The bombe~~ — done, and it **runs** (2026-09-07): drums exported as
   linked duplicates under one Empty with `export_gpu_instances=True` →
   `EXT_mesh_gpu_instancing` → five `InstancedMesh`es; the loop rewrites
   instance matrices (rest × rotation about the shared mesh's own Y) while
   beat > 0.79: top row spins, middle steps once per rev, bottom still. Not
   done: a letter-ring texture on the drum faces, the back-side menu plugging.
3. ~~Room dressing~~ — done: `tools/blender/props.py` → `public/models/props.glb`
   (telephone, typewriter, stove, coat; 293 kB, `--no-quantize`), placed via
   `room.propSlots`, loaded right after first paint, runtime materials by name.

**Phase 2 is complete.** Assets total ≈ 1.56 MB (bombe 697 kB quantised,
enigma parts 568 kB, props 293 kB), all reproducible from the three scripts.

Budget: GLBs ≤ 2 MB total, quantised only (no Draco/meshopt while the CSP
stays strict — see phase 2 note above); lazy-load anything not needed before
the rotor beat. A GLB that fails to load must leave the chapter readable from
the copy alone (the bombe already does).

## Phase 3 — exhibition / kiosk mode (`?kiosk=1`)

**Built 2026-09-07.** `https://jarvising.com/projects/enigma/live/?kiosk=1`
(`&idle=<seconds>` overrides the 60 s idle threshold for testing; `&p=` still
pins progress for setup staff). What it does:

- **Attract loop** (`Enigma.tsx`, kiosk effect): idle at the title for 8 s →
  the film runs (the existing RUN FILM auto-scroll, ~80 s end to end). Any
  touch/wheel/key stops it. Abandoned mid-way and quiet for 60 s → simulator
  reset, smooth scroll to the top, film restarts ~1.5 s later. The film's end
  counts as an interaction, so the typing beat holds a full idle period before
  the reset. "TOUCH TO BEGIN" pulses whenever it is sitting at the title.
- **Touch-first**: vertical rail replaced by a tappable chapter bar (nine
  pills); 42 px simulator keys; bigger rotor-window buttons; copy and labels
  larger and brighter; grain overlay off; no share link, no exit link, no
  "scroll to decode".
- **Fullscreen + wake-lock** requested on the first touch (both need a
  gesture); wake-lock re-requested when the tab becomes visible again.
- **Offline**: `public/sw.js`, registered only in kiosk mode with scope
  `/projects/enigma/`. Navigation network-first with the cached shell as
  fallback; `/assets/`, `/fonts/`, `/models/` cache-first with background
  revalidate; on activate it crawls the live page + CSS for hashed asset URLs
  and warms the cache with them and the three GLBs.
- QA: `node tools/qa-shots.mjs --p 0.3,1 --qs "kiosk=1" --w 1920 --h 1080`,
  and the attract-loop behavioural test (see the session's `kiosk-loop.mjs`
  pattern: `idle=3`, expect start → stop on touch → reset → restart).

Still to do before a real installation: a physical soak test on the target
hardware (touch screen, GPU, browser kiosk flags), a hidden staff gesture to
exit fullscreen, and sound policy for the space (the sound toggle still needs
a first gesture, which the attract touch provides).

Original requirements, for reference:

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
