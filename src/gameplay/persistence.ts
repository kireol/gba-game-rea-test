import type { Difficulty } from '../engine/types.js';
import { isDifficulty } from '../engine/config.js';
import { seedToString } from '../engine/random.js';
import {
  DEFAULT_BINDINGS,
  cloneBindings,
  normalizeBindings,
  type Bindings,
} from '../engine/bindings.js';
import { MODES } from '../modes/registry.js';

/**
 * Everything that outlives a run, in one versioned blob.
 *
 * Rules for this module: never throw at the caller (storage can be blocked, full,
 * or hold a payload from a future build), always keep the raw payload when it
 * cannot be understood, and treat the in-memory copy as authoritative so the game
 * still works where `localStorage` is denied.
 */

export const SAVE_KEY = 'orbitdrop.save.v1';
export const CORRUPT_KEY = `${SAVE_KEY}.corrupt`;
export const SAVE_VERSION = 1;
/** High-score table size, across all modes. */
export const HIGH_SCORE_LIMIT = 10;

export interface AudioPrefs {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly muted: boolean;
}

export interface Settings {
  /** Landing projection. Mirrors `GameConfig.ghost`. */
  readonly ghost: boolean;
  /** Hold slot. Mirrors `GameConfig.hold`. */
  readonly hold: boolean;
  /** Pieces shown in the next queue. Mirrors `GameConfig.queueLength`. */
  readonly nextCount: number;
  /**
   * Draw a score row during play. The reference HUD has none — it shows the goal
   * and level instead — so this is off by default and only the results screen and
   * the high-score table ever have to show a score.
   */
  readonly showScore: boolean;
  readonly difficulty: Difficulty;
  readonly screenShake: boolean;
  /** Show a mode's rules card before the countdown. */
  readonly showRules: boolean;
}

export interface Assist {
  /**
   * Never lock a landed piece, so there is no time pressure to move it. Applied by
   * raising `lockDelayFrames`, which the core already honours.
   */
  readonly infiniteThinking: boolean;
}

export interface BestRun {
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly seconds: number;
}

export interface ModeProgress {
  readonly unlocked: boolean;
  readonly plays: number;
  readonly clears: number;
  readonly best: BestRun | null;
  readonly lastSeed: string;
}

export interface ScoreEntry extends BestRun {
  readonly modeId: string;
  readonly at: number;
}

export interface SaveData {
  readonly version: number;
  readonly settings: Settings;
  readonly assist: Assist;
  readonly audio: AudioPrefs;
  readonly bindings: Bindings;
  readonly progress: Readonly<Record<string, ModeProgress>>;
  readonly highScores: readonly ScoreEntry[];
  readonly updatedAt: number;
}

export interface RunSummary {
  readonly modeId: string;
  readonly won: boolean;
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly seconds: number;
  readonly seed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  ghost: true,
  hold: true,
  nextCount: 3,
  showScore: false,
  difficulty: 2,
  screenShake: true,
  showRules: true,
};

export const DEFAULT_ASSIST: Assist = { infiniteThinking: false };

export const DEFAULT_AUDIO: AudioPrefs = {
  master: 0.8,
  music: 0.55,
  sfx: 0.75,
  muted: false,
};

export const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export const emptyProgress = (): ModeProgress => ({
  unlocked: false,
  plays: 0,
  clears: 0,
  best: null,
  lastSeed: '',
});

const numberOr = (raw: unknown, fallback: number): number =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;

const booleanOr = (raw: unknown, fallback: boolean): boolean =>
  typeof raw === 'boolean' ? raw : fallback;

const intOr = (raw: unknown, fallback: number, min: number, max: number): number => {
  const value = Math.trunc(numberOr(raw, fallback));
  return Math.min(max, Math.max(min, value));
};

const settingsFrom = (raw: unknown): Settings => {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const fallback = DEFAULT_SETTINGS;
  return {
    ghost: booleanOr(src.ghost, fallback.ghost),
    hold: booleanOr(src.hold, fallback.hold),
    nextCount: intOr(src.nextCount, fallback.nextCount, 1, 5),
    showScore: booleanOr(src.showScore, fallback.showScore),
    difficulty: isDifficulty(src.difficulty) ? src.difficulty : fallback.difficulty,
    screenShake: booleanOr(src.screenShake, fallback.screenShake),
    showRules: booleanOr(src.showRules, fallback.showRules),
  };
};

const assistFrom = (raw: unknown): Assist => {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return { infiniteThinking: booleanOr(src.infiniteThinking, DEFAULT_ASSIST.infiniteThinking) };
};

const audioFrom = (raw: unknown): AudioPrefs => {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const fallback = DEFAULT_AUDIO;
  return {
    master: clamp01(numberOr(src.master, fallback.master)),
    music: clamp01(numberOr(src.music, fallback.music)),
    sfx: clamp01(numberOr(src.sfx, fallback.sfx)),
    muted: booleanOr(src.muted, fallback.muted),
  };
};

