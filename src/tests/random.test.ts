import { describe, expect, it } from 'vitest';
import {
  PIECE_IDS,
  type PieceId,
} from '../engine/types.js';
import {
  createBag,
  createRng,
  queueFrom,
  randInt,
  seedFromString,
  seedToString,
  shuffle,
} from '../engine/random.js';
import { SEED } from './helpers.js';

describe('the random stream', () => {
  it('stays inside [0, 1)', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 2000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('repeats exactly for the same seed and diverges for another one', () => {
    const a = Array.from({ length: 64 }, createRng(SEED));
    const b = Array.from({ length: 64 }, createRng(SEED));
    const c = Array.from({ length: 64 }, createRng(SEED + 1));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('covers the range', () => {
    const rng = createRng(SEED);
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i += 1) {
      const index = Math.floor(rng() * 4);
      buckets[index] = (buckets[index] ?? 0) + 1;
    }
    for (const bucket of buckets) expect(bucket).toBeGreaterThan(400);
  });

  it('bounds randInt and tolerates an empty range', () => {
    const rng = createRng(SEED);
    expect(randInt(rng, 0)).toBe(0);
    expect(randInt(rng, 1)).toBe(0);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) {
      const value = randInt(rng, 7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
      seen.add(value);
    }
    expect(seen.size).toBe(7);
  });
});

describe('shuffle', () => {
  it('is a deterministic permutation that leaves the input alone', () => {
    const source = [...PIECE_IDS];
    const first = shuffle(createRng(SEED), source);
    const second = shuffle(createRng(SEED), source);
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual([...PIECE_IDS].sort());
    expect(source).toEqual([...PIECE_IDS]);
  });
});

describe('the 7-bag randomiser', () => {
  it('deals all seven identities in every aligned window of seven', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const queue = queueFrom(seed, 70);
      for (let window = 0; window < 70; window += 7) {
        const slice = queue.slice(window, window + 7);
        expect(new Set(slice).size, `seed ${seed} window ${window}`).toBe(7);
      }
    }
  });

  it('never starves a piece for more than a bag and a half', () => {
    let worst = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const queue = queueFrom(seed, 60);
      for (const id of PIECE_IDS) {
        const seen: number[] = [];
        queue.forEach((piece, index) => {
          if (piece === id) seen.push(index);
        });
        for (let i = 1; i < seen.length; i += 1) {
          worst = Math.max(worst, (seen[i] ?? 0) - (seen[i - 1] ?? 0));
        }
      }
    }
    // The widest legal gap is one bag plus six: the last slot of one bag followed
    // by the second-to-last slot of the next. Anything larger means a bag stalled.
    expect(worst).toBeLessThanOrEqual(13);
  });

  it('peek does not consume, and agrees with what next returns', () => {
    const bag = createBag(createRng(SEED));
    const preview = bag.peek(3);
    expect(preview).toHaveLength(3);
    expect(bag.peek(3)).toEqual(preview);
    expect(bag.next()).toBe(preview[0]);
    expect(bag.peek(2)).toEqual(preview.slice(1));
  });

  it('deals more identities than one bag holds', () => {
    const queue = queueFrom(SEED, 20);
    expect(queue).toHaveLength(20);
    expect(new Set(queue.slice(0, 14)).size).toBe(7);
  });

  it('is reproducible for a seed and different for another', () => {
    expect(queueFrom(SEED, 21)).toEqual(queueFrom(SEED, 21));
    expect(queueFrom(SEED, 21)).not.toEqual(queueFrom(SEED ^ 0x5f, 21));
  });

  it('accepts a restricted piece set', () => {
    const subset: PieceId[] = ['O', 'I'];
    const queue = queueFrom(SEED, 12, subset);
    expect(new Set(queue)).toEqual(new Set(subset));
  });
});

describe('seed text', () => {
  it('renders as eight upper-case hex digits', () => {
    expect(seedToString(0x5eed1234)).toBe('5EED1234');
    expect(seedToString(0)).toBe('00000000');
    expect(seedToString(1)).toBe('00000001');
  });

  it('reads hex back to the same number', () => {
    expect(seedFromString('5EED1234')).toBe(0x5eed1234);
    expect(seedFromString(' 5eed1234 ')).toBe(0x5eed1234);
    expect(seedFromString(seedToString(SEED))).toBe(SEED);
  });

  it('hashes anything that is not hex, stably', () => {
    expect(seedFromString('orbit-drop')).toBe(seedFromString('orbit-drop'));
    expect(seedFromString('orbit-drop')).not.toBe(seedFromString('orbit-drop!'));
    expect(seedFromString('orbit-drop')).toBeGreaterThanOrEqual(0);
    expect(seedFromString('orbit-drop')).toBeLessThanOrEqual(0xffffffff);
    // An empty name still has to land somewhere, and it must not read as hex zero.
    expect(seedFromString('')).toBe(0x811c9dc5);
  });

  it('prefers hex over hashing when a word happens to be hex', () => {
    expect(seedFromString('deadbeef')).toBe(0xdeadbeef);
  });
});
