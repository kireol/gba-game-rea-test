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

**Phase now:** the game is playable and documented (milestone report
`docs/agent/MILESTONE-2026-11-08.md`, committed `fb3ffdf`), and ships as two
artifacts — the served `dist/` and the double-clickable `dist/orbit-drop.html`; the
open work is *coverage of the presentation layer*, in the order `TODO.md` § 1 sets
out — `layout.ts`, `loop.ts`, `bindings.ts`, `render/blocks.ts`, `input.ts`, and
`render/renderer.ts` + `font5x7.ts` with the glyph-table check (`TODO.md` § 2) are
**done**, and the scene machine is **done** too (§ 1 item 4: `scenes-harness.ts` +
`scenes-menus.test.ts` 18 tests + `scenes-options.test.ts` 26 +
`scenes-run.test.ts` 30, added 2026-11-08) — so the next file is `audio.ts`
(§ 1 item 6; `src/tests/audio-harness.ts` is already in the tree, untracked and
unused, see § 4), plus the second music loop (`TODO.md` § 3, the only brief
requirement known to be unmet). The most recent change is not coverage: `↑` now
turns the piece clockwise inside a live run (§ 2, § 3).

**Docs/publication step (2026-11-09):** the root `README.md` is now the part-3
experiment write-up and the game's manual moved to `GAME_README.md` (§ 3). The
repository is being published to its own remote as the third test in a series; no
game code changed, and the four gates were re-run green afterwards. Remaining
product work is unchanged from the paragraph above.

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
* **Two artifacts from one command** (`docs/architecture/decisions.md` D11): `dist/`
  is the served static site, `dist/orbit-drop.html` is the double-clickable single
  file, also loaded over `file://` by the browser suite. Nothing in either needs
  Node at run time; Node is build-time only.
