# Motion directions for jarvising.com

Jack's brief (2026-09-28): jarvising.com should be "a standout performer for what a testing tool could look
like." This is the menu of motion directions we drew up. Five are being prototyped on the `motion` branch
(preview: `https://motion.jarvising.pages.dev/`). The rest are parked here so we can come back to them.

The idea that holds them together: **a dictionary that's alive, and a lab that shows its working.** Motion
should feel like print and paper coming to life (type, ink, rules, proof marks), never generic SaaS
polish.

Ground rules for any of these:
- Use CSS/SVG first and keep WebGL inside the entries' live pieces. The home page stays under about 100 kB of JS.
- `prefers-reduced-motion` gets a complete, static page. Without JS, the page still reads.
- Every number, date or brief shown is real and sourced (git, files, measurement). If it can't be measured, it
  isn't shown.
- CSP is strict (`script-src 'self'`) with no third parties, so nothing inline and no CDNs.

## Prototyped (branch `motion`)

| # | Direction | Status |
|---|---|---|
| 1 | **Hot-metal hero.** The headword sets itself letter by letter, as if dropping into a composing stick, and the Fraunces weight/optical size settle as each letter lands. Skipped on repeat visits. | prototype |
| 5 | **The exploded page (signature).** The Enigma teardown technique applied to the home page itself: a sticky scroll section where a miniature of the page comes apart into its real layers (paper tokens, grid, type, markup, the machinery that ships it), with anchored callouts. | prototype |
| 6 | **Brief → live scrubber (signature).** On an entry page: the brief pinned above a slider that replays the build from real screenshots at real commits. Generic, so every future entry gets one. | prototype |
| 9 | **Ink-bleed transitions.** Cross-document View Transitions: an entry card bleeds into its page and reverses on back. Progressive: browsers without support just navigate. | prototype |
| 11 | **Test-rig strips.** Each entry card carries an instrument strip of measured numbers (payload, draw calls, triangles, CI state, QA filmstrip) that powers on as it scrolls into view. This is what makes it a showcase for *test projects*. | prototype |

## Parked

2. **A definition that edits itself.** The senses carry proof-reader's marks: a word is struck through, a caret inserts
   the new one and the "New entry" stamp re-dates, all driven by real git dates as entries land. The definition
   visibly evolves with the portfolio.

3. **Etymology ink.** On scroll, ink lines grow from the headword to each entry's "first attested" date, forming a
   family tree of the work. It gets denser as entries are added, so it shows "at scale" literally. Pairs well with
   the dated ledger idea (every entry gets an OED-style first-citation date).

4. **Thumb-index riffle.** Dictionary thumb-cut tabs down the page edge. Grab one and riffle through every entry with
   real paper curl (WebGL or CSS 3D), landing on a spread per entry. The speed of the riffle is the point.
   Wants 8+ entries before it earns its keep.

7. **Letterpress counters.** The running head carries honest numbers (entries, commits, agents) that tick
   over like a mechanical counter, in letterpress style rather than an airport split-flap. Numbers are generated at build
   time into static JSON, so there are no third-party requests.

8. **Marginalia that draws itself.** Pencil-stroke SVG notes write into the margins as you read, pointing at the
   machinery ("this is one progress value", "these labels are 3D points"). Works best on entry pages beside
   "How it was made".

10. **Lamp-board index.** The entry index behaves like the Enigma lamp board: type a letter and the entries starting
    with it light up (with an optional synthesised lamp thunk). Keyboard-first navigation that doubles as a toy.

12. **Specimen cabinet.** The index is a cabinet of drawers. Hover to pull a drawer, and the live piece boots inside it
    (the Enigma lid lifts, for example). Heavier, since it needs a lightweight "poster" mode per live piece, so it's parked
    until there are several entries.

## Also considered for jstov.uk (not for here)

Another agent's list for jstov.uk overlaps in places (boot sequence, departure board, constellation, infinite
canvas, live-demo bento, X-ray cursor, etc.). We kept jarvising's set distinct so the two sites don't look like
siblings: jstov is the person and the studio, jarvising is the dictionary and the lab.
