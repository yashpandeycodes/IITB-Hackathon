/**
 * Timetable versions, views and availability queries (architecture §5.3, §6).
 * Stored records and request bodies are strict objects; query schemas strip unknown params and
 * coerce strings so they can parse `Object.fromEntries(url.searchParams)` directly.
 */
import { z } from "zod";

import {
  Category,
  DecisionStatus,
  Day,
  Period,
  RoomUse,
  SessionKind,
  TeachingPeriod,
} from "./enums";
import { SpectraRunSummarySchema } from "./booking";
import { AssignmentSchema } from "./schedule";
import { Count, Id, Timestamp } from "./util";
import { SoftPenaltiesSchema, ViolationSchema } from "./violation";

export const TimetableVersionStatus = z.enum(["draft", "active", "superseded"]);
export type TimetableVersionStatus = z.infer<typeof TimetableVersionStatus>;

export const TimetableSource = z.enum(["generate", "reschedule", "manual"]);
export type TimetableSource = z.infer<typeof TimetableSource>;

/** S1–S6 plus their sum. */
export const SoftPenaltySummarySchema = z.strictObject({
  ...SoftPenaltiesSchema.shape,
  total: Count,
});
export type SoftPenaltySummary = z.infer<typeof SoftPenaltySummarySchema>;

export const SolverStopReason = z.enum(["iterations", "time", "converged"]);
export type SolverStopReason = z.infer<typeof SolverStopReason>;

export const SolverMetaSchema = z.strictObject({
  seed: z.number().int(),
  ms: Count,
  iterations: Count.optional(),
  /** e.g. "greedy+repair+SA". */
  algorithm: z.string().min(1),
  /**
   * Why the run ended. `time` means the safety cap cut it short, so the result may differ on a
   * slower or faster machine; `iterations` and `converged` runs are reproducible from the seed.
   */
  stopped_by: SolverStopReason.optional(),
});
export type SolverMeta = z.infer<typeof SolverMetaSchema>;

export const TimetableVersionSchema = z.strictObject({
  /** e.g. "TT-0003". */
  id: Id,
  dataset_id: Id,
  status: TimetableVersionStatus,
  source: TimetableSource,
  parent_version: Id.nullable(),
  change_request_id: Id.nullable(),
  assignments: z.array(AssignmentSchema),
  hard_violation_count: Count,
  soft_penalty: SoftPenaltySummarySchema,
  solver_meta: SolverMetaSchema.nullable(),
  created_by: Id,
  created_at: Timestamp,
});
export type TimetableVersion = z.infer<typeof TimetableVersionSchema>;

/** A version without its assignments (`GET /api/timetable/versions`). */
export const TimetableVersionSummarySchema = TimetableVersionSchema.omit({
  assignments: true,
})
  .extend({ assignment_count: Count })
  .strict();
export type TimetableVersionSummary = z.infer<
  typeof TimetableVersionSummarySchema
>;

// ---------------------------------------------------------------------------------- generation

/** A data problem the solver found while building domains (reported, never thrown). */
export const ModelIssueSchema = z.strictObject({
  kind: z.enum([
    "empty_domain",
    "domain_relaxed",
    "basket_conflict",
    "fixed_slot_invalid",
  ]),
  session_ids: z.array(Id),
  detail: z.string(),
});
export type ModelIssue = z.infer<typeof ModelIssueSchema>;

/**
 * `POST /api/timetable/generate`. Every field is optional: the seed defaults to
 * `settings.solver_seed`, the budget to `SOLVER_TIME_BUDGET_MS`. With `activate`, the new version
 * becomes active and Spectra decisions are re-run for it.
 */
export const GenerateTimetableRequestSchema = z.strictObject({
  seed: z.number().int().min(0).max(0xffff_ffff).optional(),
  /** Wall-clock safety cap; the solver's iteration budget normally ends the run first. */
  time_budget_ms: z.number().int().min(200).max(30_000).optional(),
  activate: z.boolean().default(false),
});
export type GenerateTimetableRequest = z.infer<
  typeof GenerateTimetableRequestSchema
>;

export const SolverPhase = z.enum(["construct", "repair", "anneal", "verify"]);
export type SolverPhase = z.infer<typeof SolverPhase>;

/**
 * One progress snapshot from the solver, streamed as an SSE `progress` event by
 * `POST /api/timetable/generate` (with `Accept: text/event-stream`).
 */
export const SolverProgressSchema = z.strictObject({
  phase: SolverPhase,
  iteration: Count,
  /** Sessions not yet placed (each is one hard violation). */
  hard: Count,
  /** Current soft penalty (S1–S6 total). */
  soft: Count,
  /** Current fest-awareness cost (keeps Week-7 booking windows free). */
  fest: z.number().nonnegative(),
  /** Best soft + fest seen so far. */
  best: z.number().nonnegative(),
  /** Annealing temperature; null outside the anneal phase. */
  temperature: z.number().nonnegative().nullable(),
  /** Active solver time so far. */
  ms: z.number().nonnegative(),
});
export type SolverProgress = z.infer<typeof SolverProgressSchema>;

export const GenerateTimetableResultSchema = z.strictObject({
  version: TimetableVersionSchema,
  activated: z.boolean(),
  /** Set when the version was activated (Spectra decisions re-run for it). */
  spectra: SpectraRunSummarySchema.nullable(),
});
export type GenerateTimetableResult = z.infer<
  typeof GenerateTimetableResultSchema
>;

