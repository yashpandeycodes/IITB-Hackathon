/**
 * Spectra booking decision engine (backend.md §3.4): decides every Week-7 request against the
 * timetable in priority order (effective category, then submission time), with best-fit rooms
 * inside the window, institute-event displacement via session overrides, alternatives outside the
 * window, and a reason code + facts + reason text for every decision. Self-checked with
 * `checkBookings` (the validator port).
 *
 * Invariants that keep the validator happy (and are re-checked at the end):
 * - every held cell (sessions, approved and alternative bookings) is used by one holder, so the
 *   validator accepts each booking whatever order it reads them in;
 * - a moved session passes every timetable rule (`checkAssignMap` is the gate) and never lands in
 *   a booked room cell or inside a booking's compulsory-group periods;
 * - requests are decided highest priority first and only ever take free cells, so a rejected
 *   request never outranks an approved one that holds cells it could use. Displacement is the one
 *   step that frees cells, so earlier rejections are retried right after it and a move that would
 *   still create an inversion is refused.
 */
import {
  effectiveCategory,
  isCategoryCapped,
  type Assignment,
  type BookingDecision,
  type BookingFacts,
  type BookingRequest,
  type BookingStats,
  type Category,
  type Day,
  type PriorityRules,
  type ReasonCode,
  type Room,
  type SessionOverride,
  type StoredBookingDecision,
  type Violation,
} from "@/lib/contracts";

import { checkBookings, missingNeeds } from "./bookings-check";
import {
  cancelledReason,
  capitalize,
  categoryLabel,
  clockOf,
  formatCount,
  listLabel,
  needsLabel,
  periodsLabel,
  roomTypeLabel,
  roomTypesLabel,
  span,
  type Clock,
} from "./bookings-text";
import {
  block,
  checkAssignMap,
  isGroupBusy,
  toAssignMap,
  type GroupOccupancy,
} from "./checker";
import {
  isFacultyUnavailable,
  isRoomUnavailable,
  type Instance,
} from "./instance";
import { compareStrings, isPyInt, tupleKey } from "./py";
import {
  LAST_TEACHING_PERIOD,
  MAX_PERIOD,
  type AssignMap,
  type Placement,
} from "./types";

/** Structured facts behind a decision (`BookingFactsSchema`; explanations are phrased from these). */
export type { BookingFacts };

/** The export decision plus the stored metadata the engine decides (`StoredBookingDecision`). */
export type EngineBookingDecision = BookingDecision &
  Pick<
    StoredBookingDecision,
    | "reason_code"
    | "effective_category"
    | "category_capped"
    | "requires_admin_approval"
  > & { facts: BookingFacts };

export type SpectraOptions = {
  /** Priority rules for previews only; exports always use the dataset's (`instance.priority`). */
  priority?: PriorityRules;
  /** Allow institute events to displace sessions (default true). */
  allowDisplacement?: boolean;
  /**
   * Requests that never displace sessions, whatever their category (default none): decided as
   * if displacement were switched off for them alone. Every other request is unaffected.
   */
  noDisplacement?: ReadonlySet<string>;
};

export type SpectraDecisionResult = {
  /** One decision per request, in dataset order. */
  decisions: EngineBookingDecision[];
  overrides: SessionOverride[];
  /** Request ids in the order they were decided. */
  order: string[];
  /** The Week-7 timetable (base with overrides applied). */
  week: Assignment[];
  /** From the `checkBookings` self-check. */
  stats: BookingStats;
  violations: Violation[];
  warnings: string[];
};

// ------------------------------------------------------------------------------ internals

/** Most sessions one booking may move. */
const MAX_DISPLACED = 3;
/** Most in-window slots tried for displacement per request (keeps tricky inputs fast). */
const MAX_DISPLACEMENT_TRIES = 40;
const INSTITUTE: Category = "institute_event";
const REGULAR: Category = "regular_session";

type Slot = { room_id: string; day: string; start: number; end: number };
type Holder = { kind: "session" | "booking"; id: string };
type BlockedBy = BookingFacts["blocked_by"][number];
type Displaced = BookingFacts["displaced"][number];
type StaticFacts = Omit<BookingFacts, "blocked_by" | "displaced" | "cancelled">;

/** A compulsory group that has class in one period of a slot. */
type GroupHit = { group: string; period: number; sessions: readonly string[] };

/** One (room, day, start) a request could take, and everything standing in its way. */
type Probe = {
  room: Room;
  roomIndex: number;
  day: string;
  start: number;
  end: number;
  /** Index of the window the slot sits in (-1 for an alternative). */
  windowIndex: number;
  holders: { holder: Holder; periods: number[] }[];
  /** Periods the room is closed. */
  closed: number[];
  groups: GroupHit[];
};

/** Every in-window probe of a request, plus how many legal (day, start) pairs exist. */
type Scan = { probes: Probe[]; legalStarts: number };

type Prepared = {
  req: BookingRequest;
  /** Position in the dataset. */
  index: number;
  effective: Category;
  /** Rank of `effective` in the priority order in use (lower is higher priority). */
  rank: number;
  capped: boolean;
  /** The category may displace sessions (ranks at or above `institute_event`). */
  eligible: boolean;
  /** `eligible` and displacement is switched on (for this request). */
  canDisplace: boolean;
  /** `requested_room` unless blank. */
  requested: string | null;
  mandatory: readonly string[];
  /** Rooms that pass every static rule, best fit (smallest) first. */
  rooms: readonly { room: Room; index: number }[];
  facts: StaticFacts;
  staticReject: { code: ReasonCode; reason: string } | null;
};

/** The Week-7 timetable and indexes derived from it. Replaced, never mutated. */
type WeekView = {
  week: ReadonlyMap<unknown, Placement>;
  /** Exactly what the validator uses for compulsory-group checks. */
  groupOcc: GroupOccupancy;
  /** `rule + detail` of every timetable violation of this week. */
  violationKeys: ReadonlySet<string>;
  /** tupleKey(room, day, period) → session ids. */
  roomCells: ReadonlyMap<string, readonly string[]>;
  /** tupleKey(group, day, period) → session ids. */
  groupCells: ReadonlyMap<string, readonly string[]>;
  /** tupleKey(faculty, day, period) → session ids. */
  facultyCells: ReadonlyMap<string, readonly string[]>;
  /** tupleKey(faculty, day) → hours taught. */
  facultyHours: ReadonlyMap<string, number>;
};

