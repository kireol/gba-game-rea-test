import { VIEW } from '../engine/config.js';
import { cellsOf } from '../engine/pieces.js';
import type { ActivePiece, Board, PieceId } from '../engine/types.js';
import { cellOf } from '../engine/types.js';
import { COLOURS, colourForCell, shade, withAlpha } from './palette.js';

/**
 * Procedural block art.
 *
 * Every block in the game is generated from its colour at draw time by a
 * deterministic function (`tileFor`): a filled body, a two-tone bevel, a small
 * gloss and a 1-pixel dark seam. Nothing here is a bitmap asset, and nothing is
 * derived from the reference game's graphics — the look is this project's own
 * (see `docs/asset-provenance.md`).
 *
 * Sprites are cached per (style, colour, size) in an offscreen canvas and blitted
 * with one `drawImage`, which keeps a full 22-column field repaint to a couple of
 * hundred blits per frame.
 */

export type TileStyle = 'piece' | 'garbage' | 'star' | 'ghost';

const cache = new Map<string, HTMLCanvasElement>();

const makeTile = (style: TileStyle, colour: string, cell: number): HTMLCanvasElement | null => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = cell;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const hi = shade(colour, 1.42);
  const mid = shade(colour, 1.0);
  const lo = shade(colour, 0.55);
  const edge = shade(colour, 0.32);

  if (style === 'ghost') {
    ctx.fillStyle = withAlpha(colour, 0.16);
    ctx.fillRect(0, 0, cell, cell);
    ctx.fillStyle = withAlpha(colour, 0.62);
    // A hollow outline, with the corners clipped so the ghost never competes with
    // a locked piece for attention.
    ctx.fillRect(1, 0, cell - 2, 1);
    ctx.fillRect(1, cell - 1, cell - 2, 1);
    ctx.fillRect(0, 1, 1, cell - 2);
    ctx.fillRect(cell - 1, 1, 1, cell - 2);
    ctx.fillStyle = withAlpha(colour, 0.9);
    ctx.fillRect(1, 1, 1, 1);
    ctx.fillRect(cell - 2, 1, 1, 1);
    ctx.fillRect(1, cell - 2, 1, 1);
    ctx.fillRect(cell - 2, cell - 2, 1, 1);
    return canvas;
  }

  if (style === 'star') {
    ctx.fillStyle = lo;
    ctx.fillRect(0, 0, cell, cell);
    ctx.fillStyle = colour;
    ctx.fillRect(1, 1, cell - 2, cell - 2);
    // A four-point spark in the middle of the body.
    ctx.fillStyle = COLOURS.lockFlash;
    const c = Math.floor(cell / 2);
    ctx.fillRect(c - 1, 1, 2, cell - 2);
    ctx.fillRect(1, c - 1, cell - 2, 2);
    ctx.fillStyle = edge;
    ctx.fillRect(0, cell - 1, cell, 1);
    ctx.fillRect(cell - 1, 0, 1, cell);
    return canvas;
  }

  if (style === 'garbage') {
    ctx.fillStyle = lo;
    ctx.fillRect(0, 0, cell, cell);
    ctx.fillStyle = mid;
    ctx.fillRect(1, 1, cell - 3, cell - 3);
    ctx.fillStyle = edge;
    // Two "pitted" pixels, the only texture a garbage row gets.
    ctx.fillRect(2, 2, 1, 1);
    ctx.fillRect(5, 4, 1, 1);
    ctx.fillStyle = hi;
    ctx.fillRect(1, 1, cell - 3, 1);
    ctx.fillStyle = shade(colour, 0.4);
    ctx.fillRect(0, cell - 1, cell, 1);
    ctx.fillRect(cell - 1, 0, 1, cell);
    return canvas;
  }

  // 'piece'
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, cell, cell);
  ctx.fillStyle = mid;
  ctx.fillRect(1, 1, cell - 2, cell - 2);
  ctx.fillStyle = hi;
  ctx.fillRect(1, 1, cell - 2, 1);
  ctx.fillRect(1, 1, 1, cell - 2);
  ctx.fillStyle = lo;
  ctx.fillRect(2, 2, cell - 4, cell - 4);
  ctx.fillStyle = hi;
  ctx.fillRect(2, 2, 2, 1);
  return canvas;
};

