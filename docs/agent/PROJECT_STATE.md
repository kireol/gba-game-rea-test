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
* Toolchain: node v26.13.0 / npm 11.20.0; `npm install` completed (67 packages).
* Git: branch `main`, history `cf75ac7` → `e355664`. ROM and reference
  screenshots are gitignored (`rom/`,
  `docs/reverse-engineering/screenshots/`, `docs/reverse-engineering/states/`).
* `scripts/start-mgba.sh` no longer hard-codes the reference file name (now
  `$1` / `$REFERENCE_ROM` / first `rom/*.gba`).

## 4. In progress

* This docs batch (`docs/architecture/*`, `docs/game-design.md`,
  `docs/asset-provenance.md`) — written before the code they specify.
* Then: implementation, in commit-sized groups —
  engine → gameplay+modes → render+audio+ui+app → configs → e2e → README/TODO/
  CHANGELOG. `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` and
  `src/app/main.ts` (referenced by `index.html`) do **not exist yet**; the
  project does not build yet.

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