* **A key's role is chosen by the screen, not by the binding table.** `remap()` in
  `src/ui/scenes.ts` reads Enter as CONFIRM outside a run and PAUSE inside one, Escape
  as BACK outside and PAUSE inside, and — added 2026-11-08 — `↑` as the list cursor's
  step-up outside a run and ROTATE CW inside a live one (`menuActive()` hands it back
  to the pause list). Deliberate, and cheaper than the alternative: putting `ArrowUp`
  in `rotate-cw`'s code list would have made `KeyX` move the menu cursor too, because
  `input.ts` dispatches the *bound* intent, and `X` resolves to `rotate-cw` for menus
  as well. Keeping the binding untouched means the key-bindings screen, the conflict
  list, player two's map and the versus footer need no edits, and both rows stay
  rebindable — at the cost of a behaviour the in-game binding screen does not advertise.
  Counter-clockwise has no cursor key because `↓` already owns the soft drop; player
  two keeps `W`, whose `up` intent is unreachable in its own map.

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
* **Presentation-layer unit files so far** (`TODO.md` § 1):
  `src/tests/layout.test.ts` (14 tests), `src/tests/loop.test.ts` (16),
  `src/tests/bindings.test.ts` (18), `src/tests/blocks.test.ts` (8) and
  `src/tests/input.test.ts` (24, added 2026-11-08 — the first of them that needs a
  DOM, and gets it from jsdom rather than a browser).
  Verified 2026-11-08, after all of them landed: `npm test` → **306 passed / 306**
  across **18 files**; `npm run build` → **BUILD_EXIT=0** (35 modules, 68.49 kB
  gzip 24.62 kB — the unit tests are not in the bundle); `npm run test:e2e` →
  **7 passed (23.4 s)**; `npm run report` → **PASS — no blocking hits**,
  **92 files** scanned, 3 acknowledged. The sweep scans Markdown too, so a doc
  edit needs the gate re-run like any other change.
  * `loop.test.ts` owns both halves of the clock (an injected `now` plus a hand-pumped
    scheduler), so nothing waits and no DOM is needed. It pins: no debt for time that
    passed before the first frame; whole steps handed on with the remainder banked;
    nothing delivered below one step; catch-up capped at `MAX_CATCHUP` and the leftover
    backlog **dropped, not deferred**; `maxCatchUp: 0` floored to 1; the injected clock
    preferred over the rAF stamp; a backwards clock jump re-basing instead of going
    negative; `reset()` dropping debt; `stop()` unscheduling the **live** handle
    (a frame re-schedules itself at entry, so the handle to cancel is the one the
    last frame created, not the one `start()` made) and being idempotent; `steps` /
    `ticks` counting for the loop's whole life across a restart.
  * It also pins the float reality of the real step: `STEP_MS` is 1000/60 rounded
    **up**, so a subtractive accumulator delivers 2 frames for `STEP_MS * 3` of
    elapsed time and catches the third frame a millisecond later. The structural
    tests therefore run at an exactly representable 10 ms step; only the 60 Hz group
    uses the real constant, and it asserts intervals rather than exact counts.
  * `bindings.test.ts` pins the 14 bindable intents and the runtime key set of all
    three tables; first-claim resolution (`Enter` → PAUSE, `ArrowDown` → SOFT DROP);
    `conflictsIn`'s exact output **including its order**, which follows a code's
    first sighting, not the moment it collided; `normalizeBindings` dropping
    non-array rows, empty rows, duplicates and junk entries while keeping a
    partially valid save; `rebind` stealing a code from every other intent and
    clamping the slot; `unbind` keeping aliases. All three tables are proven
    un-mutated, and every returned row is proven to be a fresh array.
  * Three of my first-run assertions were wrong about the code, not the code wrong:
    P2's conflict order (`['KeyA','KeyD','KeyS','KeyW']`, first-sighting order), a
    code repeated *within one row* (it IS reported, against itself — unreachable via
    the UI since both loaders de-duplicate), and `decrement` keeping `ArrowLeft` when
    `KeyZ` is stolen. Fixed in the tests; § 6 records the resulting known issues.
  * Vitest does not typecheck — and it bit twice. `npm run build` rejected two
    things the green tests allowed: `readonly string[]` rows cannot be `push`ed
    (assert reference-inequality instead), and `exactOptionalPropertyTypes` forbids
    passing `maxCatchUp: undefined` explicitly (spread it in only when set). The
    scene suite hit it a third time: a value import used only as a *type*
    (`import { Harness }`) is flagged unused and as TS1484 under
    `verbatimModuleSyntax`, so type-only imports must be spelled `type`. A green
    `npm test` is not a green build; always follow it with `npm run build`.
  * `input.test.ts` is the first unit file that tests the *browser contract*: every
    helper returns `event.defaultPrevented`, so each intent is pinned next to the
    prevention that belongs to it. It covers the bound-key dispatch, the bindings
    being re-read on every event (a rebind lands on the next press), `SWALLOWED`
    eating unbound `Space`/`NumpadEnter` while `Tab` and `` ` `` stay live for the
    shell, `event.repeat` never forwarded but still swallowed, `Ctrl`/`Cmd` chords
    returning before `raw()` is even consulted, `Alt+Enter`/`F11` → fullscreen while
    `Alt`+arrow still plays, a screen capturing a code before the bindings (both
    directions, including the release when the capture ends mid-hold), `Escape` +
    `Backspace` pressing BACK once, the wheel's press+release pair and its deadzone,
    hover once per framebuffer point and never during a drag, blur / hidden tab →
    `onFocusLost`, and `dispose()` detaching all nine listeners.
  * Four jsdom facts, one debugging pass each, worth reusing: `preventDefault` is a
    **no-op on a non-cancelable event**, so a constructed `KeyboardEvent` needs
    `cancelable: true` or every prevention assertion is silently false;
    `dispatchEvent` dispatches on the event's internal type, so overriding `type`
    with `defineProperty` does **not** retarget listeners — construct with the right
    type; jsdom's `PointerEvent` is not relied on (the handlers read only
    `clientX/clientY/buttons/button`, so a `MouseEvent` dispatched under a `pointer*`
    type name is enough); `document.visibilityState` is overridden with a
    configurable getter and restored by deleting the own property. Every listener is
    detached in `afterEach`, because a leaked window listener lets one test answer
    another's events.
  * Three of its first-run expectations were mine, not the code's, and all three
    were one trap: I read `Enter` as CONFIRM. `intentForCode` walks
    `BINDABLE_INTENTS` in declaration order, `pause` is claimed before `confirm`,
    so with the shipped table `Enter` is PAUSE and `KeyZ` is ROTATE CCW — both of
    `confirm`'s codes are shadowed. § 6 records what that costs in versus;
    `TODO.md` § 1 item 4 (`scenes-*.test.ts`) must drive menus with the cursor, not
    with `Enter`.
* `scenes-menus.test.ts` (18), `scenes-options.test.ts` (26) and
    `scenes-run.test.ts` (27) close `TODO.md` § 1 item 4 through one shared
    `src/tests/scenes-harness.ts`. **The seam is `SceneHost`** — the scene machine's
    only door out (`sfx` / `status` / `commit` / `announce` / `persisted` / `now`),
    so a recording stub makes every screen and every persistence write assertable
    with no DOM, no clock and no storage; `setPersisted()` re-seeds what the next
    `loadBindings`/`loadPrefs` reads, `setClock()` makes a debounced save's commit
    observable, `clearLog()` separates one interaction's sounds from the previous
    screen's. Navigation helpers (`openModeList`, `openRules`, `startMode`,
    `modeIndex`, `unlockAll`) keep the three files readable.
  * Countdown facts pinned in three places at once: `COUNT_FRAMES` 45 ×
    `COUNT_STEPS` ['3','2','1','GO'] = 180 withheld frames — the session is live and
    `debug().status` says `playing` while `pieces` stays 0 — and `advance` emits one
    sound **per label change per call**: four 45-frame calls give
    `['menu-move','menu-move','menu-confirm','menu-confirm']`, one 180-frame call
    gives just `['menu-confirm']`.
  * `advance(n)` has a sharper edge than the browser can hit: the countdown branch
    consumes the whole batch and returns, so frames past the end of the count are
    **discarded**, not carried into the run. A dead-run topout therefore needs
    `advance(180)` and then a second `advance(9000)`; the one-call form leaves the
    stack untouched (observed: `pieces` still 0, RUSH clock still `02:30`). Only a
    batched caller can hit it — the app pumps one frame per animation tick — but a
    future replay driver would. § 6.
  * Nine presentation findings came out of these three files and are written up in
    § 6: the options grid overflowing past y=160 (which also buries the bindings
    editor's DONE button under row 11's hit band), the blank accessibility
    announcement on every options row, `CONTROLS` never returning to OPTIONS,
    BACKSPACE binding despite its own hint, a stolen code silently emptying another
    row, `Delete` writing an unchanged table while claiming a reset, the dead
    `optionsReturn === 'bindings'` branch, the stranded play scene, and the
    player-2 pause in versus whose menu is drawn but cannot be driven by keyboard.
  * Harness lesson worth keeping: `session.input()` returns void and the scene
    machine routes sounds from the events that the **next** `advance()` returns, so
    a hold *click* is silent until the following frame — assert it with
    `pointer(...) → advance(1)`, not by reading the log immediately (a hard drop, by
    contrast, locks synchronously).
* `render.test.ts` (33) and `font.test.ts` (18) close `TODO.md` § 1 item 5 (and § 2)
    over a new `src/tests/render-harness.ts`. **The seam is the recording 2D context**,
    chosen because `src/render/renderer.ts` is the only module in the project that talks
    to a canvas and every coordinate it emits is a framebuffer pixel: a row can ask "what
    would this frame have painted" and get an ordered call list, which is where a 1-px
    error in a centring or clipping formula actually lives. Nothing rasterises, so no
    jsdom and no node-canvas; and nothing had to be made public to get at it — the
    private tile cache, the atlas and the glyph table all stay private.
  * What the rows pin, in order: the paint order (clear → boxes → fields → previews →
    bars → texts → veil); that a model without `bg` still paints `COLOURS.bg` and that
    `paint` clears with a full-screen `fillRect`, never `clearRect`, so no scene can
    paint a transparent frame; identity across `reset()`; the whole failure branch
    (`makeCanvas(false)` → a renderer that throws once, keeps its identity and re-throws
    on every later paint, so the app can never be handed a half-dead renderer); the
    field's clip (`save/beginPath/rect/clip/restore`), whose rect starts at
    `y − (board.rows − rows) * cell` because spawn rows sit **above** the visible field;
    `dim` on a preview being a *colour* (`shade(textDim, 0.62)`) rather than an alpha, so
    it composites without `globalAlpha`; the dashed border; the veil's `min(1, veil)`
    ramp; the bar's inset.
  * Under node `document` is undefined, so `blocks.ts` and `font5x7.ts` both skip their
    atlas path and degrade to a flat `fillRect`. Position, size and colour are common to
    both paths and are pinned; the tile bevel texture and the atlas blit are
    browser-only, and the harness header says so where a test author will read it.
  * `font.test.ts` checks the table against the strings the game *asks* for by walking
    every screen the scene machine can show — title, scores, **every options row opened
    from a fresh record** (that is how the controls editor and the erase confirmation get
    exercised without hardcoding either row's index), the rules card scrolled four rows,
    the live HUD, the pause menu, results, and the locked-mode announcements — rather
    than scanning source for string literals, which cannot tell a label from a comment
    and misses anything assembled at run time.
  * **It found a shipped bug on its first run.** `src/modes/timed-max-lines.ts:17`
    carried an em-dash in BLITZ's rules prose; the 5×7 table has no em-dash and
    `drawText` drops a glyph it lacks without a word, so the card rendered
    `zero  a fast stacker` with a hole where the dash should be. Now an ASCII hyphen.
    Sweeping every non-comment line under `src/` for non-ASCII found no other offender
    (the `palette.ts` hits are comments, never drawn). § 6.
  * Most of its first-run failures were mine, not the code's, and each was a trap worth
    naming: a dashed border's rails (`h === 1`) and posts (`w === 1`) have to be split
    before the 2-on-1-off order is tellable; a field with `flashFrames: 0` still paints
    its background, so "no overlay" is a colour list rather than a fill count; `wrapText`
    breaks `…BEFORE THE PIECE BAG…` after `THE`, not before it; only something like `'!'`
    inks a predictable column, so an advance assertion has to pick its glyph; and with
    `noUncheckedIndexedAccess` a bare `[x, y, w, h]` array hands callers
    `number | undefined` unless the tuple is named. Vitest stayed green through that last
    one — `npm test` does not typecheck (§ 5 item 7) — and `npx tsc --noEmit` caught it.
* **Single-file build: `npm run build:single` → `dist/orbit-drop.html`**, added
  2026-11-08 from the user's question "if I didn't want to run node, is there a way
  to have this run in html?". What the survey found first: the game already needs
  nothing at run time — `dependencies: {}`, no `import.meta.env`, no CSS/JSON/asset
  import, no worker, every intra-project specifier already relative-with-`.js` — so
  `dist/` runs under any static server (`python3 -m http.server -d dist 8000`,
  verified 200/`text/javascript`). What it could not do is open from disk: Vite
  emits `<script type="module" crossorigin src="./assets/index-*.js">`, and a
  `file://` document has the opaque `null` origin, which Chromium and Safari refuse
  as a module-script fetch. So `scripts/inline-single-file.mjs` replaces that one
  tag with the same bundle as an **inline** module script (no fetch) and `exit 1`s
  if it finds anything else outstanding. Node is now only a build-time tool.
  Decision + rejected alternatives: `docs/architecture/decisions.md` D11.
  * Verified: `npm run build:single` exit 0; artifact 69 KB, exactly 1 `<script`
    pair, 0 external `src`/`href`, 0 `sourceMappingURL`. Gates re-run after the
    change: `tsc --noEmit` 0, `npm test` 23 files / 428 tests, `npm run test:e2e`
    **9 passed** (7 existing + 2 new `file://`), `npm run report` PASS.
  * `tests/e2e/single-file.spec.ts` (2 tests) is what pins it. From `file://` with
    `?test=1`: the page fetches nothing but itself, zero console/pageerror output,
    one inline script and no `<link[href]>`, canvas still 240×160 and painting more
    than one colour, `#boot-error` gone, and Enter moves title → modes. Its URL is
    derived from `testInfo.file`, because `node:url` is unimportable here — no
    `@types/node` is installed and `tsconfig.json` includes `tests`.
  * Two traps, both recorded as comments in the code: a clean boot **removes**
    `#boot-error` from the DOM, so its absence is the pass signal (the first draft
    called `getComputedStyle(null)`); and `readonly debug(): Debug` inside an object
    type is TS1024 — a `readonly` member has to be a property
    (`readonly debug: () => Debug`). The typecheck-before-e2e coupling (§ 5 item 7)
    caught the second one before any browser started.
