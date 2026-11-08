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
  `1ca7338` → `d15e1fd` → `10f1252` → `8a5609a` (incoming-rows lift fixes +
  `lines.test.ts`) → `f864f81` (`timings` + `levels` suites, two fixes below) →
  this commit (`session.test.ts`).
  ROM and reference screenshots are gitignored (`rom/`,
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
* Rules-layer tests running green: **143 passed / 143** in
  `src/tests/{board,pieces,random,scoring,movement,lines,timings,levels,session}.test.ts`
  + `helpers.ts` (`npx vitest run`, 513 ms; `npx tsc --noEmit` clean). `board`,
  `pieces`, `random`, `scoring` were committed in `fd83195` and `1ca7338`,
  `movement` in `10f1252`, `lines` in `8a5609a`, `timings`/`levels` in `f864f81`.
* **Six** rules bugs found by these suites and fixed, each verified by a mutation
  check (breaking the fix fails exactly those tests and nothing else) — five in
  `src/gameplay/session.ts`, one in `src/modes/goal-ladder.ts`:
  * `held.left`/`held.right` were never recorded, so `handleAutoShift` always
    bailed and DAS/ARR were dead code — holding a direction moved exactly one
    column. Now set in the `input()` switch, the only place that knows which side
    an intent belongs to.
  * `doHold()` with an empty slot moved the piece into the slot but left it in
    play, i.e. a free duplicate. Now `active = null`, with the spawn delay armed.
  * `insertRows` searched for a free offset with `collides(..., -lift - 1)`, which
    can never report "a lift of one is enough" — the usual case of a piece buried
    by incoming garbage therefore declared the run lost. Now counts up from the row
    the piece stands on (`-lift`); the new lift test fails against the old loop.
  * That same block then applied whatever offset it had found without checking it
    fits: `collides` treats cells above row 0 as free, so a piece could be "lifted"
    outside the field and play continued with it hanging there. The lift is now
    bounded by the piece's own top row and anything past that is a top-out.
  * `lockPiece` armed the clear freeze and left the commit to `step`, which only
    fires when the countdown ticks down. With `clearFreezeFrames: 0` the rows sat
    pending with no active piece and no spawn timer, so `if (!active) return`
    stopped the run forever — a config with the flash switched off was unplayable.
    `lockPiece` now commits straight away when the timer is zero.
  * The ladder mode pays the goal *before* it notices the level cap, so a winning
    clear left `intoLevel` at zero and the HUD asked for a whole fresh goal
    (`GOAL 10`) on a run the player had just finished. `left()` now reports no
    remaining lines once the ladder is won; the goal bookkeeping is untouched.
* **Mutation check of the session suite** (`src/tests/session.test.ts`, 20 tests):
  11 single-line edits to `src/gameplay/session.ts`, 10 killed by exactly the
  tests that own that behaviour (two of them by `lines`/`timings`, which is right
  — the freeze countdown and the zero-freeze commit belong to those suites), and
  one survivor recorded in § 4. The first pass found that the "never un-ends it"
  test did **not** exercise the terminal guard in `setStatusDirect`: with the guard
  deleted the whole suite stayed green, because `step()`'s top-of-frame
  `status !== 'playing'` return stops everything before the guard is ever reached.
  The two lock-driven tests now in the file are what make that guard load-bearing.

## 4. In progress

* Writing the rules-layer Vitest suite. Done: `board`, `pieces`, `random`,
  `scoring`, `movement` (column movement + DAS/ARR, rotation, projection, hard
  drop, hold, input while paused), `lines` (clear freeze, whole-row collapse,
  totals, four-row clear, perfect flag, combo counters, incoming rows, top-outs),
  `timings` (gravity period, level table incl. clamping, difficulty scaling in the
  table *and* on the session clock, soft-drop interval and payout, revert to
  natural gravity on key-up, lock on the first landed frame, custom lock delay,
  lock window restarted by a ground move, no lock window mid-fall, spawn delay,
  freeze-off commit, frame/second/HUD clock), `levels` (ASCENT: starting goal,
  countdown, level-up on the goal line, leftover carry-over, one piece climbing
  several levels, no double climb, victory at `maxLevel`, clock frozen after the
  win), `session` (the opening batch and construction order, the state a fresh run
  reports, one bag for active + queue, queue refill, queue copied / board shared,
  `advance(0)` drains, hook order `createRun → setupBoard → onLock → extendClear →
  onClear`, `extendClear` widening a clear and the `extended` count reported back,
  the live `ModeApi` a hook receives, `setLevel` + `setStatus` from a hook, a
  mode-reported verdict and its finality, the first verdict winning, a
  lock-driven verdict landing in its own frame, mode-emitted events passing
  through, `pushRow` silent vs `addGarbage` announced, HUD rows and goal passed to
  the renderer, one `advance(1)` per frame and none after the run ends, the pause
  clock, nonsense frame counts, `digest()`).
  Remaining: `modes`, `blocks`, `determinism`,
  `persistence`, `bindings`, `assets`.
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
  A mode can end a run through **two** channels — `run.status()` and
  `api.setStatus()` — and `step()` polls `status()` twice per frame (once after
  `advance`, once after gravity/lock). The *first* verdict of a frame wins, because
  `setStatusDirect` refuses to leave `won`/`lost`. That guard is only reachable
  from a **gravity**-driven lock: a hard drop locks inside `input()`, so that frame
  never reaches the bottom poll. Hence the two lock-driven session tests fall at
  `gravityTable: [1]` instead of hard-dropping.
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
  **empty**, because a piece lands on any debris and then misses the floor row —
  and a one-row clear leaves the clearing piece's own upper cells in the floor row,
  so two `completeFloor` calls in a row need `emptyBoard` between them.
* Incoming-row semantics (`insertRows`, shared by garbage and a mode's own bottom
  rows): `pushBottomRow` only counts an overflow when row 0 was already occupied
  *before* the shift, so pushing exactly `board.rows` rows onto an empty field fills
  it without losing, and `board.rows + 1` is what ends the run. Every incoming row
  keeps `holesPerRow` holes (garbage uses 1), and `randomHoles` clamps that to
  `cols - 1` so a row can never arrive solid. Because the whole stack shifts
  uniformly, a one-row-tall piece is always freed by a lift of exactly 1; a piece
  that needs more than its own top row is a top-out instead. `lines.test.ts` pins
  all of this, including that garbage after the run ended is refused outright.
* ASCENT bookkeeping (`src/modes/goal-ladder.ts`): `intoLevel` counts the lines
  since the last level-up, the goal is `goalBase × level`, and `onClear` subtracts
  the goal *before* the level-cap test, so one clear can climb several levels and
  leftovers carry into the next goal. `goal()` returns `kind: 'lines-to-level'`
  with `current` / `numeric` / `target`, which is not the shape
  `docs/architecture/interfaces.md` documents — fix that in the docs pass too.
* `docs/asset-provenance.md` lists a `pause` sfx that `SfxName` does not have, and
  `docs/architecture/interfaces.md` still shows pre-implementation signatures
  (`events()` as a property, `pushRow(cell, holes: COUNT)` argument order,
  `clearScore` shape, `ghost: number | null`, T spawning nub-down). Fix both in
  the docs pass.
* **One surviving mutant, on purpose:** `lockPiece` ends the run when `place`
  reports cells cut off above row 0 (`above > 0`), and deleting that arm changed no
  test. It is unreachable through the session's own inputs — spawn and hold both
  check `isTopOut`, and the incoming-row lift is bounded by `lift <= top` — so an
  active piece can never have a cell above row 0 at the moment it locks. `place`'s
  contract is pinned where it *is* reachable
  (`board.test.ts > placing > writes the piece colour and reports cells left above
  the field`); the session arm stays as defensive depth rather than a test that
  has to fake an impossible board.
* Then: `src/ui` (scenes + options + bindings screens), `src/render` (palette,
  procedural blocks, 5×7 font, renderer), `src/audio`, `src/app` (main, loop,
  input, layout), `vite.config.ts`, `playwright.config.ts`.
  `src/app/main.ts` (referenced by `index.html`) and both configs do **not exist
  yet**; the project does not build yet.
* Commit groups: engine+gameplay+modes → tests → render/audio/app → configs →
  e2e → README/TODO/CHANGELOG.


## 5. Outstanding tasks

1. Engine + tests: board, pieces, collision/rotation (no kicks), gravity/lock,
   line clear, seeded 7-bag, ghost, hold. **Written and tested** (gravity/lock/
   spawn/freeze timings pinned by `timings.test.ts`, the state machine and mode
   contract by `session.test.ts`); remaining test file: `determinism`.
2. Gameplay: session state machine, goal/level progression, score (opt-in),
   top-out, garbage + star special blocks, persistence (settings, bindings,
   unlocks, high scores, reset-with-confirmation). **Written**; ASCENT is covered
   by `levels.test.ts`, the other five single-player modes, DUEL and
   `persistence`/`bindings` tests are still owed, and persistence has
   never run against a browser `localStorage`.
3. Modes: 6 single-player + DUEL, each its own rules module + tests. **Written**,
   **untested** (`modes.test.ts` still owed; `linked-blocks` has no coverage yet).
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
* Working note: file bodies injected into the conversation as "Recently accessed
  file (full current content embedded)" can be **older than the file on disk** —
  the `goal-ladder.ts` copy shown on 2026-11-07 described a `goal()` shape the
  real file does not have, which sent one test design wrong. Read the file, or
  let the test run decide, before reasoning from an embedded copy.

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
