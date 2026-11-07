# Game state architecture

What the reference's state actually looks like from the outside. **No disassembly
was available in this environment**, so nothing here is a proven data structure:
this document records what was measured in bus memory, what it implies, and — as
importantly — the hypotheses that were tested and rejected, so the work is not
repeated.

Tags: [V] measured, [I] inferred from measurement, [R] rejected hypothesis.

## 1. Regions in use [V]

Measured by watching write traffic during boot → menu → play → pause → results:

| Address | Region | Role as far as measured |
| --- | --- | --- |
| `0x02000000`+ | EWRAM | main state arena; also `0x02000DF8..0x02001024` churns every frame while playing (tile/row staging for the field draw) [I] |
| `0x03000000`+ | IWRAM | small fast records: screen/mode identity, sound driver channel blocks |
| `0x04000130` | I/O | joypad register (active-low bits) |
| `0x05000000`+ | palette | BG palette 4 (`0x05000020`) carries the block colours during play |
| `0x06000000`+ | VRAM | field is drawn as background tiles |
| `0x0E000000` / mirror `0x02200000` | SRAM | battery save (settings + progress) |

Field rendering: the playfield is composed of 8×8 background tiles, which is why
row staging in EWRAM churns every frame even when nothing changes — a tile-map
write pass, not state. [I]

## 2. Screen / mode identity [V] → [I] interpretation

A byte at **`0x0300257B`** (IWRAM) changes only on screen transitions and stays
constant while a screen is idle. Observed values:

| Value | Screen where it was observed |
| --- | --- |
| 3 | title screen (waiting for start) |
| 6 | link-notice screen |
| 8 | options submenu |
| 12 | options screen |
| 13 | in play, paused, results |
| 16 | main menu |

Adjacent bytes `0x03002579` and `0x0300257A` also change during menu navigation.

Interpretation [I]: these are screen/menu identifiers of a state-machine, and 13
covering play + pause + results means those share one "in-session" state with a
sub-mode flag elsewhere. The mapping value→screen is *empirical*, not decoded.
The recreation has its own explicit scene enum (`src/gameplay/session.ts`) and
borrows nothing from this layout.

## 3. Audio driver records [V] → [I]

A block around `0x03002560..0x030025BB` (IWRAM) holds three similarly shaped
32-bit channel records with flag-like bytes (`0x5F00_8001`, `0x0F01_8002`,
`0xDF01_0004`) and pointers whose upper half is `0x80BF…` — i.e. BIOS-area
pointers. This is consistent with the platform's standard BIOS-driven sound
sequencer with three active channels. [I]

That is the extent of the audio analysis. See `audio-behavior.md`.

## 4. Board model — not located [V] for the negative result

The board should be findable: at a known state it holds exactly two lit cells
(the starting square piece at rows 0–1, columns 4–5) and the rest of the field is
empty. Signature searches over all of EWRAM were run with

* window widths of 10 (byte/board cell), 20 (16-bit/board cell) and 5
  (4-bit/board cell),
* patterns requiring exactly the cells 4 and 5 to be set in two stacked windows,
  all other cells zero,
* plus a value-diversity constraint (≥4 distinct values) to exclude the tile
  staging area,
* 117 000 candidate base offsets in the wide search, 20 000 in the narrow one.

**Result: zero matches** (in a second pass, only hits inside the
`0x02001210`-style staging/pointer area). Conclusion [V] for the negative:
the board cells are *not* stored as one byte/nibble/word per cell in a flat
10-wide array anywhere in the first 256 KiB of EWRAM, at least not in a state
snapshot readable through this bridge.

Likely explanations [I]: per-column arrays, a packed 32-bit row mask, board state
held in IWRAM/registers between frames and rebuilt for drawing, or a struct of
rows with per-row metadata (which the width-16 test would have missed for
non-16-bit strides).

## 5. A rejected "field model" — the 0x44000000 records [V] / [R]

32-bit value `0x44000000` occurs at ~70 EWRAM sites and ~46 IWRAM sites and
initially looked like a record tag. Two properties kill it as a playfield
signature:

1. It is present with byte-identical neighbourhoods on the title screen, in the
   main menu, in the options screen, in play and in the results screen.
2. The neighbourhoods are per-state-identical across states saved on *different*
   screens, and each 128-byte neighbourhood dump contains the same 8-byte
   `44 00 00 00 …` pattern repeated — i.e. it is a fixed allocator/handle tag or
   a vtable-ish constant, not a per-screen structure. [R]

## 6. The spawn-queue and piece-geometry block [V]

A region around `0x020225A4` (EWRAM) is unmistakably gameplay data and is the
strongest structural finding of this phase.

It contains a repeating **stride-0x20 record** (32 bytes) laid out as a 4×4
matrix of single bytes:

```
+0x00  08 00 00 00 00
+0x04  08 18 08 00
+0x08  00 08 08 18
+0x0C  00 08 00 00
+0x10  08 00 00 00 00
...
```

Those 4×4 matrices are the piece shape tables: each row is a 4-bit mask of a
piece row, and the set of matrices present matches the seven piece geometries
plus the empty row. Adjacent to them, small byte values change while the queue
advances, and the first four bytes after the geometry tables match the piece
sequence that was measured visually from the same savestate (square → line-piece
→ S → T …). [V] for the correlation, [I] for "this is the queue".

So: geometry tables are shared data (used by every mode) rather than
mode-specific code tables — evidence for the "shared engine + per-mode rules"
architecture that `docs/architecture/overview.md` adopts for the recreation. [I]

Board cells, goal counter, level counter and the session clock were **not**
identified. [U]

## 7. Determinism [V]

Two independent runs from the same savestate produced identical piece sequences
and identical stack geometry; a run from a different savestate produced a
different sequence. The generator is therefore seeded and the seed survives
save/load. No global frame-derived seed was located, and the RNG state was not
identified. [I] / [U]

This is the property the recreation reproduces deliberately and tests
(`src/tests/determinism.test.ts`).

## 8. Savestate format caution [V]

The emulator's savestate container is not a flat memory image: offsets inside the
file (e.g. `0x8A16`) are container-local and do **not** correspond to bus
addresses. Two early "duplicates at 0x8A16 and 0xB4B6" observations were
container artifacts. All measurements in this document were re-taken through the
live bus API (`tools/re/bridge.py`) for that reason.