* **`↑` turns the piece clockwise inside a live run** (2026-11-08, from the user's
  "instead of wasd, can we change the controls to use the cursor keys"). The request
  was ambiguous — player one was *already* on the cursor keys, and moving player two
  onto them collides on one keyboard — so it was asked, and the answer was
  "Player 1: rotation onto cursor keys": keep `←` `→` move and `↓` soft drop, add
  cursor-key rotation, leave the WASD map alone so versus still works.
  * One line inside `remap()`'s in-run branch —
    `return kind === 'up' ? 'rotate-cw' : kind;` — and why that route rather than a
    `bindings.ts` edit is in § 2. `X` and `Z` still rotate both ways; the in-run pause
    menu reclaims `↑` because the remap is gated on `menuActive()`; the binding screen,
    the conflict list and the versus footer were untouched and stay truthful.
  * Three tests in `src/tests/scenes-run.test.ts` (27 → 30), all asserted through the
    paint model (`frame().fields[i].active.rot`) rather than a DOM: the cursor key
    produces the same quarter-turn as the bound rotation key on a second run from the
    same seed, guarded against vacuity by `expect(rot).not.toBe(spawn)` — a seed whose
    first piece is the square would otherwise pass with rotation deleted; paused, `↑`
    steps the pause list, and the test leaves the screen through the one row whose
    destination is observable from outside (`MODE LIST` → `modes`) so the result says
    which role applied; in a duel it turns side A and not side B.
  * Verified: `npm run typecheck` clean, `npm test` **431 passed (431)** in 23 files,
    `npm run test:e2e` **9 passed**, `npm run build` exit 0 (35 modules, 68.51 kB /
    24.61 kB gzip), `npm run report` **PASS**. Docs that record these counts
    (`build.md`, `interfaces.md`, `TODO.md`, § 5 below) were synced in the same change;
    the controls table carrying the new mapping moved to `GAME_README.md` (see below),
    and `docs/architecture/interfaces.md` still carries it.
