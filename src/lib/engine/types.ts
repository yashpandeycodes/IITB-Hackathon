/**
 * Engine input shapes and constants shared by the checker modules.
 *
 * Inputs are typed loosely on purpose: `validator.py` scores whatever JSON it is given (missing
 * keys, unknown ids, out-of-range periods), and so must we. Every export contract
 * (`ScheduleExport`, `ScheduleAfterExport`, `Assignment`, …) is assignable to these types.
 */
import type { Category } from "@/lib/contracts";

/** Highest period of the day; bookings may run up to here. */
export const MAX_PERIOD = 13;
/** Last teaching period: sessions must end by here. */
export const LAST_TEACHING_PERIOD = 9;

/** Booking score weight per effective category (`CAT_WEIGHT` in the validator). */
export const CATEGORY_WEIGHT: Readonly<Partial<Record<Category, number>>> = {
  institute_event: 5,
  guest_lecture: 4,
  department_event: 3,
  club_event: 2,
};

/** One `sessions[]` entry of a schedule, as read from JSON. */
export type AssignmentInput = {
  session_id?: unknown;
  day?: unknown;
  start_period?: unknown;
  room_id?: unknown;
};

/** One `fest_week.session_overrides[]` entry. */
export type SessionOverrideInput = AssignmentInput & { displaced_by?: unknown };

/** One `fest_week.bookings[]` entry. */
export type BookingDecisionInput = {
  request_id?: unknown;
  status?: unknown;
  day?: unknown;
  start_period?: unknown;
  end_period?: unknown;
  room_id?: unknown;
  reason?: unknown;
};

export type FestWeekInput = {
  bookings?: readonly BookingDecisionInput[] | null;
  session_overrides?: readonly SessionOverrideInput[] | null;
};

/** One `exams[]` entry. */
export type ExamPlacementInput = {
  exam_id?: unknown;
  day?: unknown;
  session?: unknown;
  rooms?: unknown;
};

/** A `schedule.json` / `schedule_after.json` document. */
export type ScheduleInput = {
  team?: unknown;
  dataset_id?: unknown;
  sessions?: readonly AssignmentInput[] | null;
  fest_week?: FestWeekInput | null;
  exams?: readonly ExamPlacementInput[] | null;
};

/** Where one session sits: the validator's `(day, start, room)` tuple. */
export type Placement = {
  readonly day: unknown;
  readonly start_period: unknown;
  readonly room_id: unknown;
};

/**
 * Session id → placement, in first-seen order (a later duplicate replaces the placement but
 * keeps the position, like a Python dict). Missing ids are keyed as `null`.
 */
export type AssignMap = ReadonlyMap<unknown, Placement>;
