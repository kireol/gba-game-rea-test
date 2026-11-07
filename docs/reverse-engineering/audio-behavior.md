# Audio behaviour

**Status: analysis incomplete.** This is the shortest document in the set because
the shortest honest one can be. Two of its boundaries are deliberate, not
accidental.

## 1. What is not in scope, by design

The reference's music and sound effects are copyrighted works. Per
`prompt.md` § 2.2 they must not be transcribed, traced, sampled, converted or
reconstructed — including as placeholders and including "just the note
sequence". Therefore:

* no melody was transcribed, and no note names, tempo maps or instrument
  parameters of the reference appear anywhere in this repository;
* no audio was extracted from the ROM or captured from the emulator;
* the recreation's audio is synthesised from original material written for it
  (see `docs/asset-provenance.md`).

Consequently this document can only describe audio *structurally and behaviourally*.

## 2. Sound driver records [V] → [I]

While scanning IWRAM during play, a block at `0x03002560..0x030025BB` holds three
similarly shaped 32-bit channel records:

```
0x03002560  0x5F008001  ...
0x03002580  0x0F018002  ...
0x030025A0  0xDF010004  ...
```

with, in some slots, pointer-like values whose upper half is `0x80BF…` — i.e.
addresses in the system-ROM region. [V] for the bytes.

Interpretation [I]: three simultaneously active channels driven through
BIOS-resident sound routines, with per-channel flag/period/envelope words. It
matches the platform's standard BIOS sound driver pattern (three melodic channels
plus a noise channel handled elsewhere), but no code was read, so this stays an
inference.

A second scan pass keyed on actively changing 32-bit words inside this window
during play caught no active music playback — consistent with a silent or
non-sequencing session at that moment, and *not* evidence that the game is quiet.
The volume setting was not confirmed during those runs, and the emulator's audio
output was never analysed. [U]

## 3. Behavioural observations that are safe to record [V]

* Sound is a **user setting**, not a per-session choice: the main menu's options
  screen has a sound row with a caption `CHANGE SOUND OPT…`, and the in-play
  pause menu has a `SOUND` row. Both were reached and navigated.
* Music keeps playing across the menu→play transition in the sessions observed;
  no per-mode music change was verified (a change may well exist — it was not
  measurable without audio capture).
* The pause menu does not mute: while paused, the `SOUND` row is just another
  menu entry.
* Sound settings persist between boots (the options value was still set after a
  reset), which is consistent with the battery-save traffic recorded in
  `rom-overview.md` § Save media.

## 4. Open questions [U]

1. How many channels are actually audible per screen/mode?
2. Is there mode-specific music, and does the track change on level-up?
3. Which events have sound effects (line clear, level-up, lock, top-out, menu
   move, menu confirm, garbage arrival, victory)? None was verified — an
   observation of "a sound played" is not measurable with the tooling available
   (no audio capture, no frame-accurate audio logging).
4. Do the sound options include volume and a mode (e.g. mono/stereo) or more than
   one value per row? The value column lies outside the visible crop
   (`menu-and-ui-analysis.md` § layout).

These are listed as tasks in `reverse-engineering-unknowns.md`. The recreation's
audio layer (`src/audio/`) is therefore **original by necessity**: it defines its
own track count, its own effects list and its own synthesised material, and its
only inherited property is the documented *behaviour* — sound is a persisted user
setting, pausing does not mute, and music continues across screens.
