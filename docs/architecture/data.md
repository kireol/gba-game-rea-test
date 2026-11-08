# Architecture: data

## Runtime state (memory only)

| Structure | Owner | Contents | Lifetime |
| --- | --- | --- | --- |
| `Board` (`Uint8Array`, 10×22) | `Session` | locked cells; array rows 0–1 sit above the visible field | one session |
| `active`, `queue[]`, `hold` | `Session` | current piece, next queue (default 3), one hold slot | one session |
| `Session.stats` | `Session` | frames, lines, level, score, combo/maxCombo, pieces, seed, status, goal | one session → becomes a `RunSummary` |
| `ModeRun` (per mode) | mode module | the mode's clock, goal counter, star target, attack counters | one session |
| `SceneState` | `ui/scenes.ts` | scene id, focus index, screen values, the live `Session` | app lifetime |
| `SaveData` | `gameplay/persistence.ts` | the one persisted record below — always valid, always in memory | app lifetime |

`Session.stats` deliberately holds no per-mode numbers (no "clears by size", no
"holds used"): anything mode-specific lives in the mode's `ModeRun` and reaches
the results screen through `ModeRun.extra()`. The renderer derives everything it
draws from `session.snapshot()` (assembled into a `FrameModel` by the scene) plus
its own animation clock; there is no second copy of the board.

## Cell encoding

`0` empty · `1…7` the seven pieces (index into the palette) · `8` garbage ·
`9` star block. One byte per cell — deliberately *not* copied from the reference:
its board layout was never found (`reverse-engineering-unknowns.md` U28), so this
encoding is ours. `STAR` (9) is also what a FUSION gauge reads.

## Persisted data — `localStorage["orbitdrop.save.v1"]`

```jsonc
{
  "version": 1,
  "settings": { "ghost": true, "hold": true, "nextCount": 3, "showScore": false,
                "difficulty": 2, "screenShake": true, "showRules": true },
  "assist":   { "infiniteThinking": false },
  "audio":    { "master": 0.8, "music": 0.55, "sfx": 0.75, "muted": false },
  "bindings": { "left": ["ArrowLeft"], "right": ["ArrowRight"], "soft-drop": ["ArrowDown"],
                "hard-drop": ["Space"], "rotate-cw": ["KeyX"], "rotate-ccw": ["KeyZ"],
                "hold": ["ShiftRight", "KeyC"], "pause": ["Enter"],
                "confirm": ["Enter", "KeyZ"], "back": ["Escape", "Backspace"],
                "up": [], "down": [], "increment": [], "decrement": [] },
  "progress": { "goal-ladder": { "unlocked": true, "plays": 3, "clears": 1,
                                 "best": { "score": 21450, "lines": 42, "level": 5,
                                           "seconds": 213.4 },
                                 "lastSeed": "9f3c1a70" },
                "linked-blocks": { "unlocked": false, "plays": 0, "clears": 0,
                                   "best": null, "lastSeed": "" } },
  "highScores": [ { "modeId": "goal-ladder", "at": 1762600000000,
                    "score": 21450, "lines": 42, "level": 5, "seconds": 213.4 } ],
  "updatedAt": 1762600000000
}
```

Notes that matter when reading the code:

* Keys are **arrays** of `KeyboardEvent.code` values, and the intent keys are
  **kebab-case** (`'soft-drop'`, `'rotate-cw'`) — the same strings the `Intent`
  union uses, so a persisted payload needs no translation table.
* `Bindings` is owned by `engine/bindings.ts` (`DEFAULT_BINDINGS`,
  `normalizeBindings`, `cloneBindings`), not by persistence. Player two's map
  (`P2_BINDINGS`: A/D/S/F/W/E/Q/P…) is a fixed table and is never persisted.
* `progress` is keyed by **mode id**, and `unlocked` is derived from the mode
  before it having ≥ 1 clear (`withUnlocks`), so a payload's unlock flags are a
  hint, not an authority. `lastSeed` is the 8-hex form of that mode's last run.
* `highScores` is one flat table across modes, ordered by score then lines, capped
  at `HIGH_SCORE_LIMIT = 10`; an entry only exists if its score is non-zero.
* `difficulty` mirrors the reference's persisted difficulty row (observed 1…4).
* `showScore` is `settings.showScore` and **defaults to `false`** — the reference
  exposes no score at all, so score display is an opt-in extra
  (`scoring-and-progression.md` § 1).

Rules:

* One key, one schema version, `version` first. Anything unparseable, non-object,
  or with a `version` **newer** than this build → defaults are used and the raw
  blob is kept under `orbitdrop.save.v1.corrupt` (never silently destroyed, never
  trusted).
* Every field is validated on read (`typeof` checks and range clamps through
  `numberOr` / `booleanOr` / `intOr` / `bestFrom` / `progressFrom` /
  `highScoresFrom`); a partial, hostile or hand-edited blob can never crash the
  app and can never make a locked mode playable.
* Written on a `SAVE_DEBOUNCE_MS = 500` debounce, plus `flush()` on a settings
  change and on `pagehide` / `visibilitychange`.
* Quota error or absent/blocked `localStorage` (private mode) → in-memory store
  with `persisted === false`; the game is unaffected. The in-memory copy is always
  authoritative, which is why every rules-visible option is read from the core
  rather than from storage.
* **Reset progress** (`resetProgress` → `clearedProgress`) drops `progress` and
  `highScores`, keeps `settings`/`assist`/`audio`/`bindings`, re-applies
  `withUnlocks`, and is reachable only through a two-choice confirm screen.

No high score is stored in the URL, no server, no analytics, no cookies.

## Seeds

A session is created from a 32-bit seed (`createRng` = mulberry32). That one
stream feeds the 7-bag, the garbage holes, and every mode's decisions through
`ModeApi.rng`, so *drawing a different number of pieces* is the only way two runs
diverge. `SessionView.seed` is shown on the results screen and stamped into
`progress[modeId].lastSeed`, so a run is reproducible — the reference behaviour we
could verify (`game-state-architecture.md` § 7).

## Determinism contract

Same seed + same config + same input-frame sequence ⇒ identical `SessionEvent`
stream, identical board, identical score. Wall-clock time never enters gameplay;
`advance(frames)` is the only mutation path. Enforced by
`src/tests/determinism.test.ts` (two sessions, independent frame splittings of the
same total, byte-identical board hashes; incl. the same 180 input frames replayed
from the seed alone and `digest()` equality).
