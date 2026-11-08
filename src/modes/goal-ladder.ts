import type { GameStatus } from '../engine/types.js';
import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from './types.js';
import { goalRow, levelRow, timeRow } from './util.js';

/**
 * Level ladder. The goal is `goalBase * level` lines and leftovers carry over:
 * the reference HUD read `GOAL 5` at level 1 and `GOAL 20` at level 4 [M], which
 * is exactly `5 × level` in both samples.
 */
export const goalLadderMode: ModePlugin = {
  id: 'goal-ladder',
  label: 'ASCENT',
  family: 'single',
  summary: 'Clear the goal lines to climb the level ladder.',
  rules: [
    'The goal is 5 lines at level 1 and grows by 5 for every level.',
    'Leftover lines carry into the next goal.',
    'Gravity speeds up as the level rises.',
    'Finishing the top level wins the run; topping out loses it.',
  ],
  showLines: true,
  createRun(api: ModeApi): ModeRun {
    const max = api.config.maxLevel;
    const need = (level: number): number => api.config.goalBase * level;
    let intoLevel = 0;
    let over: GameStatus = 'playing';
    // A finished ladder has no lines left to ask for. `onClear` pays the goal
    // before it notices the level cap, so the remainder would otherwise be a
    // whole goal on the screen of a run the player just won.
    const left = (): number =>
      over === 'won' ? 0 : Math.max(0, need(api.level) - intoLevel);
    return {
      hud: () => [timeRow('TIME', api.seconds), goalRow(left()), levelRow(api.level)],
      goal: (): GoalInfo => ({
        kind: 'lines-to-level',
        label: 'GOAL',
        current: String(left()),
        numeric: left(),
        target: need(api.level),
      }),
      status: () => over,
      onClear(_rows, count) {
        intoLevel += count;
        while (over === 'playing' && intoLevel >= need(api.level)) {
          intoLevel -= need(api.level);
          if (api.level >= max) {
            over = 'won';
            api.setStatus('won');
            break;
          }
          api.setLevel(api.level + 1);
        }
      },
    };
  },
};
