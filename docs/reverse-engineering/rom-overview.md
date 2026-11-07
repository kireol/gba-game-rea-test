# ROM overview

Analysis of the reference ROM supplied in `rom/`. All statements below are tagged:

| Tag | Meaning |
| --- | --- |
| **[V]** | Verified by direct measurement (emulator, memory reads, screenshots, or file bytes) |
| **[I]** | Inferred from verified evidence; interpretation not proven |
| **[U]** | Unverified / assumption, carried into `reverse-engineering-unknowns.md` |

## 1. Artifact [V]

| Property | Value |
| --- | --- |
| File | `rom/…gba` (path only, as an identifier; see § Legal handling) |
| Size | 4 194 304 bytes (4 MiB) |
| SHA-256 | `87a857dee5dfb5d48c706abbc103fa148461abc58833c8336cf11f21bcf5ed2a` |
| CRC-32 | `7b729804` |
| Byte entropy | 5.576 bits/byte → mixed code/data with partially compressed payloads |
| Header checksum | stored `0xFB` at `0x0BD`, recomputes to `0xFB` → header intact |
| Region | release for the western market; the emulator reports a colour-capable cartridge with battery-backed save |

Header field map (file offset == logical offset, since the ROM is mapped at `0x08000000`):

```
0x0000..0x001F   vector table (reset / undef / SWI / prefetch / data abort / reserved / IRQ / FIQ)
0x0004..0x009B   console-entry logo region  (bytes deliberately never printed or copied)
0x00A0..0x00AB   cartridge title field      (12 bytes; content not reproduced)
0x00AC..0x00AF   game code  "ATWE"
0x00B0..0x00B1   maker code field
0x00B2 = 0x96, 0x00B3 = 0x00                fixed marker bytes
0x00B4..0x00BB   unit / area / region bytes, all 0x00 in this image
0x00BD           header checksum (validated)
```

Tool used: `tools/re/rom_header.py <rom>` (metadata only — it never emits the logo
region and never decodes graphics, tile, font or sound payloads).

## 2. Platform and address map [V]

The reference is a 32-bit ARM handheld title (the vector table layout and the
BIOS-call vector at `0x0008` are the portable identifiers). Emulator-reported
memory regions, used throughout these documents:

| Region | Bus range | Notes measured here |
| --- | --- | --- |
| ROM | `0x08000000` + 4 MiB | read-only program + data |
| EWRAM | `0x02000000` + 256 KiB | main game state arena; also holds tile staging |
| IWRAM | `0x03000000` + 32 KiB | fast state: mode/screen ids, sound driver records |
| I/O | `0x04000000` | joypad `0x04000130`, interrupts, timers, DMA |
| Palette | `0x05000000` + 1 KiB | 512 entries; `0x05000020` = BG palette 4 in use during play |
| VRAM | `0x06000000` + 96 KiB | BG tiles + map |
| OAM | `0x07000000` + 1 KiB | sprites |
| SRAM | `0x0E000000` (+ alias `0x02200000`) | battery-backed save, see below |

### Save media [V]

During a short session the emulator recorded writes to SRAM:

```
0x02200000..0x0220003F   0x55 0x01 0x00 0x00 (pattern repeated per 8-byte group)
0x02200040               0x01
0x02200048               0x00
0x0E000000..0x0E000002   0x00
```

`0x02200000` is the SRAM mirror window, so this is real save traffic. The
`0x55 0x01 …` 8-byte repetition and the separate `0x0E000000` block suggest one
structure for settings/progression plus a second small block (high-score table or
checksum/counter). The layout itself is **not** decoded → [U].
The game also visibly persists the difficulty setting between boots, which is
consistent with this save region.

## 3. How this analysis was performed

1. **Emulator driving.** mGBA with a Lua JSON-RPC bridge (`tools/re/bridge.py`,
   `scripts/start-mgba.sh`, `scripts/load-bridge.sh`). One RPC request is served
   per emulated frame, so a burst of requests is itself a clock. The bridge does
   not implement pause/frame-step, so every measurement is time-based:
   savestate → act → observe, using the frame counter as the clock
   (`tools/re/exp.py`).
2. **Vision measurement.** Screenshots were classified per 8×8 cell by hue
   (`tools/re/fieldsig.py`) instead of being eyeballed, which is how gravity,
   spawn columns, rotation and the HUD numbers were measured.
   `tools/re/fgrid.py` / `tools/re/montage.py` produce the contact sheets used
   for the layout notes.
3. **Memory observation.** Byte-level scans and diff hunts (documented in
   `game-state-architecture.md`), plus header/file inspection.

### What was *not* done

* **No disassembly or decompilation.** No decompiler was available in this
  environment, so no function addresses, control flow or data structures are
  reported. Everything in these docs is behavioural or memory-observational.
  Consequence: any statement about *how* the game computes something is [I] or [U];
  statements about *what the player sees* are [V].
* **No asset extraction** of any kind (graphics, tiles, palettes, fonts, music,
  sound effects) — see `docs/asset-provenance.md`. The palette in VRAM/bus memory
  was deliberately never read out as a set, and no colour was picked from a
  screenshot to build the recreation's palette.
* **No audio analysis.** See `audio-behavior.md`.

## 4. Known measurement hazards (recorded so results are reproducible)

* mGBA throttles to ≈1 frame/s while its window is occluded. Symptom: RPC
  timeouts (`tools/re/bridge.py` `wait_frames` raises). Fix: raise the window
  (`open -a mGBA`) and retry. A timeout means "raise the emulator", not "retry harder".
* Frames keep elapsing between two tool calls, so any experiment must run inside
  a single process (`tools/re/exp.py`), never as separate calls.
* Savestate container offsets are **not** bus addresses (offset `0x8A16` is
  container-local). Only `mgba_read*`/`write*` with real bus addresses are valid.
* EWRAM `0x02000DF8..0x02001024` churns continuously during play even when the
  board is static; value-change searches keyed on bytes in that window are pure
  noise. It looks like tile/row staging for the field draw [I].
* The 32-bit value `0x44000000` occurs at dozens of EWRAM/IWRAM sites and is a
  generic tag in record headers, not a gameplay field (see
  `game-state-architecture.md` § dead ends).

## 5. Legal handling

Screenshots taken from the reference emulator live in
`docs/reverse-engineering/screenshots/`, which is gitignored: they contain the
reference product's wordmarks and are for behaviour documentation only. They are
never shipped, never imported by the application, and never used as artwork
source. The ROM itself is gitignored and is not required at runtime by the
recreation.
