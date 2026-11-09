import { describe, expect, it } from 'vitest';
import type { SaveData } from '../gameplay/persistence.js';
import { BINDABLE_INTENTS, DEFAULT_BINDINGS } from '../engine/bindings.js';
import { makeHarness, type Harness } from './scenes-harness.js';

/**
 * The options screen and the key-bindings editor.
 *
 * Both screens own a slice of the save record, so the interesting question is
 * never "did the label move" but "did the write land, and only where it should".
 * Every test here therefore asserts against the record the scenes committed
 * through the host, plus the one on-screen consequence that proves the value is
 * actually read back (`NEXT PIECES` rows, the ghost preview) rather than merely
 * stored.
 */

/** `OPTION_ROWS` order, spelled out so a row insert has to be a deliberate edit. */
const ROW = {
  ghost: 0,
  hold: 1,
  nextCount: 2,
  showScore: 3,
  difficulty: 4,
  screenShake: 5,
  showRules: 6,
  master: 7,
  music: 8,
  sfx: 9,
  muted: 10,
  infiniteThinking: 11,
  bindings: 12,
  resetProgress: 13,
} as const;

/** Options rows are 11px tall starting at y=25; the panel spans x=8..232. */
const optionY = (row: number): number => 25 + row * 11 + 5;
/** Binding rows are 9px tall from the same y; DONE sits below the last row. */
const bindingY = (row: number): number => 25 + row * 9 + 4;
const DONE = { x: 215, y: 154 };
const RESTORE = { x: 148, y: 154 };

const openOptions = (initial?: SaveData): Harness => {
  const h = makeHarness(initial);
  h.moveTo(2);
  h.confirm();
  expect(h.scenes.scene).toBe('options');
  return h;
};

const openBindings = (initial?: SaveData): Harness => {
  const h = openOptions(initial);
  h.moveTo(ROW.bindings);
  h.confirm();
  expect(h.scenes.scene).toBe('bindings');
  return h;
};

/** Opens row 0 (`MOVE LEFT`) for capture, as a click does. */
const captureRowZero = (h: Harness): void => {
  expect(h.scenes.pointer(120, bindingY(0), 'press')).toBe(true);
};

