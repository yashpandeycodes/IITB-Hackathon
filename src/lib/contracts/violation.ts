/**
 * Rule violations and the validator report, shared by the engine, API and UI.
 * `ValidatorReportSchema` mirrors the dict returned by `validator.py`'s `run()`, key for key.
 */
import { z } from "zod";

import { ExamDay } from "./enums";
import { Count, Id } from "./util";

/** Rule code from the problem statement: `H1`–`H14`, `B1`–`B3`, `E1`–`E2`, `S1`–`S6`. */
export const RuleCode = z
  .string()
  .regex(/^[A-Z]\d{1,2}$/, 'Expected a rule code such as "H4"');
export type RuleCode = z.infer<typeof RuleCode>;

/** Which view the violation was found in (the validator's `where` label). */
export const ViolationWhere = z.enum(["timetable", "fest_week", "exams"]);
export type ViolationWhere = z.infer<typeof ViolationWhere>;

/** Structured pointers for the UI. The validator itself only emits `detail` text. */
export const ViolationRefsSchema = z.object({
  session_ids: z.array(Id).optional(),
  room_id: Id.optional(),
  day: ExamDay.optional(),
  /** Not capped at 13 so an out-of-range request time can still be pointed at. */
  periods: z.array(z.number().int().min(1)).optional(),
  request_id: Id.optional(),
  exam_id: Id.optional(),
});
export type ViolationRefs = z.infer<typeof ViolationRefsSchema>;

export const ViolationSchema = z.object({
  rule: RuleCode,
  where: ViolationWhere,
  detail: z.string(),
  refs: ViolationRefsSchema.optional(),
});
export type Violation = z.infer<typeof ViolationSchema>;

/** Soft penalty points per rule. All six keys are always present. */
export const SoftPenaltiesSchema = z.object({
  S1: Count,
  S2: Count,
  S3: Count,
  S4: Count,
  S5: Count,
  S6: Count,
});
export type SoftPenalties = z.infer<typeof SoftPenaltiesSchema>;

/** Spectra-week booking statistics (present when the schedule has `fest_week`). */
export const BookingStatsSchema = z.object({
  /** Alternatives score half, so this can be fractional. */
  booking_score: z.number().nonnegative(),
  booking_score_max_if_all_approved: z.number().nonnegative(),
  approved: Count,
  alternatives: Count,
  rejected: Count,
  session_overrides: Count,
  priority_inversions: z.array(z.string()),
});
export type BookingStats = z.infer<typeof BookingStatsSchema>;

/** Movement against a baseline schedule (present when a baseline was given). */
export const StabilitySchema = z.object({
  sessions_moved: Count,
  time_changed: Count,
  room_only_changed: Count,
  moved_ids: z.array(Id),
});
export type Stability = z.infer<typeof StabilitySchema>;

export const ValidatorReportSchema = z.object({
  dataset_id: z.string().nullable(),
  schedule_dataset_id: z.string().nullable(),
  team: z.string().nullable(),
  soft_penalties: SoftPenaltiesSchema,
  soft_total: Count,
  bookings: BookingStatsSchema.optional(),
  /** Present when exams were checked. */
  exam_soft_penalty: Count.optional(),
  stability: StabilitySchema.optional(),
  hard_violations: z.array(ViolationSchema),
  hard_violation_count: Count,
  hard_by_rule: z.record(RuleCode, Count),
  warnings: z.array(z.string()),
});
export type ValidatorReport = z.infer<typeof ValidatorReportSchema>;
