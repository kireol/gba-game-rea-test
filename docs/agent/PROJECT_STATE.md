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
  (`settings.showScore`, default `false`). See `docs/game-design.md`.
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
  `471d62d` (`session.test.ts`) → `8551a67` (`modes.test.ts` + `duel.test.ts`)
  → `a5e4088` (`blocks.test.ts`) → this commit (`determinism.test.ts`).
  ROM and reference screenshots are gitignored (`rom/`,
  `docs/reverse-engineering/screenshots/`, `docs/reverse-engineering/states/`).
* `scripts/start-mgba.sh` no longer hard-codes the reference file name (now
  `$1` / `$REFERENCE_ROM` / first `rom/*.gba`).
* Docs batch (`docs/architecture/*`, `docs/game-design.md`,
  `docs/asset-provenance.md`) — written and committed (corrected 2026-11-08: an
  earlier note here called three of them untracked; `git ls-files docs` says all
  fifteen docs are tracked). Their *contents* still need the pass listed in § 4.
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
* Rules-layer tests running green: **234 passed / 234** in
  `src/tests/{board,pieces,random,scoring,movement,lines,timings,levels,session,modes,duel,blocks,determinism,persistence}.test.ts`
  + `helpers.ts` (`npx vitest run`, 1.49 s; `npx tsc --noEmit` clean). `board`,
  `pieces`, `random`, `scoring` were committed in `fd83195` and `1ca7338`,
  `movement` in `10f1252`, `lines` in `8a5609a`, `timings`/`levels` in `f864f81`,
  `session` in `471d62d`, `modes`/`duel` in `8551a67`, `blocks` in `a5e4088`,
  `determinism` in `8b9ae7c`.
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
* **Mutation check of the mode suite** (`src/tests/modes.test.ts` 41 tests,
  `src/tests/duel.test.ts` 9 tests): 41 single edits across the six mode modules,
  the DUEL plugin and the registry (`/tmp/mutate-modes.py`, re-run over the six
  survivors once the gaps were closed) — **38 killed**, every one by a test that
  names the rule, and `src/modes` restored byte-identically afterwards
  (`restored all: True`, `git status --porcelain src/modes` empty). Two survivors
  were real gaps and are now closed: BLITZ `/8` and `/6` lines-per-level agree at
  8 and 16 lines, so the ladder table needed a third sample at 24 lines; and RUSH
  clamps the remaining quota with `Math.max(0, …)`, which only shows when one
  clear *overshoots* it — without the clamp the readout goes negative. Three
  survive on purpose and stay that way: `f9` deletes FUSION's `starTouch = 0`
  reset in `onClear`, which `extendClear` already performs on every clear; `g4`
  and `g5` delete the ENDLESS guards against advancing or pushing garbage after
  the run ended, which `step()` makes unreachable — it returns before
  `run.advance(1)` once the status is not `playing` (same reasoning as the session
  `lockPiece` arm above). Harness lesson for the next round: a mutant that leaves
  a **syntax** error never prints a `×` line — vitest fails to collect the file
  and the totals line vanishes, so the driver has to treat a nonzero exit or a
  missing total as a kill, which is what turned `f4-no-star-counted` from a
  reported survivor into a kill.
* **Mutation check of the special-block suite**
  (`src/tests/blocks.test.ts`, 8 tests; `/tmp/mutate-blocks.py`): 16 single edits
  over the rules that suite owns — FUSION's `extendClear` seed range (both
  directions: garbage allowed in, the line colour shut out), `starTouch` counting
  (never counted, garbage counted too), the `starTouch === 0` guard, the level
  step, the fresh star row, `starRow()`'s bottom-up scan, `missing()`'s
  no-star-row value and its EMPTY test, `LEVEL_GARBAGE`/`STAR_HOLES`,
  `board.floodSameColour`'s same-value test and its up/down neighbours, and the
  `GARBAGE`/`STAR` cell values themselves — **all 16 killed, and every one of them
  by `blocks.test.ts` itself** (most also by `modes.test.ts`, and the two
  `floodSameColour` edits also by `board.test.ts`). `git status --porcelain
  src/engine src/modes` empty afterwards.