type State = {
  view: WeekView;
  /** Session id → override, in creation order (a session moved twice keeps its position). */
  overrides: Map<string, SessionOverride>;
  decided: Map<string, EngineBookingDecision>;
  /** Request id → the cells it holds (approved and alternative decisions). */
  slots: Map<string, Slot>;
  order: string[];
  /** tupleKey(room, day, period) → request id holding it. */
  bookingCells: Map<string, string>;
  /** tupleKey(group, day, period) a decided booking needs free. */
  bookingGroupCells: Set<string>;
};

type Ctx = {
  instance: Instance;
  rules: PriorityRules;
  clock: Clock;
  baseAssign: AssignMap;
  prepared: ReadonlyMap<string, Prepared>;
  /** Request id → session id → why that session could not be moved for it. */
  moveNotes: Map<string, Map<string, string>>;
};

/** Cells a pending request could use in its windows (for the displacement tie-break). */
type Footprint = {
  windows: readonly { day: string; from: number; to: number }[];
  rooms: ReadonlySet<string>;
  groups: ReadonlySet<string>;
};

type Failure =
  | { kind: "invalid" }
  | {
      kind: "group";
      group: string;
      session: string | null;
      day: string;
      period: number;
    }
  | { kind: "holder"; holder: Holder; probe: Probe }
  | { kind: "closed"; probe: Probe };

// ---------------------------------------------------------------------------- public API

export function decideBookings(
  instance: Instance,
  base: readonly Assignment[],
  options: SpectraOptions = {},
): SpectraDecisionResult {
  const rules = options.priority ?? instance.priority;
  const allowDisplacement = options.allowDisplacement !== false;
  const noDisplacement = options.noDisplacement;
  const baseAssign = toAssignMap(base).assign;

  const prepared = new Map<string, Prepared>();
  let index = 0;
  for (const [id, req] of instance.requests) {
    const mayDisplace = allowDisplacement && !noDisplacement?.has(id);
    prepared.set(id, prepare(instance, rules, mayDisplace, req, index++));
  }
  const ctx: Ctx = {
    instance,
    rules,
    clock: clockOf(instance),
    baseAssign,
    prepared,
    moveNotes: new Map(),
  };

  const queue = [...prepared.values()]
    .filter((p) => !instance.cancelled.has(p.req.id))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        compareStrings(a.req.submitted_at, b.req.submitted_at) ||
        a.index - b.index,
    );

  let state: State = {
    view: viewOf(instance, new Map(baseAssign)),
    overrides: new Map(),
    decided: new Map(),
    slots: new Map(),
    order: [],
    bookingCells: new Map(),
    bookingGroupCells: new Set(),
  };
  queue.forEach((prep, i) => {
    state = decideOne(ctx, state, prep, queue.slice(i + 1));
  });
  // Second chance against the final week (a displacement may have freed cells).
  retryRejected(ctx, state);
  // Cancelled requests hold nothing, so deciding them last changes no other decision.
  for (const prep of prepared.values()) {
    if (instance.cancelled.has(prep.req.id)) {
      record(state, prep, cancelledDecision(instance, prep), null);
    }
  }

  const finalOverrides = new Map<string, SessionOverride>();
  for (const [sid, o] of state.overrides) {
    if (!samePlacement(baseAssign.get(sid), o)) finalOverrides.set(sid, o);
  }
  const decisions = [...instance.requests.keys()].map((id) =>
    state.decided.get(id)!,
  );
  const overrides = [...finalOverrides.values()];
  const check = checkBookings(instance, baseAssign, {
    bookings: decisions,
    session_overrides: overrides,
  });
  const week = base.map((a): Assignment => {
    const o = finalOverrides.get(a.session_id);
    return o
      ? {
          session_id: a.session_id,
          day: o.day,
          start_period: o.start_period,
          room_id: o.room_id,
        }
      : { ...a };
  });
  return {
    decisions,
    overrides,
    order: state.order,
    week,
    stats: check.stats,
    violations: check.violations,
    warnings: check.warnings,
  };
}

/** Closest room id to free text such as "LHC-5" (normalised, edit distance ≤ 2), or null. */
export function suggestRoom(instance: Instance, text: string): string | null {
  const needle = normalizeRoomText(text);
  if (!needle) return null;
  let best: { id: string; key: number[] } | null = null;
  let index = 0;
  for (const room of instance.rooms.values()) {
    const byId = levenshtein(needle, normalizeRoomText(room.id));
    const byName = levenshtein(needle, normalizeRoomText(room.name));
    const distance = Math.min(byId, byName);
    // Prefer the smallest distance, then an id match over a name match, then dataset order.
    const key = [distance, byId <= byName ? 0 : 1, index++];
    if (distance > 2 || distance >= needle.length) continue;
    if (!best || compareKeys(key, best.key) < 0) best = { id: room.id, key };
  }
  return best?.id ?? null;
}

function normalizeRoomText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ------------------------------------------------------------------------- preparation

