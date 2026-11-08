import type { FrameModel } from '../render/frame.js';
import type { GameStatus, HudField, Intent, SessionEvent, SfxName } from '../engine/types.js';
import { DEFAULT_CONFIG, VIEW } from '../engine/config.js';
import { randomSeed, seedToString } from '../engine/random.js';
import {
  BINDABLE_INTENTS,
  DEFAULT_BINDINGS,
  INTENT_LABELS,
  cloneBindings,
  conflictsIn,
  rebind,
  unbind,
  type Bindings,
} from '../engine/bindings.js';
import { createSession, type Session, type SessionView } from '../gameplay/session.js';
import { createDuel, type Duel, type DuelSideId } from '../gameplay/duel.js';
import { MODES } from '../modes/registry.js';
import type { ModePlugin } from '../modes/types.js';
import {
  clearedProgress,
  isBest,
  progressFor,
  recordRun,
  type RunSummary,
  type SaveData,
} from '../gameplay/persistence.js';
import { wrapText } from '../render/font5x7.js';
import {
  OPTION_ROWS,
  applyPrefs,
  configFor,
  optionValue,
  prefsOf,
  setSlider,
  stepOption,
  type OptionRow,
  type Prefs,
} from './options.js';
import { difficultyLabel, formatScore, formatTime, ordinal } from './format.js';
import {
  PANEL,
  SCREEN,
  drawCard,
  drawFooter,
  drawHeader,
  drawMenu,
  draft,
  menuRects,
  rowUnderPoint,
  type Draft,
  type MenuItem,
  type MenuGeom,
} from './widgets.js';

/**
 * The screen state machine.
 *
 * A scene owns the run (a `Session`, or two of them for the local two-player
 * mode) and turns it into a `FrameModel`; it never touches a canvas, the DOM or
 * storage. Everything the outside world has to do goes through `host`, which
 * makes the whole navigation flow assertable in a unit test with a stub host and
 * no browser — the same property that makes the rules core testable.
 *
 * Persistence stays in `persistence.ts`: this file only decides *when* a record
 * changes and hands the new `SaveData` to `host.commit`.
 */

export type SceneId =
  | 'title'
  | 'modes'
  | 'rules'
  | 'play'
  | 'duel'
  | 'results'
  | 'options'
  | 'bindings'
  | 'scores'
  | 'confirm';

export interface SceneHost {
  sfx(name: SfxName): void;
  /** Lets the app follow the run's status (music, fullscreen cursor, ...). */
  status(status: GameStatus): void;
  /** Persist a whole new save record. The scene already applied the change. */
  commit(data: SaveData): void;
  /** `aria-live` text for screen readers. */
  announce(text: string): void;
  /** Whether records actually reach durable storage (false in private mode). */
  persisted(): boolean;
  now(): number;
}

export type PointerAction = 'hover' | 'press';

export interface Scenes {
  readonly scene: SceneId;
  frame(): FrameModel;
  /** Pump the world. Only the play scenes consume frames. */
  advance(frames: number): void;
  /** Keyboard/pointer intents; `player` is 2 only for the local versus run. */
  intent(intent: Intent, down: boolean, player?: 1 | 2): boolean;
  /** Raw `KeyboardEvent.code`, delivered before intent mapping. Used to capture a key. */
  key(code: string, down: boolean): boolean;
  /** Framebuffer coordinates (0…240 / 0…160), not CSS pixels. */
  pointer(x: number, y: number, action: PointerAction): boolean;
  /** Called when the browser tab hides itself, so a run cannot fall while unwatched. */
  blur(): void;
  /**
   * Read-only state for the browser tests and a future debug overlay. Playwright
   * could pixel-match instead, but then a palette tweak would look like a broken
   * game, so the assertions ride on the state machine itself.
   */
  debug(): SceneDebug;
}

export interface SceneDebug {
  readonly scene: SceneId;
  /** The live run's status, or null on a screen that has no run. */
  readonly status: GameStatus | null;
  readonly seed: number;
  /** Frames withheld before the run starts falling. */
  readonly countdown: number;
  readonly modeId: string | null;
  readonly lines: number;
  readonly score: number;
  readonly level: number;
  readonly pieces: number;
}

/** `3 2 1 GO` before a run. Frames are withheld from the session, not paused, so
 * the run itself stays bit-identical to an un-counted one. */
const COUNT_STEPS = ['3', '2', '1', 'GO'];
const COUNT_FRAMES = 45;
const COUNTDOWN = COUNT_STEPS.length * COUNT_FRAMES;

const PLAY_ITEMS = ['RESUME', 'RESTART', 'OPTIONS', 'MODE LIST'] as const;
const TITLE_ITEMS = ['PLAY', 'HIGH SCORES', 'OPTIONS'] as const;
const RULES_ITEMS = ['START RUN', 'MODE LIST'] as const;
const RESULTS_ITEMS = ['RUN AGAIN', 'MODE LIST'] as const;
const CONFIRM_ITEMS = ['ERASE EVERYTHING', 'KEEP MY RECORDS'] as const;

/** Default playfield width in pixels; banners centre on it. */
const FIELD_W = DEFAULT_CONFIG.cols * VIEW.cell;

const MODE_LABEL_WIDTH = 13;

interface LastRun {
  readonly summary: RunSummary;
  readonly record: boolean;
  readonly rank: number | null;
  readonly view: SessionView | null;
  readonly duelWinner: DuelSideId | null;
}

const clampIndex = (value: number, count: number): number =>
  count <= 0 ? 0 : ((value % count) + count) % count;

const shortLabel = (label: string): string =>
  label.length <= MODE_LABEL_WIDTH ? label : `${label.slice(0, MODE_LABEL_WIDTH - 1)}...`;

const sameSeed = (view: SessionView | null): number => view?.seed ?? randomSeed();

