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
     src/ui/  scenes.ts (pure menu machine) bindings.ts            
     src/audio/  engine.ts (WebAudio synth, original material)     
     src/gameplay/persistence.ts  (localStorage, versioned)        
```

## Layers

| Layer | Modules | May import | Must not import |
| --- | --- | --- | --- |
| Rules | `src/engine`, `src/gameplay`, `src/modes` | each other | DOM, Canvas, WebAudio, `localStorage` |
| Presentation | `src/render`, `src/audio`, `src/ui` | rules | — |
| Shell | `src/app` | everything | game logic of its own |

The rules layer is pure and synchronous: `advanceFrame(state)` → new state. That
is what makes every mechanic in the brief testable without a browser, and what
makes a seeded session reproducible.

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
  and clamps at 5 steps so an unhitched tab cannot fast-forward a session.
* `session.advance(frames)` is the only entry point; nothing else mutates state.

## Scene model

`src/ui/scenes.ts` is a pure reducer over scene identifiers and menu selections
(`title → menu → modeList → play → pause → results`, plus options/bindings).
It emits intents ("start mode X"); `src/app` performs the side effects. The
reference's own screen-id byte (`0x0300257B`, values 3/6/8/12/13/16) is the
reminder that the reference is also a screen state machine — we implement our own
enum and borrow nothing from its layout.

## Mode modules

`src/modes/<id>.ts` exports a `ModePlugin`:

```ts
export interface ModePlugin {
  id: ModeId;              // internal, plain-mechanic name
  label: string;           // player-facing, our own branding
  summary: string;         // shown in the mode list
  rules: readonly string[];// shown on the rules screen (our own words)
  config: Partial<GameConfig>;   // gravity table, goal rule, garbage, timers
  goal(ctx): GoalState;          // what the HUD's counter means in this mode
  onClear(ctx, n): ModeEffect[]; // per-mode reaction to a clear
  isFinished(ctx): 'running' | 'won' | 'lost';
}
```

`session.ts` supplies the shared mechanics (movement, rotation, collision,
gravity, lock, clear, hold, ghost, queue) and asks the plugin the mode-specific
questions. `src/modes/duel/` composes two sessions and adds garbage attacks —
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

Events are data (`{type:'line-clear', rows, n}` …); the renderer and audio layer
subscribe to the same list and own all their own animation state, so a rules
change can never silently alter how something looks.

## What is deliberately *not* here

* No ROM, no emulator, no ROM-loading code path, and no runtime asset files
  (all art/audio are generated) — see `docs/asset-provenance.md`.
* No global mutable singletons in the rules layer.
* No wall-clock or `Date.now()` inside a session (results screens stamp dates in
  the shell layer only).
