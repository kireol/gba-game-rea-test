import { describe, expect, it } from 'vitest';
import {
  BINDABLE_INTENTS,
  DEFAULT_BINDINGS,
  INTENT_LABELS,
  P2_BINDINGS,
  cloneBindings,
  conflictsIn,
  intentForCode,
  isBindableIntent,
  normalizeBindings,
  rebind,
  unbind,
} from '../engine/bindings.js';
import type { Bindings } from '../engine/bindings.js';
import type { Intent } from '../engine/types.js';

const codesOf = (bindings: Bindings): string[] =>
  BINDABLE_INTENTS.flatMap((intent) => bindings[intent] ?? []);

const intentsClaiming = (bindings: Bindings, code: string): Intent[] =>
  BINDABLE_INTENTS.filter((intent) => (bindings[intent] ?? []).includes(code));

describe('the binding table', () => {
  it('gives every bindable intent a label and a default row', () => {
    expect(new Set(BINDABLE_INTENTS).size).toBe(BINDABLE_INTENTS.length);
    for (const intent of BINDABLE_INTENTS) {
      expect(INTENT_LABELS[intent], `label for ${intent}`).toBeTruthy();
      expect(DEFAULT_BINDINGS[intent].length, `default keys for ${intent}`).toBeGreaterThan(0);
      expect(P2_BINDINGS[intent].length, `p2 keys for ${intent}`).toBeGreaterThan(0);
    }
    // The tables are typed `Record<Intent, …>`, so TypeScript already forces a
    // row per intent. This pins the *runtime* key set, which is what the
    // settings screen iterates when it builds its rows.
    expect(Object.keys(DEFAULT_BINDINGS).sort()).toEqual([...BINDABLE_INTENTS].sort());
    expect(Object.keys(P2_BINDINGS).sort()).toEqual([...BINDABLE_INTENTS].sort());
    expect(Object.keys(INTENT_LABELS).sort()).toEqual([...BINDABLE_INTENTS].sort());
  });

  it('recognises only the intents a user may bind', () => {
    for (const intent of BINDABLE_INTENTS) expect(isBindableIntent(intent)).toBe(true);
    for (const value of ['jump', '', ' left', 'LEFT', 42, null, undefined, {}, ['left']]) {
      expect(isBindableIntent(value), `rejects ${String(value)}`).toBe(false);
    }
  });

  it('resolves a code to the first intent that claims it', () => {
    // The order of BINDABLE_INTENTS is the resolution order, and it matters:
    // `Enter` is both PAUSE and CONFIRM, `ArrowDown` both SOFT DROP and CURSOR
    // DOWN. Whichever row comes first wins, and the scenes depend on that.
    expect(intentForCode(DEFAULT_BINDINGS, 'Enter')).toBe('pause');
    expect(intentForCode(DEFAULT_BINDINGS, 'ArrowDown')).toBe('soft-drop');
    expect(intentForCode(DEFAULT_BINDINGS, 'KeyZ')).toBe('rotate-ccw');
    expect(intentForCode(DEFAULT_BINDINGS, 'KeyA')).toBeNull(); // player two's key
    expect(intentForCode(P2_BINDINGS, 'KeyA')).toBe('left');
    expect(intentForCode(DEFAULT_BINDINGS, 'F13')).toBeNull();
  });

  it('lists the codes claimed more than once, in first-claim order', () => {
    const conflicts = conflictsIn(DEFAULT_BINDINGS);
    // The defaults are deliberately overloaded between the play rows and the
    // menu rows: the same key means different things in different scenes.
    expect(conflicts.map((c) => c.code)).toEqual([
      'ArrowLeft',
      'ArrowRight',
      'ArrowDown',
      'KeyX',
      'KeyZ',
      'Enter',
    ]);
    for (const entry of conflicts) {
      expect(entry.intents).toEqual(intentsClaiming(DEFAULT_BINDINGS, entry.code));
    }
    expect(conflicts.find((c) => c.code === 'KeyZ')?.intents).toEqual([
      'rotate-ccw',
      'confirm',
      'decrement',
    ]);
    // Insertion order follows each code's *first* sighting, not the moment the
    // collision happened to appear: KeyA is left's key long before decrement
    // borrows it, so it is still the first entry.
    expect(conflictsIn(P2_BINDINGS).map((c) => c.code)).toEqual(['KeyA', 'KeyD', 'KeyS', 'KeyW']);
  });

  it('reports nothing once every code is unique', () => {
    const clean = {} as Record<Intent, string[]>;
    BINDABLE_INTENTS.forEach((intent, index) => {
      clean[intent] = [`Key${index}`];
    });
    expect(conflictsIn(clean)).toEqual([]);
    // A code repeated inside one row counts twice, so the row is reported against
    // itself. Unreachable through the UI — `normalizeBindings` and `rebind` both
    // de-duplicate a row — but a hand-edited table would show a self-conflict.
    expect(conflictsIn({ ...clean, left: ['Key0', 'Key0'] })).toEqual([
      { code: 'Key0', intents: ['left', 'left'] },
    ]);
  });

  it('shares only menu keys between the two players', () => {
    // A versus run dispatches one key event through both players' maps, so a
    // shared code fires for both. `Enter` and `Escape` are meant to be shared;
    // `KeyZ` is P1's rotate-ccw *and* P2's confirm. The key-bindings screen
    // edits player one only, so no user can create or fix that today — pinned so
    // the overlap stays a known fact rather than a surprise.
    const p1 = new Set(codesOf(DEFAULT_BINDINGS));
    const shared = [...new Set(codesOf(P2_BINDINGS))].filter((code) => p1.has(code));
    expect(shared.sort()).toEqual(['Enter', 'Escape', 'KeyZ']);
  });
});

