import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DIFFICULTY_SPEED, gravityFrames } from '../engine/config.js';
import { SOFT_DROP_POINTS } from '../gameplay/score.js';
import { fullRows } from '../engine/board.js';
import {
  SEED,
  advanceUntil,
  boxHeight,
  completeFloor,
  countType,
  hardDrop,
  makeSession,
  of,
  press,
  release,
  tap,
  view,
} from './helpers.js';
import { goalLadderMode } from '../modes/goal-ladder.js';
import type { ActivePiece, Difficulty } from '../engine/types.js';
import type { Session } from '../gameplay/session.js';

const piece = (s: Session): ActivePiece => {
  const a = view(s).active;
  if (!a) throw new Error('expected an active piece');
  return a;
};

/**
 * Frames on which the nth downward move of `type` happened, counted from the next
 * frame onwards. `advance` drains as it steps, so the events themselves are gone
 * — these tests only need *when* they landed.
 */
const framesOf = (s: Session, type: 'shift' | 'soft-drop', count: number): number[] => {
  const at: number[] = [];
  for (let frame = 1; at.length < count && frame <= 4000; frame += 1) {
    if (countType(s.advance(1), type) > 0) at.push(frame);
  }
  return at;
};

/** Rows the active piece still has to fall before it lands on an empty field. */
const fallRows = (s: Session): number => {
  const a = piece(s);
  return view(s).board.rows - boxHeight(a) - a.y;
};

const DIFFICULTY_LEVELS: readonly Difficulty[] = [1, 2, 3, 4];

describe('gravity', () => {
  it('paces natural gravity by the configured frames per row', () => {
    // One move per row, so the spacing also proves the timer restarts after each
    // row instead of running on an accumulating counter.
    const s = makeSession(goalLadderMode, SEED, { gravityTable: [7] });
    expect(framesOf(s, 'shift', 3)).toEqual([7, 14, 21]);
  });

  it('reads the shipped table for every level of the ladder', () => {
    DEFAULT_CONFIG.gravityTable.forEach((base, index) => {
      expect(gravityFrames(DEFAULT_CONFIG, index + 1, 2)).toBe(base);
    });
    expect(DEFAULT_CONFIG.gravityTable).toHaveLength(DEFAULT_CONFIG.maxLevel);
    // A level outside the table clamps to its ends rather than falling off it:
    // a ladder mode caps at `maxLevel`, but the accessor is used with whatever a
    // mode asks for and must stay inside the array.
    expect(gravityFrames(DEFAULT_CONFIG, 0, 2)).toBe(DEFAULT_CONFIG.gravityTable[0]);
    expect(gravityFrames(DEFAULT_CONFIG, DEFAULT_CONFIG.maxLevel + 5, 2)).toBe(
      DEFAULT_CONFIG.gravityTable[DEFAULT_CONFIG.maxLevel - 1],
    );
  });

  it('scales the whole table by the difficulty setting', () => {
    for (const difficulty of DIFFICULTY_LEVELS) {
      expect(gravityFrames(DEFAULT_CONFIG, 1, difficulty)).toBe(
        Math.round(50 / DIFFICULTY_SPEED[difficulty]),
      );
    }
    // Pinned numbers too, so a silent change to the table has to be deliberate.
    expect(gravityFrames(DEFAULT_CONFIG, 1, 1)).toBe(40);
    expect(gravityFrames(DEFAULT_CONFIG, 1, 2)).toBe(50);
    expect(gravityFrames(DEFAULT_CONFIG, 1, 3)).toBe(59);
    expect(gravityFrames(DEFAULT_CONFIG, 1, 4)).toBe(71);
    // Never faster than one frame per row, however the two tables are combined.
    expect(gravityFrames({ ...DEFAULT_CONFIG, gravityTable: [1] }, 1, 4)).toBe(1);
  });

  it('applies the difficulty to the session clock, not only to the table', () => {
    const leisurely = makeSession(goalLadderMode, SEED, { gravityTable: [100] }, 1);
    expect(framesOf(leisurely, 'shift', 1)).toEqual([80]);
    const hurried = makeSession(goalLadderMode, SEED, { gravityTable: [70] }, 4);
    expect(framesOf(hurried, 'shift', 1)).toEqual([100]);
  });

  it('drops on the soft-drop interval and pays for every row', () => {
    const s = makeSession();
    const before = view(s).score;
    press(s, 'soft-drop');
    expect(framesOf(s, 'soft-drop', 3)).toEqual([1, 5, 9]);
    expect(view(s).score - before).toBe(3 * SOFT_DROP_POINTS);
  });

  it('returns to natural gravity the frame the soft-drop key comes off', () => {
    const s = makeSession(goalLadderMode, SEED, { gravityTable: [9], softDropFrames: 4 });
    press(s, 'soft-drop');
    // Three soft rows, so the key is released on a frame that just moved and the
    // natural period starts from zero there.
    s.advance(9);
    release(s, 'soft-drop');
    expect(framesOf(s, 'shift', 1)).toEqual([9]);
  });
});