* **Mutation check of the determinism suite** (`src/tests/determinism.test.ts`,
  7 tests; `/tmp/mutate-determinism3.py`): 8 replay-coupling edits inside
  `src/gameplay/session.ts` — the piece generator not seeded, the piece queue
  shared between sessions, the frame counter and the hold slot moved to module
  scope, `advance` handing back one event instead of draining the queue, the
  ghost option gating a rule instead of a read, `seconds` read from the wall
  clock, and the generator memoised across sessions — **8/8 killed, and every one
  of them caught by `determinism.test.ts` itself** (`"mutants": 8, "killed": 8,
  "by_ours": 8, "survivors": [], "setup_fails": [], "any_unclean_restore": []`,
  `git status --porcelain src/gameplay/session.ts` empty afterwards, and
  `cmp src/gameplay/session.ts /tmp/session.ts.bak` byte-identical). d3/d7 delete
  the session-local declaration (replaced by a non-empty comment) so the closure
  really resolves to module scope; `let frames = sharedFrames;` was an
  *equivalent* mutant because nothing writes the copy back.
  History that matters for reading any earlier number here: the first pass
  (`/tmp/mutate-determinism.py`) had equivalent d3/d7 *and* its restore corrupted
  `session.ts` for everything after, voiding d4–d8. The second pass
  (`/tmp/mutate-determinism2.py`) then ran with d7's replacement text empty, which
  aborted that edit and left mutant markers in the file — so its "all 8 killed,
  each one by determinism.test.ts" was **not** evidence for d7 or d8; the file was
  restored by hand (`git checkout --`), which is why the tree looked clean. Only
  this third pass re-ran all 8 validly. Three harness rules come out of those two
  accidents: express a deletion as a replacement with valid non-empty text;
  **restore by copying the pristine backup and byte-verify afterwards**, never by
  reversing the replacement (`replace("", old, 1)` inserts at byte 0); and no
  foreground test may run while a mutation driver is live.
* **Mutation check of the persistence suite** (`src/tests/persistence.test.ts`,
  26 tests; `/tmp/mutate-persistence.py`): 23 edits to `src/gameplay/persistence.ts`
  — corrupt payload discarded, a newer save trusted, every mode always open, stored
  unlocks ignored, the table uncapped (once per site: loaded and recorded), ordered
  worst-first, newest run always wins the best, a tie counts as a record, reset also
  wipes settings, queued writes never coalesce, `flush` does not write, a failed write
  still reports persisted, a quota failure escapes to the caller, the no-storage
  fallback throws, `corrupt` never reported, counters/volume/`nextCount` unclamped, a
  score entry needs no mode, bindings taken as-is, page hide does not flush, wrong
  version stamp — **23/23 killed, 23/23 by `persistence.test.ts` itself**
  (`"killed_but_not_by_ours": []`, `"survivors": []`, `"setup_fails": []`,
  `"any_unclean_restore": []`, `git_status_src_gameplay` empty). Attribution needed
  the harness fixed first: the per-file `FAIL src/tests/…` lines are **indented** by
  vitest, so an anchored `^FAIL` regex matched nothing and a green campaign proved
  nothing about *which* file caught a mutant. Lesson: record the attribution per
  mutant, and treat the "did our file catch it" boolean as part of the evidence.
