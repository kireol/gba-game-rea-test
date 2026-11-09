# Milestone report — a playable game, start to finish

Milestone: the brief's § 13 line — *"the user can start the game, select a mode,
see a rules screen, play, pause, return to menus and see high scores."*
Date: 2026-11-08. Recorded at `4c29d08`, 15 commits spanning 2026-11-07 → 2026-11-08.

That line is now true in a browser, with both input styles, and the gates below are
what this report claims rather than what it hopes. Where the brief's § 13 ends —
*"Do not claim completion merely because the standard mode works"* — this report
lists the six modes' rule provenance, the silent-menu gap and the 39 open
measurement questions rather than hiding them.

## 1. What was completed

| Deliverable | Evidence | Commit |
| --- | --- | --- |
| Rules engine: pure, frame-quantised, seeded, DOM-free | `src/engine/`, `src/gameplay/`, 12 unit files | `d122f6f`, `45881d8`, `8623231` |
| Seven rule sets (6 solo + a versus wrapper) | `src/modes/` + `src/gameplay/duel.ts`, 50 tests | `8551a67`, `a5e4088`, `8b9ae7c` |
| Save layer (versioned, corrupt-isolating, hostile-input hardened) | `src/gameplay/save-data.ts`, 26 tests | `35f4be1` |
| Renderer: 240×160 framebuffer → integer scale, procedural blocks, 5×7 font | `src/render/` | `4c29d08` |
| Audio: 1 music loop + 17 synthesised effects, gesture-gated unlock | `src/audio/engine.ts` | `4c29d08` |
| All screens: title, menu, mode list, rules, countdown, play, pause, options, key bindings, results, high scores, reset progress | `src/ui/scenes.ts` (1,343 lines) | `4c29d08` |
| Mouse as a complete second input path | `src/app/input.ts`, 2 browser tests | `4c29d08` |
| 7 browser tests driving real Chromium | `tests/e2e/playable.spec.ts` | `4c29d08` |
| Licence gate that reads source, docs and config | `scripts/forbidden-name-sweep.mjs`, `npm run report` | `f4a7950`, `45881d8` |
| Reference-study harness (dev-time only) | `tools/re/{bridge,exp,drive,fieldsig,fgrid,montage,rom_header}.py`, `scripts/{start-mgba,load-bridge}.sh` | `cf75ac7`, `e355664` |
| Documentation: 8 study notes, 5 architecture files, game design, asset provenance, README/TODO/CHANGELOG, this report | `docs/`, repo root | all |

Sizes (measured, `git ls-files`): 10,762 lines of TypeScript under `src/` — 4,641 of
them tests — plus 299 in the browser suite and 3,560 lines of Markdown across 18
tracked documents. `dist/` after a production build is one HTML file and one JS
bundle (plus a source map) — the page's stylesheet is inline in the HTML, so there
is no CSS file and no binary asset of any kind.

## 2. What was reverse-engineered

Measured from a legally obtained reference image, kept outside git (`rom/` is
ignored), through an emulator bridge plus screen capture and memory inspection.
Nothing from the study is a runtime or build dependency, and no ROM byte, decoded
tile, palette set or audio sample entered the product.

**Confirmed by measurement** (each cited in the file named):

| Finding | Source note |
| --- | --- |
| 10 × 20 visible field plus 2 hidden spawn rows; 8-px cells in a 240×160 window | `gameplay-mechanics.md` § 1 |
| Piece spawn box left at column 3 (line/I at 3), square at 4–5 | § 2 |
| Rotation in place about the piece's own box, 4 states, **no wall kicks** | § 3 |
| Gravity at level 1 = **50 frames/row** (bracketed 48–52 by 9 samples) | § 4 |
| Soft drop ≈ 4.4 frames/cell; hard drop instant, locks same frame | § 4 |
| DAS ≤ 16 frames, ARR ≤ 6 frames (upper brackets only) | § 5 |
| No lock delay observable at 12-frame sampling | § 5 |
| Next piece appears within 21 frames of a lock | § 4 |
| Ghost piece, 3-piece queue, hold — all present and on by default | § 7 |
| Menu flow title → 5-row menu with a caption → mode list → rules screen; six entries plus a versus entry | `menu-and-ui-analysis.md` |
| In-run stats are `TIME` / `GOAL` / `LEVEL`; results show `TIME` / `LINES` / `LEVEL`; **no score anywhere** | `scoring-and-progression.md` § 1 |
| `GOAL 5` at level 1 and `GOAL 20` at level 4 on the goal-ladder entry | `scoring-and-progression.md` |
| `GOAL 80` and `GOAL 25` seen once each, on other entries | `game-modes.md` |
| Second entry's field starts with garbage rows and a star-block bottom row; same-colour locked blocks adhere | `game-modes.md` |
| The piece generator is seeded and reproducible | `game-state-architecture.md` |
| Music stops when a run stops; the menu is a different audio state | `audio-behavior.md` |
| Difficulty is a persisted 1–4 row | `menu-and-ui-analysis.md` |

