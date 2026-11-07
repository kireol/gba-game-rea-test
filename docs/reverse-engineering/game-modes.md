# Game modes

Structural inventory of what the reference game offers, established by navigating
its menus in the emulator and by reading the in-game rules screens. Text on those
screens is **paraphrased**, never transcribed.

## 1. Menu shell → mode entry [V]

```
boot → title ("press start") → main menu (5 rows, caption line under the list)
                                  │
                        row 1 ────┼──► mode list: SIX selectable entries,
                                  │    each with a rules screen shown on the right
                                  │
                        row 2 ────┼──► a second family (rules screens of its own)
                        row 3 ────┼──► difficulty setting, inline value 1 … ≥4 (persisted)
                        row 4 ────┼──► options submenu
                        row 5 ────┴──► versus entry → link-notice screen
```

* The mode list contains **six** single-player entries. [V]
* Selecting an entry shows a short rules screen; entering it starts play. [V]
* The difficulty setting row changes a persisted numeric setting (observed
  1 → 2 → 3 → 4) with a caption describing game difficulty. [V] It is a
  *setting*, not a mode. [V]
* The versus entry leads to a notice screen explaining that two units must be
  connected with the official link cable, each holding its own cartridge, and
  that play starts from Start. B does not dismiss it. [V] Its wording is not
  reproduced here. In the recreation this whole branch is replaced by local
  two-player play (see Divergences in `docs/architecture/decisions.md`).

## 2. What was read on the rules screens

### Entry 1 — the "reach the goal" family [V]

Paraphrase of the rules screen: clear lines to bring the goal count down; when
the goal reaches zero the level increases; clearing all fifteen levels wins.

Measured in play, level 1:

| Fact | Value | Tag |
| --- | --- | --- |
| Goal counter on HUD | `GOAL 5` | [V] |
| Goal counter at level 4 | `GOAL 20` | [V] |
| Levels to win | 15 (rules screen) | [V] |
| On-screen score | none exists | [V] |

`GOAL = 5 × level` fits both data points and is the rule the recreation ships,
labelled [I] until more levels are sampled.

### Entry 2 — the "blocks stick, dig down" family [V]

Paraphrase of the rules screen: blocks of the same colour adhere to each other;
the field starts filled with rows of inert garbage that must be cleared away to
reach the bottom row; the bottom row is made of special star blocks; clearing
that row raises the level; fifteen levels to win.

Corroborating screenshot evidence: that variant's field does start with grey
garbage rows and orange star-marked blocks on the bottom row, and its goal
counter reads 0 rather than 5 (the goal is expressed as depth, not lines). [V]

The exact adhesion behaviour, what happens to a stuck cluster when part of it is
cleared, garbage row count per level and star-block rules were **not** observed
→ `reverse-engineering-unknowns.md`. The recreation implements a documented,
self-consistent interpretation.

### Entries 3–6 [U]

Six entries were counted, but the navigation script could not reliably reach the
rules screens beyond the first two (see `menu-and-ui-analysis.md` § navigation
reliability). Their names, goals and win conditions are **not** established.
Any per-entry rules in the recreation are therefore original designs, declared as
such in `docs/game-design.md` rather than presented as findings.

## 3. Per-entry HUD evidence (weak, but real) [V]

While sampling HUD panels across screens, goal/level pairs were captured from
several entries before those screens were lost:

| Observed | Interpretation |
| --- | --- |
| `GOAL 5`, `LEVEL 1` | entry 1 at start |
| `GOAL 20`, `LEVEL 4` | entry 1 after three level-ups |
| `GOAL 0` with garbage field | entry 2 (depth goal) |
| `GOAL 80`, `GOAL 25` on two other entries | line or point goals for entries that could not be identified |

Those last two are single observations with no follow-up, so they are recorded
here only as targets to confirm. [U]

## 4. Session end [V]

Play ends in either

* a results screen showing `TIME`, `LINES`, `LEVEL` and a press-start prompt, or
* the same results screen after the field reaches the top (top-out). No separate
  game-over animation was visible; the transition is direct.

No score line appears on the results screen either. A timed variant's results
screen was observed with a partial clock only.

## 5. Multiplayer

* Requirement: two linked units, one cartridge each. [V]
* No in-game versus rules (opponent board, garbage, turn order) were reachable
  without a second unit, so versus rules are **not** documented. [U]
