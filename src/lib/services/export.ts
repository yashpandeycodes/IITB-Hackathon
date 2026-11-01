import "server-only";
import type { Db } from "mongodb";
import {
  DisruptionSchema,
  ScheduleAfterExportSchema,
  ScheduleExportSchema,
  toExportDecision,
  type Dataset,
  type Disruption,
  type ExportFile,
  type ScheduleAfterExport,
  type ScheduleExport,
  type ValidateQuery,
  type ValidatorReport,
} from "@/lib/contracts";
import { validateSchedule } from "@/lib/engine";
import { getBaseline, insertBaselineIfMissing } from "@/lib/db/repos/baselines";
import { listBookingDecisions } from "@/lib/db/repos/booking-decisions";
import { listAppliedChangeRequests } from "@/lib/db/repos/change-requests";
import { getActiveExamSchedule } from "@/lib/db/repos/exam-schedules";
import { listSessionOverrides } from "@/lib/db/repos/session-overrides";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { conflict, hardConstraint, isApiError } from "@/lib/errors";
import { getBaselineSchedule, getOriginalDataset } from "./baseline";
import { getActiveDatasetId, getDatasetForExport } from "./dataset";
import { getSettings } from "./settings";

/**
 * The export files (`GET /api/export?file=…`): projections of stored state, never rewrites.
 *
 * - `schedule.json`: before any change request is applied, the live projection, built against
 *   the dataset as the official validator sees it (dataset-origin requests only). From the first
 *   applied change on, the baseline captured just before it (`baselines`), checked against the
 *   dataset as it was loaded.
 * - `schedule_after.json`: the live projection after the applied changes, checked against the
 *   changed dataset with the baseline (what `--disruption … --baseline schedule.json` runs).
 * - `disruption.json`: every applied change, in apply order, as one starter-pack change file.
 *
 * Each schedule file is gated on the validator port reporting zero hard violations.
 */

function byPosition<T>(
  items: readonly T[],
  order: readonly string[],
  key: (item: T) => string,
): T[] {
  const position = new Map(order.map((id, i) => [id, i]));
  return items
    .filter((item) => position.has(key(item)))
    .sort(
      (a, b) =>
        (position.get(key(a)) as number) - (position.get(key(b)) as number),
    );
}

async function project(
  db: Db,
): Promise<{ dataset: Dataset; schedule: ScheduleExport }> {
  const [settings, dataset, version, examSchedule] = await Promise.all([
    getSettings(db),
    getDatasetForExport(db),
    getActiveTimetableVersion(db),
    getActiveExamSchedule(db),
  ]);
  const sessionOrder = dataset.sessions.map((s) => s.id);
  const requestOrder = dataset.booking_requests.map((r) => r.id);

  const [decisions, overrides] = version
    ? await Promise.all([
        listBookingDecisions(db, { timetable_version: version.id }),
        listSessionOverrides(db, { timetable_version: version.id }),
      ])
    : [[], []];
  const datasetRequests = new Set(requestOrder);

  const schedule = ScheduleExportSchema.parse({
    team: settings.team,
    dataset_id: dataset.dataset_id,
    sessions: byPosition(
      version?.assignments ?? [],
      sessionOrder,
      (a) => a.session_id,
    ),
    fest_week: {
      bookings: byPosition(decisions, requestOrder, (d) => d.request_id).map(
        toExportDecision,
      ),
      // Overrides made for requests outside the export (live requests) are left out with them.
      session_overrides: byPosition(
        overrides.filter((o) => datasetRequests.has(o.displaced_by)),
        sessionOrder,
        (o) => o.session_id,
      ),
    },
    exams: examSchedule?.exams ?? [],
  });
  return { dataset, schedule };
}

/**
 * The current `schedule.json` projection: the team from settings, the active timetable's
 * assignments in dataset session order (empty without one), that version's dataset-request
 * decisions in dataset request order and its overrides, and the active exam placements.
 */
export async function buildScheduleProjection(db: Db): Promise<ScheduleExport> {
  return (await project(db)).schedule;
}

/** The validator port's report on the current (live) projection. */
export async function validateCurrentSchedule(
  db: Db,
): Promise<ValidatorReport> {
  const { dataset, schedule } = await project(db);
  return validateSchedule(dataset, schedule);
}

/** How many violations a refused export lists (the count is in the message). */
const MAX_REPORTED_VIOLATIONS = 50;

const NO_CHANGE_APPLIED =
  "No change has been applied yet, so there is no schedule after a change to export. Approve a change request first.";

/**
 * Throws unless `report` (for `schedule` against `dataset`) is exportable: `HARD_CONSTRAINT`
 * (409) with the violations, so a file that would fail `validator.py` is never exported; or
 * `CONFLICT` (409) when a dataset request has no decision (the validator only warns about that,
 * but the file would be incomplete).
 */
function gate(
  dataset: Dataset,
  schedule: Pick<ScheduleExport, "fest_week">,
  report: ValidatorReport,
  missingHint: string,
): void {
  const count = report.hard_violation_count;
  if (count > 0) {
    throw hardConstraint(
      `The schedule has ${count} hard violation${count === 1 ? "" : "s"}; fix them before exporting.`,
      report.hard_violations.slice(0, MAX_REPORTED_VIOLATIONS),
    );
  }
  const decided = new Set(schedule.fest_week.bookings.map((d) => d.request_id));
  const missing = dataset.booking_requests
    .map((r) => r.id)
    .filter((id) => !decided.has(id));
  if (missing.length > 0) {
    throw conflict(
      `Spectra decisions are missing for ${missing.length} request${missing.length === 1 ? "" : "s"} ${missingHint}`,
      { missing: missing.slice(0, MAX_REPORTED_VIOLATIONS) },
    );
  }
}

