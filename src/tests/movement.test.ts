import { describe, expect, it } from 'vitest';
import {
  GARBAGE,
  cellOf,
  type ActivePiece,
  type PieceId,
  type Rot,
  type SessionEvent,
} from '../engine/types.js';
import { cellsOf } from '../engine/pieces.js';
import { ghostY } from '../engine/board.js';
import {
  activeId,
  activeRot,
  activeX,
  activeY,
  awaitActive,
  boxHeight,
  countType,
  hardDrop,
  makeSession,
  of,
  poke,
  press,
  release,
  SEED,
  tap,
  view,
} from './helpers.js';
import type { Session } from '../gameplay/session.js';
import { goalLadderMode } from '../modes/goal-ladder.js';

const piece = (s: Session): ActivePiece => {
  const a = view(s).active;
  if (!a) throw new Error('expected an active piece');
  return a;
};

const heldId = (s: Session): PieceId => {
  const id = activeId(s);
  if (!id) throw new Error('expected an active piece');
  return id;
};

const nextQueued = (s: Session): PieceId => {
  const [id] = view(s).queue;
  if (!id) throw new Error('expected a non-empty next queue');
  return id;
};

/**
 * `tap`'s frame argument exists so a test can stay inside one frame: a zero-frame
 * tap moves on the key-down and never lets gravity or the auto-shift timers tick.
 */
const steerTap = (s: Session, intent: 'left' | 'right'): SessionEvent[] =>
  tap(s, intent, 0);

/**
 * Box columns the piece spans. At rotation 0 every shape touches both box walls,
 * so the occupied span is the box, and the tests below stay correct whatever the
 * bag happens to deal rather than depending on a pinned opening piece.
 */
const boxWidth = (p: ActivePiece): number =>
  Math.max(...cellsOf(p).map((c) => c.x)) - p.x + 1;

/** The piece's footprint as sorted `x,y` keys, for geometry comparisons. */
const shape = (p: ActivePiece, rot: number = p.rot, dy = 0): string[] =>
  cellsOf(p, rot as ActivePiece['rot'], 0, dy).map((c) => `${c.x},${c.y}`).sort();

/** Blocks one cell of the live board buffer, for setups that need an obstacle. */
const fillCell = (s: Session, x: number, y: number): void => {
  poke(view(s).board, x, y, GARBAGE);
};

