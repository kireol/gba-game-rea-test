import { describe, expect, it } from 'vitest';
import { EMPTY, GARBAGE, type SessionEvent } from '../engine/types.js';
import { cellsOf } from '../engine/pieces.js';
import { collides, fullRows, ghostY } from '../engine/board.js';
import { DEFAULT_CONFIG } from '../engine/config.js';
import { clearScore } from '../gameplay/score.js';
import {
  SEED,
  activeId,
  activeY,
  boxHeight,
  completeFloor,
  countType,
  emptyBoard,
  filledCells,
  fillRow,
  hardDrop,
  makeSession,
  of,
  poke,
  press,
  rowCells,
  seedShowing,
  tap,
  topFilledRow,
  view,
} from './helpers.js';
import type { ActivePiece, PieceId } from '../engine/types.js';
import type { Session } from '../gameplay/session.js';
import { goalLadderMode } from '../modes/goal-ladder.js';

const piece = (s: Session): ActivePiece => {
  const a = view(s).active;
  if (!a) throw new Error('expected an active piece');
  return a;
};

const namedSession = (want: PieceId): Session =>
  makeSession(goalLadderMode, seedShowing(want), { gravityTable: [1000] });

/**
 * Fills the bottom `rows` rows and then opens exactly the cells the active piece
 * is going to land in, so the drop completes them. `completeFloor` does the same
 * setup but waits the freeze out for you; the tests below watch the countdown
 * themselves, so they arm the field and drive the drop.
 */
const armFloor = (s: Session, rows = 1): void => {
  const snapshot = view(s);
  const a = piece(s);
  const landing = cellsOf(a, a.rot, 0, ghostY(snapshot.board, a) - a.y);
  for (let y = snapshot.board.rows - rows; y < snapshot.board.rows; y += 1) {
    fillRow(snapshot.board, y);
  }
  for (const cell of landing) poke(snapshot.board, cell.x, cell.y, EMPTY);
};

/** Incoming rows emit into the queue without stepping a frame, so drain it here. */
const garbage = (s: Session, rows: number): SessionEvent[] => {
  s.receiveGarbage(rows);
  return s.advance(0);
};

/** Stacks the field from the given array row down, leaving the piece's rows free. */
const fillFrom = (s: Session, topRow: number): void => {
  const { board } = view(s);
  for (let y = topRow; y < board.rows; y += 1) fillRow(board, y);
};

describe('clearing complete rows', () => {
  it('keeps the finished rows on the field until the freeze runs out', () => {
    const freeze = DEFAULT_CONFIG.clearFreezeFrames;
    const s = makeSession();
    armFloor(s);
    const dropped = hardDrop(s);
    expect(countType(dropped, 'lock')).toBe(1);
    expect(countType(dropped, 'lines')).toBe(0);
    expect(view(s).flash).toBe(freeze);
    expect(view(s).lines).toBe(0);

    expect(countType(s.advance(freeze - 1), 'lines')).toBe(0);
    expect(view(s).flash).toBe(1);
    expect(fullRows(view(s).board)).not.toEqual([]);

    const committed = s.advance(1);
    expect(of(committed, 'lines').map((event) => event.count)).toEqual([1]);
    expect(of(committed, 'sfx').map((event) => event.name)).toEqual(['clear']);
    expect(view(s).flash).toBe(0);
    expect(view(s).lines).toBe(1);
    expect(fullRows(view(s).board)).toEqual([]);
  });

  it('clears whole rows only and drops the debris above them by one', () => {
    const s = makeSession();
    const { board } = view(s);
    const floor = board.rows - 1;
    // Column 0 is outside every spawn box, so the piece cannot disturb it.
    poke(board, 0, floor - 2, GARBAGE);
    armFloor(s);
    hardDrop(s);
    expect(s.advance(DEFAULT_CONFIG.clearFreezeFrames).filter((e) => e.type === 'lines')).toHaveLength(1);
    expect(rowCells(board, floor - 1)[0]).toBe(GARBAGE);
    expect(rowCells(board, floor - 2)[0]).toBe(EMPTY);
  });

  it('totals the rows across several clears', () => {
    const s = makeSession();
    expect(of(completeFloor(s, 1), 'lines')[0]?.count).toBe(1);
    expect(view(s).lines).toBe(1);
    // A single-row clear leaves the clearing piece's own upper cells in the floor
    // row, so wipe the field rather than let this test depend on where they fell.
    emptyBoard(view(s).board);
    expect(of(completeFloor(s, 1), 'lines')[0]?.count).toBe(1);
    expect(view(s).lines).toBe(2);
    // Four short of the level goal, so the run is still on level 1.
    expect(view(s).level).toBe(1);
  });

  it('pays for all four rows of a line-piece clear and calls it the big one', () => {
    const s = namedSession('I');
    expect(activeId(s)).toBe('I');
    tap(s, 'rotate-cw', 0);
    expect(boxHeight(piece(s))).toBe(4);
    const events = completeFloor(s, 4);
    const [event] = of(events, 'lines');
    expect(event?.count).toBe(4);
    expect(event?.rows).toHaveLength(4);
    // Nothing but the line piece was in those rows, so the field comes out empty.
    expect(event?.perfect).toBe(true);
    expect(event?.score).toBe(clearScore(4, 1, true, 0).points);
    expect(of(events, 'sfx').map((name) => name.name)).toContain('clear-big');
    expect(view(s).lines).toBe(4);
    expect(fullRows(view(s).board)).toEqual([]);
  });

  it('does not flag a perfect clear when debris survives', () => {
    const s = makeSession();
    const { board } = view(s);
    poke(board, 0, board.rows - 3, GARBAGE);
    const [event] = of(completeFloor(s, 1), 'lines');
    expect(event?.count).toBe(1);
    expect(event?.perfect).toBe(false);
    expect(event?.score).toBe(clearScore(1, 1, false, 0).points);
  });

  it('carries the combo between clears and breaks it on a clear-free lock', () => {
    // What the payout does with the chain is pinned in `scoring.test.ts`; here the
    // claim is only that the session counts the chain and forgets it correctly.
    const s = makeSession();
    completeFloor(s, 1);
    expect(view(s).combo).toBe(1);
    // A single-row clear leaves the piece's upper cells behind, which would stop
    // the next piece reaching the floor row, so wipe the field between clears.
    emptyBoard(view(s).board);
    completeFloor(s, 1);
    expect(view(s).combo).toBe(2);
    expect(view(s).maxCombo).toBe(2);

    // On a wiped field a hard drop can only fill part of a row, so this lock is
    // the one that cuts the chain — and the best chain stays on record.
    emptyBoard(view(s).board);
    expect(countType(hardDrop(s), 'lines')).toBe(0);
    expect(view(s).combo).toBe(0);
    expect(view(s).maxCombo).toBe(2);
  });
});

