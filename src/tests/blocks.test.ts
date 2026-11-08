import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../engine/config.js';
import {
  EMPTY,
  GARBAGE,
  PIECE_IDS,
  STAR,
  cellOf,
  type ActivePiece,
  type Cell,
  type SessionEvent,
} from '../engine/types.js';
import { cellsOf } from '../engine/pieces.js';
import { createBoard, ghostY, set } from '../engine/board.js';
import { clearScore } from '../gameplay/score.js';
import type { Session } from '../gameplay/session.js';
import { linkedBlocksMode } from '../modes/linked-blocks.js';
import {
  SEED,
  awaitActive,
  dropToFloor,
  emptyBoard,
  filledCells,
  fillRow,
  hardDrop,
  makeSession,
  of,
  poke,
  rowCells,
  seedShowing,
  starRowCount,
  steer,
  tap,
  view,
} from './helpers.js';

/**
 * The two non-piece block kinds: what they are, and what they do in a run.
 *
 * The board primitives themselves (`fullRows`, `pushBottomRow`,
 * `floodSameColour`) are owned by `board.test.ts`, and the incoming-row mechanics
 * by `lines.test.ts`, so nothing here re-tests a board function on its own. What
 * this suite pins is the part only these two kinds have: they are deliberately
 * outside the seven piece colours, which is what keeps a clear from chaining
 * through a garbage stack, and what makes a star row the level trigger in the
 * mode that owns both of them.
 *
 * FUSION is the vehicle for the run-level cases because it is the only mode that
 * reacts to either kind; every field below is built by hand so the shape is
 * explicit, and none of the assertions depend on FUSION's own quota.
 */

const COLS = DEFAULT_CONFIG.cols;
const FLOOR = DEFAULT_CONFIG.visibleRows + DEFAULT_CONFIG.hiddenRows - 1;

const fusion = (seed = SEED): Session => makeSession(linkedBlocksMode, seed);

const levels = (events: readonly SessionEvent[]): number[] =>
  of(events, 'level-up').map((event) => event.level);

const goalLeft = (s: Session): number | undefined => view(s).goal?.numeric;

/** One row of blocks, `hole` columns left empty. */
const solidRow = (s: Session, y: number, hole: number, cell: Cell): void => {
  fillRow(view(s).board, y, [hole], cell);
};

/**
 * Turns the opening line piece upright in `column` without dropping it, so the
 * caller can build a field whose only hole sits exactly under it: a vertical line
 * is the one shape that reaches a single hole in an otherwise solid floor row.
 * The upright rotation's cells may sit on `x` or `x + 1`, so the box target is
 * derived from the piece instead of assumed.
 */
const standLineIn = (s: Session, column: number): void => {
  const vertical = (a: ActivePiece): boolean =>
    a.id === 'I' && new Set(cellsOf(a).map((cell) => cell.y)).size === 4;
  for (let turn = 0; turn < 4; turn += 1) {
    const a = view(s).active;
    if (!a) throw new Error('standLineIn: no active piece');
    if (vertical(a)) {
      steer(s, column - ((cellsOf(a)[0]?.x ?? 0) - a.x));
      return;
    }
    tap(s, 'rotate-cw');
  }
  throw new Error('standLineIn: never found an upright line');
};

/** Drops the standing line into the hole and waits for the clear to commit. */
const dropIntoHole = (s: Session): SessionEvent[] => {
  const collected = hardDrop(s);
  const freeze = view(s).flash;
  if (freeze > 0) collected.push(...s.advance(freeze));
  return collected;
};

