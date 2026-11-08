import type { PieceId } from './types.js';
import { PIECE_IDS } from './types.js';

/**
 * Seeded randomness. The reference's generator is seeded and reproducible but its
 * algorithm was never verified (unknowns U30), so the algorithm here is ours and
 * only the *property* — same seed, same sequence — is shared
 * (`docs/architecture/decisions.md` D6).
 */
export type Rng = () => number;

/** mulberry32: small, fast, good enough distribution, fully deterministic. */
export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const randInt = (rng: Rng, n: number): number =>
  n <= 0 ? 0 : Math.floor(rng() * n) % n;

export const shuffle = <T>(rng: Rng, list: readonly T[]): T[] => {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, i + 1);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
};

export const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0;

/** 8 hex characters, for showing a run's seed on the results screen. */
export const seedToString = (seed: number): string =>
  (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');

export const seedFromString = (text: string): number => {
  const parsed = Number.parseInt(text, 16);
  if (!Number.isNaN(parsed) && /^[0-9a-fA-F]{1,8}$/.test(text.trim())) return parsed >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

export interface Bag {
  /** Next piece identity. */
  next(): PieceId;
  /** The next `n` identities, without consuming them. */
  peek(n: number): PieceId[];
}

/**
 * Classic 7-bag: a shuffled set of all seven identities is drained before the next
 * set is dealt, so a piece can never repeat before every other piece has appeared.
 */
export const createBag = (rng: Rng, ids: readonly PieceId[] = PIECE_IDS): Bag => {
  let pool: PieceId[] = [];
  const deal = (): void => {
    pool.push(...shuffle(rng, ids));
  };
  const ensure = (n: number): void => {
    while (pool.length < n) deal();
  };
  return {
    next(): PieceId {
      ensure(1);
      const first = pool.shift();
      if (first === undefined) throw new Error('bag exhausted');
      return first;
    },
    peek(n: number): PieceId[] {
      ensure(Math.max(0, n));
      return pool.slice(0, Math.max(0, n));
    },
  };
};

/** Deterministic sequence for a seed — the helper the determinism tests use. */
export const queueFrom = (
  seed: number,
  length: number,
  ids: readonly PieceId[] = PIECE_IDS,
): PieceId[] => {
  const bag = createBag(createRng(seed), ids);
  return Array.from({ length: Math.max(0, length) }, () => bag.next());
};
