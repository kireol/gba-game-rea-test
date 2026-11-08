// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, cloneBindings, rebind, type Bindings } from '../engine/bindings.js';
import type { Intent } from '../engine/types.js';
import { attachInput } from '../app/input.js';

/**
 * `input.ts` is where browser events become game intents, so these tests fire
 * real DOM events at the real listeners and assert two things: what the host was
 * told, and what the browser was denied (`defaultPrevented`, returned by every
 * helper below). What a screen *does* with an intent is the scene machine's
 * business and deliberately not covered here.
 *
 * Pointer events are `MouseEvent`s dispatched under the `pointer*` type names:
 * the handlers read only `clientX/Y`, `buttons` and `button`, which `MouseEvent`
 * really implements, so the suite does not depend on jsdom shipping a
 * `PointerEvent` constructor.
 */

interface Pressed {
  readonly intent: Intent;
  readonly down: boolean;
  readonly player: 1 | 2;
}

interface Seen {
  readonly code: string;
  readonly down: boolean;
}

interface FakeHost {
  /** Filled in by `createHost`, once the recording fields exist to point at. */
  host: InputHostLike;
  readonly canvas: HTMLCanvasElement;
  readonly pressed: Pressed[];
  readonly seen: Seen[];
  readonly pointers: { x: number; y: number; action: string }[];
  readonly focused: unknown[];
  /** Player one's live map; tests reassign this to simulate a rebind. */
  bindings: Bindings;
  /** Codes `raw()` claims first, modelling a screen that is capturing keys. */
  captured: Set<string>;
  /** What `toFramebuffer` answers; `null` models a point off the board. */
  board: { x: number; y: number } | null;
  readonly gestures: number;
  readonly fullscreen: number;
  readonly focusLost: number;
}

type InputHostLike = Parameters<typeof attachInput>[0];

const live: ReturnType<typeof attachInput>[] = [];
afterEach(() => {
  while (live.length) live.pop()?.dispose();
});

const createHost = (): FakeHost => {
  const canvas = document.createElement('canvas');
  const focused: unknown[] = [];
  // jsdom's focus() ignores preventScroll, so record the argument: the call site
  // cannot quietly lose it.
  canvas.focus = (options?: unknown): void => {
    focused.push(options);
  };
  const counted = { gestures: 0, fullscreen: 0, focusLost: 0 };
  const fake: FakeHost = {
    // Replaced below as soon as there is a host to point at.
    host: undefined as unknown as InputHostLike,
    canvas,
    pressed: [],
    seen: [],
    pointers: [],
    focused,
    bindings: cloneBindings(DEFAULT_BINDINGS),
    captured: new Set<string>(),
    board: { x: 80, y: 44 },
    get gestures(): number {
      return counted.gestures;
    },
    get fullscreen(): number {
      return counted.fullscreen;
    },
    get focusLost(): number {
      return counted.focusLost;
    },
  };
  const host: InputHostLike = {
    canvas,
    bindings: () => fake.bindings,
    dispatch: (intent, down, player) => {
      fake.pressed.push({ intent, down, player });
    },
    raw: (code, down) => {
      fake.seen.push({ code, down });
      return fake.captured.has(code);
    },
    // The real host delegates the CSS→framebuffer division to the layout, so the
    // fake uses one obvious transform (halve each axis) that shows which values
    // the handlers forward.
    toFramebuffer: () => fake.board,
    pointer: (x, y, action) => {
      fake.pointers.push({ x, y, action });
    },
    onGesture: () => {
      counted.gestures += 1;
    },
    onFullscreenToggle: () => {
      counted.fullscreen += 1;
    },
    onFocusLost: () => {
      counted.focusLost += 1;
    },
  };
  fake.host = host;
  return fake;
};

/** Attaches and remembers to detach, so listeners never leak between tests. */
const attach = (): FakeHost => {
  const fake = createHost();
  live.push(attachInput(fake.host));
  return fake;
};

interface KeyOpts {
  repeat?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
}

