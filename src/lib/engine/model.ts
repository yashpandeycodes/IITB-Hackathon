/**
 * Integer-slot instance model for the solver (backend.md §3.1): `slot = dayIndex * 13 + (period - 1)`,
 * basket "units", per-unit domains and typed-array occupancy with incremental soft scoring.
 * Internal to the engine; only `ModelIssue` is part of the public surface.
 *
 * Invariant of `TimetableState`: the placed units are always hard-feasible (H2–H12, H14 hold
 * by construction), so the only hard violations a state can have are its unplaced sessions.
 */
import {
  isAvoidPreference,
  type Assignment,
  type ModelIssue,
  type Room,
  type Session,
  type SoftPenalties,
} from "@/lib/contracts";

import type { FestDemand } from "./fest";
import {
  isFacultyUnavailable,
  isRoomUnavailable,
  type Instance,
} from "./instance";
import { CATEGORY_WEIGHT, LAST_TEACHING_PERIOD, MAX_PERIOD } from "./types";

/** A data problem found while building domains (`ModelIssueSchema` in the contracts). */
export type { ModelIssue };

/** Periods per day in the slot grid (P1–P13). */
export const PERIODS_PER_DAY = MAX_PERIOD;
/** Occupancy cell values: free, closed (unavailability), otherwise the occupying unit's index. */
export const FREE = -1;
export const BLOCKED = -2;

/** Default `max_hours_per_day` (the validator's fallback). */
const DEFAULT_MAX_HOURS = 4;

export const slotOf = (dayIndex: number, period: number) =>
  dayIndex * PERIODS_PER_DAY + period - 1;
export const dayOfSlot = (slot: number) => Math.floor(slot / PERIODS_PER_DAY);
export const periodOfSlot = (slot: number) => (slot % PERIODS_PER_DAY) + 1;

// ------------------------------------------------------------------------------ room domains

/** The validator's room rules for a session: H6 type, H5 capacity, H10 accessibility. */
function validatorFits(room: Room, session: Session): boolean {
  return (
    session.room_types.includes(room.type) &&
    room.capacity >= session.size &&
    (!session.needs_accessible || room.accessible)
  );
}

/**
 * Rooms a session may use: the validator's rules plus `allowed_uses ∋ kind`. If that extra filter
 * leaves nothing, it is dropped (`relaxed`), because the validator does not check it.
 */
export function sessionRoomDomain(
  instance: Instance,
  session: Session,
): { rooms: Room[]; relaxed: boolean } {
  const fits = [...instance.rooms.values()].filter((room) =>
    validatorFits(room, session),
  );
  const preferred = fits.filter((room) =>
    room.allowed_uses.includes(session.kind),
  );
  if (preferred.length > 0 || fits.length === 0) {
    return { rooms: preferred, relaxed: false };
  }
  return { rooms: fits, relaxed: true };
}

// ------------------------------------------------------------------------------------ model

/** One session inside a unit. */
export type ModelMember = {
  readonly index: number;
  readonly session: Session;
  readonly unit: number;
  readonly duration: number;
  readonly faculty: number;
  readonly course: number;
  /** Room domain (model room indices) in preference order. */
  readonly rooms: Int32Array;
  /** S1 cost of starting at each slot. */
  readonly s1: Int32Array;
  /** S5 cost (0 or 1) in each model room. */
  readonly s5: Uint8Array;
};

/** One scheduling decision: a session, or every session of one basket slot. */
export type ModelUnit = {
  readonly index: number;
  /** Members in dataset order. */
  readonly members: readonly ModelMember[];
  /** Member positions, largest session first (the order rooms are picked in). */
  readonly roomOrder: Int32Array;
  readonly basket: string | null;
  /** Feasible start slots (unary rules only), ascending. Empty when the unit cannot be placed. */
  readonly starts: Int32Array;
  readonly fixed: boolean;
  /** Longest member duration. */
  readonly duration: number;
  /** Total students over the members. */
  readonly size: number;
  /** Distinct groups, the periods each is busy from the start, and its S3 hours. */
  readonly groups: Int32Array;
  readonly groupSpan: Int32Array;
  readonly groupHours: Int32Array;
  /** S4a (group, course) pairs of non-basket lectures and how often each counts. */
  readonly s4aPairs: Int32Array;
  readonly s4aCounts: Int32Array;
  /** S4b course of each member (basket units only). */
  readonly s4bCourses: Int32Array;
  /** `starts.length × min member rooms`: a measure of how constrained the unit is. */
  readonly options: number;
};

export type Model = {
  readonly instance: Instance;
  /** Teaching days, in calendar order, without repeats. */
  readonly days: readonly string[];
  readonly dayCount: number;
  readonly slotCount: number;
  readonly rooms: readonly Room[];
  readonly roomIndex: ReadonlyMap<string, number>;
  readonly facultyIds: readonly string[];
  readonly facultyMax: Int32Array;
  readonly groupIds: readonly string[];
  readonly groupIndex: ReadonlyMap<string, number>;
  readonly courseIds: readonly string[];
  readonly pairCount: number;
  readonly units: readonly ModelUnit[];
  /** Members in dataset session order. */
  readonly members: readonly ModelMember[];
  /** `[room * slotCount + slot]`: FREE, or BLOCKED when the room is closed. */
  readonly roomInit: Int32Array;
  /** `[faculty * slotCount + slot]`: FREE, or BLOCKED when the faculty member is unavailable. */
  readonly facultyInit: Int32Array;
  /** Units whose domain is non-empty. */
  readonly placeable: Int32Array;
  readonly sessionCount: number;
  readonly issues: ModelIssue[];
  /**
   * True when no timetable can place every session: some unit has an empty domain, or two fixed
   * sessions provably clash. The solver then skips annealing (the result is infeasible anyway).
   */
  readonly certainlyInfeasible: boolean;
};

/** True when periods `[a, a + la)` and `[b, b + lb)` overlap. */
const overlaps = (a: number, la: number, b: number, lb: number) =>
  a < b + lb && b < a + la;

function indexer() {
  const ids: string[] = [];
  const index = new Map<string, number>();
  const of = (id: string) => {
    let i = index.get(id);
    if (i === undefined) {
      i = ids.length;
      ids.push(id);
      index.set(id, i);
    }
    return i;
  };
  return { ids, index, of };
}

/**
 * Builds units, domains and the blocked cells for an instance. Never throws on bad data.
 * `reservedRooms` (e.g. rooms a fest demand depends on) are tried after other rooms that fit.
 */
