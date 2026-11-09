import { describe, expect, it } from 'vitest';
import { MODES } from '../modes/registry.js';
import { makeHarness, modeIndex, startMode, unlockAll, type Harness } from './scenes-harness.js';

/**
 * The run screens: the countdown, a live run, its pause menu, the results card,
 * and the local-versus screen.
 *
 * These are the only screens that own a clock, so the suite is a study in
 * `advance()`: what a withheld frame does, what a consumed one does, and where a
 * batch of them stops being honoured. The browser suite reaches the same rows
 * through `?test=1` and `debug()`; these pin them without a browser.
 */

/** Frames withheld before a run starts falling, and one quarter of them. */
const COUNTDOWN = 180;
const COUNT = 45;

/**
 * The count is drawn at scale 3 over the board: centred on the field at y=60 for
 * a single run, centred on the screen at y=74 for a duel.
 */
const countLabel = (h: Harness, y = 60): string | undefined =>
  h.scenes.frame().texts?.find((call) => call.y === y)?.text;

/** A run through its countdown, with the menu noise already spent. */
const counted = (index = 0, initial?: Parameters<typeof makeHarness>[0]): Harness => {
  const h = makeHarness(initial);
  startMode(h, index);
  h.clearLog();
  h.scenes.advance(COUNTDOWN);
  h.clearLog();
  return h;
};

/** The results screen of a mode that cannot be picked before the unlock chain. */
const finishedRun = (): Harness => {
  const h = makeHarness(unlockAll());
  startMode(h, modeIndex('timed-goal'));
  h.clearLog();
  h.scenes.advance(COUNTDOWN);
  // Nobody touches the keyboard, so the stack simply rises until it reaches the
  // top. Far quicker than waiting a mode's clock out, and it ends the run the
  // same way a real topout does.
  h.scenes.advance(9_000);
  return h;
};

const duel = (): Harness => {
  const h = counted(modeIndex('local-versus'), unlockAll());
  h.scenes.advance(60);
  h.clearLog();
  return h;
};

describe('the countdown', () => {
  it('withholds the frames a run would have fallen', () => {
    const h = makeHarness();
    startMode(h, 0);
    expect(h.scenes.scene).toBe('play');
    expect(h.scenes.debug().status).toBe('playing');
    expect(h.scenes.debug().countdown).toBe(COUNTDOWN);
    // The session is live from the first frame, so it shows a board; nothing has
    // locked because the frames never reached it.
    expect(h.scenes.debug().pieces).toBe(0);
    expect(countLabel(h)).toBe('3');
    expect(h.texts()).toContain('HOLD');

    h.scenes.advance(COUNT);
    expect(h.scenes.debug().countdown).toBe(135);
    expect(countLabel(h)).toBe('2');
    h.scenes.advance(COUNT);
    expect(h.scenes.debug().countdown).toBe(90);
    expect(countLabel(h)).toBe('1');
    h.scenes.advance(COUNT);
    expect(h.scenes.debug().countdown).toBe(45);
    expect(countLabel(h)).toBe('GO');
    h.scenes.advance(COUNT);
    expect(h.scenes.debug().countdown).toBe(0);
    expect(countLabel(h)).toBeUndefined();
    expect(h.scenes.debug().pieces).toBe(0);
  });

  it('sounds once per label, not once per frame', () => {
    const h = makeHarness();
    startMode(h, 0);
    h.clearLog();
    for (let i = 0; i < 4; i += 1) h.scenes.advance(COUNT);
    expect(h.sfxNames).toEqual(['menu-move', 'menu-move', 'menu-confirm', 'menu-confirm']);
  });

  it('spends a single big advance on the countdown alone', () => {
    const h = makeHarness();
    startMode(h, 0);
    h.clearLog();
    h.scenes.advance(COUNTDOWN + 9_000);
    // The countdown branch of `advance` consumes the whole batch and returns, so
    // the 9000 frames after the count are dropped, not carried into the run. The
    // app pumps one frame per animation tick, so only a batched caller — a test,
    // or a future replay driver — can hit this. PROJECT_STATE.md § 6.
    expect(h.scenes.debug().countdown).toBe(0);
    expect(h.scenes.debug().pieces).toBe(0);
    expect(h.sfxNames).toEqual(['menu-confirm']);
  });
});

