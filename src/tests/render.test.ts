import { describe, expect, it } from 'vitest';
import { createBoard, set } from '../engine/board.js';
import { DEFAULT_CONFIG } from '../engine/config.js';
import type { ActivePiece, Board, Cell } from '../engine/types.js';
import { EMPTY_FRAME, type BoxCall, type FieldCall, type FrameModel } from '../render/frame.js';
import { glyphRows } from '../render/font5x7.js';
import { COLOURS, PIECE_COLOURS } from '../render/palette.js';
import { createRenderer } from '../render/renderer.js';
import { clipRegions, makeCanvas, rects } from './render-harness.js';

/**
 * The paint layer: `FrameModel` in, canvas calls out.
 *
 * `frame.ts` already makes the rules layer paintable without a browser, so what is
 * left to pin is the last hop — the part where a model becomes geometry. These
 * assertions are therefore about *mapping*, never about pixels: the order the calls
 * arrive in, the rectangles they name, and which colour a palette key resolved to.
 * The fake context in `render-harness.ts` records calls rather than rasterising
 * them, which also means the tile bevels and the text atlas are out of reach here
 * and only the browser suite can see them; see that file's header.
 *
 * The rows worth defending are the ones a scene cannot check for itself: that a
 * playfield is clipped rather than offset (so a piece entering from the spawn rows
 * cannot paint over the HUD), that the ghost loses to the active piece wherever
 * they overlap, that a bar clamps its value, and that the veil is drawn last.
 */

const SCREEN_W = 240;
const SCREEN_H = 160;
const COLS = DEFAULT_CONFIG.cols;
const VISIBLE = DEFAULT_CONFIG.visibleRows;
const HIDDEN = DEFAULT_CONFIG.hiddenRows;
const CELL = 8;

/** Paints one model onto a fresh recorder. */
const paint = (model: FrameModel) => {
  const fake = makeCanvas();
  createRenderer(fake.canvas).paint(model);
  return fake;
};

/** `fillRect` geometry for the fills drawn in one colour. */
const drawn = (fake: ReturnType<typeof paint>, colour: string) =>
  rects(fake.fills.filter((f) => f.fill === colour));

/** A playfield big enough to hold the real one, sitting where the scenes put it. */
const fieldCall = (
  over: {
    readonly board?: Board;
    readonly active?: ActivePiece | null;
    readonly ghost?: ActivePiece | null;
    readonly flashFrames?: number;
    readonly x?: number;
    readonly y?: number;
    readonly cell?: number;
    readonly rows?: number;
    readonly showGrid?: boolean;
    readonly dim?: boolean;
  } = {},
): FieldCall => ({
  board: over.board ?? createBoard(COLS, VISIBLE + HIDDEN),
  active: over.active ?? null,
  ghost: over.ghost ?? null,
  flashFrames: over.flashFrames ?? 0,
  x: over.x ?? 8,
  y: over.y ?? 0,
  cell: over.cell ?? CELL,
  rows: over.rows ?? VISIBLE,
  showGrid: over.showGrid ?? false,
  ...(over.dim === undefined ? {} : { dim: over.dim }),
});

/** The same model with one field, for the tests that only care about the field. */
const fieldModel = (over: Parameters<typeof fieldCall>[0] = {}): FrameModel => ({
  fields: [fieldCall(over)],
});

const oneField = (over: Parameters<typeof fieldCall>[0] = {}) => paint(fieldModel(over));

/** A field whose only ink is `value` at board cell (col,row). */
const oneBlock = (col: number, row: number, value: Cell) => {
  const board = createBoard(COLS, VISIBLE + HIDDEN);
  set(board, col, row, value);
  return oneField({ board });
};

/** Where `drawText` should land every inked pixel of `text` (positions, not art). */
const inkOf = (
  text: string,
  left: number,
  y: number,
  scale = 1,
): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [];
  for (const [i, ch] of [...text].entries()) {
    glyphRows(ch)?.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        if (row[c] === '#') out.push([left + (i * 6 + c) * scale, y + r * scale, scale, scale]);
      }
    });
  }
  return out;
};

