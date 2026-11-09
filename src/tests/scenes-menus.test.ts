import { describe, expect, it, beforeEach } from 'vitest';
import { createSaveData, recordRun, type RunSummary, type SaveData } from '../gameplay/persistence.js';
import { makeHarness, openModeList, openRules, type Harness } from './scenes-harness.js';

/**
 * Title, mode list, high scores and the erase-records confirmation.
 *
 * These four screens are the whole "the game can be navigated" contract: they own
 * no run, so every one of them is reachable with nothing but a stub host and a
 * cursor. The browser suite walks the same path with real key events; what it
 * cannot do is tell us *which* row was wrong.
 */
const RUN: RunSummary = {
  modeId: 'goal-ladder',
  won: false,
  score: 12_345,
  lines: 9,
  level: 3,
  seconds: 87.5,
  seed: 0x0a0b_0c0d,
};

const saveWithRecord = (): SaveData => recordRun(createSaveData(0), RUN, 1_000);

describe('title screen', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('boots on the title screen and announces it', () => {
    expect(h.scenes.scene).toBe('title');
    expect(h.announcements).toEqual(['ORBIT DROP. TITLE SCREEN']);
    // No run exists yet, so the app gets no status and nothing is written.
    expect(h.statuses).toEqual([]);
    expect(h.commits).toEqual([]);
  });

  it('draws the three rows the brief asks for', () => {
    expect(h.shows('PLAY')).toBeTruthy();
    expect(h.shows('HIGH SCORES')).toBeTruthy();
    expect(h.shows('OPTIONS')).toBeTruthy();
    expect(h.shows('ORBIT DROP')).toBeTruthy();
  });

  it('says where records actually go', () => {
    expect(h.shows('SAVED 0 SCORES')).toBeTruthy();
    h.setPersisted(false);
    expect(h.shows('SAVED 0 SCORES')).toBeFalsy();
    expect(h.shows('SAVES IN MEMORY ONLY')).toBeTruthy();
  });

  it('sends each row to its own screen', () => {
    h.confirm();
    expect(h.scenes.scene).toBe('modes');

    const scores = makeHarness();
    scores.moveTo(1);
    scores.confirm();
    expect(scores.scenes.scene).toBe('scores');

    const options = makeHarness();
    options.moveTo(2);
    options.confirm();
    expect(options.scenes.scene).toBe('options');
    // Options opened from the title has to come back to the title, not the mode list.
    options.back();
    expect(options.scenes.scene).toBe('title');
  });

  it('wraps the cursor past the last row instead of stopping', () => {
    h.pressN('down', 3);
    expect(h.scenes.scene).toBe('title');
    h.confirm();
    expect(h.scenes.scene).toBe('modes');
  });

  it('has nowhere further back to go', () => {
    h.clearLog();
    h.back();
    expect(h.scenes.scene).toBe('title');
    expect(h.announcements).toEqual([]);
    expect(h.sfxNames).toEqual(['menu-back']);
  });
});

describe('mode list', () => {
  it('lists every mode and marks all but the first as locked', () => {
    const h = makeHarness();
    openModeList(h);
    expect(h.shows('ASCENT')).toBeTruthy();
    // The unlock chain opens one mode per clear, so a fresh record shows six locked rows.
    expect(h.count('LOCKED')).toBe(6);
    expect(h.shows('ENTER RULES')).toBeTruthy();
  });

  it('refuses a locked mode without navigating', () => {
    const h = makeHarness();
    openModeList(h, 1);
    h.clearLog();
    h.confirm();
    expect(h.scenes.scene).toBe('modes');
    expect(h.sfxNames).toEqual(['rotate-fail']);
    expect(h.announcements).toEqual(['FUSION IS LOCKED. CLEAR THE MODE BEFORE IT FIRST.']);
    expect(h.commits).toEqual([]);
  });

  it('opens the rules card for an unlocked mode', () => {
    const h = makeHarness();
    openRules(h, 0);
    expect(h.scenes.scene).toBe('rules');
    expect(h.scenes.debug().modeId).toBe('goal-ladder');
    // The run is not built yet, so there is no status to report.
    expect(h.scenes.debug().status).toBeNull();
    expect(h.shows('ASCENT')).toBeTruthy();
    expect(h.shows('PLAYS 0  CLEARS 0')).toBeTruthy();
    expect(h.shows('START RUN')).toBeTruthy();
  });

  it('shows a stored record instead of zeros', () => {
    const h = makeHarness(saveWithRecord());
    openRules(h, 0);
    expect(h.shows('PLAYS 1  CLEARS 0')).toBeTruthy();
    expect(h.shows('BEST 12 345')).toBeTruthy();
  });

  it('nudges the seed with left and right', () => {
    const h = makeHarness();
    openRules(h, 0);
    const before = h.scenes.debug().seed;
    h.press('right');
    expect(h.scenes.debug().seed).toBe((before + 1) >>> 0);
    h.press('left');
    h.press('left');
    expect(h.scenes.debug().seed).toBe((before - 1) >>> 0);
    expect(h.announcements.at(-1)).toContain('SEED');
  });

  it('steps back out to the mode list', () => {
    const h = makeHarness();
    openRules(h, 0);
    h.back();
    expect(h.scenes.scene).toBe('modes');
    h.back();
    expect(h.scenes.scene).toBe('title');
  });
});

