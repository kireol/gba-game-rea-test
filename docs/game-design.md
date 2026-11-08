# Game design

What Orbit Drop is, rule by rule. Every rule carries where it came from:

| Tag | Meaning |
| --- | --- |
| **[M]** | **M**easured in the reference — see the cited `docs/reverse-engineering/` file |
| **[A]** | **A**ssumption: measured data is missing or ambiguous, we extrapolated and say so |
| **[O]** | **O**riginal design: the reference does not expose this, so it is ours |
| **[D]** | **D**ivergence: deliberately different, with the reason |

Nothing tagged [O] or [A] is presented anywhere as a finding about the reference.

## 1. Board and pieces

* 10 columns × 20 visible rows, plus 2 hidden rows above the field for spawning. [M]
  `gameplay-mechanics.md` § 1
* Cell = 8 logical pixels; playfield 80×160 within a 240×160 logical framebuffer;
  HUD panel to the right of the field. [M] (layout proportions), [O] (exact pixel
  placement — ours)
* Seven pieces, box left at column **3** for the 3-wide and the line piece, the
  square at columns **4–5**. [M] `gameplay-mechanics.md` § 2
* Rotation **in place about the piece's own square box**, 4 states, **no wall
  kicks** (rotation against a wall or the floor either succeeds or is rejected).
  [M] § 3 — the measured vertical line piece landing on the box's right-hand
  column matches a plain matrix rotation of a 4×4 box, which is what
  `src/engine/pieces.ts` implements.
* Rotation buttons are two separate keys (clockwise / counter-clockwise). [M]
* Ghost piece on by default, three-piece next queue, hold available. [M] § 7

## 2. Handling and timings

Values live in `src/engine/config.ts`, in frames at 60 Hz.

| Rule | Value | Tag | Basis |
| --- | --- | --- | --- |
| Gravity, level 1 | **50 frames/row** | [M] | bracketed 48–52 by 9 samples |
| Gravity, levels 2–15 | `50 − 4·(level−1)`, floor 6 → `50 46 42 38 34 30 26 22 19* 16 14 12 10 8 6` | [A] | never sampled (U1); a smooth curve that keeps level 1 at the measured value. `*` the level-8 value is interpolated so no step exceeds 4 frames |
| Soft drop | **4 frames/cell** | [M]/[A] | measured ≈4.4; rounded to 4 (inside the sampling error) |
| Hard drop | instant, locks in the same frame | [M] | |
| DAS | **16 frames** | [A] | measured bracket DAS ≤ 16; shipped at the top of the bracket |
| ARR | **6 frames** | [A] | measured bracket ARR ≤ 6; same reason |
| Lock delay | **0 frames** | [A] | none observed at 12-frame resolution (U3); the classic "spin to lock" window is therefore absent |
| New piece after lock | **1 frame** | [M] | observed ≤ 21 frames |
| Line-clear freeze | 30 frames, stack flashes | [O] | animation length shorter than the measurement interval (U17) |
| Randomiser | seeded **7-bag** | [O] | reference is seeded [M] but its algorithm is unknown (U30) |
| Hold | one swap per piece, swap-back allowed | [A] | hold exists [M]; the one-per-piece rule was not verified (U9) |