describe('the renderer and its canvas', () => {
  it('sizes the backing store to the logical frame and turns smoothing off', () => {
    const fake = makeCanvas();
    const renderer = createRenderer(fake.canvas);
    expect([renderer.width, renderer.height]).toEqual([SCREEN_W, SCREEN_H]);
    expect([fake.canvas.width, fake.canvas.height]).toEqual([SCREEN_W, SCREEN_H]);
    expect(fake.ctx.imageSmoothingEnabled).toBe(false);
  });

  it('refuses a canvas that cannot give it a context', () => {
    expect(() => createRenderer(makeCanvas(false).canvas)).toThrow(
      'this browser cannot provide a 2D canvas',
    );
  });

  it('starts every paint from the top-left and re-disables smoothing', () => {
    const fake = makeCanvas();
    const renderer = createRenderer(fake.canvas);
    renderer.paint(EMPTY_FRAME);
    fake.clear();
    renderer.paint(EMPTY_FRAME);
    expect(fake.ops[0]?.op).toBe('setTransform');
    expect(rects(fake.fills)).toEqual([[0, 0, SCREEN_W, SCREEN_H]]);
    expect(fake.ctx.imageSmoothingEnabled).toBe(false);
  });

  it('reset() moves the backing store and the next clear follows it', () => {
    const fake = makeCanvas();
    const renderer = createRenderer(fake.canvas);
    renderer.reset(320, 240);
    expect([renderer.width, renderer.height]).toEqual([320, 240]);
    expect([fake.canvas.width, fake.canvas.height]).toEqual([320, 240]);
    fake.clear();
    renderer.paint(EMPTY_FRAME);
    expect(rects(fake.fills)).toEqual([[0, 0, 320, 240]]);
  });

  it('paints an empty frame as one clear, and the clear honours model.bg', () => {
    expect(rects(paint(EMPTY_FRAME).fills)).toEqual([[0, 0, SCREEN_W, SCREEN_H]]);
    expect(paint(EMPTY_FRAME).fills[0]?.fill).toBe(COLOURS.bg);
    expect(paint({ bg: 'panelBg' }).fills[0]?.fill).toBe(COLOURS.panelBg);
    expect(paint({ bg: '#123456' }).fills[0]?.fill).toBe('#123456');
  });
});

describe('the order a frame is painted in', () => {
  it('goes bg, boxes, fields, previews, bars, texts, then the veil', () => {
    const fake = paint({
      bg: '#010101',
      boxes: [{ x: 1, y: 1, w: 2, h: 2, fill: '#020202' }],
      fields: [fieldCall()],
      previews: [{ id: 'O', x: 96, y: 12, w: 64, h: 26 }],
      bars: [{ x: 20, y: 120, w: 40, h: 6, value: 0.5, fill: '#030303', back: '#040404' }],
      texts: [{ text: 'A', x: 40, y: 40, colour: '#050505' }],
      veil: 0.25,
    });
    const marks = [
      '#010101',
      '#020202',
      COLOURS.fieldBg,
      PIECE_COLOURS[1] ?? '',
      '#040404',
      '#030303',
      '#050505',
      'rgba(0, 0, 0, 0.25)',
    ];
    const first = marks.map((colour) => fake.fills.findIndex((f) => f.fill === colour));
    expect(first.every((i) => i >= 0), JSON.stringify(marks)).toBe(true);
    expect(first).toEqual([...first].sort((a, b) => a - b));
    expect(fake.fills.at(-1)?.fill).toBe('rgba(0, 0, 0, 0.25)');
  });

  it('draws the veil full-screen, only above zero, and never past opaque', () => {
    expect(paint({ veil: 0 }).fills).toHaveLength(1);
    const half = paint({ veil: 0.5 });
    expect(rects(half.fills.slice(1))).toEqual([[0, 0, SCREEN_W, SCREEN_H]]);
    expect(half.fills[1]?.fill).toBe('rgba(0, 0, 0, 0.5)');
    expect(paint({ veil: 2 }).fills[1]?.fill).toBe('rgba(0, 0, 0, 1)');
  });
});

