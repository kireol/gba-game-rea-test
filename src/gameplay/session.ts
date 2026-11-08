import type {
  ActivePiece,
  Board,
  Cell,
  Difficulty,
  GameStatus,
  HudField,
  Intent,
  PieceId,
  SessionEvent,
} from '../engine/types.js';
import { GARBAGE, cellOf } from '../engine/types.js';
import {
  clearCells,
  collides,
  createBoard,
  fullRows,
  ghostY,
  isEmpty,
  isTopOut,
  place,
  pushBottomRow,
} from '../engine/board.js';
import { createBag, createRng, randInt, type Rng } from '../engine/random.js';
import { cellsOf, spawnPiece } from '../engine/pieces.js';
import { DEFAULT_CONFIG, gravityFrames, type GameConfig } from '../engine/config.js';
import { clearScore, dropScore } from './score.js';
import type { GoalInfo, ModeApi, ModePlugin, ModeRun } from '../modes/types.js';

export interface SessionOpts {
  mode: ModePlugin;
  seed: number;
  config?: GameConfig;
  difficulty?: Difficulty;
}

/** Everything the renderer and HUD may read. The caller must not mutate it. */
export interface SessionView {
  readonly mode: ModePlugin;
  readonly board: Board;
  readonly active: ActivePiece | null;
  /** Box row of the landing projection, or `null` when there is no active piece. */
  readonly ghost: number | null;
  readonly queue: readonly PieceId[];
  readonly hold: PieceId | null;
  readonly canHold: boolean;
  readonly level: number;
  readonly lines: number;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly frames: number;
  readonly seconds: number;
  readonly pieces: number;
  readonly status: GameStatus;
  readonly goal: GoalInfo | null;
  readonly hud: readonly HudField[];
  /** Frames left of the line-clear flash, for the renderer's stack blink. */
  readonly flash: number;
  readonly seed: number;
  readonly difficulty: Difficulty;
}

export interface Session {
  /** Advances the run by `frames` and returns the events that happened. */
  advance(frames: number): SessionEvent[];
  /** Applies an intent; `down` is false on key/mouse release (DAS/ARR need it). */
  input(intent: Intent, down?: boolean): void;
  snapshot(): SessionView;
  /** Flushes events queued since the last drain (e.g. right after `input`). */
  events(): SessionEvent[];
  /** Sends garbage in from the bottom — used by the local versus wrapper. */
  receiveGarbage(rows: number): void;
  /** Compact state fingerprint; the determinism tests compare these. */
  digest(): string;
}

interface HeldState {
  left: boolean;
  right: boolean;
  soft: boolean;
}

