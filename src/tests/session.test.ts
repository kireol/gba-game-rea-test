import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../engine/config.js';
import {
  EMPTY,
  STAR,
  type ActivePiece,
  type Board,
  type GameStatus,
  type HudField,
  type SessionEvent,
  type Vec,
} from '../engine/types.js';
import { queueFrom } from '../engine/random.js';
import { createSession, type Session } from '../gameplay/session.js';
import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from '../modes/types.js';
import {
  SEED,
  activeId,
  advanceUntil,
  awaitActive,
  completeFloor,
  configWith,
  countType,
  hardDrop,
  makeSession,
  of,
  poke,
  press,
  release,
  rowCells,
  starRowCount,
  tap,
  view,
} from './helpers.js';

/**
 * The session is the state machine between the shared mechanics and a mode, and
 * these tests pin that boundary: what it emits, which hooks it calls, and what a
 * mode may change. Piece movement lives in `movement.test.ts`, row clearing in
 * `lines.test.ts`, the frame periods in `timings.test.ts`, the ladder in
 * `levels.test.ts`.
 */

interface ProbeHooks {
  advance?: (api: ModeApi, frames: number) => void;
  status?: () => GameStatus;
  hud?: HudField[];
  goal?: GoalInfo | null;
  setupBoard?: (board: Board, api: ModeApi) => void;
  onLock?: (api: ModeApi, piece: ActivePiece, cells: readonly Vec[]) => void;
  extendClear?: (api: ModeApi, rows: readonly number[], candidate: Set<number>) => void;
  onClear?: (api: ModeApi, rows: readonly number[], count: number, extended: number) => void;
  onGarbage?: (rows: number) => void;
}

/**
 * A stand-in mode that records the hooks the session calls, in order, as
 * `"<hook> <facts>"`. `advance` and `status` fire every frame and would bury the
 * interesting entries, so they are only logged through the caller's hook.
 */
const probe = (
  hooks: ProbeHooks = {},
): { plugin: ModePlugin; calls: string[] } => {
  const calls: string[] = [];
  let apiRef: ModeApi | null = null;
  const api = (): ModeApi => must(apiRef, 'mode api');
  const run: ModeRun = {
    hud: () => hooks.hud ?? [],
    goal: () => hooks.goal ?? null,
    status: () => hooks.status?.() ?? 'playing',
    advance: (frames) => hooks.advance?.(api(), frames),
    ...(hooks.extendClear
      ? {
          extendClear: (rows: readonly number[], candidate: Set<number>): void => {
            calls.push(`extendClear ${rows.length}`);
            hooks.extendClear?.(api(), rows, candidate);
          },
        }
      : {}),
    onLock: (piece, cells) => {
      calls.push('onLock');
      hooks.onLock?.(api(), piece, cells);
    },
    onClear: (rows, count, extended) => {
      calls.push(`onClear ${count}/${extended}`);
      hooks.onClear?.(api(), rows, count, extended);
    },
    onGarbage: (rows) => {
      calls.push(`onGarbage ${rows}`);
      hooks.onGarbage?.(rows);
    },
  };
  const plugin: ModePlugin = {
    id: 'probe',
    label: 'PROBE',
    family: 'single',
    summary: 'records every question the session asks it',
    rules: ['a stand-in mode: it only reports what the session does'],
    showLines: true,
    createRun(api) {
      calls.push('createRun');
      apiRef = api;
      return run;
    },
    setupBoard(board, api) {
      calls.push('setupBoard');
      hooks.setupBoard?.(board, api);
    },
  };
  return { plugin, calls };
};

const must = <T>(value: T | null | undefined, what: string): NonNullable<T> => {
  if (value === null || value === undefined) throw new Error(`no ${what}`);
  return value;
};

const sfxNames = (events: readonly SessionEvent[]): string[] =>
  of(events, 'sfx').map((event) => event.name);

/**
 * A star block one row above the floor, in the far corner: no piece spawns that
 * far out, so it cannot take part in the clear by itself.
 */
const plantStar = (s: Session): void => {
  const board = view(s).board;
  poke(board, board.cols - 1, board.rows - 2, STAR);
};

const fresh = (mode: ModePlugin): Session =>
  createSession({ mode, seed: SEED, config: configWith(), difficulty: 2 });