function prepare(
  instance: Instance,
  rules: PriorityRules,
  allowDisplacement: boolean,
  req: BookingRequest,
  index: number,
): Prepared {
  const order = rules.priority_order;
  const effective = effectiveCategory(rules, req);
  const effIdx = order.indexOf(effective);
  const rank = effIdx === -1 ? order.length : effIdx;
  const instituteIdx = order.indexOf(INSTITUTE);
  const eligible =
    effIdx !== -1 && instituteIdx !== -1 && effIdx <= instituteIdx;

  const requested =
    typeof req.requested_room === "string" && req.requested_room.trim()
      ? req.requested_room
      : null;
  const known = requested === null || instance.rooms.has(requested);
  const suggestion =
    requested !== null && !known ? suggestRoom(instance, requested) : null;
  const reference =
    requested !== null && known
      ? instance.rooms.get(requested)
      : suggestion !== null
        ? instance.rooms.get(suggestion)
        : undefined;

  const typed: { room: Room; index: number }[] = [];
  let roomIndex = 0;
  for (const room of instance.rooms.values()) {
    if (
      room.allowed_uses.includes("event") &&
      req.room_types.includes(room.type)
    ) {
      typed.push({ room, index: roomIndex });
    }
    roomIndex++;
  }
  let largest: Room | null = null;
  for (const { room } of typed) {
    if (!largest || room.capacity > largest.capacity) largest = room;
  }
  const rooms = typed
    .filter(
      ({ room }) =>
        room.capacity >= req.attendance && missingNeeds(req, room).length === 0,
    )
    .sort((a, b) => a.room.capacity - b.room.capacity || a.index - b.index);

  const types = roomTypesLabel(req.room_types);
  let staticReject: Prepared["staticReject"] = null;
  if (typed.length === 0) {
    staticReject = {
      code: "REJ_NO_ROOM_WITH_NEEDS",
      reason: `No ${types} room can host events.`,
    };
  } else if (!typed.some(({ room }) => room.capacity >= req.attendance)) {
    staticReject = {
      code: "REJ_NO_CAPACITY",
      reason: `No ${types} venue seats ${formatCount(req.attendance)}. The largest is ${largest!.id} (${formatCount(largest!.capacity)}).`,
    };
  } else if (rooms.length === 0) {
    staticReject = {
      code: "REJ_NO_ROOM_WITH_NEEDS",
      reason: `No ${types} room has ${needsLabel(unique(req.needs))} for ${formatCount(req.attendance)} people.`,
    };
  }

  return {
    req,
    index,
    effective,
    rank,
    capped: isCategoryCapped(rules, req),
    eligible,
    canDisplace: eligible && allowDisplacement,
    requested,
    mandatory: unique(req.mandatory_for_groups),
    rooms,
    facts: {
      attendance: req.attendance,
      duration: req.duration_periods,
      series_id: req.series_id ?? null,
      requested_room: req.requested_room ?? null,
      requested_room_known: known,
      room_suggestion: suggestion,
      requested_room_missing: reference ? missingNeeds(req, reference) : [],
      candidate_rooms: rooms.map(({ room }) => room.id),
      largest_room: largest
        ? { room_id: largest.id, capacity: largest.capacity }
        : null,
    },
    staticReject,
  };
}

// --------------------------------------------------------------------------- week state

function viewOf(
  instance: Instance,
  week: ReadonlyMap<unknown, Placement>,
): WeekView {
  const { violations, group_occupancy } = checkAssignMap(
    instance,
    week,
    "fest_week",
  );
  const roomCells = new Map<string, string[]>();
  const groupCells = new Map<string, string[]>();
  const facultyCells = new Map<string, string[]>();
  const facultyHours = new Map<string, number>();
  for (const [sid, placement] of week) {
    const s = typeof sid === "string" ? instance.sessions.get(sid) : undefined;
    const { day, start_period: start, room_id: room } = placement;
    if (!s || !isPyInt(start)) continue;
    for (const p of block(start, s.duration)) {
      push(roomCells, tupleKey(room, day, p), s.id);
      push(facultyCells, tupleKey(s.faculty_id, day, p), s.id);
      for (const g of s.groups) push(groupCells, tupleKey(g, day, p), s.id);
    }
    const hoursKey = tupleKey(s.faculty_id, day);
    facultyHours.set(hoursKey, (facultyHours.get(hoursKey) ?? 0) + s.duration);
  }
  return {
    week,
    groupOcc: group_occupancy,
    violationKeys: new Set(violations.map(violationKey)),
    roomCells,
    groupCells,
    facultyCells,
    facultyHours,
  };
}

function cloneState(state: State): State {
  return {
    view: state.view,
    overrides: new Map(state.overrides),
    decided: new Map(state.decided),
    slots: new Map(state.slots),
    order: [...state.order],
    bookingCells: new Map(state.bookingCells),
    bookingGroupCells: new Set(state.bookingGroupCells),
  };
}

/** Marks a slot's room cells and compulsory-group periods as taken by the request. */
function hold(state: State, prep: Prepared, slot: Slot): void {
  for (let p = slot.start; p <= slot.end; p++) {
    state.bookingCells.set(tupleKey(slot.room_id, slot.day, p), prep.req.id);
    for (const g of prep.mandatory) {
      state.bookingGroupCells.add(tupleKey(g, slot.day, p));
    }
  }
}

function record(
  state: State,
  prep: Prepared,
  decision: EngineBookingDecision,
  slot: Slot | null,
): void {
  const id = prep.req.id;
  state.decided.set(id, decision);
  if (!state.order.includes(id)) state.order.push(id);
  if (slot) {
    state.slots.set(id, slot);
    hold(state, prep, slot);
  }
}

// ---------------------------------------------------------------------------- deciding

function decideOne(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  pending: readonly Prepared[],
): State {
  if (prep.staticReject) {
    const { code, reason } = prep.staticReject;
    record(state, prep, decisionOf(prep, "rejected", null, reason, code), null);
    return state;
  }
  const scan = scanWindows(ctx, state, prep);
  if (placeInWindow(ctx, state, prep, scan)) return state;
  if (prep.canDisplace) {
    const displaced = tryDisplace(ctx, state, prep, scan, pending);
    if (displaced) return displaced;
  }
  if (placeAlternative(ctx, state, prep, scan)) return state;
  record(state, prep, rejection(ctx, state, prep, scan), null);
  return state;
}

/** Retries every rejected request (in decision order): inside its window first, then outside. */
function retryRejected(ctx: Ctx, state: State): void {
  for (const id of [...state.order]) {
    const prep = ctx.prepared.get(id);
    if (
      !prep ||
      prep.staticReject ||
      ctx.instance.cancelled.has(id) ||
      state.decided.get(id)?.status !== "rejected"
    ) {
      continue;
    }
    const scan = scanWindows(ctx, state, prep);
    if (!placeInWindow(ctx, state, prep, scan)) {
      placeAlternative(ctx, state, prep, scan);
    }
  }
}