export const createSession = (opts: SessionOpts): Session => {
  const config: GameConfig = opts.config ?? DEFAULT_CONFIG;
  const difficulty: Difficulty = opts.difficulty ?? 2;
  const board: Board = createBoard(config.cols, config.visibleRows + config.hiddenRows);
  const rng: Rng = createRng(opts.seed);
  const bag = createBag(rng);

  const pending: SessionEvent[] = [];
  const emit = (event: SessionEvent): void => {
    pending.push(event);
  };

  let status: GameStatus = 'playing';
  let frames = 0;
  let level = 1;
  let lines = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let pieces = 0;
  let active: ActivePiece | null = null;
  let holdId: PieceId | null = null;
  let canHold = true;
  let gravityTimer = 0;
  let landedTimer = 0;
  let spawnTimer = 0;
  let clearTimer = 0;
  let pendingCells: Set<number> | null = null;
  let pendingRows: number[] = [];

  const queue: PieceId[] = [];
  const fillQueue = (): void => {
    while (queue.length < config.queueLength) queue.push(bag.next());
  };
  fillQueue();

  const held: HeldState = { left: false, right: false, soft: false };
  let dir = 0;
  let dasTimer = 0;
  let repeatTimer = 0;

  let run: ModeRun;

  const setStatusDirect = (next: GameStatus): void => {
    if (status === next || status === 'won' || status === 'lost') return;
    status = next;
    emit({ type: 'status', status });
    if (next === 'lost') emit({ type: 'sfx', name: 'lose' });
    if (next === 'won') emit({ type: 'sfx', name: 'win' });
  };

  const randomHoles = (count: number): number[] => {
    const n = Math.max(0, Math.min(config.cols - 1, Math.trunc(count)));
    const holes = new Set<number>();
    while (holes.size < n) holes.add(randInt(rng, config.cols));
    return [...holes];
  };

  /** Shared path for garbage and for a mode's own bottom rows (star blocks). */
  const insertRows = (
    cell: Cell,
    rowCount: number,
    holesPerRow: number,
    announce: boolean,
  ): void => {
    const rows = Math.max(0, Math.trunc(rowCount));
    if (rows === 0 || status !== 'playing') return;
    let overflow = 0;
    for (let i = 0; i < rows; i += 1) {
      overflow += pushBottomRow(board, cell, randomHoles(holesPerRow));
    }
    if (active && collides(board, active)) {
      // The active piece must not end up buried inside incoming rows. The stack
      // grew by `rows`, so the usual answer is to raise the piece by that much:
      // count up from where it stands until a row is free. A lift that would move
      // the piece off the top is a top-out, not an escape hatch.
      const top = Math.min(...cellsOf(active).map((c) => c.y));
      let lift = 0;
      while (lift < board.rows && collides(board, active, 0, -lift)) lift += 1;
      if (lift <= top) active.y -= lift;
      else setStatusDirect('lost');
    }
    if (overflow > 0) setStatusDirect('lost');
    if (announce) {
      emit({ type: 'garbage', rows });
      emit({ type: 'sfx', name: 'garbage' });
      run.onGarbage?.(rows);
    }
  };

  const api: ModeApi = {
    config,
    difficulty,
    rng,
    board,
    get level() {
      return level;
    },
    get lines() {
      return lines;
    },
    get frames() {
      return frames;
    },
    get seconds() {
      return frames / 60;
    },
    get status() {
      return status;
    },
    setStatus: setStatusDirect,
    setLevel(next: number) {
      const clamped = Math.max(1, Math.min(99, Math.trunc(next)));
      if (clamped === level) return;
      level = clamped;
      emit({ type: 'level-up', level });
      emit({ type: 'sfx', name: 'level-up' });
    },
    addGarbage(rows: number) {
      insertRows(GARBAGE, rows, 1, true);
    },
    pushRow(cell: Cell, holes: number) {
      insertRows(cell, 1, holes, false);
    },
    emit,
  };

  run = opts.mode.createRun(api);
  opts.mode.setupBoard?.(board, api);

  const tryMove = (dx: number, dy: number): boolean => {
    if (!active || collides(board, active, dx, dy)) return false;
    active.x += dx;
    active.y += dy;
    if (dy === 0) landedTimer = 0;
    return true;
  };

  const doSpawn = (): void => {
    fillQueue();
    const id = queue.shift();
    if (id === undefined) return;
    fillQueue();
    const piece = spawnPiece(id, { cols: config.cols, hiddenRows: config.hiddenRows });
    active = piece;
    canHold = true;
    gravityTimer = 0;
    landedTimer = 0;
    dasTimer = 0;
    repeatTimer = 0;
    emit({ type: 'spawn', id });
    emit({ type: 'sfx', name: 'spawn' });
    if (isTopOut(board, piece)) setStatusDirect('lost');
  };

  doSpawn();

  const commitClear = (): void => {
    const cells = pendingCells;
    const rows = pendingRows;
    pendingCells = null;
    pendingRows = [];
    if (!cells || cells.size === 0) return;
    clearCells(board, cells);
    const count = rows.length;
    const perfect = isEmpty(board);
    combo += 1;
    maxCombo = Math.max(maxCombo, combo);
    const gained = clearScore(count, level, perfect, combo - 1).points;
    score += gained;
    lines += count;
    emit({ type: 'lines', rows, count, score: gained, perfect });
    emit({ type: 'sfx', name: count >= 4 ? 'clear-big' : 'clear' });
    run.onClear?.(
      rows,
      count,
      Math.max(0, cells.size - count * config.cols),
    );
    spawnTimer = Math.max(1, config.spawnDelayFrames);
  };

  const lockPiece = (): void => {
    const piece = active;
    if (!piece) return;
    const locked = cellsOf(piece).filter((c) => c.y >= 0);
    const above = place(board, piece, cellOf(piece.id));
    active = null;
    pieces += 1;
    emit({ type: 'lock' });
    emit({ type: 'sfx', name: 'lock' });
    run.onLock?.(piece, locked);

    const buried =
      above > 0 || (locked.length > 0 && locked.every((c) => c.y < config.hiddenRows));
    if (buried) {
      setStatusDirect('lost');
      return;
    }

    const rows = fullRows(board);
    if (rows.length === 0) {
      combo = 0;
      spawnTimer = Math.max(1, config.spawnDelayFrames);
      return;
    }
    const cells = new Set<number>();
    for (const y of rows) for (let x = 0; x < config.cols; x += 1) cells.add(y * config.cols + x);
    run.extendClear?.(rows, cells);
    pendingCells = cells;
    pendingRows = rows;
    clearTimer = Math.max(0, config.clearFreezeFrames);
    // `step` commits when the countdown reaches zero, so a config with no flash
    // needs the commit here — otherwise the rows sit pending with no active piece
    // and no spawn timer, and the run stops dead.
    if (clearTimer === 0) commitClear();
  };

  const doHardDrop = (): void => {
    if (!active) return;
    const target = ghostY(board, active);
    const dy = Math.max(0, target - active.y);
    if (dy > 0) active.y = target;
    score += dropScore(dy, true);
    emit({ type: 'hard-drop', dy });
    emit({ type: 'sfx', name: 'hard-drop' });
    lockPiece();
  };

  const doHold = (): void => {
    if (!config.hold || !canHold || !active) return;
    const previous = holdId;
    holdId = active.id;
    canHold = false;
    emit({ type: 'hold' });
    emit({ type: 'sfx', name: 'hold' });
    if (previous) {
      const piece = spawnPiece(previous, { cols: config.cols, hiddenRows: config.hiddenRows });
      active = piece;
      gravityTimer = 0;
      landedTimer = 0;
      if (isTopOut(board, piece)) setStatusDirect('lost');
    } else {
      // An empty slot takes the piece out of play; otherwise it would sit in the
      // slot and keep falling, which is a free duplicate of it.
      active = null;
      spawnTimer = Math.max(1, config.spawnDelayFrames);
    }
  };

  const rotate = (clockwise: boolean): void => {
    if (!active) return;
    const next = ((active.rot + (clockwise ? 1 : 3)) % 4) as ActivePiece['rot'];
    if (collides(board, active, 0, 0, next)) {
      emit({ type: 'rotate', dir: clockwise ? 1 : -1, ok: false });
      emit({ type: 'sfx', name: 'rotate-fail' });
      return;
    }
    active.rot = next;
    landedTimer = 0;
    emit({ type: 'rotate', dir: clockwise ? 1 : -1, ok: true });
    emit({ type: 'sfx', name: 'rotate' });
  };

  const pressDirection = (next: number): void => {
    dir = next;
    dasTimer = 0;
    repeatTimer = 0;
    if (tryMove(next, 0)) {
      emit({ type: 'move', dx: next });
      emit({ type: 'sfx', name: 'move' });
    }
  };

  const releaseDirection = (side: 'left' | 'right'): void => {
    held[side] = false;
    const other = side === 'left' ? 'right' : 'left';
    const otherDir = other === 'left' ? -1 : 1;
    if (held[other]) {
      dir = otherDir;
      dasTimer = 0;
      repeatTimer = 0;
    } else if ((side === 'left' && dir === -1) || (side === 'right' && dir === 1)) {
      dir = 0;
    }
  };

  const handleAutoShift = (): void => {
    if (!active || dir === 0) return;
    if (!(dir < 0 ? held.left : held.right)) return;
    dasTimer += 1;
    repeatTimer += 1;
    if (dasTimer < config.dasFrames || repeatTimer < config.arrFrames) return;
    repeatTimer = 0;
    if (tryMove(dir, 0)) {
      emit({ type: 'move', dx: dir });
      emit({ type: 'sfx', name: 'move' });
    }
  };

  /**
   * Gravity plus lock. With `lockDelayFrames: 0` the piece locks on the first
   * frame it cannot move down, which is what the reference showed (no lock window
   * was observable at 12-frame resolution, unknowns U3). Inputs in that same
   * frame are processed first, so the last frame of a fall is still playable.
   */
  const handleGravity = (): void => {
    if (!active) return;
    if (collides(board, active, 0, 1)) {
      landedTimer += 1;
      if (landedTimer > config.lockDelayFrames) lockPiece();
      return;
    }
    landedTimer = 0;
    gravityTimer += 1;
    const period = held.soft
      ? config.softDropFrames
      : gravityFrames(config, level, difficulty);
    if (gravityTimer < period) return;
    gravityTimer = 0;
    if (tryMove(0, 1)) {
      if (held.soft) {
        score += dropScore(1, false);
        emit({ type: 'soft-drop', dy: 1 });
      } else {
        emit({ type: 'shift', dy: 1 });
      }
    }
  };

  const step = (): void => {
    if (status !== 'playing') return;
    frames += 1;
    run.advance?.(1);
    const over = run.status();
    if (over !== 'playing') setStatusDirect(over);
    if (status !== 'playing') return;

    if (clearTimer > 0) {
      clearTimer -= 1;
      if (clearTimer === 0) commitClear();
      return;
    }
    if (spawnTimer > 0) {
      spawnTimer -= 1;
      if (spawnTimer === 0) doSpawn();
      return;
    }
    if (!active) return;
    handleAutoShift();
    if (!active) return;
    handleGravity();
    const done = run.status();
    if (done !== 'playing') setStatusDirect(done);
  };

  const input = (intent: Intent, down = true): void => {
    if (intent === 'pause') {
      if (!down) return;
      if (status === 'playing') setStatusDirect('paused');
      else if (status === 'paused') setStatusDirect('playing');
      return;
    }
    if (status !== 'playing') return;
    switch (intent) {
      // The held flag is recorded here because `handleAutoShift` gates on it and
      // only this switch knows which side an intent belongs to.
      case 'left':
        held.left = down;
        if (down) pressDirection(-1);
        else releaseDirection('left');
        break;
      case 'right':
        held.right = down;
        if (down) pressDirection(1);
        else releaseDirection('right');
        break;
      case 'soft-drop':
        held.soft = down;
        if (down) gravityTimer = config.softDropFrames;
        break;
      case 'hard-drop':
        if (down) doHardDrop();
        break;
      case 'rotate-cw':
        if (down) rotate(true);
        break;
      case 'rotate-ccw':
        if (down) rotate(false);
        break;
      case 'hold':
        if (down) doHold();
        break;
      default:
        break;
    }
  };

  const snapshot = (): SessionView => ({
    mode: opts.mode,
    board,
    active,
    ghost: active && config.ghost && status === 'playing' ? ghostY(board, active) : null,
    queue: queue.slice(),
    hold: holdId,
    canHold,
    level,
    lines,
    score,
    combo,
    maxCombo,
    frames,
    seconds: frames / 60,
    pieces,
    status,
    goal: run.goal(),
    hud: run.hud(),
    flash: clearTimer,
    seed: opts.seed,
    difficulty,
  });

  return {
    advance(count: number) {
      const n = Math.max(0, Math.trunc(count));
      for (let i = 0; i < n; i += 1) step();
      return pending.splice(0, pending.length);
    },
    input,
    snapshot,
    events() {
      return pending.splice(0, pending.length);
    },
    receiveGarbage(rows: number) {
      insertRows(GARBAGE, rows, 1, true);
    },
    digest() {
      return JSON.stringify({
        f: frames,
        l: level,
        n: lines,
        s: score,
        p: pieces,
        st: status,
        q: queue,
        h: holdId,
        b: Array.from(board.cells).join(','),
      });
    },
  };
};