describe('locking', () => {
  it('locks on the first frame the piece cannot move down', () => {
    // A one-frame gravity period keeps this about the lock rather than the fall.
    const s = makeSession(goalLadderMode, SEED, { gravityTable: [1] });
    const fall = fallRows(s);
    expect(advanceUntil(s, 'lock').frames).toBe(fall + 1);
  });

  it('keeps a landed piece alive for lockDelayFrames before locking', () => {
    const delay = 5;
    const s = makeSession(goalLadderMode, SEED, {
      gravityTable: [1],
      lockDelayFrames: delay,
    });
    const fall = fallRows(s);
    expect(advanceUntil(s, 'lock').frames).toBe(fall + delay + 1);
  });

  it('restarts the lock countdown when the piece is moved on the ground', () => {
    const delay = 5;
    const s = makeSession(goalLadderMode, SEED, {
      gravityTable: [1],
      lockDelayFrames: delay,
    });
    // Burn most of the window on the ground, then shift sideways. The zero-frame
    // tap matters: the move happens on the key-down, so no landed frame is spent
    // and the countdown below starts from a clean slate.
    s.advance(fallRows(s) + delay - 2);
    tap(s, 'left', 0);
    expect(countType(s.advance(delay), 'lock')).toBe(0);
    expect(countType(s.advance(1), 'lock')).toBe(1);
  });

  it('spends no lock window while the piece is still falling', () => {
    const s = makeSession(goalLadderMode, SEED, { gravityTable: [1], lockDelayFrames: 3 });
    const fall = fallRows(s);
    s.advance(fall);
    expect(view(s).active).not.toBeNull();
    expect(countType(s.advance(1), 'lock')).toBe(0);
  });
});

describe('piece and clear pacing', () => {
  it('waits spawnDelayFrames before the next piece appears', () => {
    // Frozen gravity: the hard drop below is the only thing moving the piece.
    const s = makeSession(goalLadderMode, SEED, {
      gravityTable: [1000],
      spawnDelayFrames: 4,
    });
    hardDrop(s);
    expect(view(s).active).toBeNull();
    s.advance(3);
    expect(view(s).active).toBeNull();
    expect(of(s.advance(1), 'spawn')).toHaveLength(1);
    expect(view(s).active).not.toBeNull();
  });

  it('commits a clear straight away when the freeze is switched off', () => {
    const s = makeSession(goalLadderMode, SEED, { clearFreezeFrames: 0 });
    const events = completeFloor(s, 1);
    expect(of(events, 'lines')).toHaveLength(1);
    expect(view(s).lines).toBe(1);
    expect(fullRows(view(s).board)).toEqual([]);
    // And the run carries on, which is the part a missed commit would break.
    expect(view(s).active).not.toBeNull();
    expect(view(s).status).toBe('playing');
  });

  it('counts frames and seconds at the fixed step', () => {
    const s = makeSession();
    expect(view(s).frames).toBe(0);
    s.advance(125);
    expect(view(s).frames).toBe(125);
    expect(view(s).seconds).toBeCloseTo(125 / 60, 10);
    const time = view(s).hud.find((field) => field.label === 'TIME');
    expect(time?.value).toBe('00:02');
  });
});
