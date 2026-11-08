import type { GameConfig } from '../engine/config.js';
import { DEFAULT_CONFIG } from '../engine/config.js';
import type { Assist, AudioPrefs, SaveData, Settings } from '../gameplay/persistence.js';
import { clamp01 } from '../gameplay/persistence.js';
import { difficultyLabel, formatPercent, yesNo } from './format.js';

/**
 * The options screen is data, not hand-drawn rows: each row declares how to read
 * and change one preference, so the screen, the tests and (later) the pointer hit
 * areas all agree on the same table.
 *
 * Nothing here renders or touches storage — a row reads and returns a value, and
 * `src/ui/scenes.ts` decides when to persist it.
 */

/** The slice of the save file the options screen owns. */
export interface Prefs {
  readonly settings: Settings;
  readonly assist: Assist;
  readonly audio: AudioPrefs;
}

export type OptionKind = 'toggle' | 'cycle' | 'slider' | 'action';

export interface OptionRow {
  readonly id: string;
  readonly label: string;
  readonly kind: OptionKind;
  readonly group: string;
  /** Drawn as the second line when the row is focused. */
  readonly hint: string;
  /** Actions do not take a value; `reset-progress` asks first. */
  readonly destructive?: true;
}

/** One volume/toggle step, kept off the float dust (`0.30000000000000004`). */
const SLIDER_STEP = 0.05;

/**
 * `session.ts` locks with `landedTimer > config.lockDelayFrames`, so "never" is a
 * very large finite number: ~2.7 minutes per landed piece, no `Infinity` in the
 * digest or in serialised config.
 */
export const INFINITE_LOCK_DELAY = 9999;

export const OPTION_ROWS: readonly OptionRow[] = [
  {
    id: 'ghost',
    label: 'GHOST PIECE',
    kind: 'toggle',
    group: 'GAMEPLAY',
    hint: 'SHOW WHERE THE PIECE WILL LAND',
  },
  {
    id: 'hold',
    label: 'HOLD SLOT',
    kind: 'toggle',
    group: 'GAMEPLAY',
    hint: 'PARK ONE PIECE FOR LATER',
  },
  {
    id: 'nextCount',
    label: 'NEXT PIECES',
    kind: 'cycle',
    group: 'GAMEPLAY',
    hint: 'HOW MANY UPCOMING PIECES ARE VISIBLE',
  },
  {
    id: 'showScore',
    label: 'SCORE DURING PLAY',
    kind: 'toggle',
    group: 'GAMEPLAY',
    hint: 'THE GOAL IS THE MAIN HUD; SCORE IS OPTIONAL',
  },
  {
    id: 'difficulty',
    label: 'DIFFICULTY',
    kind: 'cycle',
    group: 'GAMEPLAY',
    hint: 'FALL SPEED MULTIPLIER. PICK YOUR OWN',
  },
  {
    id: 'screenShake',
    label: 'SCREEN SHAKE',
    kind: 'toggle',
    group: 'DISPLAY',
    hint: 'PUSH THE STACK A FEW PIXELS ON A CLEAR',
  },
  {
    id: 'showRules',
    label: 'RULES CARD',
    kind: 'toggle',
    group: 'DISPLAY',
    hint: 'SHOW HOW A MODE WORKS BEFORE THE COUNTDOWN',
  },
  {
    id: 'master',
    label: 'MASTER VOLUME',
    kind: 'slider',
    group: 'SOUND',
    hint: 'CLICK THE BAR OR USE LEFT AND RIGHT',
  },
  {
    id: 'music',
    label: 'MUSIC',
    kind: 'slider',
    group: 'SOUND',
    hint: 'THE LOOP ONLY PLAYS DURING A RUN',
  },
  {
    id: 'sfx',
    label: 'EFFECTS',
    kind: 'slider',
    group: 'SOUND',
    hint: 'MOVES, SPLITS, LOCKS, MENUS',
  },
  {
    id: 'muted',
    label: 'MUTE',
    kind: 'toggle',
    group: 'SOUND',
    hint: 'SILENCE EVERYTHING WITHOUT CHANGING LEVELS',
  },
  {
    id: 'infiniteThinking',
    label: 'NO LOCK TIMER',
    kind: 'toggle',
    group: 'ACCESSIBILITY',
    hint: 'A LANDED PIECE WAITS FOR YOU INDEFINITELY',
  },
  {
    id: 'bindings',
    label: 'CONTROLS',
    kind: 'action',
    group: 'SYSTEM',
    hint: 'REASSIGN ANY KEY, OR RESTORE THE DEFAULTS',
  },
  {
    id: 'reset-progress',
    label: 'ERASE RECORDS',
    kind: 'action',
    group: 'SYSTEM',
    hint: 'DELETES HIGH SCORES, RECORDS AND UNLOCKS',
    destructive: true,
  },
];

