/**
 * The project's own 5×7 pixel font, drawn by hand as a bit table. It is original
 * work for this game (`docs/asset-provenance.md`) and deliberately not a
 * re-drawing of any existing bitmap font: 5 pixels wide, 7 tall, one pixel of
 * side bearing, which fits 40 characters across the 240-pixel framebuffer.
 *
 * Rows are strings so the glyphs are readable in review; `#` is an inked pixel.
 */

export const FONT_W = 5;
export const FONT_H = 7;
/** Advance between two glyph origins (5 px glyph + 1 px gap). */
export const FONT_ADVANCE_X = 6;
/** Line advance, including the one row of leading. */
export const FONT_ADVANCE_Y = 8;

const G: Record<string, readonly string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
  '2': ['####.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '#...#', '....#', '..##.', '....#', '#...#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '####.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '\\': ['#....', '#....', '.#...', '..#..', '...#.', '....#', '....#'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '*': ['..#..', '..#..', '#####', '.###.', '.#.#.', '.....', '.....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '|': ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  '^': ['..#..', '.###.', '#.#.#', '.....', '.....', '.....', '.....'],
  '{': ['...#.', '..#..', '..#..', '.#...', '..#..', '..#..', '...#.'],
  '}': ['.#...', '..#..', '..#..', '...#.', '..#..', '..#..', '.#...'],
};

/**
 * The table key that holds this character's glyph, or `undefined` when there is
 * no glyph. Lowercase borrows the capital's drawing, and the capital is also the
 * key the atlas is indexed by, so every caller must resolve the *key* — using the
 * character's own code there would read an empty atlas slot.
 */
const keyFor = (ch: string): string | undefined => {
  if (G[ch] !== undefined) return ch;
  const upper = ch.toUpperCase();
  return G[upper] !== undefined ? upper : undefined;
};

/** True when `drawText` can render every character of `text`. */
export const canRender = (text: string): boolean =>
  [...text].every((ch) => keyFor(ch) !== undefined);

export const glyphRows = (ch: string): readonly string[] | undefined => {
  const key = keyFor(ch);
  return key === undefined ? undefined : G[key];
};

export const textWidth = (text: string, scale = 1): number =>
  text.length === 0 ? 0 : text.length * FONT_ADVANCE_X * scale - scale;

export interface TextOptions {
  readonly scale?: number;
  /** `center` measures from the *centre* of the string. */
  readonly align?: 'left' | 'center' | 'right';
  readonly baseline?: number;
}

/** One atlas per colour; glyph pixels are 1 bit, so the atlas is tiny. */
const atlases = new Map<string, HTMLCanvasElement>();

const atlasFor = (colour: string): HTMLCanvasElement | null => {
  const cached = atlases.get(colour);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const codes = Object.keys(G).flatMap((k) => [...k].map((c) => c.charCodeAt(0)));
  const max = codes.reduce((a, b) => (a > b ? a : b), 0);
  const canvas = document.createElement('canvas');
  canvas.width = (max + 1) * FONT_ADVANCE_X;
  canvas.height = FONT_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = colour;
  for (const [ch, rows] of Object.entries(G)) {
    const code = ch.charCodeAt(0);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] === '#') ctx.fillRect(code * FONT_ADVANCE_X + x, y, 1, 1);
      }
    });
  }
  atlases.set(colour, canvas);
  return canvas;
};

/**
 * Blits `text` in `colour`. Uses one `drawImage` per character when an atlas is
 * available and falls back to per-pixel rectangles otherwise, so the same call
 * works in a headless canvas with no atlas support.
 */
export const drawText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
  opts: TextOptions = {},
): void => {
  const scale = opts.scale ?? 1;
  const align = opts.align ?? 'left';
  const width = textWidth(text, scale);
  let left = x;
  if (align === 'center') left = Math.round(x - width / 2);
  if (align === 'right') left = x - width;
  const atlas = atlasFor(colour);
  if (atlas) {
    for (let i = 0; i < text.length; i += 1) {
      const key = keyFor(text[i] ?? ' ');
      if (key === undefined) continue;
      const code = key.charCodeAt(0);
      ctx.drawImage(
        atlas,
        code * FONT_ADVANCE_X,
        0,
        FONT_W,
        FONT_H,
        left + i * FONT_ADVANCE_X * scale,
        y,
        FONT_W * scale,
        FONT_H * scale,
      );
    }
    return;
  }
  ctx.fillStyle = colour;
  for (let i = 0; i < text.length; i += 1) {
    const rows = glyphRows(text[i] ?? ' ');
    if (!rows) continue;
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r] ?? '';
      for (let c = 0; c < row.length; c += 1) {
        if (row[c] === '#') {
          ctx.fillRect(left + (i * FONT_ADVANCE_X + c) * scale, y + r * scale, scale, scale);
        }
      }
    }
  }
};

/** Greedy word wrap for the rules screens; never splits a word that fits. */
export const wrapText = (text: string, maxChars: number): string[] => {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/ +/)) {
      if (word.length === 0) continue;
      if (line.length === 0) line = word;
      else if (line.length + 1 + word.length <= maxChars) line = `${line} ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
};