function probe(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  room: Room,
  roomIndex: number,
  day: string,
  start: number,
  end: number,
  windowIndex: number,
): Probe {
  const holders: Probe["holders"] = [];
  const closed: number[] = [];
  const groups: GroupHit[] = [];
  const heldBy = (holder: Holder, p: number) => {
    let entry = holders.find(
      (h) => h.holder.kind === holder.kind && h.holder.id === holder.id,
    );
    if (!entry) holders.push((entry = { holder, periods: [] }));
    entry.periods.push(p);
  };
  for (let p = start; p <= end; p++) {
    const cell = tupleKey(room.id, day, p);
    for (const sid of state.view.roomCells.get(cell) ?? []) {
      heldBy({ kind: "session", id: sid }, p);
    }
    const booking = state.bookingCells.get(cell);
    if (booking !== undefined && booking !== prep.req.id) {
      heldBy({ kind: "booking", id: booking }, p);
    }
    if (isRoomUnavailable(ctx.instance, room.id, day, p)) closed.push(p);
    for (const g of prep.mandatory) {
      if (isGroupBusy(state.view.groupOcc, g, day, p)) {
        const sessions = state.view.groupCells.get(tupleKey(g, day, p)) ?? [];
        groups.push({ group: g, period: p, sessions });
      }
    }
  }
  return {
    room,
    roomIndex,
    day,
    start,
    end,
    windowIndex,
    holders,
    closed,
    groups,
  };
}

function isFree(p: Probe): boolean {
  return (
    p.holders.length === 0 && p.closed.length === 0 && p.groups.length === 0
  );
}

function slotOf(p: Probe): Slot {
  return { room_id: p.room.id, day: p.day, start: p.start, end: p.end };
}

/** Every (room, day, start) inside a window, ending by P13, on a working day. */
function scanWindows(ctx: Ctx, state: State, prep: Prepared): Scan {
  const probes: Probe[] = [];
  const seen = new Set<string>();
  const dur = prep.req.duration_periods;
  let legalStarts = 0;
  if (!(dur >= 1)) return { probes, legalStarts };
  prep.req.windows.forEach((w, windowIndex) => {
    if (!ctx.instance.days.includes(w.day)) return;
    const last = Math.min(w.to_period, MAX_PERIOD) - dur + 1;
    for (let start = Math.max(1, w.from_period); start <= last; start++) {
      const key = tupleKey(w.day, start);
      if (seen.has(key)) continue;
      seen.add(key);
      legalStarts++;
      for (const { room, index } of prep.rooms) {
        probes.push(
          probe(
            ctx,
            state,
            prep,
            room,
            index,
            w.day,
            start,
            start + dur - 1,
            windowIndex,
          ),
        );
      }
    }
  });
  return { probes, legalStarts };
}

/** Rooms already used by decided requests of the same series. */
function seriesRooms(ctx: Ctx, state: State, prep: Prepared): Set<string> {
  const rooms = new Set<string>();
  const series = prep.req.series_id;
  if (!series) return rooms;
  for (const [id, slot] of state.slots) {
    if (id !== prep.req.id && ctx.prepared.get(id)?.req.series_id === series) {
      rooms.add(slot.room_id);
    }
  }
  return rooms;
}

/** Requested room → series room → smallest that fits → window order, earliest → dataset order. */
function rankKey(prep: Prepared, series: Set<string>, p: Probe): number[] {
  return [
    prep.requested === p.room.id ? 0 : 1,
    series.has(p.room.id) ? 0 : 1,
    p.room.capacity,
    p.windowIndex,
    p.start,
    p.roomIndex,
  ];
}

function placeInWindow(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  scan: Scan,
): boolean {
  const series = seriesRooms(ctx, state, prep);
  let best: { probe: Probe; key: number[] } | null = null;
  for (const p of scan.probes) {
    if (!isFree(p)) continue;
    const key = rankKey(prep, series, p);
    if (!best || compareKeys(key, best.key) < 0) best = { probe: p, key };
  }
  if (!best) return false;
  const chosen = best.probe;
  const bestKey = best.key;
  const ahead = scan.probes.filter(
    (p) => !isFree(p) && compareKeys(rankKey(prep, series, p), bestKey) < 0,
  );
  const asRequested =
    prep.requested === null || prep.requested === chosen.room.id;
  const where = span(ctx.clock, chosen.day, chosen.start, chosen.end);
  const reason = asRequested
    ? `${chosen.room.id} is free ${where} and has ${needsOrAll(prep)}.`
    : `${requestedRoomPhrase(ctx, state, prep, scan)}. ${chosen.room.id} has ${needsOrAll(prep)} and is free inside your window, ${where}.`;
  record(
    state,
    prep,
    decisionOf(
      prep,
      "approved",
      slotOf(chosen),
      reason,
      asRequested ? "APPROVED_AS_REQUESTED" : "ROOM_SWAPPED_IN_WINDOW",
      blockedEntries(state, ahead),
    ),
    slotOf(chosen),
  );
  return true;
}

function placeAlternative(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  scan: Scan,
): boolean {
  const alt = findAlternative(ctx, state, prep);
  if (!alt) return false;
  const why = failurePhrase(ctx, state, prep, classify(scan));
  const reason = `${why}. Offered ${alt.room.id} ${span(ctx.clock, alt.day, alt.start, alt.end)} instead (outside your window).`;
  record(
    state,
    prep,
    decisionOf(
      prep,
      "alternative_offered",
      slotOf(alt),
      reason,
      "ALT_OUTSIDE_WINDOW",
      blockedEntries(state, scan.probes),
    ),
    slotOf(alt),
  );
  return true;
}

/**
 * The nearest free slot outside the windows: window days first (in window order), then the other
 * days in calendar order; within a day, closest to a window, then the in-window room ranking.
 */
