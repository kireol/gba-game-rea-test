import type { GameStatus } from '../engine/types.js';
import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from './types.js';
import { goalRow, levelRow, timeRow } from './util.js';

const TARGET_LINES = 40;
const LINES_PER_LEVEL = 10;

/** Fixed line quota, stopwatch running up. Contrast with the timed modes. */
export const fixedLinesRaceMode: ModePlugin = {
  id: 'fixed-lines-race',
  label: 'DASH',
  family: 'single',
  summary: 'Clear a fixed line quota as fast as possible.',
  rules: [
    `Clear ${TARGET_LINES} lines. The clock counts up and your time is the score.`,
    'The level rises every 10 lines.',
    'There is no time limit: only topping out can end the run early.',
  ],
  showLines: true,
  createRun(api: ModeApi): ModeRun {
    let over: GameStatus = 'playing';
    const left = (): number => Math.max(0, TARGET_LINES - api.lines);
    return {
      hud: () => [timeRow('TIME', api.seconds), goalRow(left()), levelRow(api.level)],
      goal: (): GoalInfo => ({
        kind: 'lines-total',
        label: 'GOAL',
        current: String(left()),
        numeric: left(),
        target: TARGET_LINES,
      }),
      status: () => over,
      advance() {
        api.setLevel(Math.min(api.config.maxLevel, 1 + Math.floor(api.lines / LINES_PER_LEVEL)));
        if (api.lines >= TARGET_LINES) {
          over = 'won';
          api.setStatus('won');
        }
      },
    };
  },
};