* **2026-11-09 — root README split; the repo becomes a public experiment write-up.**
  * `git mv README.md GAME_README.md` (content untouched, 202 lines): that file is the
    game's own documentation. `GAME_README.md` never refers to itself as "the README",
    so the rename needed no follow-up edit inside it.
  * New `README.md` is the **part 3** write-up of a three-part experiment (part 1:
    one prompt → one HTML file, `kireol/qwen3.8_GTA_one_shot_test`; part 2: same task
    at 128K, `kireol/Qwen3.8-GTA-1-Test-2`; part 3: reproduce a game from a ROM using
    only REA-style black-box study). It carries the verbatim operator prompt, the
    verbatim hardware/model block, the five screenshots below, the measured git timing
    table, and a section that states plainly what the study pass did *not* prove.
    The directory name this repo was developed in is deliberately never written into
    it.
  * `docs/images/01-title…05-play-duel.png` are now **tracked** (1920×1280 window
    captures of *this* build, taken 2026-11-09). This does not contradict the
    "reference screenshots are gitignored" rule: the ignored folder is
    `docs/reverse-engineering/screenshots/`, and nothing in `docs/images/` came from
    the reference. `.png` is outside the sweep's `TEXT_EXT`, so the images are not
    scanned (verified: a tracked-file sweep over 103 files PASSes with only the 3
    acknowledged hits).
  * Total elapsed measured from git for the README: `git log --reverse --format=%aI`
    plus per-commit `--numstat`, excluding `package-lock.json` — **23 commits,
    30 h 27 m 10 s** between the root commit (`cf75ac7`, 2026-11-07T10:55:07+01:00)
    and `26155a1` (2026-11-08T17:22:17+01:00). Splitting the interval that precedes
    each commit by whether that commit touches `src/` outside `src/tests/`: 16 of 23
    commits add no game code and their intervals cover 20 h 01 m 52 s (66%). The
    root commit means this is a floor, not a measurement — emulator bring-up predates
    the repo. Script kept at `/tmp/span4.py` (throwaway).
  * Four claims written into the new README and then disproven by checking the repo,
    all corrected in place: the fresh install unlocks **one** mode, not two
    (`withUnlocks`, `src/gameplay/persistence.ts:226`); the mode-list footer is the
    plugin's `summary` field (`src/ui/scenes.ts:390`), not a per-mode UI string table;
    `docs/architecture/decisions.md` runs **D1–D11**, not D1–D8; "six of the eight
    largest commits are test-only" was wrong (strictly test-only is 1 of 23 — the
    real figure is 16 of 23 adding no game code, above). `docs/reverse-engineering/`
    is 7 topic notes + the unknowns ledger, so the older "8 documents" phrasing in § 3
    counts the ledger as a document.
  * Re-verified after the doc change: `npm test` 431/431 in 23 files,
    `npm run build` exit 0 (35 modules, 68.51 kB), `npm run test:e2e` 9 passed,
    `npm run report` PASS, and `git ls-files | xargs node scripts/forbidden-name-sweep.mjs`
    PASS over 103 tracked files.
  * **Published.** `origin` = `https://github.com/kireol/gba-game-rea-test`, `main`
    tracks it. The remote was **not** empty: its `main` carried the three
    starter-template commits this project was seeded from, with no merge base against
    our history. The operator picked the non-destructive option, so `b3ceaa0` merges
    `origin/main` with `--allow-unrelated-histories`. The seven add/add files were
    resolved per file, not wholesale: ours for `README.md` / `PROJECT_STATE.md` /
    `QWEN.md`; theirs for `prompt.md` and `scripts/load-bridge.sh` (each differs by one
    line only — theirs writes `$HOME/...` where ours had the machine username); ours
    plus the same `$HOME` swap for `scripts/start-mgba.sh` (ours also drops the
    hard-coded reference ROM name); union for `.gitignore`. No tracked file now contains
    that personal path (`git grep --cached '/Users/cparent'` is empty). Watch item: the
    remote's `.qwen/settings.json` is tracked although `.gitignore` lists `.qwen/` —
    untracking it is a one-line commit if wanted. `feature/single-file-html` was
    fast-forwarded into `main` and is now redundant. All four gates re-run green after
    the merge.

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
  Remaining: `assets` (the module does not exist yet). `bindings` is covered from
  both ends now — the round-trip above and the table itself in
  `src/tests/bindings.test.ts`.
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
  un-unit-tested.** Two files of `src/app`/`src/ui`/`src/render`/`src/audio` now
  have a Vitest file — `src/tests/layout.test.ts` and `src/tests/loop.test.ts` —
  and `src/engine/bindings.ts` has its own. The e2e suite exercises the rest
  together, which is not the same as pinning them. Next, in this order:
  1. **Done 2026-11-08** — `src/app/loop.ts` (`src/tests/loop.test.ts`): fixed-step
     accumulator, `maxCatchUp` dropping work instead of spiralling, injected clock +
     injected scheduler (no `requestAnimationFrame` in the test). See § 3 for what it
     pins and the float detail.
  2. **Done 2026-11-08** — `src/app/input.ts` (`src/tests/input.test.ts`, 24 tests,
     jsdom): `SWALLOWED` key set, `event.repeat` dropped, P1/P2 dispatch, key
     capture ahead of the bindings, right/middle button and wheel mapping with its
     deadzone, blur and visibility handling, `preventDefault` not eating the page.
     What it turned up is in § 6.
  3. **Done 2026-11-08** — `src/ui/scenes.ts` navigation through a stub
     `SceneHost` (`scenes-harness.ts` + `scenes-menus.test.ts` 18 +
     `scenes-options.test.ts` 26 + `scenes-run.test.ts` 30). Every row the list
     above asked for is pinned: title's 3 rows → modes/scores/options, a locked
     mode refusing with `rotate-fail` + the announce (its `LOCKED` banner is set
     but never drawn — § 6), `startRun` seeding from `lastSeed` vs `randomSeed`,
     countdown withholding frames, options cycling feeding `configFor`, the
     bindings capture/rebind/unbind flow, reset-progress needing confirmation, and
     the duel pause list. Nine findings came out of it (§ 6); § 3 has the harness
     and countdown details. Not covered: the rules-screen *scroll*, and the fact
     that `debug()` reads side A only in duel.

     **← next, per `TODO.md` § 1 — that section is the order a resuming session
     follows. Its item 5 (`render.test.ts` + `font.test.ts`) landed 2026-11-08, so the
     live one is item 6: `audio.test.ts`, over a fake `AudioContext` — one voice set per
     effect, music starting only on the edge into `playing`, mute persisting. It is the
     last module in the project with no test in either environment. Item 4 below covers
     the same layer from the other end and is an equally valid entry point; keep only one
     "**← next**" marker live at a time.**

     **Half-written already:** `src/tests/audio-harness.ts` (421 lines) is that item's
     fake `AudioContext` — it records a node *graph* rather than naming the buses, and
     documents three deliberate unfaithfulnesses (a clock that only moves when a test
     advances it, a `state` that never changes by itself, buffers that start as zeros).
     It is **untracked, imported by nothing, and unverified**: no `audio.test.ts`
     exercises it, and this session neither wrote it nor committed it. Read it
     before writing rows against it.
  4. `src/ui/widgets.ts` (`rowUnderPoint`, `menuRects`, `addField`),
     `src/ui/options.ts`, `src/ui/format.ts` (`mmss`, score padding).
  5. **Done 2026-11-08** — `src/engine/bindings.ts` (`normalizeBindings`, `rebind`,
     `unbind`, `conflictsIn`, `intentForCode`, P2 variants) in
     `src/tests/bindings.test.ts`; § 6 lists the four behaviours it surfaced.
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
    character set; `node` evaluation over the `G` table settled it, and since
    2026-11-08 `src/tests/font.test.ts` asserts all of it, the six known-empty
    characters included as a named set (§ 3).
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
* Commit groups: `cf75ac7`…`d15e1fd` tooling/docs/rules layer → `f864f81`…`35f4be1`
  the test campaign → `4c29d08` render/audio/app/ui + configs + index.html + e2e +
  layout tests → **`fb3ffdf` README/TODO/CHANGELOG/milestone report + the docs pass
  above** (12 files, +1 472/−213, docs-only: no `src/` change, so the five gate
  results recorded in § 3 still describe `main`) → **`e3e3620` the scene-machine
  suites** (71 tests over one shared harness). The paint-layer suites
  (`render-harness.ts`, `render.test.ts`, `font.test.ts`), the one line of copy they
  forced, this doc sync and the `interfaces.md` coverage tags follow on `main`.
  Nothing pushed.


