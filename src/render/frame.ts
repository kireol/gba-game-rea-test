import type { ActivePiece, Board, PieceId } from '../engine/types.js';
import type { AnyColour } from './palette.js';

/**
 * The frame description the renderer consumes.
 *
 * This is the boundary that keeps the rules layer independent of rendering: a
 * scene produces one of these plain, immutable value objects per frame and the
 * renderer knows nothing about modes, sessions or the DOM beyond the canvas it
 * was handed. Because it is data, a scene's output can be asserted in a unit test
 * without a canvas, and the same model could be painted by another backend.
 */

export type TextAlign = 'left' | 'center' | 'right';

export interface TextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly colour: AnyColour;
  readonly scale?: 1 | 2 | 3;
  readonly align?: TextAlign;
}

export interface BoxCall {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill?: AnyColour;
  readonly edge?: AnyColour;
  /** Inset edge; 1 by default. 0 draws only the fill. */
  readonly thickness?: number;
  /** Dots the border instead of drawing it — used for the ghost-slot outline. */
  readonly dashed?: boolean;
}

export interface BarCall {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** 0…1, clamped by the renderer. */
  readonly value: number;
  readonly fill: AnyColour;
  readonly back?: AnyColour;
}

export interface FieldCall {
  readonly board: Board;
  readonly active: ActivePiece | null;
  /** Landing projection, already resolved to a piece by the scene. */
  readonly ghost: ActivePiece | null;
  /** Frames left of the clear flash; scales the field-wide blink. */
  readonly flashFrames: number;
  readonly x: number;
  readonly y: number;
  readonly cell: number;
  /** Visible rows. `board.rows` includes the hidden spawn rows above the top. */
  readonly rows: number;
  readonly showGrid: boolean;
  /** Dims the stack (paused, or between rounds). */
  readonly dim?: boolean;
}

export interface PreviewCall {
  readonly id: PieceId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly cell?: number;
  readonly dim?: boolean;
}

export interface FrameModel {
  readonly bg?: AnyColour;
  readonly boxes?: readonly BoxCall[];
  /**
   * Playfields, drawn in order. A list because the local versus screen shows two
   * cores side by side, and a board is only paintable through this call (it needs
   * the cell grid, the ghost and the clear flash).
   */
  readonly fields?: readonly FieldCall[];
  readonly previews?: readonly PreviewCall[];
  readonly bars?: readonly BarCall[];
  readonly texts?: readonly TextCall[];
  /** Full-frame dark veil, 0…1. Used for pause and modal screens. */
  readonly veil?: number;
}

export const EMPTY_FRAME: FrameModel = Object.freeze({ boxes: [], texts: [] });