function findAlternative(ctx: Ctx, state: State, prep: Prepared): Probe | null {
  const { req } = prep;
  const dur = req.duration_periods;
  if (!(dur >= 1 && dur <= MAX_PERIOD)) return null;
  const days: string[] = [];
  for (const w of req.windows) {
    if (ctx.instance.days.includes(w.day) && !days.includes(w.day)) {
      days.push(w.day);
    }
  }
  for (const day of ctx.instance.days) if (!days.includes(day)) days.push(day);
  const series = seriesRooms(ctx, state, prep);

  for (const day of days) {
    const sameDay = req.windows.filter((w) => w.day === day);
    const reference = sameDay.length > 0 ? sameDay : req.windows;
    let best: { probe: Probe; key: number[] } | null = null;
    for (let start = 1; start + dur - 1 <= MAX_PERIOD; start++) {
      const end = start + dur - 1;
      if (sameDay.some((w) => w.from_period <= start && end <= w.to_period)) {
        continue;
      }
      const distance = reference.reduce(
        (min, w) =>
          Math.min(min, Math.max(0, w.from_period - end, start - w.to_period)),
        reference.length > 0 ? Infinity : 0,
      );
      for (const { room, index } of prep.rooms) {
        const p = probe(ctx, state, prep, room, index, day, start, end, -1);
        if (!isFree(p)) continue;
        const [requested, inSeries, capacity] = rankKey(prep, series, p);
        const key = [distance, requested, inSeries, capacity, start, index];
        if (!best || compareKeys(key, best.key) < 0) best = { probe: p, key };
      }
    }
    if (best) return best.probe;
  }
  return null;
}

// ------------------------------------------------------------------------ displacement

/**
 * Institute-level requests whose window is blocked only by movable sessions: move each blocker
 * to its nearest valid Week-7 slot (same time in another room, then the same day, then other
 * days). Returns the new state, or null when no in-window slot can be cleared.
 */
function tryDisplace(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  scan: Scan,
  pending: readonly Prepared[],
): State | null {
  const notes = new Map<string, string>();
  ctx.moveNotes.set(prep.req.id, notes);
  const series = seriesRooms(ctx, state, prep);
  const candidates: { probe: Probe; blockers: string[]; key: number[] }[] = [];
  for (const p of scan.probes) {
    if (p.closed.length > 0) continue;
    if (p.holders.some((h) => h.holder.kind !== "session")) continue;
    const blockers: string[] = [];
    for (const h of p.holders) {
      if (!blockers.includes(h.holder.id)) blockers.push(h.holder.id);
    }
    let unexplained = false;
    for (const hit of p.groups) {
      if (hit.sessions.length === 0) unexplained = true;
      for (const sid of hit.sessions) {
        if (!blockers.includes(sid)) blockers.push(sid);
      }
    }
    if (unexplained || blockers.length > MAX_DISPLACED) continue;
    const stuck = blockers.some((sid) => {
      const s = ctx.instance.sessions.get(sid);
      if (!s) return true;
      if (s.basket_slot) {
        notes.set(
          sid,
          `it is in elective basket ${s.basket_slot}, which never moves`,
        );
        return true;
      }
      if (s.fixed_slot) {
        notes.set(sid, "it has a fixed slot");
        return true;
      }
      return false;
    });
    if (stuck) continue;
    const [requested, inSeries, ...rest] = rankKey(prep, series, p);
    candidates.push({
      probe: p,
      blockers,
      key: [requested, inSeries, blockers.length, ...rest],
    });
  }
  candidates.sort((a, b) => compareKeys(a.key, b.key));

  const footprints = pending
    .filter((q) => !q.staticReject && !state.decided.has(q.req.id))
    .map(footprintOf);
  let baseline: ReturnType<typeof gateOf> | null = null;
  for (const { probe: p, blockers } of candidates.slice(
    0,
    MAX_DISPLACEMENT_TRIES,
  )) {
    const next = displaceFor(ctx, state, prep, p, blockers, footprints, notes);
    if (!next) continue;
    baseline ??= gateOf(ctx, state);
    const after = gateOf(ctx, next);
    if (
      isSubset(after.violations, baseline.violations) &&
      isSubset(after.inversions, baseline.inversions)
    ) {
      return next;
    }
    for (const sid of blockers) {
      if (!notes.has(sid)) {
        notes.set(sid, "moving it would upset another booking");
      }
    }
  }
  return null;
}

function displaceFor(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  target: Probe,
  blockers: readonly string[],
  footprints: readonly Footprint[],
  notes: Map<string, string>,
): State | null {
  const work = cloneState(state);
  const slot = slotOf(target);
  hold(work, prep, slot);
  const moves: Displaced[] = [];
  for (const sid of blockers) {
    const from = assignmentOf(work, sid);
    const to = from && findTarget(ctx, work, sid, footprints);
    if (!from || !to) {
      if (!notes.has(sid)) notes.set(sid, "it has no other valid slot");
      return null;
    }
    const week = new Map(work.view.week);
    week.set(sid, {
      day: to.day,
      start_period: to.start_period,
      room_id: to.room_id,
    });
    work.view = viewOf(ctx.instance, week);
    work.overrides.set(sid, { ...to, displaced_by: prep.req.id });
    moves.push({ session_id: sid, from, to });
  }
  const recheck = probe(
    ctx,
    work,
    prep,
    target.room,
    target.roomIndex,
    slot.day,
    slot.start,
    slot.end,
    target.windowIndex,
  );
  if (!isFree(recheck)) return null;

  const what = capitalize(categoryLabel(prep.effective));
  const where = span(ctx.clock, slot.day, slot.start, slot.end);
  const movesText = listLabel(
    moves.map(({ session_id, to }) => {
      const dur = ctx.instance.sessions.get(session_id)?.duration ?? 1;
      return `${session_id} moves to ${to.day} ${periodsLabel(to.start_period, to.start_period + dur - 1)} in ${to.room_id}`;
    }),
  );
  const reason = `${what} in ${slot.room_id} ${where}. ${movesText} for ${ctx.clock.weekLabel} only (needs Admin approval).`;
  record(
    work,
    prep,
    decisionOf(
      prep,
      "approved",
      slot,
      reason,
      "APPROVED_WITH_DISPLACEMENT",
      blockedEntries(state, [target]),
      { displaced: moves },
    ),
    slot,
  );
  retryRejected(ctx, work);
  return work;
}

