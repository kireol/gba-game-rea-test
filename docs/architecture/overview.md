# Architecture: overview

Orbit Drop is a browser falling-block puzzle game. Every rule in it was either
**measured** from the reference ROM, declared as an **assumption** where the
reference could not be measured, or declared as an **original design** where the
reference does not expose the behaviour at all. `docs/game-design.md` labels each
rule that way; this document describes how the code is organised.

```
                        ┌──────────────────────────────────────────┐
   index.html ─► src/app/main.ts        (composition root)        │
                        │  builds: config, rng, session, renderer,│
                        │  audio, input, persistence, scene router │
                        ▼                                          │
   ┌───────────────── src/app/loop.ts ─────────────────┐          │
   │  fixed 60 Hz logic step  +  draw every rAF        │          │
   └───────┬───────────────────────────────┬───────────┘          │
           ▼                               ▼                       │
     src/gameplay/                     src/render/                 │
     session.ts (state machine)        renderer.ts palette.ts font │
           ▲                               ▲                       │
           │ hooks                         │ reads snapshot        │
     src/modes/*  ────────► src/engine/ ───┘                       │
     ascent fusion rush      board pieces random config            │
     dash blitz endless duel                                      
           ▲                                                        │
     src/ui/  scenes.ts (screen machine) format.ts options.ts widgets.ts
     src/audio/  engine.ts (WebAudio synth, original material)
     src/gameplay/persistence.ts  (localStorage, versioned)
     src/engine/bindings.ts  (intent → key map, rules-visible)
```

## Layers

| Layer | Modules | May import | Must not import |
| --- | --- | --- | --- |
| Rules | `src/engine`, `src/gameplay`, `src/modes` | each other | DOM, Canvas, WebAudio, `localStorage` |
| Presentation | `src/render`, `src/audio`, `src/ui` | rules | — |
| Shell | `src/app` | everything | game logic of its own |

The rules layer is pure and synchronous: `session.advance(frames)` is the only
mutator, it takes no clock, and everything observable comes back either as a
returned `SessionEvent[]` or from `session.snapshot()`. That is what makes every
mechanic in the brief testable without a browser, and what makes a seeded session
reproducible.

## Why these boundaries exist

1. **The brief demands a modular rules engine.** Every verified mode is its own
   module under `src/modes/`, with its own tests; a mode cannot reach into the
   renderer, and the renderer cannot reach into mode internals.
2. **The reference is one shared engine with per-mode rule tables.** Evidence:
   the piece-geometry block in the reference is *shared data* used by every mode
   (`docs/reverse-engineering/game-state-architecture.md` § 6) while the mode list
   only changes the goal text and the HUD fields
   (`docs/reverse-engineering/game-modes.md` § 1–3). So: one board/piece engine,
   many small rule modules.
3. **Determinism is a property of the reference.** Identical saved states produce
   identical piece sequences (`game-state-architecture.md` § 7), so the RNG is
   injected and seeded everywhere and never reads wall-clock time.

## The frame loop

* Logic runs in whole frames at 60 Hz. Frame counts are the unit for every
  timing constant (`src/engine/config.ts`), because every number in the RE docs is
  expressed in frames.
* rAF drives the renderer; the accumulator runs 0…N logic steps per drawn frame
  and drops backlog past `MAX_CATCHUP` (4) steps, so an unhitched tab cannot
  fast-forward a session.
* `session.advance(frames)` is the only entry point; nothing else mutates state.
  The shell (`src/app/main.ts`) is the only code that turns a rAF timestamp into a
  frame count.

## Scene model

`src/ui/scenes.ts` is a screen machine over `SceneId`
(`title → modes → rules → play → duel → results`, plus `options`, `bindings`,
`scores`, `confirm`). It is not a reducer: it owns a mutable internal state object
and the app calls four entry points — `intent(intent, down, player)`, `key(code, down)`,
`pointer(x, y, action)`, `advance(frames)` — each returning whether the screen
consumed the event, and one output, `frame(): FrameModel`. The screen creates and
advances the `Session` itself (the shell never touches it) and asks the host for
the side effects it cannot perform: `sfx`, `status`, `commit` (a `SaveData`
replacement), `announce`, `persisted`, `now`. Menus work because each screen
builds a list of geometries and tests the pointer against the same rows the
keyboard cursor uses, so mouse and keys cannot drift.

The reference's own screen-id byte (`0x0300257B`, values 3/6/8/12/13/16) is the
reminder that the reference is also a screen state machine — we implement our own
enum and borrow nothing from its layout.

## Mode modules

`src/modes/<id>.ts` exports a `ModePlugin` (one file per mode id: `goal-ladder`,
`linked-blocks`, `timed-goal`, `fixed-lines-race`, `timed-max-lines`,
`rising-garbage`, `duel`, plus `types.ts` and `registry.ts`):

```ts
export interface ModePlugin {
  id: string;                 // internal, plain-mechanic name
  label: string;              // player-facing, our own branding
  family: 'single' | 'versus';
  summary: string;            // shown in the mode list
  rules: readonly string[];   // shown on the rules screen (our own words)
  showLines: boolean;         // results screen shows a LINES row
  timeUpLabel?: string;       // header when the clock ends the run
  createRun(api: ModeApi): ModeRun;        // the mode's rule object for one run
  setupBoard?(board: Board, api: ModeApi): void;   // seed the opening field
}
```

There is no `config` override and no `goal(ctx)`/`isFinished(ctx)` on the plugin:
those questions live on the per-run object `createRun` returns
(`hud()` / `goal()` / `status()` / `advance()` / `onLock()` / `extendClear()` /
`onClear()` / `onGarbage()` / `extra()`), and the mode reaches the shared mechanics
only through `ModeApi` (`config`, `difficulty`, `rng`, `board`, `level`, `lines`,
`frames`, `seconds`, `status`, `setStatus`, `setLevel`, `addGarbage`, `pushRow`,
`emit`). Full signatures: `interfaces.md`.

`session.ts` supplies the shared mechanics (movement, rotation, collision,
gravity, lock, clear, hold, ghost, queue) and asks the run the mode-specific
questions. `src/modes/duel.ts` is thin — the versus screen lives in
`src/gameplay/duel.ts`, which composes two sessions and routes garbage attacks,
the local substitute for the reference's link-cable mode
(`docs/architecture/decisions.md` D4).

## Data flow (play)

```
keyboard/mouse → app/input.ts → Intent → session.advance(frames)
                                        ├─ engine/board (collision, clear)
                                        ├─ engine/random  (seeded bag)
                                        ├─ modes/<id>     (goal, garbage, end)
                                        └─ events[] ─► renderer (sprites/text)
                                                      audio (sfx/music)
                                                      persistence (end of run)
```

Events are data (`{ type: 'lines', rows, count, score, perfect }`,
`{ type: 'sfx', name: 'lock' }`, `{ type: 'status', status: 'won' }` …); the
renderer and audio layer consume the same list and own all their own animation
state, so a rules change can never silently alter how something looks.

## What is deliberately *not* here

* No ROM, no emulator, no ROM-loading code path, and no runtime asset files
  (all art/audio are generated) — see `docs/asset-provenance.md`.
* No global mutable singletons in the rules layer.
* No wall-clock or `Date.now()` inside a session (results screens stamp dates in
  the shell layer only).
