import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CORRUPT_KEY,
  DEFAULT_ASSIST,
  DEFAULT_AUDIO,
  DEFAULT_SETTINGS,
  HIGH_SCORE_LIMIT,
  SAVE_DEBOUNCE_MS,
  SAVE_KEY,
  SAVE_VERSION,
  clearedProgress,
  createSaveData,
  isBest,
  isUnlocked,
  loadSaveData,
  normalizeSaveData,
  openSaveStore,
  progressFor,
  recordRun,
  serializeSaveData,
  withUnlocks,
  type KeyValue,
  type ModeProgress,
  type RunSummary,
  type SaveData,
} from '../gameplay/persistence.js';
import { MODES } from '../modes/registry.js';
import { DEFAULT_BINDINGS } from '../engine/bindings.js';
import { seedToString } from '../engine/random.js';

/**
 * The save record is the only thing that outlives a run, and it is read from a
 * browser-controlled store that can be blocked, full, or holding a payload written
 * by a different build. Every case below is the module's contract: never throw,
 * never destroy a payload it does not understand, keep playing without storage.
 */

class FakeStorage implements KeyValue {
  readonly values = new Map<string, string>();
  writes = 0;
  refuse: Error | null = null;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.refuse) throw this.refuse;
    this.values.set(key, value);
    this.writes += 1;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  /** What this build wrote, or null when nothing was ever accepted. */
  payload(): string | null {
    return this.values.get(SAVE_KEY) ?? null;
  }

  read(): SaveData {
    const raw = this.payload();
    if (raw === null) throw new Error('expected a payload under SAVE_KEY');
    return JSON.parse(raw) as SaveData;
  }
}

const storageHolding = (raw: string): FakeStorage => {
  const kv = new FakeStorage();
  kv.values.set(SAVE_KEY, raw);
  return kv;
};

const modeAt = (index: number): string => {
  const mode = MODES[index];
  if (!mode) throw new Error(`no mode registered at index ${index}`);
  return mode.id;
};

const FIRST = modeAt(0);
const SECOND = modeAt(1);
const THIRD = modeAt(2);

const row = (data: SaveData, modeId: string): ModeProgress => progressFor(data, modeId);

const runWith = (over: Partial<RunSummary> = {}): RunSummary => ({
  modeId: FIRST,
  won: false,
  score: 1000,
  lines: 8,
  level: 3,
  seconds: 90,
  seed: 0x1234abcd,
  ...over,
});

const scoreRow = (score: number, over: { modeId?: string; lines?: number } = {}) => ({
  score,
  lines: over.lines ?? 1,
  level: 1,
  seconds: 10,
  modeId: over.modeId ?? FIRST,
  at: 0,
});

const unlockedOf = (data: SaveData): boolean[] => MODES.map((mode) => isUnlocked(data, mode.id));

afterEach(() => {
  vi.useRealTimers();
});

describe('a fresh save record', () => {
  it('is complete, at version one, with only the first mode unlocked', () => {
    const data = createSaveData(1000);

    expect(data.version).toBe(SAVE_VERSION);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(data.assist).toEqual(DEFAULT_ASSIST);
    expect(data.audio).toEqual(DEFAULT_AUDIO);
    expect(data.bindings).toEqual(DEFAULT_BINDINGS);
    expect(data.highScores).toEqual([]);
    expect(data.updatedAt).toBe(1000);

    // Every mode has a row, so the menu can render it without a fallback.
    expect(Object.keys(data.progress).sort()).toEqual(MODES.map((mode) => mode.id).sort());
    expect(unlockedOf(data)).toEqual(MODES.map((_mode, index) => index === 0));
    expect(row(data, SECOND)).toEqual({
      unlocked: false,
      plays: 0,
      clears: 0,
      best: null,
      lastSeed: '',
    });
  });

  it('round-trips through the payload it writes', () => {
    const base = recordRun(createSaveData(0), runWith({ modeId: SECOND, won: true }), 5);
    const tuned: SaveData = {
      ...base,
      settings: { ...base.settings, ghost: false, nextCount: 5, showScore: true, difficulty: 4 },
      assist: { ...base.assist, infiniteThinking: true },
      audio: { master: 0.25, music: 0, sfx: 1, muted: true },
      bindings: { ...base.bindings, 'rotate-cw': ['KeyB'] },
    };

    const payload = serializeSaveData(tuned);
    // The payload has to say which build wrote it, or the next one cannot judge it.
    expect((JSON.parse(payload) as SaveData).version).toBe(SAVE_VERSION);

    const loaded = loadSaveData(storageHolding(payload), 999);

    expect(loaded.corrupt).toBe(false);
    expect(loaded.data).toEqual(tuned);
  });
});

