# Project state

Continuity anchor (see `QWEN.md`). Update whenever a task starts/finishes, a
decision is made, or a blocker appears.

## 1. Current objective

Build **Orbit Drop**, a complete browser-playable, independently implemented
falling-block puzzle game whose *rules* were derived by reverse-engineering the
reference ROM supplied in `rom/`. Not an emulator: the ROM is never needed at
runtime and no emulator core ships.

Authoritative brief: `prompt.md` (user-supplied). Its licence section overrides
everything else, including the deliverable list.

## 2. Important architectural decisions

* **Rules engine separate from rendering.** `src/engine/` (board, pieces,
  collision, randomiser, timings) and `src/gameplay/` (session state machine)
  have no DOM/Canvas/WebAudio imports; rendering, audio and input live in
  `src/render`, `src/audio`, `src/app`.
* **One module per verified mode** (`src/modes/<id>.ts`, registry in
  `src/modes/registry.ts`) — required by the brief; the standard mode alone is
  explicitly insufficient.
* **Shared engine + per-mode rule hooks** (not one codebase per mode), because
  the ROM's shared stride-0x20 piece-geometry block (`docs/reverse-engineering/
  game-state-architecture.md` § 6) shows the reference itself shares geometry.
* **Determinism as a first-class feature:** seeded PRNG injected everywhere;
  every rules test runs from a fixed seed. Verified property of the reference
  (`game-state-architecture.md` § 7).
* **Frame-quantised logic** (fixed 60 Hz logic step, float frame counters) so the
  measured frame timings (50 f/row etc.) map 1:1 to config values.
* **Link play replaced by local two-player** (`DUEL`, hot-seat + shared-keyboard
  two-gamepad-free substitute). Declared divergence — the reference needs two
  linked units, which a browser single-window build cannot honour.
* **Score is an opt-in extra**: the reference exposes no score field anywhere, so
  a score table would be our design, not a finding. Hidden by default
  (`options.showScore`, default `false`). See `docs/game-design.md`.
* **All assets procedural/in-repo.** No fonts, images or audio files are
  downloaded or bundled; the pixel font, art and audio are authored in code.
  `docs/asset-provenance.md`.
* Branding: game **Orbit Drop**; single-player modes ASCENT / FUSION / RUSH /
  DASH / BLITZ / ENDLESS, two-player **DUEL**. No reference product, company,
  platform or mode names anywhere in project-authored text
  (`scripts/forbidden-name-sweep.mjs`, `npm run report`).

## 3. Completed work (verified)

* Reference analysis phase finished — **8 documents** in
  `docs/reverse-engineering/`: `rom-overview`, `game-modes`,
  `gameplay-mechanics`, `scoring-and-progression`, `game-state-architecture`,
  `menu-and-ui-analysis`, `audio-behavior`, `reverse-engineering-unknowns`.
  Every claim tagged [V]/[I]/[U]/[R]; no disassembly exists because none was
  possible (documented in `rom-overview.md` § "What was *not* done").
* RE tooling committed and used: `tools/re/bridge.py` (mGBA Lua JSON-RPC),
  `exp.py`, `drive.py`, `fieldsig.py` (per-8×8-cell hue classifier — the source
  of every timing/geometry number), `fgrid.py`, `montage.py`, `rom_header.py`.
  `tools/re/rom_header.py` verified: 4 MiB, SHA-256
  `87a857de…cf5ed2a`, CRC-32 `7b729804`, header checksum stored==computed
  (`0xFB` @ `0x0BD`), entropy 5.576 bits/byte.
* Toolchain: node v26.13.0 / npm 11.20.0; `npm install` re-run and completed
  (91 packages) on 2026-11-07 — an earlier `node_modules` was absent, so nothing
  had actually been installed before that.
* Git: branch `main`, history `cf75ac7` → `e355664` → `5524b41` → `fd83195` →
  `1ca7338` → `d15e1fd`. ROM and reference screenshots are gitignored (`rom/`,
  `docs/reverse-engineering/screenshots/`, `docs/reverse-engineering/states/`).
* `scripts/start-mgba.sh` no longer hard-codes the reference file name (now
  `$1` / `$REFERENCE_ROM` / first `rom/*.gba`).
* Docs batch (`docs/architecture/*`, `docs/game-design.md`,
  `docs/asset-provenance.md`) — written; `decisions.md`, `asset-provenance.md`
  and `game-design.md` are still **untracked**, `PROJECT_STATE.md` modified.
* `scripts/forbidden-name-sweep.mjs` → `npm run report`: **PASS**. It now excludes
  itself from the scan (its rule table contains every forbidden string, which is a
  self-reference, not a hit) after a first run failed on 5 hits, 2 of them genuine
  wording problems that were reworded.
* Rules layer written and **type-clean** (`npx tsc --noEmit` empty):
  `src/engine/{types,config,pieces,board,random,bindings}.ts`,
  `src/gameplay/{score,session,duel,persistence}.ts`,
  `src/modes/{types,util,goal-ladder,linked-blocks,timed-goal,
  fixed-lines-race,timed-max-lines,rising-garbage,registry}.ts`,
  `src/modes/duel/index.ts`.
* Rules-layer tests running green: **88 passed / 88** in
  `src/tests/{board,pieces,random,scoring,movement}.test.ts` + `helpers.ts`
  (`npx vitest run`, 531 ms; `npx tsc --noEmit` clean). The first four files were
  committed in `fd83195` and `1ca7338`.
* Two rules bugs found by the movement suite and fixed in
  `src/gameplay/session.ts`, both verified by a mutation check (breaking the fix
  fails exactly those tests and nothing else):
  * `held.left`/`held.right` were never recorded, so `handleAutoShift` always
    bailed and DAS/ARR were dead code — holding a direction moved exactly one
    column. Now set in the `input()` switch, the only place that knows which side
    an intent belongs to.
  * `doHold()` with an empty slot moved the piece into the slot but left it in
    play, i.e. a free duplicate. Now `active = null`.

## 4. In progress

* Writing the rules-layer Vitest suite. Done: `board`, `pieces`, `random`,
  `scoring`, `movement` (column movement + DAS/ARR, rotation, projection, hard
  drop, hold, input while paused). Remaining: `timings`, `lines`, `session`,
  `levels`, `modes`, `blocks`, `determinism`, `persistence`, `bindings`, `assets`.
* Facts the suite established, so nothing here re-derives them:
  `session.advance(n)` drains and **returns** the queued events even for `n = 0`,
  and `input()` emits synchronously on key-down, so a helper that calls
  `advance()` must use its return value — `events()` afterwards is empty.
  `press`/`release`/`tap`/`hardDrop`/`steer`/`awaitActive` in `src/tests/helpers.ts`
  therefore return `SessionEvent[]`.
  `createSession()` calls `doSpawn()` during construction, so `spawn` + `sfx` are
  pending before the caller receives the object; `makeSession` discards that
  opening batch with `advance(0)` and the session suite has to go through
  `createSession` to see it.
  `snapshot().active` and `snapshot().board` are the **live** objects the session
  mutates (`doHardDrop` moves `active.y`), so a test that compares against the
  pre-mutation state must copy the scalars out first. `cellsOf(piece, rot, ox, oy)`
  takes *relative* offsets and already adds `piece.x/y` — passing the piece's own
  column as `ox` doubles it and reads the wrong cells.
  Movement tests stay piece-agnostic: at rotation 0 every shape touches both box
  walls, so the occupied span equals `BOX[id]`, which gives the wall clamp
  (`cols - boxWidth`) and the empty-field projection (`rows - boxHeight`) for
  whatever the bag dealt. The refused-rotation setup derives the cell to block
  from the next rotation state instead of hard-coding a coordinate.
  `seedShowing` strides candidate seeds by `0x9e3779b9`: consecutive mulberry32
  seeds produce near-identical first bags, so the old linear scan needed ~4400
  probes for one piece (~2.7 s); strided it is 1–16 probes and the whole suite
  dropped from ~3.2 s to 0.53 s.
  For the shared `SEED = 0x5eed1234` the first ten bag pieces are
  **L, Z, I, S, O, J, T, S, L, T**, so a fresh session opens on L with queue
  `[Z, I, S]`; `cellOf('L') === 7`.
* Verified frame numbers in our implementation: level-1 gravity moves on frame
  **50**; soft drop on **1, 5, 9**; DAS repeats at **16, 22, 28** after the
  immediate key-down move, so a tap is exactly one column; the piece locks on the
  first landed frame (`lockDelayFrames: 0`); `lines` lands on frame
  **`clearFreezeFrames` (30)**; `completeFloor(s, rows)` needs the field otherwise
  **empty**, because a piece lands on any debris and then misses the floor row.
* `docs/asset-provenance.md` lists a `pause` sfx that `SfxName` does not have, and
  `docs/architecture/interfaces.md` still shows pre-implementation signatures
  (`events()` as a property, `pushRow(cell, holes: COUNT)` argument order,
  `clearScore` shape, `ghost: number | null`, T spawning nub-down). Fix both in
  the docs pass.
* Then: `src/ui` (scenes + options + bindings screens), `src/render` (palette,
  procedural blocks, 5×7 font, renderer), `src/audio`, `src/app` (main, loop,
  input, layout), `vite.config.ts`, `playwright.config.ts`.
  `src/app/main.ts` (referenced by `index.html`) and both configs do **not exist
  yet**; the project does not build yet.
* Commit groups: engine+gameplay+modes → tests → render/audio/app → configs →
  e2e → README/TODO/CHANGELOG.


## 5. Outstanding tasks

1. Engine + tests: board, pieces, collision/rotation (no kicks), gravity/lock,
   line clear, seeded 7-bag, ghost, hold.
2. Gameplay: session state machine, goal/level progression, score (opt-in),
   top-out, garbage + star special blocks, persistence (settings, bindings,
   unlocks, high scores, reset-with-confirmation).
3. Modes: 6 single-player + DUEL, each its own rules module + tests.
4. UI: scene/menus state machine with mouse hit-testing, options, bindings
   editor, rules screens, results, pause.
5. Render (own 5×7 pixel font, procedural art), audio (WebAudio synth, original
   material), fullscreen + responsive scaling with correct aspect.
6. Vitest suite covering every mechanic the brief lists; Playwright browser
   tests (`npx playwright install chromium` first).
7. Verify `npm run typecheck`, `npm run test`, `npm run build`,
   `npm run test:e2e`, `npm run report` and report results verbatim.
8. `README.md`, `TODO.md`, `CHANGELOG.md`, milestone report.

## 6. Known issues & blockers

* **No disassembler/decompiler available** (checked: Ghidra, rizin, radare2,
  Hopper, ARM objdump) → zero code-level findings. The `gearboy` MCP server is
  available and has breakpoints/stepping/trace; it is the recommended next RE
  step for the memory-layout unknowns (U28/U29/U30/U32).
* mGBA throttles to ≈1 fps when its window is occluded → RPC timeouts. Fix:
  raise the window (`open -a mGBA`). `bridge.wait_frames` raises on this.
* The bridge serves one request per frame, so scripted menu input drifts; menu
  automation was unreliable (unknowns U26) — which is why mode-list entries 3–6
  are undocumented and their per-mode rules in our build are declared original.
* Big list of unresolved reference behaviour → `reverse-engineering-unknowns.md`
  (39 items). Nothing shipped depends on an unverified claim: each is either a
  documented assumption or a declared divergence.
* Two acknowledged out-of-scope occurrences of the reference title:
  `prompt.md` (the user's own brief, committed, excluded from the sweep with a
  printed exception) and the user's outer directory name. Neither is
  project-authored, shipped, or rendered.

## 7. Important files

| File | Purpose |
| --- | --- |
| `prompt.md` | the user's brief (objectives, licence rules, milestones) — read it |
| `docs/reverse-engineering/*.md` | the verified rule set; the spec for `src/modes` |
| `docs/reverse-engineering/reverse-engineering-unknowns.md` | what we do NOT know, with the method to settle each |
| `docs/game-design.md` | our game's rules: what is inherited, assumed, invented |
| `docs/architecture/{overview,interfaces,data,build,decisions}.md` | how the code is organised |
| `docs/asset-provenance.md` | every asset's origin (all in-repo/procedural) |
| `tools/re/` | the analysis harness (mGBA Lua bridge + vision classifier) |
| `scripts/{start-mgba,load-bridge}.sh` | launch mGBA with the bridge on 127.0.0.1:8777 |
| `scripts/forbidden-name-sweep.mjs` | licence gate, `npm run report`; run before any milestone claim |
