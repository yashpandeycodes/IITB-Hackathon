/**
 * Why a session, or a whole basket slot, cannot go at a start: the hard rule that rules each
 * start out in a plain timetable with the unit's own placements left out. Shared by the
 * rescheduler's conflict report, move suggestions and session explanations, so all three give
 * the same reasons in the same words.
 *
 * Each blocked start is put under exactly one rule (the first that applies, in `RULE_ORDER`), so
 * the tallies of a report add up to the starts considered.
 */
import type {
  Assignment,
  ConflictEntry,
  ModelIssue,
  Room,
  Session,
} from "@/lib/contracts";

import { block, toAssignMap } from "./checker";
import {
  formatPeriods,
  listJoin,
  plural,
  roomNeed,
  roomTypeName,
  slotLabel,
  unique,
} from "./format";
import {
  isFacultyUnavailable,
  isRoomUnavailable,
  isTeachingDay,
  type Instance,
} from "./instance";
import { sessionRoomDomain } from "./model";
import { isPyInt } from "./py";
import { LAST_TEACHING_PERIOD } from "./types";

/** Default `max_hours_per_day` (the validator's fallback). */
const DEFAULT_MAX_HOURS = 4;

/**
 * The order rules are checked in for one start; the first that applies is the start's reason.
 * Rules nothing can change (fixed slot, unavailability, no suitable room) come first.
 */
export const RULE_ORDER = [
  "H14",
  "H7",
  "H6",
  "H5",
  "H10",
  "H8",
  "H3",
  "H2",
  "H12",
  "H4",
] as const;

// ------------------------------------------------------------------------------------ units

/** One scheduling decision: a session, or every session of one basket slot. */
export type Unit = {
  /** Members in dataset order. */
  readonly sessions: readonly Session[];
  readonly basket: string | null;
  /** The dataset's fixed slot (the first member that has one). */
  readonly fixed: { day: string; start_period: number } | null;
};

/** The unit a session belongs to, or null for an unknown session. */
export function unitOf(instance: Instance, sessionId: string): Unit | null {
  const session = instance.sessions.get(sessionId);
  if (!session) return null;
  const sessions = session.basket_slot
    ? [...instance.sessions.values()].filter(
        (s) => s.basket_slot === session.basket_slot,
      )
    : [session];
  const fixed = sessions.find((s) => s.fixed_slot)?.fixed_slot ?? null;
  return {
    sessions,
    basket: session.basket_slot || null,
    fixed: fixed ? { day: fixed.day, start_period: fixed.start_period } : null,
  };
}

/** How a unit is named in a sentence: "CS202-T2" or "Basket OEB-1 (OE301-L1, OE302-L1)". */
export function unitName(unit: Unit): string {
  if (!unit.basket) return unit.sessions[0].id;
  return `Basket ${unit.basket} (${unit.sessions.map((s) => s.id).join(", ")})`;
}

/** The validator's room rules for a session: H6 type, H5 capacity, H10 accessibility. */
export function roomSuits(room: Room, session: Session): boolean {
  return (
    session.room_types.includes(room.type) &&
    room.capacity >= session.size &&
    (!session.needs_accessible || room.accessible)
  );
}

/** Which of H6, H5, H10 a room breaks for a session (in that order), or null. */
export function roomRuleBroken(room: Room, session: Session): string | null {
  if (!session.room_types.includes(room.type)) return "H6";
  if (room.capacity < session.size) return "H5";
  if (session.needs_accessible && !room.accessible) return "H10";
  return null;
}

/** True when `start` fits the session's block: P1–P9, no lunch crossing, lab start periods. */
export function blockFits(
  instance: Instance,
  session: Session,
  start: number,
): boolean {
  const end = start + session.duration - 1;
  if (!isPyInt(start) || start < 1 || end > LAST_TEACHING_PERIOD) return false;
  const lunch = instance.lunch_after_period;
  if (start <= lunch && lunch < end) return false;
  if (session.kind === "lab" && !instance.lab_start_periods.has(start)) {
    return false;
  }
  return true;
}

