# Reverse-engineering unknowns

Everything the reference game does that this analysis did **not** establish, in
one place, with the method that would settle each one. Nothing here is presented
as a finding; the corresponding behaviour in the recreation is either a declared
divergence or a documented assumption (see `docs/game-design.md` §
Assumptions & divergences).

Priority order = how much the unknown affects the shipped game.

## 1. Core timing / handling (high impact)

| # | Unknown | What is known | How to settle |
| --- | --- | --- | --- |
| U1 | Gravity per level for levels 2…15 | level 1 = 50 frames/row [V]; levels 2+ never sampled | one session with `Down`-free play + goal cheats; sample 3 frames/level with `tools/re/fieldsig.py` |
| U2 | Exact DAS and ARR | bracket: DAS ≤ 16, ARR ≤ 6 frames | single-button holds of 1…20 frames, one experiment per length, count cells moved (`tools/re/exp.py hold:`) |
| U3 | Lock delay | none observed at 12-frame sampling | hard-drop onto a flat stack, sample every 2 frames; look for the frame where the piece locks vs. where it landed |
| U4 | Rotation kicks | no kick at left wall, right wall, floor in tested cases | walk every piece against both walls on the floor and one row up; 7 pieces × 4 states × 2 walls |
| U5 | Line-piece spawn columns in vertical state | horizontal spans columns 3–6 [V] | rotate the line piece at spawn, screenshot, read columns |
| U6 | Whether soft drop resets gravity | not tested | measure fall period with `Down` released mid-fall |
| U7 | `Select` button function | moved the piece down exactly 1 row in one tested state | re-test in three modes and on the floor; could be a variant action |
| U8 | `L` button | no observable effect in tested states | same |
| U9 | Hold: one-per-piece rule, panel position, whether the swapped-out piece is stored | `R` makes the active piece vanish and a fresh one spawn; stack unchanged; a hold panel appears in the side panel | full-field screenshots (x ≥ 166) before/after one and two presses of `R` on the same piece |
| U10 | Hold panel geometry | inside the side panel (x ≥ 166), never measured | crop the side panel instead of the field (`--crop 166,0,154,160`) |
| U11 | New-piece spawn rule after a lock (delay, "next piece visible before lock") | new piece on screen ≤ 21 frames after lock | sample at 2-frame resolution around a lock |

## 2. Line clearing, goal, progression (high impact)

| # | Unknown | What is known | How to settle |
| --- | --- | --- | --- |
| U12 | **Goal decrement per clear** — 1 per line, per-row, or with a multi-line bonus | never observed: the one long stacking run completed **zero** rows | clear exactly 1 row, screenshot `GOAL`; then clear 2, 3, 4 rows from a fresh savestate |
| U13 | Goal value at levels 2, 3, 5…15 | level 1 → 5, level 4 → 20; `GOAL = 5 × level` fits both | read `GOAL` at each level in one session (level-up fast with goal writes once the counter is found) |
| U14 | Does a multi-line clear that overshoots the goal carry over? | unobserved | clear 4 when `GOAL` is 2 |
| U15 | Level-up side effects (field changes, speed, goal reset value, any message) | goal is re-set larger at the new level | observe the 2 frames around a level-up |
| U16 | What happens after level 15 (win) | rules screen says clearing all 15 levels wins; the only results screen reached followed a top-out | reach level 15's goal, then screenshot the results screen |
| U17 | Line-clear animation length | shorter than the sampling interval | 2-frame sampling during a single clear |
| U18 | Any special announcement/sound for 4 lines | none seen for the tested cases | same as U17 |
| U19 | Difficulty setting's effect (gravity? garbage? goal size?) | setting exists, range at least 1…4, persisted; never compared across settings | play the identical seeded sequence at setting 1 and 4 and diff the HUD readings |
| U20 | Session clock behaviour in the timed-looking entries | entry 1's family counts up in seconds | read the counter in the other entries at t and t+30 s |

## 3. Modes (high impact — the project must not ship only one mode)

| # | Unknown | What is known | How to settle |
| --- | --- | --- | --- |
| U21 | **Identity and rules of mode-list entries 3–6** | six entries exist; entry 1 = goal/level family, entry 2 = sticky-blocks/garbage family; two other entries showed `GOAL 80` and `GOAL 25` once | fix menu navigation (U26), then read each rules screen and play each entry for ~30 s |
| U22 | Adhesion rule of the sticky-blocks mode | rules screen says same-colour blocks adhere; observed field: grey garbage rows, orange star blocks on the bottom row, `GOAL 0` | place two same-colour pieces adjacent, clear a row through one of them, watch what happens to the cluster |
| U23 | Star-block rule | bottom row is made of star blocks; clearing that row raises the level | reach the bottom row (needs garbage clearing) and clear one star cell |
| U24 | Garbage row count and pattern per level | "starts filled with rows of inert garbage" | measure row count at level 1 vs level 2 from screenshots |
| U25 | Whether `GOAL 80` / `GOAL 25` belong to two specific entries | single unverified observations each | revisit with U21 |
| U26 | **Menu navigation reliability** | scripted `A` presses from a saved title/menu state repeatedly failed to open the mode list (`tap:A:3:8`, `tap:A:7:12` from `/tmp/menu.ss`); manual navigation worked | the bridge serves one RPC per frame — the menu may need a longer hold or a release edge; try `hold:A:12` then `tap:A:5:20`, and verify with the screen-id byte `0x0300257B` instead of a screenshot |
| U27 | Versus rules (opponent board, garbage, scoring) | requires two linked units, one cartridge each; unreachable here | two emulator instances with a link cable, or accept as out of scope (the recreation ships a documented local-divergence two-player mode) |