## 5. Outstanding tasks

1. Engine + tests: board, pieces, collision/rotation (no kicks), gravity/lock,
   line clear, seeded 7-bag, ghost, hold. **Written and tested** (gravity/lock/
   spawn/freeze timings pinned by `timings.test.ts`, the state machine and mode
   contract by `session.test.ts`). `bindings.ts` — the last rules-layer module with
   no test file of its own — landed 2026-11-08 (`src/tests/bindings.test.ts`).
   `config.ts` still has no file of its own; `gravityFrames` and `DIFFICULTY_SPEED`
   are pinned through `timings.test.ts`, `isDifficulty` is not pinned directly.
2. Gameplay: session state machine, goal/level progression, score (opt-in),
   top-out, garbage + star special blocks, persistence (settings, bindings,
   unlocks, high scores, reset-with-confirmation). **Written and tested**; the
   session core is pinned by `session.test.ts`, all six single-player modes by
   `modes.test.ts` (including `linked-blocks`, i.e. FUSION), the versus wrapper by
   `duel.test.ts`, and the save layer by `persistence.test.ts` (26 tests, mutation
   check in § 3). Persistence runs against a `KeyValue` double and a shimmed
   `globalThis.localStorage`, including one that throws on access; the real
   browser-storage path still only lands with the Playwright pass (item 6).
   The bindings it round-trips are now pinned at the table level too.
3. Modes: 6 single-player + DUEL, each its own rules module + tests. **Written
   and tested**; the module contract and every mode-specific rule are pinned, and
   the suite was mutation-checked as described in § 3.
4. UI: scene/menus state machine with mouse hit-testing, options, bindings
   editor, rules screens, results, pause. **Written, driven end to end by the
   browser suite, and pinned by 74 unit tests of its own since 2026-11-08**
   (`scenes-menus.test.ts` 18, `scenes-options.test.ts` 26, `scenes-run.test.ts` 30,
   over `scenes-harness.ts`; § 3). What it still does not cover: the rules-screen
   *scroll* and the `LOCKED` banner that `go('modes')` sets but never draws (§ 6),
   and the nine findings § 6 lists under "Found while pinning the scene machine" —
   those are behaviour to decide on, not coverage gaps.
5. Render (own 5×7 pixel font, procedural art), audio (WebAudio synth, original
   material), fullscreen + responsive scaling with correct aspect. **Written and
   browser-verified for scaling** (`layout.test.ts` 14 tests + the e2e viewport
   test). `toggleFullscreen` is only proven not to throw where the API is missing;
   a real fullscreen transition is untested. **The font (18 tests) and the paint layer
   (33) have had unit tests since 2026-11-08, and the art has had 8** (§ 3), so audio is
   now the only thing on this line with no test of any kind — which is `TODO.md` § 1
   item 6.
