import type { Intent } from './types.js';

/**
 * Keyboard configuration. Everything here is pure data so the menu, the settings
 * screen and the tests can share it; the DOM listeners live in `src/app/input.ts`.
 *
 * Keys are `KeyboardEvent.code` values, which are layout independent (works with
 * AZERTY and Dvorak layouts, unlike `key`).
 */
export type Bindings = Record<Intent, readonly string[]>;

export const BINDABLE_INTENTS: readonly Intent[] = [
  'left',
  'right',
  'soft-drop',
  'hard-drop',
  'rotate-cw',
  'rotate-ccw',
  'hold',
  'pause',
  'confirm',
  'back',
  'up',
  'down',
  'increment',
  'decrement',
];

export const INTENT_LABELS: Record<Intent, string> = {
  left: 'MOVE LEFT',
  right: 'MOVE RIGHT',
  'soft-drop': 'SOFT DROP',
  'hard-drop': 'HARD DROP',
  'rotate-cw': 'ROTATE CW',
  'rotate-ccw': 'ROTATE CCW',
  hold: 'HOLD',
  pause: 'PAUSE',
  confirm: 'CONFIRM',
  back: 'BACK',
  up: 'CURSOR UP',
  down: 'CURSOR DOWN',
  increment: 'INCREASE',
  decrement: 'DECREASE',
};

export const isBindableIntent = (value: unknown): value is Intent =>
  typeof value === 'string' && (BINDABLE_INTENTS as readonly string[]).includes(value);

/** Player one, and everything the single-player runs use. */
export const DEFAULT_BINDINGS: Bindings = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  'soft-drop': ['ArrowDown'],
  'hard-drop': ['Space'],
  'rotate-cw': ['KeyX'],
  'rotate-ccw': ['KeyZ'],
  hold: ['ShiftRight', 'KeyC'],
  pause: ['Enter'],
  confirm: ['Enter', 'KeyZ'],
  back: ['Escape', 'Backspace'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  increment: ['ArrowRight', 'KeyX'],
  decrement: ['ArrowLeft', 'KeyZ'],
};

/** Player two's half of the local versus game. */
export const P2_BINDINGS: Bindings = {
  left: ['KeyA'],
  right: ['KeyD'],
  'soft-drop': ['KeyS'],
  'hard-drop': ['KeyF'],
  'rotate-cw': ['KeyW'],
  'rotate-ccw': ['KeyE'],
  hold: ['KeyQ'],
  pause: ['KeyP'],
  confirm: ['Enter', 'KeyZ'],
  back: ['Escape'],
  up: ['KeyW'],
  down: ['KeyS'],
  increment: ['KeyD'],
  decrement: ['KeyA'],
};

const copy = (bindings: Bindings): Record<Intent, string[]> => {
  const out = {} as Record<Intent, string[]>;
  for (const intent of BINDABLE_INTENTS) out[intent] = [...(bindings[intent] ?? [])];
  return out;
};

export const cloneBindings = (bindings: Bindings): Bindings => copy(bindings);

/** Replaces missing rows with the defaults and drops anything unusable. */
export const normalizeBindings = (raw: unknown, base: Bindings = DEFAULT_BINDINGS): Bindings => {
  const out = copy(base);
  if (typeof raw !== 'object' || raw === null) return out;
  const source = raw as Record<string, unknown>;
  for (const intent of BINDABLE_INTENTS) {
    const value = source[intent];
    if (!Array.isArray(value)) continue;
    const keys: string[] = [];
    for (const code of value) {
      if (typeof code !== 'string' || code.length === 0) continue;
      if (!keys.includes(code)) keys.push(code);
    }
    if (keys.length > 0) out[intent] = keys;
  }
  return out;
};

/** First intent that claims `code`, in binding order. */
export const intentForCode = (bindings: Bindings, code: string): Intent | null => {
  for (const intent of BINDABLE_INTENTS) {
    if ((bindings[intent] ?? []).includes(code)) return intent;
  }
  return null;
};

/** Codes assigned to more than one intent, so the menu can warn about them. */
export const conflictsIn = (
  bindings: Bindings,
): readonly { code: string; intents: readonly Intent[] }[] => {
  const owners = new Map<string, Intent[]>();
  for (const intent of BINDABLE_INTENTS) {
    for (const code of bindings[intent] ?? []) {
      const list = owners.get(code) ?? [];
      list.push(intent);
      owners.set(code, list);
    }
  }
  const out: { code: string; intents: readonly Intent[] }[] = [];
  for (const [code, intents] of owners) if (intents.length > 1) out.push({ code, intents });
  return out;
};

/**
 * Assigns `code` to one slot of `intent`. Any other intent holding that code loses
 * it, so recording a key never leaves a hidden conflict behind.
 */
export const rebind = (bindings: Bindings, intent: Intent, code: string, slot = 0): Bindings => {
  const next = copy(bindings);
  for (const other of BINDABLE_INTENTS) {
    if (other === intent) continue;
    next[other] = next[other].filter((c) => c !== code);
  }
  const list = next[intent];
  const at = Math.max(0, Math.min(slot, Math.max(0, list.length - 1)));
  if (list.length === 0) list.push(code);
  else list[at] = code;
  next[intent] = [...new Set(list)];
  return next;
};

/** Removes one key assignment; the intent keeps any remaining aliases. */
export const unbind = (bindings: Bindings, intent: Intent, code: string): Bindings => {
  const next = copy(bindings);
  const list = next[intent].filter((c) => c !== code);
  next[intent] = list.length > 0 ? list : [...(DEFAULT_BINDINGS[intent] ?? [])];
  return next;
};