export const optionById = (id: string): OptionRow | undefined =>
  OPTION_ROWS.find((row) => row.id === id);

export const prefsOf = (data: SaveData): Prefs => ({
  settings: data.settings,
  assist: data.assist,
  audio: data.audio,
});

export const applyPrefs = (data: SaveData, prefs: Prefs): SaveData => ({
  ...data,
  settings: prefs.settings,
  assist: prefs.assist,
  audio: prefs.audio,
});

const cycle = (value: number, min: number, max: number, dir: number): number => {
  const span = max - min + 1;
  const offset = (((value - min + dir) % span) + span) % span;
  return min + offset;
};

const round2 = (value: number): number => Math.round(clamp01(value) * 100) / 100;

const volume = (prefs: Prefs, id: string): number =>
  id === 'master' ? prefs.audio.master : id === 'music' ? prefs.audio.music : prefs.audio.sfx;

const withVolume = (prefs: Prefs, id: string, value: number): Prefs => ({
  ...prefs,
  audio: { ...prefs.audio, [id]: round2(value) },
});

const withToggle = (prefs: Prefs, id: string, on: boolean): Prefs => {
  switch (id) {
    case 'ghost':
      return { ...prefs, settings: { ...prefs.settings, ghost: on } };
    case 'hold':
      return { ...prefs, settings: { ...prefs.settings, hold: on } };
    case 'showScore':
      return { ...prefs, settings: { ...prefs.settings, showScore: on } };
    case 'screenShake':
      return { ...prefs, settings: { ...prefs.settings, screenShake: on } };
    case 'showRules':
      return { ...prefs, settings: { ...prefs.settings, showRules: on } };
    case 'muted':
      return { ...prefs, audio: { ...prefs.audio, muted: on } };
    case 'infiniteThinking':
      return { ...prefs, assist: { ...prefs.assist, infiniteThinking: on } };
    default:
      return prefs;
  }
};

/** The value drawn to the right of a row; empty for actions. */
export const optionValue = (row: OptionRow, prefs: Prefs): string => {
  switch (row.kind) {
    case 'toggle':
      return yesNo(
        row.id === 'muted'
          ? prefs.audio.muted
          : row.id === 'infiniteThinking'
            ? prefs.assist.infiniteThinking
            : (prefs.settings[row.id as keyof Settings] as boolean),
      );
    case 'cycle':
      return row.id === 'difficulty'
        ? difficultyLabel(prefs.settings.difficulty)
        : `${prefs.settings.nextCount}`;
    case 'slider':
      return formatPercent(volume(prefs, row.id));
    case 'action':
      return '';
  }
};

/** `dir` is -1 / +1 (cursor keys, mouse buttons, or either half of the row). */
export const stepOption = (row: OptionRow, prefs: Prefs, dir: number): Prefs => {
  const step = dir < 0 ? -1 : 1;
  switch (row.kind) {
    case 'toggle':
      return withToggle(prefs, row.id, !isOn(row, prefs));
    case 'cycle':
      return row.id === 'difficulty'
        ? {
            ...prefs,
            settings: {
              ...prefs.settings,
              difficulty: cycle(prefs.settings.difficulty, 1, 4, step) as Settings['difficulty'],
            },
          }
        : {
            ...prefs,
            settings: { ...prefs.settings, nextCount: cycle(prefs.settings.nextCount, 1, 5, step) },
          };
    case 'slider':
      return withVolume(prefs, row.id, volume(prefs, row.id) + step * SLIDER_STEP);
    case 'action':
      return prefs;
  }
};

export const isOn = (row: OptionRow, prefs: Prefs): boolean =>
  row.id === 'muted'
    ? prefs.audio.muted
    : row.id === 'infiniteThinking'
      ? prefs.assist.infiniteThinking
      : Boolean(prefs.settings[row.id as keyof Settings]);

/** Absolute positioning, for a click on the bar itself. */
export const setSlider = (row: OptionRow, prefs: Prefs, ratio: number): Prefs =>
  row.kind === 'slider' ? withVolume(prefs, row.id, ratio) : prefs;

/**
 * Settings and accessibility into a playable rules configuration. The rules core
 * never reads the save file, so this is the only bridge between the two.
 */
export const configFor = (
  settings: Settings,
  assist: Assist,
  base: GameConfig = DEFAULT_CONFIG,
): GameConfig => ({
  ...base,
  ghost: settings.ghost,
  hold: settings.hold,
  queueLength: settings.nextCount,
  lockDelayFrames: assist.infiniteThinking ? INFINITE_LOCK_DELAY : base.lockDelayFrames,
});