6. Vitest suite covering every mechanic the brief lists; Playwright browser
   tests. **431 unit tests across 23 files, all green. Browser: 9 Playwright
   tests green** on "Chrome Headless Shell 158.0.8127.18" (already installed, no
   `playwright install` needed). Of the 431, **244 are rules/engine/gameplay**
   (including `bindings.ts` 18 and `persistence.ts` 26) and 187 are not:
   `render/blocks.ts` 8, `render/renderer.ts` 33, `render/font5x7.ts` 18,
   `layout.ts` 14 (the framebuffer scaling), `loop.ts` 16, `input.ts` 24,
   `scenes.ts` 74 (three files over one harness). Still open inside
   this item: the last presentation-layer suite in § 4 (`src/audio/engine.ts`),
   `src/gameplay/assets.ts`, and a Playwright assertion for the real
   `localStorage` round-trip (the persistence suite covers that with a double only,
   so item 2's browser-storage caveat still stands).
7. Verify `npm run typecheck`, `npm run test`, `npm run build`,
   `npm run test:e2e`, `npm run report` and report results verbatim. **All five run
   green on 2026-11-08** (latest run, after the cursor-key rotation and the doc sync
   that came with it):
   build/typecheck `BUILD_EXIT=0` (35 modules, 68.51 kB / 24.61 kB gzip); vitest
   `431 passed (431)` in 23 files; Playwright `9 passed (25.0s)`; sweep
   `PASS — no blocking hits`, 102 files, 3 acknowledged. (Those vitest numbers are
   from the pre-commit `npm test`; the four gate commands are re-run verbatim in the
   commit message's verification note, and `docs/architecture/build.md` keeps the
   same table per gate.) Re-run all five after any
   change — `build` runs `typecheck` first, and `test:e2e`'s webServer runs `build`,
   so one type error anywhere under `src/` or `tests/` breaks the browser suite too.
   Vitest itself does **not** typecheck: a green `npm test` can still hide a build
   break (§ 3), so never report the unit gate alone.
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

**Found while pinning `src/engine/bindings.ts` (2026-11-08).** All four are
behaviour the new tests now lock down, so they are recorded decisions rather than
surprises; none is game-breaking, and none should be "fixed" without asking the
user, since the tests assert the current shape deliberately.

* **`unbind` falls back to the default table, not to the table it was given.**
  Unbinding the last key of a player-two intent therefore hands player two player
  one's key (`unbind(P2, 'left', 'KeyA').left` → `['ArrowLeft']`). **Unreachable
  today**: the key-bindings screen edits player one only. The day P2 becomes
  editable this needs a base-aware fallback.
* **`rebind` can collapse a row that has two aliases.** Recording a code that
  already lives in another slot of the same row overwrites that slot with a
  duplicate, and the de-duplicating pass then drops the alias:
  `rebind(DEFAULT, 'hold', 'KeyC', 0)` → `['KeyC']`, and `ShiftRight` is gone.
  **Reachable** from the key-bindings screen; the row keeps a working key, so the
  loss is an alias, not the control.
* **Player two can never receive a CONFIRM *press* through the shipped tables.**
  Its only CONFIRM codes are `Enter` and `KeyZ`, and both are claimed earlier
  inside `intentForCode`'s declaration order by player one's rows (`Enter` → P1
  PAUSE, `KeyZ` → P1 ROTATE CCW), which `handleKey` asks first and returns on.
  `release()` then dispatches player two's intent whenever it differs from player
  one's, so the keyup sends player two a CONFIRM **release** for a press it never
  got. Nothing breaks, for two reasons: outside a run the scene machine ignores
  releases outright (`intent()` returns false when `!down`), and inside one
  `confirm` is not among the play intents. And menus do not look at the player id,
  so P2's `Enter` still confirms — through P1's PAUSE→CONFIRM remap, not through
  P2's row. So `P2_BINDINGS.confirm` is dead code as shipped, and the user cannot
  give player two a working CONFIRM code because that table is not editable.
  (The earlier version of this bullet claimed a keypress is "dispatched through
  both maps", which the code does not do — that is exactly what `input.test.ts`
  now pins.) Reachable in every mode; pinned; **not fixed**, because who owns
  `Enter` in versus is a design decision rather than a bug.
* **`conflictsIn` reports a code repeated within one row** as a conflict against
  itself. Not reachable through the UI: `normalizeBindings` and `rebind` both
  de-duplicate a row before it can be saved.
* **The mirror case of the bullet above is correct**: one code that resolves to the
  *same* intent in both tables (`Escape` → BACK) releases once, for player one
  only, because of the `p2 !== p1` guard in `release()`. Pinned, so a future
  "fix" to the P2 path cannot silently break this.
* **`SWALLOWED`'s comment and the shipped table disagree about `Escape`.** The
  comment keeps it out "because the browser owns it in fullscreen", but `Escape` is
  bound to BACK in both tables, so the handler `preventDefault`s it on the mapped
  path anyway. A comment/code mismatch; the observable effect is browser-dependent
  (a browser may still exit fullscreen whatever the page does), and a real
  fullscreen transition is untested — `TODO.md` § 6.
* **`onGesture()` fires on *every* non-chord keydown**, not "on the first key or
  pointer event" as `InputHost` documents it. Harmless — the host is
  `audio.unlock()`, which is idempotent — but the comment should not be trusted to
  imply a once-only hook. Pinned.
* **Hover dedupe packs the framebuffer point as `y * 1024 + x`**, so two points
  alias if framebuffer x ever reaches 1024. Not reachable at the framebuffer in
  use, let alone the field of play.
* **No `pointercancel` or `lostpointercapture` handler exists** (grep over `src/`
  finds neither), so an interrupted pointer can leave `rotate-ccw` or `hold`
  pressed until that same button goes down and up again — `onFocusLost` pauses the
  run but does not release held intents. Unverified on a real touch device.
  `index.html:36` does set `touch-action: none`, so the deliberately
  un-prevented left-button `pointerdown` cannot scroll the page.
* **Two `TODO.md` claims about `input.ts` were wrong** and are corrected there: the
  CSS→framebuffer division lives in `layout.toFramebuffer` (`input.ts` only forwards
  client coordinates to the host), and `preventDefault` for a mapped key is
  unconditional, not "only outside the test harness" — the harness reads
  `window.__orbit`, which `dispatch` fills, so swallowing is what lets the browser
  suite prove the app owns the key.

**Found while pinning the scene machine (2026-11-08, `scenes-*.test.ts`).** Nine new
observations plus one carried gap, each reached by a test that now passes; every one
is asserted either directly or as the precondition of a passing assertion, so
"fixing" one means changing a test on purpose. None of them breaks a run — they are
layout, settings, and versus-pause behaviour. Line numbers are `src/ui/scenes.ts` as
of this writing.

* **The options grid runs off the bottom of the screen.** `optionGeom` (620) is
  `{ x: PANEL.x, y: 25, rowH: 11, count: OPTION_ROWS.length }` with 14 rows, so the
  last band ends at y=179 on a 160-px screen and `ERASE RECORDS` is drawn at y ≥ 160.
  The keyboard cursor still visits it and the announcer still speaks it, so the row
  is reachable by every route except the pointer.
* **The same grid swallows the DONE button.** `doneRect` (628) is
  `{ x: SCREEN.w - 42, y: SCREEN.h - 11, w: 34, h: 10 }` → y 149..159, and
  `pointer()` tests `rowUnderPoint` *before* `doneRect` (1141–1176). On options that
  click lands in band 11 and flips `INFINITE THINKING`, staying on the screen; the
  settings screen has no pointer way out at all, only Escape. It works on the
  controls editor because that grid (inline literal at 1144) uses `rowH: 9`, which
  clears the button by about one pixel — so the difference between the two screens
  is a pixel of arithmetic, not intent.
* **An action row persists a record it did not change, and announces a blank.**
  `changeOption` commits whatever `stepOption` returned and an action row returns its
  input untouched: two `commit`s for a nudge right-and-back, plus
  `` announce(`${row.label} ${optionValue(row, prefs)}`) `` (837 by keyboard, 1165 by
  pointer) → `'CONTROLS '` with a trailing gap, which is what a screen reader gets.
* **`optionsReturn` has one writer, so the controls editor forgets how it arrived.**
  Only `openOptions` (846) assigns it; `openBindings` (840) leaves it alone. DONE in
  the editor therefore goes to whichever scene opened OPTIONS — the title, when you
  came in through the title — and `optionsReturn === 'bindings' ? 'options' : …`
  (992) is a dead branch.
* **The capture hint promises a key the capture handler does not honour.** It draws
  `ANY KEY WORKS. BACKSPACE CLEARS` (1090), but `key()` special-cases only `Escape`
  (1107) and `Delete` (1114), so Backspace is recorded like any other code
  (`bindings.left === ['Backspace']`).
* **Rebinding a code another row owns silently empties that row.** That is the
  engine's documented steal (`rebind`, bindings group above), and the editor announces
  only the row being edited: `MOVE LEFT IS NOW ARROWRIGHT`, while `bindings.right`
  becomes `[]` with nothing said about it. Reachable in one click and two keystrokes.
* **`Delete` commits an unchanged table while claiming a reset.** The branch at 1114
  hands `unbind` the literal word `'Delete'`, but `unbind` removes *one code by
  name*, and no row contains that string. So the table is byte-identical, one `commit`
  fires anyway, and the announcement reads `MOVE LEFT RESET TO ITS DEFAULTS`. The real
  factory reset is the RESTORE box (1178); the row's own "BACKSPACE CLEARS" hint is
  doubly wrong (previous bullet).
* **`advance(n)` spends a whole batch on the countdown and drops the rest** — § 3 has
  the detail and the observed shape. Not reachable from the app, which pumps one frame
  per animation tick; reachable from any future replay driver.
* **OPTIONS from the play pause menu strands the run.** `openOptions('play')` drops
  the session (documented in `docs/architecture/interfaces.md`), and Back from
  OPTIONS lands on `'play'` with nothing to draw and nothing to handle: every intent
  false, every pointer false, `blur()` a no-op, `debug()` reporting `status: null`
  and `level: 0`. A reload is the only way out. Pinned with a `TODO(v0.1.2)` marker
  in `scenes-run.test.ts`; the honest fix is either a resume-the-run affordance or
  the pause menu not offering OPTIONS at all.
* **A player-two pause in duel is drawn as though it were player one's, and only the
  pointer can drive it.** The gate that decides whether the pause menu owns the
  keyboard is `menuActive()` (803), which in duel asks **side A** alone. So player
  two's PAUSE key never opens that gate: it falls through as an ordinary play intent
  into side B's session and stops only that half — while the frame still draws the
  shared PAUSED list, because it asks either side. Result: the menu is on screen with
  A still falling, A's Enter is swallowed (`press('confirm')` false, and A receives
  it as a play intent that is not one), and Escape lands on `resume()` →
  `duel.togglePause()`, which is "if either side is paused, resume both"
  (`src/gameplay/duel.ts:83`), so it unpauses. The row hit test does not consult
  `menuActive()`, so the pointer is the only input that can activate that list — and
  RESUME goes through the same `togglePause()`, resuming both halves whatever the
  click's owner. `debug()` (1316) reads `duel.a` too, so a B-only pause is invisible
  to both this suite and the `?test=1` browser surface.
