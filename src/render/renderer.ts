import { drawActive, drawBoard, drawGhost, drawPiecePreview } from './blocks.js';
import type { BarCall, BoxCall, FieldCall, FrameModel, PreviewCall, TextCall } from './frame.js';
import { drawText } from './font5x7.js';
import { COLOURS, resolveColour, withAlpha } from './palette.js';

/**
 * The only module that touches a canvas context.
 *
 * It paints a `FrameModel` (see `frame.ts`) and nothing else: no rules, no
 * session, no DOM outside the canvas it was handed. Scenes build models, this
 * draws them, which is what keeps the rules layer testable without a browser and
 * lets the same model be asserted in a unit test.
 *
 * The backing store is always the logical 240×160 framebuffer; integer scaling is
 * done by CSS in `app/layout.ts`, so every coordinate here is a framebuffer pixel
 * and every block lands on a whole pixel.
 */

export interface Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Paints one frame. Assumes the logical size already matches the canvas. */
  paint(model: FrameModel): void;
  /** Resets the backing store to the logical size (call after a canvas swap). */
  reset(width: number, height: number): void;
}

const box = (ctx: CanvasRenderingContext2D, call: BoxCall): void => {
  const thickness = call.thickness ?? 1;
  if (call.fill !== undefined) {
    ctx.fillStyle = resolveColour(call.fill);
    ctx.fillRect(call.x, call.y, call.w, call.h);
  }
  if (call.edge === undefined || thickness <= 0) return;
  const colour = resolveColour(call.edge);
  ctx.fillStyle = colour;
  if (call.dashed) {
    // A 2-on, 1-off dash; the dashed style only ever outlines small boxes.
    const top = call.y;
    const bottom = call.y + call.h - thickness;
    for (let x = call.x; x < call.x + call.w; x += 3) {
      const run = Math.min(2, call.x + call.w - x);
      ctx.fillRect(x, top, run, thickness);
      ctx.fillRect(x, bottom, run, thickness);
    }
    for (let y = call.y; y < call.y + call.h; y += 3) {
      const run = Math.min(2, call.y + call.h - y);
      ctx.fillRect(call.x, y, thickness, run);
      ctx.fillRect(call.x + call.w - thickness, y, thickness, run);
    }
    return;
  }
  ctx.fillRect(call.x, call.y, call.w, thickness);
  ctx.fillRect(call.x, call.y + call.h - thickness, call.w, thickness);
  ctx.fillRect(call.x, call.y, thickness, call.h);
  ctx.fillRect(call.x + call.w - thickness, call.y, thickness, call.h);
};

const bar = (ctx: CanvasRenderingContext2D, call: BarCall): void => {
  const back = resolveColour(call.back ?? COLOURS.fieldGrid);
  ctx.fillStyle = back;
  ctx.fillRect(call.x, call.y, call.w, call.h);
  const value = Math.max(0, Math.min(1, call.value));
  const filled = Math.round(call.w * value);
  if (filled <= 0) return;
  ctx.fillStyle = resolveColour(call.fill);
  ctx.fillRect(call.x, call.y, filled, call.h);
};

const field = (ctx: CanvasRenderingContext2D, call: FieldCall, flashFrames: number): void => {
  const w = call.board.cols * call.cell;
  const h = call.rows * call.cell;
  ctx.fillStyle = resolveColour(COLOURS.fieldBg);
  ctx.fillRect(call.x, call.y, w, h);
  if (call.showGrid) {
    ctx.fillStyle = resolveColour(COLOURS.fieldGrid);
    for (let c = 1; c < call.board.cols; c += 1) {
      ctx.fillRect(call.x + c * call.cell, call.y, 1, h);
    }
    for (let r = 1; r < call.rows; r += 1) {
      ctx.fillRect(call.x, call.y + r * call.cell, w, 1);
    }
  }
  // The spawn rows sit above the visible field, so the stack has to be clipped
  // rather than offset — otherwise a piece entering would paint over the HUD.
  ctx.save();
  ctx.beginPath();
  ctx.rect(call.x, call.y, w, h);
  ctx.clip();
  const top = call.board.rows - call.rows;
  const originY = call.y - top * call.cell;
  drawBoard(ctx, call.board, call.cell, call.x, originY);
  if (call.ghost) drawGhost(ctx, call.ghost, call.cell, call.x, originY);
  if (call.active) drawActive(ctx, call.active, call.cell, call.x, originY);
  if (flashFrames > 0) {
    ctx.fillStyle = withAlpha(resolveColour(COLOURS.lockFlash), Math.min(0.5, flashFrames / 60));
    ctx.fillRect(call.x, call.y, w, h);
  }
  if (call.dim) {
    ctx.fillStyle = withAlpha(resolveColour(COLOURS.shadow), 0.55);
    ctx.fillRect(call.x, call.y, w, h);
  }
  ctx.restore();
};

const preview = (ctx: CanvasRenderingContext2D, call: PreviewCall): void => {
  drawPiecePreview(
    ctx,
    call.id,
    call.x,
    call.y,
    call.w,
    call.h,
    call.cell ?? 8,
    call.dim ?? false,
  );
};

const text = (ctx: CanvasRenderingContext2D, call: TextCall): void => {
  if (call.text.length === 0) return;
  drawText(ctx, call.text, call.x, call.y, resolveColour(call.colour), {
    scale: call.scale ?? 1,
    align: call.align ?? 'left',
  });
};

export const createRenderer = (canvas: HTMLCanvasElement, width = 240, height = 160): Renderer => {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('this browser cannot provide a 2D canvas');
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  let logicalW = width;
  let logicalH = height;
  return {
    canvas,
    get width() {
      return logicalW;
    },
    get height() {
      return logicalH;
    },
    paint(model: FrameModel): void {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = resolveColour(model.bg ?? COLOURS.bg);
      ctx.fillRect(0, 0, logicalW, logicalH);
      for (const call of model.boxes ?? []) box(ctx, call);
      for (const call of model.fields ?? []) field(ctx, call, call.flashFrames);
      for (const call of model.previews ?? []) preview(ctx, call);
      for (const call of model.bars ?? []) bar(ctx, call);
      for (const call of model.texts ?? []) text(ctx, call);
      if (model.veil && model.veil > 0) {
        ctx.fillStyle = withAlpha(resolveColour(COLOURS.shadow), Math.min(1, model.veil));
        ctx.fillRect(0, 0, logicalW, logicalH);
      }
    },
    reset(width2: number, height2: number): void {
      logicalW = width2;
      logicalH = height2;
      canvas.width = width2;
      canvas.height = height2;
      ctx.imageSmoothingEnabled = false;
    },
  };
};
