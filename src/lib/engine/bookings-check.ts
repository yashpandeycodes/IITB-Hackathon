/**
 * Spectra-week checks (B1–B3, H13, overrides, booking score, priority inversions), ported from
 * `check_bookings` in `validator.py`.
 */
import {
  effectiveCategory,
  type BookingRequest,
  type BookingStats,
  type Room,
  type Violation,
} from "@/lib/contracts";

import {
  block,
  checkAssignMap,
  isGroupBusy,
  type GroupOccupancy,
} from "./checker";
import { isRoomUnavailable, isTeachingDay, type Instance } from "./instance";
import { isPyInt, pyRepr, pyStr, sortedStrings, tupleKey } from "./py";
import {
  CATEGORY_WEIGHT,
  MAX_PERIOD,
  type AssignMap,
  type BookingDecisionInput,
  type FestWeekInput,
  type Placement,
} from "./types";

export type BookingsCheck = {
  violations: Violation[];
  warnings: string[];
  stats: BookingStats;
  /** The Week-7 timetable: the base placements with overrides applied. */
  week: Map<unknown, Placement>;
};

/** A booking that passed every H13 check and now holds its room. */
type Placed = { room_id: string; day: string; start: number; end: number };

/** True if request `a` has priority over request `b` (`outranks`). */
export function outranks(
  instance: Instance,
  a: BookingRequest,
  b: BookingRequest,
): boolean {
  const order = instance.priority.priority_order;
  const ca = order.indexOf(effectiveCategory(instance.priority, a));
  const cb = order.indexOf(effectiveCategory(instance.priority, b));
  if (ca !== cb) return ca < cb;
  return a.submitted_at < b.submitted_at;
}

function weightOf(instance: Instance, request: BookingRequest): number {
  return CATEGORY_WEIGHT[effectiveCategory(instance.priority, request)] ?? 0;
}

/** Room features plus `accessible` when the room is accessible. */
function roomFeatures(room: Room): Set<string> {
  const feats = new Set(room.features);
  if (room.accessible) feats.add("accessible");
  return feats;
}

function missingNeeds(request: BookingRequest, room: Room): string[] {
  const feats = roomFeatures(room);
  return [...new Set(request.needs)].filter((need) => !feats.has(need));
}

