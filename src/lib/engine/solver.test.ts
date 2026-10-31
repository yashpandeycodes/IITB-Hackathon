import { describe, expect, it } from "vitest";

import {
  SolverProgressSchema,
  type Dataset,
  type SolverProgress,
} from "@/lib/contracts";

import { checkTimetable } from "./checker";
import { festSummaryFor } from "./fest";
import { buildInstance } from "./instance";
import { buildModel, TimetableState } from "./model";
import { mulberry32, randomInt, shuffle } from "./rng";
import { softScore } from "./soft";
import {
  DEFAULT_SOLVER_ITERATIONS,
  SOLVER_ALGORITHM,
  solve,
  solveSteps,
  type SolverResult,
} from "./solver";
import { softLowerBound } from "./solver-search";
import { datasetWith, publicDataset } from "./test-fixtures";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;

/** Public data plus `n` seeded daytime club requests (half of them with a mandatory group). */
function withSyntheticRequests(n: number): Dataset {
  const dataset = publicDataset();
  const rng = mulberry32(n + 9);
  const groups = dataset.student_groups.map((g) => g.id);
  for (let i = 0; i < n; i++) {
    const from = 1 + randomInt(rng, 8);
    dataset.booking_requests.push({
      id: `SYN-${i}`,
      submitted_at: "2027-01-10T10:00:00+05:30",
      requester: "synthetic",
      role: "club",
      department: null,
      requested_category: "club_event",
      title: "Synthetic",
      attendance: 30,
      duration_periods: 1 + randomInt(rng, 2),
      windows: [
        {
          day: DAYS[randomInt(rng, 5)],
          from_period: from,
          to_period: from + 2,
        },
      ],
      room_types: ["classroom", "lecture_hall"],
      needs: [],
      requested_room: null,
      mandatory_for_groups:
        rng() < 0.5 ? [groups[randomInt(rng, groups.length)]] : [],
      series_id: null,
    });
  }
  return dataset;
}

const PUBLIC = buildInstance(publicDataset());

