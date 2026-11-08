# Architecture: build, test, run

## Commands (all from the repo root)

| Command | What it does |
| --- | --- |
| `npm install` | dev dependencies only — the app has **no** runtime dependencies |
| `npm run dev` | Vite dev server on 5173 (HMR; **not** what the browser suite uses) |
| `npm run build` | `npm run typecheck` then `vite build` → `dist/` |
| `npm run preview` | serve `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `npm test` | Vitest — 50 unit files / 339 tests (node environment by default) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright browser suite (needs `npx playwright install chromium` once) |
| `npm run test:all` | unit suite then browser suite |
| `npm run report` | `scripts/forbidden-name-sweep.mjs` — the licence gate; **exit 1 blocks a milestone** |

The browser suite does **not** use the dev server: `playwright.config.ts` sets
`webServer.commands = ['npm run build', 'npm run preview -- --port 4173 --strictPort']`
and tests `http://127.0.0.1:4173/?test=1`, so what the tests exercise is the
shipped production bundle. Two consequences worth knowing: an e2e run rebuilds
(≈20 s), and a **typecheck error makes `npm run test:e2e` fail with a confusing
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
tests/e2e      Playwright spec (playable.spec.ts)
tools/re       reference-analysis harness (Python) — not part of the build
scripts/       dev helpers + the licence sweep
docs/          architecture/, reverse-engineering/, agent/, game-design.md, asset-provenance.md
```

TypeScript strict everywhere. There is **no path alias**: `tsconfig.json` has no
`paths` entry and every intra-project import is relative with an explicit `.js`
extension (`import { … } from '../engine/types.js'`), which is what
`module: esnext` + `moduleResolution: bundler` and Node both accept.

## Test policy

* Unit tests cover `src/gameplay` and `src/modes` completely, and `src/engine`
  except `bindings.ts` — whose rebind/unbind/conflict rules are untested and whose
  data is only round-tripped by `src/tests/persistence.test.ts`. Two pure islands
  elsewhere are covered: `src/render/blocks.ts` (`src/tests/blocks.test.ts`, 8
  tests) and the scaling maths of `src/app/layout.ts` (`src/tests/layout.test.ts`,
  14 tests, jsdom). Nothing in `src/ui` has a unit test.
* `src/ui/scenes.ts`, `src/ui/options.ts`, `src/ui/widgets.ts`,
  `src/app/{loop,input,main}.ts`, `src/render/{renderer,font5x7}.ts` and
  `src/engine/bindings.ts` are exercised **only** through the browser suite;
  `src/audio/engine.ts` is not exercised by any test at all, in Node or in the
  browser. That gap is tracked in `TODO.md`, and
  `docs/architecture/interfaces.md` tags each module `[U]`/`[E]`/`[—]` so the gap is
  visible where the API is read.
* Every test that depends on timing drives `session.advance(n)` — never a timer.
  `src/tests/timings.test.ts` is the one file allowed to assert a frame *count*
  rather than a behaviour, and it owns the config constants.
* Randomised behaviour always passes an explicit seed.
* e2e covers what unit tests structurally cannot: the page boots clean, the canvas
  paints, keyboard input moves a piece, mouse-only navigation reaches a playable
  field, wheel and right-click rotate, no page scroll on gameplay keys, a hidden
  tab pauses a live run, and every visible string is ours.
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

## Release posture

`npm run build && npm run preview` is the whole deployment: `dist/` is static, has
no server component, and makes no network requests beyond the files Vite emits.
There is no CI configuration in this repository — the four gates
(build+typecheck, unit, e2e, licence sweep) are run locally and their exit codes
recorded in `docs/agent/PROJECT_STATE.md` before a milestone is claimed.
