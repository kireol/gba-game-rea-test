import { describe, expect, it } from 'vitest';
import {
  COMBO_UNIT,
  HARD_DROP_POINTS,
  MAX_COMBO,
  PERFECT_CLEAR_BONUS,
  SOFT_DROP_POINTS,
  clearScore,
  dropScore,
} from '../gameplay/score.js';
import { EMPTY, GARBAGE } from '../engine/types.js';
import {
  awaitActive,
  SEED,
  activeRot,
  completeFloor,
  countType,
  emptyBoard,
  hardDrop,
  makeSession,
  of,
  poke,
  press,
  release,
  seedShowing,
  steer,
  tap,
  view,
} from './helpers.js';
import type { Session } from '../gameplay/session.js';
import { goalLadderMode } from '../modes/goal-ladder.js';

/**
 * One block, high up in the left corner. It is never inside a spawn footprint
 * (columns 3-7) and never under a column a test drops into, so it cannot stop a
 * piece from reaching the floor — it only guarantees the field is not left empty,
 * which keeps the perfect-clear bonus out of tests that are measuring something
 * else.
 */
const keepAlive = (s: Session): void => {
  poke(view(s).board, 0, 10, GARBAGE);
};

/** Clears from a known empty field, so the helper's floor geometry always holds. */
const scoredClear = (s: Session, rows = 1): number => {
  emptyBoard(view(s).board);
  keepAlive(s);
  const [line] = of(completeFloor(s, rows), 'lines');
  if (!line) throw new Error('scoredClear: expected a lines event');
  return line.score;
};

describe('clearScore', () => {
  it('pays a rising amount per line at level 1', () => {
    expect(clearScore(1, 1, false, 0).points).toBe(100);
    expect(clearScore(2, 1, false, 0).points).toBe(300);
    expect(clearScore(3, 1, false, 0).points).toBe(500);
    expect(clearScore(4, 1, false, 0).points).toBe(800);
  });

  it('multiplies the line value by the level', () => {
    expect(clearScore(4, 3, false, 0).points).toBe(2400);
    expect(clearScore(1, 15, false, 0).points).toBe(1500);
  });

  it('adds a level-scaled combo bonus on top of the line value', () => {
    // `combo` counts the clears already chained, so the first one earns nothing.
    expect(clearScore(1, 1, false, 1).points).toBe(100 + COMBO_UNIT);
    expect(clearScore(1, 2, false, 3).points).toBe(200 + COMBO_UNIT * 3 * 2);
  });

  it('caps the combo bonus at MAX_COMBO', () => {
    const atCap = clearScore(0, 1, false, MAX_COMBO).points;
    expect(atCap).toBe(COMBO_UNIT * MAX_COMBO);
    expect(clearScore(0, 1, false, MAX_COMBO + 15).points).toBe(atCap);
  });

  it('adds a level-scaled perfect-clear bonus', () => {
    expect(clearScore(1, 1, true, 0).points).toBe(100 + PERFECT_CLEAR_BONUS);
    expect(clearScore(2, 2, true, 0).points).toBe(300 * 2 + PERFECT_CLEAR_BONUS * 2);
  });

  it('clamps the row count and echoes back what it was told', () => {
    expect(clearScore(9, 1, false, 0).points).toBe(800);
    expect(clearScore(-1, 1, false, 0).points).toBe(0);
    expect(clearScore(2, 4, true, 5)).toEqual({
      points: 300 * 4 + PERFECT_CLEAR_BONUS * 4 + COMBO_UNIT * 5 * 4,
      combo: 5,
      perfect: true,
    });
  });
});

describe('dropScore', () => {
  it('pays one point per soft-dropped row', () => {
    expect(dropScore(3, false)).toBe(3 * SOFT_DROP_POINTS);
  });

  it('pays double per row for a hard drop', () => {
    expect(dropScore(3, true)).toBe(3 * HARD_DROP_POINTS);
  });

  it('never pays for a negative or empty distance', () => {
    expect(dropScore(0, true)).toBe(0);
    expect(dropScore(-4, true)).toBe(0);
    expect(dropScore(-4, false)).toBe(0);
  });
});

