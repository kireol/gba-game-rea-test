import { DEFAULT_CONFIG, type GameConfig } from '../engine/config.js';
import {
  EMPTY,
  GARBAGE,
  STAR,
  type ActivePiece,
  type Board,
  type Cell,
  type Difficulty,
  type Intent,
  type PieceId,
  type SessionEvent,
} from '../engine/types.js';
import { cellsOf } from '../engine/pieces.js';
import { ghostY } from '../engine/board.js';
import { createSession, type Session, type SessionView } from '../gameplay/session.js';
import { queueFrom } from '../engine/random.js';
import { goalLadderMode } from '../modes/goal-ladder.js';
import type { ModePlugin } from '../modes/types.js';

/** Fixed seed for every mechanics test; the determinism suite proves why. */
export const SEED = 0x5eed1234;

export const configWith = (over: Partial<GameConfig> = {}): GameConfig => ({
  ...DEFAULT_CONFIG,
  ...over,
});

/**
 * A session with its event queue already drained. The constructor deals the first
 * piece, so `spawn` events are pending before the caller receives the object; every
 * test here asserts on what *its own* input caused, so that opening batch is
 * discarded. A session suite that wants to see it goes through `createSession`.
 */
export const makeSession = (
  mode: ModePlugin = goalLadderMode,
  seed = SEED,
  over: Partial<GameConfig> = {},
  difficulty: Difficulty = 2,
): Session => {
  const s = createSession({ mode, seed, config: configWith(over), difficulty });
  s.advance(0);
  return s;
};

/**
 * `advance()` drains the queue even for a zero-frame step, and an intent that is
 * applied on the key-down (`hard-drop`, `rotate`, `hold`, the first `left`) emits
 * inside `input()`. So every helper that touches `input()` has to hand the drained
 * events back or the caller loses them.
 */
export const press = (s: Session, intent: Intent, frames = 0): SessionEvent[] => {
  s.input(intent, true);
  return s.advance(frames);
};

export const release = (s: Session, intent: Intent, frames = 0): SessionEvent[] => {
  s.input(intent, false);
  return s.advance(frames);
};

/** Taps an intent for one frame, then releases it. */
export const tap = (s: Session, intent: Intent, frames = 1): SessionEvent[] => [
  ...press(s, intent, frames),
  ...release(s, intent),
];

export const view = (s: Session): SessionView => s.snapshot();

export const activeRot = (s: Session): number => view(s).active?.rot ?? -1;
export const activeId = (s: Session): PieceId | null => view(s).active?.id ?? null;
export const activeX = (s: Session): number => view(s).active?.x ?? NaN;
export const activeY = (s: Session): number => view(s).active?.y ?? NaN;

export const countType = (events: readonly { type: string }[], type: string): number =>
  events.filter((event) => event.type === type).length;

/** Narrows a session event list to one variant, for field-level assertions. */
export const of = <T extends SessionEvent['type']>(
  events: readonly SessionEvent[],
  type: T,
): Extract<SessionEvent, { type: T }>[] =>
  events.filter(
    (event): event is Extract<SessionEvent, { type: T }> => event.type === type,
  );

/** Advances one frame at a time until `type` shows up, or the cap is hit. */
export const advanceUntil = (
  s: Session,
  type: SessionEvent['type'],
  cap = 4000,
): { frames: number; events: SessionEvent[] } => {
  for (let frame = 1; frame <= cap; frame += 1) {
    const events = s.advance(1);
    if (events.some((event) => event.type === type)) return { frames: frame, events };
  }
  throw new Error(`no "${type}" event within ${cap} frames`);
};

/**
 * Test-only board writing. The board's `Uint8Array` is intentionally shared with
 * the caller (the renderer reads the same buffer), so poking it steers a run
 * without reaching into any private session state.
 */
export const poke = (board: Board, x: number, y: number, cell: Cell): void => {
  board.cells[y * board.cols + x] = cell;
};

/** Array rows are `0..rows-1`; row `rows-1` is the visible floor. */
export const fillRow = (board: Board, y: number, skip: readonly number[] = [], cell: Cell = GARBAGE): void => {
  for (let x = 0; x < board.cols; x += 1) {
    poke(board, x, y, skip.includes(x) ? EMPTY : cell);
  }
};

export const rowCells = (board: Board, y: number): number[] =>
  Array.from(board.cells.slice(y * board.cols, (y + 1) * board.cols));

export const starRowCount = (board: Board): number =>
  Array.from(board.cells).filter((cell) => cell === STAR).length;

export const filledCells = (board: Board): number =>
  Array.from(board.cells).filter((cell) => cell !== EMPTY).length;

/** Highest array row that still holds a block, or `-1` when the field is empty. */
export const topFilledRow = (board: Board): number => {
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) if (board.cells[y * board.cols + x] !== EMPTY) return y;
  }
  return -1;
};