describe('options screen', () => {
  it('draws every row with the value it loaded', () => {
    const h = openOptions();
    expect(h.shows('OPTIONS')).toBeTruthy();
    expect(h.shows('GHOST PIECE')).toBeTruthy();
    expect(h.shows('CONTROLS')).toBeTruthy();
    expect(h.shows('ERASE RECORDS')).toBeTruthy();
    expect(h.shows('YES')).toBeTruthy();
    expect(h.shows('NO')).toBeTruthy();
    expect(h.shows('EASY')).toBeTruthy();
    expect(h.shows('80%')).toBeTruthy();
  });

  it('commits the record on every change', () => {
    const h = openOptions();
    h.clearLog();
    h.press('right');
    expect(h.commits).toHaveLength(1);
    expect(h.saved().settings.ghost).toBe(false);
    expect(h.shows('NO')).toBeTruthy();
    expect(h.announcements).toEqual(['GHOST PIECE NO']);
    expect(h.sfxNames).toEqual(['menu-move']);
  });

  it('wraps a numeric row at both ends', () => {
    const h = openOptions();
    h.moveTo(ROW.nextCount);
    h.pressN('right', 2);
    expect(h.saved().settings.nextCount).toBe(5);
    h.press('right');
    expect(h.saved().settings.nextCount).toBe(1);
    expect(h.announcements.at(-1)).toBe('NEXT PIECES 1');
    h.press('left');
    expect(h.saved().settings.nextCount).toBe(5);
  });

  it('cycles difficulty through its four labels', () => {
    const h = openOptions();
    h.moveTo(ROW.difficulty);
    for (const label of ['HARD', 'HARDEST', 'EASIEST', 'EASY']) {
      h.press('right');
      expect(h.shows(label)).toBeTruthy();
    }
    expect(h.saved().settings.difficulty).toBe(2);
  });

  it('steps a volume row in 5% slices and clamps at the top', () => {
    const h = openOptions();
    h.moveTo(ROW.master);
    h.pressN('right', 2);
    // `round2` is what keeps the record free of `0.8500000000000001`.
    expect(h.saved().audio.master).toBe(0.9);
    expect(h.shows('90%')).toBeTruthy();
    h.pressN('right', 3);
    expect(h.saved().audio.master).toBe(1);
    expect(h.count('100%')).toBe(1);
  });

  it('silences everything with MUTE without moving the levels', () => {
    const h = openOptions();
    h.moveTo(ROW.muted);
    h.press('right');
    expect(h.saved().audio.muted).toBe(true);
    expect(h.saved().audio.master).toBe(0.8);
    expect(h.sfxNames.at(-1)).toBe('mute');
  });

  it('writes the accessibility row into the assist block, not settings', () => {
    const h = openOptions();
    h.moveTo(ROW.infiniteThinking);
    h.press('right');
    expect(h.saved().assist.infiniteThinking).toBe(true);
    expect(h.saved().settings.ghost).toBe(true);
  });

  it('writes an unchanged record when an action row is nudged', () => {
    const h = makeHarness();
    h.moveTo(2);
    h.confirm();
    const pristine = h.saved();
    h.moveTo(ROW.bindings);
    h.clearLog();
    h.press('right');
    h.press('left');
    expect(h.scenes.scene).toBe('options');
    expect(h.saved().settings).toEqual(pristine.settings);
    // `changeOption` persists whatever `stepOption` returned, and an action row
    // returns the values it was handed: two writes of a record nobody changed.
    expect(h.commits).toHaveLength(2);
    expect(h.saved()).toEqual(pristine);
    // The announce is the label plus the row's value, and an action row has no
    // value, hence the trailing gap.
    expect(h.announcements).toEqual(['CONTROLS ', 'CONTROLS ']);
    expect(h.sfxNames).toEqual(['menu-move', 'menu-move']);
  });

  it('opens the controls editor', () => {
    const h = openOptions();
    h.moveTo(ROW.bindings);
    h.confirm();
    expect(h.scenes.scene).toBe('bindings');
  });

  it('asks before the destructive row does anything', () => {
    const h = openOptions();
    h.moveTo(ROW.resetProgress);
    h.confirm();
    expect(h.scenes.scene).toBe('confirm');
  });

  it('sets a slider from where the bar was clicked', () => {
    const h = openOptions();
    // The bar starts 74px from the panel's right edge and is 42px wide, so the
    // middle of the drawable bar is x=179: half volume.
    expect(h.scenes.pointer(179, optionY(ROW.master), 'press')).toBe(true);
    expect(h.saved().audio.master).toBe(0.5);
    expect(h.shows('50%')).toBeTruthy();
    expect(h.announcements).toContain('MASTER VOLUME 50%');
  });

  it('steps a row in opposite directions from its two halves', () => {
    const h = openOptions();
    expect(h.scenes.pointer(60, optionY(ROW.ghost), 'press')).toBe(true);
    expect(h.saved().settings.ghost).toBe(false);
    expect(h.scenes.pointer(180, optionY(ROW.ghost), 'press')).toBe(true);
    expect(h.saved().settings.ghost).toBe(true);
    expect(h.commits).toHaveLength(2);
  });

  it('moves the cursor on hover, so a later key press lands on that row', () => {
    const h = openOptions();
    expect(h.scenes.pointer(120, optionY(ROW.showScore), 'hover')).toBe(true);
    h.press('right');
    expect(h.saved().settings.showScore).toBe(true);
    expect(h.saved().settings.ghost).toBe(true);
  });

  it('draws its last row below the screen, under the DONE button', () => {
    const h = openOptions();
    // 14 rows of 11px from y=25 runs to y=179 on a 160px screen: ERASE RECORDS is
    // drawn off-panel, and its hit band is unreachable. PROJECT_STATE.md § 6.
    const drawn = h.scenes.frame().texts?.find((call) => call.text === 'ERASE RECORDS');
    expect(drawn?.y).toBeGreaterThanOrEqual(160);
    // The same grid covers DONE (y=149..159), so a click on that button lands on
    // whatever row spans it. Only Escape leaves this screen by pointer.
    expect(h.scenes.pointer(DONE.x, DONE.y, 'press')).toBe(true);
    expect(h.scenes.scene).toBe('options');
    expect(h.saved().assist.infiniteThinking).toBe(true);
  });

  it('reports a click outside the panel as unhandled', () => {
    const h = openOptions();
    // Rows span the whole panel width, so missing one means leaving the panel.
    expect(h.scenes.pointer(2, 60, 'press')).toBe(false);
    expect(h.commits).toEqual([]);
  });
});

