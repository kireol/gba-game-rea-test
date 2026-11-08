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

export const makeSession = (
  mode: ModePlugin = goalLadderMode,
  seed = SEED,
  over: Partial<GameConfig> = {},
  difficulty: Difficulty = 2,
): Session => createSession({ mode, seed, config: configWith(over), difficulty });

export const press = (s: Session, intent: Intent, frames = 0): void => {
  s.input(intent, true);
  s.advance(frames);
};

export const release = (s: Session, intent: Intent, frames = 0): void => {
  s.input(intent, false);
  s.advance(frames);
};

/** Taps an intent for one frame, then releases it. */
export const tap = (s: Session, intent: Intent, frames = 1): void => {
  press(s, intent, frames);
  release(s, intent);
};

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
 * Fills the floor row, opens exactly the cells the active piece will land in, then
 * hard-drops it so the row completes and clears. Needs a clear landing zone, so
 * callers that want exactly one cleared row should `emptyBoard` first.
 */
export const completeFloor = (s: Session): SessionEvent[] => {
  const snapshot = view(s);
  const piece = snapshot.active;
  if (!piece) throw new Error('completeFloor: no active piece');
  const floor = snapshot.board.rows - 1;
  const landing = cellsOf(piece, piece.rot, 0, ghostY(snapshot.board, piece) - piece.y);
  if (!landing.some((cell) => cell.y === floor)) {
    throw new Error('completeFloor: the active piece does not reach the floor row');
  }
  fillRow(snapshot.board, floor);
  for (const cell of landing) {
    if (cell.y === floor) poke(snapshot.board, cell.x, cell.y, EMPTY);
  }
  hardDrop(s);
  return s.events();
};

/** Drops the active piece onto the floor without completing a row. */
export const dropToFloor = (s: Session): SessionEvent[] => {
  hardDrop(s);
  return s.events();
};

/** Box rows the piece actually occupies in its current rotation (1 for a flat line). */
export const boxHeight = (piece: ActivePiece): number =>
  Math.max(...cellsOf(piece).map((cell) => cell.y)) - piece.y + 1;

/** Drops the active piece straight down. */
export const hardDrop = (s: Session): void => {
  press(s, 'hard-drop');
  release(s, 'hard-drop');
};

/** Moves the piece to a column, then drops it. Assumes the path is clear. */
export const dropAt = (s: Session, column: number): void => {
  const current = activeX(s);
  const step = column < current ? 'left' : 'right';
  for (let i = 0; i < Math.abs(column - current); i += 1) {
    press(s, step as Intent);
    release(s, step as Intent);
  }
  hardDrop(s);
};

/**
 * Smallest seed whose first bag piece is `want`, so a test can name the piece it
 * drops without hard-coding a lucky seed.
 */
export const seedShowing = (want: PieceId): number => {
  for (let seed = 1; seed < 100000; seed += 1) {
    if (queueFrom(seed, 1)[0] === want) return seed;
  }
  throw new Error(`no seed below 100000 opens with ${want}`);
};
