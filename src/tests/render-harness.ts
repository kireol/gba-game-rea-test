/**
 * A recording stand-in for a canvas, for the suites that pin the paint layer.
 *
 * `src/render/renderer.ts` is the only module in the project that talks to a
 * canvas, and every coordinate it emits is a framebuffer pixel, so a test can ask
 * "what would this frame have painted" by recording the 2D calls instead of
 * rasterising them. Nothing here emulates a rasteriser: `fillRect` stores its
 * arguments plus the current `fillStyle`, and `clip` records that it happened
 * rather than masking anything. That is deliberate — the rows worth pinning are the
 * mapping from a `FrameModel` to draw calls (order, geometry, resolved colour),
 * and those are all visible in the call list.
 *
 * One environmental fact changes what a test can see, so read it before writing an
 * assertion here. `blocks.ts` and `font5x7.ts` both prefer to blit a cached sprite
 * atlas with `drawImage`, and both skip that path when `document` is undefined —
 * which is the case in the node test environment. So in these files every block
 * and every glyph arrives as a flat `fillRect`, while a real browser blits a tile
 * or an atlas cell instead. Position, size and colour are shared by both paths and
 * are therefore pinned here; the bevel texture inside a tile and the atlas blit
 * itself are only ever drawn by the browser suite.
 */

/** One recorded `fillRect`, with the colour the context held at that moment. */
export interface FillOp {
  readonly op: 'fillRect';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Already resolved to a CSS colour by `resolveColour` / `withAlpha`. */
  readonly fill: string;
}

/** One recorded `drawImage`. Never emitted under node — see the file header. */
export interface BlitOp {
  readonly op: 'drawImage';
  readonly x: number;
  readonly y: number;
  /** The raw arguments, so the 3-argument and 9-argument forms stay tellable. */
  readonly args: readonly number[];
}

export interface RectOp {
  readonly op: 'rect';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type DrawOp =
  | FillOp
  | BlitOp
  | RectOp
  | { readonly op: 'clip' }
  | { readonly op: 'save' }
  | { readonly op: 'restore' }
  | { readonly op: 'beginPath' }
  | { readonly op: 'setTransform' };

export interface FakeCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Every recorded call, in order. */
  readonly ops: DrawOp[];
  /** `fillRect` calls only, in order — the ones worth asserting on. */
  readonly fills: FillOp[];
  /** The backing store the renderer was allowed to set. */
  readonly size: { width: number; height: number };
  /** Drops the log between two paints. */
  clear(): void;
}

/**
 * `withContext: false` builds a canvas that cannot give anyone a 2D context, which
 * is how a test reaches the renderer's one failure branch.
 */
export const makeCanvas = (withContext = true): FakeCanvas => {
  const ops: DrawOp[] = [];
  const fills: FillOp[] = [];
  let fillStyle = '';
  let smoothing = true;

  const push = (op: DrawOp): void => {
    ops.push(op);
    if (op.op === 'fillRect') fills.push(op);
  };

  const ctx = {
    get fillStyle(): string {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    get imageSmoothingEnabled(): boolean {
      return smoothing;
    },
    set imageSmoothingEnabled(value: boolean) {
      smoothing = value;
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      push({ op: 'fillRect', x, y, w, h, fill: fillStyle });
    },
    drawImage(...args: number[]): void {
      const nine = args.length >= 9;
      push({ op: 'drawImage', x: args[nine ? 4 : 0] ?? 0, y: args[nine ? 5 : 1] ?? 0, args });
    },
    rect(x: number, y: number, w: number, h: number): void {
      push({ op: 'rect', x, y, w, h });
    },
    clip(): void {
      push({ op: 'clip' });
    },
    save(): void {
      push({ op: 'save' });
    },
    restore(): void {
      push({ op: 'restore' });
    },
    beginPath(): void {
      push({ op: 'beginPath' });
    },
    setTransform(): void {
      push({ op: 'setTransform' });
    },
  };

  const size = { width: 0, height: 0 };
  const canvas = {
    get width(): number {
      return size.width;
    },
    set width(value: number) {
      size.width = value;
    },
    get height(): number {
      return size.height;
    },
    set height(value: number) {
      size.height = value;
    },
    getContext: () => (withContext ? ctx : null),
  };

  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    ctx: ctx as unknown as CanvasRenderingContext2D,
    ops,
    fills,
    size,
    clear: () => {
      ops.length = 0;
      fills.length = 0;
    },
  };
};

/** Geometry only, so a whole paint can be compared in one `toEqual`. */
export const rects = (list: readonly FillOp[]): [number, number, number, number][] =>
  list.map((f) => [f.x, f.y, f.w, f.h]);

/** The fills drawn in one colour, in order. */
export const inColour = (list: readonly FillOp[], colour: string): FillOp[] =>
  list.filter((f) => f.fill === colour);

/** The `rect` that precedes each `clip`, as [x, y, w, h]. */
export const clipRegions = (ops: readonly DrawOp[]): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [];
  ops.forEach((op, i) => {
    if (op.op !== 'clip') return;
    const before = ops[i - 1];
    if (before && before.op === 'rect') out.push([before.x, before.y, before.w, before.h]);
  });
  return out;
};