describe('the controls editor', () => {
  it('lists every intent with the codes it loaded', () => {
    const h = openBindings();
    expect(h.shows('CONTROLS')).toBeTruthy();
    expect(h.shows('PLAYER 1')).toBeTruthy();
    expect(h.shows('MOVE LEFT')).toBeTruthy();
    expect(h.shows('SOFT DROP')).toBeTruthy();
    // Codes are drawn uppercased, and the two alias slots are joined with a
    // space, so a single-code row draws `ARROWLEFT ` with a trailing gap.
    expect(h.text()).toContain('ARROWLEFT');
    const blanks = BINDABLE_INTENTS.filter((id) => DEFAULT_BINDINGS[id].length === 0);
    // Every intent the editor offers ships with at least one code, so the
    // placeholder a blank row draws never appears here. `bindings.test.ts` pins
    // what a row looks like empty.
    expect(blanks).toEqual([]);
    expect(h.texts().some((t) => t.trim() === '-')).toBe(false);
    expect(h.text()).toContain('ARROWRIGHT');
  });

  it('clicking a row captures the next key', () => {
    const h = openBindings();
    captureRowZero(h);
    expect(h.shows('PRESS A KEY')).toBeTruthy();
    expect(h.shows('PLAYER 1')).toBeFalsy();
  });

  it('lands a fresh code in the record', () => {
    const h = openBindings();
    captureRowZero(h);
    expect(h.scenes.key('KeyQ', true)).toBe(true);
    expect(h.saved().bindings.left).toEqual(['KeyQ']);
    expect(h.announcements).toContain('MOVE LEFT IS NOW KeyQ');
    expect(h.sfxNames).toContain('menu-confirm');
    // Capture is one key, and only the press half is the scene's business.
    expect(h.scenes.key('KeyQ', false)).toBe(false);
  });

  it('binds Backspace, although the row says Backspace clears', () => {
    const h = openBindings();
    captureRowZero(h);
    expect(h.shows('ANY KEY WORKS. BACKSPACE CLEARS')).toBeTruthy();
    // The capture handler special-cases only `Escape`; the key named in its own
    // hint is recorded like any other. PROJECT_STATE.md § 6.
    expect(h.scenes.key('Backspace', true)).toBe(true);
    expect(h.saved().bindings.left).toEqual(['Backspace']);
  });

  it('moves a code out of the row that owned it, leaving that row unbound', () => {
    const h = openBindings();
    captureRowZero(h);
    expect(h.scenes.key('ArrowRight', true)).toBe(true);
    expect(h.saved().bindings.left).toEqual(['ArrowRight']);
    // Nothing warns about this: the announce names only the row being edited, so
    // MOVE RIGHT goes silent with no message. Recorded in PROJECT_STATE.md § 6.
    expect(h.saved().bindings.right).toEqual([]);
    expect(h.shows('PRESS A KEY')).toBeFalsy();
  });

  it('leaves the old table alone when Escape cancels', () => {
    const h = openBindings();
    captureRowZero(h);
    h.clearLog();
    expect(h.scenes.key('Escape', true)).toBe(true);
    expect(h.commits).toEqual([]);
    expect(h.saved().bindings).toEqual(DEFAULT_BINDINGS);
    expect(h.announcements).toEqual(['KEY CAPTURE CANCELLED']);
    expect(h.sfxNames).toEqual(['menu-back']);
    expect(h.scenes.scene).toBe('bindings');
  });

  it('cancels a capture before it steps back out', () => {
    const h = openBindings();
    captureRowZero(h);
    h.clearLog();
    h.back();
    expect(h.scenes.scene).toBe('bindings');
    expect(h.announcements).toEqual(['KEY CAPTURE CANCELLED']);
    expect(h.scenes.key('KeyQ', true)).toBe(false);
  });

  it('swallows any other press while a key is wanted', () => {
    const h = openBindings();
    captureRowZero(h);
    h.clearLog();
    expect(h.scenes.pointer(120, bindingY(5), 'press')).toBe(true);
    expect(h.commits).toEqual([]);
    expect(h.sfxNames).toEqual(['menu-back']);
    expect(h.scenes.scene).toBe('bindings');
  });

  it('Delete commits a table it did not change, and says it reset', () => {
    const h = openBindings();
    captureRowZero(h);
    h.clearLog();
    expect(h.scenes.key('Delete', true)).toBe(true);
    // `unbind` removes one code by name and the scene hands it the word `Delete`,
    // which no row contains, so the row keeps ArrowLeft. The announce and the
    // commit both claim a reset that never happened. PROJECT_STATE.md § 6.
    expect(h.saved().bindings.left).toEqual(['ArrowLeft']);
    expect(h.commits).toHaveLength(1);
    expect(h.announcements).toEqual(['MOVE LEFT RESET TO ITS DEFAULTS']);
  });

  it('RESTORE puts every row back to the factory table', () => {
    const h = openBindings();
    captureRowZero(h);
    h.scenes.key('KeyQ', true);
    expect(h.saved().bindings.left).toEqual(['KeyQ']);
    h.clearLog();
    // y=154 is below the last row's band, which is where the button sits.
    expect(h.scenes.pointer(RESTORE.x, RESTORE.y, 'press')).toBe(true);
    expect(h.saved().bindings).toEqual(DEFAULT_BINDINGS);
    expect(h.commits).toHaveLength(1);
    expect(h.announcements).toEqual(['CONTROLS RESTORED']);
  });

  it('DONE steps back out past OPTIONS, straight to the title', () => {
    const h = openBindings();
    expect(h.scenes.pointer(DONE.x, DONE.y, 'press')).toBe(true);
    // The scene keeps one `optionsReturn` slot, written only when OPTIONS itself
    // opens, so the editor has no idea it was reached through it. Pinned because
    // it is the current contract; see PROJECT_STATE.md § 6.
    expect(h.scenes.scene).toBe('title');
    expect(h.sfxNames).toContain('menu-back');
  });
});