describe('the opening state', () => {
  it('deals the opening piece before the caller gets the session', () => {
    const p = probe();
    const s = fresh(p.plugin);
    const opening = s.events();

    expect(opening.map((event) => event.type)).toEqual(['spawn', 'sfx']);
    expect(must(of(opening, 'spawn')[0], 'spawn event').id).toBe(activeId(s));
    expect(sfxNames(opening)).toEqual(['spawn']);
    // Nothing else runs during construction: no frame, no mode hook, no board work.
    expect(p.calls).toEqual(['createRun', 'setupBoard']);
    expect(view(s).pieces).toBe(0);
    expect(view(s).frames).toBe(0);
  });

  it('reports the state a fresh run starts with', () => {
    const p = probe();
    const s = createSession({ mode: p.plugin, seed: SEED, config: configWith(), difficulty: 3 });
    const v = view(s);

    expect([v.level, v.lines, v.score, v.combo, v.maxCombo, v.pieces, v.frames]).toEqual([
      1, 0, 0, 0, 0, 0, 0,
    ]);
    expect(v.status).toBe('playing');
    expect(v.hold).toBeNull();
    expect(v.canHold).toBe(true);
    expect(v.flash).toBe(0);
    expect(v.active).not.toBeNull();
    expect(v.mode).toBe(p.plugin);
    expect(v.seed).toBe(SEED);
    expect(v.difficulty).toBe(3);
    expect(v.queue).toHaveLength(DEFAULT_CONFIG.queueLength);
  });

  it('deals the active piece and the queue from one bag', () => {
    const s = makeSession(probe().plugin);
    const dealt = [must(activeId(s), 'active piece'), ...view(s).queue];

    expect(dealt).toEqual(queueFrom(SEED, 1 + DEFAULT_CONFIG.queueLength));
  });

  it('refills the queue after every piece', () => {
    const s = makeSession(probe().plugin);
    for (let piece = 0; piece < 4; piece += 1) {
      expect(view(s).queue).toHaveLength(DEFAULT_CONFIG.queueLength);
      hardDrop(s);
      awaitActive(s);
    }
    expect(view(s).pieces).toBe(4);
    expect(view(s).queue).toHaveLength(DEFAULT_CONFIG.queueLength);
  });

  it('copies the queue out but shares the board buffer', () => {
    const s = makeSession(probe().plugin);
    // The queue is the caller's to keep; the board is the same buffer every frame,
    // which is what the renderer draws and what these fixtures poke.
    expect(view(s).queue).not.toBe(view(s).queue);
    expect(view(s).board).toBe(view(s).board);
    const bottom = view(s).board.rows * view(s).board.cols - 1;
    poke(view(s).board, view(s).board.cols - 1, view(s).board.rows - 1, STAR);
    expect(view(s).board.cells[bottom]).toBe(STAR);
  });

  it('hands back everything queued so far, even for a zero-frame step', () => {
    const s = fresh(probe().plugin);
    expect(s.advance(0).length).toBeGreaterThan(0);
    // A drain leaves nothing behind, so a second read cannot double-count.
    expect(s.advance(0)).toEqual([]);

    const batch = press(s, 'rotate-cw', 0);
    expect(countType(batch, 'rotate')).toBe(1);
    expect(s.events()).toEqual([]);
  });
});