/**
 * Every reason `start` doesn't fit the session's block (empty when {@link blockFits}): it runs
 * outside P1–P9, it crosses lunch, a lab starts off its start periods. All of them, not just the
 * first, so a fixed slot that both crosses lunch and starts a lab at the wrong period says both.
 */
export function blockProblems(
  instance: Instance,
  session: Session,
  start: number,
): ("outside" | "lunch" | "lab_start")[] {
  const out: ("outside" | "lunch" | "lab_start")[] = [];
  const end = start + session.duration - 1;
  if (!isPyInt(start) || start < 1 || end > LAST_TEACHING_PERIOD) {
    out.push("outside");
  }
  const lunch = instance.lunch_after_period;
  if (isPyInt(start) && start <= lunch && lunch < end) out.push("lunch");
  if (session.kind === "lab" && !instance.lab_start_periods.has(start)) {
    out.push("lab_start");
  }
  return out;
}

/** "P2 or P6". */
function labStarts(instance: Instance): string {
  const starts = [...instance.lab_start_periods]
    .sort((a, b) => a - b)
    .map((p) => `P${p}`);
  return listJoin(starts, "or");
}

export type Start = { readonly day: string; readonly start_period: number };

/** Every start in the week whose block fits every member (calendar order, then period). */
export function structuralStarts(instance: Instance, unit: Unit): Start[] {
  const out: Start[] = [];
  for (const day of unique(instance.days)) {
    for (let p = 1; p <= LAST_TEACHING_PERIOD; p++) {
      if (unit.sessions.every((s) => blockFits(instance, s, p))) {
        out.push({ day, start_period: p });
      }
    }
  }
  return out;
}

export function maxHours(instance: Instance, facultyId: string): number {
  return (
    instance.faculty.get(facultyId)?.max_hours_per_day ?? DEFAULT_MAX_HOURS
  );
}

// -------------------------------------------------------------------------------- occupancy

const cellKey = (kind: string, id: string, day: string, period: number) =>
  `${kind}\u0001${id}\u0001${day}\u0001${period}`;

/**
 * Who holds each room, faculty and group cell of a timetable, and each faculty member's hours per
 * day. Entries with an unknown session or room, a non-teaching day or a non-integer start are
 * skipped (they occupy nothing the validator could count).
 */
export class Occupancy {
  readonly instance: Instance;
  private readonly cells = new Map<string, string[]>();
  private readonly hours = new Map<string, number>();

  constructor(
    instance: Instance,
    assignments: readonly Assignment[],
    exclude: ReadonlySet<string> = new Set(),
  ) {
    this.instance = instance;
    for (const [sid, place] of toAssignMap(assignments).assign) {
      if (typeof sid !== "string" || exclude.has(sid)) continue;
      const s = instance.sessions.get(sid);
      const { day, start_period: start, room_id: rid } = place;
      if (!s || !isTeachingDay(instance, day) || !isPyInt(start)) continue;
      const room =
        typeof rid === "string" ? instance.rooms.get(rid) : undefined;
      const d = day as string;
      for (const p of block(start, s.duration)) {
        if (room) this.push(cellKey("r", room.id, d, p), s.id);
        this.push(cellKey("f", s.faculty_id, d, p), s.id);
        for (const g of s.groups) this.push(cellKey("g", g, d, p), s.id);
      }
      const hk = `${s.faculty_id}\u0001${d}`;
      this.hours.set(hk, (this.hours.get(hk) ?? 0) + s.duration);
    }
  }

  private push(key: string, sid: string) {
    const list = this.cells.get(key);
    if (list) list.push(sid);
    else this.cells.set(key, [sid]);
  }

  private occupants(key: string): readonly string[] {
    return this.cells.get(key) ?? [];
  }

  room(roomId: string, day: string, period: number): readonly string[] {
    return this.occupants(cellKey("r", roomId, day, period));
  }

  faculty(facultyId: string, day: string, period: number): readonly string[] {
    return this.occupants(cellKey("f", facultyId, day, period));
  }

  group(groupId: string, day: string, period: number): readonly string[] {
    return this.occupants(cellKey("g", groupId, day, period));
  }