describe('a live run', () => {
  it('keeps its seed and mode while it falls', () => {
    const h = counted();
    const before = h.scenes.debug();
    h.scenes.advance(240);
    const after = h.scenes.debug();
    expect(after.scene).toBe('play');
    expect(after.status).toBe('playing');
    expect(after.seed).toBe(before.seed);
    expect(after.modeId).toBe('goal-ladder');
  });

  it('locks a piece under gravity alone', () => {
    const h = counted();
    h.scenes.advance(1_200);
    expect(h.scenes.debug().pieces).toBeGreaterThan(0);
    expect(h.sfxNames).toContain('lock');
    expect(h.sfxNames).toContain('spawn');
  });

  it('takes the field as a hard drop', () => {
    const h = counted();
    h.clearLog();
    // The field is 8px cells wide from x=8, ten columns; the panel starts at x=96,
    // so (60, 100) is board and (230, 100) is nowhere the run listens.
    expect(h.scenes.pointer(60, 100, 'press')).toBe(true);
    expect(h.scenes.debug().pieces).toBe(1);
    expect(h.scenes.debug().score).toBeGreaterThan(0);
    expect(h.scenes.pointer(230, 100, 'press')).toBe(false);
    // Only a press means anything on the board: hover has no notion of a piece.
    expect(h.scenes.pointer(60, 100, 'hover')).toBe(false);
  });

  it('takes the hold box as a hold', () => {
    const h = counted();
    h.clearLog();
    // The hold preview is drawn at x=96..160, y=12..38. The sound is not a click
    // effect: the click queues the intent, so it is the next frame that swaps.
    expect(h.scenes.pointer(128, 25, 'press')).toBe(true);
    h.scenes.advance(1);
    expect(h.sfxNames).toContain('hold');
    expect(h.scenes.debug().pieces).toBe(0);
    // One pixel past the box on either axis is nobody's input.
    expect(h.scenes.pointer(161, 38, 'press')).toBe(false);
  });

  it('pauses on its own intent', () => {
    const h = counted();
    h.clearLog();
    expect(h.press('pause')).toBe(true);
    expect(h.scenes.debug().status).toBe('paused');
    expect(h.sfxNames).toEqual(['menu-confirm']);
    expect(h.statuses.at(-1)).toBe('paused');
    expect(h.shows('PAUSED')).toBeTruthy();
    for (const label of ['RESUME', 'RESTART', 'OPTIONS', 'MODE LIST']) expect(h.shows(label)).toBeTruthy();
    expect(h.shows('ENTER CHOOSE')).toBeTruthy();
    expect(h.shows('ESC RESUME')).toBeTruthy();
    expect(h.commits).toEqual([]);
  });

  it('freezes the stack while paused', () => {
    const h = counted();
    h.scenes.advance(600);
    h.press('pause');
    const pieces = h.scenes.debug().pieces;
    h.scenes.advance(2_000);
    expect(h.scenes.debug().pieces).toBe(pieces);
  });

  it('resumes on back, and says so twice', () => {
    const h = counted();
    h.press('pause');
    h.clearLog();
    expect(h.back()).toBe(true);
    expect(h.scenes.debug().status).toBe('playing');
    expect(h.shows('PAUSED')).toBeFalsy();
    // `back()` makes its own sound and `resume()` makes another. Pinned because
    // the browser suite's e2e rows count these, not the intent that made them.
    expect(h.sfxNames).toEqual(['menu-back', 'menu-back']);
  });

  it('pauses when the window goes away', () => {
    const h = counted();
    h.scenes.blur();
    expect(h.scenes.debug().status).toBe('paused');
    expect(h.shows('PAUSED')).toBeTruthy();
  });

  it('hands its pause list to the pointer', () => {
    const h = counted();
    h.press('pause');
    h.clearLog();
    // The list sits at y=56 for four 15px rows, so (100, 108) is MODE LIST and
    // (4, 4) is outside it.
    expect(h.scenes.pointer(4, 4, 'press')).toBe(false);
    expect(h.scenes.pointer(100, 108, 'press')).toBe(true);
    expect(h.scenes.scene).toBe('modes');
  });

  it('restarts from the pause menu on the same seed', () => {
    const h = counted();
    h.scenes.advance(600);
    const seed = h.scenes.debug().seed;
    h.press('pause');
    h.moveTo(1);
    h.confirm();
    expect(h.scenes.debug().status).toBe('playing');
    expect(h.scenes.debug().pieces).toBe(0);
    expect(h.scenes.debug().seed).toBe(seed);
  });

  it('leaves the pause menu for the mode list', () => {
    const h = counted();
    h.press('pause');
    h.pressN('down', 3);
    h.confirm();
    expect(h.scenes.scene).toBe('modes');
    // Leaving for the mode list drops the run, so `debug()` no longer has a
    // status to report — the same row `debug().status` answers null on every
    // other screen.
    expect(h.scenes.debug().status).toBeNull();
  });

  it('strands the run when OPTIONS opens from the pause menu', () => {
    // TODO(v0.1.2): documented design, not an accident — `openOptions('play')`
    // drops the session so the record can be edited safely. See
    // docs/architecture/interfaces.md; this test pins where that leaves the user.
    const h = counted();
    h.press('pause');
    h.moveTo(2);
    h.confirm();
    expect(h.scenes.scene).toBe('options');
    h.back();
    expect(h.scenes.scene).toBe('play');
    const dead = h.scenes.debug();
    expect(dead.status).toBeNull();
    expect(dead.level).toBe(0);
    // Nothing is drawn and nothing is handled: no frame, no key, no pointer, not
    // even the pause-on-blur guard. The only way out is a reload.
    expect(h.texts()).toEqual([]);
    expect(h.press('confirm')).toBe(false);
    expect(h.press('pause')).toBe(false);
    expect(h.scenes.key('Escape', true)).toBe(false);
    expect(h.scenes.pointer(60, 100, 'press')).toBe(false);
    h.scenes.blur();
    expect(h.scenes.debug().status).toBeNull();
  });
});

