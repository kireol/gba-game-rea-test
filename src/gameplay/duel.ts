import type { Difficulty, Intent, SessionEvent } from '../engine/types.js';
import type { GameConfig } from '../engine/config.js';
import { duelMode } from '../modes/duel/index.js';
import { createSession, type Session, type SessionOpts } from './session.js';

/**
 * Local two-player substitute for the reference's link-play feature, which needs
 * hardware this recreation does not have. Two full mechanics cores run side by
 * side with the same seed — so the same piece sequence — and the wrapper routes
 * line clears as garbage into the rival core. Neither core knows the other exists.
 */
export interface DuelOpts {
  readonly seed: number;
  readonly config?: GameConfig;
  readonly difficulty?: Difficulty;
}

export type DuelSideId = 'a' | 'b';

export interface DuelEvents {
  readonly a: SessionEvent[];
  readonly b: SessionEvent[];
}

export interface Duel {
  readonly a: Session;
  readonly b: Session;
  /** Advances both boards, then routes this tick's attacks. */
  step(frames: number): DuelEvents;
  input(side: DuelSideId, intent: Intent, down?: boolean): void;
  /** Pauses both sides, or resumes them if they are paused. */
  togglePause(): void;
  /** The surviving side, or `null` while both are still in play. */
  winner(): DuelSideId | null;
  over(): boolean;
}

/**
 * Attack table [O]. Nothing for a single line, one row per extra line, four for a
 * full clear, plus one for a perfect clear.
 */
export const attackFor = (count: number, perfect: boolean): number => {
  const base = count >= 4 ? 4 : Math.max(0, count - 1);
  return base + (perfect && count > 0 ? 1 : 0);
};

const totalAttack = (events: readonly SessionEvent[]): number => {
  let rows = 0;
  for (const event of events) {
    if (event.type === 'lines') rows += attackFor(event.count, event.perfect);
  }
  return rows;
};

export const createDuel = (opts: DuelOpts): Duel => {
  // Same seed both sides: one shared piece sequence, two independent cores.
  const sideOpts = (): SessionOpts => {
    const sessionOpts: SessionOpts = { mode: duelMode, seed: opts.seed };
    if (opts.config) sessionOpts.config = opts.config;
    if (opts.difficulty) sessionOpts.difficulty = opts.difficulty;
    return sessionOpts;
  };
  const a = createSession(sideOpts());
  const b = createSession(sideOpts());

  const statusOf = (side: DuelSideId) => (side === 'a' ? a : b).snapshot().status;

  return {
    a,
    b,
    step(frames) {
      const ea = a.advance(frames);
      const eb = b.advance(frames);
      const sentByA = totalAttack(ea);
      const sentByB = totalAttack(eb);
      if (sentByA > 0) b.receiveGarbage(sentByA);
      if (sentByB > 0) a.receiveGarbage(sentByB);
      return { a: ea, b: eb };
    },
    input(side, intent, down = true) {
      (side === 'a' ? a : b).input(intent, down);
    },
    togglePause() {
      const sa = a.snapshot().status;
      const sb = b.snapshot().status;
      const want: 'paused' | 'playing' = sa === 'paused' || sb === 'paused' ? 'playing' : 'paused';
      for (const session of [a, b]) {
        const st = session.snapshot().status;
        if ((st === 'playing' || st === 'paused') && st !== want) session.input('pause', true);
      }
    },
    winner() {
      const sa = statusOf('a');
      const sb = statusOf('b');
      if (sa === 'lost' && sb !== 'lost') return 'b';
      if (sb === 'lost' && sa !== 'lost') return 'a';
      return null;
    },
    over() {
      return statusOf('a') === 'lost' || statusOf('b') === 'lost';
    },
  };
};
