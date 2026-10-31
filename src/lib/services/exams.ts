import "server-only";
import type { Db } from "mongodb";
import type { ExamSchedule } from "@/lib/contracts";
import { buildInstance, scheduleExams } from "@/lib/engine";
import { COLLECTIONS } from "@/lib/db/collections";
import { withDatasetLock } from "@/lib/db/locks";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import {
  activateExamSchedule,
  getActiveExamSchedule,
  insertExamSchedule,
  pruneInactiveExamSchedules,
} from "@/lib/db/repos/exam-schedules";
import { infeasible } from "@/lib/errors";
import { getDatasetForExport } from "./dataset";

/**
 * Midsem exam schedules. Exams sit in a separate exam week, so they don't depend on the
 * timetable and are not versioned with it; each run stores and activates a new schedule.
 */

export const EXAM_ALGORITHM = "dsatur+bfd";

/** How many violations an `INFEASIBLE` error lists. */
const MAX_REPORTED_VIOLATIONS = 50;

/** Superseded exam schedules kept for history; older ones are deleted after each run. */
const KEEP_INACTIVE_SCHEDULES = 20;

/**
 * Schedules every exam of the loaded dataset and makes the result the active exam schedule.
 * `INFEASIBLE` (422) when an exam can't be placed or the re-check finds a hard violation;
 * nothing is saved then. Call inside a held dataset lock; otherwise use {@link generateExams}.
 */
export async function generateExamsUnlocked(
  db: Db,
  options: { actor: string },
): Promise<ExamSchedule> {
  const dataset = await getDatasetForExport(db);
  const started = performance.now();
  const result = scheduleExams(buildInstance(dataset));
  const ms = Math.round(performance.now() - started);
  if (result.unplaced.length > 0 || result.violations.length > 0) {
    throw infeasible(
      `Could not schedule every exam without breaking a hard rule (${result.unplaced.length} unplaced, ${result.violations.length} violations). Nothing was saved.`,
      {
        unplaced: result.unplaced.slice(0, MAX_REPORTED_VIOLATIONS),
        unplaced_total: result.unplaced.length,
        violations: result.violations.slice(0, MAX_REPORTED_VIOLATIONS),
        violations_total: result.violations.length,
      },
    );
  }

  const draft = await insertExamSchedule(db, {
    dataset_id: dataset.dataset_id,
    status: "draft",
    exams: result.exams,
    penalty: result.penalty,
    solver_meta: {
      seed: 0,
      ms,
      iterations: result.iterations,
      algorithm: EXAM_ALGORITHM,
    },
    created_by: options.actor,
  });
  const schedule = await activateExamSchedule(db, draft.id);
  await pruneInactiveExamSchedules(db, KEEP_INACTIVE_SCHEDULES);
  await appendAuditLog(db, {
    actor: options.actor,
    action: "generate",
    entity: COLLECTIONS.exam_schedules,
    entity_id: schedule.id,
    after: {
      exams: schedule.exams.length,
      penalty: schedule.penalty,
      iterations: result.iterations,
      ms,
    },
  });
  return schedule;
}

/** {@link generateExamsUnlocked} under the dataset lock (`CONFLICT` while another run holds it). */
export function generateExams(
  db: Db,
  options: { actor: string },
): Promise<ExamSchedule> {
  return withDatasetLock(db, () => generateExamsUnlocked(db, options));
}

/** The active exam schedule, or null before one has been generated. */
export function getActiveExams(db: Db): Promise<ExamSchedule | null> {
  return getActiveExamSchedule(db);
}
