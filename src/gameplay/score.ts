/**
 * Scoring.
 *
 * The reference has no score field anywhere
 * (`docs/reverse-engineering/scoring-and-progression.md` § 1), so this entire
 * table is our design, shown only when `assist.showScore` is on
 * (`docs/architecture/decisions.md` D5).
 */
export const MAX_COMBO = 10;

const LINE_SCORES: readonly number[] = [0, 100, 300, 500, 800];

export const PERFECT_CLEAR_BONUS = 1000;
export const COMBO_UNIT = 50;
export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

export interface ClearScore {
  readonly points: number;
  readonly combo: number;
  readonly perfect: boolean;
}

/**
 * `combo` is the number of *previous* consecutive clearing pieces (0 for the
 * first), so the first clear earns no combo bonus.
 */
export const clearScore = (
  count: number,
  level: number,
  perfect: boolean,
  combo: number,
): ClearScore => {
  const rows = Math.max(0, Math.min(LINE_SCORES.length - 1, count));
  const base = (LINE_SCORES[rows] ?? 0) * level;
  const comboBonus =
    combo > 0 ? COMBO_UNIT * Math.min(combo, MAX_COMBO) * level : 0;
  const perfectBonus = perfect ? PERFECT_CLEAR_BONUS * level : 0;
  return { points: base + comboBonus + perfectBonus, combo, perfect };
};

export const dropScore = (cells: number, hard: boolean): number =>
  Math.max(0, cells) * (hard ? HARD_DROP_POINTS : SOFT_DROP_POINTS);