  facultyHours(facultyId: string, day: string): number {
    return this.hours.get(`${facultyId}\u0001${day}`) ?? 0;
  }
}

// ---------------------------------------------------------------------------- start checks

export type StartVerdict =
  | { readonly free: true; readonly rooms: readonly string[] }
  | {
      readonly free: false;
      readonly rule: string;
      readonly who: readonly string[];
    };

/**
 * A unit's room options, prepared once and checked against an `Occupancy` at any start.
 * Rooms are tried in preference order: the preferred room, then rooms the session fills to at
 * least 40 % (no S5), smallest first.
 */
export class UnitProbe {
  readonly instance: Instance;
  readonly unit: Unit;
  /** Per member: candidate rooms in preference order (empty when no room suits). */
  private readonly rooms: Room[][];
  /** Per member: why no room suits, when `rooms` is empty. */
  private readonly noRoom: ({ rule: string; who: string } | null)[];

  constructor(
    instance: Instance,
    unit: Unit,
    opts: {
      /** Only this room for this member (a requested room). */
      room?: { member: number; room_id: string } | null;
      /** Room to try first per member (e.g. where it is now). */
      prefer?: readonly (string | null | undefined)[];
    } = {},
  ) {
    this.instance = instance;
    this.unit = unit;
    this.rooms = [];
    this.noRoom = [];
    unit.sessions.forEach((s, i) => {
      if (opts.room && opts.room.member === i) {
        const room = instance.rooms.get(opts.room.room_id);
        if (!room) {
          this.rooms.push([]);
          this.noRoom.push({
            rule: "H1",
            who: `${opts.room.room_id} doesn't exist`,
          });
          return;
        }
        const broken = roomRuleBroken(room, s);
        this.rooms.push(broken ? [] : [room]);
        this.noRoom.push(
          broken ? { rule: broken, who: roomMismatch(room, s, broken) } : null,
        );
        return;
      }
      const domain = sessionRoomDomain(instance, s).rooms;
      const order = new Map(domain.map((room, k) => [room.id, k]));
      const s5 = (room: Room) =>
        room.capacity && s.size / room.capacity < 0.4 ? 1 : 0;
      const sorted = [...domain].sort(
        (a, b) =>
          s5(a) - s5(b) ||
          a.capacity - b.capacity ||
          (order.get(a.id) as number) - (order.get(b.id) as number),
      );
      const preferred = opts.prefer?.[i];
      const first = sorted.findIndex((room) => room.id === preferred);
      if (first > 0) sorted.unshift(...sorted.splice(first, 1));
      this.rooms.push(sorted);
      this.noRoom.push(
        sorted.length === 0 ? noSuitableRoom(instance, s) : null,
      );
    });
  }

