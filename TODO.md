# TODO

Ordered by value per hour of work. Everything here is a real gap, not a wish list:
each item names the file it concerns and how its absence is currently papered over.

**Baseline this list was written against:** `npm test` 15 files / 248 tests green;
`npm run test:e2e` 7 tests green; `npm run build` green; `npm run report` PASS.
Nothing below is "in progress" unless it says so.

## 1. Unit coverage for the presentation layer

The rules layer is pinned hard. These files have **no unit tests at all** — they
are exercised only by 7 Playwright tests, which catch "the game boots and a piece
locks", not "the pause menu's fourth row is wrong":

| File | Lines | Risk it carries |
| --- | --- | --- |
| `src/ui/scenes.ts` | 1,343 | every screen, every hit-test, every countdown; the largest untested surface in the project |
| `src/audio/engine.ts` | 381 | autoplay unlock, music start/stop on status edges, mute persistence |
| `src/ui/options.ts` | 274 | option row model → `SaveData` mutations |
| `src/app/input.ts` | 213 | key/pointer/wheel mapping, prevented default set |
| `src/render/blocks.ts` | 229 | procedural tiles; a wrong `shade()` is invisible to every test |
| `src/render/font5x7.ts` | 212 | see item 2 |
| `src/ui/widgets.ts` | 189 | list/slider/clock geometry — a slider drag maps to the wrong value |
| `src/render/renderer.ts` | 167 | FrameModel → canvas; scale and clipping |
| `src/engine/bindings.ts` | 160 | rebind/unbind/conflict rules; pure data, so cheap to pin |
| `src/app/main.ts` | 139 | composition only; leave it last |
| `src/app/loop.ts` | 108 | accumulator and `MAX_CATCHUP`; a pure injected-clock design, so cheap to pin |

Order of work, cheapest-and-most-dangerous first:

1. `src/tests/loop.test.ts` — inject `now` and `requestFrame`; assert 0…4 steps,
   backlog dropped past `MAX_CATCHUP`, pause → resume yields exactly one step, a
   throwing `step` still reschedules.
2. `src/tests/input.test.ts` — `SWALLOWED` codes, `preventDefault` only outside the
   test harness, wheel/right-click rotation, pointer coordinates divided by the CSS
   scale.
3. `src/tests/engine-bindings.test.ts` — `rebind` steals the key from the previous
   owner, `unbind` falls back to the default, `normalizeBindings` drops garbage
   rows, `conflictsIn` sees both owners.
4. `src/tests/scenes-*.test.ts` — split by screen: title/modes/options/bindings/
   scores/confirm/pause, plus the countdown (4 × 45 withheld frames) and
   `debug().status`. The e2e suite already relies on `?test=1`'s contract; unit
   tests should pin the same rows without a browser.
5. `src/tests/render.test.ts` + `src/tests/font.test.ts` — needs a canvas fake or
   jsdom; assert the FrameModel → draw-call mapping rather than pixels.
6. `src/tests/audio.test.ts` — fake `AudioContext`: exactly one voice set per
   effect, music starts only on the edge into `playing`, mute persists.

## 2. Font table (`src/render/font5x7.ts`)

* No coverage test exists for the 63-key bit table. Add one that asserts: every
  key is exactly 7 rows of exactly 5 characters, only `#` and `.` appear, and every
  character in every shipped UI string renders (`canRender`).
* Printable-ASCII characters with **no glyph at all**: `" $ [ ] ` ~` (the space is
  the only key whose glyph exists but carries no ink). Add glyphs or keep the list
  as an explicit "known-empty" set in the test so a future author knows the
  difference between a gap and a deliberate blank.
* No non-ASCII coverage (`× ° → ♥` and accents are absent). Fine today — pin it so
  it stays a decision rather than an accident.

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

The rules layer has 248 tests and has never been mutation-tested. Run a campaign
(`Stryker`, or a scripted kill list against the timing/goal/garbage branches) and
fix surviving mutants instead of adding more tests. This is the cheapest way to
find out which of the 248 tests actually carry weight.

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
