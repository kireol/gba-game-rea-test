import type { GameStatus } from '../engine/types.js';
import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from './types.js';
import { levelRow, linesRow, timeRow } from './util.js';

const LIMIT_SECONDS = 120;
const LINES_PER_LEVEL = 8;

/** Pure clock mode: count lines up while the countdown runs. */
export const timedMaxLinesMode: ModePlugin = {
  id: 'timed-max-lines',
  label: 'BLITZ',
  family: 'single',
  summary: 'Stack as many lines as the clock allows.',
  rules: [
    `You have ${LIMIT_SECONDS / 60} minutes. Every line counts.`,
    'The level rises every 8 lines.',
    'The run ends when the clock hits zero — a fast stacker simply scores higher.',
    'Topping out before that still loses.',
  ],
  showLines: true,
  timeUpLabel: 'TIME UP',
  createRun(api: ModeApi): ModeRun {
    let over: GameStatus = 'playing';
    return {
      hud: () => [
        timeRow('TIME LEFT', LIMIT_SECONDS - api.seconds),
        linesRow(api.lines),
        levelRow(api.level),
      ],
      goal: (): GoalInfo => ({
        kind: 'time-up',
        label: 'GOAL',
        current: String(api.lines),
        numeric: api.lines,
        target: 0,
      }),
      status: () => over,
      advance() {
        api.setLevel(Math.min(api.config.maxLevel, 1 + Math.floor(api.lines / LINES_PER_LEVEL)));
        if (api.seconds >= LIMIT_SECONDS) {
          over = 'lost';
          api.setStatus('lost');
        }
      },
    };
  },
};
