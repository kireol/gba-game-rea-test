import { describe, expect, it } from 'vitest';
import { MAX_CATCHUP, STEP_MS, createLoop } from '../app/loop.js';

/**
 * The loop is the only place wall-clock time becomes rules frames, so these tests
 * own both halves of the clock: a virtual `now` they move by hand and a scheduler
 * they pump by hand. Nothing waits, and nothing needs a DOM.
 *
 * The default step is 10 ms rather than `STEP_MS` because it is exactly
 * representable in binary: the structural tests below then assert arithmetic that
 * is exact rather than float-shaped. `describe('at the real 60 Hz step')` covers
 * what the real constant does, including where floating point shows up.
 */
const TEST_STEP_MS = 10;

interface DriverOpts {
  readonly stepMs?: number;
  readonly maxCatchUp?: number;
  /** Makes `onTick` throw after it records the delivery. */
  readonly throwOnTick?: boolean;
}

const createDriver = (opts: DriverOpts = {}) => {
  const delivered: number[] = [];
  // Small and non-zero: the loop re-bases on its first frame *and* on any frame
  // that finds no previous stamp, and a clock at 0 makes those two cases
  // indistinguishable. Staying in the tens of milliseconds also keeps the
  // bookkeeping free of cancellation against a large origin.
  let time = 1;
  let queued: ((stamp: number) => void) | undefined;
  let scheduled = 0;
  let lastHandle = 0;
  const cancelled: number[] = [];

  const loop = createLoop(
    (frames) => {
      delivered.push(frames);
      if (opts.throwOnTick) throw new Error('onTick exploded');
    },
    {
      stepMs: opts.stepMs ?? TEST_STEP_MS,
      // `exactOptionalPropertyTypes` means an unset option has to be absent from
      // the object, not present-and-undefined.
      ...(opts.maxCatchUp === undefined ? {} : { maxCatchUp: opts.maxCatchUp }),
      now: () => time,
      schedule: (callback) => {
        queued = callback;
        scheduled += 1;
        lastHandle += 1;
        return lastHandle;
      },
      unschedule: (handle) => {
        cancelled.push(handle);
        queued = undefined;
      },
    },
  );

  /** Moves virtual time without delivering anything. */
  const advance = (ms: number): void => {
    time += ms;
  };

  /** Runs the queued animation frame against the current virtual clock. */
  const pump = (stamp = time): void => {
    if (!queued) throw new Error('no frame is scheduled');
    const callback = queued;
    queued = undefined;
    callback(stamp);
  };

  /** start() plus the frame that only re-bases; the loop is now accounting. */
  const boot = (): void => {
    loop.start();
    pump();
  };

  return {
    loop,
    delivered,
    advance,
    pump,
    boot,
    get time(): number {
      return time;
    },
    get scheduled(): number {
      return scheduled;
    },
    get cancelled(): readonly number[] {
      return cancelled;
    },
    get lastHandle(): number {
      return lastHandle;
    },
    get hasQueuedFrame(): boolean {
      return queued !== undefined;
    },
  };
};

