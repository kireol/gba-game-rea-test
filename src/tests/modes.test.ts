import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../engine/config.js';
import { EMPTY, GARBAGE, STAR, cellOf, type ActivePiece } from '../engine/types.js';
import { cellsOf } from '../engine/pieces.js';
import { createSession, type Session } from '../gameplay/session.js';
import type { SessionEvent } from '../engine/types.js';
import {
  SEED,
  activeId,
  advanceUntil,
  awaitActive,
  completeFloor,
  configWith,
  countType,
  dropAt,
  dropToFloor,
  emptyBoard,
  filledCells,
  fillRow,
  hardDrop,
  makeSession,
  of,
  poke,
  rowCells,
  seedShowing,
  starRowCount,
  tap,
  view,
} from './helpers.js';
import type { ModePlugin } from '../modes/types.js';
import { MODES, SINGLE_MODES, modeById, rulesLines } from '../modes/registry.js';
import { linkedBlocksMode } from '../modes/linked-blocks.js';
import { timedGoalMode } from '../modes/timed-goal.js';
import { fixedLinesRaceMode } from '../modes/fixed-lines-race.js';
import { timedMaxLinesMode } from '../modes/timed-max-lines.js';
import { risingGarbageMode } from '../modes/rising-garbage.js';
import { duelMode } from '../modes/duel/index.js';

/**
 * Mode rules, one block per run.
 *
 * The core mechanics belong to the `session`, `lines` and `timings` suites, so
 * everything asserted here is something only that one mode can produce: its own
 * clock or garbage schedule, its own win/lose boundary, its own goal readout.
 * ASCENT (`goal-ladder`) is owned by `levels.test.ts`, which walks the level
 * ladder, and the versus wrapper by `duel.test.ts`.
 *
 * Rows are cleared by completing the floor and then wiping the field (`clearRow`).
 * Wiping *first* as well erases whatever garbage a mode pushed in, so a drop
 * always starts from a known-empty board: `completeFloor` refuses to run if
 * leftover debris would hold the piece off the floor row.
 *
 * The pure-clock tests run on a taller field than the game uses. Nothing there is
 * about height, and a tall field keeps the pile from being what ends the run
 * before the clock under test gets there.
 */

const SECOND = 60;

const goalOf = (s: Session) => view(s).goal ?? null;

const hudOf = (s: Session, label: string): string | undefined =>
  view(s).hud.find((field) => field.label === label)?.value;

const sfxNames = (events: readonly SessionEvent[]): string[] =>
  of(events, 'sfx').map((event) => event.name);

const levels = (events: readonly SessionEvent[]): number[] =>
  of(events, 'level-up').map((event) => event.level);

/** Completes one row, then leaves an empty field behind for the next drop. */
const clearRow = (s: Session): SessionEvent[] => {
  emptyBoard(view(s).board);
  const events = completeFloor(s, 1);
  emptyBoard(view(s).board);
  return events;
};

const clearRows = (s: Session, count: number): void => {
  for (let i = 0; i < count; i += 1) clearRow(s);
};

/**
 * True when one hard-drop of `piece` can complete a `rows`-deep band along the
 * floor by itself: every column it occupies has to cover all `rows` of them, or
 * the channel walls stop the drop one row short. The square and the vertical line
 * are the only shapes that qualify for two rows.
 */
const spansBand = (piece: ActivePiece, rows: number): boolean => {
  const cells = cellsOf(piece);
  const bottom = Math.max(...cells.map((cell) => cell.y));
  const columns = new Set(cells.map((cell) => cell.x));
  for (const x of columns) {
    for (let depth = 0; depth < rows; depth += 1) {
      if (!cells.some((cell) => cell.x === x && cell.y === bottom - depth)) return false;
    }
  }
  return true;
};

/**
 * Rotates, and redraws if no rotation qualifies, until the active piece can clear
 * `rows` rows in one drop. Keeps the multi-line tests off a specific bag: an
 * ordinary piece cannot finish two rows alone (see `spansBand`), and the redraw
 * costs no lines because the field is wiped before the drop.
 */
