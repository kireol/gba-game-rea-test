# Architecture: interfaces

The public surface of every layer, as it exists in the code. When a signature
changes here, change the code in the same commit — this file is the review copy
of that claim.

Test coverage is stated per module so nobody reads "documented" as "pinned":
**[U]** = has its own Vitest file, **[E]** = exercised only through the Playwright
suite, **[—]** = no test of its own yet.

## Rules layer (no DOM, no Canvas, no WebAudio, no `localStorage`)

### `src/engine/types.ts` — vocabulary **[U via every rules suite]**

```ts
type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
const PIECE_IDS: readonly PieceId[];            // colour index order
type Rot = 0 | 1 | 2 | 3;

type Cell = number;                             // 0 empty · 1…7 piece colour · 8 garbage · 9 star
const EMPTY: Cell = 0, GARBAGE: Cell = 8, STAR: Cell = 9;
const cellOf(id: PieceId): Cell;                // PIECE_IDS.indexOf(id) + 1
const pieceOf(cell: Cell): PieceId | null;      // null for 0, 8, 9

interface Vec { x: number; y: number }          // y grows downward
interface ActivePiece { id: PieceId; rot: Rot; x: number; y: number }  // x,y = rotation-box origin, array rows
interface Board { readonly cols: number; readonly rows: number; readonly cells: Uint8Array }

type Difficulty = 1 | 2 | 3 | 4;
type GameStatus = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
type GoalKind = 'lines-to-level' | 'lines-total' | 'time-left' | 'time-up'
              | 'levels-left' | 'survive' | 'star-row';
interface HudField { label: string; value: string }   // one HUD row, mode-defined meaning

type SfxName = 'move' | 'rotate' | 'rotate-fail' | 'lock' | 'hard-drop' | 'clear'
             | 'clear-big' | 'level-up' | 'hold' | 'garbage' | 'spawn'
             | 'menu-move' | 'menu-confirm' | 'menu-back' | 'win' | 'lose' | 'mute';

type Intent = 'left' | 'right' | 'soft-drop' | 'hard-drop' | 'rotate-cw' | 'rotate-ccw'
            | 'hold' | 'pause' | 'confirm' | 'back' | 'up' | 'down'
            | 'increment' | 'decrement';

type SessionEvent =
  | { type: 'move'; dx: number }        | { type: 'shift'; dy: number }
  | { type: 'rotate'; dir: 1 | -1; ok: boolean }
  | { type: 'soft-drop'; dy: number }   | { type: 'hard-drop'; dy: number }
  | { type: 'lock' }                    | { type: 'spawn'; id: PieceId }
  | { type: 'hold' }
  | { type: 'lines'; rows: number[]; count: number; score: number; perfect: boolean }
  | { type: 'level-up'; level: number } | { type: 'garbage'; rows: number }
  | { type: 'goal'; kind: GoalKind; current: number; target: number }
  | { type: 'message'; text: string; frames: number }
  | { type: 'sfx'; name: SfxName }      | { type: 'status'; status: GameStatus };

const clonePiece(p: ActivePiece): ActivePiece;
```