  /** The first rule that rules this start out, or the rooms (per member) it would use. */
  check(occ: Occupancy, day: string, start: number): StartVerdict {
    const { instance, unit } = this;
    const fx = unit.fixed;
    if (fx && (fx.day !== day || fx.start_period !== start)) {
      return {
        free: false,
        rule: "H14",
        who: [slotLabel(fx.day, fx.start_period)],
      };
    }
    const sessions = unit.sessions;
    const unavailable = unique(
      sessions
        .filter((s) =>
          block(start, s.duration).some((p) =>
            isFacultyUnavailable(instance, s.faculty_id, day, p),
          ),
        )
        .map((s) => s.faculty_id),
    );
    if (unavailable.length > 0)
      return { free: false, rule: "H7", who: unavailable };

    const open: Room[][] = [];
    for (let i = 0; i < sessions.length; i++) {
      const none = this.noRoom[i];
      if (none) return { free: false, rule: none.rule, who: [none.who] };
      const s = sessions[i];
      const list = this.rooms[i].filter((room) =>
        block(start, s.duration).every(
          (p) => !isRoomUnavailable(instance, room.id, day, p),
        ),
      );
      if (list.length === 0) {
        const only = this.rooms[i].length === 1 ? this.rooms[i][0].id : null;
        return {
          free: false,
          rule: "H8",
          who: [only ?? "every suitable room"],
        };
      }
      open.push(list);
    }

    const busyGroups = unique(
      sessions.flatMap((s) =>
        s.groups.filter((g) =>
          block(start, s.duration).some((p) => occ.group(g, day, p).length > 0),
        ),
      ),
    );
    if (busyGroups.length > 0)
      return { free: false, rule: "H3", who: busyGroups };

    const busyFaculty = unique(
      sessions
        .filter((s) =>
          block(start, s.duration).some(
            (p) => occ.faculty(s.faculty_id, day, p).length > 0,
          ),
        )
        .map((s) => s.faculty_id),
    );
    if (busyFaculty.length > 0)
      return { free: false, rule: "H2", who: busyFaculty };

    const hours = new Map<string, number>();
    for (const s of sessions) {
      hours.set(s.faculty_id, (hours.get(s.faculty_id) ?? 0) + s.duration);
    }
    const capped = [...hours]
      .filter(([f, h]) => occ.facultyHours(f, day) + h > maxHours(instance, f))
      .map(([f]) => f);
    if (capped.length > 0) return { free: false, rule: "H12", who: capped };

    const free = open.map((list, i) =>
      list.filter((room) =>
        block(start, sessions[i].duration).every(
          (p) => occ.room(room.id, day, p).length === 0,
        ),
      ),
    );
    const chosen = matchRooms(free, sessions);
    if (!chosen) {
      const i = free.findIndex((list) => list.length === 0);
      if (i === -1) {
        return {
          free: false,
          rule: "H4",
          who: [`set of ${sessions.length} suitable rooms`],
        };
      }
      const only = this.rooms[i].length === 1 ? this.rooms[i][0].id : null;
      return { free: false, rule: "H4", who: [only ?? roomNeed(sessions[i])] };
    }
    return { free: true, rooms: chosen };
  }
}

/** Distinct rooms per member, each from its list in order (largest session first, then augmenting). */
function matchRooms(
  lists: readonly Room[][],
  sessions: readonly Session[],
): string[] | null {
  if (lists.some((list) => list.length === 0)) return null;
  if (lists.length === 1) return [lists[0][0].id];
  const order = sessions
    .map((_, i) => i)
    .sort((a, b) => sessions[b].size - sessions[a].size || a - b);
  const owner = new Map<string, number>();
  const assigned: (string | null)[] = sessions.map(() => null);
  const tryAssign = (i: number, seen: Set<string>): boolean => {
    for (const room of lists[i]) {
      if (seen.has(room.id)) continue;
      seen.add(room.id);
      const j = owner.get(room.id);
      if (j === undefined || tryAssign(j, seen)) {
        owner.set(room.id, i);
        assigned[i] = room.id;
        return true;
      }
    }
    return false;
  };
  for (const i of order) if (!tryAssign(i, new Set())) return null;
  return assigned as string[];
}

/** Why a specific room doesn't suit a session, e.g. "CR-105 seats 70". */
function roomMismatch(room: Room, s: Session, rule: string): string {
  if (rule === "H6") return `${room.id} is a ${roomTypeName(room.type)}`;
  if (rule === "H5") return `${room.id} seats ${room.capacity}`;
  return `${room.id} isn't accessible`;
}

/** Why no room in the dataset suits a session: the first of H6, H5, H10 that empties the list. */
export function noSuitableRoom(
  instance: Instance,
  s: Session,
): { rule: string; who: string } {
  const rooms = [...instance.rooms.values()];
  const types = s.room_types.join("/") || "none";
  const typed = rooms.filter((r) => s.room_types.includes(r.type));
  if (typed.length === 0)
    return { rule: "H6", who: `no room of type ${types}` };
  const big = typed.filter((r) => r.capacity >= s.size);
  if (big.length === 0) {
    return { rule: "H5", who: `no room of type ${types} seats ${s.size}` };
  }
  return {
    rule: "H10",
    who: `no accessible room of type ${types} seats ${s.size}`,
  };
}

// ---------------------------------------------------------------------------------- tallies

