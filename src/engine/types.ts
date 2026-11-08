/**
 * Core rules types. No DOM, no rendering, no I/O — see docs/architecture/overview.md.
 */

export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export const PIECE_IDS: readonly PieceId[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export type Rot = 0 | 1 | 2 | 3;

/**
 * Board cell value.
 * 0 = empty, 1..7 = a piece colour index (see `cellOf`), 8 = garbage, 9 = star block.
 */
export type Cell = number;

export const EMPTY: Cell = 0;
export const GARBAGE: Cell = 8;
export const STAR: Cell = 9;

export const cellOf = (id: PieceId): Cell => PIECE_IDS.indexOf(id) + 1;
export const pieceOf = (cell: Cell): PieceId | null =>
  cell >= 1 && cell <= 7 ? (PIECE_IDS[cell - 1] ?? null) : null;

export interface Vec {
  x: number;
  y: number;
}

export interface ActivePiece {
  id: PieceId;
  rot: Rot;
  /** Column of the piece's rotation box, in board coordinates. */
  x: number;
  /** Top row of the piece's rotation box, in board coordinates. */
  y: number;
}

export interface Board {
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array;
}

export type Difficulty = 1 | 2 | 3 | 4;

export type GameStatus = 'ready' | 'playing' | 'paused' | 'won' | 'lost';

export type GoalKind =
  | 'lines-to-level'
  | 'lines-total'
  | 'time-left'
  | 'time-up'
  | 'levels-left'
  | 'survive'
  /** Cells still missing from the mode's star-block row. */
  | 'star-row';

export interface HudField {
  label: string;
  value: string;
}

export type SfxName =
  | 'move'
  | 'rotate'
  | 'rotate-fail'
  | 'lock'
  | 'hard-drop'
  | 'clear'
  | 'clear-big'
  | 'level-up'
  | 'hold'
  | 'garbage'
  | 'spawn'
  | 'menu-move'
  | 'menu-confirm'
  | 'menu-back'
  | 'win'
  | 'lose'
  | 'mute';

export type Intent =
  | 'left'
  | 'right'
  | 'soft-drop'
  | 'hard-drop'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'hold'
  | 'pause'
  | 'confirm'
  | 'back'
  | 'up'
  | 'down'
  | 'increment'
  | 'decrement';

export type SessionEvent =
  | { type: 'move'; dx: number }
  | { type: 'shift'; dy: number }
  | { type: 'rotate'; dir: 1 | -1; ok: boolean }
  | { type: 'soft-drop'; dy: number }
  | { type: 'hard-drop'; dy: number }
  | { type: 'lock' }
  | { type: 'spawn'; id: PieceId }
  | { type: 'hold' }
  | { type: 'lines'; rows: number[]; count: number; score: number; perfect: boolean }
  | { type: 'level-up'; level: number }
  | { type: 'garbage'; rows: number }
  | { type: 'goal'; kind: GoalKind; current: number; target: number }
  | { type: 'message'; text: string; frames: number }
  | { type: 'sfx'; name: SfxName }
  | { type: 'status'; status: GameStatus };

export const clonePiece = (p: ActivePiece): ActivePiece => ({ ...p });
