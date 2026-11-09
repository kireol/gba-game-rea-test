import type { GameStatus, Intent, SfxName } from '../engine/types.js';
import { createSaveData, type SaveData } from '../gameplay/persistence.js';
import { createScenes, type SceneHost, type SceneId, type Scenes } from '../ui/scenes.js';
import { MODES } from '../modes/registry.js';

/**
 * Shared harness for the scene suites.
 *
 * `SceneHost` is the only door the scene machine has to the outside world, so a
 * recording stub turns every screen — and every persistence write it triggers —
 * into an assertable call list without a DOM, a clock, or storage. That is the
 * same seam the app uses, so nothing here needs a test-only back door.
 */
export interface Harness {
  readonly scenes: Scenes;
  readonly sfxNames: SfxName[];
  readonly statuses: GameStatus[];
  readonly commits: SaveData[];
  readonly announcements: string[];
  /** The record the scenes last committed, or the initial one if nothing changed. */
  saved(): SaveData;
  /** Every drawn string on the live screen, in draw order. */
  texts(): string[];
  /** Those strings joined the way the browser suite joins them. */
  text(): string;
  shows(want: string): boolean;
  count(want: string): number;
  /** Key down then up, as the browser layer delivers a real tap. */
  press(intent: Intent, player?: 1 | 2): boolean;
  pressN(intent: Intent, times: number, player?: 1 | 2): void;
  /** Moves the current screen's cursor to `index`; every cursor starts at 0. */
  moveTo(index: number): void;
  confirm(): boolean;
  back(): boolean;
  setPersisted(on: boolean): void;
  setClock(ms: number): void;
  clearLog(): void;
}

export const makeHarness = (initial: SaveData = createSaveData(0)): Harness => {
  const sfxNames: SfxName[] = [];
  const statuses: GameStatus[] = [];
  const commits: SaveData[] = [];
  const announcements: string[] = [];
  let persisted = true;
  let clock = 0;

  const host: SceneHost = {
    sfx: (name) => {
      sfxNames.push(name);
    },
    status: (status) => {
      statuses.push(status);
    },
    commit: (data) => {
      commits.push(data);
    },
    announce: (text) => {
      announcements.push(text);
    },
    persisted: () => persisted,
    now: () => clock,
  };

  const scenes = createScenes(host, initial);

  const texts = (): string[] => scenes.frame().texts?.map((call) => call.text) ?? [];
  const press = (intent: Intent, player?: 1 | 2): boolean => {
    const handled = scenes.intent(intent, true, player);
    scenes.intent(intent, false, player);
    return handled;
  };

  return {
    scenes,
    sfxNames,
    statuses,
    commits,
    announcements,
    saved: () => commits.at(-1) ?? initial,
    texts,
    text: () => texts().join(' | '),
    shows: (want) => texts().includes(want),
    count: (want) => texts().filter((text) => text === want).length,
    press,
    pressN: (intent, times, player) => {
      for (let i = 0; i < times; i += 1) press(intent, player);
    },
    moveTo: (index) => {
      for (let i = 0; i < index; i += 1) press('down');
    },
    confirm: () => press('confirm'),
    back: () => press('back'),
    setPersisted: (on) => {
      persisted = on;
    },
    setClock: (ms) => {
      clock = ms;
    },
    clearLog: () => {
      sfxNames.length = 0;
      statuses.length = 0;
      commits.length = 0;
      announcements.length = 0;
    },
  };
};

/**
 * A record where every mode is playable. The unlock chain itself is pinned in
 * `persistence.test.ts`; screens behind it (the versus mode is last in the list)
 * would otherwise need five cleared runs before a single assertion could run.
 */
export const unlockAll = (base: SaveData = createSaveData(0)): SaveData => ({
  ...base,
  progress: Object.fromEntries(
    Object.entries(base.progress).map(([id, row]) => [id, { ...row, unlocked: true }]),
  ),
});

/** Title → mode list, cursor parked on `index`. */
export const openModeList = (h: Harness, index = 0): void => {
  h.confirm();
  h.moveTo(index);
};

/** Title → mode list → rules card for `index`, without starting the run. */
export const openRules = (h: Harness, index: number): void => {
  openModeList(h, index);
  h.confirm();
};

/** Title → mode list → rules → START RUN, countdown and all. */
export const startMode = (h: Harness, index: number): void => {
  openRules(h, index);
  h.confirm();
};

export const modeIndex = (id: string): number => {
  const index = MODES.findIndex((mode) => mode.id === id);
  if (index < 0) throw new Error(`no mode id "${id}"`);
  return index;
};

export const sceneOf = (h: Harness): SceneId => h.scenes.scene;