describe('the mode contract', () => {
  it('runs the mode hooks in the order the rules happen', () => {
    const p = probe({ extendClear: () => {} });
    const s = makeSession(p.plugin);
    expect(p.calls).toEqual(['createRun', 'setupBoard']);

    completeFloor(s, 1);
    // The mode is asked to widen the clear before anything is removed, so its
    // answer is part of the same commit, and `onClear` only hears about it after.
    expect(p.calls).toEqual(['createRun', 'setupBoard', 'onLock', 'extendClear 1', 'onClear 1/0']);
  });

  it('lets the mode widen a clear, and tells it how much the mode added', () => {
    const plain = probe();
    const untouched = makeSession(plain.plugin);
    plantStar(untouched);
    completeFloor(untouched, 1);
    expect(starRowCount(view(untouched).board)).toBe(1);
    expect(plain.calls).toContain('onClear 1/0');

    const linked = probe({
      extendClear: (api, rows, candidate) => {
        // Only the star column, so `extended` counts exactly the mode's addition.
        candidate.add((Math.min(...rows) - 1) * api.config.cols + (api.config.cols - 1));
      },
    });
    const s = makeSession(linked.plugin);
    plantStar(s);
    completeFloor(s, 1);
    expect(starRowCount(view(s).board)).toBe(0);
    // One cell beyond the row itself: the mode's addition, reported back to it.
    expect(linked.calls).toContain('onClear 1/1');
  });

  it('shows the mode the run as it happens', () => {
    const seen: {
      frames: number;
      seconds: number;
      lines: number;
      level: number;
      status: GameStatus;
    }[] = [];
    const apis: ModeApi[] = [];
    const p = probe({
      onLock: (api) => {
        apis.push(api);
      },
      onClear: (api) => {
        apis.push(api);
        seen.push({
          frames: api.frames,
          seconds: api.seconds,
          lines: api.lines,
          level: api.level,
          status: api.status,
        });
      },
    });
    const s = makeSession(p.plugin, SEED, {}, 3);
    s.advance(7);
    completeFloor(s, 1);

    const lock = must(apis[0], 'lock-time api');
    const clear = must(apis[1], 'clear-time api');
    expect(clear.rng).toBe(lock.rng);
    expect(clear.board).toBe(view(s).board);
    expect(clear.config.cols).toBe(DEFAULT_CONFIG.cols);
    expect(clear.difficulty).toBe(3);

    expect(seen).toHaveLength(1);
    const at = seen[0];
    if (!at) throw new Error('the mode never saw the clear');
    expect([at.lines, at.level, at.status]).toEqual([1, 1, 'playing']);
    expect(at.frames).toBeGreaterThanOrEqual(7);
    expect(at.seconds).toBe(at.frames / 60);
  });

  it('lets the mode change the level and finish the run', () => {
    const p = probe({
      onClear: (api) => {
        api.setLevel(4);
        api.setStatus('won');
      },
    });
    const s = makeSession(p.plugin);
    const events = completeFloor(s, 1);

    expect(of(events, 'level-up').map((event) => event.level)).toEqual([4]);
    expect(of(events, 'status').map((event) => event.status)).toEqual(['won']);
    expect(sfxNames(events)).toContain('level-up');
    expect(sfxNames(events)).toContain('win');
    expect(view(s).level).toBe(4);
    expect(view(s).status).toBe('won');

    const frames = view(s).frames;
    expect(s.advance(120)).toEqual([]);
    expect(view(s).frames).toBe(frames);
  });

  it('ends the run when the mode reports one, and never un-ends it', () => {
    let reported: GameStatus = 'playing';
    const p = probe({ status: () => reported });
    const s = makeSession(p.plugin);
    expect(view(s).status).toBe('playing');

    reported = 'lost';
    const events = s.advance(1);
    expect(of(events, 'status').map((event) => event.status)).toEqual(['lost']);
    expect(sfxNames(events)).toContain('lose');

    // A finished run is final: the mode cannot take itself back, and neither can
    // the pause key.
    reported = 'playing';
    const frames = view(s).frames;
    const after = press(s, 'pause', 30);
    expect(after).toEqual([]);
    expect(view(s).status).toBe('lost');
    expect(view(s).frames).toBe(frames);
  });

  it('keeps the first verdict when a mode ends the run two ways at once', () => {
    // A mode has two channels for finishing: `status()` and `setStatus()`. The
    // frame of a natural lock polls both, so they can disagree — and re-deciding
    // the outcome would rewrite a win the player already earned.
    let sawLock = false;
    const p = probe({
      status: () => (sawLock ? 'lost' : 'playing'),
      onLock: (api) => {
        sawLock = true;
        api.setStatus('won');
      },
    });
    const s = makeSession(p.plugin, SEED, { gravityTable: [1] });
    const events = advanceUntil(s, 'lock').events;

    expect(of(events, 'status').map((event) => event.status)).toEqual(['won']);
    expect(sfxNames(events)).toContain('win');
    expect(sfxNames(events)).not.toContain('lose');
    expect(view(s).status).toBe('won');
  });

  it('hears a lock-driven verdict in the frame the lock settles', () => {
    // A mode that decides from what it saw in a hook (`onLock` here) is only asked
    // again at the end of the frame, so the verdict lands with the lock instead of
    // a frame later — otherwise the run would still be live for one more tick.
    let locks = 0;
    const p = probe({
      onLock: () => {
        locks += 1;
      },
      status: () => (locks > 0 ? 'won' : 'playing'),
    });
    const s = makeSession(p.plugin, SEED, { gravityTable: [1] });
    const batch = advanceUntil(s, 'lock').events;

    expect(of(batch, 'status').map((event) => event.status)).toEqual(['won']);
    expect(sfxNames(batch)).toContain('win');
    expect(s.advance(30)).toEqual([]);
  });

  it('lets the mode emit its own presentation events', () => {
    const p = probe({
      onLock: (api) => {
        api.emit({ type: 'message', text: 'linked', frames: 5 });
        api.emit({ type: 'goal', kind: 'star-row', current: 7, target: 9 });
        api.emit({ type: 'sfx', name: 'menu-confirm' });
      },
    });
    const s = makeSession(p.plugin);
    const events = hardDrop(s);

    expect(of(events, 'message')).toEqual([{ type: 'message', text: 'linked', frames: 5 }]);
    expect(of(events, 'goal')).toEqual([
      { type: 'goal', kind: 'star-row', current: 7, target: 9 },
    ]);
    expect(sfxNames(events)).toContain('menu-confirm');
  });

  it('builds a starting field with silent rows and announces incoming ones', () => {
    const builder = probe({ setupBoard: (_board, api) => api.pushRow(STAR, 2) });
    const built = fresh(builder.plugin);
    const opening = built.events();
    const board = view(built).board;

    // A mode seeding its own field must not sound the garbage alarm.
    expect(countType(opening, 'garbage')).toBe(0);
    expect(sfxNames(opening)).not.toContain('garbage');
    expect(starRowCount(board)).toBe(board.cols - 2);
    expect(rowCells(board, board.rows - 1).filter((cell) => cell === EMPTY)).toHaveLength(2);

    const riser = probe({ onLock: (api) => api.addGarbage(2) });
    const s = makeSession(riser.plugin);
    const events = hardDrop(s);
    expect(of(events, 'garbage').map((event) => event.rows)).toEqual([2]);
    expect(sfxNames(events)).toContain('garbage');
    expect(riser.calls).toContain('onGarbage 2');
  });

  it('passes the mode HUD rows and goal through to the renderer', () => {
    const hud: HudField[] = [
      { label: 'TIME', value: '00:02' },
      { label: 'ROWS', value: '7' },
    ];
    const goal: GoalInfo = { kind: 'star-row', label: 'ROWS', current: '7', numeric: 7, target: 9 };
    const s = makeSession(probe({ hud, goal }).plugin);
    expect(view(s).hud).toEqual(hud);
    expect(view(s).goal).toEqual(goal);

    const bare = makeSession(probe().plugin);
    expect(view(bare).hud).toEqual([]);
    expect(view(bare).goal).toBeNull();
  });

  it('asks the mode to advance once per frame, and stops when the run ends', () => {
    let reported: GameStatus = 'playing';
    const asked: number[] = [];
    const p = probe({
      advance: (_api, frames) => asked.push(frames),
      status: () => reported,
    });
    const s = makeSession(p.plugin);
    s.advance(10);
    expect(asked).toEqual(new Array(10).fill(1));
    expect(view(s).frames).toBe(10);

    asked.length = 0;
    reported = 'won';
    s.advance(5);
    // The frame that ends the run still advances the mode; nothing after it does,
    // so a timed mode cannot keep spending its clock on a finished game.
    expect(asked).toEqual([1]);
    expect(view(s).frames).toBe(11);
  });
});