export type TallyEntry = {
  rule: string;
  count: number;
  /** e.g. "CSE-2 already in class". */
  detail: string;
  /** e.g. "CSE-2 is already in class in 21". */
  phrase: string;
};

/** Blocked starts counted per rule, with who blocked them. */
export class RuleTally {
  private readonly map = new Map<string, { count: number; who: string[] }>();
  private readonly instance: Instance;

  constructor(instance: Instance) {
    this.instance = instance;
  }

  add(rule: string, who: readonly string[]): void {
    const entry = this.map.get(rule);
    if (entry) {
      entry.count++;
      for (const w of who) if (!entry.who.includes(w)) entry.who.push(w);
    } else {
      this.map.set(rule, { count: 1, who: [...who] });
    }
  }

  get total(): number {
    let n = 0;
    for (const { count } of this.map.values()) n += count;
    return n;
  }

  /** Largest count first, then `RULE_ORDER`. */
  entries(): TallyEntry[] {
    const groupOrder = [...this.instance.groups.keys()];
    const facultyOrder = [...this.instance.faculty.keys()];
    const byOrder = (order: readonly string[]) => (a: string, b: string) => {
      const i = order.indexOf(a);
      const j = order.indexOf(b);
      return (i === -1 ? order.length : i) - (j === -1 ? order.length : j);
    };
    const sortWho = (rule: string, who: readonly string[]) =>
      rule === "H3"
        ? [...who].sort(byOrder(groupOrder))
        : rule === "H2" || rule === "H7" || rule === "H12"
          ? [...who].sort(byOrder(facultyOrder))
          : who;
    const rank = (rule: string) => {
      const i = (RULE_ORDER as readonly string[]).indexOf(rule);
      return i === -1 ? RULE_ORDER.length : i;
    };
    return [...this.map]
      .sort(([a, x], [b, y]) => y.count - x.count || rank(a) - rank(b))
      .map(([rule, { count, who }]) => ({
        rule,
        count,
        ...describe(this.instance, rule, sortWho(rule, who), count),
      }));
  }
}

const isAre = (items: readonly string[]) => (items.length > 1 ? "are" : "is");

function describe(
  instance: Instance,
  rule: string,
  who: readonly string[],
  count: number,
): { detail: string; phrase: string } {
  const names = listJoin(who);
  switch (rule) {
    case "H14":
      return {
        detail: `fixed at ${names}`,
        phrase: `the dataset fixes it at ${names}, which rules out ${count}`,
      };
    case "H7":
      return {
        detail: `${names} unavailable`,
        phrase: `${names} ${isAre(who)} unavailable in ${count}`,
      };
    case "H8": {
      const every = who.includes("every suitable room");
      return {
        detail: every ? "every suitable room closed" : `${names} closed`,
        phrase: every
          ? `every suitable room is closed in ${count}`
          : `${names} ${isAre(who)} closed in ${count}`,
      };
    }
    case "H3":
      return {
        detail: `${names} already in class`,
        phrase: `${names} ${isAre(who)} already in class in ${count}`,
      };
    case "H2":
      return {
        detail: `${names} already teaching`,
        phrase: `${names} ${isAre(who)} already teaching in ${count}`,
      };
    case "H12": {
      const caps = unique(who.map((f) => maxHours(instance, f)));
      const limit =
        caps.length === 1 ? `the ${caps[0]} h daily limit` : "the daily limit";
      return {
        detail: `${names} at ${limit}`,
        phrase: `${names} ${isAre(who)} at ${limit} in ${count}`,
      };
    }
    case "H4": {
      const isRoom = who.length > 0 && who.every((w) => instance.rooms.has(w));
      const needs = listJoin(who, "or");
      return {
        detail: isRoom ? `${names} already in use` : `no free ${needs}`,
        phrase: isRoom
          ? `${names} ${isAre(who)} in use in ${count}`
          : `no ${needs} is free in ${count}`,
      };
    }
    default:
      // H5, H6, H10: the room text already reads as a sentence ("no room of type lab_phy seats 120").
      return { detail: names, phrase: `${names} (${count})` };
  }
}