/** The session's current Week-7 placement as an `Assignment`, if it is well formed. */
function assignmentOf(state: State, sid: string): Assignment | null {
  const placement = state.view.week.get(sid);
  if (!placement) return null;
  const { day, start_period: start, room_id: room } = placement;
  if (typeof day !== "string" || !isPyInt(start) || typeof room !== "string") {
    return null;
  }
  return {
    session_id: sid,
    day: day as Day,
    start_period: start,
    room_id: room,
  };
}

/**
 * Nearest valid Week-7 slot for a session: cheap per-rule filters first, then the exact gate
 * (`checkAssignMap` must report nothing new). Same time in another room, then the same day by
 * distance, then other days; slots no pending request could use win ties.
 */
function findTarget(
  ctx: Ctx,
  state: State,
  sid: string,
  footprints: readonly Footprint[],
): Assignment | null {
  const { instance } = ctx;
  const s = instance.sessions.get(sid);
  const cur = state.view.week.get(sid);
  if (!s || !cur || !isPyInt(cur.start_period)) return null;
  const curStart = cur.start_period;
  const dur = s.duration;
  const maxHours = instance.faculty.get(s.faculty_id)?.max_hours_per_day ?? 4;
  const lunch = instance.lunch_after_period;
  const { view } = state;
  const othersAt = (map: ReadonlyMap<string, readonly string[]>, key: string) =>
    (map.get(key) ?? []).some((x) => x !== sid);

  const options: { to: Assignment; key: number[] }[] = [];
  instance.days.forEach((day, dayIndex) => {
    const hours =
      (view.facultyHours.get(tupleKey(s.faculty_id, day)) ?? 0) -
      (day === cur.day ? dur : 0);
    if (hours + dur > maxHours) return;
    for (let start = 1; start + dur - 1 <= LAST_TEACHING_PERIOD; start++) {
      const end = start + dur - 1;
      if (start <= lunch && lunch < end) continue;
      if (s.kind === "lab" && !instance.lab_start_periods.has(start)) continue;
      let peopleFree = true;
      for (let p = start; p <= end && peopleFree; p++) {
        if (
          isFacultyUnavailable(instance, s.faculty_id, day, p) ||
          othersAt(view.facultyCells, tupleKey(s.faculty_id, day, p))
        ) {
          peopleFree = false;
        }
        for (const g of s.groups) {
          const key = tupleKey(g, day, p);
          if (
            othersAt(view.groupCells, key) ||
            state.bookingGroupCells.has(key)
          ) {
            peopleFree = false;
          }
        }
      }
      if (!peopleFree) continue;
      const tier = day === cur.day ? (start === curStart ? 0 : 1) : 2;
      let roomIndex = -1;
      for (const room of instance.rooms.values()) {
        roomIndex++;
        if (tier === 0 && room.id === cur.room_id) continue;
        if (
          !s.room_types.includes(room.type) ||
          room.capacity < s.size ||
          (s.needs_accessible && !room.accessible)
        ) {
          continue;
        }
        let roomFree = true;
        for (let p = start; p <= end && roomFree; p++) {
          const cell = tupleKey(room.id, day, p);
          if (
            othersAt(view.roomCells, cell) ||
            state.bookingCells.has(cell) ||
            isRoomUnavailable(instance, room.id, day, p)
          ) {
            roomFree = false;
          }
        }
        if (!roomFree) continue;
        const touches = footprints.some((f) =>
          touchesFootprint(f, day, start, end, room.id, s.groups),
        );
        options.push({
          to: {
            session_id: sid,
            day: day as Day,
            start_period: start,
            room_id: room.id,
          },
          key: [
            tier,
            touches ? 1 : 0,
            tier === 2 ? dayIndex : 0,
            Math.abs(start - curStart),
            start,
            room.id === cur.room_id ? 0 : 1,
            room.capacity,
            roomIndex,
          ],
        });
      }
    }
  });
  options.sort((a, b) => compareKeys(a.key, b.key));
  for (const { to } of options) {
    const trial = new Map(view.week);
    trial.set(sid, {
      day: to.day,
      start_period: to.start_period,
      room_id: to.room_id,
    });
    const { violations } = checkAssignMap(instance, trial, "fest_week");
    if (violations.every((v) => view.violationKeys.has(violationKey(v)))) {
      return to;
    }
  }
  return null;
}

function footprintOf(prep: Prepared): Footprint {
  return {
    windows: prep.req.windows.map((w) => ({
      day: w.day,
      from: Math.max(1, w.from_period),
      to: Math.min(w.to_period, MAX_PERIOD),
    })),
    rooms: new Set(prep.rooms.map(({ room }) => room.id)),
    groups: new Set(prep.mandatory),
  };
}

function touchesFootprint(
  f: Footprint,
  day: string,
  start: number,
  end: number,
  roomId: string,
  groups: readonly string[],
): boolean {
  return (
    f.windows.some((w) => w.day === day && w.from <= end && start <= w.to) &&
    (f.rooms.has(roomId) || groups.some((g) => f.groups.has(g)))
  );
}

/** Violations and inversions the validator would report for the decisions made so far. */
function gateOf(ctx: Ctx, state: State) {
  const check = checkBookings(ctx.instance, ctx.baseAssign, {
    bookings: [...state.decided.values()],
    session_overrides: [...state.overrides.values()],
  });
  return {
    violations: new Set(check.violations.map(violationKey)),
    inversions: new Set(check.stats.priority_inversions),
  };
}

// -------------------------------------------------------------------------- explaining