const LIVE_MISSING_HINT =
  "on the active timetable; run POST /api/spectra/run first.";

/** Why an approval that would capture the baseline is refused (see {@link captureBaselineIfMissing}). */
export const BASELINE_NOT_EXPORTABLE =
  "Make schedule.json exportable first (generate exams / run Spectra), so the baseline the validator compares with is complete.";

/**
 * Captures the current projection as the baseline, unless one exists. Called under the dataset
 * lock by the approval flow, before the first change is written into the dataset. The projection
 * must pass the same gate as `schedule.json` (the validator port finds no hard violation, which
 * includes every exam being placed, and every dataset request has a decision); otherwise nothing
 * is stored and the approval is refused with `409 CONFLICT` ({@link BASELINE_NOT_EXPORTABLE},
 * `details` = the gate's code, message and details). Returns true when this call stored it (a
 * failed apply then deletes it again).
 */
export async function captureBaselineIfMissing(
  db: Db,
  input: { version_id: string; change_request_id: string; actor: string },
): Promise<boolean> {
  if (await getBaseline(db)) return false;
  const { dataset, schedule } = await project(db);
  try {
    gate(
      dataset,
      schedule,
      validateSchedule(dataset, schedule),
      LIVE_MISSING_HINT,
    );
  } catch (err) {
    if (!isApiError(err)) throw err;
    throw conflict(BASELINE_NOT_EXPORTABLE, {
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }
  return insertBaselineIfMissing(db, {
    schedule,
    version_id: input.version_id,
    dataset_id: schedule.dataset_id,
    change_request_id: input.change_request_id,
    captured_by: input.actor,
  });
}

/**
 * `schedule.json`, if the validator port finds no hard violation: the live projection before
 * any change is applied, the baseline afterwards (checked against the dataset as loaded). See
 * {@link gate} for the `409`s.
 */
export async function exportSchedule(db: Db): Promise<ScheduleExport> {
  const baseline = await getBaselineSchedule(db);
  if (!baseline) {
    const { dataset, schedule } = await project(db);
    gate(
      dataset,
      schedule,
      validateSchedule(dataset, schedule),
      LIVE_MISSING_HINT,
    );
    return schedule;
  }
  const original = await getOriginalDataset(db);
  gate(
    original,
    baseline.schedule,
    validateSchedule(original, baseline.schedule),
    "in the timetable captured before the first applied change.",
  );
  return baseline.schedule;
}

/**
 * `schedule_after.json`: the live projection once a change has been applied, checked against
 * the changed dataset (dataset-origin requests plus every applied change) with the baseline, as
 * `validator.py --disruption … --baseline schedule.json` checks it. `409 CONFLICT` before any
 * change is applied; see {@link gate} for the other `409`s.
 */
export async function exportScheduleAfter(
  db: Db,
): Promise<ScheduleAfterExport> {
  const baseline = await getBaseline(db);
  if (!baseline) throw conflict(NO_CHANGE_APPLIED);
  const { dataset, schedule } = await project(db);
  gate(
    dataset,
    schedule,
    validateSchedule(dataset, schedule, baseline.schedule),
    LIVE_MISSING_HINT,
  );
  return ScheduleAfterExportSchema.parse(schedule);
}

/**
 * `disruption.json`: every applied change request's `changes`, in apply order, as one change
 * file (`--disruption`). Placements are timetable edits, not dataset changes, so they are not in
 * it. `409 CONFLICT` before any change request is applied.
 */
export async function exportDisruption(db: Db): Promise<Disruption> {
  const applied = await listAppliedChangeRequests(db);
  if (applied.length === 0) {
    throw conflict(
      "No change request has been applied yet, so there is no change file to export.",
    );
  }
  return DisruptionSchema.parse({
    id: "applied-changes",
    dataset: await getActiveDatasetId(db),
    description: `Changes applied in the app, in order: ${applied.map((cr) => cr.id).join(", ")}.`,
    changes: applied.flatMap((cr) => cr.changes),
  });
}

/** One export file and the name it downloads as. */
export async function exportFile(
  db: Db,
  file: ExportFile,
): Promise<{ filename: string; body: unknown }> {
  switch (file) {
    case "schedule":
      return { filename: "schedule.json", body: await exportSchedule(db) };
    case "schedule_after":
      return {
        filename: "schedule_after.json",
        body: await exportScheduleAfter(db),
      };
    case "disruption":
      return { filename: "disruption.json", body: await exportDisruption(db) };
  }
}

/**
 * The validator port's report on what `GET /api/export?file=…` would serve (`GET /api/validate`),
 * without the gate. `schedule`: the live projection, or the baseline against the dataset as
 * loaded once a change has been applied. `schedule_after`: the live projection against the
 * changed dataset with the baseline, so the report includes `stability`; `409 CONFLICT` before
 * any change is applied.
 */
export async function validateExportFile(
  db: Db,
  file: ValidateQuery["file"],
): Promise<ValidatorReport> {
  const baseline = await getBaselineSchedule(db);
  if (file === "schedule_after") {
    if (!baseline) throw conflict(NO_CHANGE_APPLIED);
    const { dataset, schedule } = await project(db);
    return validateSchedule(dataset, schedule, baseline.schedule);
  }
  if (!baseline) return validateCurrentSchedule(db);
  return validateSchedule(await getOriginalDataset(db), baseline.schedule);
}