// --------------------------------------------------------------------------- contradictions

/** Unavailable periods of a faculty member on one day, as "THU P6–P9". */
function unavailableText(
  instance: Instance,
  facultyId: string,
  day: string,
): string {
  const periods: number[] = [];
  for (let p = 1; p <= 13; p++) {
    if (isFacultyUnavailable(instance, facultyId, day, p)) periods.push(p);
  }
  return `${facultyId} unavailable ${day} ${formatPeriods(periods)}`;
}

/**
 * Constraints of a unit that no move of any other session can fix: a fixed slot that breaks a
 * rule on its own, no room that suits it, a session longer than its teacher's daily cap, a
 * teacher unavailable at every start, two basket sessions with one teacher, and fixed-slot
 * clashes the model found (`issues`).
 */
export function unitContradictions(
  instance: Instance,
  unit: Unit,
  issues: readonly ModelIssue[] = [],
): string[] {
  const out: string[] = [];
  const sessions = unit.sessions;
  for (const s of sessions) {
    const max = maxHours(instance, s.faculty_id);
    if (s.duration > max) {
      out.push(
        `${s.id} lasts ${s.duration} periods but ${s.faculty_id} may teach only ${max} a day`,
      );
    }
    const suits = [...instance.rooms.values()].some((r) => roomSuits(r, s));
    if (!suits) out.push(noSuitableRoom(instance, s).who);
  }
  if (unit.basket) {
    const seen = new Map<string, string>();
    for (const s of sessions) {
      const other = seen.get(s.faculty_id);
      if (other) {
        out.push(
          `basket ${unit.basket}: ${other} and ${s.id} are both taught by ${s.faculty_id}`,
        );
      }
      seen.set(s.faculty_id, s.id);
    }
    const times = unique(
      sessions
        .filter((s) => s.fixed_slot)
        .map((s) => slotLabel(s.fixed_slot!.day, s.fixed_slot!.start_period)),
    );
    if (times.length > 1) {
      out.push(
        `basket ${unit.basket} is fixed at different times (${times.join(", ")})`,
      );
    }
  }
  if (out.length > 0) return out;

  const fx = unit.fixed;
  if (fx) {
    const label = `fixed_slot ${slotLabel(fx.day, fx.start_period)}`;
    if (!instance.days.includes(fx.day)) {
      out.push(`${label} is not on a teaching day`);
    }
    for (const s of sessions) {
      for (const problem of blockProblems(instance, s, fx.start_period)) {
        if (problem === "outside")
          out.push(
            `${label} runs outside P1–P${LAST_TEACHING_PERIOD} for ${s.id}`,
          );
        else if (problem === "lunch")
          out.push(`${label} crosses lunch for ${s.id}`);
        else
          out.push(`${label}, but labs start only at ${labStarts(instance)}`);
      }
    }
    if (out.length === 0) {
      for (const s of sessions) {
        const hit = block(fx.start_period, s.duration).some((p) =>
          isFacultyUnavailable(instance, s.faculty_id, fx.day, p),
        );
        if (hit)
          out.push(
            `${label} vs ${unavailableText(instance, s.faculty_id, fx.day)}`,
          );
      }
    }
    if (out.length === 0) {
      const empty = new Occupancy(instance, []);
      const verdict = new UnitProbe(instance, unit).check(
        empty,
        fx.day,
        fx.start_period,
      );
      if (!verdict.free && verdict.rule === "H8") {
        out.push(`${label} vs every suitable room closed then`);
      } else if (!verdict.free && verdict.rule === "H4") {
        out.push(
          `${label}: there are not enough suitable rooms for the basket then`,
        );
      }
    }
    if (out.length === 0) {
      const ids = new Set(sessions.map((s) => s.id));
      for (const issue of issues) {
        if (
          issue.kind === "fixed_slot_invalid" &&
          issue.session_ids.some((id) => ids.has(id))
        ) {
          out.push(issue.detail);
        }
      }
    }
    return unique(out);
  }

  const label = unit.basket ? `basket ${unit.basket}` : sessions[0].id;
  const starts = structuralStarts(instance, unit);
  if (starts.length === 0) {
    out.push(
      `${label} fits no start: ${plural(sessions[0].duration, "period")} within P1–P${LAST_TEACHING_PERIOD} without crossing lunch`,
    );
    return out;
  }
  const empty = new Occupancy(instance, []);
  const probe = new UnitProbe(instance, unit);
  const verdicts = starts.map((st) =>
    probe.check(empty, st.day, st.start_period),
  );
  const faculty = unique(sessions.map((s) => s.faculty_id));
  if (verdicts.every((v) => !v.free && v.rule === "H7")) {
    const who = unique(verdicts.flatMap((v) => (v.free ? [] : v.who)));
    out.push(
      who.length > 1
        ? `at every start that fits ${label}, ${listJoin(who, "or")} is unavailable`
        : `${who[0]} is unavailable at every start that fits ${label}`,
    );
  } else if (
    verdicts.every((v) => !v.free && (v.rule === "H7" || v.rule === "H8"))
  ) {
    out.push(
      `every suitable room is closed whenever ${listJoin(faculty)} can teach ${label}`,
    );
  } else if (verdicts.every((v) => !v.free && v.rule === "H4")) {
    out.push(`there are never enough suitable rooms for ${label} at once`);
  }
  for (const f of faculty) {
    const load = facultyLoad(instance, f);
    if (load) out.push(load);
  }
  return out;
}

