import { VIEW } from '../engine/config.js';

/**
 * Integer scaling of the logical framebuffer to whatever the window gives us.
 *
 * The canvas backing store stays at the logical size (240×160) forever; only its
 * CSS box changes. That is what makes every pixel a whole number of screen
 * pixels: the browser scales an already-pixelated bitmap instead of resampling
 * our drawing commands, so the 5×7 glyphs never smear and no scene has to know
 * about the window size.
 */
export const FRAME = { w: VIEW.width, h: VIEW.height } as const;

/**
 * Largest whole scale that fits both axes, floored, and never below 1. Below 1 we
 * keep 1 and let the page scroll rather than sample the bitmap: a 240-pixel wide
 * board fits any viewport that can show text at all, and half a pixel per block
 * would cost more in legibility than the extra rows are worth.
 */
export const computeScale = (
  availW: number,
  availH: number,
  frameW: number = FRAME.w,
  frameH: number = FRAME.h,
): number => {
  if (!(availW > 0) || !(availH > 0) || !(frameW > 0) || !(frameH > 0)) return 1;
  const fit = Math.min(availW / frameW, availH / frameH);
  return Math.max(1, Math.floor(fit));
};

/** CSS size for a framebuffer at `scale`, preserving the 3:2 aspect. */
export const cssSize = (scale: number, frameW: number = FRAME.w, frameH: number = FRAME.h): {
  readonly width: string;
  readonly height: string;
} => ({ width: `${frameW * scale}px`, height: `${frameH * scale}px` });

export interface LayoutOpts {
  /** Overrides the measured area, for tests and for fixed-size embeds. */
  readonly measure?: () => { readonly w: number; readonly h: number };
  readonly onChange?: (scale: number) => void;
}

export interface Layout {
  /** Re-measures the stage and resizes the canvas box. Safe to call any time. */
  refresh(): void;
  toggleFullscreen(): void;
  readonly fullscreen: boolean;
  readonly scale: number;
  /** Maps a client (CSS-pixel) point into framebuffer space, or null if outside. */
  toFramebuffer(clientX: number, clientY: number): { x: number; y: number } | null;
  dispose(): void;
}

interface FullscreenDoc extends Document {
  readonly webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}

interface FullscreenStage extends HTMLElement {
  webkitRequestFullscreen?: () => void;
}

export const createLayout = (
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  opts: LayoutOpts = {},
): Layout => {
  let scale = 0;
  const doc = document as FullscreenDoc;

  const measured = (): { w: number; h: number } => {
    if (opts.measure) return opts.measure();
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    return { w, h };
  };

  const fullscreen = (): boolean =>
    doc.fullscreenElement !== undefined
      ? doc.fullscreenElement !== null
      : doc.webkitFullscreenElement !== undefined
        ? doc.webkitFullscreenElement !== null
        : false;

  const apply = (): void => {
    const area = measured();
    // Fullscreen hands us the whole screen; outside it the stage is already the
    // whole window, so the same measurement is right in both cases.
    const next = computeScale(area.w, area.h);
    if (next === scale) return;
    scale = next;
    const size = cssSize(scale);
    canvas.style.width = size.width;
    canvas.style.height = size.height;
    opts.onChange?.(scale);
  };

  const listeners: ReadonlyArray<readonly [EventTarget, string, () => void]> = [
    [window, 'resize', apply],
    [window, 'orientationchange', apply],
    [doc, 'fullscreenchange', apply],
    [doc, 'webkitfullscreenchange', apply],
  ];
  for (const [target, type, handler] of listeners) target.addEventListener(type, handler);

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(apply);
    observer.observe(stage);
  }

  apply();

  return {
    refresh: apply,
    toggleFullscreen() {
      if (fullscreen()) {
        if (typeof doc.exitFullscreen === 'function') doc.exitFullscreen().catch(() => undefined);
        else doc.webkitExitFullscreen?.();
        return;
      }
      const target = stage as FullscreenStage;
      try {
        if (typeof target.requestFullscreen === 'function') target.requestFullscreen().catch(() => undefined);
        else target.webkitRequestFullscreen?.();
      } catch {
        // A sandboxed or gesture-less frame refuses; the game still plays windowed.
      }
    },
    get fullscreen() {
      return fullscreen();
    },
    get scale() {
      return scale;
    },
    toFramebuffer(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = ((clientX - rect.left) * FRAME.w) / rect.width;
      const y = ((clientY - rect.top) * FRAME.h) / rect.height;
      // Half-open bounds: the right/bottom edge of the last pixel is still inside.
      if (x < 0 || y < 0 || x >= FRAME.w || y >= FRAME.h) return null;
      return { x: Math.floor(x), y: Math.floor(y) };
    },
    dispose() {
      for (const [target, type, handler] of listeners) target.removeEventListener(type, handler);
      observer?.disconnect();
    },
  };
};
