import type {
  ActivePiece,
  Board,
  Cell,
  Difficulty,
  GameStatus,
  GoalKind,
  HudField,
  SessionEvent,
  Vec,
} from '../engine/types.js';
import type { GameConfig } from '../engine/config.js';
import type { Rng } from '../engine/random.js';

/**
 * What a mode may look at and do to the shared mechanics core.
 * Modes never touch rendering, audio or storage — they only report events.
 */
export interface ModeApi {
  readonly config: GameConfig;
  readonly difficulty: Difficulty;
  /** The run's single random stream — never create another one. */
  readonly rng: Rng;
  readonly board: Board;
  readonly level: number;
  readonly lines: number;
  readonly frames: number;
  readonly seconds: number;
  readonly status: GameStatus;
  setStatus(status: GameStatus): void;
  setLevel(level: number): void;
  /** Push garbage rows in from the bottom (hole chosen from `rng`). */
  addGarbage(rows: number): void;
  /**
   * Push one row of `cell` in at the bottom, leaving `holes` random cells empty,
   * shifting the stack up. Silent: no sound or garbage event, so a mode can build
   * its starting field during `setupBoard`.
   */
  pushRow(cell: Cell, holes: number): void;
  /** Extra events for the presentation layer (banner text, sound). */
  emit(event: SessionEvent): void;
}

export interface GoalInfo {
  readonly kind: GoalKind;
  readonly label: string;
  readonly current: string;
  readonly numeric: number;
  readonly target: number;
}

/**
 * Per-run mode behaviour. The state object carries its own hooks so that
 * `MODES` can stay a homogeneous array of plugins.
 */
export interface ModeRun {
  /** Rows shown in the HUD, in display order (mode-specific meaning per row). */
  hud(): HudField[];
  goal(): GoalInfo | null;
  /** `playing` while the run continues; `won` / `lost` ends it. */
  status(): GameStatus;
  /** Called once per frame before the mechanics step. */
  advance?(frames: number): void;
  /** Extra cells to remove alongside a line clear (linked clusters). */
  extendClear?(clearedRows: readonly number[], candidate: Set<number>): void;
  onLock?(piece: ActivePiece, cells: readonly Vec[]): void;
  onClear?(rows: readonly number[], count: number, extended: number): void;
  onGarbage?(rows: number): void;
  /** Rows appended to the results screen. */
  extra?(): readonly { label: string; value: string }[];
}

export type ModeFamily = 'single' | 'versus';

export interface ModePlugin {
  readonly id: string;
  /** Player-facing label (our own names — see `docs/game-design.md` § 4). */
  readonly label: string;
  readonly family: ModeFamily;
  /** One line under the entry in the rules screen. */
  readonly summary: string;
  readonly rules: readonly string[];
  /** Whether the results screen shows a `LINES` row. */
  readonly showLines: boolean;
  /** Header used when the clock runs out instead of a top-out. */
  readonly timeUpLabel?: string;
  createRun(api: ModeApi): ModeRun;
  /** Seed the board (FUSION's garbage and star row, BLITZ's starting stack). */
  setupBoard?(board: Board, api: ModeApi): void;
}