describe('scoring during a run', () => {
  it('starts at zero', () => {
    expect(view(makeSession()).score).toBe(0);
  });

  it('pays for every row the piece soft-drops', () => {
    const s = makeSession();
    press(s, 'soft-drop');
    const events = s.advance(9);
    release(s, 'soft-drop');
    // Gravity would not move the piece before frame 50, so all of this is the
    // soft-drop rate: rows on frames 1, 5 and 9.
    expect(of(events, 'soft-drop')).toHaveLength(3);
    expect(countType(events, 'shift')).toBe(0);
    expect(view(s).score).toBe(3 * SOFT_DROP_POINTS);
  });

  it('pays per row fallen when the piece is hard-dropped', () => {
    const s = makeSession();
    const events = hardDrop(s);
    const dy = of(events, 'hard-drop')[0]?.dy ?? 0;
    expect(dy).toBeGreaterThan(0);
    expect(view(s).score).toBe(dy * HARD_DROP_POINTS);
  });

  it('reports the gain in the lines event and keeps the running total', () => {
    const s = makeSession();
    keepAlive(s);
    const events = completeFloor(s, 1);
    const [line] = of(events, 'lines');
    const dy = of(events, 'hard-drop')[0]?.dy ?? 0;
    expect(line).toMatchObject({ count: 1, score: 100, perfect: false });
    expect(view(s).score).toBe(dy * HARD_DROP_POINTS + (line?.score ?? 0));
  });

  it('pays the four-row rate and plays the big-clear cue', () => {
    const s = makeSession(goalLadderMode, seedShowing('I'));
    tap(s, 'rotate-ccw');
    // Rotation state 3 puts the line piece in box column 0, so steering the piece
    // steers its single column, which is the only way four rows can be finished
    // by one piece: the filled rows need an open descent column each.
    expect(activeRot(s)).toBe(3);
    steer(s, 4);
    keepAlive(s);
    const events = completeFloor(s, 4);
    const [line] = of(events, 'lines');
    expect(line?.count).toBe(4);
    expect(line?.rows).toEqual([18, 19, 20, 21]);
    expect(line?.score).toBe(800);
    expect(of(events, 'sfx').some((event) => event.name === 'clear-big')).toBe(true);
    expect(of(events, 'sfx').some((event) => event.name === 'clear')).toBe(false);
  });

  it('pays the perfect-clear bonus when the field is left empty', () => {
    const s = makeSession(goalLadderMode, seedShowing('O'));
    // The square is two rows tall, so finishing two rows puts the whole piece
    // inside the cleared rows and leaves the field empty.
    const events = completeFloor(s, 2);
    const [line] = of(events, 'lines');
    expect(line).toMatchObject({ count: 2, perfect: true });
    expect(line?.score).toBe(300 + PERFECT_CLEAR_BONUS);
    expect(view(s).board.cells.some((cell) => cell !== EMPTY)).toBe(false);
  });

  it('resets the chain when a piece clears nothing', () => {
    const s = makeSession();
    expect(scoredClear(s)).toBe(100);
    expect(scoredClear(s)).toBe(100 + COMBO_UNIT);
    expect(view(s).combo).toBe(2);
    emptyBoard(view(s).board);
    keepAlive(s);
    const dud = hardDrop(s);
    expect(countType(dud, 'lines')).toBe(0);
    expect(view(s).combo).toBe(0);
    awaitActive(s); // the field has no active piece until the spawn delay passes
    expect(scoredClear(s)).toBe(100);
  });

  it('scores the same clear for more at a higher level', () => {
    const s = makeSession(goalLadderMode, SEED, { goalBase: 1 });
    keepAlive(s);
    const first = completeFloor(s, 1);
    expect(of(first, 'level-up').map((event) => event.level)).toEqual([2]);
    expect(view(s).level).toBe(2);
    // Level 2 doubles the line value, and this clear also carries a combo bonus.
    expect(scoredClear(s)).toBe(100 * 2 + COMBO_UNIT * 2);
  });
});
