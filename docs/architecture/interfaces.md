# Architecture: interfaces

Public surfaces of the rules layer and the shell. Signatures here are the ones in
the code; keep this file updated when a signature changes.

## `src/engine/types.ts`

```ts
export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Rot = 0 | 1 | 2 | 3;
export type Cell = 0 | PieceColor | Special;     // 0 empty; 1..7 colours; 8 garbage; 9 star
export interface Vec { x: number; y: number }    // y grows downward, 0 = top hidden row
export interface ActivePiece { id: PieceId; rot: Rot; x: number; y: number }
export interface Board { cols: number; rows: number; cells: Uint8Array }
```

Board rows `0..HIDDEN-1` are above the visible field (default `HIDDEN = 2`);
visible row *r* is array row *r + HIDDEN*. Piece coordinates are **array** rows.

## `src/engine/board.ts`

```ts
createBoard(cols = 10, rows = 22): Board
inside(b, x, y): boolean
collides(b, piece, dx?, dy?, rot?): boolean          // walls, floor, stack
place(b, piece): void
fullRows(b): number[]                                // array rows, ascending
clearRows(b, rows): number                           // removed count, stack shifts down
addGarbageRow(b, holeCol): number                    // pushes rows up, returns overflow
ghostY(b, piece): number                             // lowest legal y (inclusive)
isTopOut(b, piece): boolean                          // spawn cell already occupied
```

## `src/engine/pieces.ts`

```ts
SHAPES: Record<PieceId, readonly [readonly string[], ...]>  // base matrix per piece
BOX: Record<PieceId, 2 | 3 | 4>                             // rotation box size
statesFor(id): readonly ActiveShape[4]                      // rotated in place, computed once
spawnPiece(id, spawnCol?): ActivePiece                      // box left 3 (O: 4), box top row -1
```

Rotation is a permutation inside the piece's own square box — no offsets, no
kicks (measured: rotations against either wall or the floor either succeed in
place or are rejected).

## `src/engine/random.ts`

```ts
createRng(seed: number): () => number      // mulberry32, pure
createBag(seed: number): () => PieceId     // 7-bag, no immediate repeats
queueFrom(seed: number, length: number): PieceId[]
```

## `src/engine/config.ts`

`GameConfig` holds every tunable, all in frames: `gravityTable` (15 levels),
`softDropFrames`, `dasFrames`, `arrFrames`, `newPieceDelayFrames`,
`lineClearFrames`, `lockFrames`, `hiddenRows`, `visibleRows`, `cols`,
`queueLength`, `holdEnabled`, `ghostEnabled`. `DEFAULT_CONFIG` contains only the
values justified in `docs/game-design.md` (measured, assumed or original).

## `src/gameplay/session.ts`

```ts
createSession(opts: { mode: ModePlugin; seed: number; config?: GameConfig;
                      difficulty?: 1|2|3|4 }): Session
Session.advance(frames: number): SessionEvent[]   // the only mutator
Session.snapshot(): Readonly<SessionView>         // what the renderer reads
Session.input(intent: Intent): void
type Intent = 'left'|'right'|'soft'|'hard'|'rotateCw'|'rotateCcw'|'hold'|'pause'
            | 'confirm'|'back'|'up'|'down'|'increment'|'decrement'
type SessionEvent = {type:'move'|'rotate'|'lock'|'line-clear'; ...}
                  | {type:'level-up'|'spawn'|'hold-swap'|'garbage'|'game-over'|'win'}
                  | {type:'sound'; name: SfxName}
```

`SessionView`: `board`, `active`, `ghost`, `queue`, `hold`, `level`, `lines`,
`score`, `frames`, `goal: {current, target, label}`, `status`, `stats`.

## `src/modes/*`

See `docs/architecture/overview.md` § Mode modules. `src/modes/registry.ts`
exports `MODES: readonly ModePlugin[]` and `modeById(id)`.

## `src/gameplay/persistence.ts`

```ts
loadStore(): SaveFile            // localStorage; corrupt/absent → defaults()
saveStore(s: SaveFile): void
resetProgress(s: SaveFile): SaveFile
recordRun(s, run): SaveFile
DEFAULT_BINDINGS / DEFAULT_SETTINGS
```

Key `orbitdrop.save.v1`; schema + migration rules in `data.md`. Never throws.

## `src/app/*`

`main.ts` composes everything; `loop.ts` owns rAF + the fixed-step accumulator;
`input.ts` maps DOM keyboard/mouse to `Intent` (pure `resolveKey()` exported for
tests); `layout.ts` computes the integer scale and letterbox offsets.

## `src/ui/scenes.ts`

Pure menu machine: `advance(scene, intent) → {scene, focus, intents[]}` plus
`hitTest(scene, x, y)` in logical coordinates. No DOM, fully unit-tested; the
renderer draws whatever `focus` says and clicks are translated into the same
intents as keys.