export function buildModel(
  instance: Instance,
  opts?: { reservedRooms?: Iterable<string> },
): Model {
  const days = [...new Set(instance.days)];
  const dayCount = days.length;
  const slotCount = dayCount * PERIODS_PER_DAY;
  const issues: ModelIssue[] = [];
  const lunch = instance.lunch_after_period;

  const rooms = [...instance.rooms.values()];
  const roomIndex = new Map(rooms.map((room, i) => [room.id, i]));
  const faculty = indexer();
  const groups = indexer();
  const courses = indexer();
  for (const id of instance.groups.keys()) groups.of(id);

  const sessions = [...instance.sessions.values()];
  for (const s of sessions) {
    faculty.of(s.faculty_id);
    courses.of(s.course_id);
    for (const g of s.groups) groups.of(g);
  }

  const facultyMax = new Int32Array(faculty.ids.length);
  const facultyInit = new Int32Array(faculty.ids.length * slotCount).fill(FREE);
  faculty.ids.forEach((id, f) => {
    facultyMax[f] =
      instance.faculty.get(id)?.max_hours_per_day ?? DEFAULT_MAX_HOURS;
    days.forEach((day, d) => {
      for (let p = 1; p <= PERIODS_PER_DAY; p++) {
        if (isFacultyUnavailable(instance, id, day, p)) {
          facultyInit[f * slotCount + slotOf(d, p)] = BLOCKED;
        }
      }
    });
  });
  const roomInit = new Int32Array(rooms.length * slotCount).fill(FREE);
  rooms.forEach((room, r) => {
    days.forEach((day, d) => {
      for (let p = 1; p <= PERIODS_PER_DAY; p++) {
        if (isRoomUnavailable(instance, room.id, day, p)) {
          roomInit[r * slotCount + slotOf(d, p)] = BLOCKED;
        }
      }
    });
  });

  // Rooms some member can only barely use, or that a fest demand depends on, go last.
  const domains = sessions.map((s) => {
    const domain = sessionRoomDomain(instance, s);
    if (domain.relaxed) {
      issues.push({
        kind: "domain_relaxed",
        session_ids: [s.id],
        detail: `${s.id}: no room allows "${s.kind}"; using every room that passes the validator's rules`,
      });
    }
    return domain.rooms.map((room) => roomIndex.get(room.id) as number);
  });
  const scarce = new Uint8Array(rooms.length);
  for (const domain of domains) {
    if (domain.length <= 3) for (const r of domain) scarce[r] = 1;
  }
  for (const id of opts?.reservedRooms ?? []) {
    const r = roomIndex.get(id);
    if (r !== undefined) scarce[r] = 1;
  }

  // Units: one per basket slot (in order of its first member), one per other session.
  const unitSessions: Session[][] = [];
  const basketUnit = new Map<string, number>();
  const sessionPos = new Map<Session, number>();
  sessions.forEach((s, i) => {
    sessionPos.set(s, i);
    if (s.basket_slot) {
      const u = basketUnit.get(s.basket_slot);
      if (u !== undefined) {
        unitSessions[u].push(s);
        return;
      }
      basketUnit.set(s.basket_slot, unitSessions.length);
    }
    unitSessions.push([s]);
  });

  const pairs = new Map<string, number>();
  const pairOf = (g: number, c: number) => {
    const key = `${g}|${c}`;
    let p = pairs.get(key);
    if (p === undefined) pairs.set(key, (p = pairs.size));
    return p;
  };

  const membersBySession: ModelMember[] = new Array(sessions.length);
  const units: ModelUnit[] = unitSessions.map((list, u) => {
    const ids = list.map((s) => s.id);
    const basket = list[0].basket_slot ? list[0].basket_slot : null;
    const members: ModelMember[] = list.map((s) => {
      const pos = sessionPos.get(s) as number;
      const f = faculty.index.get(s.faculty_id) as number;
      const roomList = domains[pos];
      const s5 = new Uint8Array(rooms.length);
      rooms.forEach((room, r) => {
        // Same expression as soft.ts.
        if (room.capacity && s.size / room.capacity < 0.4) s5[r] = 1;
      });
      const prefs = (instance.faculty.get(s.faculty_id)?.preferences ?? [])
        .filter(isAvoidPreference)
        .map((pref) => ({
          days: (pref.days ?? instance.days) as readonly unknown[],
          periods: pref.periods as readonly unknown[],
        }));
      const s1 = new Int32Array(slotCount);
      days.forEach((day, d) => {
        for (let p = 1; p + s.duration - 1 <= PERIODS_PER_DAY; p++) {
          let cost = 0;
          for (const pref of prefs) {
            if (!pref.days.includes(day)) continue;
            for (let q = p; q < p + s.duration; q++) {
              if (pref.periods.includes(q)) cost += 2;
            }
          }
          s1[slotOf(d, p)] = cost;
        }
      });
      const ordered = [...roomList].sort(
        (a, b) =>
          s5[a] - s5[b] ||
          scarce[a] - scarce[b] ||
          rooms[a].capacity - rooms[b].capacity ||
          a - b,
      );
      const member: ModelMember = {
        index: pos,
        session: s,
        unit: u,
        duration: s.duration,
        faculty: f,
        course: courses.index.get(s.course_id) as number,
        rooms: Int32Array.from(ordered),
        s1,
        s5,
      };
      membersBySession[pos] = member;
      return member;
    });

    let feasible = true;
    const fail = (kind: ModelIssue["kind"], detail: string) => {
      issues.push({ kind, session_ids: ids, detail });
      feasible = false;
    };

    for (const m of members) {
      if (m.rooms.length === 0) {
        fail(
          "empty_domain",
          `${m.session.id}: no room has type ${JSON.stringify(m.session.room_types)}, capacity ≥ ${m.session.size}${m.session.needs_accessible ? " and step-free access" : ""}`,
        );
      }
      if (m.duration > facultyMax[m.faculty]) {
        fail(
          "empty_domain",
          `${m.session.id}: lasts ${m.duration} periods but ${m.session.faculty_id} may teach only ${facultyMax[m.faculty]} a day`,
        );
      }
    }
    if (basket) {
      const seen = new Map<number, string>();
      for (const m of members) {
        const other = seen.get(m.faculty);
        if (other !== undefined) {
          fail(
            "basket_conflict",
            `Basket ${basket}: ${other} and ${m.session.id} are both taught by ${m.session.faculty_id}, so they cannot run at the same time`,
          );
        }
        seen.set(m.faculty, m.session.id);
      }
    }

    // Unary start rules for every member: P1–P9, lunch, lab starts, faculty availability.
    const startOk = (d: number, p: number) =>
      members.every((m) => {
        const end = p + m.duration - 1;
        if (p < 1 || end > LAST_TEACHING_PERIOD) return false;
        if (p <= lunch && lunch < end) return false;
        if (m.session.kind === "lab" && !instance.lab_start_periods.has(p)) {
          return false;
        }
        for (let q = p; q <= end; q++) {
          if (facultyInit[m.faculty * slotCount + slotOf(d, q)] === BLOCKED) {
            return false;
          }
        }
        return true;
      });

    // A start also needs, for every member, a fitting room open for its whole block, and the
    // members of a basket need distinct ones (a small bipartite matching).
    const roomOpen = (r: number, slot: number, duration: number) => {
      for (let k = 0; k < duration; k++) {
        if (roomInit[r * slotCount + slot + k] === BLOCKED) return false;
      }
      return true;
    };
    const roomsFit = (d: number, p: number) => {
      const slot = slotOf(d, p);
      const open = members.map((m) =>
        Array.from(m.rooms).filter((r) => roomOpen(r, slot, m.duration)),
      );
      if (open.some((list) => list.length === 0)) return false;
      if (members.length === 1) return true;
      const owner = new Map<number, number>();
      const assign = (i: number, seen: Set<number>): boolean => {
        for (const r of open[i]) {
          if (seen.has(r)) continue;
          seen.add(r);
          const j = owner.get(r);
          if (j === undefined || assign(j, seen)) {
            owner.set(r, i);
            return true;
          }
        }
        return false;
      };
      return open.every((_, i) => assign(i, new Set()));
    };

    const fixedSlots = new Map<string, { day: string; start: number }>();
    for (const m of members) {
      const fx = m.session.fixed_slot;
      if (fx) {
        fixedSlots.set(`${fx.day}|${fx.start_period}`, {
          day: fx.day,
          start: fx.start_period,
        });
      }
    }
    const starts: number[] = [];
    let fixed = false;
    if (fixedSlots.size > 1) {
      fail(
        "fixed_slot_invalid",
        `Basket ${basket}: members are fixed at different times`,
      );
    } else if (fixedSlots.size === 1) {
      fixed = true;
      const [{ day, start }] = fixedSlots.values();
      const d = days.indexOf(day);
      if (d === -1 || !startOk(d, start)) {
        fail(
          "fixed_slot_invalid",
          `${ids.join(", ")}: fixed at ${day} P${start}, which breaks the calendar, lunch, lab-start or faculty-availability rules`,
        );
      } else if (feasible && !roomsFit(d, start)) {
        fail(
          "fixed_slot_invalid",
          members.length === 1
            ? `${ids[0]}: fixed at ${day} P${start}, but every room that fits it is closed then`
            : `Basket ${basket}: fixed at ${day} P${start}, but there are not enough open rooms that fit its ${members.length} sessions then`,
        );
      } else {
        starts.push(slotOf(d, start));
      }
    } else {
      let unary = 0;
      for (let d = 0; d < dayCount; d++) {
        for (let p = 1; p <= LAST_TEACHING_PERIOD; p++) {
          if (!startOk(d, p)) continue;
          unary++;
          if (feasible && roomsFit(d, p)) starts.push(slotOf(d, p));
        }
      }
      if (starts.length === 0 && feasible) {
        fail(
          "empty_domain",
          unary === 0
            ? `${ids.join(", ")}: no start fits P1–P${LAST_TEACHING_PERIOD} without crossing lunch while the faculty is available`
            : `${ids.join(", ")}: every room that fits is closed at each of the ${unary} starts where the faculty is available`,
        );
      }
    }

    // Group data, keeping soft.ts's multiplicity: a non-basket session counts each listing of a
    // group; a basket counts the first member (dataset order) that lists the group, once.
    const span = new Map<number, number>();
    const hours = new Map<number, number>();
    const s4a = new Map<number, number>();
    for (const m of members) {
      for (const gid of m.session.groups) {
        const g = groups.index.get(gid) as number;
        span.set(g, Math.max(span.get(g) ?? 0, m.duration));
        if (basket) {
          if (!hours.has(g)) hours.set(g, m.duration);
        } else {
          hours.set(g, (hours.get(g) ?? 0) + m.duration);
          if (m.session.kind === "lecture") {
            const pair = pairOf(g, m.course);
            s4a.set(pair, (s4a.get(pair) ?? 0) + 1);
          }
        }
      }
    }
    const groupList = [...span.keys()];
    const minRooms = Math.min(...members.map((m) => m.rooms.length));
    const finalStarts = feasible ? starts : [];
    return {
      index: u,
      members,
      roomOrder: Int32Array.from(
        members
          .map((_, i) => i)
          .sort(
            (a, b) =>
              members[b].session.size - members[a].session.size ||
              members[a].rooms.length - members[b].rooms.length ||
              a - b,
          ),
      ),
      basket,
      starts: Int32Array.from(finalStarts),
      fixed,
      duration: Math.max(...members.map((m) => m.duration)),
      size: members.reduce((sum, m) => sum + m.session.size, 0),
      groups: Int32Array.from(groupList),
      groupSpan: Int32Array.from(groupList.map((g) => span.get(g) as number)),
      groupHours: Int32Array.from(groupList.map((g) => hours.get(g) as number)),
      s4aPairs: Int32Array.from(s4a.keys()),
      s4aCounts: Int32Array.from(s4a.values()),
      s4bCourses: Int32Array.from(basket ? members.map((m) => m.course) : []),
      options: finalStarts.length * minRooms,
    };
  });

  const clashes = fixedClashes(
    units,
    days,
    { faculty: faculty.ids, groups: groups.ids, rooms },
    facultyMax,
    roomInit,
    slotCount,
  );
  issues.push(...clashes);

  return {
    instance,
    days,
    dayCount,
    slotCount,
    rooms,
    roomIndex,
    facultyIds: faculty.ids,
    facultyMax,
    groupIds: groups.ids,
    groupIndex: groups.index,
    courseIds: courses.ids,
    pairCount: pairs.size,
    units,
    members: membersBySession,
    roomInit,
    facultyInit,
    placeable: Int32Array.from(
      units.filter((u) => u.starts.length > 0).map((u) => u.index),
    ),
    sessionCount: sessions.length,
    issues,
    certainlyInfeasible:
      clashes.length > 0 || units.some((u) => u.starts.length === 0),
  };
}

