import "server-only";
import type { Db } from "mongodb";
import type {
  Dataset,
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
import {
  DERIVED_COLLECTIONS,
  getActiveDataset,
  importValidatedDatasetUnlocked,
  validateDataset,
} from "./dataset";
import { defaultSettings } from "./settings";

/**
 * Locking pattern for dataset-wide writes. `resetDemo` and `importDataset` take the dataset
 * lock (`withDatasetLock`, a concurrent caller gets 409 `CONFLICT`). Everything that runs
 * inside a held lock calls an `*Unlocked` variant instead, so the lock is never taken twice:
 * `importValidatedDatasetUnlocked` here, and in Phase 3 `generateTimetableUnlocked`,
 * `generateExamsUnlocked` and `runSpectraUnlocked` (each public service = `withDatasetLock` +
 * its `*Unlocked` body), which {@link postResetPipeline} calls.
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

export type PostResetContext = {
  db: Db;
  dataset: Dataset;
  settings: Settings;
  actor: string;
};

/** What the automatic pipeline produced (part of `ResetReport`). */
export type PostResetResult = Pick<
  ResetReport,
  "timetable_version" | "exam_schedule_id" | "decisions"
>;

/**
 * Runs after the data is back, inside the reset's dataset lock: generate and activate the
 * timetable, schedule exams and decide the Spectra requests, each through its `*Unlocked`
 * service. Intentionally a no-op until the engine services land.
 */
export async function postResetPipeline(
  context: PostResetContext,
): Promise<PostResetResult> {
  void context;
  return { timetable_version: null, exam_schedule_id: null, decisions: 0 };
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

/**
 * Resets the demo (architecture §5.5): validates the bundled file (or, with `from: "stored"`,
 * the last uploaded dataset) first, then clears working state, re-imports it, ensures indexes,
 * seeds the demo users, writes default settings and runs {@link postResetPipeline}. A stored
 * upload that no longer validates is a `VALIDATION_ERROR` and nothing is deleted. Idempotent:
 * running it twice leaves the same data. Holds the dataset lock, so an overlapping reset or
 * import gets `CONFLICT` (409).
 */
export async function resetDemo(
  db: Db,
  options: { from?: ResetSource; actor?: string } = {},
): Promise<ResetReport> {
  return withDatasetLock(db, () => runReset(db, options));
}

async function runReset(
  db: Db,
  options: { from?: ResetSource; actor?: string },
): Promise<ResetReport> {
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
  const pipeline = await postResetPipeline({ db, dataset, settings, actor });

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
