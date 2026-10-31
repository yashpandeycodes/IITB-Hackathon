/**
 * Fest-aware costs (backend.md §2.2 C1): soft costs that keep rooms and groups free where Week-7
 * booking requests need them. Derived from `booking_requests`, never hard-coded.
 *
 * cost = Σ over demands of `weight × min over options of blockers(option)`, where blockers are the
 * occupied (room, period) and busy (mandatory group, period) cells in teaching periods. The min
 * gives the solver a gradient and is 0 exactly when some option is free.
 *
 * A request becomes a demand only if the timetable can block it: it is not cancelled, it has at
 * least one in-window option, and every option touches a teaching cell (a room some session can
 * use, or a mandatory group, during P1–P9). Competition between bookings is ignored here.
 */
import {
  effectiveCategory,
  type Assignment,
  type BookingRequest,
  type Category,
  type Room,
} from "@/lib/contracts";

import { missingNeeds } from "./bookings-check";
import { isRoomUnavailable, type Instance } from "./instance";
import { sessionRoomDomain } from "./model";
import { CATEGORY_WEIGHT, LAST_TEACHING_PERIOD, MAX_PERIOD } from "./types";

/** Cost per booking-score point per blocking cell. */
export const DEFAULT_FEST_WEIGHT = 2;

/** One in-window placement a request could take. */
export type FestOption = {
  room_id: string;
  day: string;
  start_period: number;
  end_period: number;
  /** Teaching periods the room must be free (empty if no session can use the room). */
  room_periods: number[];
  /** Teaching periods the mandatory groups must be free. */
  group_periods: number[];
};

export type FestDemand = {
  request_id: string;
  effective_category: Category;
  /** `weightPerPoint × CATEGORY_WEIGHT[effective_category]`. */
  weight: number;
  options: FestOption[];
};

export type FestSummary = {
  cost: number;
  weight_per_point: number;
  /** Request ids that became demands (timetable-dependent requests). */
  demands: string[];
  /** Demands whose every option is blocked, with the fewest blocking cells. */
  blocked: { request_id: string; min_blockers: number }[];
};

/** `needs ⊆ features ∪ {accessible if the room is accessible}` (the validator's H13 test). */
/** Static H13 room rules: `event` use, type, capacity and needs. */
function roomFits(room: Room, request: BookingRequest): boolean {
  return (
    room.allowed_uses.includes("event") &&
    request.room_types.includes(room.type) &&
    room.capacity >= request.attendance &&
    missingNeeds(request, room).length === 0
  );
}

/** Groups that appear in at least one session (only those can ever be busy). */
function sessionGroups(instance: Instance): Set<string> {
  const groups = new Set<string>();
  for (const s of instance.sessions.values()) {
    for (const g of s.groups) groups.add(g);
  }
  return groups;
}

/**
 * A request's mandatory groups that some session can occupy, without repeats. These are the
 * groups behind each option's `group_periods`.
 */
export function festDemandGroups(
  instance: Instance,
  requestId: string,
  known: ReadonlySet<string> = sessionGroups(instance),
): string[] {
  const request = instance.requests.get(requestId);
  if (!request) return [];
  return [...new Set(request.mandatory_for_groups)].filter((g) => known.has(g));
}

/** The timetable-dependent booking demands of the instance. */
export function deriveFestDemands(
  instance: Instance,
  opts?: { weightPerPoint?: number },
): FestDemand[] {
  const weightPerPoint = opts?.weightPerPoint ?? DEFAULT_FEST_WEIGHT;
  const teachingRooms = new Set<string>();
  for (const s of instance.sessions.values()) {
    for (const room of sessionRoomDomain(instance, s).rooms) {
      teachingRooms.add(room.id);
    }
  }
  const knownGroups = sessionGroups(instance);
  const demands: FestDemand[] = [];

  for (const request of instance.requests.values()) {
    if (instance.cancelled.has(request.id)) continue;
    const category = effectiveCategory(instance.priority, request);
    const points = CATEGORY_WEIGHT[category];
    if (points === undefined) continue;
    const hasGroups =
      festDemandGroups(instance, request.id, knownGroups).length > 0;
    const duration = request.duration_periods;
    const seen = new Set<string>();
    const options: FestOption[] = [];

    for (const window of request.windows) {
      if (!instance.days.includes(window.day)) continue;
      const last = Math.min(window.to_period, MAX_PERIOD);
      for (const room of instance.rooms.values()) {
        if (!roomFits(room, request)) continue;
        for (
          let start = Math.max(1, window.from_period);
          start + duration - 1 <= last;
          start++
        ) {
          const end = start + duration - 1;
          const key = `${room.id}|${window.day}|${start}`;
          if (seen.has(key)) continue;
          let closed = false;
          for (let p = start; p <= end && !closed; p++) {
            closed = isRoomUnavailable(instance, room.id, window.day, p);
          }
          if (closed) continue;
          seen.add(key);
          const teaching: number[] = [];
          for (let p = start; p <= Math.min(end, LAST_TEACHING_PERIOD); p++) {
            teaching.push(p);
          }
          options.push({
            room_id: room.id,
            day: window.day,
            start_period: start,
            end_period: end,
            room_periods: teachingRooms.has(room.id) ? teaching : [],
            group_periods: hasGroups ? [...teaching] : [],
          });
        }
      }
    }

    if (options.length === 0) continue;
    // An option no timetable can block means the request never depends on the timetable.
    if (
      options.some(
        (o) => o.room_periods.length === 0 && o.group_periods.length === 0,
      )
    ) {
      continue;
    }
    demands.push({
      request_id: request.id,
      effective_category: category,
      weight: weightPerPoint * points,
      options,
    });
  }
  return demands;
}

/** Full recompute of the fest cost for a plain timetable (reference for the incremental cost). */
export function festSummaryFor(
  instance: Instance,
  assignments: readonly Assignment[],
  opts?: { weightPerPoint?: number },
): FestSummary {
  const weightPerPoint = opts?.weightPerPoint ?? DEFAULT_FEST_WEIGHT;
  const demands = deriveFestDemands(instance, { weightPerPoint });
  const roomBusy = new Set<string>();
  const groupBusy = new Set<string>();
  for (const a of assignments) {
    const s = instance.sessions.get(a.session_id);
    if (!s || !Number.isInteger(a.start_period)) continue;
    for (let p = a.start_period; p < a.start_period + s.duration; p++) {
      roomBusy.add(`${a.room_id}|${a.day}|${p}`);
      for (const g of s.groups) groupBusy.add(`${g}|${a.day}|${p}`);
    }
  }

  const knownGroups = sessionGroups(instance);
  let cost = 0;
  const blocked: FestSummary["blocked"] = [];
  for (const demand of demands) {
    const groups = festDemandGroups(instance, demand.request_id, knownGroups);
    let min = Number.POSITIVE_INFINITY;
    for (const option of demand.options) {
      let blockers = 0;
      for (const p of option.room_periods) {
        if (roomBusy.has(`${option.room_id}|${option.day}|${p}`)) blockers++;
      }
      for (const g of groups) {
        for (const p of option.group_periods) {
          if (groupBusy.has(`${g}|${option.day}|${p}`)) blockers++;
        }
      }
      if (blockers < min) min = blockers;
      if (min === 0) break;
    }
    cost += demand.weight * min;
    if (min > 0) {
      blocked.push({ request_id: demand.request_id, min_blockers: min });
    }
  }
  return {
    cost,
    weight_per_point: weightPerPoint,
    demands: demands.map((d) => d.request_id),
    blocked,
  };
}