/**
 * Pairs of fixed units that can never both be placed: overlapping on a shared group (H3), a
 * shared faculty member (H2) or the only open room both can use (H4), plus faculty days whose
 * fixed sessions alone exceed `max_hours_per_day` (H12).
 */
function fixedClashes(
  units: readonly ModelUnit[],
  days: readonly string[],
  ids: {
    faculty: readonly string[];
    groups: readonly string[];
    rooms: readonly Room[];
  },
  facultyMax: Int32Array,
  roomInit: Int32Array,
  slotCount: number,
): ModelIssue[] {
  const { faculty: facultyIds, groups: groupIds, rooms } = ids;
  const issues: ModelIssue[] = [];
  const fixed = units.filter((u) => u.fixed && u.starts.length === 1);
  const idsOf = (u: ModelUnit) => u.members.map((m) => m.session.id);
  const nameOf = (u: ModelUnit) =>
    u.basket ? `basket ${u.basket}` : idsOf(u)[0];
  const onlyRoom = (m: ModelMember, slot: number) => {
    const open = Array.from(m.rooms).filter((r) => {
      for (let k = 0; k < m.duration; k++) {
        if (roomInit[r * slotCount + slot + k] === BLOCKED) return false;
      }
      return true;
    });
    return open.length === 1 ? open[0] : -1;
  };
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      const a = fixed[i];
      const b = fixed[j];
      const sa = a.starts[0];
      const sb = b.starts[0];
      if (dayOfSlot(sa) !== dayOfSlot(sb)) continue;
      const pa = periodOfSlot(sa);
      const pb = periodOfSlot(sb);
      const reasons: string[] = [];
      for (let gi = 0; gi < a.groups.length; gi++) {
        const gj = b.groups.indexOf(a.groups[gi]);
        if (gj !== -1 && overlaps(pa, a.groupSpan[gi], pb, b.groupSpan[gj])) {
          reasons.push(`group ${groupIds[a.groups[gi]]}`);
        }
      }
      for (const ma of a.members) {
        for (const mb of b.members) {
          if (!overlaps(pa, ma.duration, pb, mb.duration)) continue;
          if (ma.faculty === mb.faculty) {
            reasons.push(`faculty ${facultyIds[ma.faculty]}`);
          }
          const ra = onlyRoom(ma, sa);
          if (ra !== -1 && ra === onlyRoom(mb, sb)) {
            reasons.push(
              `room ${rooms[ra].id}, the only open room that fits both`,
            );
          }
        }
      }
      if (reasons.length > 0) {
        issues.push({
          kind: "fixed_slot_invalid",
          session_ids: [...idsOf(a), ...idsOf(b)],
          detail: `${nameOf(a)} (fixed ${days[dayOfSlot(sa)]} P${pa}) and ${nameOf(b)} (fixed ${days[dayOfSlot(sb)]} P${pb}) overlap and share ${[...new Set(reasons)].join(", ")}`,
        });
      }
    }
  }
  // Fixed hours per faculty and day against the daily cap.
  type Load = { f: number; day: number; hours: number; sessions: string[] };
  const loads = new Map<string, Load>();
  for (const u of fixed) {
    const day = dayOfSlot(u.starts[0]);
    for (const m of u.members) {
      const key = `${m.faculty}|${day}`;
      let load = loads.get(key);
      if (!load) {
        load = { f: m.faculty, day, hours: 0, sessions: [] };
        loads.set(key, load);
      }
      load.hours += m.duration;
      load.sessions.push(m.session.id);
    }
  }
  for (const { f, day, hours: total, sessions } of loads.values()) {
    if (total > facultyMax[f]) {
      issues.push({
        kind: "fixed_slot_invalid",
        session_ids: sessions,
        detail: `Fixed sessions of ${facultyIds[f]} on ${days[day]} add up to ${total} hours (max ${facultyMax[f]})`,
      });
    }
  }
  return issues;
}