* **Presentation + app layer written, and the whole project now builds and plays in
  a real browser.** Files: `src/render/{palette,font5x7,blocks,frame,renderer}.ts`,
  `src/audio/engine.ts`, `src/ui/{format,options,widgets,scenes}.ts`,
  `src/app/{layout,loop,input,main}.ts`, `vite.config.ts`, `playwright.config.ts`,
  `index.html` (mounts `#screen` at 240×160 with a `#boot-error` fallback).
  Verified 2026-11-08: `npm run build` → **BUILD_EXIT=0**, 35 modules,
  `dist/assets/index-*.js` 68.49 kB (gzip 24.62 kB); `npx vitest run` →
  **248 passed / 248** across 15 files; `npm run test:e2e` → **7 passed (24.0 s)**;
  `npm run report` → **PASS**, 89 files scanned (3 registered exceptions, all of
  them today's hits coming from one line of the browser suite; § 6).
  The rules layer still imports no DOM/Canvas/WebAudio — the separation the brief
  demands holds with the UI on top of it.
* `src/tests/layout.test.ts` (14 tests, `// @vitest-environment jsdom`) pins
  `computeScale` / `cssSize` / `createLayout`: largest whole factor fitting both
  axes; flooring instead of rounding up (1199×1600 → 4, because 1199/240 = 4.996
  and rounding would stretch the board; 1440×160 → 1 because the height binds);
  never below 1; a broken measurement → 1; custom frame sizes; the canvas CSS box
  written on creation; `onChange` fired once per real change and not on a no-op
  refresh; a `window resize` re-scaling with `dispose()` detaching the listeners;
  `toFramebuffer` mapping through the CSS box including the half-open far edge and
  a zero-size box → `null`; fullscreen staying usable windowed when jsdom implements
  neither `requestFullscreen` nor its webkit alias.
  Its first run **failed one assertion**: I expected `computeScale(1440, 160)` to be
  6; it is 1 — `min(1440/240, 160/160) = 1`, the height constrains it. The code was
  right and the expectation was wrong, so the test was fixed, not the code.
* `tests/e2e/playable.spec.ts` (7 tests, real Chromium) proves the brief's browser
  requirements rather than the rules: boots on the title screen painting a
  multi-colour 240×160 backing store with zero console/page errors and `#boot-error`
  removed; integer scaling with a correct aspect across four viewports (960×640,
  500×400, 1600×1200, 420×900), asserting `scale` integral and the CSS box exactly
  `240·scale × 160·scale`; keyboard play title → modes → rules → play with
  `status: 'playing'`, `modeId: 'goal-ladder'`, no pieces during the countdown, a
  piece that falls and locks, hard drop raising `pieces`, pause and unpause;
  mouse-only play (no keyboard at all) reaching a live run; wheel and right-click
  turning the piece while `window.scrollY` stays 0; player-facing text free of
  reference branding; a hidden tab pausing a live run. Per-test times: 284 ms boot,
  317 ms scaling, 640 ms mouse, 481 ms branding, 4.5 s wheel/right-click, 4.3 s
  hidden tab, 20.4 s keyboard play (that one waits on real-time gravity).
  The suite reads the live scene machine through `?test=1`, which is the only thing
  that publishes `window.__orbit` (`scenes`, `store`, `layout`, `loop`, `renderer`,
  `audio`, `input`, `get status`); assertions ride the frame model, not screenshots,
  so a palette tweak cannot make them flaky while an unpainted playfield still fails.
* **The e2e suite caught two of its own bugs, and neither was guessed at.**
  (1) "flat canvas" failed at `expected > 1, received 1`: `go('title')` finishes
  inside `createScenes`, but the first paint happens on the next
  `requestAnimationFrame`, and an untouched backing store is one flat colour — the
  assertion now polls. (2) The mouse test expected title→modes→rules from two
  clicks and received `play`: a press activates the row *under the pointer*, and
  pointer entry already moved the cursor, so a single click can enter a mode that
  starts immediately; the test now accepts `/^(rules|play)$/` and clicks through
  whichever it landed on. Both were test bugs — `renderer.ts`, `palette.ts` and the
  pointer/geometry path were read first to rule out a product bug, then a throwaway
  probe measured the truth instead of my reasoning about it.
* Two facts that invalidate earlier notes in this file: the player-facing mode
  labels are **ASCENT / FUSION / RUSH / DASH / BLITZ / ENDLESS / DUEL**
  (`goal-ladder` is only the internal id, visible via `debug().modeId`), and the
  title screen has **three** rows — PLAY, HIGH SCORES, OPTIONS. Rows 1–5 carry a
  `LOCKED` label on a first launch, DUEL does not.
* `npm run report` initially **FAILED with 3 blocking hits**, all on the new e2e
  file: the branding regression test has to name the strings it forbids. Resolved
  through the sweep's own `ACKNOWLEDGED` mechanism (precedent: `start-mgba.sh`,
  `rom-overview.md`), reason printed on every run. The gate was then self-checked
  rather than trusted: planted a probe string carrying the reference title, the
  mark's name and the reference platform's name in `src/tmp-gate-probe.ts`
  → `PLANTED_EXIT=1`, naming the probe 3 times; deleted → `CLEAN_EXIT=0`, no mention
  of it. The gate still bites. Limitation to close later: `ACKNOWLEDGED` is keyed by
  path, so it exempts that whole file from every rule — narrowing it to per-rule
  exceptions (or feeding the browser test the scanner's own table) is a real task.
* Git: nothing was committed while the presentation layer was being written; the
  last commit before this save is `35f4be1` ("test: pin the save layer against
  hostile payloads and a hostile browser").

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
  clock, nonsense frame counts, `digest()`),
  `modes` (the registry table: ids, `SINGLE_MODES` excluding the versus entry, the
  rules-screen print order, which modes own a `TIME UP` label, the family strings
  and `showLines` as one table; then per mode only what that mode can produce —
  ASCENT's `goalBase`, FUSION's star row and its three-garbage opening row and the
  level-up-on-star-clear rule, RUSH's quota-then-clock and the clamped readout,
  DASH's fixed 40, BLITZ's 120 s and its never-wins rule, ENDLESS's garbage ramp
  `12 → 3 s` and the `NEXT` countdown, and the level ladder each line-driven mode
  promises with its own `LINES_PER_LEVEL`), and `duel` (the attack table
  `attackFor`, one shared bag for both sides, the three HUD rows, a two-line clear
  sending one row and a perfect clear two, the receiver's `garbage` surfacing on
  the *next* drain because the wrapper routes attacks after both cores advanced,
  no win from clearing, the winner read only from a top-out, and pause never
  reviving a lost side), and `blocks` (the two special kinds hold cell values
  outside the seven piece colours and never come out of a piece over a six-piece
  run; a star block is solid, so a piece rests on the row instead of sinking into
  it; an incoming row clears as an ordinary line at the ordinary price, checked
  against `clearScore` and against the same field filled with piece blocks; neither
  kind joins a clear that touches it — a standing line is pulled whole by its own
  colour while the incoming row beside it stays put; a row of star blocks raises
  the level and replaces itself whether the mode pushed it in or the player built
  it; star blocks do not chain with each other either; and the star-row countdown
  reads the *lowest* star row, following it when an incoming row lifts the stack),
  and `determinism` (one seed replays frame for frame across two independently
  built sessions, however the caller splits its frames across `advance` calls and
  however often it reads the view in between, at two seeds where neither seed
  replays as the other, whatever presentation options are on, even after other
  runs — two more modes, a third copy of the same seed at a different seed, and
  both sides of a `createDuel` — were built and driven in between, and finishing
  on the same frame with the same board every time),
  and `persistence` (26 tests over `src/gameplay/persistence.ts`: a fresh record's
  defaults and the fact that only the first mode is open; the payload round-trips and
  carries `SAVE_VERSION`; a truncated payload, four scalar payloads, and a save from a
  newer build are all refused *and kept aside* under `CORRUPT_KEY`, never leaking into
  the record; a junk-shaped payload repairs to the documented defaults — `nextCount: 5`
  and `showScore: false` are our own choices, not the reference's — while a legitimate
  partial override survives, a stored binding survives, an unknown intent adds nothing,
  and the one surviving high-score row keeps all five of its fields; array / empty-array
  / empty-object payloads are *not* corrupt and still play; the table orders by score
  then lines, caps at `HIGH_SCORE_LIMIT` both when loading and when recording, and the
  cap holds as runs pile up across modes; `recordRun` counts a loss, only awards a clear
  on a win, and a loser never opens the next mode while a winner does; the best, the
  8-digit hex `lastSeed` and the table row all land in one call, a lower standing record
  survives, `isBest` is strict (a tie is not a record); unlocks are derived from clears
  rather than stored flags, and a once-opened mode stays open; `clearedProgress` keeps
  every user choice and re-locks the ladder, and the store variant writes it at the
  injected clock in exactly two writes with a reload proving it hit storage; the store
  coalesces updates inside `SAVE_DEBOUNCE_MS` into one write; `flush()` writes and
  cancels the queued timer; a reopen reads back settings, assist, bindings, counters and
  the table; a failing `setItem` reports `persisted: false` once and the in-memory copy
  keeps working; with no storage at all the store is in-memory and silent; when the
  browser exposes `localStorage` the default store finds it (and a `localStorage` that
  throws on access still loads, with defaults and no corrupt flag); `pagehide` and
  `visibilitychange` are both registered and both flush).
  Remaining: `bindings`, `assets`.
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
  Facts the special-block suite added, same reason: in FUSION a locked piece's
  cells are always connected and one colour, so the flood seeded from the cell that
  sits in the cleared row pulls the **whole contributing piece** — including the
  cells above that row. A FUSION fixture therefore can never leave "leftover" piece
  cells, and a one-line clear there empties the field, which pays the perfect-clear
  price (level 1: 1100 = 100 + `PERFECT_CLEAR_BONUS` 1000). `LINE_SCORES` is
  module-private, so `clearScore(1, 1, perfect, 0).points` is the anchor for a
  single line; the `lines` event's amount field is **`score`** (what that clear
  paid, not the running total) and no event carries `extended` — that is only the
  mode hook's fourth argument. The line piece's upright rotation occupies column
  **`x + 3`**, not `x + 1`, so aim it with an offset derived from `cellsOf` instead
  of a literal. `receiveGarbage(rows)` is the public entry for an incoming row
  (`addGarbage` / `pushRow` exist only on `ModeApi`); each row arrives with one hole
  and drains on `advance(0)`.
