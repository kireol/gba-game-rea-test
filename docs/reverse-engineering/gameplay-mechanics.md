# Gameplay mechanics

All timing values are in emulator frames at the reference's native refresh rate
(60 fps class). "Cell" = one board square. Tags: [V] verified measurement,
[I] inferred, [U] unverified.

## 1. Board geometry [V]

* Playfield is **10 columns × 20 visible rows**.
  Measured from the field's drawn extent: the playfield strip spans x = 79…158
  and y = 0…159 on the 240×160 framebuffer, with an 8×8 pixel cell
  → 80/8 = 10 columns, 160/8 = 20 rows.
* One additional **hidden row above the visible field** is used for spawning: a
  piece's 3×3 (or 4-wide) bounding box enters with its top row at board row −1,
  i.e. one row above the top visible row. Observed directly: pieces appear
  partially clipped at the top and drop fully into view.
* The bottom of row 19 is the floor; pieces rest on it.
* Left wall = column 0, right wall = column 9. The drawn field frame matches the
  10-column width, so there is no hidden side buffer column visible to the player.
* Rendering: the field is drawn as background tiles; a full-width 160-row band is
  the field, with the HUD occupying the right-hand panel (x ≥ ~166).

## 2. Pieces, spawn position [V]

Seven pieces, identified by shape and (in the reference's own rendering) colour —
the colour↔shape agreement across many samples makes the identification
unambiguous. Colours recorded here are observations of the reference, **not** a
palette to copy; the recreation uses an independent palette.

| Piece | Shape | Spawn columns (top-left of box) | Notes |
| --- | --- | --- | --- |
| I | 1×4 line | box starts at column 3 (occupies 3,4,5,6 horizontal) | same x in both orientations |
| O | 2×2 square | columns 4,5 | |
| T | T | columns 3,4,5 of its 3-wide box | |
| S | S | 3-wide box, columns 3…5 | |
| Z | Z | 3-wide box, columns 3…5 | |
| J | J | 3-wide box, columns 3…5 | |
| L | L | 3-wide box, columns 3…5 | |

* The horizontal 3-wide pieces all spawn with the **same left column** (box left
  edge at column 3), i.e. the piece group is left-aligned to a fixed box rather
  than centred per-shape. [V]
* The square spawns one column to the right of the 3-wide box (columns 4–5). [V]
* Vertical orientations keep the same box x, so a rotated piece does not shift
  horizontally on spawn. [V]

## 3. Rotation [V]

* Rotation is **in place about the centre of the piece's bounding box** for the
  3-wide/3-tall pieces: the 3×3 box keeps its (x, y) and the filled offsets
  permute inside it.
* **A = clockwise**, **B = counter-clockwise**. Determined by shape tracking
  across single presses from a known orientation.
* The 1×4 piece rotates between horizontal and vertical **without changing its
  box x**; observed with the box left edge fixed at column 3, so the horizontal
  form occupies columns 3–6 and the vertical form occupies column 6 in the
  tested case. [V] for the tested orientation pair; the full 4-state cycle for
  the line piece was not individually walked through at every column.
* **No wall kick was observed** in the tested cases (rotations against the left
  wall, right wall and on the floor either succeeded in place or were rejected).
  Whether a kick table exists for other cases is [U].
* 180° rotation: no button produced one (see § 6). [V] for the tested mapping.

## 4. Movement and gravity [V]

| Action | Measured | Tag |
| --- | --- | --- |
| Gravity, level 1 | 1 cell per **50 frames** (≈1.20 s) | [V] |
| Soft drop (`Down` held) | ≈ **4.4 frames/cell** | [V] |
| Hard drop (`Up`) | instant: piece disappears from the air and lands in the same sampled frame | [V] |
| Left/right shift | 1 cell per press | [V] |
| DAS (initial auto-shift delay) | holding Left for **18 frames** produced a **3-cell** shift ⇒ DAS ≤ 16 frames and ARR ≤ ~6 frames | [V] bracket, [U] exact |
| Lock delay | hard-dropped pieces were already resting on the stack in the next sampled frame (12 frames later); no floating "spin to lock" window was observed | [V] coarse |

Gravity bracketing method: nine screenshots spaced 30 frames apart, each
classified by cell colour; the first frame in which the piece's rows had moved
bounded the period to 48…52 frames, best fit 50.

Gravity for levels 2…15 was never sampled (see unknowns). [U]

## 5. Line clearing [V] / [I]

* Clearing a fully occupied row removes it and drops the stack above by that many
  rows (observed during stacking runs; the exact animation timing was not
  captured — the sampling interval was coarser than the animation). [U] for frames
* Clear counts feed `LINES` on the results screen. [V]
* The in-play `GOAL` counter is line-based in entry 1's family. [V] for the
  counter's existence, [I] for the −1-per-line decrement: a 24-piece stacking run
  produced **zero** completed rows, so `GOAL` correctly stayed at 5 and never
  demonstrated a decrement. Directly observing the decrement is an open task.
* Multi-row clears: the reference announces nothing on screen in the tested cases
  (no text popup was seen). Whether a different sound/animation plays for 4 rows
  is [U].

## 6. Control mapping (reference) [V]

Established by single presses and by frame-stamped screenshots:

| Button | Effect |
| --- | --- |
| Left / Right | move one cell |
| Down | soft drop (≈4.4 frames/cell) |
| **Up** | **hard drop** |
| A | rotate clockwise |
| B | rotate counter-clockwise |
| **R** | hold: the active piece vanishes, the stack is unchanged, and a fresh piece spawns (a hold panel appears on the side panel) |
| **Select** | moved the piece down exactly one row in the tested state; its intended function is **not established** (possibly a variant-specific action) |
| L | no observable effect in the tested states |
| Start | pause: `RESUME GAME` / `SOUND` / `QUIT GAME`, caption `RESUME PLAYING` |

`R` = hold is [V] for "active piece disappears, nothing added to the stack, new
piece arrives"; the *contents and position of the hold panel* and the
one-hold-per-piece rule are [U] (see unknowns).

## 7. Ghost piece, queue, hold [V] / [U]

* **Ghost piece is ON by default** in entry 1's family: an outlined projection of
  the landing position appears below the falling piece (visible in the field
  grids as the unfilled outline at the floor). [V]
* The **next queue holds three pieces**, drawn in the right-hand panel at x ≥ 166,
  i.e. outside the playfield. [V]
* A new piece is on screen within ~21 frames of a lock. [V]
* The hold panel's exact position/size was not measured (it sits in the side
  panel region that the field classifier excluded). [U]

## 8. Randomization [I]

Two independent savestate-anchored runs from the same state produced the same
piece sequence (yellow O → orange L → green S → purple T), while a run from a
differently-saved state produced a different sequence. So the generator is a
**seeded PRNG**, and the seed is stable across save/load. [I]

The algorithm (7-bag vs. flat random, preview shuffling) is **not** determined:
the short observed prefixes are consistent with several schemes. [U]