**Recorded as unknowns rather than guessed silently**: 39 of them (U1–U39) in
`docs/reverse-engineering/reverse-engineering-unknowns.md`, each with what was
attempted, why it failed and what would unblock it. The load-bearing ones: gravity
for levels 2–15 was never sampled (U1); the goal counter's decrement was never
observed at all — the one long run completed zero rows (U12); entries 3–6 of the
mode list were never reachable (U21/U26); versus needs two linked units (U27); the
randomiser's *algorithm* is unknown even though its reproducibility is not (U30).

## 3. What remains incomplete

| Gap | Why it matters | Where tracked |
| --- | --- | --- |
| The presentation layer has **no unit tests** (3,415 lines across `scenes.ts`, `audio/engine.ts`, `options.ts`, `input.ts`, `blocks.ts`, `font5x7.ts`, `widgets.ts`, `renderer.ts`, `bindings.ts`, `main.ts`, `loop.ts`) | 7 browser tests prove "the game works", not "the pause menu's fourth row is right" | `TODO.md` § 1 |
| **One** music loop, playing only while a run's status is `playing` | The brief asks for a variation per mode family; menus are silent. Brief § 7 **not met** | `TODO.md` § 3 |
| Font table (63 keys) has no coverage test | A mistyped glyph row is found by looking at the screen | `TODO.md` § 2 |
| Real `localStorage` never round-tripped in a browser | Quota errors and reload recovery are unit-faked only | `TODO.md` § 4 |
| Rules layer never mutation-tested | 248 green tests do not prove 248 load-bearing assertions | `TODO.md` § 5 |
| Fullscreen transition never observed in a browser | Only the arithmetic (`computeScale`) is proven | `TODO.md` § 6 |
| No CI; Chromium-only browser matrix | Every gate above is manual today | `TODO.md` § 7 |
| 39 reference measurements still open | Some shipped numbers are [A], not [M] | the unknowns ledger |

## 4. Known discrepancies from the original

Deliberate, declared differences and unavoidable ones, with the reason:

| Area | The reference | Orbit Drop | Why |
| --- | --- | --- | --- |
| Mode roster | Six entries + versus; entries 3–6 never reachable | 6 solo modes of our own design over the 2 observable rule families | U21/U26; ASCENT and FUSION trace to observed entries, **RUSH / DASH / BLITZ / ENDLESS are [O]** |
| Versus play | Two linked units, one image each | Two boards, one keyboard, one shared seed | U27, decisions D4 |
| Score | No score field anywhere | Score exists, hidden by default (`settings.showScore`) | decisions D5 — persistence needs a comparable number |
| Goal decrement | Never observed | −1 per cleared line, `5 × level` per level | U12/U13, [A] |
| Level curve | 15 levels, `GOAL 5`@L1, `GOAL 20`@L4 | `5 × level`, 15 levels | only two data points; the linear fit matches both |
| Lock delay | None observed at 12-frame resolution | 0 frames | U3 — the classic "spin to lock" window is absent here |
| Same-colour adhesion | Adheres; mechanism unknown | Orthogonal cluster removal on a touching clear | U22–U24, our self-consistent reading |
| Music/sound | Multi-track sequenced driver, ~1 MHz sample channel | Synthesised from scratch, one loop | the brief forbids any reconstruction from captured samples |
| Save format | Battery-backed SRAM layout | JSON in `localStorage`, versioned | no reference format is read or written |
| Art, fonts, names, titles | Its own | Ours, generated in code | licence, and `npm run report` enforces the naming half |

