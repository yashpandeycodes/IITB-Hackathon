/**
 * Export contracts. Mirrors `schedule.json` field for field.
 *
 * These are plain (stripping) objects: parsing a richer API/DB object through them drops extra
 * keys such as `reason_code`, so the export is a projection of stored data, never a rewrite.
 */
import { z } from "zod";

import {
  DecisionStatus,
  Day,
  ExamDay,
  ExamSession,
  Period,
  TeachingPeriod,
} from "./enums";
import { Id, Timestamp } from "./util";

/** One session placed in the regular weekly timetable. */
export const AssignmentSchema = z.object({
  session_id: Id,
  day: Day,
  start_period: TeachingPeriod,
  room_id: Id,
});
export type Assignment = z.infer<typeof AssignmentSchema>;

/**
 * Decision on a Spectra-week booking request. `end_period` is inclusive.
 * Approved and alternative decisions carry a full slot; rejections and alternatives need a reason.
 * Refined schema: extend it with `.safeExtend()` to keep the checks.
 */
export const BookingDecisionSchema = z
  .object({
    request_id: Id,
    status: DecisionStatus,
    day: Day.optional(),
    start_period: Period.optional(),
    end_period: Period.optional(),
    room_id: Id.optional(),
    reason: z.string(),
  })
  .superRefine((decision, ctx) => {
    if (decision.status !== "rejected") {
      for (const key of [
        "day",
        "start_period",
        "end_period",
        "room_id",
      ] as const) {
        if (decision[key] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when status is ${decision.status}`,
          });
        }
      }
      const { start_period, end_period } = decision;
      if (
        start_period !== undefined &&
        end_period !== undefined &&
        end_period < start_period
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["end_period"],
          message: "end_period must not be before start_period",
        });
      }
    }
    if (decision.status !== "approved" && decision.reason.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: `A reason is required when status is ${decision.status}`,
      });
    }
  });
export type BookingDecision = z.infer<typeof BookingDecisionSchema>;

/** Moves a regular session for Week 7 only, to make room for an approved institute event. */
export const SessionOverrideSchema = AssignmentSchema.extend({
  /** `request_id` of the approved booking that displaced the session. */
  displaced_by: Id,
});
export type SessionOverride = z.infer<typeof SessionOverrideSchema>;

export const ExamPlacementSchema = z.object({
  exam_id: Id,
  day: ExamDay,
  session: ExamSession,
  rooms: z.array(Id).min(1),
});
export type ExamPlacement = z.infer<typeof ExamPlacementSchema>;

export const FestWeekExportSchema = z.object({
  bookings: z.array(BookingDecisionSchema),
  session_overrides: z.array(SessionOverrideSchema),
});
export type FestWeekExport = z.infer<typeof FestWeekExportSchema>;

/** `exports/schedule.json`. Exams are required: a missing exam schedule counts every exam as unscheduled. */
export const ScheduleExportSchema = z.object({
  team: z.string().min(1),
  dataset_id: Id,
  sessions: z.array(AssignmentSchema),
  fest_week: FestWeekExportSchema,
  exams: z.array(ExamPlacementSchema),
});
export type ScheduleExport = z.infer<typeof ScheduleExportSchema>;

/**
 * The baseline `schedule.json`: the export as it was just before the first change request was
 * applied. `GET /api/export?file=schedule` keeps serving it once a change is live (what the
 * validator's `--baseline` compares with) while `schedule_after.json` follows the live
 * timetable. Stored once (the `baselines` singleton) and cleared by a reset or an import.
 */
export const BaselineSchema = z.object({
  schedule: ScheduleExportSchema,
  /** The active timetable version the snapshot was taken from. */
  version_id: Id,
  dataset_id: Id,
  /** The change request whose approval captured it (the first one applied). */
  change_request_id: Id,
  captured_at: Timestamp,
  /** The admin whose approval captured it. */
  captured_by: Id,
});
export type Baseline = z.infer<typeof BaselineSchema>;

/**
 * `exports/schedule_after.json` (after a disruption). The validator checks `fest_week` and
 * `exams` only when present, so both are optional here.
 */
export const ScheduleAfterExportSchema = ScheduleExportSchema.extend({
  fest_week: FestWeekExportSchema.optional(),
  exams: z.array(ExamPlacementSchema).optional(),
});
export type ScheduleAfterExport = z.infer<typeof ScheduleAfterExportSchema>;

/**
 * `GET /api/export?file=…`:
 * - `schedule`: `schedule.json`. Before any change is applied, the live projection; afterwards,
 *   the baseline captured just before the first applied change (what `--baseline` compares with).
 * - `schedule_after`: the live projection after the applied changes (`409 CONFLICT` before any).
 * - `disruption`: every applied change, in apply order, as one starter-pack change file (what
 *   `--disruption` applies); `409 CONFLICT` before any.
 */
export const ExportFile = z.enum(["schedule", "schedule_after", "disruption"]);
export type ExportFile = z.infer<typeof ExportFile>;

export const ExportQuerySchema = z.object({
  file: ExportFile.default("schedule"),
});
export type ExportQuery = z.infer<typeof ExportQuerySchema>;

/** `GET /api/validate?file=…`: which export the validator port checks (`schedule_after` adds stability). */
export const ValidateQuerySchema = z.object({
  file: z.enum(["schedule", "schedule_after"]).default("schedule"),
});
export type ValidateQuery = z.infer<typeof ValidateQuerySchema>;
