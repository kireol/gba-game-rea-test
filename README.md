# Orbit Drop

An original falling-block puzzle game for the browser. The rules were derived by
studying a commercially released handheld puzzle game; the code, graphics, audio,
text and mode names here are this project's own work. **No ROM is needed at
runtime, and none is shipped or required to build.**

The whole game renders into a 240×160 logical framebuffer that is scaled to the
window by a whole number, so it looks identical at 1× and 4× — and every timing
constant is expressed in 60 Hz frames, the same unit the study used.

* 6 solo modes + a local two-player mode on one keyboard
* keyboard **and** mouse support, each complete on its own
* one seeded random stream: a run is reproducible from its seed alone
* versioned save data in `localStorage` (records, options, key bindings)
* procedurally drawn blocks and synthesised audio — zero binary asset files

## Quick start

Requires Node 20+ and a modern desktop browser.

```bash
npm install
npm run dev          # Vite dev server
```

Build and serve the production bundle:

```bash
npm run build        # typecheck, then bundle into dist/
npm run preview
```

`dist/` contains one HTML file and one JS bundle, plus a source map, and nothing
else — the page's stylesheet is inline in the HTML. There is nothing else to
deploy, and no network request leaves the page.

### Tests

```bash
npm test                        # unit suite (Vitest)
npx playwright install chromium # first run only
npm run test:e2e                # builds, then drives real Chromium
npm run report                  # licence gate (see below)
```

`npm run test:e2e` runs `npm run build` itself, so it can never test a stale
`dist/`. All four commands are expected to pass; the numbers currently recorded
are in the [milestone report](docs/agent/MILESTONE-2026-11-08.md).

## Controls

Keys are matched on `KeyboardEvent.code`, so they follow the physical key and work
on AZERTY, Dvorak and friends. Every row is rebindable in **Options → Key
bindings**.

| Action | Player 1 | Player 2 (local versus) |
| --- | --- | --- |
| Move left / right | `←` `→` | `A` `D` |
| Soft drop | `↓` | `S` |
| Hard drop | `Space` | `F` |
| Rotate clockwise | `X` | `W` |
| Rotate counter-clockwise | `Z` | `E` |
| Hold piece | `Right Shift` or `C` | `Q` |
| Pause | `Enter` | `P` |
| Confirm / back | `Enter` · `Esc` or `Backspace` | `Enter` · `Esc` |

The mouse is a complete second input path, not an afterthought — two browser tests
play a whole run with the keyboard only and another with the mouse only, so the two
paths cannot silently rot.

| Pointer | Effect |
| --- | --- |
| Hover | Moves the menu cursor (a drag never yanks it) |
| Click a menu row | Activates the row under the pointer |
| Click the field during a run | Hard drop |
| Click the hold slot, or the middle button | Hold |
| Wheel up / wheel down | Rotate clockwise / soft drop — `Shift` + wheel holds |
| Right button | Rotate counter-clockwise |
| Options sliders | Click the bar to set a value, or a row's left/right half to step it |
| Rules screen's seed box | Click its left/right half to nudge the seed and replay |

Wheel and right-click never scroll or open the browser menu; the wheel gates bursts
so one trackpad flick is one move.

## Modes

Mode names here are ours. Each mode lives in `src/modes/<id>.ts` as a plugin
object; `src/gameplay/session.ts` owns the shared mechanics.

| Label | Internal id | Goal |
| --- | --- | --- |
| ASCENT | `goal-ladder` | Clear `goalBase × level` lines to climb 15 levels |
| FUSION | `linked-blocks` | Dig down to a buried star row, then clear it |
| RUSH | `timed-goal` | Clear a line quota before the clock runs out |
| DASH | `fixed-lines-race` | Clear a fixed line quota as fast as possible |
| BLITZ | `timed-max-lines` | Stack as many lines as the clock allows |
| ENDLESS | `rising-garbage` | Survive rising garbage for as long as you can |
| DUEL | `local-versus` | Two players, one device, identical piece sequence |

