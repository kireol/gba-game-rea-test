import type { ActivePiece, PieceId, Rot, Vec } from './types.js';
import { PIECE_IDS } from './types.js';

/**
 * Piece geometry.
 *
 * Every shape lives in its own **square rotation box** and rotation is a plain
 * in-place permutation of that box (`(x, y) → (N-1-y, x)`), which is the model the
 * reference measurements agreed with
 * (`docs/reverse-engineering/gameplay-mechanics.md` § 3): rotating the line piece
 * 90° put it in the box's right-hand column, exactly where a matrix rotation of a
 * 4×4 box with a filled top row would put it.
 *
 * There are deliberately no wall kicks and no per-piece offset tables: rotations
 * against a wall or the floor were observed to either succeed in place or be
 * rejected.
 */
export const SHAPES = {
  I: ['XXXX', '....', '....', '....'],
  O: ['XX', 'XX'],
  T: ['XXX', '.X.', '...'],
  S: ['.XX', 'XX.', '...'],
  Z: ['XX.', '.XX', '...'],
  J: ['X..', 'XXX', '...'],
  L: ['..X', 'XXX', '...'],
} as const satisfies Record<PieceId, readonly string[]>;

/** Rotation box side per piece. */
export const BOX: Record<PieceId, 2 | 3 | 4> = {
  I: 4,
  O: 2,
  T: 3,
  S: 3,
  Z: 3,
  J: 3,
  L: 3,
};

export interface ActiveShape {
  readonly id: PieceId;
  readonly box: number;
  /** The four rotation states, each a full cell list inside the box. */
  readonly states: readonly (readonly Vec[])[];
}

const baseCells = (id: PieceId): Vec[] => {
  const rows = SHAPES[id] as readonly string[];
  const out: Vec[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) if (row[x] === 'X') out.push({ x, y });
  });
  return out;
};

const rotateCW = (cells: readonly Vec[], box: number): Vec[] =>
  cells.map((c) => ({ x: box - 1 - c.y, y: c.x }));

const buildShape = (id: PieceId): ActiveShape => {
  const box = BOX[id];
  const first = baseCells(id);
  const states: Vec[][] = [first];
  for (let s = 1; s < 4; s += 1) states.push(rotateCW(states[s - 1] ?? first, box));
  return { id, box, states };
};

const SHAPES_BY_ID: Record<PieceId, ActiveShape> = PIECE_IDS.reduce(
  (acc, id) => {
    acc[id] = buildShape(id);
    return acc;
  },
  {} as Record<PieceId, ActiveShape>,
);

export const statesFor = (id: PieceId): readonly (readonly Vec[])[] =>
  SHAPES_BY_ID[id].states;

export const shapeFor = (id: PieceId): ActiveShape => SHAPES_BY_ID[id];

/** Cells of a piece in board coordinates, for a given rotation (defaults to its own). */
export const cellsOf = (
  piece: ActivePiece,
  rot: Rot = piece.rot,
  offsetX = 0,
  offsetY = 0,
): Vec[] =>
  (statesFor(piece.id)[rot] ?? []).map((v) => ({
    x: piece.x + offsetX + v.x,
    y: piece.y + offsetY + v.y,
  }));

/**
 * Horizontal spawn column: the box is centred, which for a 10-column field gives
 * the measured placements — box left column 3 for the 3-wide pieces and the line
 * piece, columns 4–5 for the square.
 */
export const spawnCol = (id: PieceId, cols = 10): number =>
  Math.floor((cols - BOX[id]) / 2);

export interface SpawnOpts {
  readonly cols?: number;
  /** Array row of the piece's box top row on spawn. */
  readonly hiddenRows?: number;
}

/**
 * New piece. The box's top row sits at the first visible row, so every piece
 * enters with its topmost occupied cells on the top visible row — the reference's
 * exact vertical entry was never pinned down, and the hidden rows stay available
 * for rotations near the top (see `docs/game-design.md` § 1).
 */
export const spawnPiece = (id: PieceId, opts: SpawnOpts = {}): ActivePiece => ({
  id,
  rot: 0,
  x: spawnCol(id, opts.cols ?? 10),
  y: opts.hiddenRows ?? 2,
});