describe('a payload the browser hands back', () => {
  it('keeps a payload it cannot parse aside instead of destroying it', () => {
    const raw = '{"version":1,"settings":{"ghost":false}';
    const kv = storageHolding(raw);

    const loaded = loadSaveData(kv, 4242);

    expect(loaded.corrupt).toBe(true);
    expect(kv.values.get(CORRUPT_KEY)).toBe(raw);
    expect(loaded.data).toEqual(createSaveData(4242));
  });

  it('treats a scalar payload as corrupt', () => {
    for (const raw of ['42', 'true', '"a string"', 'null']) {
      const kv = storageHolding(raw);

      const loaded = loadSaveData(kv, 0);

      expect([raw, loaded.corrupt]).toEqual([raw, true]);
      expect(kv.values.get(CORRUPT_KEY)).toBe(raw);
      expect(loaded.data.settings).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('refuses to guess the shape of a newer save', () => {
    const raw = JSON.stringify({
      version: SAVE_VERSION + 1,
      settings: { ...DEFAULT_SETTINGS, ghost: false, hold: false },
      highScores: [scoreRow(9_999_999)],
    });
    const kv = storageHolding(raw);

    const loaded = loadSaveData(kv, 77);

    expect(loaded.corrupt).toBe(true);
    expect(kv.values.get(CORRUPT_KEY)).toBe(raw);
    // No field of the future payload leaks into the record the game will use.
    expect(loaded.data).toEqual(createSaveData(77));
    expect(loaded.data.settings.ghost).toBe(true);
    expect(loaded.data.highScores).toEqual([]);
  });

  it('fills gaps and drops junk instead of trusting the payload', () => {
    const data = normalizeSaveData(
      {
        settings: { ghost: 'yes', nextCount: 99, showScore: 1, difficulty: 7, screenShake: null },
        assist: { infiniteThinking: 'no' },
        audio: { master: 5, music: -2, sfx: 'loud', muted: 'yes' },
        bindings: {
          left: ['KeyA', 'KeyA', '', 7, 'KeyA'],
          pause: [],
          nonsense: ['KeyQ'],
        },
        progress: {
          [FIRST]: { plays: -3, clears: 'x', best: { score: 0 }, lastSeed: 5 },
          'no-such-mode': { unlocked: true, plays: 9, clears: 9 },
        },
        highScores: [
          { score: 500, lines: 2, level: 1, seconds: 1 },
          { score: 0, lines: 2, level: 1, seconds: 1, modeId: FIRST },
          { lines: 2, level: 1, seconds: 1, modeId: FIRST },
          scoreRow(700),
        ],
        updatedAt: -8,
      },
      31,
    );

    expect(data.version).toBe(SAVE_VERSION);
    expect(data.settings.ghost).toBe(true);
    expect(data.settings.hold).toBe(true);
    expect(data.settings.nextCount).toBe(5);
    expect(data.settings.showScore).toBe(false);
    expect(data.settings.difficulty).toBe(DEFAULT_SETTINGS.difficulty);
    expect(data.settings.screenShake).toBe(true);
    expect(data.assist).toEqual(DEFAULT_ASSIST);
    expect(data.audio).toEqual({ master: 1, music: 0, sfx: DEFAULT_AUDIO.sfx, muted: false });
    expect(data.updatedAt).toBe(0);

    // Duplicates and unusable entries go; an empty row cannot erase a default.
    expect(data.bindings.left).toEqual(['KeyA']);
    expect(data.bindings.pause).toEqual(DEFAULT_BINDINGS.pause);
    expect(Object.keys(data.bindings).sort()).toEqual(Object.keys(DEFAULT_BINDINGS).sort());

    // Unknown modes are ignored, negative counters clamp, a zero-score best is no best.
    expect(Object.keys(data.progress).sort()).toEqual(MODES.map((mode) => mode.id).sort());
    expect(row(data, FIRST)).toEqual({
      unlocked: true,
      plays: 0,
      clears: 0,
      best: null,
      lastSeed: '',
    });

    // A score row needs both a score and a mode; the rest of the table is ordered and capped.
    expect(data.highScores).toEqual([scoreRow(700)]);
  });

  it('still produces a playable record from a payload of the wrong shape', () => {
    for (const raw of ['[1,2,3]', '[]', '{}']) {
      const loaded = loadSaveData(storageHolding(raw), 5);

      expect([raw, loaded.corrupt, loaded.data.settings]).toEqual([
        raw,
        false,
        DEFAULT_SETTINGS,
      ]);
      expect(unlockedOf(loaded.data)).toEqual(MODES.map((_mode, index) => index === 0));
    }
  });

  it('keeps a stored best run and the seed it was set on', () => {
    const data = normalizeSaveData(
      { progress: { [FIRST]: { unlocked: true, plays: 2, best: { score: 700, lines: 4, level: 2, seconds: 33.5 }, lastSeed: '5EED1234' } } },
      0,
    );

    expect(row(data, FIRST).best).toEqual({ score: 700, lines: 4, level: 2, seconds: 33.5 });
    expect(row(data, FIRST).lastSeed).toBe('5EED1234');
  });
});

describe('the high-score table', () => {
  it('orders entries by score, then by lines', () => {
    const data = normalizeSaveData(
      {
        highScores: [
          scoreRow(300, { lines: 1 }),
          scoreRow(900),
          scoreRow(500, { lines: 3 }),
          scoreRow(500, { lines: 9 }),
        ],
      },
      0,
    );

    expect(data.highScores.map((entry) => [entry.score, entry.lines])).toEqual([
      [900, 1],
      [500, 9],
      [500, 3],
      [300, 1],
    ]);
  });

  it('caps the table at HIGH_SCORE_LIMIT entries, best first', () => {
    const data = normalizeSaveData({ highScores: Array.from({ length: 14 }, (_unused, i) => scoreRow((i + 1) * 100)) }, 0);

    expect(data.highScores.length).toBe(HIGH_SCORE_LIMIT);
    expect(data.highScores[0]?.score).toBe(1400);
    expect(data.highScores.map((entry) => entry.score)).toEqual(
      Array.from({ length: HIGH_SCORE_LIMIT }, (_unused, i) => 1400 - i * 100),
    );
  });

  it('stays capped as runs pile up across modes', () => {
    let data = createSaveData(0);
    for (let i = 0; i < HIGH_SCORE_LIMIT + 4; i += 1) {
      data = recordRun(data, runWith({ score: (i + 1) * 50, modeId: i % 2 === 0 ? FIRST : SECOND }), i);
    }

    expect(data.highScores.length).toBe(HIGH_SCORE_LIMIT);
    expect(data.highScores[0]?.score).toBe((HIGH_SCORE_LIMIT + 4) * 50);
  });
});

describe('a finished run', () => {
  it('counts the play, and the clear only when the run was won', () => {
    const lost = recordRun(createSaveData(0), runWith({ modeId: SECOND }), 1);
    expect(row(lost, SECOND).plays).toBe(1);
    expect(row(lost, SECOND).clears).toBe(0);
    expect(row(lost, SECOND).unlocked).toBe(true);
    expect(isUnlocked(lost, THIRD)).toBe(false);

    const won = recordRun(lost, runWith({ modeId: SECOND, won: true }), 2);
    expect(row(won, SECOND).plays).toBe(2);
    expect(row(won, SECOND).clears).toBe(1);
    expect(isUnlocked(won, THIRD)).toBe(true);
  });

  it('opens the mode after the one that was cleared, and remembers a record', () => {
    const data = recordRun(createSaveData(0), runWith({ won: true, score: 4200, lines: 20, level: 5, seconds: 133.5, seed: 0x0a1b2c3d }), 9);

    expect(row(data, FIRST)).toEqual({
      unlocked: true,
      plays: 1,
      clears: 1,
      best: { score: 4200, lines: 20, level: 5, seconds: 133.5 },
      lastSeed: seedToString(0x0a1b2c3d),
    });
    expect(data.highScores).toEqual([
      { score: 4200, lines: 20, level: 5, seconds: 133.5, modeId: FIRST, at: 9 },
    ]);
  });

  it('keeps the standing record, and does not call a tie a record', () => {
    const first = recordRun(createSaveData(0), runWith({ score: 1000 }), 1);
    const lower = recordRun(first, runWith({ score: 500 }), 2);

    expect(row(lower, FIRST).best?.score).toBe(1000);
    expect(row(lower, FIRST).plays).toBe(2);
    expect(lower.highScores.length).toBe(2);

    expect(isBest(first, runWith({ score: 1000 }))).toBe(false);
    expect(isBest(first, runWith({ score: 1001 }))).toBe(true);
    expect(isBest(first, runWith({ modeId: SECOND, score: 1 }))).toBe(true);
    expect(isBest(lower, runWith({ score: 999 }))).toBe(false);
  });

  it('derives unlocks from clears rather than trusting what was stored', () => {
    const data = withUnlocks({
      ...createSaveData(0),
      progress: {
        [FIRST]: { unlocked: false, plays: 4, clears: 1, best: null, lastSeed: '' },
      },
    });

    expect(unlockedOf(data)).toEqual(MODES.map((_mode, index) => index <= 1));
  });

  it('keeps a mode unlocked once it has been opened', () => {
    const data = withUnlocks({
      ...createSaveData(0),
      progress: {
        [THIRD]: { unlocked: true, plays: 0, clears: 0, best: null, lastSeed: '' },
      },
    });

    expect(isUnlocked(data, THIRD)).toBe(true);
    expect(isUnlocked(data, modeAt(3))).toBe(false);
  });
});

describe('resetting progress', () => {
  it('keeps what the player set up and drops what they earned', () => {
    const earned = recordRun(
      {
        ...createSaveData(0),
        settings: { ...DEFAULT_SETTINGS, ghost: false, difficulty: 3 },
        assist: { ...DEFAULT_ASSIST, infiniteThinking: true },
        audio: { ...DEFAULT_AUDIO, muted: true },
        bindings: { ...DEFAULT_BINDINGS, hold: ['KeyJ'] },
      },
      runWith({ won: true }),
      10,
    );

    const wiped = clearedProgress(earned, 20);

    expect(wiped.settings).toEqual(earned.settings);
    expect(wiped.assist).toEqual(earned.assist);
    expect(wiped.audio).toEqual(earned.audio);
    expect(wiped.bindings).toEqual(earned.bindings);
    expect(wiped.version).toBe(earned.version);
    expect(wiped.updatedAt).toBe(20);

    expect(wiped.highScores).toEqual([]);
    expect(unlockedOf(wiped)).toEqual(MODES.map((_mode, index) => index === 0));
    expect(MODES.every((mode) => row(wiped, mode.id).plays === 0)).toBe(true);
  });

  it('is offered by the store, and writes through on its clock', () => {
    const clock = 1_700_000_000_000;
    const kv = new FakeStorage();
    const store = openSaveStore({ kv, now: () => clock });
    expect(store.data.updatedAt).toBe(clock);

    store.update((data) => ({ ...data, settings: { ...data.settings, screenShake: false } }));
    store.update((data) => recordRun(data, runWith({ won: true }), clock));
    store.flush();
    expect(store.data.highScores.length).toBe(1);

    store.resetProgress();
    expect(store.flush().updatedAt).toBe(clock);

    expect(store.data.settings.screenShake).toBe(false);
    expect(store.data.highScores).toEqual([]);
    expect(kv.writes).toBe(2);
    expect(kv.read().highScores).toEqual([]);
    expect(kv.read().settings.screenShake).toBe(false);
  });
});

describe('the save store', () => {
  it('queues changes and writes once when the debounce elapses', () => {
    vi.useFakeTimers();
    const kv = new FakeStorage();
    const store = openSaveStore({ kv, now: () => 0 });

    store.update((data) => ({ ...data, settings: { ...data.settings, ghost: false } }));
    store.update((data) => ({ ...data, settings: { ...data.settings, hold: false } }));

    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(kv.writes).toBe(0);

    vi.advanceTimersByTime(1);
    expect(kv.writes).toBe(1);
    expect(kv.read().settings.ghost).toBe(false);
    expect(kv.read().settings.hold).toBe(false);
  });

  it('writes immediately on flush and cancels the queued write', () => {
    vi.useFakeTimers();
    const kv = new FakeStorage();
    const store = openSaveStore({ kv, now: () => 0 });

    store.update((data) => ({ ...data, audio: { ...data.audio, master: 0.125 } }));
    expect(store.flush()).toEqual(store.data);
    expect(kv.writes).toBe(1);
    expect(kv.read().audio.master).toBe(0.125);

    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(kv.writes).toBe(1);
  });

  it('reopens where the last session left off', () => {
    const kv = new FakeStorage();
    const first = openSaveStore({ kv, now: () => 11 });
    first.update((data) => ({
      ...data,
      settings: { ...data.settings, difficulty: 4, nextCount: 1 },
      assist: { ...data.assist, infiniteThinking: true },
    }));
    first.update((data) => recordRun(data, runWith({ modeId: SECOND, won: true }), 12));
    first.flush();

    const second = openSaveStore({ kv, now: () => 22 });

    expect(second.data.settings).toEqual(first.data.settings);
    expect(second.data.settings).not.toEqual(DEFAULT_SETTINGS);
    expect(second.data.assist.infiniteThinking).toBe(true);
    expect(second.data.bindings).toEqual(first.data.bindings);
    expect(row(second.data, SECOND).plays).toBe(1);
    expect(row(second.data, SECOND).clears).toBe(1);
    expect(second.data.highScores.length).toBe(1);
    expect(unlockedOf(second.data)).toEqual(unlockedOf(first.data));
  });

  it('stays in memory when storage refuses the write', () => {
    const kv = new FakeStorage();
    const failure = new Error('quota exceeded');
    kv.refuse = failure;
    const warnings: Array<[string, unknown]> = [];
    const store = openSaveStore({ kv, now: () => 0, onWarn: (where, error) => warnings.push([where, error]) });

    expect(store.persisted).toBe(true);
    const next = store.update((data) => ({ ...data, settings: { ...data.settings, ghost: false } }));
    store.flush();

    expect(store.persisted).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]?.[0]).toBe('save');
    expect(warnings[0]?.[1]).toBe(failure);
    expect(kv.payload()).toBeNull();
    // The game keeps running on the in-memory copy.
    expect(next.settings.ghost).toBe(false);
    expect(store.data.settings.ghost).toBe(false);
  });

  it('still works with no storage at all', () => {
    const store = openSaveStore({ kv: null });

    expect(store.persisted).toBe(false);
    store.update((data) => ({ ...data, audio: { ...data.audio, master: 0.25 } }));

    expect(() => store.flush()).not.toThrow();
    expect(store.data.audio.master).toBe(0.25);
  });

  it('uses the browser storage it finds, and keeps playing when that throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const withGlobal = (storage: KeyValue, body: () => void): void => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: storage,
      });
      try {
        body();
      } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
        else delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    };

    const kv = new FakeStorage();
    withGlobal(kv, () => {
      const first = openSaveStore();
      expect(first.persisted).toBe(true);
      first.update((data) => ({ ...data, settings: { ...data.settings, nextCount: 1 } }));
      first.flush();

      expect(openSaveStore().data.settings.nextCount).toBe(1);
    });

    const blocked = new FakeStorage();
    blocked.getItem = (): string => {
      throw new Error('storage is blocked');
    };
    withGlobal(blocked, () => {
      const store = openSaveStore();

      expect(store.persisted).toBe(false);
      store.update((data) => ({ ...data, settings: { ...data.settings, ghost: false } }));
      expect(store.flush().settings.ghost).toBe(false);
      expect(blocked.writes).toBe(0);
    });
  });

  it('starts from defaults when storage itself throws on read', () => {
    const kv = new FakeStorage();
    kv.getItem = (): string => {
      throw new Error('storage disabled');
    };

    const loaded = loadSaveData(kv, 60);

    expect(loaded.corrupt).toBe(false);
    expect(loaded.data).toEqual(createSaveData(60));
  });

  it('flushes before the page is hidden', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener');
    const handlers = new Map<string, Array<() => void>>();
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: (type: string, handler: () => void) => {
        handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      },
    });
    try {
      const kv = new FakeStorage();
      const scheduled: Array<() => void> = [];
      const store = openSaveStore({ kv, now: () => 0, schedule: (write) => scheduled.push(write) });

      store.update((data) => ({ ...data, settings: { ...data.settings, showScore: true } }));
      expect(kv.writes).toBe(0);
      expect([...handlers.keys()].sort()).toEqual(['pagehide', 'visibilitychange']);

      for (const handler of handlers.get('pagehide') ?? []) handler();
      expect(kv.writes).toBe(1);
      expect(kv.read().settings.showScore).toBe(true);

      for (const handler of handlers.get('visibilitychange') ?? []) handler();
      expect(kv.writes).toBe(2);
    } finally {
      if (original) Object.defineProperty(globalThis, 'addEventListener', original);
      else delete (globalThis as { addEventListener?: unknown }).addEventListener;
    }
  });
});