describe('column movement', () => {
  it('moves one column on the key-down, with no frames needed', () => {
    const s = makeSession();
    const before = activeX(s);
    const events = tap(s, 'right', 0);
    expect(of(events, 'move')).toEqual([{ type: 'move', dx: 1 }]);
    expect(of(events, 'sfx').map((event) => event.name)).toEqual(['move']);
    expect(activeX(s)).toBe(before + 1);
  });

  it('mirrors it for the other direction', () => {
    const s = makeSession();
    const before = activeX(s);
    expect(of(tap(s, 'left', 0), 'move')).toEqual([{ type: 'move', dx: -1 }]);
    expect(activeX(s)).toBe(before - 1);
  });

  it('does not advance the piece downwards to make room for a move', () => {
    const s = makeSession();
    const before = activeY(s);
    steerTap(s, 'right');
    steerTap(s, 'right');
    expect(activeY(s)).toBe(before);
  });

  it('refuses a move that would put the piece outside the field', () => {
    const s = makeSession();
    const cols = view(s).board.cols;
    // The piece's box, not its cells, is what has to stay inside the field.
    const limit = cols - boxWidth(piece(s));
    for (let i = 0; i < cols; i += 1) steerTap(s, 'right');
    expect(activeX(s)).toBe(limit);
    const blocked = steerTap(s, 'right');
    expect(countType(blocked, 'move')).toBe(0);
    expect(of(blocked, 'sfx').some((event) => event.name === 'move')).toBe(false);
    expect(activeX(s)).toBe(limit);
  });

  it('auto-shifts on dasFrames, then repeats every arrFrames while the key is held', () => {
    // Repeats every four frames here so the walk to the wall finishes inside this
    // test's frame budget; the default six needs more width than the field gives.
    // The window probes below are written in terms of the same number.
    const arr = 4;
    const s = makeSession(goalLadderMode, SEED, { arrFrames: arr });
    const start = activeX(s);
    expect(countType(press(s, 'right'), 'move')).toBe(1);
    expect(activeX(s)).toBe(start + 1);
    // Nothing inside the DAS window, one move on the dasFrames-th frame, then one
    // more per ARR window.
    expect(countType(s.advance(15), 'move')).toBe(0);
    expect(activeX(s)).toBe(start + 1);
    expect(countType(s.advance(1), 'move')).toBe(1);
    expect(countType(s.advance(arr - 1), 'move')).toBe(0);
    expect(countType(s.advance(1), 'move')).toBe(1);
    expect(countType(s.advance(arr - 1), 'move')).toBe(0);
    expect(countType(s.advance(1), 'move')).toBe(1);
    expect(activeX(s)).toBe(start + 4);
    release(s, 'right');
    expect(countType(s.advance(30), 'move')).toBe(0);
  });

  it('stops auto-shifting at the wall instead of emitting phantom moves', () => {
    const s = makeSession(goalLadderMode, SEED, { arrFrames: 4 });
    const limit = view(s).board.cols - boxWidth(piece(s));
    const start = activeX(s);
    press(s, 'right');
    // Four more repeats are due by frame 32, but the box reaches the wall after
    // three, and a refused auto-shift emits nothing at all.
    const events = s.advance(32);
    expect(of(events, 'move')).toHaveLength(limit - start - 1);
    expect(activeX(s)).toBe(limit);
  });

  it('takes over with the newest key while both sides are held, and keeps it after the release', () => {
    const s = makeSession();
    const before = activeX(s);
    press(s, 'left');
    expect(activeX(s)).toBe(before - 1);
    expect(of(press(s, 'right'), 'move')).toEqual([{ type: 'move', dx: 1 }]);
    expect(activeX(s)).toBe(before);
    release(s, 'left');
    // Releasing the other side restarts the delay, and then the still-held key
    // continues to shift the piece.
    expect(countType(s.advance(15), 'move')).toBe(0);
    expect(countType(s.advance(1), 'move')).toBe(1);
    expect(activeX(s)).toBe(before + 1);
  });
});

describe('rotation', () => {
  it('walks the four rotation states forwards and back', () => {
    const s = makeSession();
    const seen: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const events = tap(s, 'rotate-cw', 0);
      expect(of(events, 'rotate')).toEqual([{ type: 'rotate', dir: 1, ok: true }]);
      expect(of(events, 'sfx').map((event) => event.name)).toEqual(['rotate']);
      seen.push(activeRot(s));
    }
    expect(seen).toEqual([1, 2, 3, 0]);
    const back: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const events = tap(s, 'rotate-ccw', 0);
      expect(of(events, 'rotate')).toEqual([{ type: 'rotate', dir: -1, ok: true }]);
      back.push(activeRot(s));
    }
    expect(back).toEqual([3, 2, 1, 0]);
  });

  it('rotates in place: the piece keeps its column and row', () => {
    const s = makeSession();
    const before = piece(s);
    const { x, y, rot } = before;
    // A shape that looks the same in both states would make the geometry half of
    // this test pass for the wrong reason, so say which one the bag dealt.
    expect(shape(before, rot)).not.toEqual(shape(before, rot + 1));
    tap(s, 'rotate-cw', 0);
    const after = piece(s);
    expect([after.x, after.y, after.rot]).toEqual([x, y, (rot + 1) % 4]);
    expect(shape(after)).not.toEqual(shape(before, rot));
  });

  it('rejects a rotation that does not fit, without kicking the piece', () => {
    const s = makeSession();
    const before = piece(s);
    const { x, y, rot } = before;
    // A cell the next state needs but the current one does not: block it and the
    // turn becomes impossible. With no wall kicks, the only right answer is "no" —
    // a piece that slid to dodge the block would keep moving and fail below.
    const current = cellsOf(before, rot);
    const next = ((rot + 1) % 4) as Rot;
    const needed = cellsOf(before, next).find((c) =>
      current.every((f) => f.x !== c.x || f.y !== c.y),
    );
    if (!needed) throw new Error('expected the next rotation state to need a free cell');
    fillCell(s, needed.x, needed.y);
    const events = tap(s, 'rotate-cw', 0);
    expect(of(events, 'rotate')).toEqual([{ type: 'rotate', dir: 1, ok: false }]);
    expect(of(events, 'sfx').map((event) => event.name)).toEqual(['rotate-fail']);
    expect([activeX(s), activeY(s), activeRot(s)]).toEqual([x, y, rot]);
  });

  it('ignores rotation input when there is no piece to rotate', () => {
    const s = makeSession();
    hardDrop(s);
    expect(view(s).active).toBeNull();
    expect(countType(press(s, 'rotate-cw', 0), 'rotate')).toBe(0);
  });
});

