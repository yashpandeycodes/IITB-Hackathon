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
  SessionKind,
  TeachingPeriod,
} from "./enums";
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

export const SolverMetaSchema = z.strictObject({
  seed: z.number().int(),
  ms: Count,
  iterations: Count.optional(),
  /** e.g. "greedy+repair+SA". */
  algorithm: z.string().min(1),
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
  /** Set in the Spectra-week view when the session was moved for an event. */
  override: z.strictObject({ displaced_by: Id }).nullable(),
});
export type TimetableCell = z.infer<typeof TimetableCellSchema>;

/** A Spectra-week booking shown alongside sessions. `end_period` is inclusive. */
export const TimetableBookingCellSchema = z.strictObject({
  request_id: Id,
  title: z.string(),
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
      label: z.string(),
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
});
export type TimetableCheckResult = z.infer<typeof TimetableCheckResultSchema>;
