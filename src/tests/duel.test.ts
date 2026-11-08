import { describe, expect, it } from 'vitest';
import { GARBAGE } from '../engine/types.js';
import { cellsOf } from '../engine/pieces.js';
import { ghostY } from '../engine/board.js';
import type { Session } from '../gameplay/session.js';
import { attackFor, createDuel } from '../gameplay/duel.js';
import {
  SEED,
  activeId,
  configWith,
  fillRow,
  of,
  poke,
  seedShowing,
  view,
} from './helpers.js';

/**
 * The local versus wrapper: two independent mechanics cores, one shared piece
 * sequence, and line clears routed as garbage into the rival core. The DUEL mode
 * plugin itself is pinned in `modes.test.ts` (its level ladder, its empty goal);
 * everything here needs both boards at once, which no single-mode test can express.
 */

const makeDuel = (seed: number = SEED, config = configWith()) =>
  createDuel({ seed, config });

/**
 * Fills the bottom `rows` rows and opens exactly the cells the active piece will
 * land in — the same construction as `completeFloor`, but without the drop. The
 * duel wrapper computes attacks from the events `step()` returns, so a helper that
 * drains the side itself would swallow the `lines` event and nothing would be sent.
 */
const prepareFloor = (s: Session, rows: number): void => {
  const snap = view(s);
  const piece = snap.active;
  if (!piece) throw new Error('prepareFloor: no active piece');
  const board = snap.board;
  const landing = cellsOf(piece, piece.rot, 0, ghostY(board, piece) - piece.y);
  const height = Math.max(...cellsOf(piece).map((c) => c.y)) - piece.y + 1;
  const count = Math.max(1, Math.min(rows, height));
  if (Math.max(...landing.map((c) => c.y)) !== board.rows - 1) {
    throw new Error('prepareFloor: the active piece does not reach the floor row');
  }
  for (let y = board.rows - count; y < board.rows; y += 1) fillRow(board, y);
  for (const c of landing) poke(board, c.x, c.y, 0);
};

const hudLabels = (s: Session): string[] => view(s).hud.map((row) => row.label);

describe('attackFor', () => {
  it('matches the attack table the mode rules promise', () => {
    expect([
      attackFor(0, false),
      attackFor(1, false),
      attackFor(2, false),
      attackFor(3, false),
      attackFor(4, false),
      attackFor(5, false),
      attackFor(0, true),
      attackFor(1, true),
      attackFor(2, true),
      attackFor(3, true),
      attackFor(4, true),
    ]).toEqual([0, 0, 1, 2, 4, 4, 0, 1, 2, 3, 5]);
  });
});

describe('the local versus wrapper', () => {
  it('draws the same piece sequence on both sides', () => {
    const duel = makeDuel();
    expect(activeId(duel.a)).toBe(activeId(duel.b));
    expect(view(duel.a).queue).toEqual(view(duel.b).queue);
    for (const frames of [1, 60, 240]) {
      duel.step(frames);
      expect(duel.a.digest(), `after ${frames} more frames`).toBe(duel.b.digest());
    }
  });

  it('shows the stopwatch, the line count and the level, and nothing else', () => {
    const duel = makeDuel();
    expect(hudLabels(duel.a)).toEqual(['TIME', 'LINES', 'LEVEL']);
    expect(view(duel.a).goal).toBeNull();
  });

  it('sends the rival a row for a two-line clear', () => {
    const duel = createDuel({ seed: seedShowing('O'), config: configWith() });
    const board = duel.a.snapshot().board;
    // One block above the rows about to clear, so the clear is not perfect and the
    // send is exactly what the base table says: 2 lines -> 1 row.
    poke(board, board.cols - 1, board.rows - 3, GARBAGE);
    prepareFloor(duel.a, 2);
    duel.input('a', 'hard-drop');

    const first = duel.step(120);
    const lines = of(first.a, 'lines');
    expect(lines[0]?.count).toBe(2);
    expect(lines[0]?.perfect).toBe(false);
    expect(of(first.b, 'garbage')).toEqual([]);

    const second = duel.step(1);
    expect(of(second.b, 'garbage')).toEqual([{ type: 'garbage', rows: 1 }]);
    expect(of(second.a, 'garbage')).toEqual([]);
    expect(duel.a.digest()).not.toBe(duel.b.digest());
  });

  it('sends one extra row when the clear empties the field', () => {
    const duel = createDuel({ seed: seedShowing('O'), config: configWith() });
    prepareFloor(duel.a, 2);
    duel.input('a', 'hard-drop');

    const first = duel.step(120);
    expect(of(first.a, 'lines')[0]?.perfect).toBe(true);
    expect(of(duel.step(1).b, 'garbage')).toEqual([{ type: 'garbage', rows: 2 }]);
  });

  it('never declares a win, whatever either side clears', () => {
    const duel = createDuel({ seed: seedShowing('O'), config: configWith({ maxLevel: 1 }) });
    prepareFloor(duel.a, 2);
    duel.input('a', 'hard-drop');
    duel.step(240);
    expect([view(duel.a).status, view(duel.b).status]).toEqual(['playing', 'playing']);
    expect(duel.winner()).toBeNull();
    expect(duel.over()).toBe(false);
  });

  it('decides the winner from the rival top-out alone', () => {
    const duel = makeDuel();
    expect(duel.over()).toBe(false);
    expect(duel.winner()).toBeNull();
    duel.a.receiveGarbage(30);
    expect(duel.winner()).toBe('b');
    expect(duel.over()).toBe(true);
    duel.b.receiveGarbage(30);
    expect(duel.winner()).toBeNull();
    expect(duel.over()).toBe(true);
  });

  it('pauses and resumes both boards together', () => {
    const duel = makeDuel();
    duel.togglePause();
    expect([view(duel.a).status, view(duel.b).status]).toEqual(['paused', 'paused']);
    duel.step(120);
    expect([view(duel.a).frames, view(duel.b).frames]).toEqual([0, 0]);
    duel.togglePause();
    duel.step(60);
    expect([view(duel.a).frames, view(duel.b).frames]).toEqual([60, 60]);
  });

  it('never revives or pauses a side that already lost', () => {
    const duel = makeDuel();
    duel.a.receiveGarbage(30);
    expect(duel.winner()).toBe('b');
    duel.togglePause();
    expect([view(duel.a).status, view(duel.b).status]).toEqual(['lost', 'paused']);
    duel.togglePause();
    expect([view(duel.a).status, view(duel.b).status]).toEqual(['lost', 'playing']);
    // The survivor keeps playing while the lost side stays frozen.
    duel.step(60);
    expect([view(duel.a).frames, view(duel.b).frames]).toEqual([0, 60]);
  });
});