* **Carried over from the rules screen: `setBanner('LOCKED', 60)` (864) is set on the
  way into the mode list but the modes frame never draws that banner.** The refusal is
  still audible (`rotate-fail` + `… IS LOCKED. CLEAR THE MODE BEFORE IT FIRST.`), so
  this is a visual-only gap; still the only screen that sets a banner nobody renders.

**Found while pinning the paint layer (2026-11-08, `render.test.ts` / `font.test.ts`).**
One shipped bug, fixed in the same change that found it, and the rest descriptions of
what the renderer already does — worth reading before anyone re-derives them:

* **`timed-max-lines.ts:17` had an em-dash, and the font silently ate it.** The
  mechanism is the whole risk of a hand-drawn table: `drawText` has no `else` for a
  character it lacks, and it keeps that character's advance column anyway, so the label
  does not close up around the hole — it reads as a double space in the middle of a
  sentence, in a mode whose rules card nobody re-reads. Two defences now: the
  known-empty set and the ASCII-only decision are pinned as named rows, and the suite
  walks every screen asserting `canRender` on what it finds. A source scan for string
  literals would have caught this one by luck and cannot tell a label from a comment.
* **`paint` never calls `clearRect`** — it covers the frame with a `fillRect` in
  `model.bg ?? COLOURS.bg`. Omitting `bg` does not make a frame transparent; a scene
  that wanted one would need the renderer to change, not just its model.
* **`veil: 0` emits no draw call at all** (the `withAlpha` branch is skipped), so an idle
  screen pays nothing for the pause dim. And `flashFrames: 0` still paints the field's
  background, which is why "no overlay" has to be asserted as a list of colours rather
  than a fill count.
