# Architecture: data

## Runtime state (memory only)

| Structure | Owner | Contents | Lifetime |
| --- | --- | --- | --- |
| `Board` (`Uint8Array`, 10×22) | `Session` | locked cells; row 0–1 above the visible field | one session |
| `active`, `queue[]`, `hold` | `Session` | current piece, next queue (default 3), one hold slot | one session |
| `RunStats` | `Session` | frames, lines, level, score, clears by size, holds used, seed | one session, becomes a run record |
| `SceneState` | `ui/scenes.ts` | current scene id, focus index, submenu value | app lifetime |

The renderer derives everything it draws from `Session.snapshot()` plus its own
animation clock; there is no second copy of the board.

## Cell encoding

`0` empty · `1…7` the seven pieces (index into the palette) · `8` garbage ·
`9` star block. One byte per cell — deliberately *not* copied from the reference:
its board layout was never found (`reverse-engineering-unknowns.md` U28), so this
encoding is ours.

## Persisted data — `localStorage["orbitdrop.save.v1"]`

```jsonc
{
  "version": 1,
  "settings": { "masterVolume": 0.7, "musicVolume": 0.5, "sfxVolume": 0.8, "muted": false,
                "showFps": false, "screenShake": true, "difficulty": 2 },
  "assist":   { "ghost": true, "hold": true, "queueLength": 3, "showScore": false,
                "lockHint": true, "startLevel": 1, "startSpeed": "normal" },
  "bindings": { "left": "KeyA", "right": "KeyD", "softDrop": "KeyS", "hardDrop": "Space",
                "rotateCw": "KeyK", "rotateCcw": "KeyJ", "hold": "ShiftLeft",
                "pause": "Escape", "confirm": "Enter", "back": "Backspace", "mute": "KeyM" },
  "progress": { "runs": 0, "totalLines": 0, "best": { "<modeId>": { "...": "…" } },
                "unlocked": { "<modeId>": true } }
}
```

Rules:

* One key, one schema version, `version` first. Anything unparseable, wrong
  version, or non-object → defaults are used and the bad blob is kept under
  `orbitdrop.save.v1.corrupt` (never silently destroyed, never trusted).
* Every field is validated on read (`typeof` checks + range clamps); a partial or
  hand-edited blob can never crash the app.
* **`showScore` defaults to `false`** — the reference exposes no score at all, so
  score display is an opt-in extra (`scoring-and-progression.md` § 1).
* `difficulty` mirrors the reference's persisted difficulty row (observed 1…4).
* Written on a 500 ms debounce, plus `pagehide` / `visibilitychange` → hidden.
* Quota/absent-`localStorage` (private mode) → in-memory store, game unaffected.
* **Reset progress** clears `progress` (with a confirm step that requires a second
  explicit confirm) and keeps `settings`/`assist`/`bindings`.

No high score is stored in the URL, no server, no analytics, no cookies.

## Seeds

A session is created from a 32-bit seed. `RunStats.seed` is shown on the results
screen so a run is reproducible, which is the reference behaviour we could verify
(`game-state-architecture.md` § 7).

## Determinism contract

Same seed + same config + same input-frame sequence ⇒ identical `SessionEvent`
stream. Wall-clock time never enters gameplay; `advance(frames)` is the only
mutation path. Enforced by `src/tests/determinism.test.ts` (two sessions,
independent frame splittings of the same total, byte-identical board hashes).
