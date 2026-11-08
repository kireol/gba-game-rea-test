import { createAudioEngine } from '../audio/engine.js';
import { openSaveStore } from '../gameplay/persistence.js';
import { createRenderer } from '../render/renderer.js';
import type { GameStatus } from '../engine/types.js';
import { createScenes, type SceneHost } from '../ui/scenes.js';
import { attachInput } from './input.js';
import { createLayout } from './layout.js';
import { createLoop } from './loop.js';

/**
 * Composition root.
 *
 * Everything with a side effect on the browser lives below this line: the save
 * store, the audio context, the canvas, the window listeners. The scene machine
 * stays a pure frame producer and the rules engine stays a pure state machine, so
 * both remain testable in Node without a DOM. This file has no logic worth
 * testing — it only wires.
 */

interface BootElements {
  readonly canvas: HTMLCanvasElement;
  readonly stage: HTMLElement;
  readonly announce: HTMLElement;
  readonly error: HTMLElement;
}

const findElements = (): BootElements => {
  const canvas = document.getElementById('screen');
  const stage = document.getElementById('stage');
  const announce = document.getElementById('announce');
  const error = document.getElementById('boot-error');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#screen must be a canvas');
  if (!(stage instanceof HTMLElement)) throw new Error('#stage must be an element');
  if (!(announce instanceof HTMLElement)) throw new Error('#announce must be an element');
  if (!(error instanceof HTMLElement)) throw new Error('#boot-error must be an element');
  return { canvas, stage, announce, error };
};

const showBootError = (reason: unknown): void => {
  const box = document.getElementById('boot-error');
  const text = reason instanceof Error ? reason.message : String(reason);
  if (!box) return;
  box.style.display = 'block';
  box.textContent = `Orbit Drop could not start: ${text}`;
};

/**
 * `?test=1` exposes the live objects on `window`. End-to-end tests need to read
 * the current scene and drive the clock; asserting through pixels alone would make
 * the suite flaky. Normal play never sees this object.
 */
const testMode = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('test');
  } catch {
    return false;
  }
};

const boot = (): void => {
  const { canvas, stage, announce, error } = findElements();

  const store = openSaveStore({
    onWarn: (what, reason) => console.warn(`[orbit-drop] ${what} failed`, reason),
  });

  const renderer = createRenderer(canvas);
  const audio = createAudioEngine(store.data.audio);
  const layout = createLayout(canvas, stage);

  let lastStatus: GameStatus = 'ready';
  const host: SceneHost = {
    sfx: (name) => audio.sfx(name),
    status: (status) => {
      lastStatus = status;
      audio.setStatus(status);
    },
    // The scene already applied its change, so the store takes it verbatim.
    commit: (data) => {
      store.update(() => data);
      audio.prefs(data.audio);
    },
    announce: (text) => {
      announce.textContent = text;
    },
    persisted: () => store.persisted,
    now: () => Date.now(),
  };

  const scenes = createScenes(host, store.data);
  audio.prefs(store.data.audio);

  const input = attachInput({
    canvas,
    bindings: () => store.data.bindings,
    dispatch: (intent, down, player) => {
      scenes.intent(intent, down, player);
    },
    raw: (code, down) => scenes.key(code, down),
    toFramebuffer: (x, y) => layout.toFramebuffer(x, y),
    pointer: (x, y, action) => {
      scenes.pointer(x, y, action);
    },
    onGesture: () => audio.unlock(),
    onFullscreenToggle: () => layout.toggleFullscreen(),
    onFocusLost: () => scenes.blur(),
  });

  const loop = createLoop((frames) => {
    scenes.advance(frames);
    renderer.paint(scenes.frame());
  });
  loop.start();

  if (testMode()) {
    (window as unknown as Record<string, unknown>).__orbit = {
      scenes,
      store,
      layout,
      loop,
      renderer,
      audio,
      input,
      get status(): string {
        return lastStatus;
      },
    };
  }

  canvas.focus({ preventScroll: true });
  error.remove();
};

try {
  boot();
} catch (reason) {
  showBootError(reason);
  console.error(reason);
}
