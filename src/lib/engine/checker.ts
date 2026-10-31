/**
 * Timetable hard rules (H1–H12, H14), ported from `check_timetable` in `validator.py`.
 * Violations are data: nothing here throws for a bad schedule.
 */
import type { Violation, ViolationWhere } from "@/lib/contracts";

import {
  isFacultyUnavailable,
  isRoomUnavailable,
  isTeachingDay,
  type Instance,
} from "./instance";
import {
  compareStrings,
  isPyInt,
  pyRepr,
  pyStr,
  pyTupleRepr,
  sortedStrings,
  tupleKey,
} from "./py";
import {
  LAST_TEACHING_PERIOD,
  type AssignMap,
  type AssignmentInput,
  type Placement,
} from "./types";

/**
 * Which units hold each (group, day, period). A unit is the session's `basket_slot`, or its id
 * when it has none, so basket siblings share one unit and never clash with each other.
 */
export type GroupOccupancy = ReadonlyMap<string, ReadonlySet<string>>;

export type TimetableCheck = {
  violations: Violation[];
  group_occupancy: GroupOccupancy;
};

/** Key into `GroupOccupancy`. */
export function groupSlotKey(
  groupId: string,
  day: unknown,
  period: number,
): string {
  return tupleKey(groupId, day, period);
}

/** True when the group has a class in this cell. */
export function isGroupBusy(
  occupancy: GroupOccupancy,
  groupId: string,
  day: unknown,
  period: number,
): boolean {
  return (occupancy.get(groupSlotKey(groupId, day, period))?.size ?? 0) > 0;
}

/** Periods covered by a block: `range(start, start + duration)`. */
export function block(start: number, duration: number): number[] {
  const periods: number[] = [];
  for (let p = start; p < start + duration; p++) periods.push(p);
  return periods;
}

/**
 * `to_assign`: session id → placement (later duplicates win, first position kept), plus the id
 * of every repeated entry.
 */
export function toAssignMap(
  assignments: readonly AssignmentInput[] | null | undefined,
): { assign: Map<unknown, Placement>; duplicates: unknown[] } {
  const assign = new Map<unknown, Placement>();
  const duplicates: unknown[] = [];
  for (const entry of assignments ?? []) {
    const sid = entry.session_id ?? null;
    if (assign.has(sid)) duplicates.push(sid);
    assign.set(sid, {
      day: entry.day ?? null,
      start_period: entry.start_period ?? null,
      room_id: entry.room_id ?? null,
    });
  }
  return { assign, duplicates };
}

/** The validator's message for a session listed more than once. */
export function duplicateViolation(
  sessionId: unknown,
  where: ViolationWhere,
): Violation {
  return {
    rule: "H1",
    where,
    detail: `Session ${pyStr(sessionId)} appears more than once`,
  };
}

type Cell<T> = { owner: string; day: string; period: number; items: T };

function cell<T>(
  map: Map<string, Cell<T>>,
  owner: string,
  day: string,
  period: number,
  init: () => T,
): T {
  const key = tupleKey(owner, day, period);
  let entry = map.get(key);
  if (!entry) map.set(key, (entry = { owner, day, period, items: init() }));
  return entry.items;
}

