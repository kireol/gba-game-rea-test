import type { GameStatus } from '../engine/types.js';
import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from './types.js';
import { goalRow, levelRow, timeRow } from './util.js';

const TARGET_LINES = 30;
const LIMIT_SECONDS = 150;
const LINES_PER_LEVEL = 8;

/** Line quota against a countdown. */
export const timedGoalMode: ModePlugin = {
  id: 'timed-goal',
  label: 'RUSH',
  family: 'single',
  summary: 'Clear a line quota before the clock runs out.',
  rules: [
    `Clear ${TARGET_LINES} lines inside ${LIMIT_SECONDS / 60} minutes.`,
    'The level rises every 8 lines, so gravity keeps getting faster.',
    'The clock only runs while you are playing: pausing stops it.',
    'Meeting the quota wins; the clock reaching zero loses.',
  ],
  showLines: true,
  timeUpLabel: 'TIME UP',
  createRun(api: ModeApi): ModeRun {
    let over: GameStatus = 'playing';
    const left = (): number => Math.max(0, TARGET_LINES - api.lines);
    return {
      hud: () => [
        timeRow('TIME LEFT', LIMIT_SECONDS - api.seconds),
        goalRow(left()),
        levelRow(api.level),
      ],
      goal: (): GoalInfo => ({
        kind: 'time-left',
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
        } else if (api.seconds >= LIMIT_SECONDS) {
          over = 'lost';
          api.setStatus('lost');
        }
      },
    };
  },
};
