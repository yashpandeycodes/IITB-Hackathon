/**
 * Seeded randomness for the solver. The engine never calls `Math.random`, so the same input and
 * seed always give the same output.
 */

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** mulberry32: a small, fast 32-bit PRNG. Any integer seed works (it is taken mod 2^32). */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [0, maxExclusive). */
export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/** One item, chosen uniformly. Throws on an empty list. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError("pick() from an empty list");
  return items[randomInt(rng, items.length)];
}

/** A shuffled copy (Fisher–Yates); the input is left as is. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