/** `POST /api/timetable/versions/:id/activate`. Activation always re-runs Spectra decisions. */
export const ActivateTimetableResultSchema = z.strictObject({
  version: TimetableVersionSchema,
  spectra: SpectraRunSummarySchema,
});
export type ActivateTimetableResult = z.infer<
  typeof ActivateTimetableResultSchema
>;

// ------------------------------------------------------------------------------------- views

export const TimetableViewKind = z.enum(["group", "faculty", "room"]);
export type TimetableViewKind = z.infer<typeof TimetableViewKind>;

/** `regular` is the weekly timetable; `spectra` is Week 7 with overrides and bookings applied. */
export const TimetableWeek = z.enum(["regular", "spectra"]);
export type TimetableWeek = z.infer<typeof TimetableWeek>;

/** `GET /api/timetable?view=…&id=…&week=…`. */
export const TimetableViewQuerySchema = z.object({
  view: TimetableViewKind,
  /** Group, faculty or room id, matching `view`. */
  id: Id,
  week: TimetableWeek.default("regular"),
});
export type TimetableViewQuery = z.infer<typeof TimetableViewQuerySchema>;

/** One placed session, denormalised for rendering. */
export const TimetableCellSchema = z.strictObject({
  session_id: Id,
  course_id: Id,
  kind: SessionKind,
  groups: z.array(Id),
  faculty_id: Id,
  room_id: Id,
  day: Day,
  start_period: TeachingPeriod,
  duration: z.number().int().min(1).max(9),
  basket_slot: z.string().nullable(),
  size: Count,
  /**
   * Set in the Spectra-week view when the session was moved for an event. `pending_approval`:
   * the move waits for an admin's approval of that event (it may still change).
   */
  override: z
    .strictObject({ displaced_by: Id, pending_approval: z.boolean() })
    .nullable(),
});
export type TimetableCell = z.infer<typeof TimetableCellSchema>;

/**
 * A Spectra-week booking shown alongside sessions. `end_period` is inclusive. Another user's live
 * request shows as "Booked" (no title) to everyone but its owner and admins.
 */
export const TimetableBookingCellSchema = z.strictObject({
  request_id: Id,
  title: z.string(),
  /** The request waits for an approver: the slot is held but not confirmed. */
  pending_approval: z.boolean(),
  room_id: Id,
  day: Day,
  start_period: Period,
  end_period: Period,
  status: DecisionStatus,
  effective_category: Category,
});
export type TimetableBookingCell = z.infer<typeof TimetableBookingCellSchema>;

export const TimetableViewSchema = z.strictObject({
  view: TimetableViewKind,
  id: Id,
  week: TimetableWeek,
  /** Null when no timetable has been generated yet. */
  version_id: Id.nullable(),
  cells: z.array(TimetableCellSchema),
  bookings: z.array(TimetableBookingCellSchema),
});
export type TimetableView = z.infer<typeof TimetableViewSchema>;

// ------------------------------------------------------------------------------ availability

/** Accepts `"a,b"` (query string) or `["a", "b"]`. */
const ListParam = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  z.array(z.string().min(1)),
);

const PeriodParam = z.coerce.number().int().min(1).max(13);

/** `GET /api/rooms/available`. Periods are an inclusive range. */
export const RoomAvailabilityQuerySchema = z
  .object({
    day: Day,
    from_period: PeriodParam,
    to_period: PeriodParam,
    min_capacity: z.coerce.number().int().nonnegative().optional(),
    /** Required features, or "accessible". */
    needs: ListParam.optional(),
    /** Acceptable room types. */
    types: ListParam.optional(),
    accessible: z.union([z.boolean(), z.stringbool()]).optional(),
    /** Only rooms whose `allowed_uses` include this use are listed. Defaults to `event`. */
    use: RoomUse.default("event"),
  })
  .refine((query) => query.to_period >= query.from_period, {
    path: ["to_period"],
    message: "to_period must not be before from_period",
  });
export type RoomAvailabilityQuery = z.infer<typeof RoomAvailabilityQuerySchema>;

export const RoomBusyKind = z.enum(["session", "booking", "unavailable"]);
export type RoomBusyKind = z.infer<typeof RoomBusyKind>;

export const RoomAvailabilitySchema = z.strictObject({
  room_id: Id,
  free: z.boolean(),
  /** What occupies the room in the queried range: session id, request id, or the room id for maintenance. */
  busy_with: z.array(
    z.strictObject({
      kind: RoomBusyKind,
      id: Id,
      /** Another user's live request is labelled "Booked" for everyone but its owner and admins. */
      label: z.string(),
      /** A booking waiting for an approver, or a session moved there for one. */
      pending_approval: z.boolean(),
    }),
  ),
});
export type RoomAvailability = z.infer<typeof RoomAvailabilitySchema>;

// -------------------------------------------------------------------------------- what-if check

/** `POST /api/timetable/check`. */
export const TimetableCheckRequestSchema = z.strictObject({
  assignments: z.array(AssignmentSchema),
});
export type TimetableCheckRequest = z.infer<typeof TimetableCheckRequestSchema>;

export const TimetableCheckResultSchema = z.strictObject({
  violations: z.array(ViolationSchema),
  soft_penalty: SoftPenaltySummarySchema,
  /** `soft_penalty.total` minus the active timetable's total (negative is better); null with no active timetable. */
  soft_delta: z.number().int().nullable(),
});
export type TimetableCheckResult = z.infer<typeof TimetableCheckResultSchema>;
