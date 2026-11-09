# Architecture: build, test, run

## Commands (all from the repo root)

| Command | What it does |
| --- | --- |
| `npm install` | dev dependencies only — the app has **no** runtime dependencies |
| `npm run dev` | Vite dev server on 5173 (HMR; **not** what the browser suite uses) |
| `npm run build` | `npm run typecheck` then `vite build` → `dist/` |
| `npm run build:single` | `npm run build`, then `scripts/inline-single-file.mjs` → `dist/orbit-drop.html`, one self-contained page that opens from `file://` |
| `npm run preview` | serve `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `npm test` | Vitest — 23 unit files / 431 tests (node environment by default; `layout.test.ts` and `input.test.ts` opt into jsdom per file, and the three `scenes-*.test.ts` files need no DOM at all — they drive the screen machine through a stub `SceneHost`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright browser suite (needs `npx playwright install chromium` once) |
| `npm run test:all` | unit suite then browser suite |
| `npm run report` | `scripts/forbidden-name-sweep.mjs` — the licence gate; **exit 1 blocks a milestone** |

The browser suite does **not** use the dev server: `playwright.config.ts` sets
`webServer.command = 'npm run build:single && npm run preview -- --port 4173 --strictPort'`,
tests `http://127.0.0.1:4173/?test=1`, and `tests/e2e/single-file.spec.ts` loads
the emitted `dist/orbit-drop.html` over `file://`, so what the tests exercise is
the shipped production bundle and the shipped single file. Two consequences worth
knowing: an e2e run rebuilds (≈20 s), and a **typecheck error makes
`npm run test:e2e` fail with a confusing
`Process from config.webServer... Exit code: 2`** instead of a compile message.

`?test=1` is the only thing that publishes `window.__orbit`; without it the page
exposes no test surface.

## Layout

```
src/app        main.ts (composition root) loop.ts input.ts layout.ts   (the only DOM/WebAudio layer)
src/engine     board.ts pieces.ts random.ts config.ts types.ts bindings.ts  (pure, imports nothing from src/*)
src/gameplay   session.ts score.ts duel.ts persistence.ts                   (pure except persistence)
src/modes      types.ts registry.ts + one file per mode id
               (goal-ladder linked-blocks timed-goal fixed-lines-race
                timed-max-lines rising-garbage duel)
src/render     frame.ts renderer.ts palette.ts blocks.ts font5x7.ts   (all art generated in code)
src/audio      engine.ts — synth, the 16 sfx and the four-chord loop  (all audio generated in code)
src/ui         scenes.ts options.ts widgets.ts format.ts   (screen machine + shared widgets)
src/tests      Vitest unit tests (one .test.ts per module; jsdom via a docblock)
tests/e2e      Playwright specs (playable.spec.ts, single-file.spec.ts)
tools/re       reference-analysis harness (Python) — not part of the build
scripts/       dev helpers + the licence sweep + inline-single-file.mjs
docs/          architecture/, reverse-engineering/, agent/, game-design.md, asset-provenance.md
```

TypeScript strict everywhere. There is **no path alias**: `tsconfig.json` has no
`paths` entry and every intra-project import is relative with an explicit `.js`
extension (`import { … } from '../engine/types.js'`), which is what
`module: esnext` + `moduleResolution: bundler` and Node both accept.

## Test policy

* Unit tests cover `src/gameplay` and `src/modes` completely, and all of
  `src/engine` as of 2026-11-08: `src/engine/bindings.ts` is pinned by
  `src/tests/bindings.test.ts` (18 tests), having previously been untested apart
  from the round-trip its data gets in `src/tests/persistence.test.ts`. Three
  islands elsewhere are covered: `src/app/loop.ts`
  (`src/tests/loop.test.ts`, 16 tests, injected clock and scheduler),
  `src/app/input.ts` (`src/tests/input.test.ts`, 24 tests, jsdom — real DOM events
  at the real listeners, asserting the dispatched `Intent` *and*
  `event.defaultPrevented`), `src/render/blocks.ts` (`src/tests/blocks.test.ts`,
  8 tests) and the scaling
  maths of `src/app/layout.ts` (`src/tests/layout.test.ts`, 14 tests, jsdom).
* `src/ui/scenes.ts` has had unit tests of its own since 2026-11-08: 74 across
  `src/tests/scenes-menus.test.ts` (18), `scenes-options.test.ts` (26) and
  `scenes-run.test.ts` (30), all three driven through one shared stub `SceneHost` in
  `src/tests/scenes-harness.ts`. No DOM and no clock: the screen machine's only door
  out is that host, so every sound, status edge, announcement and persistence write is
  assertable from the recorder, and `frame()` returns the draw calls the screen would
  have made. What it turned up is recorded in `docs/agent/PROJECT_STATE.md` § 6.