/** `check_bookings(ctx, base, fest)`. */
export function checkBookings(
  instance: Instance,
  base: AssignMap,
  fest: FestWeekInput,
): BookingsCheck {
  const V: Violation[] = [];
  const W: string[] = [];
  const order = instance.priority.priority_order;
  const overrides = fest.session_overrides ?? [];
  const decisions = fest.bookings ?? [];

  const decBy = new Map<unknown, BookingDecisionInput>();
  for (const d of decisions) {
    const id = d.request_id ?? null;
    if (decBy.has(id)) {
      V.push({
        rule: "B1",
        where: "fest_week",
        detail: `Two decisions for ${pyStr(id)}`,
      });
    }
    decBy.set(id, d);
  }
  const requestOf = (id: unknown) =>
    typeof id === "string" ? instance.requests.get(id) : undefined;

  // Week-7 timetable view.
  const week = new Map<unknown, Placement>(base);
  for (const o of overrides) {
    const sid = o.session_id ?? null;
    if (typeof sid !== "string" || !instance.sessions.has(sid)) {
      V.push({
        rule: "B2",
        where: "fest_week",
        detail: `Override for unknown session ${pyStr(sid)}`,
      });
      continue;
    }
    const by = o.displaced_by ?? null;
    const disp = decBy.get(by);
    const req = requestOf(by);
    if (!req || !disp || disp.status !== "approved") {
      V.push({
        rule: "B2",
        where: "fest_week",
        detail: `Override of ${sid} names ${pyStr(by)}, which is not an approved booking`,
      });
    } else {
      const category = effectiveCategory(instance.priority, req);
      if (order.indexOf(category) > order.indexOf("institute_event")) {
        V.push({
          rule: "B2",
          where: "fest_week",
          detail: `${pyStr(by)} (${category}) is not allowed to displace a regular session`,
        });
      }
    }
    week.set(sid, {
      day: o.day ?? null,
      start_period: o.start_period ?? null,
      room_id: o.room_id ?? null,
    });
  }
  const { violations: weekViolations, group_occupancy: wgrp } = checkAssignMap(
    instance,
    week,
    "fest_week",
  );
  V.push(...weekViolations);

  // (room, day, period) → who holds it: session ids, then booked request ids.
  const roomBusy = new Map<string, string[]>();
  const busyAt = (room: unknown, day: unknown, p: number): string[] => {
    const key = tupleKey(room, day, p);
    let list = roomBusy.get(key);
    if (!list) roomBusy.set(key, (list = []));
    return list;
  };
  for (const [sid, { day, start_period: start, room_id: rid }] of week) {
    const s = typeof sid === "string" ? instance.sessions.get(sid) : undefined;
    if (!s || !isPyInt(start)) continue;
    for (const p of block(start, s.duration)) busyAt(rid, day, p).push(s.id);
  }

  let score = 0;
  let maxScore = 0;
  const placed = new Map<string, Placed>();
  for (const [id, req] of instance.requests) {
    if (!instance.cancelled.has(id)) maxScore += weightOf(instance, req);
  }

  for (const [reqId, req] of instance.requests) {
    const d = decBy.get(reqId);
    if (d === undefined) {
      W.push(`No decision for ${reqId}`);
      continue;
    }
    const st = d.status ?? null;
    if (instance.cancelled.has(reqId)) {
      if (st === "approved" || st === "alternative_offered") {
        V.push({
          rule: "B3",
          where: "fest_week",
          detail: `${reqId} was cancelled but is ${st}`,
        });
      }
      continue;
    }
    if (
      st !== "approved" &&
      st !== "rejected" &&
      st !== "alternative_offered"
    ) {
      V.push({
        rule: "B1",
        where: "fest_week",
        detail: `${reqId}: unknown status ${pyStr(st)}`,
      });
      continue;
    }
    if (st !== "approved") {
      const reason = d.reason === undefined ? "" : pyStr(d.reason);
      if (!reason.trim()) W.push(`${reqId}: ${st} without a reason`);
    }
    if (st === "rejected") continue;

    let ok = true;
    const bad = (msg: string) => {
      ok = false;
      V.push({ rule: "H13", where: "fest_week", detail: `${reqId}: ${msg}` });
    };
    const roomId = d.room_id ?? null;
    const room =
      typeof roomId === "string" ? instance.rooms.get(roomId) : undefined;
    const day = d.day ?? null;
    const a = d.start_period ?? null;
    const b = d.end_period ?? null;
    if (room === undefined) {
      bad(`unknown room ${pyStr(roomId)}`);
      continue;
    }
    if (
      !isTeachingDay(instance, day) ||
      !isPyInt(a) ||
      !isPyInt(b) ||
      a < 1 ||
      b > MAX_PERIOD ||
      b < a
    ) {
      bad(`invalid time ${pyStr(day)} P${pyStr(a)}-P${pyStr(b)}`);
      continue;
    }
    const dayStr = day as string;
    if (b - a + 1 !== req.duration_periods) {
      bad(`booked ${b - a + 1} periods, request needs ${req.duration_periods}`);
    }
    if (!room.allowed_uses.includes("event")) {
      bad(`${room.id} cannot host events`);
    }
    if (!req.room_types.includes(room.type)) {
      bad(`${room.id} (${room.type}) is not one of ${pyRepr(req.room_types)}`);
    }
    if (room.capacity < req.attendance) {
      bad(`${room.id} seats ${room.capacity}, request needs ${req.attendance}`);
    }
    const miss = missingNeeds(req, room);
    if (miss.length > 0) {
      bad(`${room.id} lacks ${pyRepr(sortedStrings(miss))}`);
    }
    if (st === "approved") {
      const inside = req.windows.some(
        (w) => w.day === dayStr && w.from_period <= a && b <= w.to_period,
      );
      if (!inside) {
        bad(
          `approved at ${dayStr} P${a}-P${b}, outside the requested windows (use alternative_offered)`,
        );
      }
    }
    for (let p = a; p <= b; p++) {
      if (isRoomUnavailable(instance, room.id, dayStr, p)) {
        bad(`${room.id} unavailable ${dayStr} P${p}`);
      }
      const holders = busyAt(room.id, dayStr, p);
      if (holders.length > 0) {
        bad(`${room.id} ${dayStr} P${p} already used by ${holders.join(", ")}`);
      }
      for (const g of req.mandatory_for_groups) {
        if (isGroupBusy(wgrp, g, dayStr, p)) {
          bad(`mandatory for ${g}, who have class ${dayStr} P${p}`);
        }
      }
    }
    if (ok) {
      for (let p = a; p <= b; p++) busyAt(room.id, dayStr, p).push(reqId);
      placed.set(reqId, { room_id: room.id, day: dayStr, start: a, end: b });
      score += weightOf(instance, req) * (st === "approved" ? 1 : 0.5);
    }
  }

  const priority_inversions = findInversions(
    instance,
    decBy,
    placed,
    roomBusy,
    wgrp,
  );

  const countStatus = (status: string) =>
    decisions.filter((x) => x.status === status).length;
  return {
    violations: V,
    warnings: W,
    stats: {
      booking_score: score,
      booking_score_max_if_all_approved: maxScore,
      approved: countStatus("approved"),
      alternatives: countStatus("alternative_offered"),
      rejected: countStatus("rejected"),
      session_overrides: overrides.length,
      priority_inversions,
    },
    week,
  };
}

