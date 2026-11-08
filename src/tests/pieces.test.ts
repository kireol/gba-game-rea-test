import { describe, expect, it } from 'vitest';
import { BOX, cellsOf, shapeFor, spawnCol, spawnPiece, statesFor } from '../engine/pieces.js';
import { PIECE_IDS, type PieceId, type Vec } from '../engine/types.js';

/** Rotation states as a sorted `"x,y"` list, so ordering never leaks into an assertion. */
const key = (cells: readonly Vec[]): string =>
  cells
    .map((cell) => `${cell.x},${cell.y}`)
    .sort()
    .join(' ');

const keys = (id: PieceId): string[] => statesFor(id).map(key);

describe('rotation states', () => {
  it('gives every piece four states of four cells inside its own box', () => {
    for (const id of PIECE_IDS) {
      const states = statesFor(id);
      expect(states).toHaveLength(4);
      for (const state of states) {
        expect(state).toHaveLength(4);
        expect(new Set(state.map((cell) => `${cell.x},${cell.y}`)).size).toBe(4);
        for (const cell of state) {
          expect(cell.x).toBeGreaterThanOrEqual(0);
          expect(cell.x).toBeLessThan(BOX[id]);
          expect(cell.y).toBeGreaterThanOrEqual(0);
          expect(cell.y).toBeLessThan(BOX[id]);
        }
      }
    }
  });

  it('rotates the line piece through the box positions the reference measured', () => {
    expect(keys('I')).toEqual([
      '0,0 1,0 2,0 3,0',
      '3,0 3,1 3,2 3,3',
      '0,3 1,3 2,3 3,3',
      '0,0 0,1 0,2 0,3',
    ]);
  });

  it('keeps the square identical in all four states', () => {
    const states = new Set(keys('O'));
    expect([...states]).toEqual(['0,0 0,1 1,0 1,1']);
  });

  it('spins the T nub-down, nub-left, nub-up, nub-right', () => {
    expect(keys('T')).toEqual([
      '0,0 1,0 1,1 2,0',
      '1,1 2,0 2,1 2,2',
      '0,2 1,1 1,2 2,2',
      '0,0 0,1 0,2 1,1',
    ]);
  });

  it('matches the base picture in state 0 for every piece', () => {
    const base: Record<PieceId, string> = {
      I: '0,0 1,0 2,0 3,0',
      O: '0,0 0,1 1,0 1,1',
      T: '0,0 1,0 1,1 2,0',
      S: '0,1 1,0 1,1 2,0',
      Z: '0,0 1,0 1,1 2,1',
      J: '0,0 0,1 1,1 2,1',
      L: '0,1 1,1 2,0 2,1',
    };
    for (const id of PIECE_IDS) expect(key(statesFor(id)[0] ?? [])).toBe(base[id]);
  });

  it('uses four distinct states for everything but the square', () => {
    for (const id of PIECE_IDS) {
      const distinct = new Set(keys(id));
      expect(distinct.size).toBe(id === 'O' ? 1 : 4);
    }
  });

  it('reports the box side it actually rotates with', () => {
    expect(shapeFor('I').box).toBe(4);
    expect(shapeFor('O').box).toBe(2);
    expect(shapeFor('T').box).toBe(3);
  });
});

describe('cells in board coordinates', () => {
  it('offsets the box by the piece position', () => {
    const piece = { id: 'T', rot: 0, x: 2, y: 5 } as const;
    expect(key(cellsOf(piece))).toBe('2,5 3,5 3,6 4,5');
  });

  it('can be asked for a rotation the piece has not taken yet', () => {
    const piece = { id: 'I', rot: 0, x: 3, y: 2 } as const;
    expect(key(cellsOf(piece, 1))).toBe('6,2 6,3 6,4 6,5');
    // Asking must not mutate the piece itself.
    expect(piece.rot).toBe(0);
  });

  it('puts the vertical line piece in box column 3, which is how it was measured', () => {
    // The reference showed a line piece rotated clockwise from spawn hugging the
    // box's right-hand column; on a 10-wide field that is board column 6.
    const piece = { id: 'I', rot: 1, x: spawnCol('I'), y: 2 } as const;
    expect([...new Set(cellsOf(piece).map((cell) => cell.x))]).toEqual([6]);
    expect(cellsOf(piece).map((cell) => cell.y)).toEqual([2, 3, 4, 5]);
  });

  it('applies an extra offset, which is how the ghost and the tests shift rows', () => {
    const piece = { id: 'O', rot: 0, x: 4, y: 2 } as const;
    expect(key(cellsOf(piece, 0, 0, 18))).toBe('4,20 4,21 5,20 5,21');
  });
});

describe('spawn placement', () => {
  it('centres the box, which puts 3-wide pieces at column 3 and the square at 4', () => {
    expect(spawnCol('I')).toBe(3);
    expect(spawnCol('T')).toBe(3);
    expect(spawnCol('O')).toBe(4);
    expect(spawnCol('L', 12)).toBe(4);
  });

  it('enters with the box top row on the first hidden row', () => {
    expect(spawnPiece('I', { cols: 10, hiddenRows: 2 })).toEqual({
      id: 'I',
      rot: 0,
      x: 3,
      y: 2,
    });
    expect(spawnPiece('O')).toEqual({ id: 'O', rot: 0, x: 4, y: 2 });
  });

  it('enters every piece fully inside the field horizontally', () => {
    for (const id of PIECE_IDS) {
      const piece = spawnPiece(id, { cols: 10, hiddenRows: 2 });
      const xs = cellsOf(piece).map((cell) => cell.x);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThan(10);
    }
  });
});