describe('the session clock', () => {
  it('stops the frame clock while paused and picks it up again', () => {
    const s = makeSession(probe().plugin);
    s.advance(12);
    const frames = view(s).frames;

    const paused = press(s, 'pause', 60);
    expect(of(paused, 'status').map((event) => event.status)).toEqual(['paused']);
    // A frame of a paused run emits nothing at all: no gravity, no spawn, no clock.
    expect(paused.map((event) => event.type)).toEqual(['status']);
    expect(view(s).status).toBe('paused');
    expect(view(s).frames).toBe(frames);

    const resumed = tap(s, 'pause', 0);
    expect(of(resumed, 'status').map((event) => event.status)).toEqual(['playing']);
    const later = s.advance(10);
    expect(view(s).frames).toBe(frames + 10);
    expect(countType(later, 'spawn') + countType(later, 'shift')).toBe(0);
  });

  it('ignores the release of the pause key', () => {
    const s = makeSession(probe().plugin);
    expect(of(press(s, 'pause'), 'status')[0]?.status).toBe('paused');
    expect(release(s, 'pause')).toEqual([]);
    expect(view(s).status).toBe('paused');
    expect(of(tap(s, 'pause', 0), 'status')[0]?.status).toBe('playing');
  });

  it('ignores nonsense frame counts', () => {
    const s = makeSession(probe().plugin);
    s.advance(-5);
    expect(view(s).frames).toBe(0);
    s.advance(2.7);
    expect(view(s).frames).toBe(2);
    s.advance(Number.NaN);
    expect(view(s).frames).toBe(2);
  });

  it('digests the same run identically, and differently once it diverges', () => {
    const play = (moves: number): string => {
      const s = makeSession(probe().plugin);
      hardDrop(s);
      awaitActive(s);
      for (let move = 0; move < moves; move += 1) tap(s, 'left', 0);
      hardDrop(s);
      return s.digest();
    };
    expect(play(0)).toBe(play(0));
    expect(play(1)).toBe(play(1));
    expect(play(0)).not.toBe(play(1));
  });
});