/** Public data where F10 avoids every period: S1 has a floor the solver cannot prove, so it anneals. */
function annealingInstance() {
  const dataset = publicDataset();
  dataset.faculty.find((f) => f.id === "F10")!.preferences = [
    { type: "avoid", periods: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  ];
  return buildInstance(dataset);
}
const ANNEALING = annealingInstance();

function run(steps: Generator<SolverProgress, SolverResult, void>) {
  const progress: SolverProgress[] = [];
  for (;;) {
    const next = steps.next();
    if (next.done) return { progress, result: next.value };
    progress.push(next.value);
  }
}

describe("solve (public dataset)", () => {
  it("smoke: places every session with no hard violation", () => {
    const result = solve(PUBLIC, {
      seed: 42,
      timeBudgetMs: 60_000,
      maxIterations: 30_000,
    });
    expect(result.iterations).toBeLessThanOrEqual(30_000);
    expect(result.hard).toEqual([]);
    expect(result.unplaced).toEqual([]);
    expect(result.assignments).toHaveLength(189);
    expect(result.issues).toEqual([]);
    expect(result.algorithm).toBe(SOLVER_ALGORITHM);
    expect(result.seed).toBe(42);
    expect(result.soft).toEqual(softScore(PUBLIC, result.assignments));
    expect(result.fest).toEqual(festSummaryFor(PUBLIC, result.assignments));
    expect(checkTimetable(PUBLIC, result.assignments).violations).toEqual([]);
    // S4 ≥ 3 is a proven floor (F08 teaches CS204's three lectures on TUE/THU only).
    expect(result.soft.penalties.S4).toBeGreaterThanOrEqual(3);
    expect(result.soft.total).toBeLessThanOrEqual(10);
    expect(result.fest.cost).toBe(0);
    expect(result.assignments.map((a) => a.session_id)).toEqual([
      ...PUBLIC.sessions.keys(),
    ]);
  });

  it("stops as converged at the proven floor (soft 3, fest 0) straight from the greedy", () => {
    const result = solve(PUBLIC, {
      seed: 42,
      timeBudgetMs: Number.POSITIVE_INFINITY,
    });
    expect(result.stopped_by).toBe("converged");
    expect(result.soft.total).toBe(3);
    expect(result.fest.cost).toBe(0);
    expect(result.iterations).toBe(183);
    expect(result.iterations).toBeLessThan(DEFAULT_SOLVER_ITERATIONS);
  });

  it("reaches soft 3 with fest 0 for seeds 2–10 too", () => {
    for (let seed = 2; seed <= 10; seed++) {
      const result = solve(PUBLIC, {
        seed,
        timeBudgetMs: Number.POSITIVE_INFINITY,
      });
      expect(result.hard).toEqual([]);
      expect(result.stopped_by).toBe("converged");
      expect(result.soft.total).toBe(3);
      expect(result.fest.cost).toBe(0);
    }
  });

  it("can ignore the fest demands", () => {
    const result = solve(PUBLIC, {
      seed: 1,
      timeBudgetMs: 60_000,
      maxIterations: 5000,
      festWeight: 0,
    });
    expect(result.hard).toEqual([]);
    expect(result.fest.cost).toBe(0);
    expect(result.fest.weight_per_point).toBe(0);
    expect(result.fest.demands).toHaveLength(8);
  });
});

describe("solve (determinism and budgets)", () => {
  it("gives identical output for the same seed and iteration budget", () => {
    const options = {
      seed: 7,
      timeBudgetMs: Number.POSITIVE_INFINITY,
      maxIterations: 20_000,
    };
    const a = solve(ANNEALING, options);
    const b = solve(ANNEALING, options);
    expect(a.stopped_by).toBe("iterations");
    expect(a.iterations).toBe(20_000);
    expect(b.assignments).toEqual(a.assignments);
    expect(b.soft).toEqual(a.soft);
    expect(b.fest).toEqual(a.fest);
    const other = solve(ANNEALING, { ...options, seed: 8 });
    expect(other.assignments).not.toEqual(a.assignments);
    expect(other.hard).toEqual([]);
  });

  it("solveSteps yields valid, ordered snapshots and returns what solve returns", () => {
    const options = {
      seed: 3,
      timeBudgetMs: Number.POSITIVE_INFINITY,
      maxIterations: 12_000,
      progressEvery: 1000,
    };
    const { progress, result } = run(solveSteps(ANNEALING, options));
    for (const p of progress) expect(SolverProgressSchema.parse(p)).toEqual(p);
    const phases = progress.map((p) => p.phase);
    expect(phases[0]).toBe("construct");
    expect(phases).toContain("anneal");
    expect(phases.at(-1)).toBe("verify");
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i].iteration).toBeGreaterThanOrEqual(
        progress[i - 1].iteration,
      );
      expect(progress[i].ms).toBeGreaterThanOrEqual(progress[i - 1].ms);
    }
    // A snapshot at least every `progressEvery` iterations.
    expect(progress.filter((p) => p.phase === "anneal").length).toBeGreaterThan(
      10,
    );
    for (const p of progress) {
      expect(p.temperature === null).toBe(p.phase !== "anneal");
    }
    const final = progress.at(-1)!;
    expect(final).toMatchObject({
      iteration: result.iterations,
      hard: result.hard.length,
      soft: result.soft.total,
      fest: result.fest.cost,
    });
    const seen: SolverProgress[] = [];
    const direct = solve(ANNEALING, {
      ...options,
      onProgress: (p) => seen.push(p),
    });
    expect(direct.assignments).toEqual(result.assignments);
    expect(seen.map((p) => p.iteration)).toEqual(
      progress.map((p) => p.iteration),
    );
  });

  it("stops on the time budget with a fake clock", () => {
    let t = 0;
    const result = solve(ANNEALING, {
      seed: 1,
      timeBudgetMs: 5000,
      maxIterations: 1_000_000,
      now: () => (t += 1000),
    });
    expect(result.stopped_by).toBe("time");
    expect(result.iterations).toBeLessThan(1_000_000);
    expect(result.hard).toEqual([]);
    expect(result.ms).toBeGreaterThanOrEqual(5000);
  });

  it("does not charge the consumer's time between snapshots to the budget", () => {
    let t = 0;
    const steps = solveSteps(ANNEALING, {
      seed: 1,
      timeBudgetMs: 5000,
      maxIterations: 20_000,
      progressEvery: 2000,
      now: () => t,
    });
    let next = steps.next();
    while (!next.done) {
      t += 60_000; // a very slow consumer
      next = steps.next();
    }
    expect(next.value.stopped_by).toBe("iterations");
    expect(next.value.ms).toBe(0);
  });
});