describe('normalizing saved bindings', () => {
  it('replaces anything unusable with the defaults it started from', () => {
    for (const raw of [undefined, null, 42, 'left', ['left'], true, Number.NaN]) {
      expect(normalizeBindings(raw)).toEqual(DEFAULT_BINDINGS);
    }
  });

  it('keeps the base it was given', () => {
    expect(normalizeBindings({}, P2_BINDINGS)).toEqual(P2_BINDINGS);
    expect(normalizeBindings(null, P2_BINDINGS)).toEqual(P2_BINDINGS);
  });

  it('merges a partially valid save over the base and drops the rest', () => {
    const merged = normalizeBindings({
      left: ['KeyJ'],
      right: [], // An empty row falls back rather than leaving the intent dead.
      hold: ['KeyC', 'KeyC', '', 7, null, 'ShiftRight'], // Duplicates and junk.
      pause: 'Enter', // Not an array.
      up: ['KeyI', 'ArrowUp'],
      'not-an-intent': ['KeyQ'],
    });
    expect(merged.left).toEqual(['KeyJ']);
    expect(merged.right).toEqual(DEFAULT_BINDINGS.right);
    expect(merged.hold).toEqual(['KeyC', 'ShiftRight']);
    expect(merged.pause).toEqual(DEFAULT_BINDINGS.pause);
    expect(merged.up).toEqual(['KeyI', 'ArrowUp']);
    expect(Object.keys(merged).sort()).toEqual([...BINDABLE_INTENTS].sort());
    expect('not-an-intent' in merged).toBe(false);
  });

  it('hands back a deep copy, so a caller cannot corrupt the tables', () => {
    const normalized = normalizeBindings(DEFAULT_BINDINGS);
    const clone = cloneBindings(DEFAULT_BINDINGS);
    // Fresh arrays, not the table's own rows aliased behind a new object.
    for (const intent of BINDABLE_INTENTS) {
      expect(clone[intent], `cloned row for ${intent}`).not.toBe(DEFAULT_BINDINGS[intent]);
      expect(normalized[intent], `normalized row for ${intent}`).not.toBe(
        DEFAULT_BINDINGS[intent],
      );
    }
    clone.hold = [...clone.hold, 'KeyV'];
    normalized.left = [...normalized.left, 'KeyJ'];
    expect(DEFAULT_BINDINGS.left).toEqual(['ArrowLeft']);
    expect(DEFAULT_BINDINGS.hold).toEqual(['ShiftRight', 'KeyC']);
    expect(P2_BINDINGS.hold).toEqual(['KeyQ']);
    expect(cloneBindings(P2_BINDINGS)).toEqual(P2_BINDINGS);
  });
});

