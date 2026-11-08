import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../engine/config.js';
import { type GameStatus, type Intent, type PieceId, type SessionEvent } from '../engine/types.js';
import { createDuel } from '../gameplay/duel.js';
import type { Session } from '../gameplay/session.js';
import { goalLadderMode } from '../modes/goal-ladder.js';
import { linkedBlocksMode } from '../modes/linked-blocks.js';
import {
  SEED,
  completeFloor,
  configWith,
  emptyBoard,
  makeSession,
  tap,
  view,
} from './helpers.js';

/**
 * Same seed, same run — whatever the caller does around it.
 *
 * The rules layer takes no clock, no I/O and no randomness beyond the seeded
 * streams, so two sessions built from one seed have to agree frame for frame.
 * That only holds if nothing leaks between them: the piece stream and the
 * garbage-hole stream are one generator (`createRng(seed)` feeds both, which is
 * why a mode's setup draws shift the opening queue), and every counter has to
 * belong to its own run. `random.test.ts` pins the generator and `session.test.ts`
 * the frame accounting; this suite pins the replay surface — how the caller splits
 * its `advance` calls, how often it reads the state, what other sessions exist
 * alongside it, and which presentation options are on.
 *
 * Both sides of every comparison are independently built runs fed the same
 * script, so a rule cannot hide by moving both halves together: the claim is that
 * the *caller's* shape never enters the result.
 */

const HORIZON = 420;
const GARBAGE_AT = 120;
const RESET_EVERY = 100;

type Step = { at: number; kind: 'tap'; intent: Intent } | { at: number; kind: 'garbage' } | { at: number; kind: 'reset' };

/**
 * A script that is identical on every machine: an LCG picks the intent, so the
 * schedule needs no fixture. Rows are levelled out every 100 frames — otherwise
 * hard-dropping into one band tops the run out around frame 350 and the rest of
 * the window compares two dead sessions.
 */
const makeScript = (start: number): Step[] => {
  let x = start >>> 0;
  const rnd = (): number => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
  const moves: Intent[] = [
    'hard-drop',
    'hard-drop',
    'hard-drop',
    'left',
    'left',
    'right',
    'right',
    'rotate-cw',
    'rotate-ccw',
    'soft-drop',
    'hold',
  ];
  const steps: Step[] = [{ at: GARBAGE_AT, kind: 'garbage' }];
  for (let at = RESET_EVERY; at < HORIZON; at += RESET_EVERY) steps.push({ at, kind: 'reset' });
  for (let at = 6; at < HORIZON; at += 6) {
    const intent = moves[Math.floor(rnd() * moves.length)] ?? 'hard-drop';
    steps.push({ at, kind: 'tap', intent });
  }
  return steps.sort((a, b) => a.at - b.at);
};

interface Finger {
  frames: number;
  seconds: number;
  status: GameStatus;
  level: number;
  lines: number;
  score: number;
  pieces: number;
  combo: number;
  maxCombo: number;
  flash: number;
  ghost: number | null;
  active: string;
  hold: string;
  canHold: boolean;
  queue: string;
  goal: string;
  hud: string;
  seed: number;
  difficulty: number;
  board: string;
}

/**
 * Everything the view exposes, flattened to data. `active` and `board` are live
 * objects the session mutates in place, so their contents are copied out.
 */
const fingerprint = (s: Session): Finger => {
  const v = view(s);
  const a = v.active;
  return {
    frames: v.frames,
    seconds: v.seconds,
    status: v.status,
    level: v.level,
    lines: v.lines,
    score: v.score,
    pieces: v.pieces,
    combo: v.combo,
    maxCombo: v.maxCombo,
    flash: v.flash,
    ghost: v.ghost,
    active: a ? `${a.id}@${a.rot}${a.x},${a.y}` : '-',
    hold: v.hold ?? '-',
    canHold: v.canHold,
    queue: v.queue.join(''),
    goal: v.goal
      ? `${v.goal.kind}/${v.goal.label}/${v.goal.current}/${v.goal.numeric}/${v.goal.target}`
      : '-',
    hud: v.hud.map((field) => `${field.label}=${field.value}`).join('|'),
    seed: v.seed,
    difficulty: v.difficulty,
    board: Array.from(v.board.cells).join(','),
  };
};