/** `check_timetable(ctx, assign, label)`: every timetable hard rule for one placement map. */
export function checkAssignMap(
  instance: Instance,
  assign: AssignMap,
  where: ViolationWhere,
): TimetableCheck {
  const violations: Violation[] = [];
  const v = (rule: string, detail: string) =>
    violations.push({ rule, where, detail });

  const roomOcc = new Map<string, Cell<string[]>>();
  const facOcc = new Map<string, Cell<string[]>>();
  const grpOcc = new Map<string, Cell<Set<string>>>();
  const facDay = new Map<
    string,
    { faculty: string; day: string; hours: number }
  >();
  const basketTime = new Map<string, Map<string, [string, number]>>();

  for (const sid of instance.sessions.keys()) {
    if (!assign.has(sid)) v("H1", `Session ${sid} is not scheduled`);
  }

  for (const [sid, { day, start_period: start, room_id: rid }] of assign) {
    const s = typeof sid === "string" ? instance.sessions.get(sid) : undefined;
    if (s === undefined) {
      v("H1", `Unknown session id ${pyStr(sid)}`);
      continue;
    }
    if (!isTeachingDay(instance, day)) {
      v("H1", `${s.id}: invalid day ${pyStr(day)}`);
      continue;
    }
    const d = day as string;
    if (
      !isPyInt(start) ||
      start < 1 ||
      start + s.duration - 1 > LAST_TEACHING_PERIOD
    ) {
      v(
        "H9",
        `${s.id}: start period ${pyStr(start)} with duration ${s.duration} runs outside P1-P9`,
      );
      continue;
    }
    const r = typeof rid === "string" ? instance.rooms.get(rid) : undefined;
    if (r === undefined) {
      v("H1", `${s.id}: unknown room ${pyStr(rid)}`);
      continue;
    }
    const per = block(start, s.duration);
    const first = per[0];
    const last = per[per.length - 1];
    if (
      first <= instance.lunch_after_period &&
      instance.lunch_after_period < last
    ) {
      v("H9", `${s.id}: crosses lunch (${d} P${first}-P${last})`);
    }
    if (s.kind === "lab" && !instance.lab_start_periods.has(start)) {
      v("H9", `${s.id}: lab must start at P2 or P6, starts at P${start}`);
    }
    const fx = s.fixed_slot;
    if (fx && (fx.day !== d || fx.start_period !== start)) {
      v(
        "H14",
        `${s.id}: fixed at ${fx.day} P${fx.start_period}, placed at ${d} P${start}`,
      );
    }
    if (r.capacity < s.size) {
      v("H5", `${s.id}: size ${s.size} > ${r.id} capacity ${r.capacity}`);
    }
    if (!s.room_types.includes(r.type)) {
      v("H6", `${s.id}: needs ${pyRepr(s.room_types)}, ${r.id} is ${r.type}`);
    }
    if (s.needs_accessible && !r.accessible) {
      v("H10", `${s.id}: needs an accessible room, ${r.id} is not`);
    }
    const f = s.faculty_id;
    const unit = s.basket_slot || s.id;
    for (const p of per) {
      cell(roomOcc, r.id, d, p, () => []).push(s.id);
      cell(facOcc, f, d, p, () => []).push(s.id);
      for (const g of s.groups)
        cell(grpOcc, g, d, p, () => new Set()).add(unit);
      if (isFacultyUnavailable(instance, f, d, p)) {
        v("H7", `${s.id}: ${f} unavailable ${d} P${p}`);
      }
      if (isRoomUnavailable(instance, r.id, d, p)) {
        v("H8", `${s.id}: ${r.id} unavailable ${d} P${p}`);
      }
    }
    const fdKey = tupleKey(f, d);
    const fd = facDay.get(fdKey);
    if (fd) fd.hours += s.duration;
    else facDay.set(fdKey, { faculty: f, day: d, hours: s.duration });
    if (s.basket_slot) {
      let times = basketTime.get(s.basket_slot);
      if (!times) basketTime.set(s.basket_slot, (times = new Map()));
      times.set(tupleKey(d, start), [d, start]);
    }
  }

  for (const { owner, day, period, items } of roomOcc.values()) {
    if (items.length > 1) {
      v(
        "H4",
        `${owner} double-booked ${day} P${period}: ${sortedStrings(items).join(", ")}`,
      );
    }
  }
  for (const { owner, day, period, items } of facOcc.values()) {
    if (items.length > 1) {
      v(
        "H2",
        `${owner} double-booked ${day} P${period}: ${sortedStrings(items).join(", ")}`,
      );
    }
  }
  for (const { owner, day, period, items } of grpOcc.values()) {
    if (items.size > 1) {
      v(
        "H3",
        `Group ${owner} double-booked ${day} P${period}: ${sortedStrings(items).join(", ")}`,
      );
    }
  }
  for (const [basket, times] of basketTime) {
    if (times.size > 1) {
      const sorted = [...times.values()].sort(
        (a, b) => compareStrings(a[0], b[0]) || a[1] - b[1],
      );
      v(
        "H11",
        `Basket ${basket} sessions are not at the same time: [${sorted.map(pyTupleRepr).join(", ")}]`,
      );
    }
  }
  for (const { faculty, day, hours } of facDay.values()) {
    const max = instance.faculty.get(faculty)?.max_hours_per_day ?? 4;
    if (hours > max) {
      v("H12", `${faculty} teaches ${hours} hours on ${day} (max ${max})`);
    }
  }

  const group_occupancy = new Map<string, Set<string>>();
  for (const [key, { items }] of grpOcc) group_occupancy.set(key, items);
  return { violations, group_occupancy };
}

/**
 * Checks a list of assignments: the timetable rules plus one H1 per repeated session (the
 * validator reports repeats after the other timetable violations).
 */
export function checkTimetable(
  instance: Instance,
  assignments: readonly AssignmentInput[],
  where: ViolationWhere = "timetable",
): TimetableCheck {
  const { assign, duplicates } = toAssignMap(assignments);
  const result = checkAssignMap(instance, assign, where);
  for (const sid of duplicates) {
    result.violations.push(duplicateViolation(sid, where));
  }
  return result;
}
