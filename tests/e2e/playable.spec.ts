import { expect, test, type Page } from '@playwright/test';

/**
 * Playable-in-a-real-browser checks.
 *
 * The unit suite already proves the rules; these prove the presentation layer
 * actually runs: a canvas that paints, integer scaling, keyboard and mouse paths
 * from the title screen to a falling piece, and text a player can read.
 *
 * They read the scene machine through `?test=1`, which publishes the live objects
 * on `window`. Assertions ride on the frame model (what the renderer was told to
 * draw) rather than on screenshots, so a palette tweak cannot make the suite
 * flaky while a missing playfield still fails it.
 */

interface ActivePiece {
  readonly id: number;
  readonly rot: number;
  readonly x: number;
  readonly y: number;
}

interface BoxCall {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill?: string;
  readonly edge?: string;
}

interface FrameModel {
  readonly boxes?: readonly BoxCall[];
  readonly texts?: readonly { text: string }[];
  readonly fields?: readonly { active: ActivePiece | null }[];
}

interface Debug {
  readonly scene: string;
  readonly status: string | null;
  readonly seed: number;
  readonly countdown: number;
  readonly modeId: string | null;
  readonly lines: number;
  readonly score: number;
  readonly pieces: number;
}

interface Orbit {
  readonly scenes: {
    readonly scene: string;
    frame(): FrameModel;
    debug(): Debug;
  };
  readonly layout: { readonly scale: number };
}

const debug = (page: Page): Promise<Debug> =>
  page.evaluate(() => (window as unknown as { __orbit: Orbit }).__orbit.scenes.debug());

const frame = (page: Page): Promise<FrameModel> =>
  page.evaluate(() => (window as unknown as { __orbit: Orbit }).__orbit.scenes.frame());

const frameText = (page: Page): Promise<string> =>
  frame(page).then((model) => (model.texts ?? []).map((call) => call.text).join(' | '));