type Read = (s: Session) => Omit<Finger, 'ghost'>;

const withGhost = (s: Session): Finger => fingerprint(s);
const noGhost: Read = (s) => {
  const { ghost: _ghost, ...rest } = fingerprint(s);
  return rest;
};

/** The same event stream from either side of a comparison, as data. */
const asData = (events: readonly SessionEvent[]): string[] =>
  events.map((event) => JSON.stringify(event));

const countOf = (events: readonly SessionEvent[], type: SessionEvent['type']): number =>
  events.filter((event) => event.type === type).length;

interface DriveOptions {
  /** Frames per `advance` call; 1 steps every frame. */
  chunk?: number;
  /** Reads the whole view on every seventh frame too, like a render loop would. */
  peek?: boolean;
  /** Drops the ghost projection from the comparison. */
  ignoreGhost?: boolean;
}

const drive = (s: Session, steps: readonly Step[], options: DriveOptions = {}) => {
  const { chunk = 1, peek = false, ignoreGhost = false } = options;
  const events: SessionEvent[] = [];
  const trace: string[] = [];
  let frame = 0;
  let next = 0;
  while (frame < HORIZON && view(s).status === 'playing') {
    const step = steps[next];
    if (step && step.at <= frame) {
      next += 1;
      if (step.kind === 'garbage') {
        s.receiveGarbage(1);
        events.push(...s.advance(0));
      } else if (step.kind === 'reset') {
        emptyBoard(view(s).board);
      } else {
        events.push(...tap(s, step.intent));
        frame += 1;
      }
    } else {
      const room = step ? step.at - frame : HORIZON - frame;
      const take = Math.max(1, Math.min(chunk, room, HORIZON - frame));
      events.push(...s.advance(take));
      frame += take;
    }
    if (peek && frame % 7 === 0) s.snapshot();
    trace.push(JSON.stringify(ignoreGhost ? noGhost(s) : withGhost(s)));
  }
  // Finish on a guaranteed line clear so the replay window always contains the
  // commit path (clear → score → level → spawn) rather than only plain drops.
  emptyBoard(view(s).board);
  events.push(...completeFloor(s, 1));
  if (peek) s.snapshot();
  const finger = fingerprint(s);
  return {
    events,
    trace,
    finger,
    final: JSON.stringify(finger),
    digest: s.digest(),
    frames: finger.frames,
    status: finger.status,
  };
};

type Run = ReturnType<typeof drive>;

const scripted = (seed: number, over: Partial<GameConfig> = {}, options: DriveOptions = {}): Run =>
  drive(makeSession(goalLadderMode, seed, over), makeScript(seed), options);

const runOf = (seed: number, over: Partial<GameConfig> = {}): Session =>
  makeSession(goalLadderMode, seed, over);

/** Only the pieces the run actually dealt, in order. */
const spawnsOf = (events: readonly SessionEvent[]): PieceId[] =>
  events.flatMap((event) => (event.type === 'spawn' ? [event.id] : []));

/** The frame a run finished on, or -1 when it never did. */
const endOf = (seed: number): { frame: number; digest: string; status: GameStatus } => {
  const s = runOf(seed);
  for (let guard = 0; guard < 40000; guard += 1) {
    s.advance(1);
    const status = view(s).status;
    if (status !== 'playing') return { frame: view(s).frames, digest: s.digest(), status };
  }
  throw new Error('the run never ended');
};

