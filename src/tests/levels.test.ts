import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../engine/config.js';
import {
  SEED,
  activeId,
  completeFloor,
  countType,
  emptyBoard,
  makeSession,
  of,
  seedShowing,
  tap,
  view,
} from './helpers.js';
import { goalLadderMode } from '../modes/goal-ladder.js';
import type { SessionEvent } from '../engine/types.js';
import type { Session } from '../gameplay/session.js';

const ascends = (over: Partial<typeof DEFAULT_CONFIG> = {}): Session =>
  makeSession(goalLadderMode, SEED, over);

/**
 * Completes one row and wipes the field, so the next piece reaches the floor the
 * same way. `completeFloor` already waits for the follow-up piece — nothing else
 * can put one on the field after a clear.
 */
const clearOneRow = (s: Session): void => {
  completeFloor(s, 1);
  emptyBoard(view(s).board);
};

/** Clears `count` single rows, one piece each. */
const climbBy = (s: Session, count: number): void => {
  for (let i = 0; i < count; i += 1) clearOneRow(s);
};

/**
 * Clears exactly two rows with the piece that is on the field. A flat line piece
 * is one row tall, so it is stood up first; every other shape is already two rows
 * high at spawn.
 */
const clearTwoRows = (s: Session): SessionEvent[] => {
  if (activeId(s) === 'I') tap(s, 'rotate-cw', 0);
  return completeFloor(s, 2);
};

/** Rotates a line piece upright and clears the four rows it can then reach. */
const clearFourRows = (s: Session): SessionEvent[] => {
  if (activeId(s) === 'I') tap(s, 'rotate-cw', 0);
  return completeFloor(s, 4);
};

const goalOf = (s: Session): number | null => view(s).goal?.numeric ?? null;
const hudOf = (s: Session, label: string): string | undefined =>
  view(s).hud.find((field) => field.label === label)?.value;
const levels = (events: readonly SessionEvent[]): number[] =>
  of(events, 'level-up').map((event) => event.level);

describe('the level ladder', () => {
  it('starts at level 1 with the goal lines it promises', () => {
    const s = ascends();
    expect(view(s).level).toBe(1);
    expect(goalOf(s)).toBe(DEFAULT_CONFIG.goalBase);
    expect(hudOf(s, 'LEVEL')).toBe('1');
    expect(hudOf(s, 'GOAL')).toBe(String(DEFAULT_CONFIG.goalBase));
  });

  it('counts the goal down and holds the level until the last row goes', () => {
    const s = ascends();
    for (let cleared = 1; cleared < DEFAULT_CONFIG.goalBase; cleared += 1) {
      clearOneRow(s);
      expect(view(s).level).toBe(1);
      expect(goalOf(s)).toBe(DEFAULT_CONFIG.goalBase - cleared);
      expect(hudOf(s, 'GOAL')).toBe(String(DEFAULT_CONFIG.goalBase - cleared));
    }
    expect(view(s).lines).toBe(DEFAULT_CONFIG.goalBase - 1);
    expect(view(s).status).toBe('playing');
  });

  it('climbs a level on the goal line, says so, and asks for more lines', () => {
    const s = ascends();
    climbBy(s, DEFAULT_CONFIG.goalBase - 1);
    const events = completeFloor(s, 1);
    expect(levels(events)).toEqual([2]);
    expect(of(events, 'sfx').map((event) => event.name)).toContain('level-up');
    expect(view(s).level).toBe(2);
    expect(goalOf(s)).toBe(DEFAULT_CONFIG.goalBase * 2);
    expect(hudOf(s, 'LEVEL')).toBe('2');
    expect(hudOf(s, 'GOAL')).toBe(String(DEFAULT_CONFIG.goalBase * 2));
  });

  it('carries the lines it did not need into the next goal', () => {
    const s = ascends();
    // Four rows at the goal of five, then a two-row clear: the fifth line raises
    // the level and the sixth is already counted against the next, longer goal.
    climbBy(s, DEFAULT_CONFIG.goalBase - 1);
    const events = clearTwoRows(s);
    expect(of(events, 'lines')[0]?.count).toBe(2);
    expect(levels(events)).toEqual([2]);
    expect(view(s).lines).toBe(DEFAULT_CONFIG.goalBase + 1);
    expect(view(s).level).toBe(2);
    // The new goal is double, less the one line that was already in hand.
    expect(goalOf(s)).toBe(DEFAULT_CONFIG.goalBase * 2 - 1);
  });

  it('walks the ladder as far as one piece carries it', () => {
    // goalBase 1 keeps the arithmetic inside a single four-row clear: level 1
    // needs 1 line, level 2 needs 2, so the third row already lands on level 3.
    const s = makeSession(goalLadderMode, seedShowing('I'), { goalBase: 1 });
    expect(activeId(s)).toBe('I');
    const events = clearFourRows(s);
    expect(of(events, 'lines')[0]?.count).toBe(4);
    expect(levels(events)).toEqual([2, 3]);
    expect(view(s).level).toBe(3);
    // 4 lines paid 1 + 2, leaving 1 against the level-3 goal of 3.
    expect(goalOf(s)).toBe(2);
  });

  it('does not climb twice for the same lines', () => {
    const s = makeSession(goalLadderMode, seedShowing('I'), { goalBase: 2 });
    const events = clearFourRows(s);
    expect(of(events, 'lines')[0]?.count).toBe(4);
    expect(levels(events)).toEqual([2]);
    expect(view(s).level).toBe(2);
    // 4 lines paid the level-1 goal of 2 and left 2 of the level-2 goal of 4.
    expect(goalOf(s)).toBe(2);
  });

  it('wins the run at the top of the ladder instead of climbing past it', () => {
    const top = 2;
    const s = ascends({ maxLevel: top });
    climbBy(s, DEFAULT_CONFIG.goalBase);
    expect(view(s).level).toBe(top);
    climbBy(s, DEFAULT_CONFIG.goalBase * top - 1);
    expect(view(s).status).toBe('playing');
    expect(levels(completeFloor(s, 1))).toEqual([]);
    expect(view(s).status).toBe('won');
    expect(view(s).level).toBe(top);
    expect(view(s).goal?.numeric).toBe(0);
  });

  it('stops the clock the moment the ladder is finished', () => {
    const s = ascends({ maxLevel: 1 });
    climbBy(s, DEFAULT_CONFIG.goalBase);
    expect(view(s).status).toBe('won');
    const frames = view(s).frames;
    expect(countType(s.advance(30), 'spawn')).toBe(0);
    expect(view(s).frames).toBe(frames);
  });
});