const bestFrom = (raw: unknown): BestRun | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const src = raw as Record<string, unknown>;
  const score = Math.max(0, Math.trunc(numberOr(src.score, 0)));
  if (score === 0) return null;
  return {
    score,
    lines: Math.max(0, Math.trunc(numberOr(src.lines, 0))),
    level: Math.max(1, Math.trunc(numberOr(src.level, 1))),
    seconds: Math.max(0, numberOr(src.seconds, 0)),
  };
};

const progressFrom = (raw: unknown): Record<string, ModeProgress> => {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Record<string, ModeProgress> = {};
  for (const mode of MODES) {
    const value = src[mode.id];
    if (typeof value !== 'object' || value === null) continue;
    const row = value as Record<string, unknown>;
    out[mode.id] = {
      unlocked: booleanOr(row.unlocked, false),
      plays: Math.max(0, Math.trunc(numberOr(row.plays, 0))),
      clears: Math.max(0, Math.trunc(numberOr(row.clears, 0))),
      best: bestFrom(row.best),
      lastSeed: typeof row.lastSeed === 'string' ? row.lastSeed : '',
    };
  }
  return out;
};

const highScoresFrom = (raw: unknown): ScoreEntry[] => {
  if (!Array.isArray(raw)) return [];
  const out: ScoreEntry[] = [];
  for (const value of raw) {
    if (typeof value !== 'object' || value === null) continue;
    const src = value as Record<string, unknown>;
    const best = bestFrom(src);
    if (!best) continue;
    const modeId = typeof src.modeId === 'string' ? src.modeId : '';
    if (!modeId) continue;
    out.push({ ...best, modeId, at: Math.max(0, Math.trunc(numberOr(src.at, 0))) });
  }
  return orderScores(out).slice(0, HIGH_SCORE_LIMIT);
};

const orderScores = (entries: readonly ScoreEntry[]): ScoreEntry[] =>
  [...entries].sort((a, b) => b.score - a.score || b.lines - a.lines);

/**
 * The first mode is always playable; each later one opens when the mode before it
 * has been cleared at least once. Sticky, so a cleared run never re-locks a mode.
 */
export const withUnlocks = (data: SaveData): SaveData => {
  const progress: Record<string, ModeProgress> = { ...data.progress };
  MODES.forEach((mode, index) => {
    const current = progress[mode.id] ?? emptyProgress();
    const predecessorId = index > 0 ? MODES[index - 1]?.id : undefined;
    const openedByChain =
      predecessorId === undefined || (progress[predecessorId]?.clears ?? 0) > 0;
    progress[mode.id] = {
      ...current,
      unlocked: current.unlocked || openedByChain,
    };
  });
  return { ...data, progress };
};

export const createSaveData = (now = 0): SaveData =>
  withUnlocks({
    version: SAVE_VERSION,
    settings: DEFAULT_SETTINGS,
    assist: DEFAULT_ASSIST,
    audio: DEFAULT_AUDIO,
    bindings: cloneBindings(DEFAULT_BINDINGS),
    progress: {},
    highScores: [],
    updatedAt: now,
  });

/** Normalises any parsed payload into a full, valid record. */
export const normalizeSaveData = (raw: unknown, now = 0): SaveData => {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return withUnlocks({
    version: SAVE_VERSION,
    settings: settingsFrom(src.settings),
    assist: assistFrom(src.assist),
    audio: audioFrom(src.audio),
    bindings: normalizeBindings(src.bindings),
    progress: progressFrom(src.progress),
    highScores: highScoresFrom(src.highScores),
    updatedAt: Math.max(0, Math.trunc(numberOr(src.updatedAt, now))),
  });
};

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface LoadResult {
  readonly data: SaveData;
  /** A payload existed but could not be understood; it was kept under `CORRUPT_KEY`. */
  readonly corrupt: boolean;
}

const globalStorage = (): KeyValue | null => {
  try {
    const holder = (globalThis as { localStorage?: KeyValue }).localStorage;
    if (!holder) return null;
    // Touch it: Safari throws on access itself in some private modes.
    holder.getItem(`${SAVE_KEY}.probe`);
    return holder;
  } catch {
    return null;
  }
};

/** Read-and-normalise only. Never writes, unless a bad payload needs preserving. */
export const loadSaveData = (
  kv: KeyValue | null = globalStorage(),
  now = Date.now(),
): LoadResult => {
  if (!kv) return { data: createSaveData(now), corrupt: false };
  let raw: string | null = null;
  try {
    raw = kv.getItem(SAVE_KEY);
  } catch {
    return { data: createSaveData(now), corrupt: false };
  }
  if (raw === null) return { data: createSaveData(now), corrupt: false };
  const keepAside = (): void => {
    try {
      kv.setItem(CORRUPT_KEY, raw ?? '');
    } catch {
      // Nowhere to keep it. The fresh record below still stands.
    }
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    keepAside();
    return { data: createSaveData(now), corrupt: true };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    keepAside();
    return { data: createSaveData(now), corrupt: true };
  }
  const version = (parsed as Record<string, unknown>).version;
  if (typeof version === 'number' && version > SAVE_VERSION) {
    // Newer than this build: do not guess the schema, and do not destroy it.
    keepAside();
    return { data: createSaveData(now), corrupt: true };
  }
  return { data: normalizeSaveData(parsed, now), corrupt: false };
};