describe('landing projection', () => {
  it('reports the box row the piece would land on', () => {
    const s = makeSession();
    const a = piece(s);
    const rows = view(s).board.rows;
    const projection = view(s).ghost;
    expect(projection).toBe(ghostY(view(s).board, a));
    expect(projection).not.toBeNull();
    expect(projection ?? 0).toBeGreaterThan(a.y);
    expect(projection ?? 0).toBeLessThan(rows);
  });

  it('follows the piece into the corner it is steered to', () => {
    const s = makeSession();
    tap(s, 'rotate-cw', 0);
    expect(activeRot(s)).toBe(1);
    const column = activeX(s);
    expect(view(s).ghost).toBe(ghostY(view(s).board, piece(s)));
    steerTap(s, 'right');
    expect(activeX(s)).toBe(column + 1);
    const moved = piece(s);
    expect(view(s).ghost).toBe(ghostY(view(s).board, moved));
    // Turned in an empty field the projection is the floor row minus the box
    // height, wherever the column is.
    expect(view(s).ghost).toBe(view(s).board.rows - boxHeight(moved));
  });

  it('is hidden by the ghost option', () => {
    const s = makeSession(goalLadderMode, SEED, { ghost: false });
    expect(view(s).active).not.toBeNull();
    expect(view(s).ghost).toBeNull();
  });

  it('is hidden while paused and after the piece locks', () => {
    const s = makeSession();
    press(s, 'pause');
    expect(view(s).status).toBe('paused');
    expect(view(s).ghost).toBeNull();
    press(s, 'pause');
    expect(view(s).ghost).not.toBeNull();
    hardDrop(s);
    expect(view(s).ghost).toBeNull();
  });
});

describe('hard drop', () => {
  it('teleports the piece to the projection, scores the fall and locks it', () => {
    const s = makeSession();
    // `snapshot().active` is the very object the session mutates, so the position
    // a test wants to compare against has to be copied out before the drop.
    const spawn = piece(s);
    const { y, rot, id } = spawn;
    const target = ghostY(view(s).board, spawn);
    const landing = cellsOf(spawn, rot, 0, target - y);
    const events = hardDrop(s);
    const [drop] = of(events, 'hard-drop');
    expect(drop?.dy).toBe(target - y);
    expect(of(events, 'lock')).toHaveLength(1);
    expect(of(events, 'sfx').map((event) => event.name)).toEqual(['hard-drop', 'lock']);
    expect(view(s).active).toBeNull();
    const { board } = view(s);
    for (const cell of landing) {
      expect(board.cells[cell.y * board.cols + cell.x]).toBe(cellOf(id));
    }
  });

  it('pays exactly the rows the piece fell, on every drop', () => {
    const s = makeSession();
    const events = hardDrop(s);
    const dy = of(events, 'hard-drop')[0]?.dy ?? 0;
    expect(dy).toBeGreaterThan(0);
    expect(view(s).score).toBe(dy * 2);
    awaitActive(s);
    // Same column, and the previous piece now supports this one: the fall is one
    // row shorter, so the payout has to shrink with it.
    const before = view(s).score;
    const second = piece(s);
    const startY = second.y;
    const target = ghostY(view(s).board, second);
    const again = hardDrop(s);
    const dy2 = of(again, 'hard-drop')[0]?.dy ?? -1;
    expect(dy2).toBe(target - startY);
    expect(view(s).score - before).toBe(dy2 * 2);
  });
});

