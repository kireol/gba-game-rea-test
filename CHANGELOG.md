# Changelog

Human-readable map of `git log`. The commits are the authoritative record and each
one carries the detail; this file is ordered newest-first and says *why* each step
happened. No git tags exist yet, so versions below are milestones, not releases.

## [Unreleased] — 2026-11-08

### Changed — documentation only
No source, test or config file changed.

* `docs/architecture/interfaces.md`, `docs/architecture/data.md`,
  `docs/architecture/build.md` and `docs/asset-provenance.md` were rewritten to
  match the code. They had been written while the layers they describe were
  planned rather than built, and had drifted: signatures that no longer existed, a
  save-file schema the code never writes, an import-alias and a test command that
  are not in any config.
* `docs/architecture/overview.md` and `decisions.md` were corrected in place for the
  same reason (the real mode-plugin shape, the real scene-machine API, the real
  catch-up rule, `settings.showScore`).
* `docs/agent/PROJECT_STATE.md`'s recorded unit-test inventory was wrong in a way
  worth naming plainly: it recorded **48 files / 324 tests**, which never existed —
  the suite has been 15 files / 248 tests since the browser layer landed, and
  `git log --diff-filter=D` shows no test file was ever deleted. It also credited a
  font-coverage test, a render test and an asset test that do not exist, and said
  `src/app/layout.ts` was untested when it has 14 jsdom tests. Every number in that
  file is now re-derived from a live run.
* Added `README.md`, `TODO.md`, `CHANGELOG.md` and
  [`docs/agent/MILESTONE-2026-11-08.md`](docs/agent/MILESTONE-2026-11-08.md) — the
  deliverables the brief's § 14 asks for, which had been deferred while the browser
  layer was open.

## 0.1.0 — 2026-11-08 — playable in a browser (`4c29d08`)

The rules engine had no way to be seen or heard. This lands the presentation layer
on top of it: a 240×160 framebuffer painted from a declarative frame model, a 5×7
pixel font and procedurally generated blocks, synthesised audio, every screen
reachable by both mouse and keys, whole-number scaling with a fixed aspect, and the
save layer wired in. `index.html` grew the real shell.

* **Frame model instead of screenshots.** Screens are described as data
  (`FrameModel`) and asserted as data, so a rules change cannot silently alter how
  something looks and the browser tests do not go flaky on a palette tweak.
* **`?test=1`** is the only thing that publishes `window.__orbit`; production builds
  have no test surface.
* First two browser-test failures were both **test bugs**, not product bugs: the
  title screen exists before the first paint ("did it render" must poll), and a
  press activates the row *under* the pointer, so one click can enter a mode that
  starts immediately instead of showing its rules first.
* The branding regression test necessarily names the strings it forbids. That is now
  an acknowledged exception in the licence gate so it stays in front of whoever runs
  it — and the gate was checked rather than trusted: a planted violation failed the
  run, removing it passed.

## 2026-11-08 — pinning the rules layer

Five test campaigns, each mutation-checked rather than eyeballed:

* **Session + mode contract** (`471d62d`).
* **Six mode rule sets and the versus wrapper** (`8551a67`, 41 + 9 tests). A
  41-mutant campaign killed 38; the three survivors are deliberate (a redundant
  reset in FUSION, two unreachable post-mortem guards in ENDLESS) and are documented
  instead of tested. One assertion's literal was itself a reference mode name, which
  the licence section forbids in tests too — reworded after `npm run report` flagged
  it.
* **The two special block kinds** (`a5e4088`): garbage sits outside the seven piece
  colours, which is why a clear cannot chain through a garbage stack, and a star row
  raises the level from wherever the rows under it left it. 16 mutants, 16 killed.
* **Determinism** (`8b9ae7c`, 7 tests): one scripted 420-frame run compared against
  itself under six changes of caller shape. The first pass of this campaign aborted
  one edit, so its earlier "8/8" had never covered the hold-slot or generator leaks;
  re-run on a clean tree, it is genuinely 8/8.