## 4. Data / persistence (medium impact)

| # | Unknown | What is known | How to settle |
| --- | --- | --- | --- |
| U28 | Board model location/layout | **not found**: 117 000 candidate bases scanned in EWRAM at widths 10/20/5 with diversity constraints → zero matches | disassembly; or a write-breakpoint on a cell that visibly changes (needs a debugger with breakpoints — `gearboy` MCP is available and supports them, see § Tools) |
| U29 | Goal / level / clock field addresses | stat digits were found only in the tile-staging mirror at `0x02001210`; poking them changed nothing | same; or memory-search for a value that increments once per second (`TIME`) |
| U30 | Randomizer algorithm and seed handling | seeded and stable across save/load [I]; observed prefixes are consistent with several schemes | collect ≥200-piece sequence from a savestate-anchored run and test bag/weighted hypotheses statistically |
| U31 | SRAM save layout, checksums, per-mode tables | only the first 0x50 bytes of write traffic recorded (`0x55 0x01 …` 8-byte repetition, plus `0x01`/`0x00` flags and a small second block) | play a session, dump 0x0E000000..+0x8000 before/after, diff |
| U32 | Piece-geometry table full contents | stride-0x20 records at `0x020225A4` holding 4×4 bit-row matrices, matching the seven shapes plus an empty row | dump the full block and match against the seven shapes' four rotation states — this would give the rotation style for free (see `game-state-architecture.md` § 6) |
| U33 | Screen-id byte semantics (`0x0300257B`) | values 3, 6, 8, 12, 13, 16 mapped empirically to screens; 13 covers play + pause + results | walk menus while logging the byte with `tools/re/drive.py` |
| U34 | Options screen values (rows `WORLD`, `NEXT PIECE:`, `GHOST PIECE:`, `HOLD:`) | row labels visible; their values are drawn off-screen right (x > 160) and were never read | crop x = 160..240 on the options screen, or read `0x03002579/7A` (menu state bytes) while toggling each row |

## 5. Presentation / audio (low impact)

| # | Unknown | Notes |
| --- | --- | --- |
| U35 | Music track count and mode-specific music | out of scope by law for content; only "how many channels / when it switches" would be legitimate, and it needs audio capture |
| U36 | Which events have sound effects | never verified — no audio capture available |
| U37 | Line-clear animation frame count (see U17) | also presentation |
| U38 | Level-up / victory presentation | unobserved |
| U39 | Exact pause-menu → results-screen behaviour after `QUIT GAME` | `QUIT GAME` was reached but its destination was not recorded |

## 6. Dead ends, recorded so they are not repeated

* **`0x44000000` as a record tag** — present with identical neighbourhoods on
  every screen; it is a generic tag, not a field marker. Rejected.
* **Poking the tile mirror at `0x02001210`** — writing `0x30..0x39` into the
  seven digit tiles of the `GOAL` field changed nothing on screen and nothing
  else in RAM afterwards: the mirror is a render output, not state. See
  `menu-and-ui-analysis.md` § 6.
* **Savestate container offsets as bus addresses** — `0x8A16` / `0xB4B6`
  "duplicates" were container artifacts. Use the live bus API only.
* **RAM byte-diff hunts keyed on EWRAM `0x02000DF8..0x02001024`** — that window
  churns every frame during play; value-change searches there return noise.
* **Searching for the board with a two-lit-cell signature** — 117 000 bases
  examined, zero matches (U28). The signature itself was validated on the drawn
  field, not on memory, so a layout that is not flat-byte-per-cell is still
  possible; a write breakpoint would settle it instantly.

## 7. Tools that were unavailable, and what unlocks with them

No disassembler or decompiler was installed in this environment (checked:
Ghidra, rizin, radare2, Hopper, objdump-with-arm — none usable), so there are
**zero** code-level findings anywhere in this repository. This is the single
biggest limitation of the whole analysis.

The session also has a `gearboy` emulator MCP available, which the analysis did
not use. It offers exactly the two missing primitives:

* execution/read/write **breakpoints** and single-stepping (would settle U28,
  U29, U30, U32 in one pass),
* memory bookmarks/watches, a trace log and a profiler, plus symbol loading.

Recommended next RE step if deeper fidelity is wanted: load the ROM there, set a
write breakpoint on the VRAM tile row that carries the bottom field row, and read
the backtrace to the board model. Everything in § 1–§ 4 is a menu of things that
breakpoint would resolve.
