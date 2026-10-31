/**
 * Indexed view of a dataset, built once and shared by every checker (the validator's `Ctx`).
 * Rules that vary by dataset (days, lab starts, lunch, exam week) are read from it here.
 */
import type {
  BookingRequest,
  Dataset,
  Exam,
  Faculty,
  PriorityRules,
  Room,
  Session,
  StudentGroup,
} from "@/lib/contracts";

import { tupleKey } from "./py";

export type Instance = {
  readonly dataset: Dataset;
  readonly priority: PriorityRules;
  /** Teaching days, in calendar order. */
  readonly days: readonly string[];
  readonly lab_start_periods: ReadonlySet<number>;
  /** No session may span from this period into the next. */
  readonly lunch_after_period: number;
  readonly exam_days: readonly string[];
  readonly exam_sessions: ReadonlySet<string>;
  /** Lookups by id. A repeated id keeps its first position and its last value. */
  readonly rooms: ReadonlyMap<string, Room>;
  readonly faculty: ReadonlyMap<string, Faculty>;
  readonly groups: ReadonlyMap<string, StudentGroup>;
  readonly sessions: ReadonlyMap<string, Session>;
  readonly requests: ReadonlyMap<string, BookingRequest>;
  readonly exams: ReadonlyMap<string, Exam>;
  /** Ids of cancelled booking requests. */
  readonly cancelled: ReadonlySet<string>;
  /** Faculty id → `slotKey(day, period)` values they cannot teach. */
  readonly faculty_unavailable: ReadonlyMap<string, ReadonlySet<string>>;
  /** Room id → `slotKey(day, period)` values it is closed. */
  readonly room_unavailable: ReadonlyMap<string, ReadonlySet<string>>;
};

/** Key for one (day, period) cell. */
export function slotKey(day: unknown, period: unknown): string {
  return tupleKey(day, period);
}

function indexById<T extends { id: string }>(
  items: readonly T[] | undefined,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items ?? []) map.set(item.id, item);
  return map;
}

function addSlots(
  map: Map<string, Set<string>>,
  id: string,
  day: string,
  periods: readonly number[],
) {
  let set = map.get(id);
  if (!set) map.set(id, (set = new Set()));
  for (const period of periods) set.add(slotKey(day, period));
}

export function buildInstance(dataset: Dataset): Instance {
  const { calendar } = dataset;

  const faculty_unavailable = new Map<string, Set<string>>();
  // Every entry counts, so a faculty id listed twice keeps both entries' unavailability.
  for (const member of dataset.faculty) {
    for (const entry of member.unavailable ?? []) {
      addSlots(faculty_unavailable, member.id, entry.day, entry.periods);
    }
  }
  const room_unavailable = new Map<string, Set<string>>();
  for (const entry of dataset.room_unavailability ?? []) {
    addSlots(room_unavailable, entry.room_id, entry.day, entry.periods);
  }

  return {
    dataset,
    priority: {
      priority_order: dataset.priority_order,
      role_category_cap: dataset.role_category_cap,
    },
    days: calendar.days,
    lab_start_periods: new Set(calendar.lab_start_periods),
    lunch_after_period: calendar.lunch.after_period,
    exam_days: calendar.exam_week.days,
    exam_sessions: new Set(calendar.exam_week.sessions.map((s) => s.id)),
    rooms: indexById(dataset.rooms),
    faculty: indexById(dataset.faculty),
    groups: indexById(dataset.student_groups),
    sessions: indexById(dataset.sessions),
    requests: indexById(dataset.booking_requests),
    exams: indexById(dataset.exams),
    cancelled: new Set((dataset.cancellations ?? []).map((c) => c.request_id)),
    faculty_unavailable,
    room_unavailable,
  };
}

export function isFacultyUnavailable(
  instance: Instance,
  facultyId: string,
  day: unknown,
  period: number,
): boolean {
  return (
    instance.faculty_unavailable.get(facultyId)?.has(slotKey(day, period)) ??
    false
  );
}

export function isRoomUnavailable(
  instance: Instance,
  roomId: string,
  day: unknown,
  period: number,
): boolean {
  return (
    instance.room_unavailable.get(roomId)?.has(slotKey(day, period)) ?? false
  );
}

/** True when the calendar has this teaching day. */
export function isTeachingDay(instance: Instance, day: unknown): boolean {
  return typeof day === "string" && instance.days.includes(day);
}