describe('boxes', () => {
  const at = (over: Partial<BoxCall> = {}): FrameModel => ({
    boxes: [{ x: 10, y: 20, w: 8, h: 6, ...over }],
  });

  it('fills when told to fill, in the resolved colour', () => {
    expect(drawn(paint(at({ fill: 'text' })), COLOURS.text)).toEqual([[10, 20, 8, 6]]);
    expect(drawn(paint(at({ fill: '#123456' })), '#123456')).toEqual([[10, 20, 8, 6]]);
  });

  it('draws an inset edge as four rectangles', () => {
    expect(drawn(paint(at({ edge: 'panelEdge' })), COLOURS.panelEdge)).toEqual([
      [10, 20, 8, 1],
      [10, 25, 8, 1],
      [10, 20, 1, 6],
      [17, 20, 1, 6],
    ]);
  });

  it('lays the fill under the edge', () => {
    const fake = paint(at({ fill: '#111111', edge: '#222222' }));
    expect(fake.fills.map((f) => f.fill)).toEqual([
      COLOURS.bg,
      '#111111',
      '#222222',
      '#222222',
      '#222222',
      '#222222',
    ]);
  });

  it('takes thickness, and zero thickness means fill only', () => {
    expect(drawn(paint(at({ edge: '#222222', thickness: 2 })), '#222222')).toEqual([
      [10, 20, 8, 2],
      [10, 24, 8, 2],
      [10, 20, 2, 6],
      [16, 20, 2, 6],
    ]);
    expect(drawn(paint(at({ fill: '#111111', edge: '#222222', thickness: 0 })), '#222222')).toEqual(
      [],
    );
  });

  it('dashes an outline 2 on, 1 off, on all four sides', () => {
    const fake = paint(at({ edge: '#222222', dashed: true, w: 8, h: 8 }));
    const edge = fake.fills.filter((f) => f.fill === '#222222');
    expect(edge).toHaveLength(12);
    const rails = edge.filter((f) => f.h === 1);
    expect(rects(rails)).toEqual([
      [10, 20, 2, 1],
      [10, 27, 2, 1],
      [13, 20, 2, 1],
      [13, 27, 2, 1],
      [16, 20, 2, 1],
      [16, 27, 2, 1],
    ]);
    const posts = edge.filter((f) => f.w === 1);
    expect(rects(posts)).toEqual([
      [10, 20, 1, 2],
      [17, 20, 1, 2],
      [10, 23, 1, 2],
      [17, 23, 1, 2],
      [10, 26, 1, 2],
      [17, 26, 1, 2],
    ]);
    // The gaps are real: the top rail carries no ink in columns 12 or 15, and the
    // left post none in rows 22, 25 or 28.
    const onRail = (y: number): number[] =>
      rails.filter((f) => f.y === y).flatMap((f) => Array.from({ length: f.w }, (_, k) => f.x + k));
    expect(onRail(20)).toEqual([10, 11, 13, 14, 16, 17]);
    const onPost = (x: number): number[] =>
      posts
        .filter((f) => f.x === x)
        .flatMap((f) => Array.from({ length: f.h }, (_, k) => f.y + k));
    expect(onPost(10)).toEqual([20, 21, 23, 24, 26, 27]);
  });
});

describe('bars', () => {
  const barModel = (value: number, back?: string): FrameModel => ({
    bars: [{ x: 20, y: 120, w: 40, h: 6, value, fill: '#333333', ...(back ? { back } : {}) }],
  });

  it('draws its track even at zero, in the default colour', () => {
    const fake = paint(barModel(0));
    expect(rects(fake.fills.slice(1))).toEqual([[20, 120, 40, 6]]);
    expect(fake.fills[1]?.fill).toBe(COLOURS.fieldGrid);
  });

  it('rounds the filled width inwards from the left', () => {
    expect(rects(paint(barModel(0.125)).fills.slice(1))).toEqual([
      [20, 120, 40, 6],
      [20, 120, 5, 6],
    ]);
    expect(rects(paint(barModel(0.999)).fills.slice(2))).toEqual([[20, 120, 40, 6]]);
  });

  it('clamps a value outside 0…1 instead of drawing outside the track', () => {
    expect(paint(barModel(-1)).fills.slice(1)).toHaveLength(1);
    expect(rects(paint(barModel(2)).fills.slice(2))).toEqual([[20, 120, 40, 6]]);
  });

  it('takes its own track colour', () => {
    expect(paint(barModel(0, '#0f0f0f')).fills[1]?.fill).toBe('#0f0f0f');
  });
});

