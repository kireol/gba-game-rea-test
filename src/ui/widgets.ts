import type { BarCall, BoxCall, FieldCall, FrameModel, PreviewCall, TextCall, TextAlign } from '../render/frame.js';
import type { AnyColour } from '../render/palette.js';
import { VIEW } from '../engine/config.js';
import { textWidth } from '../render/font5x7.js';

/**
 * Small helpers that build `FrameModel` values.
 *
 * Scenes assemble a frame per frame-tick out of these calls, so no scene writes
 * to a canvas and the widgets never need a browser. Geometry lives here (menu
 * spacing, hit rectangles) because the pointer needs exactly the rectangles the
 * screen draws — one source of truth for both.
 */

export const SCREEN = { w: VIEW.width, h: VIEW.height } as const;

export interface Draft {
  box(call: BoxCall): void;
  text(call: TextCall): void;
  bar(call: BarCall): void;
  preview(call: PreviewCall): void;
  /** Appends a playfield. Order matters: later fields paint on top. */
  addField(call: FieldCall): void;
  setVeil(value: number): void;
  /** Convenience: text at a position with the common defaults. */
  label(text: string, x: number, y: number, colour?: AnyColour, align?: TextAlign, scale?: 1 | 2 | 3): void;
  build(): FrameModel;
}

export const draft = (bg: AnyColour = 'bg'): Draft => {
  const boxes: BoxCall[] = [];
  const texts: TextCall[] = [];
  const bars: BarCall[] = [];
  const previews: PreviewCall[] = [];
  const fields: FieldCall[] = [];
  let veil: number | undefined;
  return {
    box: (call) => {
      boxes.push(call);
    },
    text: (call) => {
      texts.push(call);
    },
    bar: (call) => {
      bars.push(call);
    },
    preview: (call) => {
      previews.push(call);
    },
    addField: (call) => {
      fields.push(call);
    },
    setVeil: (value) => {
      veil = Math.min(1, Math.max(0, value));
    },
    label: (text, x, y, colour = 'text', align = 'left', scale = 1) => {
      texts.push({ text, x, y, colour, align, scale });
    },
    // Built as one expression: every FrameModel field is readonly, and an absent
    // list must stay absent rather than become an empty array or `undefined`.
    build(): FrameModel {
      return {
        bg,
        ...(boxes.length > 0 ? { boxes } : {}),
        ...(fields.length > 0 ? { fields } : {}),
        ...(previews.length > 0 ? { previews } : {}),
        ...(bars.length > 0 ? { bars } : {}),
        ...(texts.length > 0 ? { texts } : {}),
        ...(veil !== undefined ? { veil } : {}),
      };
    },
  };
};

/** Width of a run of text in pixels, for right-aligning by hand. */
export const textPx = (text: string, scale = 1): number => textWidth(text, scale);

export const MARGIN = 8;
/** Draw area of a full-screen panel (menus, options, results). */
export const PANEL = {
  x: MARGIN,
  y: MARGIN,
  w: SCREEN.w - MARGIN * 2,
  h: SCREEN.h - MARGIN * 2,
} as const;

export interface MenuItem {
  readonly label: string;
  readonly sub?: string;
  readonly colour?: AnyColour;
  readonly dim?: boolean;
  readonly note?: string;
}

export interface MenuGeom {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly rowH: number;
  readonly count: number;
}

export interface MenuRect {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const menuRects = (geom: MenuGeom): readonly MenuRect[] =>
  Array.from({ length: geom.count }, (_, index) => ({
    index,
    x: geom.x,
    y: geom.y + index * geom.rowH,
    w: geom.w,
    h: geom.rowH,
  }));

/** Row under a framebuffer point, or `null` outside the list. */
export const rowUnderPoint = (geom: MenuGeom, px: number, py: number): number | null => {
  if (px < geom.x || px > geom.x + geom.w) return null;
  const offset = py - geom.y;
  if (offset < 0 || offset >= geom.rowH * geom.count) return null;
  return Math.floor(offset / geom.rowH);
};

/**
 * A menu list with our own cursor triangle. `hint` rows (locked entries, key
 * names) are right aligned so labels stay readable at the width of the panel.
 */
export const drawMenu = (
  d: Draft,
  geom: MenuGeom,
  items: readonly MenuItem[],
  cursor: number,
  opts: { readonly highlight?: 'bar' | 'arrow'; readonly noteColour?: AnyColour } = {},
): void => {
  const highlight = opts.highlight ?? 'bar';
  menuRects(geom).forEach((rect, index) => {
    const item = items[index];
    if (!item) return;
    const active = index === cursor;
    if (active && highlight === 'bar') {
      d.box({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, fill: 'fieldGrid', edge: 'accent' });
    }
    const colour = item.colour ?? (item.dim ? 'textDim' : active ? 'cursor' : 'text');
    d.label(item.label, rect.x + 10, rect.y + 4, colour, 'left', 1);
    if (item.sub) d.label(item.sub, rect.x + 10, rect.y + 4 + 8, 'textDim', 'left', 1);
    if (item.note) {
      d.label(item.note, rect.x + rect.w - 8, rect.y + 4, item.dim ? 'textDim' : (opts.noteColour ?? 'textDim'), 'right', 1);
    }
    if (active && highlight === 'arrow') d.label('>', rect.x, rect.y + 4, 'cursor', 'left', 1);
  });
};

/** Title strip with a rule underneath; every screen uses the same one. */
export const drawHeader = (d: Draft, title: string, right?: string): void => {
  d.label(title, SCREEN.w / 2, 6, 'accent', 'center', 2);
  if (right) d.label(right, SCREEN.w - MARGIN, 8, 'textDim', 'right', 1);
  d.box({ x: MARGIN, y: 21, w: PANEL.w, h: 1, fill: 'panelEdge' });
};

/** Bottom hint line: keys for the current screen, drawn in the same place twice. */
export const drawFooter = (d: Draft, left: string, right?: string): void => {
  const y = SCREEN.h - 10;
  d.label(left, MARGIN, y, 'textDim', 'left', 1);
  if (right) d.label(right, SCREEN.w - MARGIN, y, 'textDim', 'right', 1);
};

/** Framed card for the rules screen and modal confirmations. */
export const drawCard = (d: Draft, x: number, y: number, w: number, h: number, accent: AnyColour = 'fieldEdge'): void => {
  d.box({ x, y, w, h, fill: 'panelBg', edge: accent });
};

/** `LABEL  value` pair inside a stats block; returns the next baseline. */
export const drawStat = (
  d: Draft,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  valueColour: AnyColour = 'text',
): number => {
  d.label(label, x, y, 'textDim', 'left', 1);
  d.label(value, x + w, y, valueColour, 'right', 1);
  return y + 9;
};
