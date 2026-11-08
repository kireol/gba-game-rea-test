import {
  EMPTY,
  GARBAGE,
  STAR,
  type GameStatus,
  type Vec,
} from '../engine/types.js';
import { at, floodSameColour } from '../engine/board.js';
import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from './types.js';
import { goalRow, levelRow, timeRow } from './util.js';

const START_GARBAGE = 3;
const LEVEL_GARBAGE = 2;
/** Empty cells in the star row when it is pushed in, i.e. cells the player must fill. */
const STAR_HOLES = 4;

/**
 * Star blocks plus same-kind clusters.
 *
 * Two rules that only exist here (they are not in the core mechanics):
 * - a row of star blocks is pushed in under the stack, and clearing that row
 *   raises the level instead of a line quota doing it;
 * - `extendClear` widens a line clear to every orthogonally connected group of
 *   same-kind blocks that touches the cleared row, while the board is still intact.
 */
export const linkedBlocksMode: ModePlugin = {
  id: 'linked-blocks',
  label: 'FUSION',
  family: 'single',
  summary: 'Dig down to the star row, then clear it.',
  rules: [
    'The field starts with garbage rows sitting on a row of star blocks.',
    'Star blocks fill a line like any other block; clearing that row raises the level.',
    'Locked blocks of the same kind stick together: when a line clears, every cluster touching that line clears with it.',
    'A fresh garbage and star layer arrives with each level. Clearing the star row at the top level wins.',
  ],
  showLines: true,
  setupBoard(_board, api) {
    for (let i = 0; i < START_GARBAGE; i += 1) api.pushRow(GARBAGE, 1);
    api.pushRow(STAR, STAR_HOLES);
  },
  createRun(api: ModeApi): ModeRun {
    const max = api.config.maxLevel;
    let starTouch = 0;
    let over: GameStatus = 'playing';

    const starRow = (): number => {
      for (let y = api.board.rows - 1; y >= 0; y -= 1) {
        for (let x = 0; x < api.board.cols; x += 1) {
          if (at(api.board, x, y) === STAR) return y;
        }
      }
      return -1;
    };
    /** Cells still missing from the star row — the mode's countdown goal. */
    const missing = (): number => {
      const y = starRow();
      if (y < 0) return 0;
      let n = 0;
      for (let x = 0; x < api.board.cols; x += 1) if (at(api.board, x, y) === EMPTY) n += 1;
      return n;
    };

    return {
      hud: () => [timeRow('TIME', api.seconds), goalRow(missing()), levelRow(api.level)],
      goal: (): GoalInfo => ({
        kind: 'star-row',
        label: 'GOAL',
        current: String(missing()),
        numeric: missing(),
        target: api.board.cols,
      }),
      status: () => over,
      extendClear(clearedRows, candidate) {
        const seeds: Vec[] = [];
        starTouch = 0;
        for (const y of clearedRows) {
          for (let x = 0; x < api.board.cols; x += 1) {
            const v = at(api.board, x, y);
            if (v === STAR) starTouch += 1;
            else if (v >= 1 && v <= 7) seeds.push({ x, y });
          }
        }
        for (const index of floodSameColour(api.board, seeds)) candidate.add(index);
      },
      onClear() {
        if (starTouch === 0) return;
        starTouch = 0;
        if (api.level >= max) {
          over = 'won';
          api.setStatus('won');
          return;
        }
        api.setLevel(api.level + 1);
        for (let i = 0; i < LEVEL_GARBAGE; i += 1) api.pushRow(GARBAGE, 1);
        api.pushRow(STAR, STAR_HOLES);
      },
    };
  },
};