Intents are **kebab-case**; a `lines` event's `score` is what that one clear paid,
not the running total, and no event carries `extended` (that number is only the
`onClear` hook's fourth argument). There is no `pause` sfx — `mute` is the only
UI-state sound in the set.

### `src/engine/board.ts` **[U `board.test.ts`]**

```ts
createBoard(cols = 10, rows = 22): Board
idx(b, x, y) / inside(b, x, y) / at(b, x, y) / set(b, x, y, v) / cloneBoard(b)
collides(b, piece, dx?, dy?, rot?): boolean        // walls, floor, stack; cells above row 0 are free
place(b, piece, cell: Cell): number                // writes cells, returns count left above row 0
fullRows(b): number[]                              // array rows, ascending
isEmpty(b): boolean
clearCells(b, cells: Iterable<number>): number     // FUSION's linked-cluster removal
clearRows(b, rows: readonly number[]): number      // collapses the stack down
pushBottomRow(b, cell, holes: readonly number[]): number   // shifts up; returns overflow
countRow(b, y): number                             // filled cells in a row
ghostY(b, piece): number                            // lowest legal box row
isTopOut(b, piece): boolean                        // spawn box already occupied
floodSameColour(b, seeds: readonly Vec[]): Set<number>     // connected same-value run
```

Row `0` is the **top array row**; the `hiddenRows` above the visible field are
inside the array, so a visible row *r* is array row *r + hiddenRows*. There is no
`addGarbageRow` here — garbage is `pushBottomRow(b, GARBAGE, holes)` plus the
event, and the hole choice lives in `session.ts`/`ModeApi`.

### `src/engine/pieces.ts` **[U `pieces.test.ts`]**

```ts
const SHAPES = { I: ['XXXX','....','....','....'], O: ['XX','XX'], T: ['XXX','.X.','...'],
                 S: ['.XX','XX.','...'], Z: ['XX.','.XX','...'], J: ['X..','XXX','...'],
                 L: ['..X','XXX','...'] }                     // rotation state 0
const BOX: Record<PieceId, 2 | 3 | 4>                        // rotation box side
interface ActiveShape { id: PieceId; box: number; states: readonly (readonly Vec[])[] }
statesFor(id): readonly (readonly Vec[])[]                   // 4 rotation states, computed once
shapeFor(id): ActiveShape
cellsOf(id, rot, ox, oy): Vec[]                              // ox/oy are relative; x/y already added
spawnCol(id, cols = 10): number                              // centred box left edge
interface SpawnOpts { cols?: number; hiddenRows?: number }
spawnPiece(id, opts?: SpawnOpts): ActivePiece                // rot 0, box top row = hiddenRows
```

Rotation is a permutation inside the piece's own square box — no offsets, no kicks
(measured: a rotation against either wall or the floor either succeeds in place or
is rejected). State 0 of every piece except I/O enters with its topmost occupied
cells on the top visible row.

### `src/engine/random.ts` **[U `random.test.ts`]**

```ts
type Rng = () => number                        // mulberry32, pure
createRng(seed: number): Rng
randInt(rng, n): number / shuffle(rng, list): T[]
randomSeed(): number                           // the only wall-clock entropy, app layer only
seedToString(seed): string / seedFromString(text): number     // 8-hex display + typed seed
interface Bag { next(): PieceId; peek(n: number): PieceId[] }
createBag(rng, ids = PIECE_IDS): Bag           // 7-bag: no repeat before the set is drained
queueFrom(seed, length, ids = PIECE_IDS): PieceId[]
```

`createRng(seed)` is the **one** stream a run has: it feeds the bag, the garbage
holes, and `ModeApi.rng`. Anything that consumes a draw shifts every later piece.
Consecutive mulberry32 seeds give near-identical first bags, so a test that needs a
particular piece strides candidate seeds by `0x9e3779b9`.

### `src/engine/config.ts` **[U `timings.test.ts`, `levels.test.ts`]**

```ts
interface GameConfig {
  cols; visibleRows; hiddenRows;               // 10 · 20 · 2
  gravityTable: readonly number[];             // 15 entries, frames per row, indexed level-1
  softDropFrames; dasFrames; arrFrames;        // 4 · 16 · 6
  lockDelayFrames;                             // 0 → locks on the first landed frame
  spawnDelayFrames;                            // 1
  clearFreezeFrames;                           // 30
  queueLength;                                 // 3
  ghost: boolean; hold: boolean;               // true · true
  maxLevel; goalBase;                          // 15 · 5 (ladder goal = goalBase × level)
}
const DEFAULT_CONFIG: GameConfig
const DIFFICULTY_SPEED: Record<Difficulty, number>   // 1.25 · 1 · 0.85 · 0.7
const DIFFICULTIES: readonly Difficulty[]; isDifficulty(v): v is Difficulty
gravityFrames(config, level, difficulty = 2): number // clamped, rounded, ≥ 1
const VIEW = { width: 240, height: 160, cell: 8, fieldX: 8, fieldY: 0, panelX: 96 }
```

Every timing is in frames at 60 Hz, tagged [M] measured / [A] assumed / [O]
original in the field comments and in `docs/game-design.md` § 2. `queueLength` is
rules-visible (a deeper queue deals different pieces); `ghost` is the only purely
cosmetic option, which is why it gets its own mutation test.

### `src/engine/bindings.ts` **[U `bindings.test.ts`, 18 tests]**

```ts
type Bindings = Record<Intent, readonly string[]>       // keys are kebab-case intents
const BINDABLE_INTENTS: readonly Intent[]               // excludes 'pause'… no: excludes nothing bindable
const INTENT_LABELS: Record<Intent, string>             // shown in the bindings screen
isBindableIntent(v): v is Intent
const DEFAULT_BINDINGS: Bindings   // ← → ↓ Space X Z ShiftRight/KeyC Enter Enter/KeyZ Esc/BkSp …
const P2_BINDINGS: Bindings        // A D S F W E Q P … — fixed, not editable
cloneBindings(b) / normalizeBindings(raw, base = DEFAULT_BINDINGS)
intentForCode(bindings, code): Intent | null            // first match wins
conflictsIn(bindings): ...          // for the bindings screen's warning
rebind(bindings, intent, code, slot = 0): Bindings      // pure, returns a copy
unbind(bindings, intent, code): Bindings
```

Player two's map is a fixed table by design: two editable maps on one shared
keyboard produces collisions the player should solve, not us storing (§ the header
comment of that file).

### `src/gameplay/session.ts` **[U `session`, `movement`, `lines`, `timings`, `blocks`, `determinism`]**

```ts
interface SessionOpts { mode: ModePlugin; seed: number; config?: GameConfig; difficulty?: Difficulty }
createSession(opts: SessionOpts): Session     // difficulty defaults to 2; spawns the first piece

interface Session {
  advance(frames: number): SessionEvent[]     // the only mutator; drains and RETURNS the queue
  input(intent: Intent, down?: boolean): void // `down` false on release; emits synchronously
  snapshot(): SessionView                     // live handles: must not mutate
  events(): SessionEvent[]                    // flush of anything queued since the last drain
  receiveGarbage(rows: number): void          // the versus entry point
  digest(): string                            // replay fingerprint
}

interface SessionView {
  mode; board; active: ActivePiece | null; ghost: number | null;   // ghost = box row
  queue: readonly PieceId[]; hold: PieceId | null; canHold: boolean;
  level; lines; score; combo; maxCombo; frames; seconds; pieces;
  status: GameStatus; goal: GoalInfo | null; hud: readonly HudField[];
  flash: number;                              // clear-flash frames left, for the stack blink
  seed: number; difficulty: Difficulty;
}
```

`advance(0)` still drains and returns queued events, and `input()` emits on
key-down, so a helper that calls `advance()` must use its return value — `events()`
afterwards is empty. `snapshot()` hands out the live `board` and `active`, so a
comparison against pre-mutation state copies the scalars out first. A mode can end
a run through two channels (`run.status()` and `api.setStatus()`), `step()` polls
`status()` twice a frame, and the **first** verdict of a frame wins because the
terminal states are final.

### `src/gameplay/score.ts` **[U `scoring.test.ts`]**

```ts
const MAX_COMBO = 10, PERFECT_CLEAR_BONUS = 1000, COMBO_UNIT = 50;
const SOFT_DROP_POINTS = 1, HARD_DROP_POINTS = 2;
interface ClearScore { points: number; /* … */ }
clearScore(level, count, perfect, combo): ClearScore
dropScore(cells: number, hard: boolean): number
```

`LINE_SCORES` is module-private on purpose — a test anchors on
`clearScore(1, 1, false, 0).points` rather than duplicating the table. Score is an
opt-in presentation (D5); the HUD's primary rows are the mode's own.

### `src/gameplay/duel.ts` **[U `duel.test.ts`]**

```ts
interface DuelOpts { seed: number; config?: GameConfig; difficulty?: Difficulty }
type DuelSideId = 'a' | 'b';
interface DuelEvents { a: SessionEvent[]; b: SessionEvent[] }
interface Duel {
  readonly a: Session; readonly b: Session;
  step(frames: number): DuelEvents     // advances both cores, then routes this tick's attacks
  input(side: DuelSideId, intent: Intent, down?: boolean): void
  togglePause(): void
  winner(): DuelSideId | null          // read only from a top-out
  over(): boolean
}
attackFor(count: number, perfect: boolean): number   // ≥4→4, else count-1, +1 for a perfect clear
```

Both sides share one bag. Because the wrapper routes attacks *after* both cores
advanced, a receiver's `garbage` surfaces on the **next** drain.

### `src/gameplay/persistence.ts` **[U `persistence.test.ts`, 26 tests]**

```ts
const SAVE_KEY = 'orbitdrop.save.v1', CORRUPT_KEY = `${SAVE_KEY}.corrupt`;
const SAVE_VERSION = 1, HIGH_SCORE_LIMIT = 10, SAVE_DEBOUNCE_MS = 500;

interface AudioPrefs { master: number; music: number; sfx: number; muted: boolean }
interface Settings  { ghost: boolean; hold: boolean; nextCount: number; showScore: boolean;
                      difficulty: Difficulty; screenShake: boolean; showRules: boolean }
interface Assist    { infiniteThinking: boolean }
interface BestRun   { score: number; lines: number; level: number; seconds: number }
interface ModeProgress { unlocked: boolean; plays: number; clears: number;
                         best: BestRun | null; lastSeed: string }   // 8-hex
interface ScoreEntry extends BestRun { modeId: string; at: number }
interface SaveData  { version; settings; assist; audio; bindings: Bindings;
                      progress: Readonly<Record<string, ModeProgress>>;
                      highScores: readonly ScoreEntry[]; updatedAt: number }
interface RunSummary { modeId: string; won: boolean; score: number; lines: number;
                       level: number; seconds: number; seed: number }

DEFAULT_SETTINGS / DEFAULT_ASSIST / DEFAULT_AUDIO
clamp01(v) / emptyProgress() / withUnlocks(data) / createSaveData(now = 0)
normalizeSaveData(raw, now = 0): SaveData          // repairs junk-shaped payloads to defaults

interface KeyValue { getItem(k): string | null; setItem(k, v): void; removeItem?(k): void }
interface LoadResult { data: SaveData; corrupt: boolean }
loadSaveData(kv = globalStorage(), now = Date.now()): LoadResult   // never throws
serializeSaveData(data): string

progressFor(data, modeId) / isUnlocked(data, modeId) / isBest(data, run)
recordRun(data, run, now = Date.now()): SaveData   // best + lastSeed + table row, in one call
clearedProgress(data, now): SaveData               // keeps user choices, re-locks the ladder

interface StoreOpts { kv?: KeyValue | null; now?: () => number;
                      schedule?: (write: () => void) => void; onWarn?: (where, error) => void }
interface SaveStore { readonly data: SaveData; readonly persisted: boolean;
                      update(mutate): SaveData; flush(): SaveData; resetProgress(): SaveData }
openSaveStore(opts?: StoreOpts): SaveStore
```

Unlocks are **derived from clears**, not stored as flags (`withUnlocks`), and a
once-opened mode stays open. `DEFAULT_BINDINGS` lives in `engine/bindings.ts`, not
here. The store coalesces updates inside `SAVE_DEBOUNCE_MS`, writes through on
`flush()`, and keeps working in memory when the write fails or storage is absent.

## Modes

### `src/modes/types.ts` — the plugin contract **[U `session.test.ts`, `modes.test.ts`]**

```ts
interface ModeApi {
  readonly config: GameConfig; readonly difficulty: Difficulty;
  readonly rng: Rng;                       // the run's single stream — never create another
  readonly board: Board; readonly level: number; readonly lines: number;
  readonly frames: number; readonly seconds: number; readonly status: GameStatus;
  setStatus(status: GameStatus): void; setLevel(level: number): void;
  addGarbage(rows: number): void;          // announced: sound + 'garbage' event
  pushRow(cell: Cell, holes: number): void;// silent, for seeding the opening field
  emit(event: SessionEvent): void;
}

interface GoalInfo { kind: GoalKind; label: string; current: string; numeric: number; target: number }
// `current` is the DISPLAY string; `numeric` is what a gauge/bar uses.

interface ModeRun {
  hud(): HudField[];                       // rows in display order, mode-defined meaning
  goal(): GoalInfo | null;
  status(): GameStatus;                    // 'playing' continues; 'won'/'lost' ends it
  advance?(frames: number): void;          // once per frame, before the mechanics step
  extendClear?(clearedRows: readonly number[], candidate: Set<number>): void;
  onLock?(piece: ActivePiece, cells: readonly Vec[]): void;
  onClear?(rows: readonly number[], count: number, extended: number): void;
  onGarbage?(rows: number): void;
  extra?(): readonly { label: string; value: string }[];   // appended to the results screen
}

interface ModePlugin {
  id: string; label: string;               // id = plain mechanic name, label = our branding
  family: 'single' | 'versus';
  summary: string; rules: readonly string[];
  showLines: boolean;                      // results screen shows a LINES row
  timeUpLabel?: string;                    // header when the clock ends the run
  createRun(api: ModeApi): ModeRun;
  setupBoard?(board: Board, api: ModeApi): void;
}
```

Hook order per frame: `createRun` → `setupBoard` → (per lock) `onLock` →
`extendClear` → `onClear`. `src/modes/registry.ts` exports `MODES`,
`SINGLE_MODES` (excludes the versus entry), `modeById(id)` and `rulesLines(mode)`.

| id (internal) | label | family | goal kind |
| --- | --- | --- | --- |
| `goal-ladder` | ASCENT | single | `lines-to-level` |
| `linked-blocks` | FUSION | single | `star-row` |
| `timed-goal` | RUSH | single | `time-left` |
| `fixed-lines-race` | DASH | single | `lines-total` |
| `timed-max-lines` | BLITZ | single | `time-up` |
| `rising-garbage` | ENDLESS | single | `survive` |
| `duel` | DUEL | versus | — (two cores) |

The labels are what players see; the ids never reach the screen except through
`debug().modeId`.

## Presentation layer

### `src/render/frame.ts` — the render boundary **[U indirectly: built per row by `render.test.ts`, asserted per screen by `scenes-*.test.ts`]**

```ts
type TextAlign = 'left' | 'center' | 'right';
interface TextCall { text; x; y; colour: AnyColour; scale?: 1|2|3; align?: TextAlign }
interface BoxCall  { x; y; w; h; fill?; edge?; thickness?; dashed? }
interface BarCall  { x; y; w; h; value: number /* 0…1 */; fill; back? }
interface FieldCall{ board; active: ActivePiece | null; ghost: ActivePiece | null;
                     flashFrames: number; x; y; cell; rows: number; showGrid: boolean; dim? }
interface PreviewCall { id: PieceId; x; y; w; h; cell?; dim? }
interface FrameModel { bg?; boxes?: readonly BoxCall[]; fields?: readonly FieldCall[];
                       previews?: readonly PreviewCall[]; bars?: readonly BarCall[];
                       texts?: readonly TextCall[]; veil?: number }   // veil = full-frame 0…1
const EMPTY_FRAME: FrameModel
```

`fields` is a **list** because the versus screen shows two cores side by side, and
a board is only paintable through `FieldCall` (it needs the cell grid, the ghost
and the clear flash together). A scene emits one immutable `FrameModel` per frame;
the renderer knows nothing about modes, sessions or the DOM beyond its canvas,
which is what lets a scene's output be asserted without a canvas.

### `src/render/renderer.ts` **[U `render.test.ts`, 33 tests]** · `font5x7.ts` **[U `font.test.ts`, 18 tests]** · `blocks.ts` **[U `blocks.test.ts`, 8 tests]** · `palette.ts` **[— indirectly]**

`palette.ts` has no file of its own; `resolveColour`/`shade`/`withAlpha` are asserted
through the draw calls that consume them, in all three suites above.

(`src/app/layout.ts` is not part of this section and has its own unit file; see § 6.)

```ts
// palette.ts
const PIECE_COLOURS: readonly string[];  const GARBAGE_COLOUR;  const STAR_COLOUR;  const COLOURS
type PaletteKey = keyof typeof COLOURS;  type AnyColour = PaletteKey | string
colourForCell(cell): string | null   resolveColour(v)   shade(hex, k)   withAlpha(hex, a)
// blocks.ts
type TileStyle = 'piece' | 'garbage' | 'star' | 'ghost'
tileFor(...) drawCell(...) drawBoard(...) drawActive(...) drawGhost(...) drawPiecePreview(...)
// font5x7.ts — hand-authored 5×7 bit table, 6 px advance, 8 px line
const FONT_W = 5, FONT_H = 7, FONT_ADVANCE_X = 6, FONT_ADVANCE_Y = 8
keyFor(ch) → table key (lowercase borrows the capital)   canRender(text): boolean
glyphRows(ch)   textWidth(text, scale = 1)
interface TextOptions { scale?: number; align?: 'left'|'center'|'right'; baseline?: number }
drawText(ctx, text, x, y, colour, opts?)   wrapText(text, maxWidth): string[]
// wrapText is word-wise, keeps a hard newline, gives an over-long word its own line,
// and trims the result; it never looks at glyph pixels.
// drawText skips a character it has no key for and keeps walking, silently, keeping
// its advance column. The table has no non-ASCII keys: labels are ASCII by decision
// and `font.test.ts` walks the screens to keep that true.
// renderer.ts
interface Renderer { readonly canvas; readonly width; readonly height;
                     paint(model: FrameModel): void; reset(width, height): void }
createRenderer(canvas: HTMLCanvasElement, width = 240, height = 160): Renderer
```

### `src/audio/engine.ts` **[—]**

```ts
interface AudioEngine {
  unlock(): void                 // from the first real gesture; creates/resumes the context
  sfx(name: SfxName): void
  setStatus(status: GameStatus): void   // only 'playing' has the loop running
  prefs(next: AudioPrefs): void
  dispose(): void
  readonly live: boolean
}
createAudioEngine(initial: AudioPrefs): AudioEngine
```

Every entry point no-ops when there is no `AudioContext`, so a headless run works.
Sfx and music both live in this one module — oscillators, one noise buffer, and
hand-written envelopes; the music is a four-chord loop (150 BPM sixteenths,
`setInterval` + 350 ms lookahead) scheduled against context time.

### `src/ui/{format,options,widgets,scenes}.ts`

```ts
// format.ts [—]
pad2(n)  formatTime(s)  formatTimeTenths(s)  formatScore(v)  formatPercent(r)
formatSigned(v)  ordinal(n)  plural(count, one, many = one+'S')  yesNo(v)  difficultyLabel(v)
// options.ts [—]
interface Prefs { settings: Settings; assist: Assist; audio: AudioPrefs }
type OptionKind = 'toggle' | 'cycle' | 'slider' | 'action'
interface OptionRow { id; label; kind: OptionKind; group; hint; destructive?: true }
const OPTION_ROWS: readonly OptionRow[];  const INFINITE_LOCK_DELAY = 9999
optionById(id)  prefsOf(data)  applyPrefs(data, prefs)  optionValue(row, prefs)
stepOption(row, prefs, dir)  isOn(row, prefs)  setSlider(row, prefs, ratio)
configFor(settings, assist, base = DEFAULT_CONFIG): GameConfig
// widgets.ts [—]
const SCREEN = { w, h };  const MARGIN = 8;  const PANEL = {...}
interface Draft { box; text; bar; preview; addField; setVeil; label(text,x,y,colour?,align?,scale?); build(): FrameModel }
draft(bg = 'bg'): Draft
interface MenuItem { label; sub?; colour?; dim?; note? }
interface MenuGeom { x; y; w; rowH; count }   interface MenuRect { index; x; y; w; h }
menuRects(geom)  rowUnderPoint(geom, px, py): number | null
drawMenu(...) drawHeader(...) drawFooter(...) drawCard(...) drawStat(...)  textPx(text, scale?)
```

`INFINITE_LOCK_DELAY` is a very large finite number (≈2.7 min per landed piece),
not `Infinity` — `Infinity` would leak into the digest and the serialised config.

### `src/ui/scenes.ts` — the screen machine **[U `scenes-menus.test.ts` 18 + `scenes-options.test.ts` 26 + `scenes-run.test.ts` 30, over `scenes-harness.ts`; also E]**

```ts
type SceneId = 'title' | 'modes' | 'rules' | 'play' | 'duel' | 'results'
             | 'options' | 'bindings' | 'scores' | 'confirm';
type PointerAction = 'hover' | 'press';

interface SceneHost { sfx(name: SfxName): void; status(s: GameStatus): void;
                      commit(data: SaveData): void; announce(text: string): void;
                      persisted(): boolean; now(): number }

interface Scenes {
  readonly scene: SceneId;
  frame(): FrameModel;
  advance(frames: number): void;                      // only the play scenes consume frames
  intent(intent: Intent, down: boolean, player?: 1 | 2): boolean;
  key(code: string, down: boolean): boolean;          // raw code, before intent mapping
  pointer(x: number, y: number, action: PointerAction): boolean;   // framebuffer coords
  blur(): void;                                       // tab hidden → pause a live run
  debug(): SceneDebug;
}
interface SceneDebug { scene; status: GameStatus | null; seed: number; countdown: number;
                       modeId: string | null; lines: number; score: number; level: number; pieces: number }
createScenes(host: SceneHost, initial: SaveData): Scenes
```

Rules that the browser tests depend on and that are easy to break silently.
Since 2026-11-08 the same rows are pinned as unit tests too, through the seam this
module was already built on: **`SceneHost` is the screen machine's only door out**, so
`src/tests/scenes-harness.ts` hands it a recording stub and asserts every sound,
status edge, announcement and `commit` without a DOM, a clock or storage —
`setPersisted()` re-seeds what the next `loadBindings`/`loadPrefs` reads, `setClock()`
makes a debounced save's commit observable, and `frame()` returns the draw calls the
screen would have made, which is how a test asks "what is on this screen".

* **A press activates the row under the pointer**, not the row the cursor was on
  when the pointer arrived — pointer entry already moves the menu cursor. So one
  click on a mode row can enter a screen that starts immediately.
* `pointer(...,'hover')` moves the cursor and plays `menu-move`; a locked mode
  refuses with `rotate-fail` and an announcement, and does not navigate. It also calls
  `setBanner('LOCKED', 60)`, which no frame on that screen draws — the banner is
  audible, not visible (`PROJECT_STATE.md` § 6).
* The 3-2-1-GO countdown withholds frames from the session (4 × 45) rather than
  pausing it, so a counted run is bit-identical to an un-counted one. `advance()`
  emits one sound **per label change per call**: four 45-frame calls give
  `menu-move, menu-move, menu-confirm, menu-confirm`, one 180-frame call gives just
  `menu-confirm`. And its countdown branch consumes the whole batch, so frames past
  the end of the count are **discarded** rather than carried into the run — harmless
  for the app, which pumps one frame per animation tick, but a driver that batches
  frames must call `advance()` twice.
* **One key can hold two roles, and the screen decides which.** `Enter` (PAUSE) is
  CONFIRM outside a run, `Escape` (BACK) is PAUSE inside a live one, and `↑` (CURSOR
  UP) is a **clockwise turn** inside a live run — so `←` `→` `↓` `↑` drive a run and
  the same four keys drive every list. The role switch lives in `remap()`, not in the
  bindings table: `↑` stays a CURSOR UP row there (and ROTATE CW / ROTATE CCW stay on
  `X` / `Z`), and the in-run pause menu takes `↑` back the moment `menuActive()` is
  true. Counter-clockwise keeps its own keys because `↓` is already the soft drop, so
  the cursor cluster has no free key left. A remapped key's release edge never reaches
  the session (`input.ts` releases on the bound intent, which `playInput` ignores) —
  harmless, because rotation, pause and confirm are all press-only there.
* Pause and resume are sound-events, not just status edges: pausing gives
  `menu-confirm`, Escape-resume gives `menu-back` **twice** (once from `back()`, once
  from `resume()`), and a duel Enter-resume gives `menu-confirm` then `menu-back`.
  `blur()` pauses a live run, and while paused `advance()` returns before it reaches
  the session, so the stack is frozen.
* **Opening OPTIONS from the play pause menu drops the run** (documented: the record
  is editable there, so the session cannot survive it), and Back from OPTIONS lands on
  `play` with nothing behind it: no frame is drawn, every intent and pointer press
  returns false, `blur()` is a no-op, and `debug()` reports `status: null` with
  `level: 0`. `scenes-run.test.ts` pins that state with a `TODO(v0.1.2)` marker; the
  route out is a reload.
* **A player-two pause in a duel is drawn but not drivable by keyboard.** The gate
  that hands the keyboard to the pause menu asks side A alone, so player two's PAUSE
  key stops only side B while the frame — which asks either side — draws the shared
  PAUSED list over a still-falling side A. Enter there is swallowed, Escape resumes
  (`togglePause()` resumes *both* sides whenever either is paused), and the pointer is
  the only way to activate a row of that menu.
* `debug().status` is the live session status and is **null** outside play/duel; in a
  duel it is **side A's** status, which is why a side-B pause is invisible through
  this surface.
* Geometries (`listGeom(count, y, rowH, x, w)`): title/others `62,16,62,116`;
  modes `listGeom(n, 26, 13, 8, PANEL.w)`; rules `listGeom(n, 120, 14, 8, 110)` plus
  a seed-nudge rect `{x:150,y:120,w:74,h:22}` (`x < 168` → −1 else +1); confirm
  `listGeom(n, 90, 14, 40, SCREEN.w-80)`; results `listGeom(n, 122, 15, 62, 116)`.
  Options sliders use `barX = geom.x + geom.w - 74` with ratio `(x-barX)/42`;
  left/right of the row centre steps the value.
* Row text: title `PLAY / HIGH SCORES / OPTIONS`; rules `START RUN / MODE LIST`;
  play `RESUME / RESTART / OPTIONS / MODE LIST`; results `RUN AGAIN / MODE LIST`;
  confirm `ERASE EVERYTHING / KEEP MY RECORDS` (reset needs an explicit second
  choice).
* Two settings-screen layout facts a test now pins, because they are arithmetic rather
  than intent: the options grid (`{y: 25, rowH: 11}` × 14 rows) runs to y=179 on a
  160-px screen, so its last row is drawn off-screen and its bands cover the DONE
  button — a press on DONE on that screen steps a row instead of leaving; the controls
  editor uses `rowH: 9`, which clears DONE by about a pixel, so the identical click
  works there. See `PROJECT_STATE.md` § 6 before changing either grid.

## Shell layer (`src/app`) — the only DOM/WebAudio code

```ts
// loop.ts [U `loop.test.ts`, 16 tests]
const STEP_MS = 1000 / 60;  const MAX_CATCHUP = 4;
interface LoopOpts { stepMs?; maxCatchUp?; now?: () => number;
                     schedule?: (cb: (time: number) => void) => number; unschedule?: (h) => void }
interface Loop { start(): void; stop(): void; readonly running: boolean;
                 readonly steps: number; readonly ticks: number; reset(): void }
createLoop(onTick: (frames: number) => void, opts?: LoopOpts): Loop
```
Backlog past `MAX_CATCHUP` steps is **dropped**, not run — an unhitched tab cannot
fast-forward a session. `now`/`schedule` are injectable so a test never waits.

```ts
// input.ts [U `input.test.ts`, 24 tests]
interface InputHost {
  readonly canvas: HTMLCanvasElement;
  bindings(): Bindings;                       // live view, so a rebind applies at once
  dispatch(intent: Intent, down: boolean, player: 1 | 2): void;
  raw(code: string, down: boolean): boolean;  // true = the screen consumed it (key capture)
  toFramebuffer(clientX, clientY): { x; y } | null;
  pointer(x: number, y: number, action: 'hover' | 'press'): void;
  onGesture(): void; onFullscreenToggle(): void; onFocusLost(): void;
}
interface Input { dispose(): void }
attachInput(host: InputHost): Input
```
`SWALLOWED` = `Space ArrowUp ArrowDown ArrowLeft ArrowRight Enter NumpadEnter
Backspace` (prevents page scroll/chrome activation); `Tab` and `Escape` are
deliberately not swallowed, the first for shell navigation and the second because
the browser owns it in fullscreen — though `Escape` is bound to BACK in both
tables, so a mapped-key press still eats it before the browser sees it
(`PROJECT_STATE.md` § 6). Wheel has a 4-unit deadzone and maps up → ROTATE CW,
down → SOFT DROP, shift+wheel → HOLD, each as a press/release pair; the right
button rotates counter-clockwise, the middle button holds, and a left-button
press inside the field of play is a board tap. `event.repeat` is dropped so DAS
stays in the rules layer. Inside one map a code resolves to the intent whose row
comes first in `BINDABLE_INTENTS`, and player one's map is asked before player
two's — so `Enter` is player one's PAUSE and player two never receives a CONFIRM
press (§ 6).

```ts
// layout.ts [U `layout.test.ts`, 14 tests]
const FRAME = { w: 240, h: 160 }
computeScale(availW, availH, frameW = FRAME.w, frameH = FRAME.h): number  // floored, ≥1
cssSize(scale, frameW?, frameH?): { width: string; height: string }
interface LayoutOpts { measure?: () => { w; h }; onChange?: (scale: number) => void }
interface Layout { refresh(): void; toggleFullscreen(): void; readonly fullscreen: boolean;
                   readonly scale: number;
                   toFramebuffer(clientX, clientY): { x; y } | null; dispose(): void }
createLayout(...): Layout
```
The scale is floored, never rounded (1199×1600 → 4, because 1199/240 = 4.996 and
rounding would stretch the board); a broken measurement falls back to 1; `onChange`
fires once per real change; fullscreen degrades to windowed when the API (or its
webkit alias) is missing.

```ts
// main.ts — composition root, no exports
```
Builds `openSaveStore` → `configFor` → `createRenderer` → `createAudioEngine` →
`createLayout` → `createScenes` → `createLoop` → `attachInput`, and wires the
`SceneHost` callbacks to audio/persistence/announce. It publishes `window.__orbit`
(`scenes`, `store`, `layout`, `loop`, `renderer`, `audio`, `input`, `get status`)
**only when the URL carries `?test=1`**; a normal load exposes nothing.

## Browser test surface (`tests/e2e/playable.spec.ts`)

The 7 Playwright tests assert through `debug()` and the frame model, not
screenshots, so a palette tweak cannot make them flaky while an unpainted
playfield still fails. They cover: boot with no console/page errors and
`#boot-error` removed (polling — the first paint lands on the next
`requestAnimationFrame`, and an untouched backing store is one flat colour);
integer scaling across four viewports; keyboard title→modes→(rules|play)→play;
mouse-only navigation; wheel/right-click rotation with `window.scrollY` still 0;
player-facing text free of reference branding; a hidden tab pausing a live run.
