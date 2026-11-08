import type { ActivePiece, Board, Cell, Rot, Vec } from './types.js';
import { EMPTY } from './types.js';
import { cellsOf } from './pieces.js';

/**
 * The playfield. Row 0 is the topmost **hidden** row; the visible field starts at
 * row `hiddenRows` (see `docs/architecture/interfaces.md`).
 *
 * Nothing in here knows about modes, scoring or timing.
 */
export const createBoard = (cols = 10, rows = 22): Board => ({
  cols,
  rows,
  cells: new Uint8Array(cols * rows),
});

export const idx = (b: Board, x: number, y: number): number => y * b.cols + x;

export const inside = (b: Board, x: number, y: number): boolean =>
  x >= 0 && x < b.cols && y >= 0 && y < b.rows;

export const at = (b: Board, x: number, y: number): Cell =>
  inside(b, x, y) ? (b.cells[idx(b, x, y)] ?? EMPTY) : EMPTY;

export const set = (b: Board, x: number, y: number, v: Cell): void => {
  if (inside(b, x, y)) b.cells[idx(b, x, y)] = v;
};

export const cloneBoard = (b: Board): Board => ({
  cols: b.cols,
  rows: b.rows,
  cells: b.cells.slice(),
});

/**
 * Walls and floor block; cells above row 0 are allowed (the piece sticks out of
 * the top, which the caller turns into a top-out when it locks).
 */
export const collides = (
  b: Board,
  piece: ActivePiece,
  dx = 0,
  dy = 0,
  rot: Rot = piece.rot,
): boolean =>
  cellsOf(piece, rot, dx, dy).some((c) => {
    if (c.x < 0 || c.x >= b.cols || c.y >= b.rows) return true;
    if (c.y < 0) return false;
    return (b.cells[idx(b, c.x, c.y)] ?? EMPTY) !== EMPTY;
  });

/** Writes the piece into the stack. Returns how many cells fell above row 0. */
export const place = (b: Board, piece: ActivePiece, cell: Cell): number => {
  let above = 0;
  for (const c of cellsOf(piece)) {
    if (c.y < 0) {
      above += 1;
      continue;
    }
    if (c.y >= b.rows || c.x < 0 || c.x >= b.cols) continue;
    b.cells[idx(b, c.x, c.y)] = cell;
  }
  return above;
};

export const fullRows = (b: Board): number[] => {
  const out: number[] = [];
  for (let y = 0; y < b.rows; y += 1) {
    let full = true;
    for (let x = 0; x < b.cols; x += 1) {
      if ((b.cells[idx(b, x, y)] ?? EMPTY) === EMPTY) {
        full = false;
        break;
      }
    }
    if (full) out.push(y);
  }
  return out;
};

export const isEmpty = (b: Board): boolean => b.cells.every((c) => c === EMPTY);

/**
 * Removes arbitrary cells and collapses each column independently. Removing whole
 * rows this way is identical to a classic row clear, so the core and the
 * linked-block mode share one collapse path.
 */
export const clearCells = (b: Board, cells: Iterable<number>): number => {
  const removed = new Set<number>();
  for (const i of cells) removed.add(i);
  if (removed.size === 0) return 0;
  for (let x = 0; x < b.cols; x += 1) {
    let write = b.rows - 1;
    for (let y = b.rows - 1; y >= 0; y -= 1) {
      const i = idx(b, x, y);
      if (removed.has(i)) continue;
      const v = b.cells[i] ?? EMPTY;
      if (write !== y) b.cells[idx(b, x, write)] = v;
      write -= 1;
    }
    for (let y = write; y >= 0; y -= 1) b.cells[idx(b, x, y)] = EMPTY;
  }
  return removed.size;
};

/** Removes the given rows and drops everything above them. */
export const clearRows = (b: Board, rows: readonly number[]): number => {
  if (rows.length === 0) return 0;
  const cells: number[] = [];
  for (const y of rows) for (let x = 0; x < b.cols; x += 1) cells.push(idx(b, x, y));
  clearCells(b, cells);
  return rows.length;
};

/**
 * Pushes a row in at the bottom, shifting the stack up. `holes` are the columns
 * left empty. Returns the number of rows lost off the top.
 */
export const pushBottomRow = (b: Board, cell: Cell, holes: readonly number[]): number => {
  const skip = new Set(holes);
  let overflow = 0;
  for (let x = 0; x < b.cols; x += 1) {
    if ((b.cells[idx(b, x, 0)] ?? EMPTY) !== EMPTY) {
      overflow = 1;
      break;
    }
  }
  for (let x = 0; x < b.cols; x += 1) {
    for (let y = 0; y < b.rows - 1; y += 1) {
      b.cells[idx(b, x, y)] = b.cells[idx(b, x, y + 1)] ?? EMPTY;
    }
    b.cells[idx(b, x, b.rows - 1)] = skip.has(x) ? EMPTY : cell;
  }
  return overflow;
};

export const countRow = (b: Board, y: number): number => {
  let n = 0;
  for (let x = 0; x < b.cols; x += 1) if ((b.cells[idx(b, x, y)] ?? EMPTY) !== EMPTY) n += 1;
  return n;
};

/** Lowest legal box row for the piece in its current rotation. */
export const ghostY = (b: Board, piece: ActivePiece): number => {
  let y = piece.y;
  while (!collides(b, piece, 0, y - piece.y + 1)) y += 1;
  return y;
};

/** A spawn position that is already occupied ends the run. */
export const isTopOut = (b: Board, piece: ActivePiece): boolean => collides(b, piece);

/**
 * Orthogonally connected cells sharing the piece identity of `seed` cells.
 * Used by the linked-blocks mode; generic on purpose (it knows nothing about stars).
 */
export const floodSameColour = (b: Board, seeds: readonly Vec[]): Set<number> => {
  const out = new Set<number>();
  const stack: Vec[] = [];
  for (const s of seeds) {
    const v = at(b, s.x, s.y);
    if (v === EMPTY) continue;
    if (out.has(idx(b, s.x, s.y))) continue;
    stack.push({ x: s.x, y: s.y });
    out.add(idx(b, s.x, s.y));
    while (stack.length > 0) {
      const c = stack.pop();
      if (!c) continue;
      const here = at(b, c.x, c.y);
      const around: Vec[] = [
        { x: c.x + 1, y: c.y },
        { x: c.x - 1, y: c.y },
        { x: c.x, y: c.y + 1 },
        { x: c.x, y: c.y - 1 },
      ];
      for (const n of around) {
        if (!inside(b, n.x, n.y)) continue;
        const i = idx(b, n.x, n.y);
        if (out.has(i)) continue;
        if ((b.cells[i] ?? EMPTY) !== here) continue;
        out.add(i);
        stack.push(n);
      }
    }
  }
  return out;
};