describe('rebinding', () => {
  it('moves a code out of every other intent', () => {
    // `KeyZ` starts life in three rows. Recording it for HARD DROP must not
    // leave three silent owners behind.
    const next = rebind(DEFAULT_BINDINGS, 'hard-drop', 'KeyZ');
    expect(next['hard-drop']).toContain('KeyZ');
    expect(intentsClaiming(next, 'KeyZ')).toEqual(['hard-drop']);
    expect(conflictsIn(next).some((c) => c.code === 'KeyZ')).toBe(false);
    // A row that loses a code keeps any alias it still has…
    expect(next.confirm).toEqual(['Enter']);
    expect(next.decrement).toEqual(['ArrowLeft']);
    // …and may end up empty, which is why `unbind` has a fallback and `rebind`
    // deliberately does not: the user asked for exactly this.
    expect(next['rotate-ccw']).toEqual([]);
  });

  it('writes the requested slot and keeps the other aliases', () => {
    expect(rebind(DEFAULT_BINDINGS, 'hold', 'KeyV', 0).hold).toEqual(['KeyV', 'KeyC']);
    expect(rebind(DEFAULT_BINDINGS, 'hold', 'KeyV', 1).hold).toEqual(['ShiftRight', 'KeyV']);
    expect(rebind(DEFAULT_BINDINGS, 'hold', 'KeyV').hold).toEqual(['KeyV', 'KeyC']); // slot 0
  });

  it('clamps the slot instead of growing the row', () => {
    expect(rebind(DEFAULT_BINDINGS, 'hold', 'KeyV', 9).hold).toEqual(['ShiftRight', 'KeyV']);
    expect(rebind(DEFAULT_BINDINGS, 'hold', 'KeyV', -3).hold).toEqual(['KeyV', 'KeyC']);
    expect(rebind({ ...DEFAULT_BINDINGS, hold: [] }, 'hold', 'KeyV', 4).hold).toEqual(['KeyV']);
  });

  it('collapses the row when the recorded code already lives in another slot', () => {
    // Known wart, and user-reachable from the key-bindings screen: recording
    // `KeyC` into slot 0 of HOLD overwrites that slot with a duplicate, and the
    // de-duplicating pass then removes one copy along with the alias that held
    // it. The row keeps a working key either way, so nothing is unplayable.
    const next = rebind(DEFAULT_BINDINGS, 'hold', 'KeyC', 0);
    expect(next.hold).toEqual(['KeyC']);
    expect(next.hold).not.toContain('ShiftRight');
  });

  it('does not mutate the bindings it was given', () => {
    const before = cloneBindings(DEFAULT_BINDINGS);
    rebind(DEFAULT_BINDINGS, 'left', 'KeyJ');
    rebind(DEFAULT_BINDINGS, 'hold', 'KeyV', 9);
    expect(DEFAULT_BINDINGS).toEqual(before);
  });
});

describe('unbinding', () => {
  it('keeps the remaining aliases', () => {
    expect(unbind(DEFAULT_BINDINGS, 'hold', 'ShiftRight').hold).toEqual(['KeyC']);
    expect(unbind(DEFAULT_BINDINGS, 'confirm', 'KeyZ').confirm).toEqual(['Enter']);
  });

  it('falls back to the default row rather than leaving an intent with no key', () => {
    expect(unbind(DEFAULT_BINDINGS, 'hard-drop', 'Space')['hard-drop']).toEqual(
      DEFAULT_BINDINGS['hard-drop'],
    );
    // A deliberate wrinkle worth knowing: the fallback is the *default* table's
    // row, not the row of the base the bindings came from. Unbinding player
    // two's only LEFT key therefore hands player two player one's `ArrowLeft`.
    // Nothing reaches this today — the key-bindings screen edits player one
    // only — but the day P2 becomes editable it needs a fallback of its own.
    const p2 = unbind(P2_BINDINGS, 'left', 'KeyA');
    expect(p2.left).toEqual(DEFAULT_BINDINGS.left);
    expect(p2.left).not.toEqual(['KeyA']);
  });

  it('does not mutate the bindings it was given', () => {
    const before = cloneBindings(P2_BINDINGS);
    unbind(P2_BINDINGS, 'hold', 'KeyQ');
    unbind(P2_BINDINGS, 'left', 'KeyA');
    expect(P2_BINDINGS).toEqual(before);
  });
});