// ------------------------------------------------------------------------- soft-cost tables

/** S2 gaps for a 13-bit period mask: empty periods between the first and last busy one. */
const GAP = (() => {
  const table = new Uint8Array(1 << PERIODS_PER_DAY);
  for (let mask = 1; mask < table.length; mask++) {
    const lo = 31 - Math.clz32(mask & -mask);
    const hi = 31 - Math.clz32(mask);
    let bits = 0;
    for (let x = mask; x; x &= x - 1) bits++;
    table[mask] = hi - lo + 1 - bits;
  }
  return table;
})();

/** S3: 3 points per hour over 6 in a group's day. */
const overload = (hours: number) => (hours > 6 ? 3 * (hours - 6) : 0);
/** S4: 3 points per repeat of a course in a day. */
const repeats = (count: number) => (count > 1 ? 3 * (count - 1) : 0);
/** Bits for periods `start .. start + length - 1`. */
const bitsOf = (start: number, length: number) =>
  ((1 << length) - 1) << (start - 1);

// ------------------------------------------------------------------------------- fest index

/**
 * Fest demands compiled to occupancy cells (see fest.ts for the cost definition).
 *
 * An option's blockers are its occupied room cells plus its window's busy mandatory-group cells.
 * Every room option of a demand at the same (day, periods) shares those group cells, so they are
 * counted once per *window*. The state keeps a room-blocker counter per option and a
 * group-blocker counter per window, updated through cell → option and cell → window indexes on
 * every cell change. A place/remove therefore costs O(options and windows reading the touched
 * cells), whatever the number of demands.
 */
type FestIndex = {
  readonly count: number;
  readonly optionCount: number;
  readonly windowCount: number;
  /** `CATEGORY_WEIGHT` of each demand (the cost is `weightPerPoint ×` this `×` min blockers). */
  readonly points: Int32Array;
  /** Demand → its options `[optStart[d], optStart[d + 1])`. */
  readonly optStart: Int32Array;
  /** Option → its window; window → its demand and its number of options. */
  readonly optWindow: Int32Array;
  readonly winDemand: Int32Array;
  readonly winOptions: Int32Array;
  /** Option → room cells `[roomStart[o], roomStart[o + 1])`; window → group cells likewise. */
  readonly roomStart: Int32Array;
  readonly roomCells: Int32Array;
  readonly groupStart: Int32Array;
  readonly groupCells: Int32Array;
  /** Room cell → options that read it; group cell → windows that read it (CSR). */
  readonly byRoomStart: Int32Array;
  readonly byRoom: Int32Array;
  readonly byGroupStart: Int32Array;
  readonly byGroup: Int32Array;
};

function csr(lists: number[][]): { start: Int32Array; data: Int32Array } {
  const start = new Int32Array(lists.length + 1);
  lists.forEach((list, i) => (start[i + 1] = start[i] + list.length));
  const data = new Int32Array(start[lists.length]);
  lists.forEach((list, i) => data.set(list, start[i]));
  return { start, data };
}