/** Sends a key at the window listeners and reports whether the page was eaten. */
const sendKey = (type: 'keydown' | 'keyup', code: string, opts: KeyOpts = {}): boolean => {
  const event = new KeyboardEvent(type, {
    code,
    // preventDefault is a no-op on a non-cancelable event, which is the default
    // for a constructed KeyboardEvent.
    cancelable: true,
    repeat: opts.repeat ?? false,
    ctrlKey: opts.ctrl ?? false,
    metaKey: opts.meta ?? false,
    altKey: opts.alt ?? false,
    shiftKey: opts.shift ?? false,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

const press = (code: string, opts: KeyOpts = {}): boolean => sendKey('keydown', code, opts);
const release = (code: string, opts: KeyOpts = {}): boolean => sendKey('keyup', code, opts);

/** Fires a `pointer*` event on the canvas, or on window when `where` says so. */
const pointer = (
  f: FakeHost,
  type: string,
  init: MouseEventInit = {},
  where: 'canvas' | 'window' = 'canvas',
): boolean => {
  const event = new MouseEvent(type, { cancelable: true, bubbles: true, ...init });
  if (where === 'window') window.dispatchEvent(event);
  else f.canvas.dispatchEvent(event);
  return event.defaultPrevented;
};

const wheel = (f: FakeHost, deltaY: number, shiftKey = false): boolean => {
  const event = new WheelEvent('wheel', { deltaY, shiftKey, cancelable: true });
  f.canvas.dispatchEvent(event);
  return event.defaultPrevented;
};

/** Runs `fn` with the tab reporting `value`, then restores jsdom's default. */
const withVisibility = (value: 'visible' | 'hidden', fn: () => void): void => {
  const own = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
  try {
    fn();
  } finally {
    if (own) Object.defineProperty(document, 'visibilityState', own);
    else delete (document as unknown as Record<string, unknown>).visibilityState;
  }
};

const press1 = (intent: Intent): Pressed => ({ intent, down: true, player: 1 });
const release1 = (intent: Intent): Pressed => ({ intent, down: false, player: 1 });
const press2 = (intent: Intent): Pressed => ({ intent, down: true, player: 2 });
const release2 = (intent: Intent): Pressed => ({ intent, down: false, player: 2 });

describe('the event layer', () => {
  describe('keys', () => {
    it('turns a bound key into player one intent and eats the browser default', () => {
      const f = attach();
      expect(press('ArrowLeft')).toBe(true);
      expect(f.pressed).toEqual([press1('left')]);
      expect(f.gestures).toBe(1); // The autoplay policy needs any key, not just clicks.
    });

    it('reads player one map again on every event, so a rebind is immediate', () => {
      const f = attach();
      expect(press('KeyH')).toBe(false); // Unbound: passes through untouched.
      expect(f.pressed).toEqual([]);
      f.bindings = rebind(f.bindings, 'left', 'KeyH', 0);
      expect(press('KeyH')).toBe(true);
      expect(f.pressed).toEqual([press1('left')]);
    });

    it('gives a code to player two only when player one does not hold it', () => {
      const f = attach();
      expect(press('KeyA')).toBe(true); // Player two's map is fixed, never edited.
      expect(f.pressed).toEqual([press2('left')]);
      f.pressed.length = 0;
      // Enter is in player two's confirm row too, but player one's map is asked
      // first — and inside it, BINDABLE_INTENTS claims pause before confirm.
      expect(press('Enter')).toBe(true);
      expect(f.pressed).toEqual([press1('pause')]);
    });

    it('never forwards the operating system repeat, but still swallows it', () => {
      const f = attach();
      // The rules engine does its own repeat in frames; a forwarded OS repeat
      // would make horizontal speed depend on the OS key-repeat rate.
      expect(press('ArrowLeft', { repeat: true })).toBe(true);
      expect(f.pressed).toEqual([]);
      // Swallowed while unbound too, because holding it scrolls the page.
      expect(press('NumpadEnter', { repeat: true })).toBe(true);
      expect(f.pressed).toEqual([]);
      // A key we have no interest in is left alone, repeat or not.
      expect(press('F13', { repeat: true })).toBe(false);
      expect(f.pressed).toEqual([]);
      expect(f.gestures).toBe(3); // Repeat keydowns are still gestures.
    });

    it('swallows browser chrome keys even when nothing is bound to them', () => {
      const f = attach();
      f.bindings = { ...f.bindings, 'hard-drop': [] }; // Space now bound to nothing.
      expect(press('Space')).toBe(true);
      expect(press('NumpadEnter')).toBe(true);
      expect(f.pressed).toEqual([]);
      // Tab stays live for shell navigation, so it is deliberately not swallowed.
      expect(press('Tab')).toBe(false);
      expect(press('Backquote')).toBe(false);
      expect(f.pressed).toEqual([]);
    });

    it('leaves control and command chords entirely alone', () => {
      const f = attach();
      expect(press('ArrowLeft', { ctrl: true })).toBe(false);
      expect(press('Enter', { meta: true })).toBe(false);
      expect(f.pressed).toEqual([]);
      expect(f.seen).toEqual([]); // Not even offered to the screen: they are OS keys.
      expect(f.gestures).toBe(0);
      expect(f.fullscreen).toBe(0);
    });

    it('treats Alt+Enter and F11 as the fullscreen key, and Alt chords as play', () => {
      const f = attach();
      expect(press('Enter', { alt: true })).toBe(true);
      expect(f.fullscreen).toBe(1);
      expect(press('F11')).toBe(true);
      expect(f.fullscreen).toBe(2);
      expect(f.pressed).toEqual([]);
      // Alt is the option key on macOS layouts, so it must not disable play.
      expect(press('ArrowLeft', { alt: true })).toBe(true);
      expect(f.pressed).toEqual([press1('left')]);
      expect(f.fullscreen).toBe(2);
    });

    it('lets the screen claim a code before the bindings, in both directions', () => {
      const f = attach();
      f.captured.add('ArrowLeft');
      expect(press('ArrowLeft')).toBe(true);
      expect(f.pressed).toEqual([]); // Consumed as raw, never as an intent.
      expect(release('ArrowLeft')).toBe(true);
      expect(f.seen).toEqual([
        { code: 'ArrowLeft', down: true },
        { code: 'ArrowLeft', down: false },
      ]);
    });

    it('releases a key the screen captured, so nothing stays wedged pressed', () => {
      const f = attach();
      f.captured.add('ArrowLeft');
      expect(press('ArrowLeft')).toBe(true); // The screen took the press.
      f.captured.clear(); // The capture ended while the key was still held.
      expect(release('ArrowLeft')).toBe(false);
      expect(f.pressed).toEqual([release1('left')]);
    });

    it('presses a twice-bound intent once, and releases it once across both maps', () => {
      const f = attach();
      // Escape is 'back' in both players' maps and Backspace is player one's alias
      // for it; a held key must not stack presses or lift the intent twice.
      expect(press('Escape')).toBe(true);
      expect(press('Backspace')).toBe(true);
      expect(f.pressed).toEqual([press1('back')]);
      f.pressed.length = 0;
      expect(release('Escape')).toBe(false);
      // Once, for player one only: both maps resolve Escape to the same intent.
      expect(f.pressed).toEqual([release1('back')]);
      release('Backspace');
      expect(f.pressed).toHaveLength(2); // The alias may still lift an intent already up.
    });

    it('hands player two a release for a press player one took', () => {
      // Enter is player one's pause (claimed first) and player two's confirm. Player
      // one wins the press, and player two is still told to lift an intent it was
      // never told was down. Harmless for a host that ignores a stray up; this is
      // the behaviour recorded, not an ideal.
      const f = attach();
      expect(press('Enter')).toBe(true);
      expect(f.pressed).toEqual([press1('pause')]);
      f.pressed.length = 0;
      release('Enter');
      expect(f.pressed).toEqual([release1('pause'), release2('confirm')]);
    });

    it('leaves a key nobody bound alone, so the shell keeps its shortcuts', () => {
      const f = attach();
      expect(press('KeyQ')).toBe(true); // KeyQ is player two's hold.
      expect(f.pressed).toEqual([press2('hold')]);
      f.pressed.length = 0;
      expect(press('F13')).toBe(false);
      expect(press('Backquote')).toBe(false);
      expect(f.pressed).toEqual([]);
    });
  });

  describe('pointer and wheel', () => {
    it('focuses the canvas without scrolling the page to it', () => {
      const f = attach();
      pointer(f, 'pointerdown', { button: 0, buttons: 1 });
      expect(f.focused).toEqual([{ preventScroll: true }]);
    });

    it('turns right button into counter-clockwise rotation and hides the menu', () => {
      const f = attach();
      expect(pointer(f, 'pointerdown', { button: 2, buttons: 2 })).toBe(true);
      expect(f.pressed).toEqual([press1('rotate-ccw')]);
      expect(f.pointers).toEqual([]); // A rotate is not also a board tap.
      pointer(f, 'pointerup', { button: 2 }, 'window');
      expect(f.pressed).toEqual([press1('rotate-ccw'), release1('rotate-ccw')]);
    });

    it('turns middle button into hold and releases it wherever the finger leaves', () => {
      const f = attach();
      expect(pointer(f, 'pointerdown', { button: 1, buttons: 4 })).toBe(true);
      expect(f.pressed).toEqual([press1('hold')]);
      pointer(f, 'pointerup', { button: 1 }, 'window'); // Release rides on window.
      expect(f.pressed).toEqual([press1('hold'), release1('hold')]);
    });

    it('sends a board tap to the framebuffer point the host computed', () => {
      const f = attach();
      f.board = { x: 160, y: 88 };
      const eaten = pointer(f, 'pointerdown', {
        button: 0,
        buttons: 1,
        clientX: 320,
        clientY: 176,
      });
      expect(eaten).toBe(false); // A tap inside the board is not a swallowed scroll.
      expect(f.pointers).toEqual([{ x: 160, y: 88, action: 'press' }]);
      expect(f.pressed).toEqual([]);
    });

    it('ignores a press outside the board but still unlocks the audio', () => {
      const f = attach();
      f.board = null;
      expect(pointer(f, 'pointerdown', { button: 0, buttons: 1 })).toBe(false);
      expect(f.pointers).toEqual([]);
      expect(f.gestures).toBe(1);
      expect(f.focused).toEqual([{ preventScroll: true }]);
    });

    it('hovers once per framebuffer point and never during a drag', () => {
      const f = attach();
      const move = (x: number, y: number, buttons = 0): boolean =>
        pointer(f, 'pointermove', { buttons, clientX: x, clientY: y });
      f.board = { x: 10, y: 4 };
      expect(move(100, 40)).toBe(false);
      expect(f.pointers).toEqual([{ x: 10, y: 4, action: 'hover' }]);
      expect(f.gestures).toBe(1);
      expect(move(100, 40)).toBe(false); // Same point: no second hover event.
      expect(f.pointers).toHaveLength(1);
      expect(f.gestures).toBe(1);
      f.board = { x: 11, y: 4 };
      move(102, 40);
      f.board = { x: 12, y: 4 };
      expect(move(104, 40, 1)).toBe(false); // Buttons down means a drag, not a hover.
      expect(f.pointers).toEqual([
        { x: 10, y: 4, action: 'hover' },
        { x: 11, y: 4, action: 'hover' },
      ]);
      expect(f.gestures).toBe(2);
      f.board = null;
      expect(move(200, 200)).toBe(false);
      expect(f.pointers).toHaveLength(2);
      expect(f.gestures).toBe(2); // An off-board move is not a gesture either.
    });

    it('converts the wheel into one press and one release of one intent', () => {
      const f = attach();
      expect(wheel(f, -53)).toBe(true);
      expect(f.pressed).toEqual([press1('rotate-cw'), release1('rotate-cw')]);
      f.pressed.length = 0;
      expect(wheel(f, 53)).toBe(true);
      expect(f.pressed).toEqual([press1('soft-drop'), release1('soft-drop')]);
      f.pressed.length = 0;
      expect(wheel(f, 53, true)).toBe(true); // Shift means the wheel is not dropping.
      expect(f.pressed).toEqual([press1('hold'), release1('hold')]);
      expect(f.gestures).toBe(3);
    });

    it('gates the wheel deadzone without ever letting the page scroll', () => {
      const f = attach();
      expect(wheel(f, 3)).toBe(true); // Below the deadzone: eaten, but not acted on.
      expect(f.pressed).toEqual([]);
      expect(wheel(f, -3)).toBe(true);
      expect(f.pressed).toEqual([]);
      expect(f.gestures).toBe(2); // A gated wheel still counts as touching the page.
      expect(wheel(f, 4)).toBe(true); // At the deadzone it is a notch.
      expect(f.pressed).toEqual([press1('soft-drop'), release1('soft-drop')]);
    });

    it('keeps the context menu off the canvas', () => {
      const f = attach();
      const event = new MouseEvent('contextmenu', { cancelable: true });
      f.canvas.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('focus', () => {
    it('pauses when the window loses focus', () => {
      const f = attach();
      window.dispatchEvent(new Event('blur'));
      expect(f.focusLost).toBe(1);
    });

    it('pauses when the tab is hidden and ignores a visible one', () => {
      const f = attach();
      withVisibility('visible', () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(f.focusLost).toBe(0);
      withVisibility('hidden', () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(f.focusLost).toBe(1);
    });
  });

  it('stops listening when disposed', () => {
    const fake = createHost();
    const input = attachInput(fake.host);
    press('ArrowLeft');
    expect(fake.pressed).toHaveLength(1);
    input.dispose();

    fake.pressed.length = 0;
    expect(press('ArrowLeft')).toBe(false);
    pointer(fake, 'pointermove', { buttons: 0 });
    pointer(fake, 'pointerdown', { button: 0, buttons: 1 });
    pointer(fake, 'pointerup', { button: 0 }, 'window');
    expect(wheel(fake, 53)).toBe(false);
    const menu = new MouseEvent('contextmenu', { cancelable: true });
    fake.canvas.dispatchEvent(menu);
    window.dispatchEvent(new Event('blur'));
    withVisibility('hidden', () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fake.pressed).toEqual([]);
    expect(fake.pointers).toEqual([]);
    expect(fake.gestures).toBe(1); // Only the press that happened before dispose.
    expect(fake.fullscreen).toBe(0);
    expect(fake.focusLost).toBe(0);
    expect(menu.defaultPrevented).toBe(false);
    input.dispose(); // Idempotent: detaching twice does not throw.
  });
});