describe("solve (hard cases)", () => {
  it("omits a session with no feasible start, reports exactly one H1, and stops early", () => {
    const dataset = publicDataset();
    dataset.faculty.find((f) => f.id === "F37")!.unavailable = (
      ["MON", "TUE", "WED", "THU", "FRI"] as const
    ).map((day) => ({ day, periods: [1, 2, 3, 4, 5, 6, 7, 8, 9] }));
    const instance = buildInstance(dataset);
    const result = solve(instance, {
      seed: 42,
      timeBudgetMs: 60_000,
      maxIterations: 5000,
    });
    expect(result.unplaced).toEqual(["ID101-ALL-L1"]);
    expect(result.hard).toEqual([
      {
        rule: "H1",
        where: "timetable",
        detail: "Session ID101-ALL-L1 is not scheduled",
      },
    ]);
    expect(result.assignments).toHaveLength(188);
    expect(result.issues.map((i) => i.kind)).toEqual(["empty_domain"]);
    // Certainly infeasible: no annealing after the greedy.
    expect(result.stopped_by).toBe("converged");
    expect(result.iterations).toBe(182);
  });

  it("reports two fixed sessions that clash and does not anneal", () => {
    const dataset = publicDataset();
    // Both CSE-2 lectures fixed at TUE P3: they share the group.
    for (const id of ["CS201-L1", "CS202-L1"]) {
      dataset.sessions.find((s) => s.id === id)!.fixed_slot = {
        day: "TUE",
        start_period: 3,
      };
    }
    const result = solve(buildInstance(dataset), {
      seed: 1,
      timeBudgetMs: Number.POSITIVE_INFINITY,
    });
    expect(result.issues).toEqual([
      {
        kind: "fixed_slot_invalid",
        session_ids: ["CS201-L1", "CS202-L1"],
        detail: expect.stringContaining("share group CSE-2"),
      },
    ]);
    expect(result.unplaced).toHaveLength(1);
    expect(["CS201-L1", "CS202-L1"]).toContain(result.unplaced[0]);
    expect(result.hard.map((v) => v.rule)).toEqual(["H1"]);
    expect(result.stopped_by).toBe("converged");
    // Greedy, then repair until it gives up; no annealing.
    expect(result.iterations).toBeLessThan(DEFAULT_SOLVER_ITERATIONS / 10);
  });

  it("repair moves a greedy choice out of the way", () => {
    // PHY-LAB is open only MON P2–P4 and P6–P8; F23 would rather not teach P6–P8, so the greedy
    // puts the lab at MON P2. F21 is free only MON P2–P4, so the lecture is stuck until repair
    // evicts the lab, which then goes to MON P6.
    const dataset = datasetWith(["PH191-A-P1", "PH101-A-L1"], (d: Dataset) => {
      d.room_unavailability = (["TUE", "WED", "THU", "FRI"] as const).map(
        (day) => ({
          room_id: "PHY-LAB",
          day,
          periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        }),
      );
      d.room_unavailability.push({
        room_id: "PHY-LAB",
        day: "MON",
        periods: [1, 5, 9],
      });
      d.faculty.find((f) => f.id === "F23")!.preferences = [
        { type: "avoid", periods: [6, 7, 8] },
      ];
      d.faculty.find((f) => f.id === "F21")!.unavailable = [
        ...(["TUE", "WED", "THU", "FRI"] as const).map((day) => ({
          day,
          periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        })),
        { day: "MON", periods: [1, 5, 6, 7, 8, 9] },
      ];
    });
    const instance = buildInstance(dataset);
    const { progress, result } = run(
      solveSteps(instance, {
        seed: 1,
        timeBudgetMs: 60_000,
        maxIterations: 3000,
      }),
    );
    expect(progress[0]).toMatchObject({ phase: "construct", hard: 1 });
    expect(progress.map((p) => p.phase)).toContain("repair");
    expect(result.hard).toEqual([]);
    expect(result.assignments).toEqual([
      expect.objectContaining({ session_id: "PH101-A-L1", day: "MON" }),
      {
        session_id: "PH191-A-P1",
        day: "MON",
        start_period: 6,
        room_id: "PHY-LAB",
      },
    ]);
    expect(result.soft.penalties.S1).toBe(6);
  });

  it("leaves one workshop lab out when MECH-WS has six lab slots for seven blocks", () => {
    const dataset = publicDataset();
    for (const day of ["MON", "TUE"] as const) {
      dataset.room_unavailability.push({
        room_id: "MECH-WS",
        day,
        periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      });
    }
    const instance = buildInstance(dataset);
    // Default iteration budget: repair gives up, the annealer gets a short re-insertion window,
    // and the run stops instead of burning the whole budget.
    const { progress, result } = run(
      solveSteps(instance, {
        seed: 2,
        timeBudgetMs: Number.POSITIVE_INFINITY,
      }),
    );
    expect(progress.map((p) => p.phase)).toContain("repair");
    expect(result.stopped_by).toBe("converged");
    expect(result.iterations).toBeLessThanOrEqual(183 + 100_000 + 50_000);
    expect(result.unplaced).toHaveLength(1);
    expect(instance.sessions.get(result.unplaced[0])!.room_types).toEqual([
      "workshop",
    ]);
    expect(result.hard.map((v) => v.rule)).toEqual(["H1"]);
    expect(result.assignments).toHaveLength(188);
  });

  it("places a fixed session exactly at its slot", () => {
    const dataset = publicDataset();
    const session = dataset.sessions.find((s) => s.id === "MA101-AB-L1")!;
    session.fixed_slot = { day: "THU", start_period: 7 };
    const instance = buildInstance(dataset);
    const result = solve(instance, {
      seed: 5,
      timeBudgetMs: 60_000,
      maxIterations: 5000,
    });
    expect(result.hard).toEqual([]);
    expect(
      result.assignments.find((a) => a.session_id === "MA101-AB-L1"),
    ).toMatchObject({ day: "THU", start_period: 7 });
  });

  it("handles a dataset without sessions", () => {
    const result = solve(buildInstance(datasetWith([])), {
      seed: 1,
      timeBudgetMs: 1000,
    });
    expect(result.assignments).toEqual([]);
    expect(result.hard).toEqual([]);
    expect(result.soft.total).toBe(0);
    expect(result.stopped_by).toBe("converged");
  });
});

