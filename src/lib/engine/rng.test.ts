import { describe, expect, it } from "vitest";

import { mulberry32, pick, randomInt, shuffle } from "./rng";

describe("seeded RNG", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
  });

  it("matches the reference mulberry32 output", () => {
    // First value of the reference C/JS implementation for seed 1.
    expect(mulberry32(1)()).toBeCloseTo(0.6270739405881613, 15);
  });

  it("stays in [0, 1) and randomInt stays in range", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = randomInt(rng, 9);
      expect(Number.isInteger(n) && n >= 0 && n < 9).toBe(true);
    }
  });

  it("shuffle returns a permutation and leaves the input alone", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(mulberry32(3), items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(items);
    expect(shuffle(mulberry32(3), items)).toEqual(out);
  });

  it("pick chooses an element and rejects an empty list", () => {
    const rng = mulberry32(9);
    expect(["a", "b", "c"]).toContain(pick(rng, ["a", "b", "c"]));
    expect(() => pick(rng, [])).toThrow(RangeError);
  });
});