describe('hold', () => {
  it('moves the active piece aside and brings the queue piece in its place', () => {
    const s = makeSession();
    const first = heldId(s);
    const queued = nextQueued(s);
    const events = press(s, 'hold', 0);
    expect(of(events, 'hold')).toHaveLength(1);
    expect(of(events, 'sfx').map((event) => event.name)).toEqual(['hold']);
    expect(view(s).hold).toBe(first);
    expect(view(s).canHold).toBe(false);
    // With an empty slot the hold uses up the piece, so the next one arrives
    // through the normal spawn delay.
    expect(view(s).active).toBeNull();
    awaitActive(s);
    expect(heldId(s)).toBe(queued);
  });

  it('swaps the held piece back in, but only once per piece', () => {
    const s = makeSession();
    const first = heldId(s);
    press(s, 'hold', 0);
    awaitActive(s);
    const second = heldId(s);
    expect(second).not.toBe(first);
    const swapped = press(s, 'hold', 0);
    expect(of(swapped, 'hold')).toHaveLength(1);
    expect(heldId(s)).toBe(first);
    expect(view(s).hold).toBe(second);
    expect(view(s).canHold).toBe(false);
    const refused = press(s, 'hold', 0);
    expect(countType(refused, 'hold')).toBe(0);
    expect(heldId(s)).toBe(first);
    expect(view(s).hold).toBe(second);
  });

  it('lets a fresh piece use hold again', () => {
    const s = makeSession();
    press(s, 'hold', 0);
    awaitActive(s);
    expect(view(s).canHold).toBe(true);
    hardDrop(s);
    awaitActive(s);
    expect(of(press(s, 'hold', 0), 'hold')).toHaveLength(1);
  });

  it('does nothing when the hold option is off', () => {
    const s = makeSession(goalLadderMode, SEED, { hold: false });
    const before = heldId(s);
    const events = press(s, 'hold', 0);
    expect(events).toHaveLength(0);
    expect(view(s).hold).toBeNull();
    expect(heldId(s)).toBe(before);
    expect(view(s).canHold).toBe(true);
  });
});

describe('input while paused', () => {
  it('freezes the run and ignores every play intent', () => {
    const s = makeSession();
    press(s, 'pause');
    const before = activeX(s);
    const frames = view(s).frames;
    expect(countType(tap(s, 'left', 0), 'move')).toBe(0);
    expect(countType(tap(s, 'rotate-cw', 0), 'rotate')).toBe(0);
    expect(countType(press(s, 'hard-drop', 0), 'hard-drop')).toBe(0);
    expect(countType(s.advance(60), 'sfx')).toBe(0);
    expect(activeX(s)).toBe(before);
    expect(view(s).frames).toBe(frames);
    const resumed = press(s, 'pause', 0);
    expect(of(resumed, 'status').map((event) => event.status)).toEqual(['playing']);
    expect(countType(tap(s, 'left', 0), 'move')).toBe(1);
  });

  it('keeps the held column shifting where it left off', () => {
    const s = makeSession();
    press(s, 'right');
    expect(countType(s.advance(10), 'move')).toBe(0);
    const before = activeX(s);
    press(s, 'pause', 0);
    expect(countType(s.advance(30), 'move')).toBe(0);
    expect(activeX(s)).toBe(before);
    press(s, 'pause', 0);
    // The key is still physically down, so the auto-shift resumes.
    expect(countType(s.advance(6), 'move')).toBe(1);
  });
});
