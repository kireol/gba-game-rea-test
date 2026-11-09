# TODO

Ordered by value per hour of work. Everything here is a real gap, not a wish list:
each item names the file it concerns and how its absence is currently papered over.

**Baseline this list was written against:** `npm test` 15 files / 248 tests green;
`npm run test:e2e` 7 tests green; `npm run build` green; `npm run report` PASS.
Nothing below is "in progress" unless it says so.

**Updated 2026-11-08 (later that day): § 1 item 5 is done.** New baseline
**23 files / 428 tests**, e2e 7 green, build green, sweep PASS over 99 files.
**Next item in § 1: 6.** § 2 is done too, by the same file, and says so.

**Earlier that day: § 1 item 4 is done.** Baseline then:
**21 files / 377 tests**, e2e 7 green, build green, sweep PASS over 96 files.

**Updated 2026-11-08: § 1 items 1-3 are done.** Baseline then: **18 files / 306
tests**, e2e 7 green, build green, sweep PASS over 92 files.

## 1. Unit coverage for the presentation layer

The rules layer is pinned hard. These files have **no unit tests at all** — they
are exercised only by 7 Playwright tests, which catch "the game boots and a piece
locks", not "the pause menu's fourth row is wrong":

| File | Lines | Risk it carries |
| --- | --- | --- |
| ~~`src/ui/scenes.ts`~~ | 1,343 | ~~the largest untested surface~~ — **covered since 2026-11-08** by 71 tests in three files over `src/tests/scenes-harness.ts` (item 4) |
| `src/audio/engine.ts` | 381 | autoplay unlock, music start/stop on status edges, mute persistence |
| `src/ui/options.ts` | 274 | option row model → `SaveData` mutations |
| `src/app/input.ts` | 213 | key/pointer/wheel mapping, prevented default set |
| `src/render/blocks.ts` | 229 | procedural tiles; a wrong `shade()` is invisible to every test |
| `src/render/font5x7.ts` | 212 | see item 2 |
| `src/ui/widgets.ts` | 189 | list/slider/clock geometry — a slider drag maps to the wrong value |
| `src/render/renderer.ts` | 167 | FrameModel → canvas; scale and clipping |
| `src/app/main.ts` | 139 | composition only; leave it last |

Done since this list was written: `src/app/loop.ts` → `src/tests/loop.test.ts`
(16 tests) and `src/engine/bindings.ts` → `src/tests/bindings.test.ts` (18 tests),
both pure enough to test without a DOM, which is why they went first; then
`src/ui/scenes.ts` → 71 tests across `src/tests/scenes-{menus,options,run}.test.ts`
(item 4), which needed no DOM either — the seam is the injected `SceneHost`, not the
canvas.

Order of work, cheapest-and-most-dangerous first:

1. ~~`src/tests/loop.test.ts`~~ **done.** Injected `now` plus a hand-pumped
   scheduler, so nothing waits: whole steps with the remainder banked, backlog
   dropped past `MAX_CATCHUP` rather than deferred, `stop()` cancelling the *live*
   handle, a restart that re-bases without losing its counts, a throwing `onTick`
   leaving the next frame scheduled, and a 60 Hz group pinning how the rounding of
   `STEP_MS = 1000/60` shows up.
2. ~~`src/tests/input.test.ts`~~ **done.** jsdom docblock, and every helper returns
   `event.defaultPrevented`, so each prevention is pinned beside the intent it
   belongs to: `SWALLOWED` codes, `event.repeat` dropped but still swallowed, key
   capture ahead of the bindings, wheel / right-click / middle-button mapping and
   the wheel deadzone, hover dedupe, blur and visibility, `dispose()`. Two things
   written here were wrong about the code, now fixed: `preventDefault` is **not**
   conditional on the test harness (a mapped key is always eaten — the harness reads
   `window.__orbit`, which `dispatch` fills), and `input.ts` does **not** divide
   pointer coordinates by the CSS scale (that is `layout.toFramebuffer`, which
   `input.ts` calls). What it found is in `docs/agent/PROJECT_STATE.md` § 6.
3. ~~`src/tests/engine-bindings.test.ts`~~ **done as `src/tests/bindings.test.ts`**
   (no `engine-` prefix — no other test file carries one). `rebind` steals the key
   from the previous owner, `unbind` falls back to the default, `normalizeBindings`
   drops garbage rows, `conflictsIn` sees both owners — plus the four behaviours
   `docs/agent/PROJECT_STATE.md` § 6 records from it.
4. ~~`src/tests/scenes-*.test.ts`~~ **done 2026-11-08** as three files over one
   harness: `src/tests/scenes-harness.ts` (a recording `SceneHost` stub — no DOM, no
   clock, no storage), `scenes-menus.test.ts` (18: title / mode list / high scores /
   erase-confirmation), `scenes-options.test.ts` (26: options rows, sliders, the
   bindings editor), `scenes-run.test.ts` (27: countdown, a live run, pause, results,
   the versus screen). Every row this item asked for is pinned, including the
   countdown's 4 × 45 withheld frames and what `debug().status` reports on each screen
   (null everywhere there is no run; side A only in a duel). Nine things it found are
   in `docs/agent/PROJECT_STATE.md` § 6, and the two sharp ones are worth reading
   before touching a settings screen: the options grid runs off the bottom of the
   screen and covers its own DONE button, and a `Delete` in the controls editor
   announces a reset it did not perform.
   **Still open here:** the rules-screen *scroll*, and the results card's other two
   headers — `scenes.ts:578` picks between `GOAL CLEARED`, `RUN OVER` and `DUEL
   OVER`, and only the middle one is asserted anywhere (`scenes-run.test.ts:261`);
   nothing reaches a won run or a finished duel.
