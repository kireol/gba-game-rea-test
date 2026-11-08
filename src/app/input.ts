import { intentForCode, P2_BINDINGS, type Bindings } from '../engine/bindings.js';
import type { Intent } from '../engine/types.js';

/**
 * Browser events in, game intents out.
 *
 * Nothing here knows what a screen looks like: it maps a raw event to an intent
 * (or a framebuffer point) and hands it to the scene machine, which decides
 * whether that intent means anything right now. Two details are load-bearing:
 *
 * - `e.repeat` is dropped. The rules engine implements its own repeat (DAS/ARR) in
 *   frames, so the OS repeat would double it and make horizontal speed depend on
 *   the operating system's key-repeat rate.
 * - Player two is polled from a fixed map, not the editable one. The bindings
 *   screen edits one keyboard map for the person using the menu; giving both
 *   players editable maps on a shared keyboard produces collisions that are the
 *   player's problem to solve, not ours to store.
 */

export interface InputHost {
  readonly canvas: HTMLCanvasElement;
  /** Live view of player one's map, so a rebind takes effect immediately. */
  bindings(): Bindings;
  dispatch(intent: Intent, down: boolean, player: 1 | 2): void;
  /** Raw key codes first: true means the screen consumed it (key capture). */
  raw(code: string, down: boolean): boolean;
  /** CSS point → framebuffer point, or null when the pointer is off-screen. */
  toFramebuffer(clientX: number, clientY: number): { x: number; y: number } | null;
  /** A framebuffer point the screen may act on (menu hover, board tap). */
  pointer(x: number, y: number, action: 'hover' | 'press'): void;
  /** Fired on the first key or pointer event, to satisfy autoplay policy. */
  onGesture(): void;
  onFullscreenToggle(): void;
  /** Tab hidden or window blurred: the app pauses the run. */
  onFocusLost(): void;
}

export interface Input {
  dispose(): void;
}

/**
 * Codes we swallow even when unbound, because letting them through scrolls or
 * activates chrome. `Tab` stays live for keyboard navigation of the shell, so it
 * is deliberately absent; `Escape` is absent too because the browser owns it in
 * fullscreen.
 */
const SWALLOWED = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'NumpadEnter',
  'Backspace',
]);

const WHEEL_DEADZONE = 4;

export const attachInput = (host: InputHost): Input => {
  const { canvas } = host;
  let lastPointer = -1;

  const handleKey = (event: KeyboardEvent, down: boolean): void => {
    const code = event.code;
    // Browser and OS shortcuts stay theirs, except Alt+Enter (our fullscreen key).
    const combo = event.ctrlKey || event.metaKey;
    const fullscreenKey = (event.altKey && code === 'Enter') || code === 'F11';
    if (combo) return;

    if (down) host.onGesture();
    if (host.raw(code, down)) {
      event.preventDefault();
      return;
    }
    if (!down) {
      // Release always travels, even for a repeat we never forwarded, or a key held
      // across a scene change would stay pressed in the rules engine.
      release(code);
      return;
    }
    if (fullscreenKey) {
      event.preventDefault();
      host.onFullscreenToggle();
      return;
    }
    if (event.repeat) {
      if (SWALLOWED.has(code) || mapped(code) !== null) event.preventDefault();
      return;
    }

    const p1 = mapped(code);
    if (p1 !== null) {
      event.preventDefault();
      dispatchIntent(p1, true, 1);
      return;
    }
    const p2 = intentForCode(P2_BINDINGS, code);
    if (p2 !== null) {
      event.preventDefault();
      dispatchIntent(p2, true, 2);
      return;
    }
    if (SWALLOWED.has(code)) event.preventDefault();
  };

  const mapped = (code: string): Intent | null => intentForCode(host.bindings(), code);

  const pressed = new Set<string>();

  const dispatchIntent = (intent: Intent, down: boolean, player: 1 | 2): void => {
    if (down) {
      const key = `${player}:${intent}`;
      if (pressed.has(key)) return;
      pressed.add(key);
    } else {
      pressed.delete(`${player}:${intent}`);
    }
    host.dispatch(intent, down, player);
  };

  const release = (code: string): void => {
    const p1 = mapped(code);
    if (p1 !== null) dispatchIntent(p1, false, 1);
    const p2 = intentForCode(P2_BINDINGS, code);
    if (p2 !== null && p2 !== p1) dispatchIntent(p2, false, 2);
  };

  const onKeyDown = (event: KeyboardEvent): void => handleKey(event, true);
  const onKeyUp = (event: KeyboardEvent): void => handleKey(event, false);

  const onPointerMove = (event: PointerEvent): void => {
    const at = host.toFramebuffer(event.clientX, event.clientY);
    if (!at) return;
    // A drag that starts on the board is a tap-and-hold, not a hover: sending it
    // would yank the menu cursor around while someone is tapping the field.
    if (event.buttons !== 0) return;
    const packed = at.y * 1024 + at.x;
    if (packed === lastPointer) return;
    lastPointer = packed;
    host.onGesture();
    host.pointer(at.x, at.y, 'hover');
  };

  const onPointerDown = (event: PointerEvent): void => {
    host.onGesture();
    canvas.focus({ preventScroll: true });
    if (event.button === 2) {
      event.preventDefault();
      dispatchIntent('rotate-ccw', true, 1);
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
      dispatchIntent('hold', true, 1);
      return;
    }
    const at = host.toFramebuffer(event.clientX, event.clientY);
    if (!at) return;
    host.pointer(at.x, at.y, 'press');
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) dispatchIntent('rotate-ccw', false, 1);
    else if (event.button === 1) dispatchIntent('hold', false, 1);
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    host.onGesture();
    if (Math.abs(event.deltaY) < WHEEL_DEADZONE) return;
    const down = event.deltaY > 0;
    const intent: Intent = event.shiftKey ? 'hold' : down ? 'soft-drop' : 'rotate-cw';
    // One gesture, one tap: the rules engine wants a press and a release, and a
    // trackpad can fire several events per flick, so the deadzone above gates them.
    dispatchIntent(intent, true, 1);
    dispatchIntent(intent, false, 1);
  };

  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') host.onFocusLost();
  };
  const onBlur = (): void => host.onFocusLost();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
};
