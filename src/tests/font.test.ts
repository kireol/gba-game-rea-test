import { describe, expect, it } from 'vitest';
import {
  FONT_ADVANCE_X,
  FONT_ADVANCE_Y,
  FONT_H,
  FONT_W,
  canRender,
  drawText,
  glyphRows,
  textWidth,
  wrapText,
} from '../render/font5x7.js';
import { MODES } from '../modes/registry.js';
import { makeCanvas } from './render-harness.js';
import { makeHarness, openRules, unlockAll, type Harness } from './scenes-harness.js';

/**
 * The 5×7 table, and the one place it can fail quietly.
 *
 * `drawText` does not warn about a character it has no glyph for — it skips the
 * glyph and keeps walking, so a missing character turns into a hole in a label
 * that nobody notices until someone reads the screen and sees `GOAL  CLEARED`.
 * That is the failure this file exists to prevent, and it is why the last section
 * checks the font against the strings the game actually asks for rather than
 * against the table alone.
 *
 * The table itself is module-private on purpose (it is art, not an interface), so
 * everything here goes through the public surface: probe the printable range with
 * `glyphRows` and `canRender`, and check the geometry through `drawText` on the
 * recording canvas from `render-harness.ts`.
 */

const PRINTABLE = Array.from({ length: 127 - 32 }, (_, i) => String.fromCharCode(32 + i));
const renderable = PRINTABLE.filter((ch) => glyphRows(ch) !== undefined);
const unprintableChars = PRINTABLE.filter((ch) => glyphRows(ch) === undefined);

/** Characters the table deliberately leaves out. Keep this list short and named. */
const KNOWN_EMPTY = ['"', '$', '[', ']', '`', '~'];

/** Distinct drawings, counted on the keys only — lowercase borrows the capital. */
const distinct = (): Map<string, string> => {
  const seen = new Map<string, string>();
  for (const ch of renderable) {
    if (ch.toLowerCase() !== ch) continue;
    const key = (glyphRows(ch) ?? []).join('/');
    if (!seen.has(key)) seen.set(key, ch);
  }
  return seen;
};

describe('the shape of the table', () => {
  it('is a 5×7 field of inked and uninked pixels only', () => {
    const malformed: string[] = [];
    for (const ch of renderable) {
      const rows = glyphRows(ch) ?? [];
      if (rows.length !== FONT_H || rows.some((r) => r.length !== FONT_W || /[^#.]/.test(r))) {
        malformed.push(ch);
      }
    }
    expect(malformed.join(''), `${malformed.join('')} has a malformed glyph`).toBe('');
  });

  it('spans the printable range except for a short, named gap', () => {
    expect(unprintableChars).toEqual(KNOWN_EMPTY);
    // 32..126 inclusive, less the gap above.
    expect(renderable).toHaveLength(95 - KNOWN_EMPTY.length);
  });

  it('has no two characters sharing a drawing', () => {
    expect(distinct().size).toBe(renderable.filter((c) => c.toLowerCase() === c).length);
  });

  it('draws nothing but whitespace for a space, and nothing else does', () => {
    const uninked = renderable.filter((ch) => !(glyphRows(ch) ?? []).some((r) => r.includes('#')));
    expect(uninked).toEqual([' ']);
  });

  it('borrows the capital for lowercase, which is also the atlas key', () => {
    // The atlas is indexed by key, so a caller that indexes by the character's own
    // code would blit an empty slot for every lowercase label.
    expect(glyphRows('a')).toBe(glyphRows('A'));
    expect(glyphRows('z')).toBe(glyphRows('Z'));
    expect(canRender('aBc123')).toBe(true);
    expect(canRender('')).toBe(true);
  });
});

describe('what the font refuses to draw', () => {
  const unsupported = ['×', '°', '→', '♥', 'é', '—', '’'];

  it('has no glyph outside ASCII, by decision', () => {
    // A 5×7 hand-drawn table has to draw every glyph by hand, so the range is a
    // decision, not an accident: labels are written in ASCII and the multiply sign
    // in text becomes `x`, arrows become `->`. If a non-ASCII character ever
    // reaches a label, `drawText` will drop it silently — which is what the last
    // section of this file guards against.
    expect(unsupported.filter((ch) => canRender(ch))).toEqual([]);
    expect(unsupported.every((ch) => glyphRows(ch) === undefined)).toBe(true);
  });
});

describe('measuring', () => {
  it('counts the advance, minus the trailing gap', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('A')).toBe(FONT_W);
    expect(textWidth('AB')).toBe(FONT_ADVANCE_X * 2 - 1);
    expect(textWidth('AB', 2)).toBe((FONT_ADVANCE_X * 2 - 1) * 2);
  });

  it('lines up on 6 across and 8 down', () => {
    expect([FONT_ADVANCE_X, FONT_ADVANCE_Y]).toEqual([FONT_W + 1, FONT_H + 1]);
  });
});