/**
 * A teacher's week that can't hold their sessions whatever moves: more hours than their free
 * periods allow under the daily cap, or more sessions longer than half the cap (two of those
 * never fit in one day) than days that can hold one.
 */
function facultyLoad(instance: Instance, facultyId: string): string | null {
  const sessions = [...instance.sessions.values()].filter(
    (s) => s.faculty_id === facultyId,
  );
  if (sessions.length === 0) return null;
  const max = maxHours(instance, facultyId);
  const caps = unique(instance.days).map((day) => {
    let free = 0;
    for (let p = 1; p <= LAST_TEACHING_PERIOD; p++) {
      if (!isFacultyUnavailable(instance, facultyId, day, p)) free++;
    }
    return Math.min(max, free);
  });
  const total = sessions.reduce((sum, s) => sum + s.duration, 0);
  const week = caps.reduce((sum, c) => sum + c, 0);
  if (total > week) {
    return `${facultyId} must teach ${plural(total, "hour")} a week but can teach at most ${week} (${max} h a day, only when available)`;
  }
  const long = sessions.filter((s) => 2 * s.duration > max);
  if (long.length > 1) {
    const shortest = Math.min(...long.map((s) => s.duration));
    const days = caps.filter((c) => c >= shortest).length;
    if (long.length > days) {
      return `${facultyId} teaches ${long.length} sessions of ${shortest} or more periods, at most one a day under the ${max} h cap, but only ${plural(days, "day")} can hold one`;
    }
  }
  return null;
}

/**
 * Why a requested placement of a unit can never hold, whatever else moves: a non-teaching day, a
 * block outside P1–P9 or across lunch, a lab off its start periods, a fixed slot elsewhere, the
 * teacher unavailable, or a requested room that doesn't exist, doesn't suit or is closed.
 * `rooms` maps member positions to the rooms asked for.
 */
