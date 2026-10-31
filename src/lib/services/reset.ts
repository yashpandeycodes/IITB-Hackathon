import "server-only";
import type { Db } from "mongodb";
import type {
  DatasetSource,
  ResetReport,
  ResetSource,
  Settings,
} from "@/lib/contracts";
import { seedDemoUsers } from "@/lib/auth/seed";
import { getBundledDataset } from "@/lib/dataset";
import { COLLECTIONS, type CollectionName } from "@/lib/db/collections";
import { ensureIndexes } from "@/lib/db/indexes";
import { withDatasetLock } from "@/lib/db/locks";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import { getDatasetRaw } from "@/lib/db/repos/datasets";
import { saveSettings } from "@/lib/db/repos/settings";
import { isApiError } from "@/lib/errors";
import {
  DERIVED_COLLECTIONS,
  getActiveDataset,
  importValidatedDatasetUnlocked,
  validateDataset,
} from "./dataset";
import { generateExamsUnlocked } from "./exams";
import { defaultSettings } from "./settings";
import {
  activateTimetableUnlocked,
  generateTimetableUnlocked,
} from "./timetable";

/**
 * Locking pattern for dataset-wide writes. `resetDemo` and `importDataset` take the dataset
 * lock (`withDatasetLock`, a concurrent caller gets 409 `CONFLICT`). Everything that runs
 * inside a held lock calls an `*Unlocked` variant instead, so the lock is never taken twice:
 * `importValidatedDatasetUnlocked` here, and `generateTimetableUnlocked` (whose activation runs
 * Spectra) and `generateExamsUnlocked` (each public service = `withDatasetLock` + its
 * `*Unlocked` body), which {@link postResetPipeline} calls.
 */

/**
 * Working state a reset wipes: everything derived from the dataset plus the settings.
 * `users` are re-seeded idempotently instead (so live sessions keep working), and
 * `audit_log` / `ai_logs` are history and survive a reset.
 */
export const RESET_COLLECTIONS = [
  ...DERIVED_COLLECTIONS,
  COLLECTIONS.settings,
] as const satisfies readonly CollectionName[];

export type ResetCollection = (typeof RESET_COLLECTIONS)[number];

/** Solver knobs for tests and scripts; the reset route never sets them. */
export type ResetSolverOptions = {
  /** Safety cap on active solver time; defaults to `SOLVER_TIME_BUDGET_MS`. */
  solverBudgetMs?: number;
  /** Deterministic iteration budget; defaults to the solver's own. */
  solverMaxIterations?: number;
};

export type PostResetContext = ResetSolverOptions & {
  db: Db;
  settings: Settings;
  actor: string;
};

/** What the automatic pipeline produced (part of `ResetReport`). */
export type PostResetResult = Pick<
  ResetReport,
  "timetable_version" | "exam_schedule_id" | "decisions"
>;

const isInfeasible = (err: unknown) =>
  isApiError(err) && err.code === "INFEASIBLE";

/**
 * Runs after the data is back, inside the reset's dataset lock: generates a timetable with the
 * settings' seed, activates it (activation decides the Spectra requests), then schedules exams,
 * each through its `*Unlocked` service. Reset is the recovery path, so a step that fails on the
 * data (an infeasible upload, or an activation the booking engine refuses) is logged and
 * reported as null / 0 instead of failing the reset; other errors (e.g. the database) fail it.
 */