describe('the results card', () => {
  it('opens when the stack reaches the top and writes its record once', () => {
    const h = finishedRun();
    expect(h.scenes.scene).toBe('results');
    expect(h.scenes.debug().status).toBeNull();
    expect(h.shows('RUN OVER')).toBeTruthy();
    expect(h.shows('NEW RECORD')).toBeTruthy();
    expect(h.shows('TABLE')).toBeTruthy();
    expect(h.shows('1ST')).toBeTruthy();
    expect(h.shows('RUN AGAIN')).toBeTruthy();
    expect(h.shows('MODE LIST')).toBeTruthy();
    expect(h.texts()).toContain('ENTER AGAIN');
    expect(h.commits).toHaveLength(1);
    expect(h.commits[0]?.highScores[0]?.modeId).toBe('timed-goal');
  });

  it('runs it again on the same seed', () => {
    const h = finishedRun();
    const seed = h.scenes.debug().seed;
    h.clearLog();
    expect(h.press('confirm')).toBe(true);
    expect(h.scenes.scene).toBe('play');
    expect(h.scenes.debug().seed).toBe(seed);
    expect(h.scenes.debug().countdown).toBe(COUNTDOWN);
    expect(h.sfxNames).toContain('menu-confirm');
  });

  it('steps back to the mode list', () => {
    const h = finishedRun();
    expect(h.back()).toBe(true);
    expect(h.scenes.scene).toBe('modes');
  });

  it('takes the pointer on both of its rows', () => {
    const h = finishedRun();
    // The list sits at y=122 in 15px rows, so 128 is RUN AGAIN and 141 MODE LIST.
    expect(h.scenes.pointer(100, 128, 'press')).toBe(true);
    expect(h.scenes.scene).toBe('play');
    const again = finishedRun();
    expect(again.scenes.pointer(100, 141, 'press')).toBe(true);
    expect(again.scenes.scene).toBe('modes');
  });
});