describe('drawText', () => {
  /** One inked pixel as the recording captured it. Named so indexing gives a number. */
  type Pixel = [x: number, y: number, w: number, h: number];

  const drawn = (
    text: string,
    x = 0,
    y = 0,
    opts: Parameters<typeof drawText>[5] = {},
  ): Pixel[] => {
    const fake = makeCanvas();
    drawText(fake.ctx, text, x, y, '#ffffff', opts);
    return fake.fills.map((f): Pixel => [f.x, f.y, f.w, f.h]);
  };

  const inkColumns = (text: string, opts: Parameters<typeof drawText>[5] = {}): number[] =>
    [...new Set(drawn(text, 0, 0, opts).map((f) => f[0]))].sort((a, b) => a - b);

  it('puts one rectangle per inked pixel of every glyph', () => {
    const a = drawn('A');
    const rows = glyphRows('A') ?? [];
    const ink = rows.reduce((n, r) => n + [...r].filter((p) => p === '#').length, 0);
    expect(a).toHaveLength(ink);
    expect(rows[0]).toBe('.###.');
    expect(a.slice(0, 3)).toEqual([
      [1, 0, 1, 1],
      [2, 0, 1, 1],
      [3, 0, 1, 1],
    ]);
  });

  it('sets the colour on the context instead of on the call', () => {
    const fake = makeCanvas();
    drawText(fake.ctx, 'A', 0, 0, '#123456');
    expect(fake.ctx.fillStyle).toBe('#123456');
  });

  it('advances 6 per character, scaled together with the pixels', () => {
    expect(inkColumns('!!')).toEqual([2, 8]);
    const scaled = drawn('!!', 0, 0, { scale: 2 });
    expect(scaled[0]).toEqual([4, 0, 2, 2]);
    expect([...new Set(scaled.map((f) => f[0]))]).toEqual([4, 16]);
  });

  it('aligns around the width it just measured', () => {
    const width = textWidth('EE');
    const leftEdge = (align: 'left' | 'center' | 'right'): number | undefined =>
      drawn('EE', 100, 0, { align })[0]?.[0];
    expect([leftEdge('left'), leftEdge('center'), leftEdge('right')]).toEqual([
      100,
      Math.round(100 - width / 2),
      100 - width,
    ]);
  });

  it('skips a glyph it lacks but keeps its column', () => {
    // The hole this leaves is the whole reason for the section below: the string
    // still occupies its full advance, so a missing character reads as a double
    // space instead of closing up the label around it.
    const xs = inkColumns('A"B');
    expect(canRender('A"B')).toBe(false);
    expect(canRender('AB')).toBe(true);
    expect(xs.filter((x) => x >= FONT_W && x < FONT_ADVANCE_X * 2)).toEqual([]);
    expect(Math.min(...xs.filter((x) => x >= FONT_ADVANCE_X * 2))).toBe(12);
  });
});