const awaitBandPiece = (s: Session, rows: number): void => {
  for (let draws = 0; draws < 8; draws += 1) {
    for (let turns = 0; turns < 4; turns += 1) {
      const piece = view(s).active;
      if (!piece) throw new Error('awaitBandPiece: no active piece');
      if (spansBand(piece, rows)) return;
      tap(s, 'rotate-cw');
    }
    dropToFloor(s);
    emptyBoard(view(s).board);
    awaitActive(s);
  }
  throw new Error(`awaitBandPiece: no piece spanning a ${rows}-row band within 8 draws`);
};

/** Frame numbers of the waves a rising-garbage run pushes in. */
const waveFrames = (s: Session, want: number, cap = 40000): number[] => {
  const hits: number[] = [];
  for (let guard = 0; hits.length < want && guard < cap; guard += 1) {
    const waves = of(s.advance(1), 'garbage');
    for (let i = 0; i < waves.length; i += 1) hits.push(view(s).frames);
    if (view(s).status !== 'playing') break;
  }
  if (hits.length < want) {
    throw new Error(`only ${hits.length} of ${want} waves inside ${cap} frames`);
  }
  return hits;
};

const gaps = (hits: readonly number[]): number[] =>
  hits.slice(1).map((frame, i) => frame - (hits[i] ?? 0));

/** The bottom row's empty cells, which the star-row setup leaves for the player. */
const holesInBottomRow = (s: Session): number[] => {
  const board = view(s).board;
  return rowCells(board, board.rows - 1)
    .map((cell, x) => (cell === EMPTY ? x : -1))
    .filter((x) => x >= 0);
};