export const tileFor = (
  style: TileStyle,
  colour: string,
  cell: number = VIEW.cell,
): HTMLCanvasElement | null => {
  const key = `${style}|${colour}|${cell}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const made = makeTile(style, colour, cell);
  if (made) cache.set(key, made);
  return made;
};

const blit = (
  ctx: CanvasRenderingContext2D,
  style: TileStyle,
  colour: string,
  px: number,
  py: number,
  cell: number,
): void => {
  const tile = tileFor(style, colour, cell);
  if (tile) {
    ctx.drawImage(tile, px, py);
    return;
  }
  // No canvas support to cache into (or a headless context): draw the body flat.
  ctx.fillStyle = style === 'ghost' ? withAlpha(colour, 0.35) : colour;
  ctx.fillRect(px, py, cell - 1, cell - 1);
};

/** Draws one board cell at board coordinates. */
export const drawCell = (
  ctx: CanvasRenderingContext2D,
  cellValue: number,
  col: number,
  row: number,
  cell: number = VIEW.cell,
  originX = 0,
  originY = 0,
): void => {
  const colour = colourForCell(cellValue);
  if (colour === null) return;
  const style: TileStyle = cellValue === 9 ? 'star' : cellValue === 8 ? 'garbage' : 'piece';
  blit(ctx, style, colour, originX + col * cell, originY + row * cell, cell);
};

/** Draws every non-empty cell of `board`. */
export const drawBoard = (
  ctx: CanvasRenderingContext2D,
  board: Board,
  cell: number = VIEW.cell,
  originX = 0,
  originY = 0,
): void => {
  for (let row = 0; row < board.rows; row += 1) {
    for (let col = 0; col < board.cols; col += 1) {
      const value = board.cells[row * board.cols + col] ?? 0;
      if (value !== 0) drawCell(ctx, value, col, row, cell, originX, originY);
    }
  }
};

/** Draws an active piece's four cells. */
export const drawActive = (
  ctx: CanvasRenderingContext2D,
  piece: ActivePiece,
  cell: number = VIEW.cell,
  originX = 0,
  originY = 0,
): void => {
  const colour = colourForCell(cellOf(piece.id));
  if (colour === null) return;
  for (const v of cellsOf(piece)) {
    blit(ctx, 'piece', colour, originX + v.x * cell, originY + v.y * cell, cell);
  }
};

/** Draws the landing projection. */
export const drawGhost = (
  ctx: CanvasRenderingContext2D,
  ghost: ActivePiece,
  cell: number = VIEW.cell,
  originX = 0,
  originY = 0,
): void => {
  const colour = colourForCell(cellOf(ghost.id));
  if (colour === null) return;
  for (const v of cellsOf(ghost)) {
    blit(ctx, 'ghost', colour, originX + v.x * cell, originY + v.y * cell, cell);
  }
};

const BASE_ROWS: Record<PieceId, number> = { I: 1, O: 2, T: 2, S: 2, Z: 2, J: 2, L: 2 };
const BASE_COLS: Record<PieceId, number> = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 };

/**
 * Draws a piece as a preview (hold slot, next queue) inside a `w`×`h` box,
 * centred. `BASE_*` is the occupied extent of each shape at its spawn rotation,
 * so the line piece is centred on one row and the others on two.
 */
export const drawPiecePreview = (
  ctx: CanvasRenderingContext2D,
  id: PieceId,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  cell: number = VIEW.cell,
  dim = false,
): void => {
  const cols = BASE_COLS[id];
  const rows = BASE_ROWS[id];
  const px = boxX + Math.floor((boxW - cols * cell) / 2);
  const py = boxY + Math.floor((boxH - rows * cell) / 2);
  const ghost: ActivePiece = { id, rot: 0, x: 0, y: 0 };
  const colour = colourForCell(cellOf(id));
  if (colour === null) return;
  for (const v of cellsOf(ghost)) {
    if (dim) {
      ctx.fillStyle = withAlpha(colour, 0.35);
      ctx.fillRect(px + v.x * cell, py + v.y * cell, cell - 1, cell - 1);
    } else {
      blit(ctx, 'piece', colour, px + v.x * cell, py + v.y * cell, cell);
    }
  }
};
