/**
 * Timetable generator (backend.md §3.2): unit domains → soft- and fest-aware greedy construction →
 * min-conflicts repair with tabu and restarts → simulated annealing on S1–S6 + fest with hard
 * fixed at 0 → independent re-check with the validator port.
 *
 * Deterministic for a given instance, seed and iteration budget; the wall-clock budget is a
 * safety cap (`stopped_by: "time"` means the result may differ between machines).
 */
import type {
  Assignment,
  SolverProgress,
  SolverStopReason,
  Violation,
} from "@/lib/contracts";

import { checkTimetable } from "./checker";
import {
  DEFAULT_FEST_WEIGHT,
  deriveFestDemands,
  festDemandGroups,
  festSummaryFor,
  type FestSummary,
} from "./fest";
import type { Instance } from "./instance";
import { buildModel, TimetableState, type ModelIssue } from "./model";
import { mulberry32 } from "./rng";
import { softScore, type SoftScore } from "./soft";
import {
  Annealer,
  BestState,
  constructionOrder,
  Moves,
  Repairer,
  reservedRooms,
  softLowerBound,
  T0,
} from "./solver-search";

export const SOLVER_ALGORITHM = "greedy+repair+SA";

/**
 * Default iteration budget (all phases), at ~0.85 M iterations/s on a Ryzen 5 7530U. A feasible
 * run that never converges takes about 3–4 s of active time; an infeasible one (repair keeps
 * re-inserting) up to about 6.5 s, so slower hosts may end on the 8 s safety cap instead
 * (`stopped_by: "time"`). The public dataset usually converges (soft 3, the proven floor, with
 * fest 0) in well under a second.
 */
export const DEFAULT_SOLVER_ITERATIONS = 2_500_000;

/** Default progress interval, in iterations. */
const DEFAULT_PROGRESS_EVERY = 5000;
/** Cap on min-conflicts repair iterations (part of the overall budget). */
const REPAIR_CAP = 100_000;
/** How often (in iterations) the wall clock is read. */
const CLOCK_EVERY = 128;
/**
 * When repair left sessions unplaced, the annealer gets this many iterations to re-insert them
 * (it retries every 1000) before the run stops as certainly infeasible.
 */
const STUCK_ANNEAL_WINDOW = 50_000;

/** Why a run ended (`SolverStopReason` in the contracts). */
export type { SolverStopReason };

export type SolverOptions = {
  seed: number;
  /** Wall-clock safety cap on active solver time. */
  timeBudgetMs: number;
  /**
   * Deterministic budget over all phases; defaults to `DEFAULT_SOLVER_ITERATIONS`. The greedy
   * construction always completes (one iteration per placeable unit), so with a smaller cap, or
   * `0`, the reported `iterations` can exceed it.
   */
  maxIterations?: number;
  /** Fest cost per booking-score point; defaults to `DEFAULT_FEST_WEIGHT`. 0 disables fest-awareness. */
  festWeight?: number;
  /** Yield a progress snapshot every N iterations (default 5000). */
  progressEvery?: number;
  /** Clock in ms; defaults to `performance.now()`. Injected for tests. */
  now?: () => number;
};

export type SolverResult = {
  /** Dataset session order; unplaced sessions are omitted, never forced. */
  assignments: Assignment[];
  unplaced: string[];
  /** Independent `checkTimetable` re-check; empty on success. */
  hard: Violation[];
  /** `softScore` full recompute of `assignments`. */
  soft: SoftScore;
  fest: FestSummary;
  seed: number;
  iterations: number;
  /** Active solver time in whole milliseconds (time spent by the consumer between snapshots excluded). */
  ms: number;
  /**
   * `iterations` / `time`: that budget ran out. `converged`: the search stopped early because
   * more iterations cannot change the outcome — soft reached the proven floor with fest 0, or the
   * timetable is certainly infeasible (a session with no feasible start, clashing fixed slots, or
   * stuck sessions that repair and the annealer's re-insertions could not place).
   */
  stopped_by: SolverStopReason;
  algorithm: string;
  issues: ModelIssue[];
};

