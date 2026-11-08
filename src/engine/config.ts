import type { Difficulty } from './types.js';

/**
 * Every tunable in one place, in **emulator-equivalent frames** at 60 Hz.
 *
 * The frame unit is deliberate: the reference analysis measured its timings in
 * frames, so a config value can be traced straight to a row in
 * `docs/game-design.md` § 2 (which in turn cites
 * `docs/reverse-engineering/gameplay-mechanics.md`). Tags there:
 * [M] measured, [A] assumed, [O] original.
 */
export interface GameConfig {
  /** Playfield width in cells. [M] 10 columns. */
  cols: number;
  /** Visible playfield height in cells. [M] 20 rows. */
  visibleRows: number;
  /**
   * Rows above the visible field, used for spawning. [M] the reference enters
   * pieces with the rotation box's top row one row above the top visible row.
   */
  hiddenRows: number;
  /** Frames per row of natural gravity, indexed by `level - 1` (15 levels). */
  gravityTable: readonly number[];
  /** Frames per row while the soft-drop key is held. [M] ~4.4, rounded to 4. */
  softDropFrames: number;
  /** Delayed auto-shift: frames held before the first repeat. [A] measured bracket ≤16. */
  dasFrames: number;
  /** Auto-shift repeat period. [A] measured bracket ≤6. */
  arrFrames: number;
  /**
   * Frames a landed piece survives without a downward move before locking.
   * [A] no such window was observable in the reference, so it is 0 here.
   */
  lockDelayFrames: number;
  /** Frames before the next piece appears after a lock. [M] observed ≤21, shipped 1. */
  spawnDelayFrames: number;
  /** Frames the field freezes while cleared rows flash. [O] the animation was too fast to sample. */
  clearFreezeFrames: number;
  /** Pieces shown in the next queue. [M] the reference draws three. */
  queueLength: number;
  /** Whether the ghost (landing projection) is drawn. [M] on in the reference. */
  ghost: boolean;
  /** Whether the hold slot is offered. [M] the reference has a hold option row. */
  hold: boolean;
  /** Number of levels in a ladder mode. [M] 15 per the reference's rules screen. */
  maxLevel: number;
  /** Lines required at level 1; the ladder goal is `goalBase * level`. [M] GOAL 5@L1, 20@L4. */
  goalBase: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  cols: 10,
  visibleRows: 20,
  hiddenRows: 2,
  gravityTable: [50, 46, 42, 38, 34, 30, 26, 22, 19, 16, 14, 12, 10, 8, 6],
  softDropFrames: 4,
  dasFrames: 16,
  arrFrames: 6,
  lockDelayFrames: 0,
  spawnDelayFrames: 1,
  clearFreezeFrames: 30,
  queueLength: 3,
  ghost: true,
  hold: true,
  maxLevel: 15,
  goalBase: 5,
};

/**
 * Gravity multiplier per difficulty setting.
 * The reference exposes a persisted 1…4 difficulty row but its effect was never
 * measurable (unknowns U19), so this table is our design [O].
 * Setting 2 is the neutral baseline that reproduces the measured 50 f/row at level 1.
 */
export const DIFFICULTY_SPEED: Record<Difficulty, number> = {
  1: 1.25,
  2: 1,
  3: 0.85,
  4: 0.7,
};

export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4];

export const isDifficulty = (v: unknown): v is Difficulty =>
  typeof v === 'number' && (DIFFICULTIES as readonly number[]).includes(v);

/** Frames per row for a level, after the difficulty multiplier. */
export const gravityFrames = (
  config: GameConfig,
  level: number,
  difficulty: Difficulty = 2,
): number => {
  const base = config.gravityTable[Math.min(config.gravityTable.length, Math.max(1, level)) - 1];
  const value = (base ?? config.gravityTable[0] ?? 50) / DIFFICULTY_SPEED[difficulty];
  return Math.max(1, Math.round(value));
};

/** Logical framebuffer size: the playfield plus a side panel for stats and queue. */
export const VIEW = {
  width: 240,
  height: 160,
  /** Cell size in logical pixels — matches the reference's 8×8 blocks. [M] */
  cell: 8,
  /** Playfield origin inside the framebuffer. [O] our own placement. */
  fieldX: 8,
  fieldY: 0,
  /** HUD panel starts here. [O] */
  panelX: 96,
} as const;