describe('a playfield', () => {
  it('paints the visible rows, not the board rows', () => {
    const fake = oneField();
    expect(drawn(fake, COLOURS.fieldBg)).toEqual([[8, 0, COLS * CELL, VISIBLE * CELL]]);
  });

  it('draws one less grid line than it has columns and rows', () => {
    const fake = oneField({ showGrid: true });
    const grid = fake.fills.filter((f) => f.fill === COLOURS.fieldGrid);
    expect(grid).toHaveLength(COLS - 1 + VISIBLE - 1);
    expect(rects(grid.slice(0, COLS - 1))).toEqual(
      Array.from({ length: COLS - 1 }, (_, i) => [8 + (i + 1) * CELL, 0, 1, VISIBLE * CELL]),
    );
    expect(rects(grid.slice(COLS - 1))).toEqual(
      Array.from({ length: VISIBLE - 1 }, (_, i) => [8, (i + 1) * CELL, COLS * CELL, 1]),
    );
  });

  it('omits the grid when the call asks for none', () => {
    const fake = oneField({ showGrid: false });
    expect(fake.fills.filter((f) => f.fill === COLOURS.fieldGrid)).toHaveLength(0);
  });

  it('clips to the field and restores afterwards', () => {
    const fake = oneField();
    expect(clipRegions(fake.ops)).toEqual([[8, 0, COLS * CELL, VISIBLE * CELL]]);
    const order = fake.ops.map((op) => op.op);
    expect(order.indexOf('save')).toBeLessThan(order.indexOf('clip'));
    expect(order.lastIndexOf('restore')).toBeGreaterThan(order.indexOf('clip'));
  });

  it('maps a locked block through the hidden rows onto the field bottom', () => {
    const fake = oneBlock(3, VISIBLE + HIDDEN - 1, 5);
    expect(drawn(fake, PIECE_COLOURS[4] ?? '')).toEqual([[8 + 3 * CELL, 19 * CELL, CELL - 1, CELL - 1]]);
  });

  it('puts a block in a spawn row above the clip instead of shifting the stack down', () => {
    const fake = oneBlock(3, 1, 5);
    const colour = PIECE_COLOURS[4] ?? '';
    expect(drawn(fake, colour)).toEqual([[8 + 3 * CELL, -CELL, CELL - 1, CELL - 1]]);
    // Which is only safe because the clip's top edge is the field's top edge: an
    // offset stack would have painted this rectangle over the HUD instead.
    expect(clipRegions(fake.ops)).toEqual([[8, 0, COLS * CELL, VISIBLE * CELL]]);
  });

  it('draws the landing ghost under the piece it mirrors', () => {
    const piece: ActivePiece = { id: 'I', rot: 0, x: 0, y: 0 };
    const fake = oneField({ ghost: piece, active: piece });
    const order = fake.ops.map((op) => (op.op === 'fillRect' ? op.fill : op.op));
    const ghost = order.indexOf('rgba(63, 216, 255, 0.35)');
    const active = order.indexOf(PIECE_COLOURS[0] ?? '');
    expect(ghost, 'no ghost drawn').toBeGreaterThanOrEqual(0);
    expect(active, 'no active piece drawn').toBeGreaterThanOrEqual(0);
    expect(active).toBeGreaterThan(ghost);
  });

  it('flashes the whole field for a clear, and caps the brightness at half', () => {
    expect(paint(fieldModel({ flashFrames: 12 })).fills.at(-1)?.fill).toBe(
      'rgba(255, 255, 255, 0.2)',
    );
    const capped = paint(fieldModel({ flashFrames: 120 }));
    expect(capped.fills.at(-1)?.fill).toBe('rgba(255, 255, 255, 0.5)');
    expect(rects(capped.fills.slice(-1))).toEqual([[8, 0, COLS * CELL, VISIBLE * CELL]]);
    // Zero frames means no overlay at all: the field is its plain background and
    // nothing more, so an idle board cannot shimmer.
    expect(paint(fieldModel({ flashFrames: 0 })).fills.map((f) => f.fill)).toEqual([
      COLOURS.bg,
      COLOURS.fieldBg,
    ]);
  });

  it('dims a stack that is not live, on top of the flash', () => {
    const fake = paint(fieldModel({ flashFrames: 12, dim: true }));
    expect(fake.fills.slice(-2).map((f) => f.fill)).toEqual([
      'rgba(255, 255, 255, 0.2)',
      'rgba(0, 0, 0, 0.55)',
    ]);
  });
});