const gotoGame = async (page: Page): Promise<string[]> => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${String(error)}`));
  await page.goto('/?test=1');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('title');
  return problems;
};

/** Straight from the title screen into a live run, past the countdown. */
const startRun = async (page: Page): Promise<void> => {
  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('modes');
  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('rules');
  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('play');
  await expect
    .poll(() => debug(page).then((d) => d.countdown), { timeout: 10_000 })
    .toBe(0);
};

/**
 * Centre of the highlighted menu row, mapped through the canvas' own CSS box, so
 * the click lands where the screen says the row is rather than on a coordinate
 * that would silently drift with the layout.
 */
const cursorCentre = async (page: Page): Promise<{ x: number; y: number }> => {
  const point = await page.evaluate(() => {
    const model = (window as unknown as { __orbit: Orbit }).__orbit.scenes.frame();
    const bar = (model.boxes ?? []).find((b) => b.fill === 'fieldGrid' && b.edge === 'accent');
    if (!bar) return null;
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + ((bar.x + bar.w / 2) * rect.width) / 240,
      y: rect.top + ((bar.y + bar.h / 2) * rect.height) / 160,
    };
  });
  if (!point) throw new Error('no highlighted menu row to click');
  return point;
};

test('boots on the title screen, painting with no errors', async ({ page }) => {
  const problems = await gotoGame(page);
  expect(problems).toEqual([]);

  const backing = await page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    return { w: canvas.width, h: canvas.height, removed: !document.getElementById('boot-error') };
  });
  expect(backing).toEqual({ w: 240, h: 160, removed: true });

  const colours = (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.getElementById('screen') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      const data = ctx.getImageData(0, 0, 240, 160).data;
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        if (seen.size > 1) break;
      }
      return seen.size;
    });
  // The scene exists before the first animation frame is painted, so this polls
  // rather than reading once: an untouched backing store is a single flat colour.
  await expect.poll(colours, { timeout: 5_000 }).toBeGreaterThan(1);

  expect(await frameText(page)).toContain('ORBIT DROP');
  expect(await page.evaluate(() => document.title)).toBe('Orbit Drop');
});

test('scales the framebuffer by a whole number, preserving the aspect', async ({ page }) => {
  await gotoGame(page);
  for (const viewport of [
    { width: 960, height: 640 },
    { width: 500, height: 400 },
    { width: 1600, height: 1200 },
    { width: 420, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const box = await page.evaluate(() => {
      const canvas = document.getElementById('screen') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      return {
        cssW: rect.width,
        cssH: rect.height,
        scale: (window as unknown as { __orbit: Orbit }).__orbit.layout.scale,
      };
    });
    expect(Number.isInteger(box.scale), `scale ${String(box.scale)}`).toBeTruthy();
    expect(box.scale).toBeGreaterThanOrEqual(1);
    expect(box.cssW, `width at ${viewport.width}x${viewport.height}`).toBe(240 * box.scale);
    expect(box.cssH, `height at ${viewport.width}x${viewport.height}`).toBe(160 * box.scale);
  }
});

test('keyboard play: title to a piece that falls and locks', async ({ page }) => {
  const problems = await gotoGame(page);

  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('modes');
  expect(await frameText(page)).toContain('ASCENT');

  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('rules');
  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('play');

  const started = await debug(page);
  expect(started.status).toBe('playing');
  expect(started.modeId).toBe('goal-ladder');
  // Frames are withheld during the countdown, so nothing has fallen yet.
  expect(started.pieces).toBe(0);
  expect(started.countdown).toBeGreaterThan(0);

  await expect
    .poll(() => debug(page).then((d) => d.countdown), { timeout: 10_000 })
    .toBe(0);
  await expect
    .poll(() => debug(page).then((d) => d.pieces), { timeout: 20_000 })
    .toBeGreaterThan(0);

  const before = await debug(page);
  await page.keyboard.press('Space');
  await expect
    .poll(() => debug(page).then((d) => d.pieces), { timeout: 5_000 })
    .toBeGreaterThan(before.pieces);

  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.status)).toBe('paused');
  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.status)).toBe('playing');

  expect(problems).toEqual([]);
});

test('mouse play: clicking a row enters it, with no keyboard at all', async ({ page }) => {
  const problems = await gotoGame(page);

  // Title: the highlighted row is the only row, so the click has one outcome.
  const atTitle = await cursorCentre(page);
  await page.mouse.click(atTitle.x, atTitle.y);
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('modes');

  // A press activates the row *under the pointer*, and the pointer already moved
  // the cursor on its way in, so the highlighted row is the row that gets entered
  // — which may be one that starts immediately rather than showing its rules.
  const atMode = await cursorCentre(page);
  await page.mouse.click(atMode.x, atMode.y);
  await expect
    .poll(() => debug(page).then((d) => d.scene), { timeout: 5_000 })
    .toMatch(/^(rules|play)$/);

  if ((await debug(page)).scene === 'rules') {
    const atStart = await cursorCentre(page);
    await page.mouse.click(atStart.x, atStart.y);
  }
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('play');
  expect((await debug(page)).countdown).toBeGreaterThan(0);

  expect(problems).toEqual([]);
});

test('wheel and right-click turn the piece, without scrolling the page', async ({ page }) => {
  await gotoGame(page);
  await startRun(page);

  await page.locator('#screen').hover();

  const rotation = async (): Promise<number | null> => {
    const active = (await frame(page)).fields?.[0]?.active ?? null;
    return active === null ? null : active.rot;
  };

  const first = await rotation();
  expect(first, 'the run has no active piece to turn').not.toBeNull();
  await page.mouse.wheel(0, -120);
  await expect.poll(rotation, { timeout: 5_000 }).not.toBe(first);

  const turned = await rotation();
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect.poll(rotation, { timeout: 5_000 }).not.toBe(turned);

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('player-facing text never carries the reference branding', async ({ page }) => {
  const problems = await gotoGame(page);
  const forbidden = ['tetris', 'game boy', 'gba', 'marathon', 'ultra', 'novice', 'master challenge'];
  const body = await page.evaluate(() => document.body.innerText);

  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('modes');
  const modes = await frameText(page);
  await page.keyboard.press('ArrowDown');
  const moved = await frameText(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => debug(page).then((d) => d.scene)).toBe('title');

  for (const [name, text] of [
    ['title', `${await frameText(page)} ${body}`],
    ['mode list', modes],
    ['mode list with the cursor moved', moved],
  ] as const) {
    for (const word of forbidden) {
      expect(text.toLowerCase(), `${name} shows "${word}"`).not.toContain(word);
    }
  }
  expect(modes).toContain('ASCENT');
  expect(problems).toEqual([]);
});

test('a hidden tab pauses a live run', async ({ page }) => {
  const problems = await gotoGame(page);
  await startRun(page);
  await expect.poll(() => debug(page).then((d) => d.status), { timeout: 10_000 }).toBe('playing');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: (): string => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => debug(page).then((d) => d.status), { timeout: 5_000 }).toBe('paused');
  expect(problems).toEqual([]);
});