describe('high scores', () => {
  it('says so when the table is empty', () => {
    const h = makeHarness();
    h.moveTo(1);
    h.confirm();
    expect(h.scenes.scene).toBe('scores');
    expect(h.text()).toContain('HIGH SCORES');
    expect(h.shows('NO RUNS RECORDED YET')).toBeTruthy();
    expect(h.shows('0 BEST')).toBeTruthy();
  });

  it('lists a recorded run newest-table-first by score', () => {
    const h = makeHarness(saveWithRecord());
    h.moveTo(1);
    h.confirm();
    expect(h.shows('1 BEST')).toBeTruthy();
    expect(h.shows('12 345')).toBeTruthy();
    expect(h.shows('ASCENT')).toBeTruthy();
  });

  it('has no rows of its own, so any press goes back', () => {
    const h = makeHarness();
    h.moveTo(1);
    h.confirm();
    h.clearLog();
    expect(h.scenes.pointer(120, 80, 'press')).toBe(false);
    expect(h.scenes.scene).toBe('title');
    expect(h.sfxNames).toEqual(['menu-back']);
  });
});

describe('erasing records', () => {
  const openConfirm = (): Harness => {
    const h = makeHarness(saveWithRecord());
    h.moveTo(2);
    h.confirm(); // OPTIONS
    h.moveTo(13); // ERASE RECORDS
    h.confirm();
    return h;
  };

  it('arms the confirmation on the safe row', () => {
    const h = openConfirm();
    expect(h.scenes.scene).toBe('confirm');
    expect(h.shows('ERASE RECORDS?')).toBeTruthy();
    h.clearLog();
    // Enter on the default row keeps everything: the destructive row is not
    // pre-selected, so a panicked Enter cannot wipe a save.
    h.confirm();
    expect(h.scenes.scene).toBe('options');
    expect(h.announcements).toEqual(['NOTHING ERASED. OPTIONS']);
    expect(h.commits).toEqual([]);
    expect(h.saved().highScores).toHaveLength(1);
  });

  it('drops records and unlocks but keeps settings and controls', () => {
    const before = saveWithRecord();
    const h = openConfirm();
    // Not `moveTo(0)`: this screen's cursor lives on row 1, so choosing the
    // destructive row is always a deliberate move.
    h.press('up');
    h.clearLog();
    h.confirm();
    expect(h.scenes.scene).toBe('modes');
    expect(h.announcements).toEqual(['RECORDS ERASED. MODE LIST']);
    const after = h.saved();
    expect(after.highScores).toEqual([]);
    expect(after.progress['goal-ladder']?.best).toBeNull();
    expect(after.progress['goal-ladder']?.plays).toBe(0);
    // The first mode stays playable; everything behind it re-locks.
    expect(after.progress['goal-ladder']?.unlocked).toBe(true);
    expect(after.progress['linked-blocks']?.unlocked).toBe(false);
    expect(after.settings).toEqual(before.settings);
    expect(after.bindings).toEqual(before.bindings);
  });

  it('treats Escape as a refusal', () => {
    const h = openConfirm();
    h.back();
    expect(h.scenes.scene).toBe('options');
    expect(h.commits).toEqual([]);
  });
});