describe('the mode table', () => {
  it('lists every run in menu order, under its own id, label and family', () => {
    expect(MODES.map((mode) => [mode.id, mode.label, mode.family])).toEqual([
      ['goal-ladder', 'ASCENT', 'single'],
      ['linked-blocks', 'FUSION', 'single'],
      ['timed-goal', 'RUSH', 'single'],
      ['fixed-lines-race', 'DASH', 'single'],
      ['timed-max-lines', 'BLITZ', 'single'],
      ['rising-garbage', 'ENDLESS', 'single'],
      ['local-versus', 'DUEL', 'versus'],
    ]);
  });

  it('keeps the ids unique and every mode reachable by one', () => {
    const ids = MODES.map((mode) => mode.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(modeById(id)?.id).toBe(id);
    expect(modeById('goal-ladder')).toBe(MODES[0]);
    expect(modeById('no-such-mode')).toBeUndefined();
  });

  it('holds the versus entry out of the single-player list', () => {
    expect(SINGLE_MODES.map((mode) => mode.id)).toEqual([
      'goal-ladder',
      'linked-blocks',
      'timed-goal',
      'fixed-lines-race',
      'timed-max-lines',
      'rising-garbage',
    ]);
  });

  it('gives every mode a label, a summary and rules to print', () => {
    const shape = (mode: ModePlugin): [string, boolean, boolean, boolean] => [
      mode.id,
      mode.label.length > 0,
      mode.summary.length > 0,
      mode.rules.length >= 2 &&
        mode.rules.every((rule) => rule.length > 0) &&
        mode.showLines === true,
    ];
    expect(MODES.map(shape)).toEqual([
      ['goal-ladder', true, true, true],
      ['linked-blocks', true, true, true],
      ['timed-goal', true, true, true],
      ['fixed-lines-race', true, true, true],
      ['timed-max-lines', true, true, true],
      ['rising-garbage', true, true, true],
      ['local-versus', true, true, true],
    ]);
  });

  it('prints a rules screen as the label, the summary, then the rules', () => {
    expect(MODES.map(rulesLines)).toEqual(
      MODES.map((mode) => [mode.label, mode.summary, ...mode.rules]),
    );
  });

  it('labels the clock only on the runs that have a clock to lose', () => {
    expect(
      MODES.filter((mode) => mode.timeUpLabel !== undefined).map((mode) => [
        mode.id,
        mode.timeUpLabel,
      ]),
    ).toEqual([
      ['timed-goal', 'TIME UP'],
      ['timed-max-lines', 'TIME UP'],
    ]);
  });

  it('hands out no result before the player has done anything', () => {
    expect(
      Object.fromEntries(
        MODES.map((mode) => {
          const s = makeSession(mode, SEED);
          s.advance(5 * SECOND);
          return [mode.id, view(s).status];
        }),
      ),
    ).toEqual({
      'goal-ladder': 'playing',
      'linked-blocks': 'playing',
      'timed-goal': 'playing',
      'fixed-lines-race': 'playing',
      'timed-max-lines': 'playing',
      'rising-garbage': 'playing',
      'local-versus': 'playing',
    });
  });

  it('promises each single-player run a goal row of its own kind', () => {
    expect(
      Object.fromEntries(
        SINGLE_MODES.map((mode) => [mode.id, goalOf(makeSession(mode, SEED))?.kind]),
      ),
    ).toEqual({
      'goal-ladder': 'lines-to-level',
      'linked-blocks': 'star-row',
      'timed-goal': 'time-left',
      'fixed-lines-race': 'lines-total',
      'timed-max-lines': 'time-up',
      'rising-garbage': 'survive',
    });
    // The versus result comes from the other board, so that run has no goal row.
    expect(goalOf(makeSession(duelMode, SEED))).toBeNull();
    expect(hudOf(makeSession(duelMode, SEED), 'GOAL')).toBeUndefined();
  });
});

/**
 * Every line-driven mode has its own lines-per-level figure; the goal-based and
 * star-based modes climb on their own rules, tested where those live.
 *
 * 24 lines is the third sample because some of these figures are close enough
 * that 8 and 16 land on the same level either way; 24 is where the neighbours
 * part company, which makes the table a constraint instead of a sanity check.
 */
const LADDERS: readonly {
  mode: ModePlugin;
  eight: number;
  sixteen: number;
  twentyFour: number;
}[] = [
  { mode: timedGoalMode, eight: 2, sixteen: 3, twentyFour: 4 },
  { mode: fixedLinesRaceMode, eight: 1, sixteen: 2, twentyFour: 3 },
  { mode: timedMaxLinesMode, eight: 2, sixteen: 3, twentyFour: 4 },
  { mode: risingGarbageMode, eight: 1, sixteen: 2, twentyFour: 3 },
  { mode: duelMode, eight: 2, sixteen: 3, twentyFour: 4 },
];

describe('the level ladder each line-driven mode promises', () => {
  for (const { mode, eight, sixteen, twentyFour } of LADDERS) {
    it(`${mode.label} climbs on its own lines-per-level figure`, () => {
      const s = makeSession(mode, SEED);
      clearRows(s, 8);
      expect(view(s).lines).toBe(8);
      expect(view(s).level).toBe(eight);
      clearRows(s, 8);
      expect(view(s).lines).toBe(16);
      expect(view(s).level).toBe(sixteen);
      clearRows(s, 8);
      expect(view(s).lines).toBe(24);
      expect(view(s).level).toBe(twentyFour);
    });

    it(`${mode.label} never lifts the level past the difficulty cap`, () => {
      const s = makeSession(mode, SEED, { maxLevel: 1 });
      clearRows(s, 16);
      expect(view(s).lines).toBe(16);
      expect(view(s).level).toBe(1);
      expect(levels(s.advance(SECOND))).toEqual([]);
    });
  }
});

describe('DASH — a fixed line quota', () => {
  const dashes = (over: Partial<typeof DEFAULT_CONFIG> = {}): Session =>
    makeSession(fixedLinesRaceMode, SEED, over);

  it('promises the whole quota up front and counts it down as rows go', () => {
    const s = dashes();
    expect(goalOf(s)?.kind).toBe('lines-total');
    expect(goalOf(s)?.numeric).toBe(40);
    expect(goalOf(s)?.target).toBe(40);
    expect(hudOf(s, 'GOAL')).toBe('40');
    clearRows(s, 3);
    expect(goalOf(s)?.numeric).toBe(37);
    expect(hudOf(s, 'GOAL')).toBe('37');
  });

  it('counts its own elapsed time up from zero', () => {
    // DASH's clock is a stopwatch, not a limit: the row grows forever, and the
    // run keeps going when it passes the two and a half minutes that end the
    // other line-quota mode.
    const s = dashes();
    expect(hudOf(s, 'TIME')).toBe('00:00');
    s.advance(SECOND);
    expect(hudOf(s, 'TIME')).toBe('00:01');
    s.advance(2 * SECOND);
    expect(hudOf(s, 'TIME')).toBe('00:03');
  });

  it('has no time limit: only the quota and the top of the field end it', () => {
    // 40 visible rows, so the unplayed stack is nowhere near the top when the
    // frame count passes the 150 s that ends the other timed run.
    const s = dashes({ visibleRows: 40 });
    s.advance(9000 + 120);
    expect(view(s).frames).toBe(9120);
    expect(view(s).status).toBe('playing');
  });

  it('wins the race on the last quota row and stops there', () => {
    const s = dashes();
    for (let cleared = 1; cleared < 40; cleared += 1) {
      clearRow(s);
      expect(view(s).status, `after ${cleared} rows`).toBe('playing');
      expect(goalOf(s)?.numeric).toBe(40 - cleared);
    }
    const events = clearRow(s);
    expect(view(s).lines).toBe(40);
    expect(view(s).status).toBe('won');
    expect(goalOf(s)?.numeric).toBe(0);
    expect(hudOf(s, 'GOAL')).toBe('0');
    expect(sfxNames(events)).toContain('win');
    const frames = view(s).frames;
    expect(countType(s.advance(4 * SECOND), 'spawn')).toBe(0);
    expect(view(s).frames).toBe(frames);
  });
});

describe('RUSH — a line quota against a clock', () => {
  const rushes = (over: Partial<typeof DEFAULT_CONFIG> = {}): Session =>
    makeSession(timedGoalMode, SEED, over);

  it('counts its clock down from the full two and a half minutes', () => {
    const s = rushes();
    expect(hudOf(s, 'TIME LEFT')).toBe('02:30');
    expect(goalOf(s)?.kind).toBe('time-left');
    expect(goalOf(s)?.numeric).toBe(30);
    expect(goalOf(s)?.target).toBe(30);
    expect(hudOf(s, 'GOAL')).toBe('30');
    s.advance(SECOND);
    expect(hudOf(s, 'TIME LEFT')).toBe('02:29');
    s.advance(SECOND);
    expect(hudOf(s, 'TIME LEFT')).toBe('02:28');
  });

  it('loses on the frame its clock reaches zero', () => {
    const s = rushes({ visibleRows: 40 });
    const events = s.advance(150 * SECOND);
    expect(view(s).frames).toBe(150 * SECOND);
    expect(view(s).status).toBe('lost');
    expect(of(events, 'status').map((event) => event.status)).toEqual(['lost']);
    expect(sfxNames(events)).toContain('lose');
    expect(sfxNames(events)).not.toContain('win');
    // A clock loss and a top-out both end on a `status` event, so the witness
    // that this one was the clock is that the stack never reached the spawn rows.
    const board = view(s).board;
    for (const y of [0, 1, 2, 3]) {
      expect(rowCells(board, y).every((cell) => cell === EMPTY), `row ${y}`).toBe(true);
    }
    expect(hudOf(s, 'TIME LEFT')).toBe('00:00');
  });

  it('wins when the quota lands inside the clock', () => {
    const s = rushes();
    for (let cleared = 1; cleared < 30; cleared += 1) clearRow(s);
    expect(view(s).status).toBe('playing');
    expect(view(s).frames).toBeLessThan(150 * SECOND);
    const events = clearRow(s);
    expect(view(s).lines).toBe(30);
    expect(view(s).status).toBe('won');
    expect(sfxNames(events)).toContain('win');
    expect(goalOf(s)?.numeric).toBe(0);
  });

  it('keeps the goal at zero when one clear overshoots the quota', () => {
    const s = rushes();
    clearRows(s, 29);
    awaitBandPiece(s, 2);
    const events = completeFloor(s, 2);
    expect(of(events, 'lines')[0]?.count).toBe(2);
    // The precondition: the last commit passed the quota instead of landing on it.
    expect(view(s).lines).toBeGreaterThan(30);
    expect(view(s).status).toBe('won');
    expect(goalOf(s)?.numeric).toBe(0);
    expect(hudOf(s, 'GOAL')).toBe('0');
  });

  it('only runs its clock while the run is playing', () => {
    const s = rushes();
    // Zero-frame taps: the toggle acts on the key-down, so the only frames this
    // test spends are the ones it asks for.
    tap(s, 'pause', 0);
    expect(view(s).status).toBe('paused');
    s.advance(150 * SECOND + 600);
    expect(view(s).status).toBe('paused');
    expect(view(s).frames).toBe(0);
    expect(hudOf(s, 'TIME LEFT')).toBe('02:30');
    tap(s, 'pause', 0);
    expect(view(s).status).toBe('playing');
    s.advance(SECOND);
    expect(view(s).status).toBe('playing');
    expect(view(s).frames).toBe(SECOND);
    expect(hudOf(s, 'TIME LEFT')).toBe('02:29');
  });
});

describe('BLITZ — as many rows as its clock allows', () => {
  const blitzes = (over: Partial<typeof DEFAULT_CONFIG> = {}): Session =>
    makeSession(timedMaxLinesMode, SEED, over);

  it('shows the clock and the rows it has, and no quota to meet', () => {
    const s = blitzes();
    expect(hudOf(s, 'TIME LEFT')).toBe('02:00');
    expect(hudOf(s, 'LINES')).toBe('0');
    expect(goalOf(s)?.kind).toBe('time-up');
    expect(goalOf(s)?.numeric).toBe(0);
    expect(goalOf(s)?.target).toBe(0);
    expect(goalOf(s)?.current).toBe('0');
    clearRows(s, 2);
    expect(hudOf(s, 'LINES')).toBe('2');
    // The goal is the buzzer, so clearing rows never counts anything down.
    expect(goalOf(s)?.numeric).toBe(2);
    expect(goalOf(s)?.target).toBe(0);
  });

  it('ends at the buzzer with the rows it managed kept counted', () => {
    // 60 visible rows: no piece reaches the floor twice inside the clock, so the
    // only rows on the books are the three this test cleared.
    const s = blitzes({ visibleRows: 60 });
    clearRows(s, 3);
    const spent = view(s).frames;
    const events = s.advance(120 * SECOND - spent);
    expect(view(s).frames).toBe(120 * SECOND);
    expect(view(s).status).toBe('lost');
    expect(of(events, 'status').map((event) => event.status)).toEqual(['lost']);
    expect(sfxNames(events)).toContain('lose');
    expect(sfxNames(events)).not.toContain('win');
    expect(view(s).lines).toBe(3);
    expect(hudOf(s, 'LINES')).toBe('3');
    expect(hudOf(s, 'TIME LEFT')).toBe('00:00');
  });
});

describe('ENDLESS — garbage that arrives faster every wave', () => {
  const endless = (over: Partial<typeof DEFAULT_CONFIG> = {}): Session =>
    makeSession(risingGarbageMode, SEED, over);

  it('holds the first wave until twelve seconds in', () => {
    const s = endless();
    expect(of(s.advance(12 * SECOND - 1), 'garbage')).toEqual([]);
    expect(view(s).status).toBe('playing');
    expect(of(s.advance(1), 'garbage').map((event) => event.rows)).toEqual([1]);
    expect(view(s).frames).toBe(12 * SECOND);
  });

  it('shortens the gap between waves by half a second each time', () => {
    const s = endless();
    const hits = waveFrames(s, 4);
    expect(hits[0]).toBe(12 * SECOND);
    expect(gaps(hits)).toEqual([690, 660, 630]);
    expect(view(s).status).toBe('playing');
  });

  it('never lets the gap fall below three seconds', () => {
    // The field is deliberately enormous: twenty waves of garbage plus whatever
    // pieces land in between is far more stack than the game's own board holds,
    // and a lost run stops the counter. Only the interval is under test here.
    const s = endless({ visibleRows: 120 });
    const intervals = gaps(waveFrames(s, 21));
    expect(Math.min(...intervals)).toBe(3 * SECOND);
    expect(intervals.slice(-3)).toEqual([180, 180, 180]);
    expect(view(s).status).not.toBe('won');
  });

  it('shows how long until the next wave instead of a line goal', () => {
    const s = endless();
    expect(goalOf(s)?.kind).toBe('survive');
    expect(goalOf(s)?.label).toBe('NEXT');
    expect(goalOf(s)?.numeric).toBe(12);
    expect(goalOf(s)?.target).toBe(0);
    expect(hudOf(s, 'LINES')).toBe('0');
    s.advance(12 * SECOND - 1);
    expect(goalOf(s)?.numeric).toBe(1);
    s.advance(1);
    expect(view(s).frames).toBe(12 * SECOND);
    // The wave that just landed already set the timer for the next one.
    expect(goalOf(s)?.numeric).toBe(12);
  });

  it('never wins, and only the top of the field ends it', () => {
    const s = endless();
    for (let round = 0; round < 3; round += 1) {
      clearRows(s, 4);
      s.advance(4 * SECOND);
      expect(view(s).status).toBe('playing');
    }
    expect(view(s).lines).toBe(12);
    s.receiveGarbage(40);
    expect(view(s).status).toBe('lost');
  });
});

describe('FUSION — a floor of star blocks under the stack', () => {
  /**
   * Colours the dropped piece cannot be, so its own locked cells never join the
   * cluster the flood is measuring. Every drop here is an O (cell 2).
   */
  const LINK = cellOf('L');
  const OTHER = cellOf('T');

  const fuses = (over: Partial<typeof DEFAULT_CONFIG> = {}): Session =>
    makeSession(linkedBlocksMode, SEED, over);

  it('opens on a star row under three rising rows, and says nothing about it', () => {
    const s = createSession({
      mode: linkedBlocksMode,
      seed: SEED,
      config: configWith(),
      difficulty: 2,
    });
    // The constructor has dealt its first piece already; the setup rows are not news.
    expect(of(s.advance(0), 'garbage')).toEqual([]);
    const board = s.snapshot().board;
    const bottom = board.rows - 1;
    expect(starRowCount(board)).toBe(6);
    expect(rowCells(board, bottom).filter((cell) => cell === STAR)).toHaveLength(6);
    expect(rowCells(board, bottom).filter((cell) => cell === EMPTY)).toHaveLength(4);
    for (const y of [bottom - 1, bottom - 2, bottom - 3]) {
      expect(rowCells(board, y).filter((cell) => cell === GARBAGE), `row ${y}`).toHaveLength(9);
      expect(rowCells(board, y).filter((cell) => cell === EMPTY), `row ${y}`).toHaveLength(1);
    }
    // 3 rows of 9 plus the six star cells, and nothing else on the field.
    expect(filledCells(board)).toBe(33);
  });

  it('goals the holes left in the live star row, not a line quota', () => {
    const s = fuses();
    expect(goalOf(s)?.kind).toBe('star-row');
    expect(goalOf(s)?.numeric).toBe(4);
    expect(goalOf(s)?.target).toBe(DEFAULT_CONFIG.cols);
    expect(hudOf(s, 'GOAL')).toBe('4');
    const board = view(s).board;
    const [first] = holesInBottomRow(s);
    poke(board, first ?? 0, board.rows - 1, STAR);
    expect(goalOf(s)?.numeric).toBe(3);
    expect(hudOf(s, 'GOAL')).toBe('3');
  });

  it('levels up on a star row and lifts a fresh layer under the stack', () => {
    const s = fuses();
    const board = view(s).board;
    const bottom = board.rows - 1;
    emptyBoard(board);
    // A closed star row — the only full row on the field — over two half layers,
    // so the star row goes alone and the garbage above it cannot follow.
    fillRow(board, bottom, [], STAR);
    fillRow(board, bottom - 1, [5, 6, 7, 8, 9], GARBAGE);
    fillRow(board, bottom - 2, [5, 6, 7, 8, 9], GARBAGE);
    hardDrop(s);
    const events = advanceUntil(s, 'lines').events;
    expect(of(events, 'lines').map((event) => event.count)).toEqual([1]);
    expect(levels(events)).toEqual([2]);
    expect(view(s).status).toBe('playing');
    expect(starRowCount(board)).toBe(6);
    expect(rowCells(board, bottom).filter((cell) => cell === STAR)).toHaveLength(6);
    expect(rowCells(board, bottom).filter((cell) => cell === EMPTY)).toHaveLength(4);
    for (const y of [bottom - 1, bottom - 2]) {
      expect(rowCells(board, y).filter((cell) => cell === GARBAGE), `row ${y}`).toHaveLength(9);
    }
    // 20 cells built + 4 locked, less the 10 that cleared, plus a fresh layer of
    // 9 + 9 + 6: the tally is what pins the layer's size and its hole count.
    expect(filledCells(board)).toBe(38);
    expect(goalOf(s)?.numeric).toBe(4);
  });

  it('wins on a star row at the top level and pushes nothing after it', () => {
    const s = fuses({ maxLevel: 1 });
    const board = view(s).board;
    emptyBoard(board);
    fillRow(board, board.rows - 1, [], STAR);
    hardDrop(s);
    const events = advanceUntil(s, 'status').events;
    expect(of(events, 'status').map((event) => event.status)).toEqual(['won']);
    expect(sfxNames(events)).toContain('win');
    expect(view(s).status).toBe('won');
    expect(view(s).level).toBe(1);
    expect(levels(events)).toEqual([]);
    expect(starRowCount(board)).toBe(0);
    // Only the piece that triggered it is left: a won run gets no fresh layer.
    expect(filledCells(board)).toBe(4);
  });

  it('takes same-colour blocks that touch the cleared row with it', () => {
    const s = makeSession(linkedBlocksMode, seedShowing('O'));
    const board = view(s).board;
    const bottom = board.rows - 1;
    emptyBoard(board);
    expect(activeId(s)).toBe('O');
    // One full row to clear, holding a garbage cell; a two-cell tower standing on
    // a same-colour cell of that row; a garbage cell on the row's garbage cell;
    // another colour beside the tower; and same-colour cells that touch nothing.
    fillRow(board, bottom, [1], LINK);
    poke(board, 1, bottom, GARBAGE);
    poke(board, 0, bottom - 1, LINK);
    poke(board, 0, bottom - 2, LINK);
    poke(board, 1, bottom - 1, GARBAGE);
    poke(board, 1, bottom - 2, OTHER);
    poke(board, 8, bottom - 3, LINK);
    dropAt(s, 4);
    advanceUntil(s, 'lines');
    s.advance(SECOND);
    // Rows above a cleared row fall by one, so everything left sits one lower
    // than it was placed. The tower went with the row; the rest stayed.
    expect(rowCells(board, bottom)[0]).toBe(EMPTY);
    expect(rowCells(board, bottom - 1)[0]).toBe(EMPTY);
    expect(rowCells(board, bottom)[1]).toBe(GARBAGE);
    expect(rowCells(board, bottom - 1)[1]).toBe(OTHER);
    expect(rowCells(board, bottom - 2)[1]).toBe(EMPTY);
    expect(rowCells(board, bottom - 3)[8]).toBe(EMPTY);
    expect(rowCells(board, bottom - 2)[8]).toBe(LINK);
    // 15 built + 4 locked, less the row's 10 and the 2 cells that stuck to it.
    expect(filledCells(board)).toBe(7);
  });

  it('only moves on a star row: any other clear neither levels nor wins', () => {
    const s = fuses({ maxLevel: 1 });
    const board = view(s).board;
    emptyBoard(board);
    fillRow(board, 10, [], GARBAGE);
    hardDrop(s);
    const events = advanceUntil(s, 'lines').events;
    expect(of(events, 'lines').map((event) => event.count)).toEqual([1]);
    expect(levels(events)).toEqual([]);
    expect(of(events, 'status')).toEqual([]);
    expect(view(s).status).toBe('playing');
    expect(view(s).level).toBe(1);
    expect(starRowCount(board)).toBe(0);
    // The row is gone and only the piece that locked is left.
    expect(filledCells(board)).toBe(4);
  });

  it('climbs one level per star row and wins at the top one', () => {
    const s = fuses({ maxLevel: 3 });
    const board = view(s).board;
    const bottom = board.rows - 1;
    for (let climb = 1; climb <= 2; climb += 1) {
      emptyBoard(board);
      fillRow(board, bottom, [], STAR);
      hardDrop(s);
      const events = advanceUntil(s, 'lines').events;
      expect(levels(events), `star row number ${climb}`).toEqual([climb + 1]);
      expect(view(s).level).toBe(climb + 1);
      expect(view(s).status).toBe('playing');
      expect(starRowCount(board)).toBe(6);
    }
    emptyBoard(board);
    fillRow(board, bottom, [], STAR);
    hardDrop(s);
    const events = advanceUntil(s, 'lines').events;
    expect(view(s).level).toBe(3);
    expect(levels(events)).toEqual([]);
    expect(of(events, 'status').map((event) => event.status)).toEqual(['won']);
    expect(view(s).status).toBe('won');
  });
});