/** A non-negative integer option, or the fallback when it is missing or not finite. */
function count(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

/** The solver as a generator: yields progress snapshots, returns the result. */
export function* solveSteps(
  instance: Instance,
  options: SolverOptions,
): Generator<SolverProgress, SolverResult, void> {
  const clock = options.now ?? (() => performance.now());
  const budgetMs = Number.isNaN(options.timeBudgetMs)
    ? Number.POSITIVE_INFINITY
    : options.timeBudgetMs;
  const maxIterations = count(options.maxIterations, DEFAULT_SOLVER_ITERATIONS);
  const progressEvery = Math.max(
    1,
    count(options.progressEvery, DEFAULT_PROGRESS_EVERY),
  );
  const rawWeight = options.festWeight ?? DEFAULT_FEST_WEIGHT;
  const festWeight =
    Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 0;

  // Active time: the consumer's time between a yield and the next resume is not counted.
  let active = 0;
  let resumedAt = clock();
  const elapsed = () => active + (clock() - resumedAt);
  const pause = () => {
    active += clock() - resumedAt;
  };
  const resume = () => {
    resumedAt = clock();
  };

  const demands =
    festWeight > 0
      ? deriveFestDemands(instance, { weightPerPoint: festWeight })
      : [];
  const model = buildModel(instance, { reservedRooms: reservedRooms(demands) });
  const state = new TimetableState(model, {
    demands,
    groups: demands.map((d) => festDemandGroups(instance, d.request_id)),
    weightPerPoint: festWeight,
  });
  const moves = new Moves(state, mulberry32(options.seed));
  const lowerBound = softLowerBound(model);
  // Sessions of units with an empty domain can never be placed.
  const unplaceable = model.units
    .filter((unit) => unit.starts.length === 0)
    .reduce((sum, unit) => sum + unit.members.length, 0);

  let iterations = 0;
  let stoppedBy: SolverStopReason = "iterations";
  let best: BestState | null = null;
  const snapshot = (
    phase: SolverProgress["phase"],
    temperature: number | null,
  ): SolverProgress => ({
    phase,
    iteration: iterations,
    hard: state.unplacedSessions,
    soft: state.soft,
    fest: state.festCost,
    best: best ? best.objective : state.objective,
    temperature,
    ms: Math.round(active),
  });
  // soft ≥ lowerBound and fest ≥ 0 once every placeable unit is in, so reaching the bound with
  // fest 0 is optimal.
  const converged = () =>
    state.unplacedSessions <= unplaceable &&
    state.festPoints === 0 &&
    state.soft <= lowerBound;

  // Phase 1: greedy construction (always completes; one iteration per unit).
  const order = constructionOrder(model);
  const stuck = moves.construct(order);
  iterations += order.length;
  best = new BestState(state);
  pause();
  yield snapshot("construct", null);
  resume();

  // Phase 2: min-conflicts repair, only when the greedy left units unplaced.
  if (stuck.length > 0 && iterations < maxIterations) {
    const repair = new Repairer(moves, order, stuck);
    const cap = Math.min(maxIterations, iterations + REPAIR_CAP);
    while (!repair.done && iterations < cap) {
      if (iterations % CLOCK_EVERY === 0 && elapsed() >= budgetMs) {
        stoppedBy = "time";
        break;
      }
      repair.step();
      iterations++;
      if (iterations % progressEvery === 0) {
        pause();
        yield snapshot("repair", null);
        resume();
      }
    }
    repair.finish();
    best = repair.best;
    best.offer(state);
    pause();
    yield snapshot("repair", null);
    resume();
  }

  // Phase 3: simulated annealing on soft + fest, hard fixed at 0. Skipped when the timetable is
  // certainly infeasible: the result is rejected whatever its soft score.
  if (converged() || model.certainlyInfeasible) {
    stoppedBy = "converged";
  } else if (stoppedBy !== "time" && iterations < maxIterations) {
    const budget = maxIterations - iterations;
    const anneal = new Annealer(moves, budget, best);
    pause();
    yield snapshot("anneal", T0);
    resume();
    for (let i = 0; i < budget; i++) {
      if (i % CLOCK_EVERY === 0 && elapsed() >= budgetMs) {
        stoppedBy = "time";
        break;
      }
      anneal.step(i);
      iterations++;
      if (best.unplaced <= unplaceable && best.objective <= lowerBound) {
        stoppedBy = "converged";
        break;
      }
      if (i + 1 >= STUCK_ANNEAL_WINDOW && best.unplaced > unplaceable) {
        stoppedBy = "converged";
        break;
      }
      if (iterations % progressEvery === 0) {
        pause();
        yield snapshot("anneal", anneal.temperature);
        resume();
      }
    }
  }
  // Whatever stopped the search, finish on the best state seen.
  best.offer(state);
  state.restore(best.snap);

  // Phase 4: independent re-check of the best timetable with the validator port.
  const assignments = state.toAssignments();
  const hard = checkTimetable(instance, assignments).violations;
  const soft = softScore(instance, assignments);
  const fest = festSummaryFor(instance, assignments, {
    weightPerPoint: festWeight,
  });
  pause();
  const ms = Math.round(active);
  yield {
    phase: "verify",
    iteration: iterations,
    hard: hard.length,
    soft: soft.total,
    fest: fest.cost,
    best: soft.total + fest.cost,
    temperature: null,
    ms,
  };
  resume();

  return {
    assignments,
    unplaced: state.unplacedSessionIds(),
    hard,
    soft,
    fest,
    seed: options.seed,
    iterations,
    ms,
    stopped_by: stoppedBy,
    algorithm: SOLVER_ALGORITHM,
    issues: model.issues,
  };
}

/** Runs `solveSteps` to completion. */
export function solve(
  instance: Instance,
  options: SolverOptions & { onProgress?: (progress: SolverProgress) => void },
): SolverResult {
  const { onProgress, ...rest } = options;
  const steps = solveSteps(instance, rest);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
    onProgress?.(next.value);
  }
}
