import { expect, test, type Page } from '@playwright/test';

/**
 * The single-file page runs from the filesystem.
 *
 * `dist/orbit-drop.html` is the artifact a player double-clicks: one file, no
 * server, no install. None of this is checkable in Node, because the thing under
 * test is what a `file://` origin will and will not do — a module script it
 * refuses to fetch, a `localStorage` it may deny, and any request the page makes
 * for a file that did not travel with it.
 *
 * The artifact comes from `npm run build:single`, which the config's `webServer`
 * runs before the suite, so it always matches these sources.
 */

interface Debug {
  readonly scene: string;
}

interface Orbit {
  readonly scenes: { readonly debug: () => Debug };
}

const debug = (page: Page): Promise<Debug> =>
  page.evaluate(() => (window as unknown as { __orbit: Orbit }).__orbit.scenes.debug());

const scene = (page: Page): Promise<string> =>
  page.evaluate(
    () => (window as unknown as { __orbit?: Orbit }).__orbit?.scenes.debug().scene ?? '(not booted)',
  );

const errors = (page: Page): string[] => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${String(error)}`));
  return problems;
};

/**
 * Derived from the spec file's own location so the test reads the artifact this
 * checkout just built, never a copy from elsewhere. POSIX-only, like the shell
 * helpers in `scripts/`.
 */
const urlFor = (specFile: string): string => {
  const repo = specFile.slice(0, specFile.indexOf('/tests/e2e/'));
  return encodeURI(`file://${repo}/dist/orbit-drop.html?test=1`);
};

test('opens from file:// with no server, fetching nothing but itself', async ({ page }, testInfo) => {
  const url = urlFor(testInfo.file);
  const problems = errors(page);
  const fetched: string[] = [];
  page.on('request', (request) => {
    if (request.url() !== url) fetched.push(request.url());
  });

  await page.goto(url);
  await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('title');

  expect(fetched, 'the page asked for something that did not travel with it').toEqual([]);
  expect(problems).toEqual([]);

  const shell = await page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    return {
      scripts: [...document.querySelectorAll('script')].map((s) => s.getAttribute('src')),
      links: [...document.querySelectorAll('link[href]')].map((l) => l.getAttribute('href')),
      canvas: { w: canvas.width, h: canvas.height },
      // A clean boot removes the fallback panel, so its absence is the pass signal.
      bootErrorRemoved: !document.getElementById('boot-error'),
      title: document.title,
    };
  });
  expect(shell).toEqual({
    scripts: [null],
    links: [],
    canvas: { w: 240, h: 160 },
    bootErrorRemoved: true,
    title: 'Orbit Drop',
  });

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
  // An untouched backing store is one flat colour, so this polls rather than reads once.
  await expect.poll(colours, { timeout: 5_000 }).toBeGreaterThan(1);
});

test('plays from file://: the title screen answers the keyboard', async ({ page }, testInfo) => {
  const problems = errors(page);

  await page.goto(urlFor(testInfo.file));
  await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('title');

  await page.keyboard.press('Enter');
  await expect.poll(() => debug(page).then((d) => d.scene), { timeout: 5_000 }).toBe('modes');

  expect(problems).toEqual([]);
});