/** Compiles demands to cells. `groupsOf[d]` are demand d's mandatory groups (see `festDemandGroups`). */
function compileFest(
  model: Model,
  demands: readonly FestDemand[],
  groupsOf: readonly (readonly string[])[],
): FestIndex {
  const { slotCount } = model;
  const optStart = [0];
  const optWindow: number[] = [];
  const winDemand: number[] = [];
  const winOptions: number[] = [];
  const roomLists: number[][] = [];
  const groupLists: number[][] = [];
  // Neither an option nor a window lists a cell twice (distinct periods, distinct groups).
  const byRoom: number[][] = Array.from(
    { length: model.rooms.length * slotCount },
    () => [],
  );
  const byGroup: number[][] = Array.from(
    { length: model.groupIds.length * slotCount },
    () => [],
  );
  demands.forEach((demand, d) => {
    const groupIdx = groupsOf[d]
      .map((g) => model.groupIndex.get(g))
      .filter((g): g is number => g !== undefined);
    const windows = new Map<string, number>();
    for (const option of demand.options) {
      const o = roomLists.length;
      const day = model.days.indexOf(option.day);
      const key = `${day}|${option.group_periods.join(",")}`;
      let w = windows.get(key);
      if (w === undefined) {
        w = winDemand.length;
        windows.set(key, w);
        winDemand.push(d);
        winOptions.push(0);
        const groupCells: number[] = [];
        if (day !== -1) {
          for (const g of groupIdx) {
            for (const p of option.group_periods) {
              const cell = g * slotCount + slotOf(day, p);
              groupCells.push(cell);
              byGroup[cell].push(w);
            }
          }
        }
        groupLists.push(groupCells);
      }
      optWindow.push(w);
      winOptions[w]++;
      const r = model.roomIndex.get(option.room_id);
      const roomCells: number[] = [];
      if (day !== -1 && r !== undefined) {
        for (const p of option.room_periods) {
          const cell = r * slotCount + slotOf(day, p);
          roomCells.push(cell);
          byRoom[cell].push(o);
        }
      }
      roomLists.push(roomCells);
    }
    optStart.push(roomLists.length);
  });
  const rooms = csr(roomLists);
  const groups = csr(groupLists);
  const roomIdx = csr(byRoom);
  const groupIdx = csr(byGroup);
  return {
    count: demands.length,
    optionCount: optWindow.length,
    windowCount: winDemand.length,
    points: Int32Array.from(
      demands.map((d) => CATEGORY_WEIGHT[d.effective_category] ?? 0),
    ),
    optStart: Int32Array.from(optStart),
    optWindow: Int32Array.from(optWindow),
    winDemand: Int32Array.from(winDemand),
    winOptions: Int32Array.from(winOptions),
    roomStart: rooms.start,
    roomCells: rooms.data,
    groupStart: groups.start,
    groupCells: groups.data,
    byRoomStart: roomIdx.start,
    byRoom: roomIdx.data,
    byGroupStart: groupIdx.start,
    byGroup: groupIdx.data,
  };
}

// ------------------------------------------------------------------------------------ state

/** Where every unit sits; enough to rebuild a state exactly. */
export type StateSnapshot = {
  readonly unitSlot: Int32Array;
  readonly memberRoom: Int32Array;
};

/**
 * A partial timetable over the model with O(touched cells) place/remove and incremental
 * S1–S6 and fest costs. Each soft bucket is recomputed from its raw count on every change, so the
 * totals equal `softScoreMap` of `toAssignments()` (asserted by the property test).
 */
export class TimetableState {
  readonly model: Model;
  readonly unitSlot: Int32Array;
  /** Model room of each member (`model.members` index = dataset position), -1 if unplaced. */
  readonly memberRoom: Int32Array;
  readonly roomOcc: Int32Array;
  readonly facOcc: Int32Array;
  readonly grpOcc: Int32Array;
  readonly facHours: Int32Array;
  readonly grpMask: Int32Array;
  readonly grpHours: Int32Array;
  readonly pairCount: Int32Array;
  readonly basketCount: Int32Array;
  s1 = 0;
  s2 = 0;
  s3 = 0;
  s4a = 0;
  s4b = 0;
  s5 = 0;
  s6 = 0;
  unplacedUnits: number;
  unplacedSessions: number;
  /** Σ `CATEGORY_WEIGHT × min blockers` over fest demands; the cost is `festWeight ×` this. */
  festPoints = 0;
  readonly festWeight: number;
  /**
   * Fest bookkeeping work done so far (counter and option-scan steps). Tests use it to pin the
   * cost of a place/remove to the cells it touches rather than to the number of demands.
   */
  festWork = 0;
  private readonly fest: FestIndex | null;
  /** Occupied room cells of each option. */
  private readonly optBlockers: Int32Array;
  /** Busy mandatory-group cells of each window. */
  private readonly winBlockers: Int32Array;
  /** Options of each window with no occupied room cell. */
  private readonly winFreeRooms: Int32Array;
  /** Options of each demand with no blocker at all (the demand's min is 0 while this is above 0). */
  private readonly freeOptions: Int32Array;
  private readonly demandMin: Int32Array;
  /** Demands touched by the current place/remove: `touchedList[0 .. touchedCount)`. */
  private readonly touched: Int32Array;
  private readonly touchedList: Int32Array;
  private touchedCount = 0;
  private readonly unitMark: Int32Array;
  private stamp = 0;

  constructor(
    model: Model,
    fest?: {
      demands: readonly FestDemand[];
      groups: readonly (readonly string[])[];
      weightPerPoint: number;
    },
  ) {
    this.model = model;
    const { slotCount, dayCount } = model;
    this.unitSlot = new Int32Array(model.units.length).fill(-1);
    this.memberRoom = new Int32Array(model.members.length).fill(-1);
    this.roomOcc = Int32Array.from(model.roomInit);
    this.facOcc = Int32Array.from(model.facultyInit);
    this.grpOcc = new Int32Array(model.groupIds.length * slotCount).fill(FREE);
    this.facHours = new Int32Array(model.facultyIds.length * dayCount);
    this.grpMask = new Int32Array(model.groupIds.length * dayCount);
    this.grpHours = new Int32Array(model.groupIds.length * dayCount);
    this.pairCount = new Int32Array(model.pairCount * dayCount);
    this.basketCount = new Int32Array(model.courseIds.length * dayCount);
    this.unplacedUnits = model.units.length;
    this.unplacedSessions = model.sessionCount;
    this.festWeight = fest?.weightPerPoint ?? 0;
    this.fest =
      fest && fest.demands.length > 0 && this.festWeight > 0
        ? compileFest(model, fest.demands, fest.groups)
        : null;
    const demandCount = this.fest?.count ?? 0;
    this.optBlockers = new Int32Array(this.fest?.optionCount ?? 0);
    this.winBlockers = new Int32Array(this.fest?.windowCount ?? 0);
    this.winFreeRooms = new Int32Array(this.fest?.windowCount ?? 0);
    this.freeOptions = new Int32Array(demandCount);
    this.demandMin = new Int32Array(demandCount);
    this.touched = new Int32Array(demandCount);
    this.touchedList = new Int32Array(demandCount);
    this.unitMark = new Int32Array(model.units.length);
    this.resetFest();
  }

