// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { FRAME, computeScale, createLayout, cssSize } from '../app/layout.js';

/**
 * `createLayout` is the only place the window size touches the game, so the maths
 * it does is worth pinning: an off-by-one here shows up as a stretched board.
 */

type Rect = { left: number; top: number; width: number; height: number };

const stubCanvas = (rect: Rect) => {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => rect as DOMRect;
  return canvas;
};

const stubStage = (w: number, h: number): HTMLElement => {
  const stage = document.createElement('div');
  Object.defineProperty(stage, 'clientWidth', { configurable: true, get: () => w });
  Object.defineProperty(stage, 'clientHeight', { configurable: true, get: () => h });
  return stage;
};

const FULL: Rect = { left: 0, top: 0, width: FRAME.w, height: FRAME.h };

const make = (measure: () => { w: number; h: number }, rect: Rect = FULL) => {
  const canvas = stubCanvas(rect);
  const layout = createLayout(canvas, stubStage(measure().w, measure().h), { measure });
  return { canvas, layout };
};

describe('computeScale', () => {
  it('takes the largest whole factor that fits both axes', () => {
    expect(computeScale(960, 640)).toBe(4);
    expect(computeScale(1000, 640)).toBe(4);
    expect(computeScale(960, 320)).toBe(2);
  });

  it('floors so pixels stay whole instead of filling the window', () => {
    expect(computeScale(1019, 640)).toBe(4);
    expect(computeScale(1020, 640)).toBe(4);
    // 1199/240 is 4.996, so rounding up to fill the width would stretch the board.
    expect(computeScale(1199, 1600)).toBe(4);
    expect(computeScale(1440, 160)).toBe(1);
  });

  it('never scales below 1', () => {
    expect(computeScale(100, 100)).toBe(1);
    expect(computeScale(239, 1)).toBe(1);
  });

  it('treats a broken measurement as scale 1', () => {
    expect(computeScale(0, 0)).toBe(1);
    expect(computeScale(-960, 640)).toBe(1);
    expect(computeScale(Number.NaN, 640)).toBe(1);
    expect(computeScale(960, Number.POSITIVE_INFINITY, 0, 160)).toBe(1);
  });

  it('applies to any frame size, not only the default one', () => {
    expect(computeScale(300, 200, 100, 100)).toBe(2);
  });
});

describe('cssSize', () => {
  it('scales both axes by the same factor', () => {
    expect(cssSize(3)).toEqual({ width: `${FRAME.w * 3}px`, height: `${FRAME.h * 3}px` });
  });

  it('leaves the frame untouched at scale 1', () => {
    expect(cssSize(1)).toEqual({ width: '240px', height: '160px' });
  });
});

describe('createLayout', () => {
  it('sizes the canvas box from the stage on creation', () => {
    const { canvas, layout } = make(() => ({ w: 1200, h: 800 }));
    expect(layout.scale).toBe(5);
    expect(canvas.style.width).toBe(`${FRAME.w * 5}px`);
    expect(canvas.style.height).toBe(`${FRAME.h * 5}px`);
    layout.dispose();
  });

  it('reports each new scale once, and not when nothing changed', () => {
    let area = { w: 480, h: 320 };
    const onChange = vi.fn();
    const canvas = stubCanvas({ left: 0, top: 0, width: FRAME.w, height: FRAME.h });
    const layout = createLayout(canvas, stubStage(area.w, area.h), {
      measure: () => area,
      onChange,
    });
    expect(onChange).toHaveBeenCalledWith(2);

    layout.refresh();
    expect(onChange).toHaveBeenCalledTimes(1);

    area = { w: 960, h: 640 };
    layout.refresh();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(4);
    expect(layout.scale).toBe(4);
    layout.dispose();
  });

  it('re-scales when the window resizes', () => {
    let area = { w: 480, h: 320 };
    const canvas = stubCanvas({ left: 0, top: 0, width: FRAME.w, height: FRAME.h });
    const layout = createLayout(canvas, stubStage(area.w, area.h), { measure: () => area });
    area = { w: 2400, h: 1600 };
    window.dispatchEvent(new Event('resize'));
    expect(layout.scale).toBe(10);

    layout.dispose();
    area = { w: 480, h: 320 };
    window.dispatchEvent(new Event('resize'));
    expect(layout.scale, 'dispose must detach the listeners').toBe(10);
  });

  it('maps a client point into framebuffer space through the CSS box', () => {
    const rect = { left: 100, top: 50, width: FRAME.w * 4, height: FRAME.h * 4 };
    const { canvas, layout } = make(() => ({ w: 960, h: 640 }), rect);
    expect(canvas.style.width).toBe('960px');
    expect(layout.toFramebuffer(100, 50)).toEqual({ x: 0, y: 0 });
    expect(layout.toFramebuffer(104, 54)).toEqual({ x: 1, y: 1 });
    expect(layout.toFramebuffer(103.9, 53.9)).toEqual({ x: 0, y: 0 });
    expect(layout.toFramebuffer(100 + FRAME.w * 4 - 1, 50 + FRAME.h * 4 - 1)).toEqual({
      x: FRAME.w - 1,
      y: FRAME.h - 1,
    });
    layout.dispose();
  });

  it('returns null for a point outside the screen', () => {
    const rect = { left: 100, top: 50, width: 480, height: 320 };
    const { layout } = make(() => ({ w: 960, h: 640 }), rect);
    expect(layout.toFramebuffer(99, 60)).toBeNull();
    expect(layout.toFramebuffer(300, 49)).toBeNull();
    // Half-open: the far edge belongs to the next screen, not the last pixel.
    expect(layout.toFramebuffer(580, 60)).toBeNull();
    expect(layout.toFramebuffer(300, 370)).toBeNull();
    layout.dispose();
  });

  it('refuses to map onto a canvas with no box yet', () => {
    const { layout } = make(() => ({ w: 960, h: 640 }), { left: 0, top: 0, width: 0, height: 0 });
    expect(layout.toFramebuffer(10, 10)).toBeNull();
    layout.dispose();
  });

  it('asks the stage for fullscreen and leaves it alone when unsupported', () => {
    const { canvas, layout } = make(() => ({ w: 960, h: 640 }));
    expect(layout.fullscreen).toBe(false);
    expect(() => layout.toggleFullscreen()).not.toThrow();
    // jsdom implements neither requestFullscreen nor its webkit alias, so the
    // layout must stay usable windowed rather than throw on the gesture.
    expect(canvas.style.width).toBe(`${FRAME.w * 4}px`);
    layout.dispose();
  });
});