describe('incoming rows', () => {
  it('raises the stack from the bottom and says how many rows came in', () => {
    const s = namedSession('I');
    const { board } = view(s);
    const cols = board.cols;
    poke(board, 0, board.rows - 1, GARBAGE);
    const events = garbage(s, 2);
    expect(of(events, 'garbage')).toEqual([{ type: 'garbage', rows: 2 }]);
    expect(of(events, 'sfx').map((event) => event.name)).toContain('garbage');
    expect(view(s).status).toBe('playing');
    // Every incoming row keeps exactly one hole, and the stack grew by two rows.
    expect(rowCells(board, board.rows - 1).filter((cell) => cell !== EMPTY)).toHaveLength(cols - 1);
    expect(topFilledRow(board)).toBe(board.rows - 3);
  });

  it('lifts a buried piece out of the incoming rows instead of ending the run', () => {
    const s = namedSession('I');
    fillFrom(s, 3);
    const before = activeY(s);
    const events = garbage(s, 1);
    expect(of(events, 'status')).toEqual([]);
    expect(view(s).status).toBe('playing');
    expect(activeY(s)).toBe(before - 1);
    expect(collides(view(s).board, piece(s))).toBe(false);
  });

  it('ends the run when no lift can keep the piece inside the field', () => {
    // Row 0 is the only row the stack has not reached, so the piece would need a
    // lift that puts it above the top row: the guard has to call that a top-out
    // instead of letting the piece hang outside the field and keep playing.
    const s = makeSession(goalLadderMode, SEED, { gravityTable: [1000] });
    fillFrom(s, DEFAULT_CONFIG.hiddenRows);
    const events = garbage(s, 1);
    expect(of(events, 'status').map((event) => event.status)).toEqual(['lost']);
    expect(view(s).status).toBe('lost');
  });

  it('ends the run when incoming rows reach the top of the field', () => {
    const s = makeSession();
    // One row more than the field is tall: `pushBottomRow` only reports an
    // overflow when row 0 is already occupied, so exactly `rows` pushes fill the
    // field without losing anything.
    const events = garbage(s, view(s).board.rows + 1);
    expect(of(events, 'status').map((event) => event.status)).toEqual(['lost']);
    expect(of(events, 'sfx').map((event) => event.name)).toContain('lose');
    expect(view(s).status).toBe('lost');
  });

  it('refuses incoming rows once the run is over', () => {
    const s = makeSession();
    garbage(s, view(s).board.rows + 1);
    expect(view(s).status).toBe('lost');
    const before = filledCells(view(s).board);
    expect(garbage(s, 1)).toHaveLength(0);
    expect(filledCells(view(s).board)).toBe(before);
  });
});

describe('game over', () => {
  it('ends the run when a piece locks entirely inside the hidden rows', () => {
    const s = namedSession('I');
    fillFrom(s, 3);
    // The incoming row raises the line piece into the hidden band; locking it
    // there is the top-out, and it outranks the full rows underneath it.
    garbage(s, 1);
    expect(activeY(s)).toBe(1);
    const events = hardDrop(s);
    expect(countType(events, 'lock')).toBe(1);
    expect(countType(events, 'lines')).toBe(0);
    expect(of(events, 'sfx').map((event) => event.name)).toEqual([
      'hard-drop',
      'lock',
      'lose',
    ]);
    expect(view(s).active).toBeNull();
    expect(view(s).status).toBe('lost');
  });

  it('ends the run when the next piece has nowhere to spawn', () => {
    const s = makeSession(goalLadderMode, SEED, { gravityTable: [1000] });
    fillFrom(s, DEFAULT_CONFIG.hiddenRows);
    const events = press(s, 'hold', 1);
    expect(of(events, 'spawn')).toHaveLength(1);
    expect(of(events, 'status').map((event) => event.status)).toEqual(['lost']);
    expect(of(events, 'sfx').map((event) => event.name)).toContain('lose');
    expect(view(s).status).toBe('lost');
  });
});