5. `src/tests/render.test.ts` + `src/tests/font.test.ts` — **done 2026-11-08; 33 + 18
   tests.** No jsdom and no node-canvas: `src/tests/render-harness.ts` records the 2D
   calls a `FrameModel` produces, which is the right seam because `renderer.ts` is the
   only module that touches a canvas and every coordinate it emits is a framebuffer
   pixel. Order, geometry and resolved colour are all visible in the call list, and
   nothing had to be made public to get at them.
   **It found a shipped bug:** `timed-max-lines.ts:17` had an em-dash in its rules
   prose, the font has none, and `drawText` drops a glyph it lacks without warning —
   BLITZ's rules card was drawing a hole where the dash should be.
   What this suite still cannot see: the tile bevel texture and the atlas blit, which
   need a real `document` (see the harness header).
6. `src/tests/audio.test.ts` — fake `AudioContext`: exactly one voice set per
   effect, music starts only on the edge into `playing`, mute persists.
   **← next.** The last module with no test of any kind.

## 2. Font table (`src/render/font5x7.ts`)

**Done 2026-11-08 by `src/tests/font.test.ts` (18 tests).** The table itself stays
module-private — it is art, not an interface — so the suite works through the public
surface: probe the printable range with `glyphRows`/`canRender`, and check geometry by
drawing onto the recording canvas.

* Shape rows are in: 7 rows of 5, only `#` and `.`, no two characters sharing a
  drawing, lowercase borrowing the capital (which is also the atlas key). Shipped
  strings are covered by **walking every screen** rather than scanning source for
  literals — a scan cannot tell a label from a comment and misses strings assembled at
  run time. That walk is what caught the em-dash.
* The known-empty set is pinned as a named list rather than inferred: six characters,
  `"`, `$`, `[`, `]`, backtick, `~`. Space is deliberately **not** one of them — its
  glyph exists and carries no ink, which the suite asserts separately so a gap and a
  blank stay tellable.
* Non-ASCII is pinned absent as a decision, with the reason next to it: a 5×7 table
  draws every glyph by hand, so labels are ASCII and a multiply sign becomes `x`. The
  row that pins it says plainly that `drawText` will drop anything else silently, which
  is exactly how the em-dash survived shipping.

## 3. Audio (`src/audio/engine.ts`)

* There is **one** music loop and it plays only while a run's status is `playing`,
  so the title, mode list, options, pause, rules and results screens are silent.
  The brief asks for a variation per mode family; that is **not met**. Minimum
  honest fix: a second loop for menus, then one variation per family.
* `SfxName` has 17 entries and no `pause` sound; pausing is visual only. Decide
  whether that is the design and either add it or record the decision.

## 4. Save layer end-to-end

`src/tests/persistence.test.ts` (26 tests) fakes the storage object. The browser's
real `localStorage` is never round-tripped: quota errors, cross-reload recovery of
a real file, and the "hidden tab → reload keeps records" path are unverified.
Add a Playwright test that plays a run, reloads, and finds the record and the
settings intact.

## 5. Rules-layer mutation campaign

The rules and engine layer holds 244 of the 306 tests and has never been
mutation-tested. Run a campaign
(`Stryker`, or a scripted kill list against the timing/goal/garbage branches) and
fix surviving mutants instead of adding more tests. This is the cheapest way to
find out which of those 244 tests actually carry weight.

## 6. Real fullscreen

`src/app/layout.ts` (14 unit tests) is verified arithmetically: `computeScale`
proves no fullscreen mode at 1080p can give an integer 240×160 scale, which is why
the canvas is letterboxed and the fullscreen button targets `#stage`. The actual
`requestFullscreen` transition — a different screen, a different `devicePixelRatio`,
a `fullscreenchange` mid-run — has never been observed in a browser.

## 7. Small / optional

* `#stage` is horizontally centred by flex and then re-centred by `.wrap`'s
  `max-width: min(100%, 1024px)` + `margin: 0 auto`, so it is not vertically
  centred. Cosmetic; deliberately left alone. Fix with a wrapper or by dropping
  the `max-width` on `.wrap`.
* No favicon or web manifest (`index.html`'s `<head>` has none).
* No CI configuration exists. A pipeline that runs typecheck + unit + e2e +
  `npm run report` would make every gate above automatic.
* Playwright is Chromium-only (the one project in `playwright.config.ts`). Firefox
  and WebKit would widen the audio-unlock and `roundRect` coverage.

## Not planned (with the reason, so nobody re-opens it)

* **Real network link play.** The reference connects two handhelds. Substituted by
  local DUEL (decisions D4); reversing that means inventing a server the brief's
  committed infrastructure does not have.
* **Score parity with the reference.** Its scoring formula was never recovered, so
  score stays our own design, hidden by default.
  `docs/reverse-engineering/scoring-and-progression.md` records why.
* **Verifying the remaining measurement failures** (U1–U39 in
  `docs/reverse-engineering/reverse-engineering-unknowns.md`). They need emulator
  access to the reference image, which is deliberately absent from this repository.
  Anything unblocked by other means is re-opened from that file, not from here.