export async function postResetPipeline(
  context: PostResetContext,
): Promise<PostResetResult> {
  const { db, settings, actor } = context;
  let timetable_version: string | null = null;
  let decisions = 0;
  try {
    const generated = await generateTimetableUnlocked(db, {
      seed: settings.solver_seed,
      activate: false,
      actor,
      ...(context.solverBudgetMs !== undefined && {
        budgetMs: context.solverBudgetMs,
      }),
      ...(context.solverMaxIterations !== undefined && {
        maxIterations: context.solverMaxIterations,
      }),
    });
    try {
      const { version, spectra } = await activateTimetableUnlocked(
        db,
        generated.version.id,
        actor,
      );
      timetable_version = version.id;
      decisions = spectra.approved + spectra.alternatives + spectra.rejected;
    } catch (err) {
      // The draft stays stored; an admin can retry with POST /api/timetable/versions/:id/activate.
      if (!isApiError(err)) throw err;
      console.error(
        `[reset] timetable ${generated.version.id} generated but not activated: ${err.code}: ${err.message}`,
      );
    }
  } catch (err) {
    if (!isInfeasible(err)) throw err;
    console.warn(`[reset] no timetable generated: ${(err as Error).message}`);
  }

  let exam_schedule_id: string | null = null;
  try {
    exam_schedule_id = (await generateExamsUnlocked(db, { actor })).id;
  } catch (err) {
    if (!isInfeasible(err)) throw err;
    console.warn(
      `[reset] no exam schedule generated: ${(err as Error).message}`,
    );
  }
  return { timetable_version, exam_schedule_id, decisions };
}

async function datasetToLoad(
  db: Db,
  from: ResetSource,
): Promise<{ input: unknown; source: DatasetSource }> {
  if (from === "stored") {
    const stored = await getDatasetRaw(db);
    // A bundled dataset is re-read from the current build, so data fixes reach old databases.
    if (stored?.source === "upload") {
      return { input: stored.raw, source: "upload" };
    }
  }
  return { input: getBundledDataset(), source: "bundled" };
}

export type ResetOptions = ResetSolverOptions & {
  from?: ResetSource;
  actor?: string;
};

/**
 * Resets the demo (architecture §5.5): validates the bundled file (or, with `from: "stored"`,
 * the last uploaded dataset) first, then clears working state, re-imports it, ensures indexes,
 * seeds the demo users, writes default settings and runs {@link postResetPipeline} (timetable,
 * Spectra decisions, exams). A stored upload that no longer validates is a `VALIDATION_ERROR`
 * and nothing is deleted. Idempotent: running it twice leaves the same data (the solver is
 * deterministic for a seed unless the wall-clock cap stops it). Holds the dataset lock, so an
 * overlapping reset, import or generation gets `CONFLICT` (409).
 */
export async function resetDemo(
  db: Db,
  options: ResetOptions = {},
): Promise<ResetReport> {
  return withDatasetLock(db, () => runReset(db, options));
}

async function runReset(db: Db, options: ResetOptions): Promise<ResetReport> {
  const started = Date.now();
  const actor = options.actor ?? "system";
  const { input, source } = await datasetToLoad(db, options.from ?? "bundled");
  // Validate before deleting anything, so a bad stored upload leaves the database intact.
  const parsed = validateDataset(input);

  const clearedEntries = await Promise.all(
    RESET_COLLECTIONS.map(async (name) => {
      const result = await db.collection(name).deleteMany({});
      return [name, result.deletedCount] as const;
    }),
  );
  const cleared = Object.fromEntries(clearedEntries) as ResetReport["cleared"];

  const indexes = await ensureIndexes(db);
  const datasetReport = await importValidatedDatasetUnlocked(
    db,
    parsed,
    input,
    source,
  );
  const users = await seedDemoUsers(db);

  const dataset = await getActiveDataset(db);
  const settings = await saveSettings(
    db,
    defaultSettings(dataset.priority_order),
  );
  const pipeline = await postResetPipeline({
    db,
    settings,
    actor,
    solverBudgetMs: options.solverBudgetMs,
    solverMaxIterations: options.solverMaxIterations,
  });

  const report: ResetReport = {
    ...pipeline,
    dataset: datasetReport,
    cleared,
    indexes,
    users,
    settings,
    ms: Date.now() - started,
  };
  await appendAuditLog(db, {
    actor,
    action: "reset",
    entity: COLLECTIONS.datasets,
    entity_id: dataset.dataset_id,
    after: {
      source,
      counts: datasetReport.counts,
      timetable_version: pipeline.timetable_version,
      exam_schedule_id: pipeline.exam_schedule_id,
      decisions: pipeline.decisions,
    },
  });
  return report;
}
