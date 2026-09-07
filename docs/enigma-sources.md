# Entry 001 — Enigma: claim ledger (phase 4, 2026-09-07)

Every historical statement on `/projects/enigma/` and `/projects/enigma/live/`,
with where it comes from and what was changed after checking. Verdicts:
**OK** (as stated, sourced) · **ADJUSTED** (wording changed on the page) ·
**NOTE** (kept, with a caveat recorded here). Sources are pointers Bletchley
Park's own staff would recognise: Bletchley Park Trust (BPT), GCHQ, The National
Museum of Computing (TNMOC), Crypto Museum, uboat.net, plus the standard
histories (Hinsley & Stripp *Codebreakers*; Welchman *The Hut Six Story*;
Copeland *The Essential Turing*; Sebag-Montefiore *Enigma: The Battle for the
Code*).

## Chapter 001 · The machine

| Claim | Verdict | Source |
|---|---|---|
| German military used Enigma 1926–1945 | OK | Crypto Museum, [Enigma history](https://www.cryptomuseum.com/crypto/enigma/hist.htm): Reichsmarine purchases from 1926 |
| "Some 40,000 of these boxes" | **ADJUSTED** → "an estimated forty thousand or more" | Estimates range 40,000–50,000, with unreliable figures up to 100,000 — [ciphermachinesandcryptology.com](https://www.ciphermachinesandcryptology.com/en/enigma.htm); production records in [Weierud, CryptoCellar](https://cryptocellar.org/enigma/e-prod-history/index.html) (20,306 Heer machines at Konski & Krüger alone) |
| Different letter lights; scrambling changes each keypress | OK | mechanism — see chapter 006 |

## Chapter 002 · The timeline

| Claim | Verdict | Source |
|---|---|---|
| Scherbius patented the rotor cipher, February 1918 | OK | patent filed 23 Feb 1918 — Crypto Museum [history](https://www.cryptomuseum.com/crypto/enigma/hist.htm); [DPMA](https://www.dpma.de/english/our_office/publications/milestones/computerpioneers/enigma/index.html) |
| Failed to sell to banks in the twenties, then the militaries arrived | OK | [Wikipedia: Arthur Scherbius](https://en.wikipedia.org/wiki/Arthur_Scherbius); Crypto Museum history |
| 1923 commercial Enigma exhibited | NOTE | first described by Scherbius in a 1923 technical article (Crypto Museum); shown at the 1923 International Postal Union congress, Bern (Wikipedia: Enigma machine) |
| 1926 Reichsmarine adopts it | OK | Crypto Museum history (Funkschlüssel C, 1926) |
| 1930 army model adds the plug board | OK | "Enigma I, with the double-ended plugboard, was put into service on 1 June 1930" — Crypto Museum history |
| 1932 Rejewski reconstructs the wiring | OK | Dec 1932 — [GCHQ, the Pyry Forest meeting](https://www.gchq.gov.uk/information/the-pyry-forest-meeting); [history.blog.gov.uk](https://history.blog.gov.uk/2019/07/26/whats-the-context-polish-cryptologists-reveal-they-have-cracked-the-enigma-code-26-july-1939/) |
| 1938 rotor choice grows to three-of-five | OK | rotors IV and V supplied from 15 December 1938 — Crypto Museum [Enigma I](https://www.cryptomuseum.com/crypto/enigma/i/index.htm) |
| 1942 U-boat M4 adds a fourth rotor | OK | M4 on Triton/Shark from 1 Feb 1942 — [uboat.net](https://uboat.net/technical/enigma_breaking.htm); Crypto Museum history |
| The lid card ("Zur Beachtung!") | NOTE | the real Enigma I lid carried a screen-printed *Zur Beachtung!* plate of **maintenance** instructions (Crypto Museum, Enigma I). Ours keeps the header and uses the card to say what the machine does — a museum-label reinterpretation, and the entry page now says so. |

## Chapter 003 · The assembly

| Claim | Verdict | Source |
|---|---|---|
| Battery, 26 switches, 26 bulbs, wire | OK | Crypto Museum Enigma I (circuit description) |
| Oak case, ~12 kg carried | NOTE | "weighs about 12 kg (26 lb)" — [Wikipedia: Enigma machine](https://en.wikipedia.org/wiki/Enigma_machine); Crypto Museum gives the 28 × 34 × 15 cm oak case but not a weight on the page fetched |

## Chapter 004 · The rotor

| Claim | Verdict | Source |
|---|---|---|
| 26 wires crossing a bakelite core; spring pins one face, flat contacts the other | OK | Crypto Museum Enigma I rotor description |
| 17,576 alignments | OK | 26³ |
| Operator could rearrange or swap wheels | OK | wheel order (Walzenlage) part of the daily key — Welchman, *Hut Six Story* |

## Chapter 005 · The path

| Claim | Verdict | Source |
|---|---|---|
| Current: plug board → rotors → reflector → back → lamp | OK | standard; Crypto Museum |
| Reflector means no letter encrypts to itself; exploited at Bletchley | OK | [TNMOC, Bombe historical background](https://www.tnmoc.org/bh-1-bombe-historical-background); Welchman |

## Chapter 006 · The step

| Claim | Verdict | Source |
|---|---|---|
| Right rotor steps before current flows; turnover notches; double step | OK | Crypto Museum Enigma I; implemented and tested in `cipher.ts` (AAAAA → BDZGO at AAA, no plugs) |
| 60 wheel orders (three of five) | OK | 5 × 4 × 3 |
| 150,738,274,937,250 plug-board pairings (ten pairs) | OK | 26! / (6! · 10! · 2¹⁰) |
| ≈ 1.6 × 10²⁰ daily key space | OK | 60 × 17,576 × 150,738,274,937,250 = 1.59 × 10²⁰ |

## Chapter 007 · Bletchley

| Claim | Verdict | Source |
|---|---|---|
| GC&CS moved into the mansion in August 1939 | OK | BPT, [Home of the Codebreakers](https://artsandculture.google.com/story/bletchley-park-home-of-the-codebreakers-bletchley-park/7gUxRIPFAxsA8A) (15 Aug 1939) |
| "Fifty miles north of London" | OK | ~50 miles NW; BPT |
| Wooden huts built on the lawn | OK | BPT, Hut 3 and Hut 6 markers |
| Hut 6: army + air-force Enigma; Hut 8: naval, under Turing | OK | [BPT, Hut 3 and Hut 6](https://www.bletchleypark.org.uk/markers/hut-3-and-hut-6/); Wikipedia [Hut 6](https://en.wikipedia.org/wiki/Hut_6), [Hut 8](https://en.wikipedia.org/wiki/Hut_8) |
| Poles handed over their reconstruction weeks before, at a meeting outside Warsaw | OK | Pyry, 25–26 July 1939 — [GCHQ](https://www.gchq.gov.uk/information/the-pyry-forest-meeting) |
| Nearly nine thousand by 1945, three-quarters women | OK | "At its busiest in January 1945, nearly 9,000 people… about three-quarters of them women" — BPT via [Google Arts & Culture](https://artsandculture.google.com/story/the-women-of-bletchley-park/qgVxQIAxvdB-JA) |
| Almost none told anyone for thirty years; 1974 the secret is published | OK | Winterbotham, *The Ultra Secret* (1974); BPT |
| Hut 6 led by Gordon Welchman | OK | Wikipedia Hut 6; Welchman |
| **Added:** Hut 6 flow — Registration → Machine Room → Decoding Room → Hut 3 | OK | [BPT, Inside Hut 6](https://www.bletchleypark.org.uk/our-story/e168-inside-hut-6/); Wikipedia Hut 6 / [Hut 3](https://en.wikipedia.org/wiki/Hut_3) (tea-tray through the tunnel) |

## Chapter 008 · The bombe

| Claim | Verdict | Source |
|---|---|---|
| Built on a Polish idea (the bomba), refined by Welchman's diagonal board | OK | TNMOC background; [Wikipedia: Bombe](https://en.wikipedia.org/wiki/Bombe) |
| Ran dozens of Enigmas in parallel (36) against a crib | OK | 36 Enigma equivalents — [TNMOC](https://www.tnmoc.org/bombe) |
| No letter to itself kills most guesses instantly | OK | TNMOC background |
| First bombe, Victory, March 1940 | NOTE | TNMOC: "started code-breaking… on 14 March 1940"; Wikipedia: installed in Hut 1 on 18 March 1940. Page says only "Mar 1940". |
| Aug 1940 diagonal board — Agnus Dei / Agnes | OK | working by 8 Aug 1940 — Wikipedia; TNMOC |
| "~200 bombes running by 1945" | **ADJUSTED** → "~210 bombes built by 1945" | 211 built — TNMOC ([bombe.org.uk background](https://bombe.org.uk/historical-background/)); Wikipedia notes 155 three-rotor bombes *available* in May 1945 |
| Tended around the clock by Wrens | OK | ~1,676 WRNS on bombes by war's end — TNMOC |
| "Credited with shortening the war by years" | **ADJUSTED** → attributed: Hinsley, "not less than two years and probably by four" | [Hinsley, *The Influence of ULTRA in the Second World War*](https://www.cix.co.uk/~klockstone/hinsley.htm) |

## Chapter 009 · Your turn

| Claim | Verdict | Source |
|---|---|---|
| Rotors I·II·III, reflector B, ten plug pairs, faithful wirings | OK | wirings public domain; Crypto Museum wiring tables; tested (BDZGO) |
| Rejewski broke the design on paper in 1932 | OK | GCHQ Pyry page |

## Set dressing (the hut)

| Item | Verdict | Source |
|---|---|---|
| "HUT 6" sign, MOST SECRET, watch rota, a crib card ("RED", WETTERVORHERSAGE / KEINE BESONDEREN EREIGNISSE) | NOTE | Red = the Luftwaffe general key broken daily in Hut 6 (Welchman); weather reports and "nothing to report" were classic cribs (TNMOC). The cards are **evocations**, not transcriptions of real documents. |
| Intercept form "G.C. & C.S. — INTERCEPT, STATION CHICKSANDS" | NOTE | RAF Chicksands was a Y-station feeding Hut 6 (BPT). Form layout invented. |
| Clock at 23:40, night watch | NOTE | atmosphere |

## Added to the entry page (History notes), all sourced

- **Herivel tip and cillies, May 1940** — [Wikipedia: Hut 6](https://en.wikipedia.org/wiki/Hut_6) (Herivel); Welchman.
- **Banburismus, Hut 8** — Copeland, *The Essential Turing*; [Wikipedia: Banburismus](https://en.wikipedia.org/wiki/Banburismus).
- **U-110, 9 May 1941** — [naval-history.net](https://www.naval-history.net/xDKWW2-4105-32MAY01.htm); [uboat.net](https://uboat.net/boats/u110.htm).
- **Shark blackout, 1 Feb – 13 Dec 1942; U-559, 30 Oct 1942 (Fasson, Grazier, Brown)** — [uboat.net](https://uboat.net/technical/enigma_breaking.htm); [BPT podcast E144 Shark Attack](https://www.bletchleypark.org.uk/our-story/e144-shark-attack/); [Royal Museums Greenwich](https://www.rmg.co.uk/collections/library/rmgl-116804).
- **Mavis Batey (Lever) and Matapan, March 1941** — [GCHQ](https://www.gchq.gov.uk/person/mavis-batey); BPT.
- **Hut 6 flow to Hut 3** — BPT Inside Hut 6; Wikipedia Hut 3.

## Not claimed (deliberately)

Anything about individual operators' words, exact bombe run times, or the
internal wiring of the bombe menu. The rotor cover plate with its three windows
is omitted from the model (phase 2 note) — the rotors are shown exposed.