  /** Fest bookkeeping for an empty timetable: no blockers, every demand's min is 0. */
  private resetFest(): void {
    const fest = this.fest;
    this.festPoints = 0;
    this.optBlockers.fill(0);
    this.winBlockers.fill(0);
    this.demandMin.fill(0);
    if (!fest) return;
    this.winFreeRooms.set(fest.winOptions);
    for (let d = 0; d < fest.count; d++) {
      this.freeOptions[d] = fest.optStart[d + 1] - fest.optStart[d];
    }
  }

  /** Current S1–S6 total. */
  get soft(): number {
    return (
      this.s1 + this.s2 + this.s3 + this.s4a + this.s4b + this.s5 + this.s6
    );
  }

  get festCost(): number {
    return this.festPoints * this.festWeight;
  }

  /** What the annealer minimises: soft + fest. */
  get objective(): number {
    return this.soft + this.festPoints * this.festWeight;
  }

  penalties(): SoftPenalties {
    return {
      S1: this.s1,
      S2: this.s2,
      S3: this.s3,
      S4: this.s4a + this.s4b,
      S5: this.s5,
      S6: this.s6,
    };
  }

  isPlaced(u: number): boolean {
    return this.unitSlot[u] !== -1;
  }

  /** Rooms of a placed unit, aligned with `unit.members`. */
  roomsOf(u: number, out: Int32Array): Int32Array {
    const members = this.model.units[u].members;
    for (let i = 0; i < members.length; i++) {
      out[i] = this.memberRoom[members[i].index];
    }
    return out;
  }