describe('the fixed-timestep loop', () => {
  it('steps the rules clock at 60 Hz and caps catch-up at four frames', () => {
    // Both numbers are load-bearing elsewhere: 1000/60 is the frame unit every
    // timing constant in the rules layer is written in, and the catch-up cap is
    // what a stalled tab is allowed to skip.
    expect(STEP_MS).toBeCloseTo(1000 / 60, 12);
    expect(MAX_CATCHUP).toBe(4);
  });

  it('owes nothing for the time before the first frame', () => {
    const d = createDriver();
    d.loop.start();
    d.advance(5000); // A slow first paint must not teleport the board.
    d.pump();
    expect(d.delivered).toEqual([]);
    expect(d.loop.steps).toBe(0);
    expect(d.loop.ticks).toBe(0);
  });

  it('schedules exactly one frame and ignores a second start', () => {
    const d = createDriver();
    expect(d.loop.running).toBe(false);
    d.loop.start();
    d.loop.start();
    expect(d.loop.running).toBe(true);
    expect(d.scheduled).toBe(1);
  });

  it('hands onTick whole steps and banks the remainder', () => {
    const d = createDriver(); // 10 ms steps, so the numbers below are exact.
    d.boot();
    d.advance(35);
    d.pump();
    expect(d.delivered).toEqual([3]);
    expect(d.loop.steps).toBe(3);
    expect(d.loop.ticks).toBe(1); // One tick delivered three frames.
    d.advance(6); // The 5 ms left over joins this, so 11 ms → one frame.
    d.pump();
    expect(d.delivered).toEqual([3, 1]);
    expect(d.loop.steps).toBe(4);
  });

  it('delivers nothing on a tick shorter than one step', () => {
    const d = createDriver();
    d.boot();
    d.advance(4);
    d.pump();
    expect(d.delivered).toEqual([]);
    expect(d.loop.ticks).toBe(0);
    d.advance(6);
    d.pump();
    expect(d.delivered).toEqual([1]); // Nothing was dropped; it just was not due.
  });

  it('catches up to the cap and then drops the rest of the backlog', () => {
    const d = createDriver();
    d.boot();
    d.advance(100); // Ten steps of stall; four may be repaid, no more.
    d.pump();
    expect(d.delivered).toEqual([4]);
    expect(d.loop.steps).toBe(4);
    // The six unpaid frames are gone rather than waiting to be paid out in bursts:
    // a later short tick must not inherit the debt.
    d.advance(1);
    d.pump();
    expect(d.delivered).toEqual([4]);
  });

  it('never caps below one frame per tick', () => {
    const d = createDriver({ maxCatchUp: 0 });
    d.boot();
    d.advance(50);
    d.pump();
    expect(d.delivered).toEqual([1]); // max(1, 0): time moves, but slowly.
    // At a cap of one the leftover backlog exceeds the cap and is dropped, so the
    // five steps of elapsed time became one game frame — a deliberate trade.
    d.pump();
    expect(d.delivered).toEqual([1]);
    d.advance(10);
    d.pump();
    expect(d.delivered).toEqual([1, 1]);
  });

  it('takes the injected clock over the frame stamp', () => {
    const d = createDriver();
    d.boot();
    d.advance(10);
    d.pump(9_999_999); // A stamp that contradicts the clock must be ignored.
    expect(d.delivered).toEqual([1]);
    d.pump(-500); // Same virtual time: still nothing further owed.
    expect(d.delivered).toEqual([1]);
  });

  it('re-bases on a clock that jumps backwards instead of going negative', () => {
    const d = createDriver();
    d.boot();
    d.advance(20);
    d.pump();
    expect(d.delivered).toEqual([2]);
    d.advance(-1000); // Sleep, a clock correction, a suspended laptop.
    d.pump();
    expect(d.delivered).toEqual([2]);
    d.advance(10);
    d.pump();
    expect(d.delivered).toEqual([2, 1]); // Exactly the one frame it now owes.
  });

  it('drops accumulated debt on reset', () => {
    const d = createDriver();
    d.boot();
    d.advance(80);
    d.loop.reset(); // A pause the game could not see: forget the backlog.
    d.pump();
    expect(d.delivered).toEqual([]);
    d.advance(10);
    d.pump();
    expect(d.delivered).toEqual([1]);
  });

  it('unschedules the live handle on stop and delivers nothing afterwards', () => {
    const d = createDriver();
    d.boot();
    const live = d.lastHandle; // Each frame re-schedules itself at entry.
    d.advance(20);
    d.loop.stop();
    expect(d.loop.running).toBe(false);
    expect(d.cancelled).toEqual([live]);
    d.loop.stop(); // Idempotent: no second cancel, no throw.
    expect(d.cancelled).toEqual([live]);
    expect(d.hasQueuedFrame).toBe(false);
    expect(() => d.pump()).toThrow('no frame is scheduled');
    d.advance(100);
    expect(d.delivered).toEqual([]);
    expect(d.loop.steps).toBe(0);
  });

  it('restarts from a clean accumulator and counts for its whole life', () => {
    const d = createDriver();
    d.boot();
    d.advance(30);
    d.pump();
    expect(d.loop.steps).toBe(3);
    d.loop.stop();
    d.advance(60_000); // Away for a minute.
    d.loop.start();
    d.pump(); // Re-based: the minute away is not owed as frames.
    expect(d.loop.steps).toBe(3);
    expect(d.loop.ticks).toBe(1);
    d.advance(10);
    d.pump();
    expect(d.delivered).toEqual([3, 1]);
    expect(d.loop.steps).toBe(4);
    expect(d.loop.ticks).toBe(2);
  });

  it('is still scheduled for the next frame when onTick throws', () => {
    // A renderer or audio exception must not cost the player the rest of the run.
    const d = createDriver({ throwOnTick: true });
    d.boot(); // The re-base frame delivers nothing, so nothing throws yet.
    d.advance(20);
    expect(() => d.pump()).toThrow('onTick exploded');
    expect(d.delivered).toEqual([2]); // The steps were counted before the throw.
    expect(d.loop.steps).toBe(2);
    expect(d.loop.running).toBe(true);
    expect(d.hasQueuedFrame).toBe(true); // frame() reschedules on entry, first.
    d.advance(10);
    expect(() => d.pump()).toThrow('onTick exploded');
    expect(d.delivered).toEqual([2, 1]); // And it is still running afterwards.
  });
});

describe('at the real 60 Hz step', () => {
  /** Pumped at the display rate: one `STEP_MS` of virtual time per frame. */
  const runAt60Hz = (frames: number) => {
    const d = createDriver({ stepMs: STEP_MS });
    d.boot();
    for (let i = 0; i < frames; i += 1) {
      d.advance(STEP_MS);
      d.pump();
    }
    return d;
  };

  it('delivers a 60 Hz display rate as sixty rules frames a second', () => {
    const d = runAt60Hz(60);
    // Not exactly 60: `STEP_MS` is 1000/60 rounded up, so an accumulator that
    // subtracts it drifts a hair high, and one frame per second goes missing.
    // Asserting the interval keeps this test about the rate, not the rounding.
    expect(d.loop.steps).toBeGreaterThanOrEqual(59);
    expect(d.loop.steps).toBeLessThanOrEqual(60);
    expect(d.loop.ticks).toBeLessThanOrEqual(60);
  });

  it('does not let that rounding compound over a long session', () => {
    // 16 simulated minutes. If the deficit grew with time, a 20-minute run would
    // visibly drift against `TIME` in the rules layer, and this would show it.
    const d = runAt60Hz(60_000);
    expect(d.loop.steps).toBeGreaterThanOrEqual(59_990);
    expect(d.loop.steps).toBeLessThanOrEqual(60_000);
  });

  it('pays an exact multiple of the step over two ticks, because the accumulator subtracts', () => {
    const d = createDriver({ stepMs: STEP_MS });
    d.boot();
    d.advance(STEP_MS * 3); // Three nominal steps of elapsed time.
    d.pump();
    // Three times 1000/60 is a hair over 50 ms, so the third step is not due yet.
    expect(d.delivered).toEqual([2]);
    d.advance(1);
    d.pump();
    expect(d.delivered).toEqual([2, 1]);
  });
});