export const emptyBoard = (board: Board): void => {
  board.cells.fill(EMPTY);
};

/**
 * Completes the bottom `rows` rows with the piece that is currently active and
 * returns everything it emitted, including the `lines` event (the helper waits out
 * the clear freeze for you).
 *
 * The trick is that the piece may not be blocked on its way down: the rows are
 * filled first, then exactly the cells the piece will land in are opened, so the
 * column above each of them stays free. That keeps the landing position identical
 * to the ghost projection on an empty board. `rows` therefore has to stay within
 * the piece's own height — pass a line piece rotated vertically for four.
 */
export const completeFloor = (s: Session, rows = 1): SessionEvent[] => {
  const snapshot = view(s);
  const piece = snapshot.active;
  if (!piece) throw new Error('completeFloor: no active piece');
  const height = boxHeight(piece);
  const count = Math.max(1, Math.min(rows, height));
  const landing = cellsOf(piece, piece.rot, 0, ghostY(snapshot.board, piece) - piece.y);
  const lowest = Math.max(...landing.map((cell) => cell.y));
  if (lowest !== snapshot.board.rows - 1) {
    throw new Error('completeFloor: the active piece does not reach the floor row');
  }
  for (let y = snapshot.board.rows - count; y < snapshot.board.rows; y += 1) fillRow(snapshot.board, y);
  for (const cell of landing) poke(snapshot.board, cell.x, cell.y, EMPTY);
  const collected = hardDrop(s);
  const freeze = view(s).flash;
  // `advance()` returns (and thereby drains) the batch it stepped through, so its
  // result is the only place these events exist; `events()` afterwards is empty.
  if (freeze > 0) collected.push(...s.advance(freeze));
  // The next piece only enters after the spawn delay, and callers may want to
  // clear again right away, so wait for it here too.
  for (let guard = 0; guard < 120 && !view(s).active; guard += 1) {
    collected.push(...s.advance(1));
  }
  return collected;
};

/** Drops the active piece onto the floor without completing a row. */
export const dropToFloor = (s: Session): SessionEvent[] => hardDrop(s);

/**
 * Waits out the spawn delay after a lock, so the caller can act on the piece that
 * follows. A lock clears `active` immediately but the next piece only arrives
 * after `spawnDelayFrames`, which zero-frame input helpers never advance through.
 */
export const awaitActive = (s: Session, cap = 120): SessionEvent[] => {
  const events: SessionEvent[] = [];
  for (let guard = 0; guard < cap && !view(s).active; guard += 1) {
    events.push(...s.advance(1));
  }
  if (!view(s).active) {
    throw new Error(`awaitActive: no piece spawned within ${cap} frames (status ${view(s).status})`);
  }
  return events;
};

/** Box rows the piece actually occupies in its current rotation (1 for a flat line). */
export const boxHeight = (piece: ActivePiece): number =>
  Math.max(...cellsOf(piece).map((cell) => cell.y)) - piece.y + 1;

/** Drops the active piece straight down, returning everything it emitted. */
export const hardDrop = (s: Session): SessionEvent[] => [
  ...press(s, 'hard-drop'),
  ...release(s, 'hard-drop'),
];

/**
 * Moves the piece one column per tap, without advancing a single frame: the move
 * happens on key-down and `dasFrames` never elapses, so the piece lands exactly
 * where the caller asked and the frame counters in timing tests stay meaningful.
 */
export const steer = (s: Session, column: number): SessionEvent[] => {
  const events: SessionEvent[] = [];
  for (let guard = 0; activeX(s) !== column; guard += 1) {
    if (guard > 32 || !view(s).active) {
      throw new Error(`steer: cannot reach column ${column}`);
    }
    const step: Intent = column < activeX(s) ? 'left' : 'right';
    events.push(...tap(s, step, 0));
  }
  return events;
};

/** Moves the piece to a column, then drops it. Assumes the path is clear. */
export const dropAt = (s: Session, column: number): SessionEvent[] => [
  ...steer(s, column),
  ...hardDrop(s),
];

/**
 * A seed whose bag has `want` at index `slot` (0 = the opening piece), so a test
 * can name the piece it drops instead of hard-coding a lucky seed number.
 *
 * The search strides through seeds by the golden-ratio constant rather than
 * walking 1, 2, 3, ...: consecutive mulberry32 seeds produce near-identical first
 * outputs, so a linear scan hits one identity over and over and needed thousands
 * of tries for the rarer pieces.
 */
export const seedShowing = (want: PieceId, slot = 0): number => {
  for (let i = 1; i <= 65536; i += 1) {
    const seed = Math.imul(i, 0x9e3779b9) >>> 0;
    if (queueFrom(seed, slot + 1)[slot] === want) return seed;
  }
  throw new Error(`no seed below 65536 strides has ${want} at bag index ${slot}`);
};