export function placementContradictions(
  instance: Instance,
  unit: Unit,
  day: string,
  start: number,
  rooms: ReadonlyMap<number, string>,
): string[] {
  const label = slotLabel(day, start);
  if (!instance.days.includes(day)) return [`${day} is not a teaching day`];
  const out: string[] = [];
  for (const s of unit.sessions) {
    for (const problem of blockProblems(instance, s, start)) {
      if (problem === "outside")
        out.push(
          `${s.id} at ${label} runs outside P1–P${LAST_TEACHING_PERIOD}`,
        );
      else if (problem === "lunch")
        out.push(`${s.id} at ${label} crosses lunch`);
      else
        out.push(
          `${s.id} is a lab, and labs start only at ${labStarts(instance)}`,
        );
    }
  }
  if (out.length > 0) return out;
  const fx = unit.fixed;
  if (fx && (fx.day !== day || fx.start_period !== start)) {
    out.push(
      `${unitName(unit)} has fixed_slot ${slotLabel(fx.day, fx.start_period)}; the placement asks for ${label}`,
    );
  }
  for (const s of unit.sessions) {
    if (
      block(start, s.duration).some((p) =>
        isFacultyUnavailable(instance, s.faculty_id, day, p),
      )
    ) {
      out.push(
        `placement ${label} vs ${unavailableText(instance, s.faculty_id, day)}`,
      );
    }
  }
  for (const [pos, roomId] of rooms) {
    const s = unit.sessions[pos];
    const room = instance.rooms.get(roomId);
    if (!s) continue;
    if (!room) {
      out.push(`room ${roomId} doesn't exist`);
      continue;
    }
    const broken = roomRuleBroken(room, s);
    if (broken) {
      out.push(
        `${roomId} doesn't suit ${s.id} (${roomMismatch(room, s, broken)}, needs ${roomNeed(s)})`,
      );
      continue;
    }
    const closed = block(start, s.duration).filter((p) =>
      isRoomUnavailable(instance, roomId, day, p),
    );
    if (closed.length > 0) {
      out.push(`${roomId} is closed ${day} ${formatPeriods(closed)}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------- reports

export type ConflictReportOptions = {
  /** Only these starts (a requested window); default every structural start. */
  starts?: readonly Start[];
  /** True when `starts` is a requested window (changes the wording). */
  window?: boolean;
  /** Extra contradictions (e.g. a placement that can't hold). */
  extra?: readonly string[];
  /** Model issues, for fixed-slot clashes. */
  issues?: readonly ModelIssue[];
  /** Deepest ejection chain tried, named in the summary when nothing static explains it. */
  chainDepth?: number;
  /** A requested room for the unit's first member. */
  room?: { member: number; room_id: string } | null;
};

/** One `ConflictEntry` per member of a unit that can't be placed in `occ`. */
export function conflictEntries(
  occ: Occupancy,
  unit: Unit,
  opts: ConflictReportOptions = {},
): ConflictEntry[] {
  const instance = occ.instance;
  const starts = opts.starts ?? structuralStarts(instance, unit);
  const probe = new UnitProbe(instance, unit, { room: opts.room ?? null });
  const tally = new RuleTally(instance);
  let free = 0;
  for (const st of starts) {
    const verdict = probe.check(occ, st.day, st.start_period);
    if (verdict.free) free++;
    else tally.add(verdict.rule, verdict.who);
  }
  const entries = tally.entries();
  const contradictions = unique([
    ...(opts.extra ?? []),
    ...unitContradictions(instance, unit, opts.issues),
  ]);
  const name = unitName(unit);
  const where = opts.window ? " in the requested window" : "";
  let summary: string;
  if (contradictions.length > 0) {
    const more = contradictions.length - 1;
    summary = `${name} can't be placed: ${contradictions[0]}${more > 0 ? ` (and ${plural(more, "more conflict")})` : ""}.`;
  } else if (starts.length === 0) {
    summary = `${name} can't be placed: no start slot${where} fits its ${plural(unit.sessions[0].duration, "period")}.`;
  } else {
    const phrases = entries.map((e) => e.phrase);
    if (free > 0) {
      phrases.push(
        `${plural(free, "start")} ${free === 1 ? "is" : "are"} free but a full repair there failed`,
      );
    }
    const chain =
      opts.chainDepth !== undefined && free === 0
        ? `, and no chain of up to ${plural(opts.chainDepth, "move")} frees one`
        : "";
    summary = `${name} can't be placed: across ${plural(starts.length, "start slot")}${where}, ${listJoin(phrases)}${chain}.`;
  }
  return unit.sessions.map((s) => ({
    session_id: s.id,
    blocking: entries.map(({ rule, count, detail }) => ({
      rule,
      count,
      detail,
    })),
    contradictions,
    summary,
  }));
}