describe('a piece preview', () => {
  const box = { x: 96, y: 12, w: 64, h: 26 } as const;
  const preview = (id: 'I' | 'O' | 'T', over: { cell?: number; dim?: boolean } = {}) =>
    paint({
      previews: [
        {
          id,
          ...box,
          ...(over.cell === undefined ? {} : { cell: over.cell }),
          ...(over.dim === undefined ? {} : { dim: over.dim }),
        },
      ],
    });

  it('centres the shape on its spawn extent, so the line piece sits on one row', () => {
    expect(drawn(preview('I'), PIECE_COLOURS[0] ?? '')).toEqual([
      [112, 21, CELL - 1, CELL - 1],
      [120, 21, CELL - 1, CELL - 1],
      [128, 21, CELL - 1, CELL - 1],
      [136, 21, CELL - 1, CELL - 1],
    ]);
    expect(drawn(preview('O'), PIECE_COLOURS[1] ?? '')).toEqual([
      [120, 17, CELL - 1, CELL - 1],
      [128, 17, CELL - 1, CELL - 1],
      [120, 25, CELL - 1, CELL - 1],
      [128, 25, CELL - 1, CELL - 1],
    ]);
    expect(drawn(preview('T'), PIECE_COLOURS[2] ?? '')).toEqual([
      [116, 17, CELL - 1, CELL - 1],
      [124, 17, CELL - 1, CELL - 1],
      [132, 17, CELL - 1, CELL - 1],
      [124, 25, CELL - 1, CELL - 1],
    ]);
  });

  it('takes a smaller cell, and defaults to the field cell', () => {
    expect(drawn(preview('O', { cell: 4 }), PIECE_COLOURS[1] ?? '')).toEqual([
      [124, 21, 3, 3],
      [128, 21, 3, 3],
      [124, 25, 3, 3],
      [128, 25, 3, 3],
    ]);
  });

  it('draws a dimmed slot as one flat translucent cell per block', () => {
    const dimmed = 'rgba(63, 216, 255, 0.35)';
    const fake = preview('I', { dim: true });
    expect(drawn(fake, dimmed)).toEqual([
      [112, 21, CELL - 1, CELL - 1],
      [120, 21, CELL - 1, CELL - 1],
      [128, 21, CELL - 1, CELL - 1],
      [136, 21, CELL - 1, CELL - 1],
    ]);
    expect(fake.fills).toHaveLength(5); // clear + four cells, no tile blits
  });
});

describe('text', () => {
  it('draws nothing for an empty string', () => {
    expect(paint({ texts: [{ text: '', x: 10, y: 20, colour: 'text' }] }).fills).toHaveLength(1);
  });

  it('lands one pixel per inked glyph cell, on the 6px advance', () => {
    const fake = paint({ texts: [{ text: 'AB', x: 10, y: 20, colour: 'text' }] });
    expect(rects(fake.fills.slice(1))).toEqual(inkOf('AB', 10, 20));
    expect(fake.fills[1]?.fill).toBe(COLOURS.text);
  });

  it('scales the pixels and the advance together', () => {
    const fake = paint({ texts: [{ text: 'A', x: 10, y: 20, colour: '#050505', scale: 2 }] });
    expect(rects(fake.fills.slice(1))).toEqual(inkOf('A', 10, 20, 2));
  });

  it('centres from the middle of the string and right-aligns from its advance width', () => {
    const centred = paint({ texts: [{ text: 'AB', x: 100, y: 0, colour: '#050505', align: 'center' }] });
    // 2 × 6 − 1 = 11 wide, so the left edge rounds to 100 − 5.5 = 95.
    expect(rects(centred.fills.slice(1))).toEqual(inkOf('AB', 95, 0));
    const right = paint({ texts: [{ text: 'AB', x: 100, y: 0, colour: '#050505', align: 'right' }] });
    expect(rects(right.fills.slice(1))).toEqual(inkOf('AB', 89, 0));
  });

  it('passes a literal colour through and resolves a palette key', () => {
    expect(paint({ texts: [{ text: '#', x: 0, y: 0, colour: '#123456' }] }).fills[1]?.fill).toBe(
      '#123456',
    );
    expect(paint({ texts: [{ text: '#', x: 0, y: 0, colour: 'accent' }] }).fills[1]?.fill).toBe(
      COLOURS.accent,
    );
  });
});
