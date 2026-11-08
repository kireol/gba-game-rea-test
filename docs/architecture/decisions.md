# Architecture: decisions

Each record: decision → why → alternatives considered → what it costs.

## D1. Own engine, no emulator, no ROM at runtime

Standalone TypeScript game. A shipped emulator core for the reference platform
would fail the brief's "not an emulator" requirement and would make the ROM a
runtime dependency. Cost: the rules must be re-implemented from behaviour, which
is why `reverse-engineering-unknowns.md` exists.

## D2. Rules layer is pure, synchronous and frame-quantised

`session.advance(frames)` is the only mutator; no timers, no DOM, no I/O.
Alternatives considered: a reactive store, an ECS, an `async` game loop. Rejected
because the brief's determinism requirement is trivially satisfied by a pure
`state → state` function, and every reference timing is measured in frames, so
frame counters are the natural unit. Cost: the renderer must keep its own
animation clock (`src/render/renderer.ts`).

## D3. One module per mode over a shared mechanics core

`src/engine` owns pieces/board/collision/lock; `src/modes/<id>.ts` supplies the
goal rule, the HUD meaning, the end condition and the special blocks. Alternative:
one self-contained module per mode (code duplication in collision/lock, and
divergent bugs across modes). Alternative: one module total (explicitly rejected
by the brief). Evidence that matches the reference itself: its piece geometry
tables are shared data (`game-state-architecture.md` § 6) while its screens differ
mainly in goal text and HUD fields (`game-modes.md`).

## D4. Local two-player instead of link play

The reference's versus entry requires two linked units, one cartridge each
(`menu-and-ui-analysis.md` § 4). A single browser window cannot honour that, and
its versus rules were never observable (U27). `DUEL` therefore runs two
`Session`s on one machine with split keyboard bindings and garbage sent between
boards. Declared divergence (`docs/game-design.md`). Alternative considered: omit
multiplayer; rejected because the reference clearly offers a versus entry.

## D5. Score exists but is hidden by default

No score field exists anywhere in the reference (`scoring-and-progression.md`
§ 1), so a score table would be our invention, not a finding. We keep the three
reference stats (`TIME`/`GOAL`/`LEVEL`, plus `LINES` on the results screen) as the
primary presentation and add an optional score behind `settings.showScore`
(default `false`). Alternative: ship no score; rejected because high-score
persistence (a brief requirement) needs a comparable number. Alternative: score
always on; rejected — it would misrepresent the reference.

## D6. 7-bag randomiser, seeded, with the reference's property instead of its algorithm

The reference's generator is seeded and reproducible but its algorithm is
unverified (U30). We implement a seeded 7-bag (`src/engine/random.ts`), which
satisfies "no immediate repeats" and is testable, and reproduce the *property* we
could verify (same seed → same sequence). Declared original.

## D7. All assets generated in code; no bundled fonts or files

The pixel font, block art, backgrounds and audio are produced by
`src/render`/`src/audio`. Alternative: bundle an OFL font (the brief allows it) —
rejected because it adds a dependency, a licence file to track and a download
step, for zero gain at 240×160.

Cost: the font is a hand-authored 5×7 bit table (`src/render/font5x7.ts`), so a
new character means new ink. The table has 63 keys — each glyph exactly 7 rows of
5 characters, using only `#` and `.` — and lowercase borrows the capital glyph
through `keyFor`. Of the 95 printable ASCII characters, 6 have no glyph at all:
`` `" $ [ ] ` ~` ``; the only key whose glyph carries no ink is the space, which is
the point of it. Nothing in the game's own strings needs one of the six, but
`canRender()` exists so a future string is caught by a test rather than by a blank
space on screen. There is **no** automated coverage test for the font table today
(tracked in `TODO.md`), so a mistyped glyph row is found only by looking at the
screen.

## D8. Menus are a scene machine over shared row geometry; the mouse is secondary input, never the only one

`src/ui/scenes.ts` owns the screens: `createScenes(host, initial)` returns
`frame()` / `intent()` / `key()` / `pointer()` / `advance()` / `blur()` /
`debug()`. It is **not** a pure reducer — it holds the live `Session` and mutates
its own state — but it stays free of the DOM: the shell hands it framebuffer
coordinates and it emits a `FrameModel`. Clicks and keys drive the **same** row
list, because every screen builds its geometries once (`listGeom(...)`) and
hit-tests that same array, so mouse support cannot drift from keyboard support.

Cost: every clickable row needs an explicit rect, and because a press activates
the row *under the pointer* (not the row the cursor was on when the pointer
arrived — pointer entry already moves the menu cursor), a single click can cross
two screens; the browser suite pins that rule. And because the machine talks to
`Session` and `SaveData` directly rather than through an event seam, `scenes.ts`
is the largest untested surface in the project (1,343 lines, covered only through
Playwright). Closing that gap is `TODO.md`'s first item, not a reason to prefer a
reducer.

## D9. Unverified reference behaviour is not shipped as fact

Where a number could not be measured (levels 2–15 gravity, lock delay, exact
DAS/ARR, goal decrement, modes 3–6 rules) we ship our own value, cite the measured
bracket or the absence, and list it in `game-design.md`. The sweep script and the
tagged documents are what keep "we recreated" from quietly becoming "we invented".

## D10. Reference artefacts stay out of the repository

`rom/` and `docs/reverse-engineering/screenshots/` are gitignored; the screenshots
contain the reference's wordmarks and are behaviour documentation only. Consequence
for this repo: the RE docs must be readable without them, and
`npm run report` is the guard that keeps the reference's names out of everything we
author.
