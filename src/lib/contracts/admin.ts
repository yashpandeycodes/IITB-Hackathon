/**
 * Admin and operations read models: dataset import, demo reset and the health probe
 * (`POST /api/admin/dataset`, `POST /api/admin/reset`, `GET /api/health`).
 */
import { z } from "zod";

import { PathIssueSchema, type PathIssue } from "./api";
import { SettingsSchema } from "./settings";
import { Count, Id, Timestamp } from "./util";

/** Where the loaded dataset came from. */
export const DatasetSource = z.enum(["bundled", "upload"]);
export type DatasetSource = z.infer<typeof DatasetSource>;

/** Documents written per reference collection by an import. */
export const ReferenceCountsSchema = z.strictObject({
  rooms: Count,
  room_unavailability: Count,
  faculty: Count,
  student_groups: Count,
  courses: Count,
  sessions: Count,
  exams: Count,
  booking_requests: Count,
  cancellations: Count,
});
export type ReferenceCounts = z.infer<typeof ReferenceCountsSchema>;

/** Working state derived from a dataset, removed per collection when another dataset loads. */
export const DerivedClearedSchema = z.strictObject({
  timetable_versions: Count,
  exam_schedules: Count,
  booking_decisions: Count,
  session_overrides: Count,
  change_requests: Count,
});
export type DerivedCleared = z.infer<typeof DerivedClearedSchema>;

/** `POST /api/admin/dataset` response (`data`). */
export const ImportReportSchema = z.strictObject({
  dataset_id: Id,
  source: DatasetSource,
  loaded_at: Timestamp,
  counts: ReferenceCountsSchema,
  /** Cancellations dropped because an earlier one already named the same request. */
  duplicate_cancellations: z.array(Id),
  /** Derived working-state documents removed because they belonged to the previous data. */
  cleared: DerivedClearedSchema,
});
export type ImportReport = z.infer<typeof ImportReportSchema>;

/**
 * One dataset validation problem, with a dotted path such as `sessions.12.faculty_id` ("(root)"
 * for the file as a whole). The same shape as every other `PathIssue`.
 */
export const DatasetIssueSchema = PathIssueSchema;
export type DatasetIssue = PathIssue;

/** `details` of the `VALIDATION_ERROR` for a rejected dataset (first 50 issues). */
export const DatasetValidationDetailsSchema = z.strictObject({
  issue_count: Count,
  issues: z.array(DatasetIssueSchema),
});
export type DatasetValidationDetails = z.infer<
  typeof DatasetValidationDetailsSchema
>;

/** `bundled` loads `cit_public.json` (a clean state); `stored` re-imports the last upload. */
export const ResetSource = z.enum(["bundled", "stored"]);
export type ResetSource = z.infer<typeof ResetSource>;

/** `POST /api/admin/reset` body (optional; defaults to the bundled dataset). */
export const ResetRequestSchema = z.strictObject({
  from: ResetSource.default("bundled"),
});
export type ResetRequest = z.infer<typeof ResetRequestSchema>;

/** `POST /api/admin/reset` response (`data`). */
export const ResetReportSchema = z.strictObject({
  /** The timetable the automatic pipeline generated and activated (null until Phase 3). */
  timetable_version: Id.nullable(),
  /** The exam schedule the pipeline produced (null until Phase 3). */
  exam_schedule_id: Id.nullable(),
  /** Spectra decisions the pipeline made. */
  decisions: Count,
  dataset: ImportReportSchema,
  /** Documents deleted per working collection. */
  cleared: DerivedClearedSchema.extend({ settings: Count }).strict(),
  /** Indexes ensured. */
  indexes: Count,
  /** Demo accounts written. */
  users: z.strictObject({ inserted: Count, updated: Count }),
  settings: SettingsSchema,
  /** Wall-clock duration of the reset. */
  ms: Count,
});
export type ResetReport = z.infer<typeof ResetReportSchema>;

/** `GET /api/health` response (`data`); always 200 while the app runs. */
export const HealthStatusSchema = z.strictObject({
  status: z.literal("ok"),
  db: z.enum(["up", "down"]),
  /** The loaded dataset, or the bundled one when the database is down or empty. */
  dataset_id: Id,
  time: z.iso.datetime({ offset: true }),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
