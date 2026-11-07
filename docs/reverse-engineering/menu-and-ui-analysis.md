# Menu and UI analysis

Layout and flow of every screen this analysis could reach, plus the reliability
limits of the automated navigation. Screen text is described, not transcribed,
and the reference product's wordmarks are never reproduced.

Screens were identified two ways, cross-checked against each other: the screenshot
montages in `docs/reverse-engineering/screenshots/` (gitignored — they contain the
reference's art and wordmarks and exist only as behaviour documentation), and the
menu/screen identity byte `0x0300257B` (`game-state-architecture.md` § 2), which
was often the only reliable oracle when screenshots came back blank (§ 7).

## 1. Screen flow [V]

```
power on
  └─ boot/title screen ──────────── "press start" prompt
       └─ main menu (5 rows + caption line under the list)
            ├─ row 1 ──► mode list (SIX selectable entries)
            │              └─ each entry: rules text panel, then start → play
            ├─ row 2 ──► a second play family (own rules screens)
            ├─ row 3 ──► inline numeric setting (difficulty), value 1…≥4, persisted,
            │            caption describes game difficulty
            ├─ row 4 ──► options submenu (6 rows, § 3)
            └─ row 5 ──► versus entry → full-screen link-cable notice (§ 4)

play ── Start ──► pause overlay (3 rows + caption)
                    ├─ resume → play
                    ├─ sound  → same row group as the options screen
                    └─ quit   → left the session (§ 6: destination not recorded)

play ──► goal reached / field reached the top ──► results screen
                                                 TIME, LINES, LEVEL + press-start
```

## 2. Main menu [V]

* Five rows, left-aligned in the right half of the screen; the left half is the
  attract artwork (which belongs to the reference and is not described further).
* The highlighted row is marked by a `*` immediately to its left; the marker moves
  with Up/Down.
* A caption line sits under the list and **changes with the highlighted row** — it
  describes the selected row. Two captions were legible within the crop: one that
  begins like "endurance gam…" for the first row and one like "game di…" for the
  third. [V] for "a per-row caption exists and changes", partial-legibility for
  the words.
* Row 3 is a setting, not a screen: pressing Right/Up/Down on it changes a number
  in place (observed 1 → 2 → 3 → 4) and that number survived a reboot. [V]
* Row 5 does not start a game: it shows the notice screen below. [V]

## 3. Options screen [V]

Reached from main-menu row 4. Six rows, same `*` marker, with its own caption line
beginning "change sound opt…" while the first row is selected:

```
* SOUND
  WORLD:
  NEXT PIECE:
  GHOST PIECE:
  HOLD:
  GAME CREDITS
```

* The last row is an entry (credits screen), the other rows are settings — three
  of them end with a colon, i.e. they display a value. [V] for the row labels.
* **The values themselves are drawn to the right of x = 160** and every
  measurement crop ended at x = 159, so no value was ever read. [U] →
  `reverse-engineering-unknowns.md` U34.
* Practical consequence for the recreation: `GHOST PIECE` and `HOLD` are options
  in the reference, which is direct evidence that both are *optional features* of
  the engine rather than hard-wired rules. The recreation exposes both as toggles
  (`src/ui/options.ts`), plus the next-queue size.

## 4. Link / versus notice screen [V]

A full-screen notice explaining, in substance: two units must be connected with
the manufacturer's link cable, and each player needs their own copy of the game;
Start begins the link flow. Observed facts only:

* Up/Down/Left/Right/A have no visible effect on it. [V]
* **B does not dismiss it**; only Start advanced (to a "waiting" screen). [V]
* A second screenshot taken after a longer wait shows the same screen unchanged
  (no timeout, no animation state change captured). [V]
* The wording is deliberately not reproduced here (licence: it is the
  reference's copy and its wording is not needed for a recreation).

The recreation replaces this branch entirely with local two-player play — see
Divergences in `docs/architecture/decisions.md`.

## 5. Play HUD [V]

Screen is 240×160. Field occupies x = 79…158, y = 0…159 (10×20 cells of 8×8). The
HUD is the panel right of the field, x ≥ ~166 (≈74 px wide), stacked as:

```
+----------------+
| TIME  00:02    |   top box, mm:ss, counts up
| GOAL  |  LEVEL |   two half-width boxes side by side
+----------------+
| (next queue —   |   three pieces, ~2 rows apart, first at y≈122
|  3 slots)       |
| (hold panel)    |   present when hold is used; exact box not measured (U10)
+----------------+
```

* The field is *flush with the top of the screen* — there is no title bar or
  border above row 0, and the first field row is partially clipped while a piece
  spawns. [V]
* `GOAL` and `LEVEL` are single-digit-ish numeric fields with labels above the
  value; `TIME` is a wider field with the label centred above it.
* Digits are rendered with the reference's own chunky bitmap font (see
  `docs/asset-provenance.md`: the recreation draws its own 5×7 font and does not
  trace this one).

## 6. Stat fields are draw output, not state [V]

Digit glyphs for the visible `GOAL` value appear as a tile-map mirror in EWRAM
around `0x02001210` (`40 42 44 00 26 05 00 00 …`), i.e. the HUD's rendered tile
codes are visible in memory.

Writing the ASCII codes `0x30`–`0x39` over the seven digit tiles of the `GOAL`
field produced **no on-screen change and no subsequent memory change** — the
mirror is overwritten every frame from the real (unlocated) counter. Rejected
conclusion: this area is *not* usable as the stat field, and the numeric HUD
cannot be edited there. [V]

## 7. Navigation reliability (important limitation) [V]

Automated menu navigation was **not** dependable:

* `press_buttons(["A"], hold=3, release=8)` and `hold=7, release=12`, issued from
  a saved main-menu state, repeatedly left the screen unchanged, while the same
  state navigated correctly under manual input.
* Several `advance(n)` bursts returned a **black** screenshot — the emulator's
  renderer had no framebuffer for that call — which removed visual confirmation
  for many steps (this is what made the identity byte necessary).
* Cause candidates: the bridge services exactly one request per emulated frame, so
  a `press`/`advance` pair can be separated by an unknown number of frames, and
  the menu may require a longer hold or a clean release edge than the RPC latency
  allows.

Consequences: mode-list entries 3–6 could not be opened reliably, so their rules
are undocumented (`game-modes.md` § 2, unknowns U21/U26). The fix is known —
drive menu steps with `hold:` instead of `tap:` and verify against `0x0300257B`
instead of a screenshot.

The recreation does not inherit any of this: its menus are a pure state machine
with explicit transitions, keyboard and mouse, and unit tests
(`src/tests/menus.test.ts`).