* `src/render/renderer.ts` and `src/render/font5x7.ts` have had unit tests since
  2026-11-08: 33 in `src/tests/render.test.ts`, 18 in `src/tests/font.test.ts`, over
  `src/tests/render-harness.ts`. Neither rasterises anything — the harness records the
  2D calls a `FrameModel` produces, which is where every framebuffer coordinate is
  decided — and the font file checks the glyph table against the strings the screen
  machine actually asks for, by walking every screen. Two things stay browser-only
  because `document` is undefined under node: the tile bevel texture in `blocks.ts` and
  the atlas blit in `font5x7.ts`, both of which degrade to a flat `fillRect` in the unit
  environment.
* Still exercised **only** through the browser suite: `src/ui/options.ts`,
  `src/ui/widgets.ts` and `src/app/main.ts`; `src/audio/engine.ts` is not exercised by
  any test at all, in Node or in the browser. Those gaps are tracked in `TODO.md` § 1, and
  `docs/architecture/interfaces.md` tags each module `[U]`/`[E]`/`[—]` so the gap is
  visible where the API is read.
* Every test that depends on timing drives `session.advance(n)` — never a timer.
  `src/tests/timings.test.ts` is the one file allowed to assert a frame *count*
  rather than a behaviour, and it owns the config constants.
* Randomised behaviour always passes an explicit seed.
* e2e covers what unit tests structurally cannot: the page boots clean, the canvas
  paints, keyboard input moves a piece, mouse-only navigation reaches a playable
  field, wheel and right-click rotate, no page scroll on gameplay keys, a hidden
  tab pauses a live run, and every visible string is ours. `single-file.spec.ts`
  adds what only a `file://` page can show: the game boots and plays from disk,
  fetching nothing but itself.
* New unit tests are added one file at a time and run **before** the next file is
  written, so a wrong assertion is caught while there is only one to suspect.

### Running checks safely

Never run a foreground test command while a driver loop owns the same suite, and
never pipe a check through `head` — truncating Vitest's summary hides failures.
Use the pattern the milestone audits used:

```
npx vitest run > /tmp/unit.txt 2>&1; echo "UNIT_EXIT=$?"
```

and read the summary lines from the file.

## Reference-analysis harness (not shipped)

`tools/re/` is Python 3 (`pillow`) driving mGBA over a Lua JSON-RPC bridge on
`127.0.0.1:8777`:

```
scripts/start-mgba.sh [path/to/reference.rom]   # or $REFERENCE_ROM, or first rom/*.gba
scripts/load-bridge.sh                          # attach the Lua bridge
python3 tools/re/exp.py load:/tmp/s.ss adv:120 shot:/tmp/f.png
python3 tools/re/fieldsig.py /tmp/f-*.png       # per-8×8-cell hue classification
python3 tools/re/rom_header.py <rom>            # header metadata only
```

Nothing in `tools/` or `scripts/` is imported by the game; the build has no
Python or emulator dependency, and the ROM is gitignored and never needed at
runtime.

## Single-file page (`dist/orbit-drop.html`)

`npm run build:single` is `vite build` plus `scripts/inline-single-file.mjs`, which
replaces the emitted `<script type="module" crossorigin src="./assets/index-*.js">`
with the same bundle as an **inline** module script. The result is one ≈70 KB file
that runs by being double-clicked: no server, no `npm install`, no request leaves
the page.

This is the only artifact a browser cannot open from disk by itself. `dist/index.html`
on `file://` fails by design: a module script fetched by a `file://` document is
fetched against the opaque `null` origin, which Chromium and Safari both refuse,
while an inline module script performs no fetch at all. The multi-file build stays
the deployment target (source map, cacheable bundle, what `npm run preview` and the
served e2e tests use); the single file is the share-and-run copy. `dist/` is
gitignored and `emptyOutDir` wipes it, so the file is regenerated on every
`build:single`, never kept.

What makes the step this small is the project's own shape: **no runtime
dependencies**, no CSS asset (the page's stylesheet is already inline in
`index.html`), no `import.meta.env`, no worker, no fetched asset — every byte is
generated in code. So the inliner handles exactly one script tag, and *fails the
build* (`exit 1`) instead of emitting a half-working page if it ever finds anything
else: an unresolvable `src`, a hoisted stylesheet, a `modulepreload`, or a
`</script` sequence it could not neutralise. `</script` and `<!--` inside the
payload are rewritten to `<\/script` and `<\u0021--`, the escapes evaluating back to
the original characters, which is what script data in HTML requires. The
`sourceMappingURL` comment is dropped, because the map cannot travel inside the page.

Node is needed to build this file and never to run it. `?test=1` works on `file://`
as well (`window.location.search`), so the `file://` spec still reads
`window.__orbit`.

## Release posture

`npm run build && npm run preview` is the whole deployment: `dist/` is static, has
no server component, and makes no network requests beyond the files Vite emits.
Nothing in that chain needs Node either — `python3 -m http.server -d dist 8000`
serves the same files — and `npm run build:single` collapses them into one page
that needs no server at all.
There is no CI configuration in this repository — the four gates
(build+typecheck, unit, e2e, licence sweep) are run locally and their exit codes
recorded in `docs/agent/PROJECT_STATE.md` before a milestone is claimed.