describe("solve (many booking requests)", () => {
  it("handles 200 extra daytime requests without being throttled", () => {
    const instance = buildInstance(withSyntheticRequests(200));
    const result = solve(instance, {
      seed: 42,
      timeBudgetMs: 120_000,
      maxIterations: 40_000,
    });
    expect(result.stopped_by).not.toBe("time");
    expect(result.hard).toEqual([]);
    expect(result.fest.demands.length).toBeGreaterThan(150);
    expect(result.fest).toEqual(festSummaryFor(instance, result.assignments));
  });
});

describe("softLowerBound", () => {
  it("is 3 on the public data (F08's three CS204 lectures fit on two days)", () => {
    expect(softLowerBound(buildModel(PUBLIC))).toBe(3);
  });

  it("never exceeds the true optimum (brute force over tiny instances)", () => {
    const rng = mulberry32(11);
    const ids = ["CS204-L1", "CS204-L2", "CS204-L3", "CS201-L1", "CS202-L1"];
    let feasible = 0;
    let tightAboveZero = 0;
    for (let trial = 0; trial < 12; trial++) {
      const dataset = datasetWith(ids, (d) => {
        d.rooms = d.rooms.filter((r) => r.id === "CR-101");
        d.room_unavailability = [];
        for (const f of d.faculty) {
          // 1–3 teaching days, P2–P4 only, plus a random avoid preference.
          const open = shuffle(rng, DAYS).slice(0, 1 + randomInt(rng, 3));
          f.unavailable = DAYS.map((day) => ({
            day,
            periods: open.includes(day)
              ? [1, 5, 6, 7, 8, 9]
              : [1, 2, 3, 4, 5, 6, 7, 8, 9],
          }));
          f.preferences = [
            { type: "avoid", days: [DAYS[randomInt(rng, 5)]], periods: [3] },
          ];
        }
      });
      const instance = buildInstance(dataset);
      const model = buildModel(instance);
      const bound = softLowerBound(model);
      const state = new TimetableState(model);
      const rooms = new Int32Array(1);
      let best = Number.POSITIVE_INFINITY;
      let bestAssignments: ReturnType<TimetableState["toAssignments"]> = [];
      const search = (i: number) => {
        if (i === model.units.length) {
          if (state.soft < best) {
            best = state.soft;
            bestAssignments = state.toAssignments();
          }
          return;
        }
        for (const s of model.units[i].starts) {
          if (
            !state.firstFreeRooms(i, s, rooms) ||
            !state.canPlace(i, s, rooms)
          ) {
            continue;
          }
          state.place(i, s, rooms);
          search(i + 1);
          state.remove(i);
        }
      };
      search(0);
      if (!Number.isFinite(best)) continue; // No complete timetable exists.
      feasible++;
      expect(softScore(instance, bestAssignments).total).toBe(best);
      expect(bound).toBeLessThanOrEqual(best);
      if (bound > 0 && bound === best) tightAboveZero++;
    }
    expect(feasible).toBeGreaterThanOrEqual(4);
    expect(tightAboveZero).toBeGreaterThan(0);
  });
});

describe.skipIf(!process.env.SOLVER_QUALITY)("solve (quality, opt-in)", () => {
  it("default budget: soft ≤ 10 and fest 0 on the public data", () => {
    for (const seed of [42, 1, 2, 3]) {
      const result = solve(PUBLIC, { seed, timeBudgetMs: 30_000 });
      console.info(
        `seed ${seed}: ${result.ms.toFixed(0)} ms, ${result.iterations} iterations, ` +
          `${result.stopped_by}, soft ${JSON.stringify(result.soft.penalties)} = ` +
          `${result.soft.total}, fest ${result.fest.cost}`,
      );
      expect(result.hard).toEqual([]);
      expect(result.soft.total).toBeLessThanOrEqual(10);
      expect(result.fest.cost).toBe(0);
    }
  });
});
