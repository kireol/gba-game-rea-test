# Scoring and progression

## 1. There is no score display [V]

The in-play HUD has exactly three stat fields — `TIME`, `GOAL`, `LEVEL` — and the
results screen has `TIME`, `LINES`, `LEVEL`. **No score field exists anywhere on
screen** in the modes that could be entered (entry 1's family, entry 2's family,
the pause screen, the results screen). Verified by reading the HUD panel from
26 consecutive frames of one session and from every results screen reached.

Consequence for the recreation: the reference exposes *progress*, not points.
`docs/game-design.md` therefore keeps the same three stats as the primary
presentation, and adds an optional score only as a secondary, off-by-default
statistic (declared divergence).

## 2. Goal / level progression [V] + [I]

Verified pairs, entry 1's family:

| Level | `GOAL` |
| --- | --- |
| 1 | 5 |
| 4 | 20 |

`GOAL = 5 × level` matches both. [I] — the two points also fit a quadratic
through the origin, but 5×level is the natural reading and the shape the HUD
width can display.

Progression rules read from the rules screen (paraphrased) [V]:

* clearing lines reduces the goal count;
* when the goal count reaches zero the level increases (and a new, larger goal
  is set);
* reaching the end of the 15 levels wins the session.

Direct observations that support this:

* `LEVEL` was 1 and `GOAL` was 5 for a 24-piece session in which **no** row was
  ever completed → the goal does not advance on piece count or on time. [V]
* Level 4 with `GOAL 20` was reached in an earlier session, so the level does
  advance during play and the goal is re-set at each level. [V]

Not observed: the per-clear decrement (1 per line vs. per-row-with-bonus),
whether the level increases immediately on the final clear of a level, the
goal value at levels 2, 3, 5…15, and what happens after level 15 (the session
that reached the results screen had topped out, not won). [U]

## 3. Difficulty setting [V] / [U]

The main menu carries a difficulty row whose value was raised 1 → 2 → 3 → 4 and
persisted across boots. It is a setting, not a level counter, and it is not the
in-play `LEVEL`.

Its effect was not measured: no session was played at two settings with a
comparable board state. Gravity, garbage volume, or goal size per level are the
usual candidates. [U] → listed as a task in `reverse-engineering-unknowns.md`.

## 4. Time [V]

`TIME` advances in wall-clock seconds from session start (00:02 → 00:24 over a
run whose frame span was measured independently), so it is a session clock, not
a countdown, for entry 1's family. Whether other entries count down was not
established. [U]

## 5. High scores / saved data [V] / [U]

* Battery-backed SRAM is written during play (see `rom-overview.md` § Save media):
  a repeating `0x55 0x01 …` 8-byte structure starting at the save window plus a
  separate small block.
* The difficulty setting demonstrably survives a reboot, so settings live in that
  region. [V]
* Field-level decoding of the save region (per-mode tables, checksums) was not
  attempted. [U]

The recreation therefore does not attempt byte compatibility; it defines its own
localStorage schema in `docs/architecture/data.md`.

## 6. Scoring implemented by the recreation

Because the reference exposes no score, any score table is original design. The
recreation's table is documented in `docs/game-design.md` § Scoring and lives in
`src/gameplay/score.ts`; it is not presented as a finding anywhere.