Difficulty setting (persisted, values 1…4 like the reference's row): a speed
multiplier on gravity — ×1.25 / ×1.00 / ×0.85 / ×0.70, default **2**. The
reference's setting is [M]; its *effect* is unmeasured (U19), so the multiplier
table is [O].

## 3. Stats and the score question

The reference shows `TIME`, `GOAL`, `LEVEL` while playing and `TIME`, `LINES`,
`LEVEL` on the results screen — and **no score anywhere**. [M]
`scoring-and-progression.md` § 1

Orbit Drop keeps exactly those fields. `GOAL` is re-labelled per mode (e.g.
`TIME LEFT`, `LINES LEFT`) because what the counter means is mode-specific.

Score exists as an **opt-in** field (`assist.showScore`, default **off**) so that
high scores can be compared and persisted; the results screen and HUD reveal it
only when enabled. [D] — reason: D5 in `docs/architecture/decisions.md`.

Score table [O] (all values ours; `src/gameplay/score.ts`):

| Event | Points |
| --- | --- |
| 1 / 2 / 3 / 4 rows | 100 / 300 / 500 / 800, × level |
| Perfect clear (board empty after a clear) | +1000 × level |
| Combo (consecutive clearing pieces) | +50 × combo index × level, cap 10 |
| Soft drop | +1 per cell |
| Hard drop | +2 per cell |

`TIME` counts up in seconds from session start. [M] for the goal-ladder family;
the timed modes reuse the same counter and display the remaining time instead. [O]

## 4. Modes

Internal identifiers describe the mechanic; the player-facing labels below are
ours. Six single-player entries plus local two-player, mirroring the reference's
six-entry list and its versus entry. [M] structure, [O] identities
(the reference's entries 3–6 were never reachable — U21/U26).

| Label | Internal id | Goal / end condition | Origin |
| --- | --- | --- | --- |
| **ASCENT** | `goal-ladder` | Clear `5 × level` lines per level; 15 levels; the goal counter counts down. Top-out loses. | [M] rules screen paraphrase + `GOAL 5`@L1, `GOAL 20`@L4; the −1-per-line decrement is [A] (U12), the level table [A] (U13) |
| **FUSION** | `linked-blocks` | Field starts with garbage rows and a bottom row of **star blocks**; dig down to the star row — clearing a row containing star blocks raises the level; 15 levels. Same-colour locked blocks adhere. | [M] rules screen + garbage/star field + `GOAL 0`; adhesion, cluster behaviour, garbage counts and star rules are our self-consistent interpretation (U22–U24) [A]/[O] |
| **RUSH** | `timed-goal` | Reach a line quota (30 lines) before a 150 s clock runs out; clock ends the session. | [O] inspired by the observed `TIME`/`LINES` stats |
| **DASH** | `fixed-lines-race` | Clear 40 lines as fast as possible; level rises every 10 lines; result is the time. | [O] |
| **BLITZ** | `timed-max-lines` | 90 seconds; clear as many lines as possible; garbage rises every 12 s. | [O] |
| **ENDLESS** | `rising-garbage` | No level cap; garbage arrives on a shrinking timer; survive for as long as possible. | [O] |
| **DUEL** | `local-versus` | Two boards, split keyboard; clears send garbage to the opponent (4 rows for 4 lines); last board not topped out wins. | [D] the reference needs two linked units (U27); D4 in `decisions.md` |

### Special blocks

| Block | Where | Behaviour | Tag |
| --- | --- | --- | --- |
| Garbage | FUSION start rows, BLITZ/ENDLESS/DUEL attacks | Full row with one hole, no colour; cleared by any row completion. Rises from the bottom, pushing the stack up. | [M] garbage rows exist in FUSION; hole count/placement [O] |
| Star block | FUSION bottom row per level | Counts as a normal filled cell for line completion; when a row containing one clears, the level rises. | [M] existence + level-up on that row (rules screen); other interactions [O] |
| Linked cluster | FUSION | Locked cells of the same piece identity that touch orthogonally form a cluster; when a row clears, clusters that touch the cleared row are removed with it. | [A]/[O] — the reference says same-colour blocks adhere; the cluster rule is our interpretation (U22) |

### Mode rules are modules

`src/modes/<id>.ts` exports a `ModePlugin` (goal rule, HUD meaning, gravity
override, special blocks, end condition). `src/modes/registry.ts` lists them;
`src/gameplay/session.ts` holds the shared mechanics. Required by the brief and by
D3.

## 5. Menus, options, controls

* Title → main menu (5 rows with a caption line, mirroring the reference's
  structure) → mode list → rules screen → play → pause → results. [M] structure,
  [O] text
* Options: ghost piece, hold, next-queue length (1–5, default 3), show score,
  difficulty, screen shake, master/music/SFX volume, mute. The reference has
  ghost/hold/next-piece option rows [M]; the value sets are ours [O].
* Pause: resume / options / restart / quit. [M] three-row pause; [O] its items
* Results: mode, `TIME`, `LINES`, `LEVEL` (+ `SCORE` when enabled), the run's
  seed for reproducibility, best-per-mode line. [M] the three stats; [O] seed/best
* Controls: fully rebindable keys (12 actions, conflict detection) plus mouse —
  click = rotate clockwise, right-click = counter-clockwise, wheel = soft/hard
  drop, click anywhere = pause. Menus are keyboard *and* mouse.
* Fullscreen toggle, integer-scaled responsive canvas, `16:10` aspect preserved
  with letterboxing.
* Persistence: settings, bindings, audio, unlocks, per-mode best runs.
  **Reset progress** requires two explicit confirms. No reference save format is
  read or written [D].

## 6. What we did not recreate

Declared absences rather than silent ones: the reference's exact mode roster
(entries 3–6, U21), its link-cable versus rules (U27), its music/sound content
(out of scope by law — only its audio *behaviour*, `audio-behavior.md`), its
artwork, fonts, wordmarks and title, its save format, its per-level gravity table,
and any lock-delay / kick behaviour it may have had but did not show.