* Facts the determinism suite added: `createRng(opts.seed)` is the **one** stream a
  run has — it feeds the 7-bag *and* `randomHoles()` *and* reaches `ModeApi.rng` —
  so anything that consumes a draw (a mode's opening garbage, a longer
  `queueLength`, garbage arriving mid-run) offsets every later piece. That is the
  mechanism behind the FUSION opening-order rule, and why `queueLength` is a
  **rules-visible** option: a deeper initial fill deals different pieces. `ghost`
  is the only purely cosmetic option, which is exactly why it gets its own mutant.
  `snapshot()` hands out the **live** `board` and `active` (the contract is
  "must not mutate", not a frozen handle), so a fingerprint has to copy their
  contents out — `active` as `id@rot x,y` and the board as its cell bytes joined.
  `digest()` is the documented replay fingerprint (`frames, level, lines, score,
  pieces, status, queue, holdId, board`), and `GoalInfo` has
  `kind / label / current / numeric / target` where `current` is a **string** —
  there is no `text` field. `makeSession`'s first argument is a `ModePlugin`, not a
  config. A scripted run that hard-drops tops out around frame **350**, so a
  long replay window has to level the field out periodically (the suite resets every
  100 frames) or the tail compares two dead sessions; `completeFloor` is then the
  guaranteed-clear epilogue that keeps the commit path inside every window. A
  replay handle (`Session.fork()`, or exposing the session's randomizer) is
  deliberately **not** implemented: seed-equal twins plus `digest()` already cover
  "deterministic seeds", and an API the app does not need would only be a mutation
  target.
* Verified frame numbers in our implementation: level-1 gravity moves on frame
  **50**; soft drop on **1, 5, 9**; DAS repeats at **16, 22, 28** after the
  immediate key-down move, so a tap is exactly one column; the piece locks on the
  first landed frame (`lockDelayFrames: 0`); `lines` lands on frame
  **`clearFreezeFrames` (30)**; `completeFloor(s, rows)` needs the field otherwise
  **empty**, because a piece lands on any debris and then misses the floor row —
  and a one-row clear leaves the clearing piece's own upper cells in the floor row,
  so two `completeFloor` calls in a row need `emptyBoard` between them.
  A `completeFloor(s, rows)` with `rows > 1` is a harder request than it looks:
  the helper walls the piece in with filled rows, so the drop only reaches the
  floor when **every** column the piece occupies covers all `rows` of them — the
  square and the standing line are the only shapes that qualify for two. The mode
  suite therefore calls `awaitBandPiece(s, rows)` first, which rotates and (since
  no rotation of an S can become a square) redraws until such a piece shows up;
  the redraws cost no lines because the field is wiped before each drop.
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
* **Presentation layer: written and browser-verified, but almost entirely
  un-unit-tested.** Nothing in `src/app`, `src/ui`, `src/render`, `src/audio` has a
  Vitest file except `src/tests/layout.test.ts`. The e2e suite exercises them
  together, which is not the same as pinning them. Next, in this order:
  1. `src/app/loop.ts` — fixed-step accumulator, `maxCatchUp` dropping work instead
     of spiralling, injected clock + injected scheduler (no `requestAnimationFrame`
     in the test).
  2. `src/app/input.ts` — `SWALLOWED` key set, `event.repeat` dropped, P1/P2
     dispatch, right/middle button and wheel mapping with its deadzone, blur and
     visibility handling, `preventDefault` not eating the page.
  3. `src/ui/scenes.ts` navigation through a stub `SceneHost` — the biggest
     untested surface and the one the brief cares about: title's 3 rows →
     modes/scores/options, a locked mode refusing with `rotate-fail` + `LOCKED`
     banner instead of navigating, `startRun` seeding from `lastSeed` vs
     `randomSeed`, countdown withholding frames, options cycling feeding
     `configFor`, the bindings capture/rebind/unbind flow, reset-progress needing
     confirmation, the duel pause list.
  4. `src/ui/widgets.ts` (`rowUnderPoint`, `menuRects`, `addField`),
     `src/ui/options.ts`, `src/ui/format.ts` (`mmss`, score padding).
  5. `src/engine/bindings.ts` (`normalizeBindings`, `rebind`, `unbind`,
     `conflictsIn`, `intentForCode`, P2 variants) — still owed from § 5 item 2.
  6. `src/gameplay/assets.ts` — **does not exist yet**; the brief's asset-safety
     requirement has no module of its own.
  7. Then a mutation campaign over the new layer, same discipline as § 3 (per-mutant
     attribution, restore-by-copy with a byte compare, no foreground test while the
     driver runs).
* Facts a resuming session needs about the pointer model, since the e2e tests now
  depend on it: `scenes.pointer(x, y, action)` with `'hover'` moving the menu cursor
  (playing `sfx('menu-move')`) and `'press'` calling `activate(rowUnderPoint(...))` —
  **a press activates the row under the pointer, not the row the cursor was on when
  the pointer arrived**. Geometries: modes `listGeom(count, 26, 13, 8, PANEL.w)`,
  rules `listGeom(count, 120, 14, 8, 110)` plus a seed-nudge rect
  `{x:150,y:120,w:74,h:22}` → `nudgeSeed(x < 168 ? -1 : 1)`, confirm
  `listGeom(count, 90, 14, 40, SCREEN.w-80)`, results `listGeom(count, 122, 15, 62, 116)`,
  everything else `listGeom(count, 62, 16, 62, 116)`; the options slider band is
  `barX = geom.x + geom.w - 74` with ratio `(x-barX)/42`, and left/right of the row
  centre steps the value.
* `Scenes.debug(): SceneDebug { scene, status: GameStatus | null, seed, countdown,
  modeId, lines, score, level, pieces }` — `status` is the live session status and is
  **null outside play/duel**. Verified.
* **Docs correction pass finished 2026-11-08** over `docs/architecture/` (all five
  files), `docs/asset-provenance.md` and `docs/game-design.md`. The inherited claims
  it disproved, with what the sources actually say:
  * `src/render/font5x7.ts` has **63 keys**; every glyph is exactly 7 rows of 5
    characters using only `#` and `.`; of the 95 printable ASCII characters the six
    with **no glyph at all** are `` `" $ [ ] ` ~` ``, and the space is the only key
    whose glyph carries no ink. Notes here previously said 61 keys and a different
    character set; `node` evaluation over the `G` table settles it.
  * A production `dist/` is `index.html` + one JS bundle + its map. **There is no CSS
    file** — the stylesheet is inline in `index.html` (`grep -c '<style>' index.html`
    → 1) — so "one HTML, one JS and one CSS file" was wrong, including in the fresh
    `README.md`.
  * `src/audio/engine.ts` is exercised by **no test at all**, Node or browser
    (`grep -n audio tests/e2e/playable.spec.ts` → nothing). `build.md` claimed the
    browser suite covered it.
  * `build.md` also claimed unit tests cover `src/render` and `src/ui`; only
    `src/render/blocks.ts` (8 tests) is unit-tested and `src/ui` has none.
  * `layout.test.ts` has **14** tests, not 13. `SfxName` has 17 entries, no `pause`.
  * The RE harness lives in `tools/re/*.py` + `scripts/{start-mgba,load-bridge}.sh`;
    there is no `scripts/mgba-lib.mjs` or `scripts/probe.mjs`.
* Commit groups: engine+gameplay+modes → tests → render/audio/app/ui + configs +
  index.html + e2e + layout tests → **README/TODO/CHANGELOG + docs pass (this one)**.


## 5. Outstanding tasks

1. Engine + tests: board, pieces, collision/rotation (no kicks), gravity/lock,
   line clear, seeded 7-bag, ghost, hold. **Written and tested** (gravity/lock/
   spawn/freeze timings pinned by `timings.test.ts`, the state machine and mode
   contract by `session.test.ts`). Remaining rules-layer test file: `bindings`.
2. Gameplay: session state machine, goal/level progression, score (opt-in),
   top-out, garbage + star special blocks, persistence (settings, bindings,
   unlocks, high scores, reset-with-confirmation). **Written and tested**; the
   session core is pinned by `session.test.ts`, all six single-player modes by
   `modes.test.ts` (including `linked-blocks`, i.e. FUSION), the versus wrapper by
   `duel.test.ts`, and the save layer by `persistence.test.ts` (26 tests, mutation
   check in § 3). Persistence runs against a `KeyValue` double and a shimmed
   `globalThis.localStorage`, including one that throws on access; the real
   browser-storage path still only lands with the Playwright pass (item 6).
   Still owed: `bindings` tests.
3. Modes: 6 single-player + DUEL, each its own rules module + tests. **Written
   and tested**; the module contract and every mode-specific rule are pinned, and
   the suite was mutation-checked as described in § 3.
4. UI: scene/menus state machine with mouse hit-testing, options, bindings
   editor, rules screens, results, pause. **Written, and driven end to end by the
   browser suite; no unit tests of its own yet** — see § 4 items 3–4.
5. Render (own 5×7 pixel font, procedural art), audio (WebAudio synth, original
   material), fullscreen + responsive scaling with correct aspect. **Written and
   browser-verified for scaling** (`layout.test.ts` 14 tests + the e2e viewport
   test). `toggleFullscreen` is only proven not to throw where the API is missing;
   a real fullscreen transition is untested. Font/art/audio have no tests.
6. Vitest suite covering every mechanic the brief lists; Playwright browser
   tests. **Rules layer: 248 tests across 15 files, all green. Browser: 7 Playwright
   tests green** on "Chrome Headless Shell 158.0.8127.18" (already installed, no
   `playwright install` needed). Still open inside this item: the presentation-layer
   unit tests in § 4, `bindings` tests, `src/gameplay/assets.ts`, and a Playwright
   assertion for the real `localStorage` round-trip (the persistence suite covers
   that with a double only, so item 2's browser-storage caveat still stands).
7. Verify `npm run typecheck`, `npm run test`, `npm run build`,
   `npm run test:e2e`, `npm run report` and report results verbatim. **All five run
   green on 2026-11-08** (re-run after the docs pass, `/tmp/f_*.txt`): build/typecheck
   `BUILD_EXIT=0` (35 modules); vitest `248 passed (248)` in 15 files, 3.40 s;
   Playwright `7 passed (23.6s)`; sweep `PASS — no blocking hits`, 89 files,
   3 acknowledged. Re-run all five after any change — `build` runs `typecheck` first,
   and `test:e2e`'s webServer runs `build`, so one type error anywhere under `src/`
   or `tests/` breaks the browser suite too.
8. `README.md`, `TODO.md`, `CHANGELOG.md`, milestone report (§ 14 of the brief:
   completed / reverse-engineered / remaining / discrepancies / test results / next
   steps). **Written 2026-11-08**: repo-root `README.md`, `TODO.md`, `CHANGELOG.md`
   and `docs/agent/MILESTONE-2026-11-08.md`. They are authored so they cannot trip
   the licence gate themselves — the repo directory's name never appears in them, and
   the sweep passed over them (89 files).
9. Docs pass over `docs/architecture/` and `docs/asset-provenance.md` (details in
   § 4). **Done in the same group as item 8**, together with `docs/game-design.md`
   § 3/§ 5 (its "12 actions" row, its fictional mouse mapping and its stale
   `assist.showScore` key are gone).

## 6. Known issues & blockers

* **Corrected 2026-11-08: code-level RE is available.** An earlier entry here
  claimed no disassembler or decompiler was installed; that was wrong — the check
  only covered `PATH` and `/Applications`, and it never ran Ghidra's support script.
  Verified inventory on this machine: **radare2 6.2.6** (`+0 abi:174 @ darwin-arm_64`)
  with `r2` and `rabin2` in `/opt/homebrew/bin`; **rizin** at `/opt/homebrew/bin/rizin`
  (no `rz` shim); **Ghidra 12.2** — `ghidraRun` on `PATH`, and
  `/opt/homebrew/Cellar/ghidra/12.2/libexec/support/analyzeHeadless`, which *runs* and
  prints its usage banner, resolving its own JDK (openjdk 25.0.5) even though plain
  `java -version` says "Unable to locate a Java Runtime"; `openjdk@21` (21.0.13) and
  `openjdk@25` are both installed under `/opt/homebrew/opt`; **Hopper 6.6.1-demo** at
  `~/Applications/Hopper Disassembler.app`, whose `Contents/MacOS/` holds `hopper`
  (CLI), the GUI binary, and `HopperMCPServer` — deliberately not launched here, since
  it opens a window. `/usr/bin/objdump` handles aarch64/x86 only, so it is not an ARM
  tool. Reading the reference ROM with `rabin2 -I`: `arch arm`, `bits 32`,
  `endian little`, `machine` reports the reference handheld platform,
  `binsz 4194304`, `havecode true`, `stripped false`, **`laddr 0x0`** — a
  flat-load raw ROM, so the `0x08000000` mirror
  base has to be set by hand before any branch target or data reference makes sense
  (that is very likely why an earlier `aa` pass found no functions: Thumb code executed
  from `0x08000000` was analysed at file offsets).
  Next RE step, in order: a Ghidra headless import with the base set to `0x08000000`
  plus full auto-analysis (background — it takes minutes on 4 MiB), then radare2 with
  `org 0x08000000` + `afca`/`aan` for a quicker cross-check, and `gearboy` breakpoints
  to confirm whatever the disassembly claims. Everything already shipped stays based on
  runtime + pixel evidence; a code-level finding has to *confirm* one of the unknowns in
  `reverse-engineering-unknowns.md` before any rule changes.
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
* **Toolchain traps that cost time, so nothing re-learns them:**
  * `npm run test:e2e` fails as `Error: Process from config.webServer was not able
    to start. Exit code: 2` when *anything* under `src/` or `tests/` fails to
    typecheck — the webServer command is `npm run build`, which is
    `npm run typecheck && vite build`, and `tsconfig.include` covers `src`, `tests`
    and the three config files, **unit tests included**. Diagnose with a direct
    `npm run build`, never by reading the Playwright error.
  * No `@types/node` on purpose (it would retype the global timers the browser code
    uses), so any `process` reference in a typechecked config file is TS2591.
    `playwright.config.ts` uses Playwright's own CI detection instead.
  * The `as const` trap: `FRAME = { w, h } as const` leaks the literal `240`/`160`
    into an *inferred default-parameter* type, so a caller passing general numbers
    gets TS2345/TS2322. Declare an explicit general `type Rect` and a
    `const FULL: Rect` (this is what `layout.test.ts` does).
  * `vitest.config.ts` has `environment: 'node'` and `globals: false`, so every
    test file needs `import { describe, expect, it } from 'vitest';` and a DOM file
    needs a `// @vitest-environment jsdom` docblock. jsdom 26 is installed.
  * An untouched canvas backing store is **one flat colour**, and the first paint
    lands on the next `requestAnimationFrame`. Any "did it render" assertion must
    poll.
  * Never pipe a check through `head` — it hides the exit code. Use
    `cmd > /tmp/x.txt 2>&1; echo "EXIT=$?"` and read the echoed line.
  * A scratch script that imports `@playwright/test` must live **inside the project
    tree** or module resolution fails with `ERR_MODULE_NOT_FOUND`.
  * mGBA/Ghidra/Gearboy: `gearboy` and `mgba` MCP servers are configured; the
    reference ROM path must never appear in project-authored text (`.gba` outside
    the two acknowledged paths is a sweep hit).

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
| `scripts/forbidden-name-sweep.mjs` | licence gate, `npm run report`; run before any milestone claim. `ACKNOWLEDGED` is keyed by path — check the printed exceptions every run |
| `src/ui/scenes.ts` | every screen, the menu cursor, `pointer()`, `activate()`, and `debug()` — the largest file and the least tested |
| `src/app/main.ts` | composition root; publishes `window.__orbit` only when the URL has `?test=1` |
| `src/app/layout.ts` | the only place window size touches the game; `computeScale`, `toFramebuffer` |
| `src/render/frame.ts` | the frame model the renderer draws and the e2e tests assert against |
| `tests/e2e/playable.spec.ts` | the 7 browser tests; reads the app through `?test=1`, never screenshots |
| `src/tests/layout.test.ts` | jsdom docblock example + the only presentation-layer unit tests |
| `vite.config.ts` / `playwright.config.ts` | build (240×160 canvas app) / `webServer: npm run build` — hence the typecheck coupling |