describe('a run replays from its seed alone', () => {
  it('frame for frame, across two independently built sessions', () => {
    const first = scripted(SEED);
    const second = scripted(SEED);

    expect(first.status).toBe('playing');
    expect(first.finger.frames).toBeGreaterThanOrEqual(HORIZON);
    expect(first.trace).toEqual(second.trace);
    expect(asData(first.events)).toEqual(asData(second.events));
    expect(first.digest).toBe(second.digest);
    // The script has to be reaching something, or an empty comparison would pass
    // whatever the rules did.
    expect(first.trace.length).toBeGreaterThanOrEqual(HORIZON);
    expect(new Set(first.trace).size).toBeGreaterThan(300);
    expect(countOf(first.events, 'spawn')).toBeGreaterThan(8);
    expect(countOf(first.events, 'lock')).toBeGreaterThan(8);
    expect(countOf(first.events, 'garbage')).toBe(1);
    expect(countOf(first.events, 'lines')).toBeGreaterThan(0);
  });

  it('however the caller splits its frames across advance calls', () => {
    // A real loop hands over whatever the last vsync left over, so the same
    // window arrives as 1-frame steps, as 7s, or as one call.
    const stepped = scripted(SEED);
    const chunked = scripted(SEED, {}, { chunk: 7 });
    const lumped = scripted(SEED, {}, { chunk: HORIZON });

    expect(asData(chunked.events)).toEqual(asData(stepped.events));
    expect(asData(lumped.events)).toEqual(asData(stepped.events));
    expect(chunked.final).toBe(stepped.final);
    expect(lumped.final).toBe(stepped.final);
    expect(stepped.trace.length).toBeGreaterThan(300);
    expect(countOf(stepped.events, 'hard-drop')).toBeGreaterThan(5);
  });

  it('however often the caller reads the state on the way', () => {
    const quiet = scripted(SEED);
    const watched = scripted(SEED, {}, { peek: true });

    expect(watched.trace).toEqual(quiet.trace);
    expect(asData(watched.events)).toEqual(asData(quiet.events));
    expect(watched.digest).toBe(quiet.digest);
    expect(watched.trace.length).toBe(quiet.trace.length);
  });

  it('at two different seeds, and neither seed replays as the other', () => {
    const other = 0x0badf00d;
    const a1 = scripted(SEED);
    const a2 = scripted(SEED);
    const b1 = scripted(other);
    const b2 = scripted(other);

    expect(a1.final).toBe(a2.final);
    expect(b1.final).toBe(b2.final);
    // If two seeds landed on one run, the seed would be decoration.
    expect(a1.final).not.toBe(b1.final);
    expect(spawnsOf(a1.events)).not.toEqual(spawnsOf(b1.events));
    expect(view(runOf(SEED)).seed).toBe(SEED);
    expect(view(runOf(other)).seed).toBe(other);
  });
});

describe('a run keeps to itself', () => {
  it('whatever presentation options are on', () => {
    // The ghost projection is a read of the board, never a step: turning it off
    // may not move a piece by one frame or change one point of score.
    const shown = scripted(SEED);
    const hidden = scripted(SEED, { ghost: false }, { ignoreGhost: true });
    const shownQuiet = scripted(SEED, {}, { ignoreGhost: true });

    expect(hidden.trace).toEqual(shownQuiet.trace);
    expect(asData(hidden.events)).toEqual(asData(shownQuiet.events));
    expect(hidden.digest).toBe(shownQuiet.digest);
    // The option is really wired: on, the projection is there; off, it is not.
    expect(shown.trace.some((entry) => !entry.includes('"ghost":null'))).toBe(true);
    expect(view(runOf(SEED)).ghost).not.toBeNull();
    expect(view(runOf(SEED, { ghost: false })).ghost).toBeNull();
  });

  it('even after other runs were built and driven in between', () => {
    // Nothing may live outside a session. Another mode, a second copy of the same
    // seed, and a versus wrapper are all created and run while the first twin is
    // mid-flight; the twin that comes afterwards has to play the same game.
    const before = scripted(SEED);

    const others: Session[] = [
      makeSession(linkedBlocksMode, SEED),
      makeSession(linkedBlocksMode, SEED),
      makeSession(goalLadderMode, SEED + 1),
    ];
    const duel = createDuel({ seed: SEED, config: configWith() });
    const script = makeScript(SEED);
    for (const other of others) drive(other, script);
    drive(duel.a, script);
    drive(duel.b, script);

    const after = scripted(SEED);
    expect(after.trace).toEqual(before.trace);
    expect(asData(after.events)).toEqual(asData(before.events));
    expect(after.digest).toBe(before.digest);
  });

  it('and finishes on the same frame every time', () => {
    // Nobody plays a clock here, so a run that tops out tops out at exactly the
    // same frame, with the same board, on every replay.
    const first = endOf(SEED);
    const second = endOf(SEED);

    expect(first.status).toBe('lost');
    expect(first.frame).toBe(second.frame);
    expect(first.digest).toBe(second.digest);
    expect(first.frame).toBeGreaterThan(0);
  });
});