export const createScenes = (host: SceneHost, initial: SaveData): Scenes => {
  let data = initial;
  let scene: SceneId = 'title';
  let prefs = prefsOf(data);
  const cursors: Record<SceneId, number> = {
    title: 0,
    modes: 0,
    rules: 0,
    play: 0,
    duel: 0,
    results: 0,
    options: 0,
    bindings: 0,
    scores: 0,
    confirm: 1,
  };

  let mode: ModePlugin | null = null;
  let seed = randomSeed();
  let session: Session | null = null;
  let duel: Duel | null = null;
  let countdown = 0;
  let lastRun: LastRun | null = null;
  let optionsReturn: SceneId = 'title';
  let capturing: Intent | null = null;
  let banner: { text: string; frames: number } | null = null;
  let attacks: Record<DuelSideId, number> = { a: 0, b: 0 };
  let lastStatus: GameStatus = 'ready';
  let tick = 0;
  let shake = 0;

  const sfx = (name: SfxName): void => host.sfx(name);

  const emitStatus = (): void => {
    const view = session?.snapshot().status ?? duel?.a.snapshot().status ?? lastStatus;
    if (view === lastStatus) return;
    lastStatus = view;
    host.status(view);
  };

  const setBanner = (text: string, frames = 90): void => {
    banner = { text, frames };
  };

  const go = (next: SceneId, announcement?: string): void => {
    scene = next;
    if (next !== 'play' && next !== 'duel') session = null;
    if (next !== 'duel') duel = null;
    const said =
      announcement ??
      {
        title: 'ORBIT DROP. TITLE SCREEN',
        modes: 'MODE LIST',
        rules: `${mode?.label ?? 'MODE'}. RULES CARD`,
        play: 'RUN STARTING',
        duel: 'TWO PLAYER RUN STARTING',
        results: 'RUN OVER. RESULTS',
        options: 'OPTIONS',
        bindings: 'CONTROLS',
        scores: 'HIGH SCORES',
        confirm: 'CONFIRM ERASING RECORDS',
      }[next];
    host.announce(said);
  };

  // ---- run lifecycle ---------------------------------------------------------

  const buildConfig = () => configFor(prefs.settings, prefs.assist);

  const startRun = (plugin: ModePlugin, runSeed: number): void => {
    mode = plugin;
    seed = runSeed >>> 0;
    attacks = { a: 0, b: 0 };
    banner = null;
    if (plugin.family === 'versus') {
      duel = createDuel({ seed, config: buildConfig(), difficulty: prefs.settings.difficulty });
      go('duel');
    } else {
      session = createSession({
        mode: plugin,
        seed,
        config: buildConfig(),
        difficulty: prefs.settings.difficulty,
      });
      go('play');
    }
    countdown = COUNTDOWN;
    emitStatus();
  };

  const summaryOf = (view: SessionView, won: boolean): RunSummary => ({
    modeId: view.mode.id,
    won,
    score: view.score,
    lines: view.lines,
    level: view.level,
    seconds: view.seconds,
    seed: view.seed,
  });

  const finishRun = (view: SessionView): void => {
    const won = view.status === 'won';
    const summary = summaryOf(view, won);
    const at = host.now();
    const record = isBest(data, summary);
    data = recordRun(data, summary, at);
    host.commit(data);
    prefs = prefsOf(data);
    // `recordRun` stamps the new entry with `at`, so that plus the score finds the
    // row we just wrote even when an older run left an identical score behind.
    const rank = data.highScores.findIndex((entry) => entry.at === at && entry.score === summary.score);
    lastRun = {
      summary,
      record,
      rank: rank < 0 ? null : rank + 1,
      view,
      duelWinner: null,
    };
    go('results');
  };

  const finishDuel = (): void => {
    const winner = duel?.winner() ?? null;
    const side = winner === 'b' ? duel?.b : duel?.a;
    const view = side?.snapshot() ?? null;
    const summary: RunSummary = {
      modeId: mode?.id ?? 'duel',
      won: winner !== null,
      score: view?.score ?? 0,
      lines: view?.lines ?? 0,
      level: view?.level ?? 1,
      seconds: view?.seconds ?? 0,
      seed,
    };
    const record = view !== null && isBest(data, summary);
    data = recordRun(data, summary, host.now());
    host.commit(data);
    prefs = prefsOf(data);
    lastRun = { summary, record, rank: null, view, duelWinner: winner };
    duel = null;
    go('results');
  };

  // ---- events ---------------------------------------------------------------

  const route = (events: readonly SessionEvent[], side?: DuelSideId): void => {
    for (const event of events) {
      switch (event.type) {
        case 'sfx':
          host.sfx(event.name);
          break;
        case 'message':
          setBanner(event.text, event.frames);
          break;
        case 'level-up':
          host.announce(`LEVEL ${event.level}`);
          break;
        case 'lines':
          if (event.perfect) setBanner('PERFECT!', 90);
          break;
        case 'garbage':
          // The duel delivers an attack into the *receiver's* event queue, already
          // capped and cancelled, so the rows a side got are exactly what the other
          // side sent. Counting the clear again here would double the readout.
          if (side) attacks[side === 'a' ? 'b' : 'a'] += event.rows;
          break;
        case 'status':
          emitStatus();
          break;
        default:
          break;
      }
    }
  };

  // ---- frame: shared pieces --------------------------------------------------

  const listGeom = (count: number, y = 40, rowH = 14, x = 70, w = 100): MenuGeom => ({
    x,
    y,
    w,
    rowH,
    count,
  });

  const frameTitle = (d: Draft): void => {
    d.label('ORBIT DROP', SCREEN.w / 2, 18, 'accent', 'center', 3);
    d.label('A FALLING-BLOCK PUZZLE', SCREEN.w / 2, 44, 'textDim', 'center', 1);
    const items: MenuItem[] = TITLE_ITEMS.map((label) => ({ label }));
    drawMenu(d, listGeom(items.length, 62, 16, 62, 116), items, cursors.title);
    d.label(
      `${MODES.length} MODES  MOUSE AND KEYS BOTH WORK`,
      SCREEN.w / 2,
      SCREEN.h - 20,
      'textDim',
      'center',
      1,
    );
    drawFooter(
      d,
      host.persisted() ? `SAVED ${data.highScores.length} SCORES` : 'SAVES IN MEMORY ONLY',
      'V 0.1',
    );
  };

  const modeItems = (): MenuItem[] =>
    MODES.map((plugin): MenuItem => {
      const progress = progressFor(data, plugin.id);
      const locked = !progress.unlocked;
      return {
        label: shortLabel(plugin.label),
        dim: locked,
        note: locked ? 'LOCKED' : progress.best ? `${progress.best.score}` : '',
        // Omitted rather than set to `undefined`: `exactOptionalPropertyTypes`.
        ...(locked
          ? { colour: 'textDim' as const }
          : plugin.family === 'versus'
            ? { colour: 'textGood' as const }
            : {}),
      };
    });

  const frameModes = (d: Draft): void => {
    drawHeader(d, 'MODE LIST', `${MODES.length}`);
    const items = modeItems();
    drawMenu(d, listGeom(items.length, 26, 13, 8, PANEL.w), items, cursors.modes);
    const current = MODES[cursors.modes];
    if (current) d.label(current.summary, PANEL.x, SCREEN.h - 20, 'textDim', 'left', 1);
    drawFooter(d, 'ENTER RULES', 'ESC TITLE');
  };

  const frameRules = (d: Draft): void => {
    if (!mode) return;
    drawHeader(d, shortLabel(mode.label), `SEED ${seedToString(seed)}`);
    drawCard(d, PANEL.x, 25, PANEL.w, 82, 'fieldEdge');
    const lines: string[] = [];
    for (const rule of [mode.summary, ...mode.rules]) lines.push(...wrapText(rule, 36));
    lines.slice(0, 9).forEach((line, index) => {
      d.label(line, PANEL.x + 6, 30 + index * 9, index === 0 ? 'text' : 'textDim', 'left', 1);
    });
    const progress = progressFor(data, mode.id);
    d.label(
      `PLAYS ${progress.plays}  CLEARS ${progress.clears}`,
      PANEL.x,
      110,
      'textDim',
      'left',
      1,
    );
    if (progress.best) {
      d.label(
        `BEST ${formatScore(progress.best.score)}`,
        SCREEN.w - PANEL.x,
        110,
        'textGood',
        'right',
        1,
      );
    }
    const items: MenuItem[] = RULES_ITEMS.map((label) => ({ label }));
    drawMenu(d, listGeom(items.length, 120, 14, 8, 110), items, cursors.rules);
    d.label('< SEED >', SCREEN.w - PANEL.x - 46, 124, 'cursor', 'right', 1);
    d.label(seedToString(seed), SCREEN.w - PANEL.x - 46, 133, 'text', 'right', 1);
    drawFooter(d, 'ENTER START  LEFT/RIGHT SEED', 'ESC MODES');
  };

  const hudRows = (view: SessionView): HudField[] => {
    const rows = [...view.hud];
    if (prefs.settings.showScore) rows.push({ label: 'SCORE', value: formatScore(view.score) });
    return rows;
  };

  const fieldCall = (d: Draft, view: SessionView, cell = VIEW.cell) => {
    const dx = shake !== 0 && prefs.settings.screenShake ? shake : 0;
    d.addField({
      board: view.board,
      active: view.active,
      ghost: view.active && view.ghost !== null ? { ...view.active, y: view.ghost } : null,
      flashFrames: view.flash,
      x: VIEW.fieldX + dx,
      y: VIEW.fieldY,
      cell,
      rows: view.board.rows - 2,
      showGrid: true,
      dim: view.status === 'paused',
    });
  };

  const playPanel = (d: Draft, view: SessionView): void => {
    const px = VIEW.panelX;
    const right = SCREEN.w - 8;
    d.label('HOLD', px, 4, 'textDim', 'left', 1);
    const holdId = view.hold;
    d.box({
      x: px,
      y: 12,
      w: 64,
      h: 26,
      fill: 'fieldBg',
      edge: view.canHold ? 'fieldEdge' : 'panelEdge',
      ...(holdId === null ? { dashed: true } : {}),
    });
    if (holdId) d.preview({ id: holdId, x: px, y: 12, w: 64, h: 26, cell: 4, dim: !view.canHold });

    d.label('NEXT', px + 72, 4, 'textDim', 'left', 1);
    const shown = Math.min(5, Math.max(1, prefs.settings.nextCount));
    for (let i = 0; i < shown; i += 1) {
      const y = 12 + i * 12;
      const id = view.queue[i];
      d.box({ x: px + 72, y, w: 64, h: 10, fill: 'fieldBg', edge: 'panelEdge' });
      if (id) d.preview({ id, x: px + 72, y, w: 64, h: 10, cell: 3, dim: i > 0 });
    }

    const goal = view.goal;
    if (goal && goal.target > 0) {
      const ratio = goal.numeric / goal.target;
      d.bar({ x: px, y: 74, w: 64, h: 3, value: ratio, fill: 'accent', back: 'fieldGrid' });
    }

    hudRows(view).forEach((row, index) => {
      const y = 84 + index * 9;
      if (y > SCREEN.h - 12) return;
      d.label(row.label, px, y, 'textDim', 'left', 1);
      d.label(row.value, right, y, 'text', 'right', 1);
    });
  };

  const overlayBanner = (d: Draft, text: string, colour = 'cursor'): void => {
    const w = text.length * 6 + 8;
    const cx = VIEW.fieldX + FIELD_W / 2;
    d.box({ x: cx - w / 2, y: 66, w, h: 15, fill: 'bg', edge: colour });
    d.label(text, cx, 70, colour, 'center', 1);
  };

  const countdownLabel = (): string | null => {
    if (countdown <= 0) return null;
    const elapsed = COUNTDOWN - countdown;
    return COUNT_STEPS[Math.min(COUNT_STEPS.length - 1, Math.floor(elapsed / COUNT_FRAMES))] ?? null;
  };

  const framePlay = (d: Draft): void => {
    const view = session?.snapshot();
    if (!view) return;
    fieldCall(d, view);
    playPanel(d, view);
    if (view.combo > 1) d.label(`COMBO X${view.combo}`, VIEW.fieldX + 40, 90, 'textGood', 'center', 1);
    const count = countdownLabel();
    if (count) {
      d.label(count, VIEW.fieldX + 40, 60, 'cursor', 'center', 3);
    } else if (banner) {
      overlayBanner(d, banner.text.toUpperCase());
    }
    if (view.status === 'paused') {
      d.setVeil(0.62);
      d.label('PAUSED', SCREEN.w / 2, 30, 'text', 'center', 2);
      const items: MenuItem[] = PLAY_ITEMS.map((label) => ({ label }));
      drawMenu(d, listGeom(items.length, 56, 15, 62, 116), items, cursors.play);
      drawFooter(d, 'ENTER CHOOSE', 'ESC RESUME');
    }
  };

  const duelSide = (d: Draft, side: DuelSideId, x: number, label: string): void => {
    const view = (side === 'a' ? duel?.a : duel?.b)?.snapshot();
    if (!view) return;
    const cell = 5;
    d.label(label, x, 4, side === 'a' ? 'accent' : 'textWarn', 'left', 1);
    d.label(`${view.lines}L ${view.level}LV`, x + 50, 4, 'text', 'right', 1);
    const next = view.queue[0];
    d.box({ x, y: 12, w: 50, h: 10, fill: 'fieldBg', edge: 'panelEdge' });
    if (next) d.preview({ id: next, x, y: 12, w: 50, h: 10, cell: 3 });
    d.addField({
      board: view.board,
      active: view.active,
      ghost: view.active && view.ghost !== null ? { ...view.active, y: view.ghost } : null,
      flashFrames: view.flash,
      x,
      y: 46,
      cell,
      rows: 20,
      showGrid: false,
      dim: view.status === 'paused' || view.status === 'lost',
    });
    d.label(`SENT ${attacks[side]}`, x, 30, side === 'a' ? 'accent' : 'textWarn', 'left', 1);
  };

  const frameDuel = (d: Draft): void => {
    if (!duel) return;
    duelSide(d, 'a', 10, 'P1');
    duelSide(d, 'b', 180, 'P2');
    const cx = SCREEN.w / 2;
    d.label('VS', cx, 24, 'textDim', 'center', 2);
    d.label(seedToString(seed), cx, 132, 'textDim', 'center', 1);
    const count = countdownLabel();
    const paused = duel.a.snapshot().status === 'paused' || duel.b.snapshot().status === 'paused';
    if (count) d.label(count, cx, 74, 'cursor', 'center', 3);
    else if (paused) {
      // A pause list has to be drawn, not just accepted: the cursor moves with
      // up/down and picks which item Enter fires, so a hidden cursor would be a
      // guess-the-menu situation.
      d.setVeil(0.55);
      d.label('PAUSED', cx, 56, 'text', 'center', 2);
      const items: MenuItem[] = PLAY_ITEMS.map((label) => ({ label }));
      drawMenu(d, listGeom(items.length, 72, 11, 78, 84), items, cursors.duel);
    } else if (banner) {
      const w = banner.text.length * 6 + 8;
      d.box({ x: cx - w / 2, y: 70, w, h: 15, fill: 'bg', edge: 'cursor' });
      d.label(banner.text.toUpperCase(), cx, 74, 'cursor', 'center', 1);
    }
    drawFooter(d, 'P1 ARROWS+X/Z', 'P2 WASD+F/E');
  };

  const frameResults = (d: Draft): void => {
    const last = lastRun;
    if (!last) return;
    const won = last.summary.won;
    drawHeader(d, last.duelWinner ? 'DUEL OVER' : won ? 'GOAL CLEARED' : 'RUN OVER');
    let y = 28;
    if (last.duelWinner) {
      d.label(
        last.duelWinner === 'a' ? 'P1 TAKES IT' : 'P2 TAKES IT',
        SCREEN.w / 2,
        y,
        last.duelWinner === 'a' ? 'accent' : 'textWarn',
        'center',
        2,
      );
      y += 22;
    } else if (last.record) {
      d.label('NEW RECORD', SCREEN.w / 2, y, 'cursor', 'center', 1);
      y += 12;
    }
    const view = last.view;
    const rows: HudField[] = [
      { label: 'MODE', value: shortLabel(mode?.label ?? last.summary.modeId) },
      { label: 'SCORE', value: formatScore(last.summary.score) },
    ];
    if (mode?.showLines ?? true) rows.push({ label: 'LINES', value: `${last.summary.lines}` });
    rows.push({ label: 'LEVEL', value: `${last.summary.level}` });
    rows.push({ label: 'TIME', value: formatTime(last.summary.seconds) });
    if (view) {
      rows.push({ label: 'PIECES', value: `${view.pieces}` });
      if (view.maxCombo > 1) rows.push({ label: 'BEST COMBO', value: `X${view.maxCombo}` });
    }
    rows.push({ label: 'SEED', value: seedToString(last.summary.seed) });
    if (last.rank) rows.push({ label: 'TABLE', value: `${ordinal(last.rank)}` });
    rows.forEach((row) => {
      d.label(row.label, PANEL.x + 6, y, 'textDim', 'left', 1);
      d.label(row.value, SCREEN.w - PANEL.x - 6, y, 'text', 'right', 1);
      y += 10;
    });
    const items: MenuItem[] = RESULTS_ITEMS.map((label) => ({ label }));
    drawMenu(d, listGeom(items.length, 122, 15, 62, 116), items, cursors.results, {
      highlight: 'arrow',
    });
    drawFooter(d, 'ENTER AGAIN', 'ESC MODES');
  };

  const optionGeom = (): MenuGeom => ({
    x: PANEL.x,
    y: 25,
    w: PANEL.w,
    rowH: 11,
    count: OPTION_ROWS.length,
  });

  const doneRect = (): { x: number; y: number; w: number; h: number } => ({
    x: SCREEN.w - 8 - 34,
    y: SCREEN.h - 11,
    w: 34,
    h: 10,
  });

  const frameOptions = (d: Draft): void => {
    drawHeader(d, 'OPTIONS', difficultyLabel(prefs.settings.difficulty));
    const geom = optionGeom();
    let group = '';
    menuRects(geom).forEach((rect, index) => {
      const row = OPTION_ROWS[index];
      if (!row) return;
      if (row.group !== group) {
        group = row.group;
      }
      const active = index === cursors.options;
      if (active) d.box({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, fill: 'fieldGrid', edge: 'accent' });
      const colour = active ? 'cursor' : row.destructive ? 'textWarn' : 'text';
      d.label(row.label, rect.x + 6, rect.y + 2, colour, 'left', 1);
      const value = optionValue(row, prefs);
      if (row.kind === 'slider') {
        const ratio = prefs.audio[row.id as 'master' | 'music' | 'sfx'] ?? 0;
        d.bar({ x: rect.x + rect.w - 74, y: rect.y + 4, w: 42, h: 3, value: ratio, fill: 'accent', back: 'fieldGrid' });
        d.label(value, rect.x + rect.w - 6, rect.y + 2, 'text', 'right', 1);
      } else if (value) {
        d.label(value, rect.x + rect.w - 6, rect.y + 2, 'text', 'right', 1);
      }
      if (row.kind === 'action') d.label('ENTER', rect.x + rect.w - 6, rect.y + 2, 'textDim', 'right', 1);
    });
    const focused = OPTION_ROWS[cursors.options];
    if (focused) d.label(focused.hint, PANEL.x, SCREEN.h - 22, 'textDim', 'left', 1);
    drawFooter(d, 'UP/DOWN  LEFT/RIGHT CHANGE');
    const rect = doneRect();
    d.box({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, fill: 'fieldGrid', edge: 'accent' });
    d.label('DONE', rect.x + rect.w / 2, rect.y + 2, 'cursor', 'center', 1);
  };

  const bindingRows = (): readonly Intent[] => BINDABLE_INTENTS;

  const frameBindings = (d: Draft): void => {
    drawHeader(d, 'CONTROLS', capturing ? 'PRESS A KEY' : 'PLAYER 1');
    const rows = bindingRows();
    const conflicts = new Map(conflictsIn(data.bindings).map((entry) => [entry.code, entry]));
    const geom: MenuGeom = { x: PANEL.x, y: 25, w: PANEL.w, rowH: 9, count: rows.length };
    menuRects(geom).forEach((rect, index) => {
      const intent = rows[index];
      if (!intent) return;
      const codes = data.bindings[intent] ?? [];
      const active = index === cursors.bindings;
      if (active) d.box({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, fill: 'fieldGrid', edge: 'accent' });
      const shared = codes.some((code) => conflicts.has(code));
      d.label(INTENT_LABELS[intent], rect.x + 4, rect.y + 1, active ? 'cursor' : 'text', 'left', 1);
      const shown = [codes[0] ?? '-', codes[1] ?? ''].join(' ');
      d.label(shown.toUpperCase(), rect.x + rect.w - 4, rect.y + 1, capturing === intent ? 'cursor' : shared ? 'textWarn' : 'textDim', 'right', 1);
    });
    const intent = rows[cursors.bindings];
    if (intent) {
      d.label(
        capturing === intent ? 'ANY KEY WORKS. BACKSPACE CLEARS' : 'ENTER REASSIGNS. ESC CANCELS',
        PANEL.x,
        SCREEN.h - 22,
        capturing ? 'cursor' : 'textDim',
        'left',
        1,
      );
    }
    drawFooter(d, 'UP/DOWN  ENTER REASSIGN');
    const rect = doneRect();
    const second = rect.x - 96;
    d.box({ x: second, y: rect.y, w: 92, h: rect.h, fill: 'fieldGrid', edge: 'panelEdge' });
    d.label('RESTORE DEFAULTS', second + 46, rect.y + 2, 'text', 'center', 1);
    d.box({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, fill: 'fieldGrid', edge: 'accent' });
    d.label('DONE', rect.x + rect.w / 2, rect.y + 2, 'cursor', 'center', 1);
  };

  const frameScores = (d: Draft): void => {
    drawHeader(d, 'HIGH SCORES', `${data.highScores.length} BEST`);
    d.label('#', PANEL.x, 27, 'textDim', 'left', 1);
    d.label('MODE', PANEL.x + 12, 27, 'textDim', 'left', 1);
    d.label('SCORE', SCREEN.w - 74, 27, 'textDim', 'left', 1);
    d.label('TIME', SCREEN.w - PANEL.x, 27, 'textDim', 'right', 1);
    if (data.highScores.length === 0) {
      d.label('NO RUNS RECORDED YET', SCREEN.w / 2, 70, 'textDim', 'center', 1);
    }
    data.highScores.forEach((entry, index) => {
      const y = 38 + index * 10;
      if (y > SCREEN.h - 16) return;
      const label = MODES.find((m) => m.id === entry.modeId)?.label ?? entry.modeId;
      d.label(`${index + 1}`, PANEL.x, y, index === 0 ? 'cursor' : 'textDim', 'left', 1);
      d.label(shortLabel(label), PANEL.x + 12, y, 'text', 'left', 1);
      d.label(formatScore(entry.score), SCREEN.w - 20, y, 'text', 'right', 1);
      d.label(formatTime(entry.seconds), SCREEN.w - PANEL.x, y, 'textDim', 'right', 1);
    });
    drawFooter(d, 'ESC BACK');
  };

  const frameConfirm = (d: Draft): void => {
    drawCard(d, 24, 40, SCREEN.w - 48, 80, 'textWarn');
    d.label('ERASE RECORDS?', SCREEN.w / 2, 48, 'textWarn', 'center', 1);
    d.label('HIGH SCORES, MODE RECORDS', SCREEN.w / 2, 60, 'textDim', 'center', 1);
    d.label('AND UNLOCKS GO AWAY. SETTINGS', SCREEN.w / 2, 69, 'textDim', 'center', 1);
    d.label('AND CONTROLS STAY.', SCREEN.w / 2, 78, 'textDim', 'center', 1);
    const items: MenuItem[] = CONFIRM_ITEMS.map((label) => ({ label }));
    drawMenu(d, listGeom(items.length, 90, 14, 40, SCREEN.w - 80), items, cursors.confirm);
    drawFooter(d, 'ENTER CONFIRM', 'ESC CANCEL');
  };

  // ---- frames ---------------------------------------------------------------

  const frame = (): FrameModel => {
    const d = draft();
    switch (scene) {
      case 'title':
        frameTitle(d);
        break;
      case 'modes':
        frameModes(d);
        break;
      case 'rules':
        frameRules(d);
        break;
      case 'play':
        framePlay(d);
        break;
      case 'duel':
        frameDuel(d);
        break;
      case 'results':
        frameResults(d);
        break;
      case 'options':
        frameOptions(d);
        break;
      case 'bindings':
        frameBindings(d);
        break;
      case 'scores':
        frameScores(d);
        break;
      case 'confirm':
        frameConfirm(d);
        break;
    }
    return d.build();
  };

  // ---- input ----------------------------------------------------------------

  const menuCount = (): number => {
    switch (scene) {
      case 'title':
        return TITLE_ITEMS.length;
      case 'modes':
        return MODES.length;
      case 'rules':
        return RULES_ITEMS.length;
      case 'play':
        return PLAY_ITEMS.length;
      case 'results':
        return RESULTS_ITEMS.length;
      case 'options':
        return OPTION_ROWS.length;
      case 'bindings':
        return BINDABLE_INTENTS.length;
      case 'confirm':
        return CONFIRM_ITEMS.length;
      default:
        return 0;
    }
  };

  const menuActive = (): boolean => {
    if (scene === 'play') return session?.snapshot().status === 'paused';
    return scene === 'duel' ? duel?.a.snapshot().status === 'paused' : true;
  };

  const moveCursor = (dir: number): void => {
    const count = menuCount();
    if (count === 0) return;
    cursors[scene] = clampIndex(cursors[scene] + dir, count);
    sfx('menu-move');
    const label =
      scene === 'modes'
        ? MODES[cursors.modes]?.summary
        : scene === 'options'
          ? OPTION_ROWS[cursors.options]?.hint
          : undefined;
    const named =
      scene === 'options'
        ? OPTION_ROWS[cursors.options]?.label
        : scene === 'bindings'
          ? INTENT_LABELS[BINDABLE_INTENTS[cursors.bindings] ?? 'left']
          : undefined;
    host.announce([named, label].filter(Boolean).join('. '));
  };

  const savePrefs = (next: Prefs): void => {
    prefs = next;
    data = applyPrefs(data, next);
    host.commit(data);
  };

  const changeOption = (row: OptionRow, dir: number): void => {
    const next = stepOption(row, prefs, dir);
    savePrefs(next);
    if (row.kind === 'toggle' && row.id === 'muted') sfx('mute');
    else sfx('menu-move');
    host.announce(`${row.label} ${optionValue(row, next)}`);
  };

  const openBindings = (): void => {
    capturing = null;
    go('bindings');
  };

  const openOptions = (from: SceneId): void => {
    optionsReturn = from;
    go('options');
  };

  const activate = (index: number): void => {
    cursors[scene] = clampIndex(index, Math.max(1, menuCount()));
    switch (scene) {
      case 'title':
        sfx('menu-confirm');
        if (index === 0) go('modes');
        else if (index === 1) go('scores');
        else openOptions('title');
        break;
      case 'modes': {
        const plugin = MODES[index];
        if (!plugin) break;
        if (!progressFor(data, plugin.id).unlocked) {
          sfx('rotate-fail');
          setBanner('LOCKED', 60);
          host.announce(`${plugin.label} IS LOCKED. CLEAR THE MODE BEFORE IT FIRST.`);
          break;
        }
        sfx('menu-confirm');
        seed = progressFor(data, plugin.id).lastSeed
          ? seedFromStored(plugin.id)
          : randomSeed();
        mode = plugin;
        cursors.rules = 0;
        go('rules');
        break;
      }
      case 'rules':
        sfx('menu-confirm');
        if (index === 0 && mode) {
          startRun(mode, seed);
        } else go('modes');
        break;
      case 'play':
        sfx('menu-confirm');
        if (index === 0) resume();
        else if (index === 1 && mode) startRun(mode, seed);
        else if (index === 2) openOptions('play');
        else go('modes');
        break;
      case 'duel':
        sfx('menu-confirm');
        if (index === 0) resume();
        else if (index === 1 && mode) startRun(mode, seed);
        else if (index === 2) openOptions('duel');
        else go('modes');
        break;
      case 'results':
        sfx('menu-confirm');
        if (index === 0 && mode) startRun(mode, sameSeed(lastRun?.view ?? null));
        else go('modes');
        break;
      case 'options': {
        const row = OPTION_ROWS[index];
        if (!row) break;
        if (row.kind === 'action') {
          sfx('menu-confirm');
          if (row.id === 'bindings') openBindings();
          else if (row.id === 'reset-progress') {
            cursors.confirm = 1;
            go('confirm');
          }
        } else changeOption(row, 1);
        break;
      }
      case 'bindings': {
        const intent = BINDABLE_INTENTS[index];
        if (!intent) break;
        capturing = intent;
        sfx('menu-confirm');
        host.announce(`PRESS A KEY FOR ${INTENT_LABELS[intent]}`);
        break;
      }
      case 'confirm':
        sfx('menu-confirm');
        if (index === 0) {
          data = clearedProgress(data, host.now());
          host.commit(data);
          prefs = prefsOf(data);
          cursors.modes = 0;
          go('modes', 'RECORDS ERASED. MODE LIST');
        } else go('options', 'NOTHING ERASED. OPTIONS');
        break;
      default:
        break;
    }
  };

  const seedFromStored = (modeId: string): number => {
    const stored = progressFor(data, modeId).lastSeed;
    const parsed = Number.parseInt(stored, 16);
    return Number.isFinite(parsed) ? parsed >>> 0 : randomSeed();
  };

  const nudgeSeed = (dir: number): void => {
    seed = (seed + dir) >>> 0;
    sfx('menu-move');
    host.announce(`SEED ${seedToString(seed)}`);
  };

  const pause = (): void => {
    if (scene === 'duel') duel?.togglePause();
    else if (scene === 'play') {
      session?.input('pause', true);
      cursors.play = 0;
    }
    emitStatus();
    sfx('menu-confirm');
  };

  const resume = (): void => {
    if (scene === 'duel') duel?.togglePause();
    else if (session?.snapshot().status === 'paused') session.input('pause', true);
    emitStatus();
    sfx('menu-back');
  };

  const back = (): void => {
    sfx('menu-back');
    if (capturing !== null) {
      capturing = null;
      host.announce('KEY CAPTURE CANCELLED');
      return;
    }
    switch (scene) {
      case 'title':
        break;
      case 'modes':
        go('title');
        break;
      case 'rules':
        go('modes');
        break;
      case 'play':
      case 'duel':
        resume();
        break;
      case 'results':
        go('modes');
        break;
      case 'options':
      case 'bindings':
        go(optionsReturn === 'bindings' ? 'options' : optionsReturn);
        break;
      case 'scores':
        go('title');
        break;
      case 'confirm':
        go('options');
        break;
      default:
        break;
    }
  };

  /**
   * Enter is bound to `pause` and Escape to `back` (see `BINDABLE_INTENTS` order),
   * so one code resolves to both roles. Which role applies depends on the screen:
   * outside a live run Enter drives the list and Escape steps back out; inside one,
   * Enter pauses and Escape resumes.
   */
  const remap = (kind: Intent): Intent => {
    const inRun = scene === 'play' || scene === 'duel';
    if (inRun && !menuActive()) return kind === 'back' ? 'pause' : kind;
    return kind === 'pause' ? 'confirm' : kind;
  };

  const playInput = (intent: Intent, down: boolean, player: 1 | 2): boolean => {
    if (scene === 'duel') {
      if (!duel) return false;
      if (intent === 'pause') {
        if (down && player === 1) pause();
        else if (down && player === 2) duel.input('b', 'pause', true);
        return true;
      }
      const side: DuelSideId = player === 2 ? 'b' : 'a';
      switch (intent) {
        case 'left':
        case 'right':
        case 'soft-drop':
        case 'hard-drop':
        case 'rotate-cw':
        case 'rotate-ccw':
        case 'hold':
          duel.input(side, intent, down);
          return true;
        default:
          return false;
      }
    }
    if (!session) return false;
    if (intent === 'pause') {
      if (down) {
        const status = session.snapshot().status;
        if (status === 'paused') resume();
        else pause();
      }
      return true;
    }
    if (session.snapshot().status !== 'playing') return false;
    switch (intent) {
      case 'left':
      case 'right':
      case 'soft-drop':
      case 'hard-drop':
      case 'rotate-cw':
      case 'rotate-ccw':
      case 'hold':
        session.input(intent, down);
        return true;
      default:
        return false;
    }
  };

  const intent = (raw: Intent, down: boolean, player: 1 | 2 = 1): boolean => {
    if (!down && !(scene === 'play' || scene === 'duel')) return false;
    const kind = remap(raw);
    const playing = (scene === 'play' || scene === 'duel') && !menuActive();
    if (playing) return playInput(kind, down, player);
    if (!down) return false;
    switch (kind) {
      case 'up':
        moveCursor(-1);
        return true;
      case 'down':
        moveCursor(1);
        return true;
      case 'confirm':
        activate(cursors[scene]);
        return true;
      case 'back':
        back();
        return true;
      case 'left':
      case 'decrement':
        if (scene === 'rules') nudgeSeed(-1);
        else if (scene === 'options') {
          const row = OPTION_ROWS[cursors.options];
          if (row) changeOption(row, -1);
        }
        return true;
      case 'right':
      case 'increment':
        if (scene === 'rules') nudgeSeed(1);
        else if (scene === 'options') {
          const row = OPTION_ROWS[cursors.options];
          if (row) changeOption(row, 1);
        }
        return true;
      default:
        return false;
    }
  };

  const key = (code: string, down: boolean): boolean => {
    if (capturing === null || !down) return false;
    const target = capturing;
    if (code === 'Escape') {
      capturing = null;
      sfx('menu-back');
      host.announce('KEY CAPTURE CANCELLED');
      return true;
    }
    if (code === 'Delete') {
      data = { ...data, bindings: unbind(data.bindings, target, code) };
      host.commit(data);
      capturing = null;
      sfx('menu-back');
      host.announce(`${INTENT_LABELS[target]} RESET TO ITS DEFAULTS`);
      return true;
    }
    const bindings: Bindings = rebind(data.bindings, target, code);
    data = { ...data, bindings };
    host.commit(data);
    capturing = null;
    sfx('menu-confirm');
    host.announce(`${INTENT_LABELS[target]} IS NOW ${code}`);
    return true;
  };

  const inRect = (x: number, y: number, rect: { x: number; y: number; w: number; h: number }): boolean =>
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

  const pointer = (x: number, y: number, action: PointerAction): boolean => {
    if (capturing !== null) {
      if (action === 'press') {
        capturing = null;
        sfx('menu-back');
      }
      return true;
    }
    if (scene === 'options' || scene === 'bindings') {
      const geom =
        scene === 'options' ? optionGeom() : { x: PANEL.x, y: 25, w: PANEL.w, rowH: 9, count: BINDABLE_INTENTS.length };
      const hit = rowUnderPoint(geom, x, y);
      if (hit !== null) {
        if (action === 'hover') {
          if (cursors[scene] !== hit) {
            cursors[scene] = hit;
            sfx('menu-move');
          }
          return true;
        }
        if (scene === 'options') {
          const row = OPTION_ROWS[hit];
          if (!row) return false;
          cursors.options = hit;
          // The band tested here must match where `frameOptions` draws the bar, or
          // a click that looks like it grabbed the slider quietly steps the value.
          const barX = geom.x + geom.w - 74;
          const half = geom.x + geom.w / 2;
          if (row.kind === 'slider' && x >= barX - 2 && x <= barX + 44) {
            const ratio = (x - barX) / 42;
            savePrefs(setSlider(row, prefs, ratio));
            host.announce(`${row.label} ${optionValue(row, prefs)}`);
          } else {
            changeOption(row, x < half ? -1 : 1);
          }
          return true;
        }
        activate(hit);
        return true;
      }
      if (action === 'press') {
        const rect = doneRect();
        if (inRect(x, y, rect)) {
          back();
          return true;
        }
        if (scene === 'bindings' && inRect(x, y, { x: rect.x - 96, y: rect.y, w: 92, h: rect.h })) {
          data = { ...data, bindings: cloneBindings(DEFAULT_BINDINGS) };
          host.commit(data);
          sfx('menu-confirm');
          host.announce('CONTROLS RESTORED');
          return true;
        }
      }
      return false;
    }
    if (scene === 'duel') {
      if (!duel) return false;
      const paused = duel.a.snapshot().status === 'paused' || duel.b.snapshot().status === 'paused';
      if (!paused) return false;
      const hit = rowUnderPoint(listGeom(PLAY_ITEMS.length, 72, 11, 78, 84), x, y);
      if (hit === null) return false;
      if (action === 'hover') cursors.duel = hit;
      else activate(hit);
      return true;
    }
    if (scene === 'play') {
      if (session?.snapshot().status === 'paused') {
        const hit = rowUnderPoint(listGeom(PLAY_ITEMS.length, 56, 15, 62, 116), x, y);
        if (hit !== null) {
          if (action === 'hover') cursors.play = hit;
          else activate(hit);
          return true;
        }
        return false;
      }
      if (action !== 'press') return false;
      const view = session?.snapshot();
      if (!view) return false;
      const field = {
        x: VIEW.fieldX,
        y: VIEW.fieldY,
        w: view.board.cols * VIEW.cell,
        h: 20 * VIEW.cell,
      };
      if (inRect(x, y, { x: VIEW.panelX, y: 12, w: 64, h: 26 })) {
        session?.input('hold', true);
        return true;
      }
      if (inRect(x, y, field)) {
        session?.input('hard-drop', true);
        return true;
      }
      return false;
    }
    const counts: Partial<Record<SceneId, number>> = {
      title: TITLE_ITEMS.length,
      modes: MODES.length,
      rules: RULES_ITEMS.length,
      results: RESULTS_ITEMS.length,
      confirm: CONFIRM_ITEMS.length,
      scores: 0,
    };
    const count = counts[scene] ?? 0;
    if (count === 0) {
      if (action === 'press' && scene === 'scores') back();
      return false;
    }
    const geom =
      scene === 'modes'
        ? listGeom(count, 26, 13, 8, PANEL.w)
        : scene === 'rules'
          ? listGeom(count, 120, 14, 8, 110)
          : scene === 'confirm'
            ? listGeom(count, 90, 14, 40, SCREEN.w - 80)
            : scene === 'results'
              ? listGeom(count, 122, 15, 62, 116)
              : listGeom(count, 62, 16, 62, 116);
    const hit = rowUnderPoint(geom, x, y);
    if (hit === null) {
      if (action === 'press' && scene === 'rules' && inRect(x, y, { x: 150, y: 120, w: 74, h: 22 })) {
        nudgeSeed(x < 168 ? -1 : 1);
        return true;
      }
      return false;
    }
    if (action === 'hover') {
      if (cursors[scene] !== hit) {
        cursors[scene] = hit;
        sfx('menu-move');
      }
      return true;
    }
    activate(hit);
    return true;
  };

  const advance = (frames: number): void => {
    const n = Math.max(0, Math.trunc(frames));
    tick += n;
    if (shake !== 0) shake = 0;
    if (banner) {
      banner.frames -= n;
      if (banner.frames <= 0) banner = null;
    }
    if (scene !== 'play' && scene !== 'duel') return;
    if (countdown > 0) {
      const before = countdownLabel();
      countdown = Math.max(0, countdown - n);
      const after = countdownLabel();
      if (after !== before) {
        if (after === null || after === 'GO') sfx('menu-confirm');
        else sfx('menu-move');
      }
      return;
    }
    if (scene === 'duel') {
      if (!duel) return;
      const view = duel.a.snapshot();
      if (view.status !== 'playing') return;
      const events = duel.step(n);
      route(events.a, 'a');
      route(events.b, 'b');
      if (duel.over()) finishDuel();
      return;
    }
    if (!session) return;
    const before = session.snapshot();
    if (before.status !== 'playing') return;
    if (before.flash > 0 && shake === 0) shake = (before.flash % 3) - 1;
    const events = session.advance(n);
    route(events);
    const view = session.snapshot();
    if (view.status === 'won' || view.status === 'lost') finishRun(view);
  };

  const blur = (): void => {
    if (scene === 'play' && session?.snapshot().status === 'playing') pause();
    if (scene === 'duel' && duel && !duel.over()) duel.togglePause();
  };

  const debug = (): SceneDebug => {
    const view = scene === 'duel' ? (duel?.a.snapshot() ?? null) : (session?.snapshot() ?? null);
    return {
      scene,
      status: view === null ? null : view.status,
      seed,
      countdown,
      modeId: mode?.id ?? null,
      lines: view?.lines ?? 0,
      score: view?.score ?? 0,
      level: view?.level ?? 0,
      pieces: view?.pieces ?? 0,
    };
  };

  go('title', 'ORBIT DROP. TITLE SCREEN');
  return {
    get scene(): SceneId {
      return scene;
    },
    frame,
    advance,
    intent,
    key,
    pointer,
    blur,
    debug,
  };
};