describe('wrapText', () => {
  it('breaks on whole words and never leaves a word behind', () => {
    expect(wrapText('ONE TWO THREE', 7)).toEqual(['ONE TWO', 'THREE']);
    expect(wrapText('', 10)).toEqual(['']);
    expect(wrapText('   spaced   out  ', 20)).toEqual(['spaced out']);
  });

  it('gives an over-long word a line of its own instead of splitting it', () => {
    expect(wrapText('HI ANTOINE HI', 6)).toEqual(['HI', 'ANTOINE', 'HI']);
  });

  it('keeps a hard newline', () => {
    expect(wrapText('A\nB', 10)).toEqual(['A', 'B']);
  });

  it('fits the rules column at its real width', () => {
    // 40 characters is the framebuffer's limit at 6px per glyph, which is what the
    // rules screens wrap to; a line that wraps differently here wraps differently
    // on screen.
    expect(wrapText('CLEAR LINES TO MEET THE GOAL BEFORE THE PIECE BAG RUNS OUT', 39)).toEqual([
      'CLEAR LINES TO MEET THE GOAL BEFORE THE',
      'PIECE BAG RUNS OUT',
    ]);
  });
});

describe('the strings the game asks the font to draw', () => {
  /**
   * Frames withheld before a run starts falling; the run suite documents it.
   */
  const COUNTDOWN = 180;

  /**
   * Every string the scene machine ever puts in front of the font.
   *
   * This walks the screens rather than scanning the source for string literals: a
   * scan cannot tell a label from a comment or a diagnostic, and it misses anything
   * assembled at run time, like the score lines. What it cannot do is see a glyph
   * the screen never reached — the rules card wraps its prose, and only the rows
   * that fit are drawn, so scrolling is part of the walk.
   */
  const collect = (): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    const take = (h: Harness): void => {
      for (const value of [...h.texts(), ...h.announcements]) {
        if (seen.has(value)) continue;
        seen.add(value);
        out.push(value);
      }
      h.clearLog();
    };
    const fresh = (): Harness => makeHarness(unlockAll());

    take(fresh()); // title

    const scores = fresh();
    scores.moveTo(1);
    scores.confirm();
    take(scores); // high scores

    // Every options row, opened from a fresh record each time so one row's toggle
    // cannot move the next row's cursor. This is the route into the key-bindings
    // editor and the erase confirmation without hardcoding either row's index.
    for (let row = 0; row < 8; row += 1) {
      const h = fresh();
      h.moveTo(2);
      h.confirm();
      take(h); // options
      h.moveTo(row);
      h.confirm();
      take(h); // whatever that row opens
      h.press('increment');
      h.press('decrement');
      take(h);
    }

    for (let mode = 0; mode < MODES.length; mode += 1) {
      const h = fresh();
      openRules(h, mode);
      take(h); // rules card, first screenful
      h.pressN('down', 4);
      take(h); // rules card, scrolled
      h.moveTo(0);
      h.confirm();
      take(h); // countdown
      h.scenes.advance(COUNTDOWN);
      take(h); // live HUD
      h.press('pause');
      take(h); // pause menu
      // Nobody touches the keyboard, so the stack rises until the run tops out.
      h.scenes.advance(9_000);
      take(h); // results
    }

    const locked = makeHarness(); // the unlock chain's own copy of "you cannot in yet"
    for (let row = 1; row < MODES.length; row += 1) {
      locked.moveTo(row);
      locked.confirm();
      take(locked);
    }
    return out;
  };

  it('has a glyph for every character on every screen', () => {
    const strings = collect();
    const blind = strings.filter((value) => !canRender(value));
    const holes = new Set<string>();
    for (const value of blind) {
      for (const ch of [...value]) if (!canRender(ch)) holes.add(ch);
    }
    // A walk that reached nothing would pass an empty `blind`, so pin that it
    // really did collect a whole game's worth of copy.
    expect(strings.length).toBeGreaterThan(120);
    expect(blind, `no glyph for "${[...holes].join('')}" in:\n${blind.join('\n')}`).toEqual([]);
  });
});