## 5. Test results

Re-run on 2026-11-08 after the documentation pass; each gate is the project's own
command, not an ad-hoc one.

> **Superseded as a current count.** Everything below is the snapshot that pass
> produced. The suite grew afterwards — `scenes-*.test.ts`, `render.test.ts`,
> `font.test.ts`, `single-file.spec.ts` — and a controls change (`↑` turns the piece)
> landed after it. The live numbers are `docs/agent/PROJECT_STATE.md` § 5 item 7 and
> the gate table in `docs/architecture/build.md`; the latest run is 23 files /
> **431** unit tests, **9** browser tests, sweep `PASS` over 102 files.

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` (`tsc --noEmit`, strict) | clean, inside `npm run build` |
| Unit | `npm test` → `vitest run` | **15 files / 248 tests passed** |
| Production build | `npm run build` | passes; 35 modules; `dist/index.html` 2.11 kB, JS 68.49 kB (24.62 kB gzip) |
| Browser | `npm run test:e2e` (builds, then drives Chromium) | **7 passed** |
| Licence | `npm run report` | PASS — **89 files scanned**, 0 blocking hits, 3 acknowledged |

Unit suite, by file (count of tests):

```
modes 41   persistence 26   movement 23   session 21   scoring 17
random 15  layout 14        pieces 14     lines 13     timings 13
board 19   blocks 8         levels 8      duel 9       determinism 7
```

The browser suite, verbatim from the run (`tests/e2e/playable.spec.ts`, one file,
all 7 must stay green):

```
:112  boots on the title screen, painting with no errors
:143  scales the framebuffer by a whole number, preserving the aspect
:168  keyboard play: title to a piece that falls and locks
:208  mouse play: clicking a row enters it, with no keyboard at all
:235  wheel and right-click turn the piece, without scrolling the page
:259  player-facing text never carries the reference branding
:285  a hidden tab pauses a live run
```

What is *not* covered, stated plainly:

* No unit tests for `scenes.ts`, `options.ts`, `input.ts`, `bindings.ts`,
  `widgets.ts`, `renderer.ts`, `blocks.ts`, `font5x7.ts`, `loop.ts` or `main.ts` —
  3,415 lines whose only coverage is those 7 browser tests.
* **The audio layer has no automated test of any kind**, in Node or in the browser.
  Nothing asserts that music starts on the edge into `playing`, stops on pause, or
  that mute persists.
* Real `localStorage` is never round-tripped by a test; the 26 persistence tests use
  an in-memory fake.
* No coverage tooling is wired into any gate, so "no unit tests" above is a fact
  about the file list, not a percentage read from a report.

## 6. Recommended next steps

1. **Unit-test the presentation layer**, cheapest-and-most-dangerous first:
   `loop.ts` → `input.ts` → `bindings.ts` → `scenes.ts` screen by screen → widgets /
   renderer / audio. This is the largest unverified surface in the project.
2. **Second music loop for menus**, then one variation per mode family — the only
   brief requirement known to be unmet.
3. **Font-table coverage test** (shape + `canRender` over every shipped string).
4. **Browser round-trip for `localStorage`**: play, reload, records and settings intact.
5. **Mutation campaign** on the rules layer, then delete or fix the survivors.
6. **CI** running typecheck + unit + browser + licence on every push, and a Firefox
   project in `playwright.config.ts`.

## 7. Licence and provenance status

* `npm run report` passes: 89 files scanned, no blocking hits. Three exceptions are
  registered in the script — the emulator launcher and the reference-study note (both
  only ever name a file extension) and the browser test that has to name the strings
  it forbids — and today only that browser test actually trips a rule, three ways on
  one line (`playable.spec.ts:261`). Every acknowledged line is printed on every run
  for review.
* No ROM, screenshot, image, audio or font file is tracked in git; a production
  `dist/` contains no binary asset.
* `rom/` and `docs/reverse-engineering/screenshots/` are gitignored; the 3 screenshots
  kept there are behaviour documentation only and were never used as art.
* No git tags exist yet — the first release should be `v0.1.0` and should point at a
  commit whose five gates are all green.

## Reproducing these numbers

```bash
npm test && npm run build && npm run test:e2e && npm run report
```

`npm run test:e2e` runs the build itself, so it can never test a stale `dist/`.