export const serializeSaveData = (data: SaveData): string => JSON.stringify({ ...data, version: SAVE_VERSION });

export interface ProgressInfo {
  readonly progress: ModeProgress;
  readonly locked: boolean;
}

export const progressFor = (data: SaveData, modeId: string): ModeProgress =>
  data.progress[modeId] ?? emptyProgress();

export const isUnlocked = (data: SaveData, modeId: string): boolean =>
  progressFor(data, modeId).unlocked;

/** True when this run would beat the mode's own record — the results banner. */
export const isBest = (data: SaveData, run: RunSummary): boolean => {
  const best = progressFor(data, run.modeId).best;
  return best === null || run.score > best.score;
};

/** Updates a mode's record, the high-score table, and the unlock chain. */
export const recordRun = (data: SaveData, run: RunSummary, now = Date.now()): SaveData => {
  const current = progressFor(data, run.modeId);
  const score = Math.max(0, Math.trunc(run.score));
  const entry: BestRun = {
    score,
    lines: Math.max(0, Math.trunc(run.lines)),
    level: Math.max(1, Math.trunc(run.level)),
    seconds: Math.max(0, run.seconds),
  };
  const best: BestRun =
    current.best === null || score > current.best.score
      ? entry
      : current.best;
  const progress: Record<string, ModeProgress> = {
    ...data.progress,
    [run.modeId]: {
      ...current,
      unlocked: true,
      plays: current.plays + 1,
      clears: current.clears + (run.won ? 1 : 0),
      best,
      lastSeed: seedToString(run.seed),
    },
  };
  const index = MODES.findIndex((mode) => mode.id === run.modeId);
  const nextMode = index >= 0 ? MODES[index + 1] : undefined;
  if (run.won && nextMode) {
    const opened = progress[nextMode.id] ?? emptyProgress();
    progress[nextMode.id] = { ...opened, unlocked: true };
  }
  const scores = orderScores([
    ...data.highScores,
    { ...entry, modeId: run.modeId, at: now },
  ]).slice(0, HIGH_SCORE_LIMIT);
  return withUnlocks({ ...data, progress, highScores: scores, updatedAt: now });
};

/** Keeps settings, assist, audio and bindings; drops every record and unlock. */
export const clearedProgress = (data: SaveData, now = Date.now()): SaveData =>
  withUnlocks({ ...data, progress: {}, highScores: [], updatedAt: now });

export interface StoreOpts {
  readonly kv?: KeyValue | null;
  readonly now?: () => number;
  /** Debounce hook, injectable so tests do not need timers. */
  readonly schedule?: (write: () => void) => void;
  readonly onWarn?: (where: string, error: unknown) => void;
}

export interface SaveStore {
  readonly data: SaveData;
  /** False when storage is unavailable or unwritable; the game keeps running. */
  readonly persisted: boolean;
  update(mutate: (data: SaveData) => SaveData): SaveData;
  /** Writes through immediately (settings changes, results screen, page hide). */
  flush(): SaveData;
  resetProgress(): SaveData;
}

export const SAVE_DEBOUNCE_MS = 500;

export const openSaveStore = (opts: StoreOpts = {}): SaveStore => {
  const now = opts.now ?? Date.now;
  const onWarn = opts.onWarn ?? (() => undefined);
  const kv = opts.kv !== undefined ? opts.kv : globalStorage();
  const loaded = loadSaveData(kv, now());
  let data = loaded.data;
  let persisted = kv !== null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = (): void => {
    timer = null;
    if (!kv) return;
    try {
      kv.setItem(SAVE_KEY, serializeSaveData(data));
      persisted = true;
    } catch (error) {
      // Private mode or a full quota: stay in memory for this session.
      persisted = false;
      onWarn('save', error);
    }
  };
  const queue = (): void => {
    if (!kv) return;
    if (timer !== null) clearTimeout(timer);
    if (opts.schedule) opts.schedule(write);
    else timer = setTimeout(write, SAVE_DEBOUNCE_MS);
  };
  const commit = (next: SaveData): SaveData => {
    data = next;
    queue();
    return data;
  };

  const store: SaveStore = {
    get data() {
      return data;
    },
    get persisted() {
      return persisted;
    },
    update: (mutate) => commit(mutate(data)),
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      write();
      return data;
    },
    resetProgress() {
      return commit(clearedProgress(data, now()));
    },
  };

  const holder = globalThis as {
    addEventListener?: (type: string, handler: () => void) => void;
  };
  if (kv && typeof holder.addEventListener === 'function') {
    const hide = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      write();
    };
    holder.addEventListener('pagehide', hide);
    holder.addEventListener('visibilitychange', hide);
  }

  return store;
};