function decisionOf(
  prep: Prepared,
  status: BookingDecision["status"],
  slot: Slot | null,
  reason: string,
  code: ReasonCode,
  blocked: BlockedBy[] = [],
  extra: {
    displaced?: Displaced[];
    cancelled?: NonNullable<BookingFacts["cancelled"]>;
  } = {},
): EngineBookingDecision {
  const { facts } = prep;
  const displaced = extra.displaced ?? [];
  return {
    request_id: prep.req.id,
    status,
    ...(slot
      ? {
          day: slot.day as Day,
          start_period: slot.start,
          end_period: slot.end,
          room_id: slot.room_id,
        }
      : {}),
    reason,
    reason_code: code,
    effective_category: prep.effective,
    category_capped: prep.capped,
    requires_admin_approval: displaced.length > 0,
    facts: {
      ...facts,
      requested_room_missing: [...facts.requested_room_missing],
      candidate_rooms: [...facts.candidate_rooms],
      largest_room: facts.largest_room ? { ...facts.largest_room } : null,
      blocked_by: blocked,
      displaced,
      ...(extra.cancelled ? { cancelled: extra.cancelled } : {}),
    },
  };
}

function cancelledDecision(
  instance: Instance,
  prep: Prepared,
): EngineBookingDecision {
  const entry = (instance.dataset.cancellations ?? []).find(
    (c) => c.request_id === prep.req.id,
  );
  const cancelled = {
    by: entry?.by ?? "",
    at: entry?.cancelled_at ?? "",
    note: entry?.note ?? "",
  };
  return decisionOf(
    prep,
    "rejected",
    null,
    cancelledReason(cancelled.by, cancelled.at, cancelled.note),
    "REJ_CANCELLED",
    [],
    { cancelled },
  );
}

function rejection(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  scan: Scan,
): EngineBookingDecision {
  const failure = classify(scan);
  const phrase = failurePhrase(ctx, state, prep, failure);
  const [code, reason]: [ReasonCode, string] =
    failure.kind === "invalid"
      ? ["REJ_INVALID_TIME", `${phrase}, and no alternative is free.`]
      : failure.kind === "group"
        ? ["REJ_MANDATORY_GROUP_BUSY", `${phrase}, and no other time works.`]
        : ["REJ_OUTRANKED", `${phrase}, and no other slot fits.`];
  return decisionOf(
    prep,
    "rejected",
    null,
    reason,
    code,
    blockedEntries(state, scan.probes),
  );
}

/**
 * Why no in-window slot worked: no legal start at all, a compulsory group busy at every start,
 * or else the holder that blocks the most slots (a booking or a session).
 */
function classify(scan: Scan): Failure {
  if (scan.legalStarts === 0 || scan.probes.length === 0) {
    return { kind: "invalid" };
  }
  // Group checks do not depend on the room, so one probe per start is enough.
  const starts = new Map<string, Probe>();
  for (const p of scan.probes) {
    const key = tupleKey(p.day, p.start);
    if (!starts.has(key)) starts.set(key, p);
  }
  if ([...starts.values()].every((p) => p.groups.length > 0)) {
    const counts = new Map<
      string,
      { n: number; failure: Extract<Failure, { kind: "group" }> }
    >();
    for (const p of starts.values()) {
      const seen = new Set<string>();
      for (const hit of p.groups) {
        const sessions = hit.sessions.length > 0 ? hit.sessions : [null];
        for (const session of sessions) {
          const key = tupleKey(hit.group, session);
          if (seen.has(key)) continue;
          seen.add(key);
          const entry = counts.get(key);
          if (entry) entry.n++;
          else {
            counts.set(key, {
              n: 1,
              failure: {
                kind: "group",
                group: hit.group,
                session,
                day: p.day,
                period: hit.period,
              },
            });
          }
        }
      }
    }
    return mostFrequent(counts.values()).failure;
  }
  const open = scan.probes.filter((p) => p.groups.length === 0);
  const holder = topHolder(open);
  if (holder) {
    const p = open.find((x) =>
      x.holders.some((h) => sameHolder(h.holder, holder)),
    )!;
    return { kind: "holder", holder, probe: p };
  }
  return {
    kind: "closed",
    probe: open.find((p) => p.closed.length > 0) ?? open[0],
  };
}

function failurePhrase(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  failure: Failure,
): string {
  const { clock } = ctx;
  switch (failure.kind) {
    case "invalid":
      return invalidPhrase(ctx, prep);
    case "group": {
      const held = failure.session
        ? sessionSlot(ctx, state, failure.session)
        : null;
      return held
        ? `Compulsory for ${failure.group}, who have ${failure.session} at ${span(clock, held.day, held.start, held.end)}`
        : `Compulsory for ${failure.group}, who have class ${span(clock, failure.day, failure.period, failure.period)}`;
    }
    case "holder": {
      const { holder, probe: p } = failure;
      const held =
        (holder.kind === "booking"
          ? state.slots.get(holder.id)
          : sessionSlot(ctx, state, holder.id)) ?? slotOf(p);
      return `${held.room_id} ${span(clock, held.day, held.start, held.end)} goes to ${holderPhrase(ctx, prep, holder)}`;
    }
    case "closed": {
      const { probe: p } = failure;
      const periods = p.closed.length > 0 ? p.closed : [p.start, p.end];
      return `${p.room.id} is closed ${span(clock, p.day, Math.min(...periods), Math.max(...periods))}`;
    }
  }
}

/** Why a request has no legal in-window start (BR-17 asks for P13–P14). */
function invalidPhrase(ctx: Ctx, prep: Prepared): string {
  const { opens, closes } = ctx.clock;
  const w = prep.req.windows[0];
  if (!w) return "The request has no time window";
  if (!ctx.instance.days.includes(w.day)) {
    return `${w.day} is not a working day this week`;
  }
  const label = `${w.day} ${periodsLabel(w.from_period, w.to_period)}`;
  if (w.to_period > MAX_PERIOD || w.from_period < 1) {
    return `${label} is outside ${opens}–${closes}; events end at ${closes} (P${MAX_PERIOD})`;
  }
  return `${label} is shorter than the ${prep.req.duration_periods} periods you asked for`;
}

