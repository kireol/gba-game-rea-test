import type { ModePlugin } from './types.js';
import { goalLadderMode } from './goal-ladder.js';
import { linkedBlocksMode } from './linked-blocks.js';
import { timedGoalMode } from './timed-goal.js';
import { fixedLinesRaceMode } from './fixed-lines-race.js';
import { timedMaxLinesMode } from './timed-max-lines.js';
import { risingGarbageMode } from './rising-garbage.js';
import { duelMode } from './duel/index.js';

/** Menu order. Six single-player runs, then the local two-player one. */
export const MODES: readonly ModePlugin[] = [
  goalLadderMode,
  linkedBlocksMode,
  timedGoalMode,
  fixedLinesRaceMode,
  timedMaxLinesMode,
  risingGarbageMode,
  duelMode,
];

export const SINGLE_MODES: readonly ModePlugin[] = MODES.filter(
  (mode) => mode.family === 'single',
);

export const modeById = (id: string): ModePlugin | undefined =>
  MODES.find((mode) => mode.id === id);

/** Rules-screen text for a mode, as display lines. */
export const rulesLines = (mode: ModePlugin): readonly string[] => [
  mode.label,
  mode.summary,
  ...mode.rules,
];
