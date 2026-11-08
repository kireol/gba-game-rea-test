import type { GameStatus } from '../engine/types.js';
import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from './types.js';
import { levelRow, linesRow, timeRow } from './util.js';

const FIRST_GARBAGE_SECONDS = 12;
const MIN_GARBAGE_SECONDS = 3;
/** The interval shrinks by this much after every push-in. */
const RAMP_SECONDS = 0.5;
const LINES_PER_LEVEL = 10;

/** Endless mode: garbage rises on a ramp and only a top-out ends the run. */
export const risingGarbageMode: ModePlugin = {
  id: 'rising-garbage',
  label: 'ENDLESS',
  family: 'single',
  summary: 'Survive rising garbage for as long as you can.',
  rules: [
    'Garbage is pushed in from the bottom, faster with every wave.',
    'The level rises every 10 lines, on top of the garbage ramp.',
    'There is no winning condition: the run ends when the stack reaches the top.',
    'Score is what you survive for.',
  ],
  showLines: true,
  createRun(api: ModeApi): ModeRun {
    let over: GameStatus = 'playing';
    let pushes = 0;
    let nextPush = FIRST_GARBAGE_SECONDS;
    const interval = (): number =>
      Math.max(MIN_GARBAGE_SECONDS, FIRST_GARBAGE_SECONDS - pushes * RAMP_SECONDS);
    return {
      hud: () => [
        timeRow('TIME', api.seconds),
        linesRow(api.lines),
        levelRow(api.level),
      ],
      goal: (): GoalInfo => ({
        kind: 'survive',
        label: 'NEXT',
        current: String(Math.max(0, Math.ceil(nextPush - api.seconds))),
        numeric: Math.max(0, Math.ceil(nextPush - api.seconds)),
        target: 0,
      }),
      status: () => over,
      advance() {
        if (over !== 'playing') return;
        api.setLevel(Math.min(api.config.maxLevel, 1 + Math.floor(api.lines / LINES_PER_LEVEL)));
        while (api.seconds >= nextPush) {
          api.addGarbage(1);
          pushes += 1;
          nextPush += interval();
          if (api.status !== 'playing') break;
        }
      },
    };
  },
};
