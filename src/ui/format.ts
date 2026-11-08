/**
 * Display formatting. Everything here is pure so the same strings appear in the
 * drawn frame models and in the tests that assert on them.
 *
 * Only characters the built-in 5x7 table can draw are produced (uppercase, digits
 * and a small punctuation set), so no formatter can silently render a blank.
 */

const CLAMP_SECONDS = 99 * 60 + 59;

export const pad2 = (value: number): string =>
  Math.trunc(Math.max(0, value)).toString().padStart(2, '0');

/** `MM:SS`, saturating at `99:59`; a negative or non-finite clock reads `00:00`. */
export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const total = Math.min(CLAMP_SECONDS, Math.floor(seconds));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
};

/** `M:SS.d` for the timed modes, where the tenths matter. */
export const formatTimeTenths = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00.0';
  const tenths = Math.min(CLAMP_SECONDS * 10, Math.round(seconds * 10));
  return `${Math.floor(tenths / 600)}:${pad2(Math.floor(tenths / 10) % 60)}.${tenths % 10}`;
};

/** Grouped with thin spaces so a seven-figure run still scans. */
export const formatScore = (value: number): string => {
  const digits = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const formatPercent = (ratio: number): string =>
  `${Math.round((Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0) * 100)}%`;

/** `+3`, `-1`, `0` — used by the garbage/attack counters. */
export const formatSigned = (value: number): string => {
  const n = Math.trunc(Number.isFinite(value) ? value : 0);
  return n > 0 ? `+${n}` : `${n}`;
};

const SUFFIXES: Record<number, string> = { 1: 'ST', 2: 'ND', 3: 'RD' };

/** `1ST`, `2ND`, `3RD`, `4TH`, … (11-13 take `TH`). */
export const ordinal = (value: number): string => {
  const n = Math.max(1, Math.trunc(Number.isFinite(value) ? value : 1));
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'TH' : (SUFFIXES[n % 10] ?? 'TH');
  return `${n}${suffix}`;
};

export const plural = (count: number, one: string, many = `${one}S`): string =>
  `${Math.trunc(count)} ${Math.trunc(count) === 1 ? one : many}`;

/** `YES` / `NO` — the whole game is drawn in caps, so answers are too. */
export const yesNo = (value: boolean): string => (value ? 'YES' : 'NO');

/** Difficulty 1..4 → its label; anything else clamps into range. */
export const difficultyLabel = (value: number): string => {
  const n = Math.min(4, Math.max(1, Math.trunc(Number.isFinite(value) ? value : 2)));
  return ['', 'EASIEST', 'EASY', 'HARD', 'HARDEST'][n] ?? 'EASY';
};