DUEL is a declared divergence: the reference connects two handhelds to each other.
Two browsers could not do that with the infrastructure this project committed to,
so versus play is local and shares one seed and one piece stream
([`docs/architecture/decisions.md`](docs/architecture/decisions.md) D4).

## Rules as implemented

Playfield 10×20 with 2 hidden spawn rows, 8-pixel cells, 15 levels, gravity 50
frames/row at level 1 down to 6 at level 15, soft drop 4 frames/row, DAS 16 frames
and auto-shift 6 frames, lock delay 0, spawn delay 1 frame, 30-frame clear freeze,
a 3-piece next queue, ghost projection and hold both on. Difficulty 1–4 scales
gravity by a table of our own design.

Every rule carries a tag in [`docs/game-design.md`](docs/game-design.md):
**[M]** measured from the reference, **[A]** assumed where measurement failed,
**[O]** original design where the reference exposes no behaviour at all. Score
exists in the rules layer but is hidden by default (Options → show score), because
the reference's scoring formula was never recovered.

## Save data

One `localStorage` entry, `orbitdrop.save.v1`, version 1 — records, options,
bindings and settings. Unlocked modes are *derived* from your clear counts, never
stored, so a hand-edited unlock cannot survive a reload. Writes are debounced by
500 ms; unreadable data is preserved under `orbitdrop.save.v1.corrupt` and a fresh
save starts; a file from a newer version is refused rather than downgraded.
**Options → Erase everything** offers a two-step confirm and can keep your records
while resetting settings.

## Layout

```
src/
  engine/       pure data, types, board, pieces, seeded random, config, key map
  gameplay/     session state machine, score, duel wrapper, save layer
  modes/        one plugin per mode + registry
  render/       framebuffer, procedural blocks, palette, 5×7 font
  audio/        WebAudio: one music loop + 17 synthesised effects
  ui/           scene machine (all screens), widgets, formatting, options
  app/          composition root, rAF loop, DOM input, canvas scaling
  tests/        unit tests (Vitest)
tests/e2e/      Playwright browser suite
docs/           architecture, game design, reverse-engineering findings, agent state
scripts/        licence gate and the reference-analysis helpers (dev-time only)
rom/            your own reference image, if you have one — gitignored
```

The rules layer imports no DOM, Canvas, WebAudio or `localStorage`; the renderer
never mutates game state. That is what keeps every mechanic testable in Node.

## Licence and provenance

This is an independent implementation. It ships no code, graphics, sound, font or
text from the game it was studied from, and no ROM file is tracked in git
(`rom/` is ignored). [`docs/asset-provenance.md`](docs/asset-provenance.md) records
how every asset was actually made, and `npm run report` fails the build if a
protected name reappears anywhere we author. The study itself was performed against
a legally obtained copy kept outside version control; the reference's own screenshots
live in an ignored folder and were never used as art.

## Documentation

| File | What it answers |
| --- | --- |
| [`docs/game-design.md`](docs/game-design.md) | the ruleset, rule by rule, with evidence tags |
| [`docs/architecture/`](docs/architecture/) | overview, interfaces, data, build, decisions |
| [`docs/reverse-engineering/`](docs/reverse-engineering/) | what was found in the reference, and what was not |
| [`docs/asset-provenance.md`](docs/asset-provenance.md) | asset licence record |
| [`docs/agent/MILESTONE-2026-11-08.md`](docs/agent/MILESTONE-2026-11-08.md) | the milestone report: what is done, what is not, and the test evidence |
| [`TODO.md`](TODO.md) | open work, ordered |
| [`CHANGELOG.md`](CHANGELOG.md) | commit-level history |
| [`docs/agent/PROJECT_STATE.md`](docs/agent/PROJECT_STATE.md) | working state for a resumed session |

## Status

Playable end to end: title → mode list → rules screen → run → results → high
scores, with no placeholder menus or dead buttons, in both input styles. The
known gaps are honest ones and are listed in [`TODO.md`](TODO.md) — chiefly that
the presentation layer is covered only by the browser suite, that menus are silent
(one music loop, and it plays only during a run), and that no score formula has
ever been verified against the reference.