/** Why the requested room was not used (for `ROOM_SWAPPED_IN_WINDOW`). */
function requestedRoomPhrase(
  ctx: Ctx,
  state: State,
  prep: Prepared,
  scan: Scan,
): string {
  const requested = prep.requested ?? "";
  const room = ctx.instance.rooms.get(requested);
  if (!room) {
    const { room_suggestion: suggestion, requested_room_missing: missing } =
      prep.facts;
    if (!suggestion) return `${requested} doesn't exist`;
    const lacks =
      missing.length > 0 ? `, which lacks ${needsLabel(missing)}` : "";
    return `${requested} doesn't exist (closest: ${suggestion}${lacks})`;
  }
  if (!prep.rooms.some((r) => r.room.id === requested)) {
    if (!prep.req.room_types.includes(room.type)) {
      return `${requested} is the wrong room type (${roomTypeLabel(room.type)})`;
    }
    if (!room.allowed_uses.includes("event")) {
      return `${requested} can't host events`;
    }
    if (room.capacity < prep.req.attendance) {
      return `${requested} seats only ${formatCount(room.capacity)}`;
    }
    return `${requested} lacks ${needsLabel(missingNeeds(prep.req, room))}`;
  }
  const mine = scan.probes.filter((p) => p.room.id === requested);
  const open = mine.filter((p) => p.groups.length === 0);
  const holder = topHolder(open.length > 0 ? open : mine);
  if (holder)
    return `${requested} is held by ${holderPhrase(ctx, prep, holder)}`;
  if (mine.some((p) => p.closed.length > 0))
    return `${requested} is closed then`;
  return `${requested} is busy`;
}

/** "BR-06 (club event, submitted earlier)" or "EC301-L1 (regular session outranks club event)". */
function holderPhrase(ctx: Ctx, prep: Prepared, holder: Holder): string {
  const order = ctx.rules.priority_order;
  if (holder.kind === "booking") {
    const other = ctx.prepared.get(holder.id);
    if (!other) return holder.id;
    const earlier = other.req.submitted_at < prep.req.submitted_at;
    return `${holder.id} (${rankPhrase(order, other.effective, prep.effective, earlier)})`;
  }
  let note = "";
  if (!prep.eligible) note = "; only institute events can move classes";
  else if (!prep.canDisplace) note = "; moving classes is switched off";
  else {
    const why = ctx.moveNotes.get(prep.req.id)?.get(holder.id);
    if (why) note = `; ${why}`;
  }
  return `${holder.id} (${rankPhrase(order, REGULAR, prep.effective, false)}${note})`;
}

function rankPhrase(
  order: readonly Category[],
  holder: Category,
  own: Category,
  earlier: boolean,
): string {
  const h = order.indexOf(holder);
  const o = order.indexOf(own);
  if (h !== -1 && (o === -1 || h < o)) {
    return `${categoryLabel(holder)} outranks ${categoryLabel(own)}`;
  }
  if (h === o) {
    return `${categoryLabel(holder)}, ${earlier ? "submitted earlier" : "same priority"}`;
  }
  return categoryLabel(holder);
}

function needsOrAll(prep: Prepared): string {
  const needs = unique(prep.req.needs);
  return needs.length > 0 ? needsLabel(needs) : "everything you asked for";
}

/** Where a session sits in the current week. */
function sessionSlot(ctx: Ctx, state: State, sid: string): Slot | null {
  const a = assignmentOf(state, sid);
  const s = ctx.instance.sessions.get(sid);
  if (!a || !s) return null;
  return {
    room_id: a.room_id,
    day: a.day,
    start: a.start_period,
    end: a.start_period + s.duration - 1,
  };
}

/** The probes' blockers, merged per (kind, id, room, day). */
function blockedEntries(state: State, probes: readonly Probe[]): BlockedBy[] {
  const merged = new Map<
    string,
    {
      kind: BlockedBy["kind"];
      id: string;
      room?: string;
      day: string;
      periods: Set<number>;
    }
  >();
  const add = (
    kind: BlockedBy["kind"],
    id: string,
    room: string | undefined,
    day: string,
    periods: readonly number[],
  ) => {
    const key = tupleKey(kind, id, room ?? null, day);
    let entry = merged.get(key);
    if (!entry) {
      merged.set(key, (entry = { kind, id, room, day, periods: new Set() }));
    }
    for (const p of periods) entry.periods.add(p);
  };
  for (const p of probes) {
    for (const { holder, periods } of p.holders) {
      add(holder.kind, holder.id, p.room.id, p.day, periods);
    }
    if (p.closed.length > 0) {
      add("unavailable", p.room.id, p.room.id, p.day, p.closed);
    }
    for (const hit of p.groups) {
      add("group", hit.group, undefined, p.day, [hit.period]);
      for (const sid of hit.sessions) {
        const room = state.view.week.get(sid)?.room_id;
        add(
          "session",
          sid,
          typeof room === "string" ? room : undefined,
          p.day,
          [hit.period],
        );
      }
    }
  }
  return [...merged.values()].map(({ kind, id, room, day, periods }) => ({
    kind,
    id,
    ...(room !== undefined ? { room_id: room } : {}),
    day,
    periods: [...periods].sort((a, b) => a - b),
  }));
}

/** The holder blocking the most probes (first seen wins ties). */
function topHolder(probes: readonly Probe[]): Holder | null {
  const counts = new Map<string, { n: number; holder: Holder }>();
  for (const p of probes) {
    for (const { holder } of p.holders) {
      const key = tupleKey(holder.kind, holder.id);
      const entry = counts.get(key);
      if (entry) entry.n++;
      else counts.set(key, { n: 1, holder });
    }
  }
  return counts.size > 0 ? mostFrequent(counts.values()).holder : null;
}

// ------------------------------------------------------------------------------ helpers

function mostFrequent<T extends { n: number }>(entries: Iterable<T>): T {
  let best: T | undefined;
  for (const entry of entries) if (!best || entry.n > best.n) best = entry;
  return best!;
}

function sameHolder(a: Holder, b: Holder): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function samePlacement(
  base: Placement | undefined,
  o: SessionOverride,
): boolean {
  return (
    base !== undefined &&
    base.day === o.day &&
    base.start_period === o.start_period &&
    base.room_id === o.room_id
  );
}

function violationKey(v: Violation): string {
  return `${v.rule}\u0000${v.detail}`;
}

function isSubset(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