* **The save layer** (`35f4be1`, 26 tests): failure paths, not the happy path —
  unparseable, scalar, wrong-shape and newer-version payloads are refused *and* kept
  aside under the corrupt key; a quota failure reports `persisted: false` and the
  in-memory copy carries the run; a browser that throws the moment you touch
  `localStorage` still loads. 23/23 mutants died.

Same commit range corrected the tooling note: the disassemblers are installed and
usable, which unblocked the code-level unknowns.

## 2026-11-07 — rules layer, and four bugs it found

* **`fd83195`** — the frame-quantised rules layer: board (collision, place, clear,
  rising rows, flood), piece geometry with plain in-place rotation and **no kicks**,
  seeded 7-bag, config and bindings, the session state machine, scoring, the save
  layer, the local versus wrapper, the mode-plugin contract and the seven mode
  families. Timings come from the measured behaviour; the first-frame move on
  key-down (a tap = one column) is tagged **[M]**.
* **`1ca7338`** — scoring suite, plus a fix to the *test helpers*: `advance()` drains
  the event queue even for a zero-frame step, so `press`/`release` returned void and
  swallowed every event emitted from `input()` (hard-drop, rotate, the first move),
  and `completeFloor` read `events()` after `advance()`, which is already empty.
  Helpers now hand the drained batch back.
* **`10f1252`** — two rules bugs no existing test exercised: `input()` never wrote
  `held.left`/`held.right`, so the auto-shift gate always bailed and **DAS/ARR were
  dead code** (holding a direction moved exactly one column); and `doHold()` with an
  empty slot moved the piece into the slot but left it active, so the same piece kept
  falling while the slot held a free duplicate. Also `seedShowing` now strides seeds
  by the golden ratio, because consecutive `mulberry32` seeds give near-identical
  first bags (suite 3.2 s → 0.53 s).
* **`8a5609a`** — incoming garbage buries the active piece. The search for a free
  lift asked `collides(..., -lift - 1)`, which can never report that one row is
  enough, so the common case fell through and **declared the run lost**; and a lift
  was applied without checking it fits, since `collides` treats cells above row 0 as
  free — a piece with no way out could be lifted outside the field and keep playing
  there. Both are now bounded: a lift past the piece's own top row is a top-out.
* **`f864f81`** — frame-timing and level-ladder suites (gravity period and table
  clamping, difficulty applied to the session clock, soft drop with its per-row
  payout and revert on key-up, the lock window and what restarts it, spawn delay, the
  HUD clock; ASCENT's ladder including carried-over lines and a multi-level climb).

## 2026-11-07 — findings and decisions

* **`5524b41`** — reverse-engineering findings (`rom-overview`,
  `game-state-architecture`, `gameplay-mechanics`, `game-modes`,
  `scoring-and-progression`, `audio-behavior`, `menu-and-ui-analysis`,
  `reverse-engineering-unknowns`), architecture docs and `docs/game-design.md`.
  `rom/` and the reference's screenshots joined `.gitignore`.
* **`d15e1fd`** — decision records D1–D10 and `docs/asset-provenance.md` (every
  asset is authored here; nothing extracted or sampled). The licence gate excluded
  *itself*: its rule table necessarily contains every forbidden string, which is
  self-reference rather than a hit.

## 2026-11-07 — bootstrap

* **`cf75ac7`** — repository initialised, `.gitignore` written so the reference
  image can never be committed, emulator bridge scripts added.
* **`e355664`** — tooling scaffold (`package.json`, `tsconfig.json`, `index.html`)
  and the reference-analysis helpers under `tools/re/` (`bridge.py`, `drive.py`,
  `exp.py`, `fgrid.py`, `fieldsig.py`, `montage.py`, `rom_header.py`). These are
  development-time tools: nothing in `src/` imports them and they are not part of
  the build.