describe('the special kinds are blocks, not pieces', () => {
  it('sit outside the seven piece colours', () => {
    const colours = PIECE_IDS.map((id) => cellOf(id));
    expect(new Set(colours)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    for (const special of [GARBAGE, STAR]) {
      expect(special).not.toBe(EMPTY);
      // The same-kind rule seeds on `1..7`, and the renderer picks a tile per
      // value: either collision would silently turn a special block into a piece.
      expect(colours, `value ${special} is claimed by a piece`).not.toContain(special);
    }
  });

  it('never come out of a piece', () => {
    const s = fusion(seedShowing('I'));
    emptyBoard(view(s).board);
    for (let piece = 0; piece < 6; piece += 1) {
      dropToFloor(s);
      awaitActive(s);
    }
    expect(view(s).status).toBe('playing');
    expect(filledCells(view(s).board)).toBeGreaterThan(0);
    const colours = new Set<number>(PIECE_IDS.map((id) => cellOf(id)));
    for (const cell of Array.from(view(s).board.cells)) {
      expect(cell === EMPTY || colours.has(cell), `locked value ${cell}`).toBe(true);
    }
  });

  it('hold a piece up like any other block', () => {
    const board = createBoard(4, 6);
    set(board, 1, 3, STAR);
    // The whole point of a star row is that it has to be cleared out, never
    // pushed through or sunk into.
    expect(ghostY(board, { id: 'O', rot: 0, x: 1, y: 0 })).toBe(1);
  });
});

describe('garbage blocks in a run', () => {
  /**
   * Fills the floor row with `cell`, leaving one hole that the upright line then
   * fills, and returns what that single clear paid.
   */
  const oneLineOf = (cell: Cell): { gain: number; events: SessionEvent[] } => {
    const s = fusion(seedShowing('I'));
    emptyBoard(view(s).board);
    standLineIn(s, COLS - 1);
    solidRow(s, FLOOR, COLS - 1, cell);
    const events = dropIntoHole(s);
    expect(of(events, 'lines').map((event) => event.count)).toEqual([1]);
    // The event carries what this clear paid, not the running total.
    return { gain: of(events, 'lines')[0]?.score ?? -1, events };
  };

  it('are an ordinary line, at the ordinary price', () => {
    const garbage = oneLineOf(GARBAGE);
    const pieces = oneLineOf(cellOf('J'));
    // The line that completes the row is pulled into its own clear by the
    // same-kind rule, so the field is left empty and both fills pay alike.
    expect(garbage.gain).toBe(clearScore(1, 1, true, 0).points);
    // Digging garbage out must not pay more or less than clearing piece blocks:
    // incoming rows are an attack, not a bonus.
    expect(garbage.gain).toBe(pieces.gain);
    expect(levels(garbage.events)).toEqual([]);
  });

  it('are not a kind a clear chains through', () => {
    const s = fusion(seedShowing('I'));
    const board = view(s).board;
    emptyBoard(board);
    standLineIn(s, COLS - 1);
    solidRow(s, FLOOR, COLS - 1, GARBAGE);
    // A tower of garbage standing on the row that is about to clear. If garbage
    // counted as a seedable kind, this tower would be worth two extra cells.
    poke(board, COLS - 2, FLOOR - 1, GARBAGE);
    poke(board, COLS - 2, FLOOR - 2, GARBAGE);
    const events = dropIntoHole(s);

    expect(of(events, 'lines').map((event) => event.count)).toEqual([1]);
    expect(of(events, 'level-up')).toEqual([]);
    // The row collapses once, so the tower is still there, one row lower.
    expect(rowCells(board, FLOOR)[COLS - 2]).toBe(GARBAGE);
    expect(rowCells(board, FLOOR - 1)[COLS - 2]).toBe(GARBAGE);
    expect(rowCells(board, FLOOR - 2)[COLS - 2]).toBe(EMPTY);
    // Two cells and nothing else: the line that finished the row was taken whole
    // by its own colour, while the garbage it touched stayed where it was.
    expect(filledCells(board)).toBe(2);
    // With no star blocks in the field the countdown reads empty, not a full row.
    expect(goalLeft(s)).toBe(0);
  });
});

describe('star blocks in a run', () => {
  /**
   * Builds a star row out of star blocks the mode never pushed in, with one lone
   * star sitting on top of it, then clears it with the upright line.
   */
  const starRowBuiltByHand = (): { s: Session; events: SessionEvent[] } => {
    const s = fusion(seedShowing('I'));
    const board = view(s).board;
    emptyBoard(board);
    standLineIn(s, COLS - 1);
    solidRow(s, FLOOR, COLS - 1, STAR);
    poke(board, COLS - 2, FLOOR - 1, STAR);
    return { s, events: dropIntoHole(s) };
  };

  it('raise the level from any row, not just the one the mode pushed in', () => {
    const { s, events } = starRowBuiltByHand();
    const board = view(s).board;

    expect(of(events, 'lines').map((event) => event.count)).toEqual([1]);
    expect(levels(events)).toEqual([2]);
    expect(view(s).level).toBe(2);
    expect(view(s).status).toBe('playing');
    // The mode answers with a fresh layer, so the climb has a floor to dig into.
    expect(of(events, 'garbage')).toEqual([]);
    expect(rowCells(board, FLOOR).filter((cell) => cell === STAR)).toHaveLength(6);
    expect(rowCells(board, FLOOR).filter((cell) => cell === EMPTY)).toHaveLength(4);
    for (const y of [FLOOR - 1, FLOOR - 2]) {
      expect(rowCells(board, y).filter((cell) => cell === GARBAGE), `row ${y}`).toHaveLength(9);
    }
    expect(goalLeft(s)).toBe(4);
  });

  it('do not chain together, and the countdown reads the lowest star row', () => {
    const { s, events } = starRowBuiltByHand();
    const board = view(s).board;

    expect(of(events, 'lines').map((event) => event.count)).toEqual([1]);
    // Six stars in the fresh row, plus the lone one above the row that cleared:
    // star blocks fill a line, they are not a kind that clumps and goes with it.
    expect(starRowCount(board)).toBe(7);
    // It rode the collapse down and the three new rows up, still one block.
    expect(rowCells(board, FLOOR - 3)[COLS - 2]).toBe(STAR);
    // The stray star is three rows above the live row and would read eight holes
    // if the countdown scanned from the top instead of the bottom.
    expect(goalLeft(s)).toBe(4);
  });

  it('follow the row when the stack is lifted', () => {
    const s = fusion();
    const board = view(s).board;
    expect(rowCells(board, FLOOR).filter((cell) => cell === STAR)).toHaveLength(6);

    s.receiveGarbage(1);
    const events = s.advance(0);

    expect(of(events, 'garbage').map((event) => event.rows)).toEqual([1]);
    expect(rowCells(board, FLOOR).filter((cell) => cell === GARBAGE)).toHaveLength(9);
    expect(rowCells(board, FLOOR - 1).filter((cell) => cell === STAR)).toHaveLength(6);
    expect(starRowCount(board)).toBe(6);
    // The countdown counts holes in the row, wherever that row currently is.
    expect(goalLeft(s)).toBe(4);
  });
});
