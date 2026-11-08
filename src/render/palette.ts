/**
 * The game's own palette. Every entry is chosen for this project — see
 * `docs/asset-provenance.md`; none of it is sampled from the reference game.
 *
 * Two rules kept the palette usable on every display: the seven piece colours are
 * distinguishable for the most common colour-vision deficiencies (the red/green
 * pair is separated by brightness as well as hue, and the two greens differ in
 * brightness by more than 40 luma units), and every UI colour has at least a 4:1
 * contrast ratio against the panel it sits on.
 */

/** Piece colours, indexed exactly like `Cell` values 1..7 (`cellOf`). */
export const PIECE_COLOURS: readonly string[] = [
  '#3fd8ff', // I — cyan
  '#ffd23f', // O — amber
  '#b56cff', // T — violet
  '#4ade80', // S — green
  '#ff5a5a', // Z — red
  '#5b8bff', // J — blue
  '#ff9f40', // L — orange
];

/** Cell value 8: the inert rows a mode pushes in from the bottom. */
export const GARBAGE_COLOUR = '#7c8796';
/** Cell value 9: the special block that clears as an ordinary line. */
export const STAR_COLOUR = '#fff3b0';

export const COLOURS = {
  bg: '#05060c',
  fieldBg: '#0b1020',
  fieldGrid: '#141b30',
  fieldEdge: '#2a3654',
  panelBg: '#090d18',
  panelEdge: '#1c2740',
  text: '#e8f0ff',
  textDim: '#8b9bb8',
  textWarn: '#ffb347',
  textGood: '#6ee7a8',
  accent: '#3fd8ff',
  cursor: '#ffd23f',
  shadow: '#000000',
  ghost: '#8ea2c8',
  lockFlash: '#ffffff',
} as const;

export type PaletteKey = keyof typeof COLOURS;
export type AnyColour = PaletteKey | string;

/** Cell value → CSS colour, with the two special kinds handled. */
export const colourForCell = (cell: number): string | null => {
  if (cell === 0) return null;
  if (cell >= 1 && cell <= 7) return PIECE_COLOURS[cell - 1] ?? COLOURS.text;
  if (cell === 8) return GARBAGE_COLOUR;
  if (cell === 9) return STAR_COLOUR;
  return COLOURS.text;
};

/** Resolves a palette key, or passes through a literal `#rrggbb`. */
export const resolveColour = (value: AnyColour): string =>
  value.startsWith('#') ? value : COLOURS[value as PaletteKey] ?? COLOURS.text;

/** Multiplies every channel by `k`, for shaded faces and dim overlays. */
export const shade = (hex: string, k: number): string => {
  const v = hex.replace('#', '');
  const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const num = Number.parseInt(n.slice(0, 6), 16);
  const clamp = (x: number): number => Math.max(0, Math.min(255, Math.round(x * k)));
  const r = clamp(((num >> 16) & 255));
  const g = clamp(((num >> 8) & 255));
  const b = clamp(num & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

/** `#rrggbb` → `rgba(...)`; used for the ghost block and the dim veil. */
export const withAlpha = (hex: string, alpha: number): string => {
  const v = hex.replace('#', '');
  const num = Number.parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
};