* **A field's clip rect deliberately starts above its own `y`** — `originY = y −
  (board.rows − rows) * cell` — so the rows a board has that the frame does not show
  clip out *above* the field instead of sliding the visible ones up. A caller that sets
  `rows < board.rows` and expects the stack to sit on the bottom line gets that for
  free; anyone changing that arithmetic moves the whole board.
* **Dimming is a colour, not an alpha.** A dimmed preview is `shade(COLOURS.textDim,
  0.62)` at full alpha; a dimmed field is `withAlpha(shadow, 0.55)`. They read
  similarly, composite differently, and only the second depends on what is behind it.
* **The unit environment cannot see the atlas.** Both `blocks.ts` and `font5x7.ts`
  prefer a `drawImage` blit and fall back to flat `fillRect` when `document` is
  undefined. If that guard ever changes, the fill-count rows in both suites stop
  describing the browser — that is the first seam to re-check.
* **`↓` does nothing in menus, and it is load-bearing for long lists.** In
  `DEFAULT_BINDINGS`, `soft-drop` and `down` both claim `ArrowDown`; `intentForCode`
  (`src/engine/bindings.ts:112`) walks `BINDABLE_INTENTS` and returns the **first**
  claim, and `soft-drop` is index 2 while `down` is 13, so the scene machine's
  `case 'down'` can never fire with default bindings. Practical effect: the mode list
  and any list longer than the screen cannot be scrolled downward with `↓`; `↑` wraps
  and reaches the same rows, which is how the `docs/images/` captures were navigated.
  `src/tests/bindings.test.ts:52` pins `intentForCode(DEFAULT_BINDINGS, 'ArrowDown')`
  to `'soft-drop'`, so this is deliberate-by-test, not an oversight — fixing it means
  changing shipped controls (or giving menus a context-aware claim order), which is a
  decision for the operator, not a docs change. `↑` *is* reachable in menus: it is the
  cursor's up key and `remap()` gives it back to the cursor when a menu is open.
* **No browser coverage for list scrolling in either direction.** `playable.spec.ts`
  asserts that the mode-list frame's *text* contains all seven labels; nothing in the
  browser suite presses `↓` inside a list. So "arrow-down scrolls the mode list" has
  never been observed anywhere — and per the defect above it is false with default
  bindings anyway. If someone fixes the binding claim, that fix needs a browser test
  that moves a cursor down past the fold, not another text-membership assertion.

## 7. Important files

| File | Purpose |
| --- | --- |
| `prompt.md` | the user's brief (objectives, licence rules, milestones) — read it |
| `README.md` | the **part-3 experiment** write-up (public front page): prompt, hardware, measured git timing, what the study pass did and did not prove. Not the game's manual |
| `GAME_README.md` | the game's own documentation: quick start, controls, modes, rules tags, save model, licence |
| `docs/images/*.png` | five tracked screenshots of *this* build, embedded by `README.md`. `docs/reverse-engineering/screenshots/` stays ignored |
| `docs/reverse-engineering/*.md` | the verified rule set; the spec for `src/modes` |
| `docs/reverse-engineering/reverse-engineering-unknowns.md` | what we do NOT know, with the method to settle each |
| `docs/game-design.md` | our game's rules: what is inherited, assumed, invented |
| `docs/architecture/{overview,interfaces,data,build,decisions}.md` | how the code is organised |
| `docs/asset-provenance.md` | every asset's origin (all in-repo/procedural) |
| `tools/re/` | the analysis harness (mGBA Lua bridge + vision classifier) |
| `scripts/{start-mgba,load-bridge}.sh` | launch mGBA with the bridge on 127.0.0.1:8777 |
| `scripts/forbidden-name-sweep.mjs` | licence gate, `npm run report`; run before any milestone claim. `ACKNOWLEDGED` is keyed by path — check the printed exceptions every run |
| `src/ui/scenes.ts` | every screen, the menu cursor, `pointer()`, `activate()`, `remap()` (the screen-decides-key-role rule, § 2) and `debug()` — the largest file in the project |
| `src/app/main.ts` | composition root; publishes `window.__orbit` only when the URL has `?test=1` |
| `src/app/layout.ts` | the only place window size touches the game; `computeScale`, `toFramebuffer` |
| `src/app/loop.ts` | wall-clock → rules frames: `STEP_MS`, `MAX_CATCHUP`, the injectable clock/scheduler |
| `src/render/frame.ts` | the frame model the renderer draws and the e2e tests assert against |
| `tests/e2e/playable.spec.ts` | the 7 served-page browser tests; reads the app through `?test=1`, never screenshots |
| `tests/e2e/single-file.spec.ts` | the 2 `file://` tests: the single-file page boots, plays, and fetches nothing but itself |
| `scripts/inline-single-file.mjs` | `npm run build:single`'s second half — folds the bundle into `dist/orbit-drop.html`; exit 1 on any leftover external reference |
| `src/tests/layout.test.ts` | jsdom docblock example + the framebuffer scaling tests |
| `src/tests/loop.test.ts` | the fixed-timestep loop, driven by an injected clock and a hand-pumped scheduler — no DOM, no waiting |
| `src/app/input.ts` | browser events → intents: key mapping and capture, `SWALLOWED`, the `event.repeat` drop, pointer/wheel, focus |
| `src/tests/bindings.test.ts` | the whole binding table: resolution order, conflicts, normalize/rebind/unbind |
| `src/tests/input.test.ts` | jsdom: real events at the real listeners, pinning both the dispatched `Intent` and `defaultPrevented` |
| `src/tests/scenes-harness.ts` | the recording `SceneHost` stub behind all three `scenes-*.test.ts` files — no DOM, no clock, no storage |
| `src/tests/audio-harness.ts` | **untracked WIP** — the fake `AudioContext` for `TODO.md` § 1 item 6. Imports nothing, imported by nothing, unverified. See § 4 |
| `vite.config.ts` / `playwright.config.ts` | build (240×160 canvas app) / `webServer: npm run build:single && npm run preview` — hence the typecheck coupling, and why e2e exercises the single file too |
