import "server-only";
import type { Db } from "mongodb";
import {
  ScheduleExportSchema,
  type BookingDecision,
  type Dataset,
  type ScheduleExport,
  type StoredBookingDecision,
  type ValidatorReport,
} from "@/lib/contracts";
import { validateSchedule } from "@/lib/engine";
import { listBookingDecisions } from "@/lib/db/repos/booking-decisions";
import { getActiveExamSchedule } from "@/lib/db/repos/exam-schedules";
import { listSessionOverrides } from "@/lib/db/repos/session-overrides";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { ApiError, hardConstraint } from "@/lib/errors";
import { getDatasetForExport } from "./dataset";
import { getSettings } from "./settings";

/**
 * `exports/schedule.json`: a projection of stored state, never a rewrite. It is built against
 * the dataset as the official validator sees it (dataset-origin requests only) and gated on the
 * validator port reporting zero hard violations.
 */

/** The export shape of a stored decision: rejections carry no slot, metadata is dropped. */
function toExportDecision(decision: StoredBookingDecision): BookingDecision {
  const { request_id, status, reason } = decision;
  if (status === "rejected") return { request_id, status, reason };
  const { day, start_period, end_period, room_id } = decision;
  return { request_id, status, day, start_period, end_period, room_id, reason };
}

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

/** The validator port's report on the current projection (`GET /api/validate`). */
export async function validateCurrentSchedule(
  db: Db,
): Promise<ValidatorReport> {
  const { dataset, schedule } = await project(db);
  return validateSchedule(dataset, schedule);
}

/** How many violations a refused export lists (the count is in the message). */
const MAX_REPORTED_VIOLATIONS = 50;

/**
 * The projection, if the validator port finds no hard violation; otherwise `HARD_CONSTRAINT`
 * (409) with the violations, so a schedule that would fail `validator.py` is never exported.
 * Also `409 CONFLICT` when a dataset request has no stored decision for the active timetable
 * (the validator only warns about that, but the file would be incomplete).
 */
export async function exportSchedule(db: Db): Promise<ScheduleExport> {
  const { dataset, schedule } = await project(db);
  const report = validateSchedule(dataset, schedule);
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
    throw new ApiError(
      "CONFLICT",
      `Spectra decisions are missing for ${missing.length} request${missing.length === 1 ? "" : "s"} on the active timetable; run POST /api/spectra/run first.`,
      { missing: missing.slice(0, MAX_REPORTED_VIOLATIONS) },
    );
  }
  return schedule;
}