  /** True when the unit can go at this start in these rooms without breaking a hard rule. */
  canPlace(u: number, slot: number, rooms: ArrayLike<number>): boolean {
    const { slotCount, dayCount } = this.model;
    const unit = this.model.units[u];
    const day = dayOfSlot(slot);
    const members = unit.members;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const r = rooms[i];
      if (r < 0) return false;
      for (let j = 0; j < i; j++) if (rooms[j] === r) return false;
      const rb = r * slotCount + slot;
      const fb = m.faculty * slotCount + slot;
      for (let k = 0; k < m.duration; k++) {
        if (this.roomOcc[rb + k] !== FREE || this.facOcc[fb + k] !== FREE) {
          return false;
        }
      }
      if (
        this.facHours[m.faculty * dayCount + day] + m.duration >
        this.model.facultyMax[m.faculty]
      ) {
        return false;
      }
    }
    const groups = unit.groups;
    for (let i = 0; i < groups.length; i++) {
      const gb = groups[i] * slotCount + slot;
      for (let k = 0; k < unit.groupSpan[i]; k++) {
        if (this.grpOcc[gb + k] !== FREE) return false;
      }
    }
    return true;
  }

  /**
   * First free room per member in preference order (largest member first, distinct rooms).
   * Returns false if some member has no free room. Faculty, group and H12 are not checked.
   */
  firstFreeRooms(u: number, slot: number, out: Int32Array): boolean {
    const unit = this.model.units[u];
    const order = unit.roomOrder;
    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi];
      const m = unit.members[i];
      out[i] = -1;
      for (let k = 0; k < m.rooms.length; k++) {
        const r = m.rooms[k];
        if (this.roomFree(r, slot, m.duration, out, order, oi)) {
          out[i] = r;
          break;
        }
      }
      if (out[i] === -1) return false;
    }
    return true;
  }

  /** A uniformly random free room per member (distinct). */
  randomFreeRooms(
    u: number,
    slot: number,
    rng: () => number,
    out: Int32Array,
  ): boolean {
    const unit = this.model.units[u];
    const order = unit.roomOrder;
    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi];
      const m = unit.members[i];
      const n = m.rooms.length;
      const offset = Math.floor(rng() * n);
      out[i] = -1;
      for (let k = 0; k < n; k++) {
        const r = m.rooms[(offset + k) % n];
        if (this.roomFree(r, slot, m.duration, out, order, oi)) {
          out[i] = r;
          break;
        }
      }
      if (out[i] === -1) return false;
    }
    return true;
  }

  private roomFree(
    r: number,
    slot: number,
    duration: number,
    chosen: Int32Array,
    order: Int32Array,
    upTo: number,
  ): boolean {
    for (let j = 0; j < upTo; j++) if (chosen[order[j]] === r) return false;
    const base = r * this.model.slotCount + slot;
    for (let k = 0; k < duration; k++) {
      if (this.roomOcc[base + k] !== FREE) return false;
    }
    return true;
  }

  /** Places a unit. The caller guarantees `canPlace`. */
  place(u: number, slot: number, rooms: ArrayLike<number>): void {
    this.apply(u, slot, rooms, 1);
  }

  /** Removes a placed unit. */
  remove(u: number): void {
    const slot = this.unitSlot[u];
    if (slot === -1) return;
    const members = this.model.units[u].members;
    const rooms = new Int32Array(members.length);
    this.roomsOf(u, rooms);
    this.apply(u, slot, rooms, -1);
  }

  /** Removes a placed unit, writing its rooms to `rooms` first (no allocation). */
  removeInto(u: number, rooms: Int32Array): number {
    const slot = this.unitSlot[u];
    if (slot === -1) return -1;
    this.roomsOf(u, rooms);
    this.apply(u, slot, rooms, -1);
    return slot;
  }

  private apply(
    u: number,
    slot: number,
    rooms: ArrayLike<number>,
    sign: 1 | -1,
  ): void {
    const model = this.model;
    const { slotCount, dayCount } = model;
    const unit = model.units[u];
    const day = dayOfSlot(slot);
    const period = periodOfSlot(slot);
    const cellValue = sign === 1 ? u : FREE;
    const fest = this.fest;
    if (fest) {
      this.nextStamp();
      this.touchedCount = 0;
    }

    for (let i = 0; i < unit.members.length; i++) {
      const m = unit.members[i];
      const r = rooms[i];
      const dur = m.duration;
      const rb = r * slotCount + slot;
      const fb = m.faculty * slotCount + slot;
      for (let k = 0; k < dur; k++) {
        this.roomOcc[rb + k] = cellValue;
        this.facOcc[fb + k] = cellValue;
        if (fest) this.touchRoom(rb + k, sign);
      }
      this.facHours[m.faculty * dayCount + day] += sign * dur;
      this.memberRoom[m.index] = sign === 1 ? r : -1;
      this.s1 += sign * m.s1[slot];
      this.s5 += sign * m.s5[r];
      if (
        period <= LAST_TEACHING_PERIOD &&
        period + dur - 1 >= LAST_TEACHING_PERIOD
      ) {
        this.s6 += sign;
      }
    }

    const groups = unit.groups;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const span = unit.groupSpan[i];
      const gb = g * slotCount + slot;
      for (let k = 0; k < span; k++) {
        this.grpOcc[gb + k] = cellValue;
        if (fest) this.touchGroup(gb + k, sign);
      }
      const gd = g * dayCount + day;
      const oldMask = this.grpMask[gd];
      const bits = bitsOf(period, span);
      const newMask = sign === 1 ? oldMask | bits : oldMask & ~bits;
      this.grpMask[gd] = newMask;
      this.s2 += GAP[newMask] - GAP[oldMask];
      const oldHours = this.grpHours[gd];
      const newHours = oldHours + sign * unit.groupHours[i];
      this.grpHours[gd] = newHours;
      this.s3 += overload(newHours) - overload(oldHours);
    }

    const pairs = unit.s4aPairs;
    for (let i = 0; i < pairs.length; i++) {
      const key = pairs[i] * dayCount + day;
      const old = this.pairCount[key];
      const next = old + sign * unit.s4aCounts[i];
      this.pairCount[key] = next;
      this.s4a += repeats(next) - repeats(old);
    }
    const courses = unit.s4bCourses;
    for (let i = 0; i < courses.length; i++) {
      const key = courses[i] * dayCount + day;
      const old = this.basketCount[key];
      const next = old + sign;
      this.basketCount[key] = next;
      this.s4b += repeats(next) - repeats(old);
    }

    this.unitSlot[u] = sign === 1 ? slot : -1;
    this.unplacedUnits -= sign;
    this.unplacedSessions -= sign * unit.members.length;

    if (fest) {
      for (let k = 0; k < this.touchedCount; k++) {
        const d = this.touchedList[k];
        const next = this.freeOptions[d] > 0 ? 0 : this.leastBlockers(d);
        this.festPoints += fest.points[d] * (next - this.demandMin[d]);
        this.demandMin[d] = next;
      }
    }
  }

  /** A fresh marker for `touched`/`unitMark`; the arrays are reset before it could overflow. */
  private nextStamp(): number {
    if (this.stamp >= 0x3fffffff) {
      this.stamp = 0;
      this.touched.fill(0);
      this.unitMark.fill(0);
    }
    return ++this.stamp;
  }

  private markDemand(d: number): void {
    if (this.touched[d] !== this.stamp) {
      this.touched[d] = this.stamp;
      this.touchedList[this.touchedCount++] = d;
    }
  }

  /** A room cell became occupied (`by` 1) or free (`by` -1): update the options that read it. */
  private touchRoom(cell: number, by: 1 | -1): void {
    const fest = this.fest as FestIndex;
    const end = fest.byRoomStart[cell + 1];
    this.festWork += end - fest.byRoomStart[cell];
    for (let j = fest.byRoomStart[cell]; j < end; j++) {
      const o = fest.byRoom[j];
      const before = this.optBlockers[o];
      const after = before + by;
      this.optBlockers[o] = after;
      const w = fest.optWindow[o];
      const d = fest.winDemand[w];
      if (before === 0) {
        this.winFreeRooms[w]--;
        if (this.winBlockers[w] === 0) this.freeOptions[d]--;
      } else if (after === 0) {
        this.winFreeRooms[w]++;
        if (this.winBlockers[w] === 0) this.freeOptions[d]++;
      }
      this.markDemand(d);
    }
  }

  /** A group cell became busy (`by` 1) or free (`by` -1): update the windows that read it. */
  private touchGroup(cell: number, by: 1 | -1): void {
    const fest = this.fest as FestIndex;
    const end = fest.byGroupStart[cell + 1];
    this.festWork += end - fest.byGroupStart[cell];
    for (let j = fest.byGroupStart[cell]; j < end; j++) {
      const w = fest.byGroup[j];
      const before = this.winBlockers[w];
      const after = before + by;
      this.winBlockers[w] = after;
      const d = fest.winDemand[w];
      if (before === 0) this.freeOptions[d] -= this.winFreeRooms[w];
      else if (after === 0) this.freeOptions[d] += this.winFreeRooms[w];
      this.markDemand(d);
    }
  }

  /** Fewest blockers over demand d's options, from the counters. */
  private leastBlockers(d: number): number {
    const fest = this.fest as FestIndex;
    this.festWork += fest.optStart[d + 1] - fest.optStart[d];
    let best = Number.MAX_SAFE_INTEGER;
    for (let o = fest.optStart[d]; o < fest.optStart[d + 1]; o++) {
      const blockers =
        this.optBlockers[o] + this.winBlockers[fest.optWindow[o]];
      if (blockers < best) best = blockers;
    }
    return best === Number.MAX_SAFE_INTEGER ? 0 : best;
  }

  /** Fewest blocking cells over demand d's options, recounted from occupancy (for asserts). */
  private recountBlockers(d: number): number {
    const fest = this.fest as FestIndex;
    let best = Number.MAX_SAFE_INTEGER;
    for (let o = fest.optStart[d]; o < fest.optStart[d + 1]; o++) {
      let blockers = 0;
      for (let j = fest.roomStart[o]; j < fest.roomStart[o + 1]; j++) {
        if (this.roomOcc[fest.roomCells[j]] >= 0) blockers++;
      }
      const w = fest.optWindow[o];
      for (let j = fest.groupStart[w]; j < fest.groupStart[w + 1]; j++) {
        if (this.grpOcc[fest.groupCells[j]] >= 0) blockers++;
      }
      if (blockers < best) {
        best = blockers;
        if (best === 0) break;
      }
    }
    return best === Number.MAX_SAFE_INTEGER ? 0 : best;
  }

  /** Fest points recounted from occupancy, ignoring every counter (for asserts). */
  festFull(): number {
    if (!this.fest) return 0;
    let points = 0;
    for (let d = 0; d < this.fest.count; d++) {
      points += this.fest.points[d] * this.recountBlockers(d);
    }
    return points;
  }

  /**
   * Units blocking a placement: occupants of its room, faculty and group cells, plus — when the
   * faculty's day would exceed `max_hours_per_day` (H12) — that faculty's other units that day,
   * largest first, until the hours fit. Returns false if no ejection can make it feasible
   * (a closed cell, or a session longer than the daily cap).
   */
  conflicts(
    u: number,
    slot: number,
    rooms: ArrayLike<number>,
    out: number[],
  ): boolean {
    const { slotCount, dayCount } = this.model;
    const unit = this.model.units[u];
    const day = dayOfSlot(slot);
    const mark = this.unitMark;
    const stamp = this.nextStamp();
    out.length = 0;
    const add = (v: number) => {
      if (v !== u && mark[v] !== stamp) {
        mark[v] = stamp;
        out.push(v);
      }
    };
    for (let i = 0; i < unit.members.length; i++) {
      const m = unit.members[i];
      const rb = rooms[i] * slotCount + slot;
      const fb = m.faculty * slotCount + slot;
      for (let k = 0; k < m.duration; k++) {
        const rc = this.roomOcc[rb + k];
        const fc = this.facOcc[fb + k];
        if (rc === BLOCKED || fc === BLOCKED) return false;
        if (rc >= 0) add(rc);
        if (fc >= 0) add(fc);
      }
    }
    for (let i = 0; i < unit.groups.length; i++) {
      const gb = unit.groups[i] * slotCount + slot;
      for (let k = 0; k < unit.groupSpan[i]; k++) {
        const gc = this.grpOcc[gb + k];
        if (gc >= 0) add(gc);
      }
    }
    for (let i = 0; i < unit.members.length; i++) {
      const m = unit.members[i];
      const max = this.model.facultyMax[m.faculty];
      let hours = this.facHours[m.faculty * dayCount + day] + m.duration;
      if (hours <= max) continue;
      // Hours this faculty teaches that day, per unit (from the occupancy row).
      const row = m.faculty * slotCount + day * PERIODS_PER_DAY;
      const others = new Map<number, number>();
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        const v = this.facOcc[row + p];
        if (v >= 0 && v !== u) others.set(v, (others.get(v) ?? 0) + 1);
      }
      for (const [v, h] of others) if (mark[v] === stamp) hours -= h;
      const candidates = [...others]
        .filter(([v]) => mark[v] !== stamp)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      for (const [v, h] of candidates) {
        if (hours <= max) break;
        add(v);
        hours -= h;
      }
      if (hours > max) return false;
    }
    return true;
  }

  /** Empties the timetable. */
  clear(): void {
    this.unitSlot.fill(-1);
    this.memberRoom.fill(-1);
    this.roomOcc.set(this.model.roomInit);
    this.facOcc.set(this.model.facultyInit);
    this.grpOcc.fill(FREE);
    this.facHours.fill(0);
    this.grpMask.fill(0);
    this.grpHours.fill(0);
    this.pairCount.fill(0);
    this.basketCount.fill(0);
    this.s1 = this.s2 = this.s3 = this.s4a = this.s4b = this.s5 = this.s6 = 0;
    this.unplacedUnits = this.model.units.length;
    this.unplacedSessions = this.model.sessionCount;
    this.resetFest();
  }

  snapshot(): StateSnapshot {
    return {
      unitSlot: Int32Array.from(this.unitSlot),
      memberRoom: Int32Array.from(this.memberRoom),
    };
  }

  /** Copies the placement into an existing snapshot (no allocation). */
  snapshotInto(snap: StateSnapshot): void {
    snap.unitSlot.set(this.unitSlot);
    snap.memberRoom.set(this.memberRoom);
  }

  /** Rebuilds the state from a snapshot of a state over the same model. */
  restore(snap: StateSnapshot): void {
    this.clear();
    const rooms = new Int32Array(8);
    for (let u = 0; u < snap.unitSlot.length; u++) {
      const slot = snap.unitSlot[u];
      if (slot === -1) continue;
      const members = this.model.units[u].members;
      const buf =
        members.length <= rooms.length ? rooms : new Int32Array(members.length);
      for (let i = 0; i < members.length; i++) {
        buf[i] = snap.memberRoom[members[i].index];
      }
      this.apply(u, slot, buf, 1);
    }
  }

  /** The placed sessions as assignments, in dataset session order. */
  toAssignments(): Assignment[] {
    const out: Assignment[] = [];
    const { members, rooms, days } = this.model;
    for (const m of members) {
      const r = this.memberRoom[m.index];
      if (r === -1) continue;
      const slot = this.unitSlot[m.unit];
      out.push({
        session_id: m.session.id,
        day: days[dayOfSlot(slot)] as Assignment["day"],
        start_period: periodOfSlot(slot),
        room_id: rooms[r].id,
      });
    }
    return out;
  }

  /** Session ids of unplaced units, in dataset order. */
  unplacedSessionIds(): string[] {
    return this.model.members
      .filter((m) => this.unitSlot[m.unit] === -1)
      .map((m) => m.session.id);
  }

  /** S1–S6 recomputed from scratch from the placement (for asserts). */
  softFull(): SoftPenalties {
    const { units, dayCount } = this.model;
    const mask = new Int32Array(this.grpMask.length);
    const hours = new Int32Array(this.grpHours.length);
    const pairs = new Int32Array(this.pairCount.length);
    const baskets = new Int32Array(this.basketCount.length);
    const pen: SoftPenalties = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 };
    for (const unit of units) {
      const slot = this.unitSlot[unit.index];
      if (slot === -1) continue;
      const day = dayOfSlot(slot);
      const period = periodOfSlot(slot);
      for (const m of unit.members) {
        pen.S1 += m.s1[slot];
        pen.S5 += m.s5[this.memberRoom[m.index]];
        const end = period + m.duration - 1;
        if (period <= LAST_TEACHING_PERIOD && LAST_TEACHING_PERIOD <= end) {
          pen.S6 += 1;
        }
      }
      unit.groups.forEach((g, i) => {
        mask[g * dayCount + day] |= bitsOf(period, unit.groupSpan[i]);
        hours[g * dayCount + day] += unit.groupHours[i];
      });
      unit.s4aPairs.forEach((p, i) => {
        pairs[p * dayCount + day] += unit.s4aCounts[i];
      });
      for (const c of unit.s4bCourses) baskets[c * dayCount + day] += 1;
    }
    for (const m of mask) pen.S2 += GAP[m];
    for (const h of hours) pen.S3 += overload(h);
    for (const c of pairs) pen.S4 += repeats(c);
    for (const c of baskets) pen.S4 += repeats(c);
    return pen;
  }
}