describe('the local versus screen', () => {
  it('draws two boards against one seed', () => {
    const h = duel();
    expect(h.scenes.scene).toBe('duel');
    expect(h.scenes.debug().modeId).toBe('local-versus');
    for (const label of ['P1', 'P2', 'VS', 'SENT 0', 'P1 ARROWS+X/Z', 'P2 WASD+F/E']) {
      expect(h.shows(label)).toBeTruthy();
    }
    expect(h.count('SENT 0')).toBe(2);
    expect(h.text()).toContain(h.scenes.debug().seed.toString(16).toUpperCase().padStart(8, '0'));
  });

  it('counts down for both sides at once', () => {
    const h = makeHarness(unlockAll());
    startMode(h, modeIndex('local-versus'));
    expect(h.scenes.debug().countdown).toBe(COUNTDOWN);
    expect(countLabel(h, 74)).toBe('3');
    h.scenes.advance(COUNTDOWN);
    expect(countLabel(h, 74)).toBeUndefined();
    expect(h.scenes.debug().countdown).toBe(0);
  });

  it('pauses both halves for player one, and resumes on Enter', () => {
    const h = duel();
    h.clearLog();
    expect(h.press('pause')).toBe(true);
    expect(h.scenes.debug().status).toBe('paused');
    expect(h.shows('PAUSED')).toBeTruthy();
    const before = JSON.stringify(h.scenes.debug());
    h.scenes.advance(300);
    expect(JSON.stringify(h.scenes.debug())).toBe(before);
    h.clearLog();
    expect(h.press('confirm')).toBe(true);
    expect(h.scenes.debug().status).toBe('playing');
    expect(h.shows('PAUSED')).toBeFalsy();
    expect(h.sfxNames).toEqual(['menu-confirm', 'menu-back']);
  });

  it('shows player two its own pause, which player one cannot drive', () => {
    const h = duel();
    h.clearLog();
    expect(h.press('pause', 2)).toBe(true);
    // Only side B stops. `debug()` reads side A, and the frame does not know
    // whose pause it is drawing, so the list is on screen while A still falls.
    expect(h.scenes.debug().status).toBe('playing');
    expect(h.shows('PAUSED')).toBeTruthy();
    expect(h.shows('MODE LIST')).toBeTruthy();
    // Enter is the run's own key here, not the menu's: it is swallowed rather
    // than activating the row drawn under it. PROJECT_STATE.md § 6.
    expect(h.press('confirm')).toBe(false);
    expect(h.shows('PAUSED')).toBeTruthy();
    // Escape goes to the pause toggle rather than the menu, so it unpauses.
    expect(h.back()).toBe(true);
    expect(h.sfxNames.at(-1)).toBe('menu-confirm');
    expect(h.shows('PAUSED')).toBeFalsy();
  });

  it('lets the pointer into a pause either player can see', () => {
    const h = duel();
    h.press('pause', 2);
    // The versus list sits at y=72 in 11px rows, so 106 is MODE LIST.
    expect(h.scenes.pointer(100, 106, 'press')).toBe(true);
    expect(h.scenes.scene).toBe('modes');
  });

  it('restarts from its own pause menu', () => {
    const h = duel();
    h.press('pause');
    h.moveTo(1);
    h.confirm();
    expect(h.scenes.scene).toBe('duel');
    expect(h.scenes.debug().status).toBe('playing');
  });

  it('reports a press outside its pause list as unhandled', () => {
    const h = duel();
    h.press('pause');
    expect(h.scenes.pointer(4, 4, 'press')).toBe(false);
    // Not paused, and the versus screen has no board click at all.
    const live = duel();
    expect(live.scenes.pointer(100, 106, 'press')).toBe(false);
  });
});

describe('the mode table the run screens came from', () => {
  it('has one versus mode, last in the list', () => {
    const versus = MODES.filter((mode) => mode.family === 'versus');
    expect(versus).toHaveLength(1);
    expect(MODES.at(-1)?.id).toBe('local-versus');
    expect(modeIndex('local-versus')).toBe(MODES.length - 1);
  });
});
