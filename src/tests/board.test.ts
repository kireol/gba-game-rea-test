import { describe, expect, it } from 'vitest';
import {
  clearCells,
  clearRows,
  cloneBoard,
  collides,
  countRow,
  createBoard,
  floodSameColour,
  fullRows,
  ghostY,
  idx,
  inside,
  isEmpty,
  isTopOut,
  place,
  pushBottomRow,
  set,
  at,
} from '../engine/board.js';
import { GARBAGE, STAR, cellOf, EMPTY, type ActivePiece, type Board } from '../engine/types.js';
import { spawnPiece } from '../engine/pieces.js';

/** Builds a board from `source[row][column]`, `source[0]` being the topmost row. */
const fromRows = (source: readonly (readonly number[])[]): Board => {
  const cols = source[0]?.length ?? 0;
  const board = createBoard(cols, source.length);
  source.forEach((row, y) => row.forEach((value, x) => set(board, x, y, value)));
  return board;
};

const toRows = (board: Board): number[][] =>
  Array.from({ length: board.rows }, (_, y) =>
    Array.from(board.cells.slice(y * board.cols, (y + 1) * board.cols)),
  );

const oAt = (x: number, y: number): ActivePiece => ({ id: 'O', rot: 0, x, y });

describe('board layout', () => {
  it('starts empty and knows its bounds', () => {
    const board = createBoard(4, 6);
    expect(board.cells.length).toBe(24);
    expect(isEmpty(board)).toBe(true);
    expect(inside(board, 3, 5)).toBe(true);
    expect(inside(board, 4, 5)).toBe(false);
    expect(inside(board, -1, 0)).toBe(false);
    expect(at(board, 99, 99)).toBe(EMPTY);
  });

  it('clones without sharing the buffer', () => {
    const board = createBoard(2, 2);
    const copy = cloneBoard(board);
    set(copy, 0, 0, 5);
    expect(at(board, 0, 0)).toBe(EMPTY);
  });
});

describe('collision', () => {
  const board = createBoard(4, 6);

  it('blocks the left and right walls', () => {
    expect(collides(board, oAt(-1, 0))).toBe(true);
    expect(collides(board, oAt(3, 0))).toBe(true);
    expect(collides(board, oAt(2, 0))).toBe(false);
  });

  it('blocks the floor but allows cells above the field', () => {
    expect(collides(board, oAt(0, 5))).toBe(true);
    expect(collides(board, oAt(0, 4))).toBe(false);
    expect(collides(board, oAt(0, -1))).toBe(false);
  });

  it('blocks against stacked cells', () => {
    const filled = createBoard(4, 6);
    set(filled, 1, 1, GARBAGE);
    expect(collides(filled, oAt(0, 0))).toBe(true);
    expect(collides(filled, oAt(2, 0))).toBe(false);
  });

  it('treats an occupied spawn box as a top-out', () => {
    const wide = createBoard(10, 22);
    const piece = spawnPiece('T', { cols: 10, hiddenRows: 2 });
    expect(isTopOut(wide, piece)).toBe(false);
    for (let y = 2; y < 4; y += 1) for (let x = 0; x < 10; x += 1) set(wide, x, y, GARBAGE);
    expect(isTopOut(wide, piece)).toBe(true);
  });
});

describe('placing', () => {
  it('writes the piece colour and reports cells left above the field', () => {
    const board = createBoard(4, 6);
    const above = place(board, oAt(0, -1), cellOf('O'));
    expect(above).toBe(2);
    expect(toRows(board)).toEqual([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });
});

describe('full rows', () => {
  it('needs every column and counts garbage and stars as blocks', () => {
    const board = fromRows([
      [1, 0],
      [GARBAGE, STAR],
      [1, 0],
    ]);
    expect(fullRows(board)).toEqual([1]);
    expect(countRow(board, 1)).toBe(2);
    expect(countRow(board, 0)).toBe(1);
  });
});

describe('clearing and collapsing', () => {
  it('drops one column when a single cell is removed', () => {
    const board = fromRows([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    expect(clearCells(board, [idx(board, 0, 1)])).toBe(1);
    expect(toRows(board).map((row) => row[0])).toEqual([EMPTY, 1, 3, 4]);
  });

  it('drops a column once per removed row when the rows are not adjacent', () => {
    const board = fromRows([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    expect(clearCells(board, [idx(board, 0, 1), idx(board, 0, 3)])).toBe(2);
    expect(toRows(board).map((row) => row[0])).toEqual([EMPTY, EMPTY, 1, 3]);
  });

  it('removes whole rows across every column', () => {
    const board = fromRows([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    expect(clearRows(board, [1, 3])).toBe(2);
    expect(toRows(board)).toEqual([
      [EMPTY, EMPTY],
      [EMPTY, EMPTY],
      [1, 1],
      [3, 3],
    ]);
  });

  it('does nothing for an empty selection', () => {
    const board = fromRows([[1, 1]]);
    expect(clearCells(board, [])).toBe(0);
    expect(clearRows(board, [])).toBe(0);
  });
});

describe('rising rows', () => {
  it('lifts the stack and leaves the requested holes empty', () => {
    const board = fromRows([
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ]);
    expect(pushBottomRow(board, GARBAGE, [2])).toBe(0);
    expect(toRows(board)).toEqual([
      [1, 1, 1],
      [2, 2, 2],
      [GARBAGE, GARBAGE, EMPTY],
    ]);
  });

  it('reports overflow when the topmost hidden row is occupied', () => {
    const board = fromRows([
      [STAR, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(pushBottomRow(board, GARBAGE, [0])).toBe(1);
  });
});

describe('ghost row', () => {
  it('finds the lowest legal box row', () => {
    const board = createBoard(4, 6);
    expect(ghostY(board, oAt(1, 0))).toBe(4);
  });

  it('stops on top of the stack', () => {
    const board = createBoard(4, 6);
    set(board, 1, 3, GARBAGE);
    expect(ghostY(board, oAt(1, 0))).toBe(1);
  });
});

describe('same-kind flood', () => {
  const board = fromRows([
    [1, 1, 0],
    [0, 1, 0],
    [2, 2, 1],
  ]);

  it('follows orthogonally connected cells of one value only', () => {
    const group = floodSameColour(board, [{ x: 0, y: 0 }]);
    expect([...group].sort((a, b) => a - b)).toEqual([0, 1, 4]);
    expect(group.has(idx(board, 2, 2))).toBe(false);
  });

  it('floods from every seed', () => {
    const group = floodSameColour(board, [{ x: 0, y: 0 }, { x: 0, y: 2 }]);
    expect([...group].sort((a, b) => a - b)).toEqual([0, 1, 4, 6, 7]);
  });

  it('ignores empty seeds', () => {
    expect(floodSameColour(board, [{ x: 2, y: 0 }]).size).toBe(0);
  });
});