/**
 * A rejected request that outranks an approved one and could have used part of its slot
 * (same room, a window on that day, the room otherwise free, mandatory groups free).
 */
function findInversions(
  instance: Instance,
  decBy: ReadonlyMap<unknown, BookingDecisionInput>,
  placed: ReadonlyMap<string, Placed>,
  roomBusy: ReadonlyMap<string, readonly string[]>,
  wgrp: GroupOccupancy,
): string[] {
  const inversions: string[] = [];
  for (const [reqId, req] of instance.requests) {
    const d = decBy.get(reqId);
    if (instance.cancelled.has(reqId) || !d || d.status !== "rejected") {
      continue;
    }
    for (const [otherId, { room_id: rid, day, start: a, end: b }] of placed) {
      const other = instance.requests.get(otherId);
      if (
        !other ||
        decBy.get(otherId)?.status !== "approved" ||
        !outranks(instance, req, other)
      ) {
        continue;
      }
      const room = instance.rooms.get(rid);
      if (
        !room ||
        !req.room_types.includes(room.type) ||
        room.capacity < req.attendance ||
        missingNeeds(req, room).length > 0
      ) {
        continue;
      }
      const dur = req.duration_periods;
      windows: for (const w of req.windows) {
        if (w.day !== day) continue;
        for (let s0 = w.from_period; s0 < w.to_period - dur + 2; s0++) {
          const per = block(s0, dur);
          if (
            per[per.length - 1] > MAX_PERIOD ||
            !per.some((p) => a <= p && p <= b)
          ) {
            continue;
          }
          let clash = false;
          for (const p of per) {
            if (isRoomUnavailable(instance, rid, day, p)) clash = true;
            const holders = roomBusy.get(tupleKey(rid, day, p)) ?? [];
            if (holders.some((x) => x !== otherId)) clash = true;
            for (const g of req.mandatory_for_groups) {
              if (isGroupBusy(wgrp, g, day, p)) clash = true;
            }
          }
          if (!clash) {
            inversions.push(
              `${reqId} rejected, but ${otherId} (lower priority) holds ${rid} ${day} P${a}-P${b} that ${reqId} could use`,
            );
            break windows;
          }
        }
      }
    }
  }
  return inversions;
}
