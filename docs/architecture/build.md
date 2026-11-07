# Architecture: build, test, run

## Commands (all from the repo root)

| Command | What it does |
| --- | --- |
| `npm install` | dev dependencies only — the app has **no** runtime dependencies |
| `npm run dev` | Vite dev server (the Playwright suite serves this build) |
| `npm run build` | `tsc --noEmit` then `vite build` → `dist/` |
| `npm run preview` | serve `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `npm test` | Vitest, rules-layer unit tests (node environment) |
| `npm run test:e2e` | Playwright browser tests (needs `npx playwright install chromium` once) |
| `npm run report` | `scripts/forbidden-name-sweep.mjs` — the licence gate; **exit 1 blocks a milestone** |

## Layout

```
src/app        composition root, loop, input, layout     (the only DOM/WebAudio layer)
src/engine     board, pieces, random, config, types      (pure, no imports from src/*)
src/gameplay   session, score, persistence               (pure except persistence)
src/modes      one module per mode + registry
src/render     renderer, palette, 5×7 pixel font         (all art generated in code)
src/audio      WebAudio synth + original loops/sfx       (all audio generated in code)
src/ui         scenes (pure menus), options, bindings
src/tests      Vitest unit tests
tests/e2e      Playwright specs
tools/re       reference-analysis harness (Python) — not part of the build
scripts/       dev helpers + the licence sweep
docs/          architecture/, reverse-engineering/, game-design.md, asset-provenance.md
```

TypeScript strict everywhere; `@/*` path alias mirrors `src/*`
(`tsconfig.json` + `vite.config.ts` stay in sync).

## Test policy

* Unit tests import from `src/engine`, `src/gameplay`, `src/modes`, `src/ui` only.
  A test that needs a canvas or an `AudioContext` belongs in `tests/e2e`.
* Every test that depends on timing drives `session.advance(n)` — never a timer.
* Randomised behaviour always passes an explicit seed.
* e2e covers what unit tests structurally cannot: the page boots, canvas paints,
  keyboard input moves a piece, persistence survives a reload.

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
