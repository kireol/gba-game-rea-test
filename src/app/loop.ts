/**
 * Fixed-timestep game loop.
 *
 * The rules engine counts frames, not wall-clock time, so a run must advance the
 * same number of steps per second no matter how often `requestAnimationFrame`
 * fires — 144 Hz and 60 Hz displays have to agree, and so has a headless test.
 * An accumulator does that: real time decides how many 1/60 s steps to take, and
 * `onTick` receives that step count (the renderer still paints once per tick).
 *
 * Catch-up is capped. If the tab stalls (a garbage collection, a background
 * switch) the game does not try to repay thousands of frames, which would look
 * like the board teleporting and could starve the browser; it drops the backlog
 * instead, exactly once per stall.
 */

export const STEP_MS = 1000 / 60;

/** Steps handed to `onTick` in one go, at most. */
export const MAX_CATCHUP = 4;

export interface LoopOpts {
  readonly stepMs?: number;
  readonly maxCatchUp?: number;
  /** Injectable clock, so a test can drive a tick without waiting. */
  readonly now?: () => number;
  /** Injection point for `requestAnimationFrame`; a test can pump it by hand. */
  readonly schedule?: (callback: (time: number) => void) => number;
  readonly unschedule?: (handle: number) => void;
}

export interface Loop {
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** Steps taken (i.e. frames of rules time delivered), across the loop's life. */
  readonly steps: number;
  readonly ticks: number;
  /** Drops the accumulated backlog; call after a pause the game could not see. */
  reset(): void;
}

export const createLoop = (onTick: (frames: number) => void, opts: LoopOpts = {}): Loop => {
  const stepMs = opts.stepMs ?? STEP_MS;
  const maxCatchUp = Math.max(1, opts.maxCatchUp ?? MAX_CATCHUP);
  // With an injected clock we ignore the timestamp rAF passes, so a test can step
  // time without a real animation frame.
  const clock = opts.now;
  const schedule =
    opts.schedule ?? ((callback) => requestAnimationFrame(callback));
  const unschedule =
    opts.unschedule ?? ((handle) => cancelAnimationFrame(handle));

  let handle: number | null = null;
  let previous = 0;
  let accumulator = 0;
  let steps = 0;
  let ticks = 0;

  const frame = (stamp: number): void => {
    handle = schedule(frame);
    const time = clock !== undefined ? clock() : stamp;
    // First frame, or the clock jumped backwards: start from here, no debt.
    if (previous === 0 || time < previous) {
      previous = time;
      return;
    }
    accumulator += time - previous;
    previous = time;
    let frames = 0;
    while (accumulator >= stepMs && frames < maxCatchUp) {
      accumulator -= stepMs;
      frames += 1;
    }
    if (frames === 0) return;
    // A capped catch-up leaves residue; drop it so a stall never accrues.
    if (accumulator > stepMs * maxCatchUp) accumulator = 0;
    steps += frames;
    ticks += 1;
    onTick(frames);
  };

  return {
    start() {
      if (handle !== null) return;
      previous = 0;
      accumulator = 0;
      handle = schedule(frame);
    },
    stop() {
      if (handle === null) return;
      unschedule(handle);
      handle = null;
    },
    get running() {
      return handle !== null;
    },
    get steps() {
      return steps;
    },
    get ticks() {
      return ticks;
    },
    reset() {
      accumulator = 0;
      previous = 0;
    },
  };
};
