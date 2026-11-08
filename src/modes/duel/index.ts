import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from '../types.js';
import { levelRow, linesRow, timeRow } from '../util.js';

const LINES_PER_LEVEL = 8;

/**
 * Both halves of a local versus game run this plugin; `createDuel` in
 * `src/gameplay/duel.ts` owns the attack routing and the winner. The run itself
 * never wins or loses: the core ends a side with a top-out, and the wrapper turns
 * "the other side topped out" into the result.
 */
export const duelMode: ModePlugin = {
  id: 'local-versus',
  label: 'DUEL',
  family: 'versus',
  summary: 'Two players, one device, same piece sequence.',
  rules: [
    'Both sides draw from the same piece sequence.',
    'Clearing lines sends garbage to the other side: 2 lines send 1 row, 3 send 2, 4 send 4.',
    'A perfect clear sends one extra row.',
    'The level rises every 8 lines. The first stack to reach the top loses.',
  ],
  showLines: true,
  createRun(api: ModeApi): ModeRun {
    return {
      hud: () => [timeRow('TIME', api.seconds), linesRow(api.lines), levelRow(api.level)],
      // The versus result comes from the other board, so there is no goal row.
      goal: (): GoalInfo | null => null,
      status: () => 'playing',
      advance() {
        api.setLevel(Math.min(api.config.maxLevel, 1 + Math.floor(api.lines / LINES_PER_LEVEL)));
      },
    };
  },
};
