/**
 * Minimal-move repair over a `TimetableState` (backend.md §3.5). The baseline is kept wherever it
 * still holds; every session whose old slot breaks a hard rule after the changes, plus added and
 * pinned sessions, is re-placed with the fewest extra moves: a room-only move at the old slot,
 * another free start, or an ejection chain that moves blockers (never fixed or pinned sessions,
 * never a session this chain already placed) up to a fixed depth. Moves are counted per session,
 * like the validator's stability report, so a basket slot that changes time moves every member.
 *
 * Deterministic: options are enumerated in a fixed order, ties are broken by that order, the
 * search budget is counted in nodes, and the wall-clock cap only ever cuts a search short.
 * Internal to the engine; `reschedule.ts` turns an outcome into the public result.
 */
import type { Assignment, Dataset } from "@/lib/contracts";

import { block } from "./checker";
import {
  placementContradictions,
  roomRuleBroken,
  unitContradictions,
  unitOf,
  type Unit,
} from "./conflicts";
import {
  DEFAULT_FEST_WEIGHT,
  deriveFestDemands,
  festDemandGroups,
} from "./fest";
import {
  buildInstance,
  isFacultyUnavailable,
  isRoomUnavailable,
  isTeachingDay,
  type Instance,
} from "./instance";
import {
  BLOCKED,
  FREE,
  buildModel,
  dayOfSlot,
  slotOf,
  TimetableState,
  type Model,
  type ModelMember,
  type StateSnapshot,
} from "./model";
import { isPyInt } from "./py";
import { reservedRooms } from "./solver-search";
import { LAST_TEACHING_PERIOD } from "./types";

/** Why a session ended up where it is (see `MoveCause`); `kept` = never touched. */
export type MemberCause = "kept" | "broken" | "added" | "requested" | "evicted";

export type PinRequest = Readonly<{
  session_id: string;
  day: string;
  start_period: number;
  room_id: string;
}>;

/** A placement that can't hold, with the reason. */
export type PinIssue = { session_id: string; contradiction: string };

export type SearchLimits = {
  maxDepth: number;
  maxNodes: number;
  /** Absolute clock value after which the search stops deepening. */
  deadline: number;
  clock: () => number;
};

export type StopReason = "complete" | "nodes" | "time";

export type RepairOutcome = {
  snapshot: StateSnapshot;
  /** Per model member (dataset session order). */
  causes: MemberCause[];
  /** Per member: hard rules its baseline slot breaks after the change (`broken` only). */
  rules: string[][];
  /** Per member: the session whose placement displaced it (`evicted` only). */
  displacedBy: (string | null)[];
  /** Per member: the pinned session that moved it (basket siblings of a pin). */
  pinnedWith: (string | null)[];
  /** Units left unplaced, ascending. */
  unplaced: number[];
  /** Units pinned and placed as requested. */
  pinnedUnits: number[];
  pinIssues: PinIssue[];
  depth: number;
  nodes: number;
  stoppedBy: StopReason;
};

type Op = {
  remove: boolean;
  unit: number;
  slot: number;
  rooms: Int32Array;
  /** The unit whose placement caused this op (-1 at the top). */
  by: number;
  /** Chain level: 0 for the unit being repaired, 1 for its blockers, … */
  level: number;
};

type Plan = { moves: number; time: number; obj: number; ops: Op[] };

/** The pins of one unit (a basket's members share its time). */
type PinEntry = {
  first: string;
  day: string;
  start: number;
  /** Member position → requested room id. */
  rooms: Map<number, string>;
  issues: string[];
};

const EPS = 1e-9;
/** Rooms tried per start when a placement needs evictions (single-session units). */
const EJECT_ROOMS = 3;
/** One repaired unit may use at most this share of the node budget. */
const UNIT_BUDGET_SHARE = 0.25;
/** The clock is read every this many nodes. */
const CLOCK_EVERY = 256;

/** H-rule priority used to pick the reason shown for a broken session. */
export const BROKEN_RULE_ORDER = [
  "H8",
  "H7",
  "H5",
  "H6",
  "H10",
  "H14",
  "H9",
  "H1",
  "H11",
  "H4",
  "H2",
  "H3",
  "H12",
];

const byRuleOrder = (a: string, b: string) =>
  BROKEN_RULE_ORDER.indexOf(a) - BROKEN_RULE_ORDER.indexOf(b);

/**
 * Model, state and baseline arrays for one changed dataset, built once and reused across runs
 * (each `run` starts from an empty timetable).
 */
export class RepairContext {
  readonly instance: Instance;
  readonly model: Model;
  readonly state: TimetableState;
  /** Session id → model member index. */
  readonly memberIndex: ReadonlyMap<string, number>;
  /** Per member: the baseline lists the session. */
  readonly hasBase: Uint8Array;
  /** Per member: baseline slot, or -1 when its day or start is not a valid teaching slot. */
  readonly baseSlot: Int32Array;
  /** Per member: baseline room, or -1 when unknown. */
  readonly baseRoom: Int32Array;
  /** Per member: the baseline room passes H5, H6 and H10 for the session. */
  readonly baseRoomSuits: Uint8Array;
  /**
   * `[room * slotCount + slot]`: the unit whose baseline holds that room cell, or -1. Pins are
   * placed before the baseline is seeded, so their rooms steer clear of these cells.
   */
  readonly baseRoomOcc: Int32Array;
  /** Session id → the raw baseline entry (last one wins, like the validator). */
  readonly baseline: ReadonlyMap<string, Assignment>;
  private readonly units: Unit[];

  constructor(dataset: Dataset, baseline: readonly Assignment[]) {
    const instance = buildInstance(dataset);
    this.instance = instance;
    const demands = deriveFestDemands(instance, {
      weightPerPoint: DEFAULT_FEST_WEIGHT,
    });
    this.model = buildModel(instance, {
      reservedRooms: reservedRooms(demands),
    });
    this.state = new TimetableState(this.model, {
      demands,
      groups: demands.map((d) => festDemandGroups(instance, d.request_id)),
      weightPerPoint: DEFAULT_FEST_WEIGHT,
    });
    const { model } = this;
    const n = model.members.length;
    const base = new Map<string, Assignment>();
    for (const entry of baseline) base.set(entry.session_id, entry);
    this.baseline = base;
    this.memberIndex = new Map(
      model.members.map((m) => [m.session.id, m.index]),
    );
    this.hasBase = new Uint8Array(n);
    this.baseSlot = new Int32Array(n).fill(-1);
    this.baseRoom = new Int32Array(n).fill(-1);
    this.baseRoomSuits = new Uint8Array(n);
    for (const m of model.members) {
      const entry = base.get(m.session.id);
      if (!entry) continue;
      this.hasBase[m.index] = 1;
      const d = model.days.indexOf(entry.day);
      const p = entry.start_period;
      if (d !== -1 && isPyInt(p) && p >= 1 && p <= LAST_TEACHING_PERIOD) {
        this.baseSlot[m.index] = slotOf(d, p);
      }
      const r = model.roomIndex.get(entry.room_id);
      if (r !== undefined) {
        this.baseRoom[m.index] = r;
        if (!roomRuleBroken(model.rooms[r], m.session)) {
          this.baseRoomSuits[m.index] = 1;
        }
      }
    }
    this.baseRoomOcc = new Int32Array(
      model.rooms.length * model.slotCount,
    ).fill(-1);
    for (const m of model.members) {
      const slot = this.baseSlot[m.index];
      const r = this.baseRoom[m.index];
      if (
        slot < 0 ||
        r < 0 ||
        dayOfSlot(slot + m.duration - 1) !== dayOfSlot(slot)
      )
        continue;
      for (let k = 0; k < m.duration; k++) {
        this.baseRoomOcc[r * model.slotCount + slot + k] = m.unit;
      }
    }
    this.units = model.units.map(
      (u) => unitOf(instance, u.members[0].session.id) as Unit,
    );
  }

  /** The `conflicts.ts` view of a model unit. */
  unitView(u: number): Unit {
    return this.units[u];
  }

  /** Moved and time-changed members of unit `u` if placed at `slot` in `rooms`. */
  movesAt(u: number, slot: number, rooms: ArrayLike<number>): [number, number] {
    const members = this.model.units[u].members;
    let moved = 0;
    let time = 0;
    for (let i = 0; i < members.length; i++) {
      const m = members[i].index;
      if (!this.hasBase[m]) continue;
      if (slot !== this.baseSlot[m]) {
        moved++;
        time++;
      } else if (rooms[i] !== this.baseRoom[m]) {
        moved++;
      }
    }
    return [moved, time];
  }

  /** Repairs the baseline for these pins. The state holds the result afterwards. */
  run(pins: readonly PinRequest[], limits: SearchLimits): RepairOutcome {
    return new RepairRun(this, limits).run(pins);
  }
}

/** One repair from an empty timetable. */
class RepairRun {
  private readonly ctx: RepairContext;
  private readonly model: Model;
  private readonly state: TimetableState;
  private readonly instance: Instance;
  private readonly limits: SearchLimits;
  private readonly causes: MemberCause[];
  private readonly rules: string[][];
  private readonly displacedBy: (string | null)[];
  private readonly pinnedWith: (string | null)[];
  /** Units that may never be evicted: pinned and fixed ones. */
  private readonly locked: Uint8Array;
  private readonly pinned: Uint8Array;
  /** Units placed by the plan being searched (they may not be evicted again in it). */
  private readonly inChain: Int32Array;
  private readonly pinIssues: PinIssue[] = [];
  private readonly log: Op[] = [];
  private moved = 0;
  private timeMoved = 0;
  nodes = 0;
  private unitNodesStart = 0;
  private unitNodeCap = Number.POSITIVE_INFINITY;
  private stoppedBy: StopReason = "complete";
  private exhaustedFlag = false;
  private nextClock = 0;
  private depthUsed = 0;
  private readonly buf: number[] = [];
  private readonly scratch: Int32Array;

  constructor(ctx: RepairContext, limits: SearchLimits) {
    this.ctx = ctx;
    this.model = ctx.model;
    this.state = ctx.state;
    this.instance = ctx.instance;
    this.limits = limits;
    const n = this.model.members.length;
    const units = this.model.units.length;
    this.causes = new Array<MemberCause>(n).fill("kept");
    this.rules = Array.from({ length: n }, () => []);
    this.displacedBy = new Array<string | null>(n).fill(null);
    this.pinnedWith = new Array<string | null>(n).fill(null);
    this.locked = new Uint8Array(units);
    this.pinned = new Uint8Array(units);
    this.inChain = new Int32Array(units);
    let width = 1;
    for (const u of this.model.units) width = Math.max(width, u.members.length);
    this.scratch = new Int32Array(width);
  }

  run(pins: readonly PinRequest[]): RepairOutcome {
    const { model, state } = this;
    state.clear();
    for (const u of model.units) if (u.fixed) this.locked[u.index] = 1;

    const queue: number[] = [];
    const lbOwn = new Int32Array(model.units.length);
    const pinDisplaced = new Uint8Array(model.units.length);
    const seeded = new Uint8Array(model.units.length);
    const seedInto = (u: number) => {
      seeded[u] = 1;
      const verdict = this.seed(u);
      if (verdict === "kept") return;
      queue.push(u);
      lbOwn[u] = verdict.lb;
      if (verdict.pinDisplaced) pinDisplaced[u] = 1;
    };

    // Fixed units keep their baseline before any pin goes in, so no pin can displace one.
    const entries = this.resolvePins(pins);
    for (const u of model.units) {
      if (u.fixed && !entries.has(u.index)) seedInto(u.index);
    }
    for (const [u, entry] of entries) this.placePin(u, entry);

    // Keep every other baseline unit that still holds: fixed units first, then dataset order.
    const seedOrder = model.units
      .map((u) => u.index)
      .sort(
        (a, b) =>
          Number(model.units[b].fixed) - Number(model.units[a].fixed) || a - b,
      );
    for (const u of seedOrder) {
      if (!this.pinned[u] && !seeded[u]) seedInto(u);
    }

    // Broken baseline units (most constrained first), then sessions the baseline doesn't have.
    const hasAnyBase = (u: number) =>
      model.units[u].members.some((m) => this.ctx.hasBase[m.index]);
    queue.sort((a, b) => {
      const ua = model.units[a];
      const ub = model.units[b];
      return (
        Number(hasAnyBase(b)) - Number(hasAnyBase(a)) ||
        Number(ub.fixed) - Number(ua.fixed) ||
        ua.options - ub.options ||
        a - b
      );
    });
    for (const u of queue) {
      if (state.isPlaced(u) || model.units[u].starts.length === 0) continue;
      this.unitNodesStart = this.nodes;
      this.unitNodeCap = Math.max(
        1000,
        Math.floor(this.limits.maxNodes * UNIT_BUDGET_SHARE),
      );
      const plan = this.placeTop(u, lbOwn[u]);
      if (plan) this.commit(plan, pinDisplaced[u] ? 1 : 0);
    }

    const unplaced: number[] = [];
    for (const u of model.units)
      if (!state.isPlaced(u.index)) unplaced.push(u.index);
    const pinnedUnits: number[] = [];
    for (let u = 0; u < this.pinned.length; u++)
      if (this.pinned[u]) pinnedUnits.push(u);
    return {
      snapshot: state.snapshot(),
      causes: this.causes,
      rules: this.rules,
      displacedBy: this.displacedBy,
      pinnedWith: this.pinnedWith,
      unplaced,
      pinnedUnits,
      pinIssues: this.pinIssues,
      depth: this.depthUsed,
      nodes: this.nodes,
      stoppedBy: this.stoppedBy,
    };
  }

  // ------------------------------------------------------------------------------- pins

  /** Groups pins by unit (a basket's pins share one entry); unknown sessions are reported. */
  private resolvePins(pins: readonly PinRequest[]): Map<number, PinEntry> {
    const { model, ctx } = this;
    const byUnit = new Map<number, PinEntry>();
    for (const pin of pins) {
      const m = ctx.memberIndex.get(pin.session_id);
      if (m === undefined) {
        this.pinIssues.push({
          session_id: pin.session_id,
          contradiction: `${pin.session_id} isn't in the timetable after the changes`,
        });
        continue;
      }
      const member = model.members[m];
      const u = member.unit;
      const pos = model.units[u].members.indexOf(member);
      let entry = byUnit.get(u);
      if (!entry) {
        entry = {
          first: pin.session_id,
          day: pin.day,
          start: pin.start_period,
          rooms: new Map(),
          issues: [],
        };
        byUnit.set(u, entry);
      } else if (entry.day !== pin.day || entry.start !== pin.start_period) {
        entry.issues.push(
          `${entry.first} and ${pin.session_id} share basket ${model.units[u].basket} but are placed at different times`,
        );
      }
      const before = entry.rooms.get(pos);
      if (before !== undefined && before !== pin.room_id) {
        entry.issues.push(`${pin.session_id} is placed twice`);
      }
      entry.rooms.set(pos, pin.room_id);
    }
    return byUnit;
  }

  /**
   * Places one pinned unit, after the fixed units and before the rest of the baseline. A pin that
   * can't hold (a contradiction, or a clash with a fixed session or another pin) is reported and
   * its unit is left to the repair like any other.
   */
  private placePin(u: number, entry: PinEntry): void {
    const { model, state, ctx } = this;
    const unit = model.units[u];
    const view = ctx.unitView(u);
    const issues = [
      ...entry.issues,
      ...placementContradictions(
        this.instance,
        view,
        entry.day,
        entry.start,
        entry.rooms,
      ),
    ];
    if (issues.length === 0 && unit.starts.length === 0) {
      const why = unitContradictions(this.instance, view, model.issues);
      issues.push(
        ...(why.length > 0 ? why : [`${entry.first} can't be placed anywhere`]),
      );
    }
    const report = (texts: readonly string[]) => {
      for (const text of texts) {
        this.pinIssues.push({ session_id: entry.first, contradiction: text });
      }
    };
    if (issues.length > 0) {
      report(issues);
      return;
    }
    const slot = slotOf(model.days.indexOf(entry.day), entry.start);
    const rooms = new Int32Array(unit.members.length).fill(-1);
    for (const [pos, roomId] of entry.rooms) {
      rooms[pos] = model.roomIndex.get(roomId) as number;
    }
    // The other members keep clear of rooms the baseline holds then, if they can.
    const asked = Int32Array.from(rooms);
    if (!this.fillRooms(u, slot, rooms, true, true)) rooms.set(asked);
    if (!this.fillRooms(u, slot, rooms)) {
      report([
        `no free room is left for the rest of basket ${unit.basket} at ${entry.day} P${entry.start}`,
      ]);
      return;
    }
    if (!state.canPlace(u, slot, rooms)) {
      state.conflicts(u, slot, rooms, this.buf);
      const label = `${entry.day} P${entry.start}`;
      const idsOf = (list: number[]) =>
        list.map((v) => model.units[v].members[0].session.id).join(", ");
      const fixed = this.buf.filter((v) => model.units[v].fixed);
      const pinnedOthers = this.buf.filter((v) => !model.units[v].fixed);
      report([
        fixed.length > 0
          ? `the placement of ${entry.first} at ${label} collides with fixed session ${idsOf(fixed)}`
          : pinnedOthers.length > 0
            ? `the placement of ${entry.first} at ${label} clashes with the placement of ${idsOf(pinnedOthers)}`
            : `the placement of ${entry.first} at ${label} breaks a hard rule with the fixed and placed sessions`,
      ]);
      return;
    }
    state.place(u, slot, rooms);
    this.pinned[u] = 1;
    this.locked[u] = 1;
    for (let i = 0; i < unit.members.length; i++) {
      const m = unit.members[i].index;
      this.causes[m] = "requested";
      if (!entry.rooms.has(i)) this.pinnedWith[m] = entry.first;
    }
  }

  /**
   * Rooms for the members of `rooms` still set to -1, all distinct: first every member's baseline
   * room that suits it and is open and free at `slot` (at its baseline slot only, unless
   * `anySlot`), then the first free room in preference order for the rest. False when a member
   * has none.
   */
  private fillRooms(
    u: number,
    slot: number,
    rooms: Int32Array,
    anySlot = true,
    avoidBaseline = false,
  ): boolean {
    const { ctx } = this;
    const unit = this.model.units[u];
    const ok = (r: number, duration: number) =>
      this.roomFree(r, slot, duration, rooms) &&
      (!avoidBaseline || this.baselineClear(u, r, slot, duration));
    for (let i = 0; i < unit.members.length; i++) {
      if (rooms[i] !== -1) continue;
      const m = unit.members[i];
      const br = ctx.baseRoom[m.index];
      if (
        br !== -1 &&
        ctx.baseRoomSuits[m.index] &&
        (anySlot || slot === ctx.baseSlot[m.index]) &&
        ok(br, m.duration)
      ) {
        rooms[i] = br;
      }
    }
    for (let oi = 0; oi < unit.roomOrder.length; oi++) {
      const i = unit.roomOrder[oi];
      if (rooms[i] !== -1) continue;
      const m = unit.members[i];
      let pick = -1;
      for (let k = 0; k < m.rooms.length && pick === -1; k++) {
        if (ok(m.rooms[k], m.duration)) pick = m.rooms[k];
      }
      if (pick === -1) return false;
      rooms[i] = pick;
    }
    return true;
  }

  /** True when no other unit's baseline holds room `r` during this block. */
  private baselineClear(
    u: number,
    r: number,
    slot: number,
    duration: number,
  ): boolean {
    const base = r * this.model.slotCount + slot;
    for (let k = 0; k < duration; k++) {
      const v = this.ctx.baseRoomOcc[base + k];
      if (v !== -1 && v !== u) return false;
    }
    return true;
  }

  /** True when room `r` is open and free for a member's block and not already in `taken`. */
  private roomFree(
    r: number,
    slot: number,
    duration: number,
    taken: ArrayLike<number>,
  ): boolean {
    for (let j = 0; j < taken.length; j++) if (taken[j] === r) return false;
    const base = r * this.model.slotCount + slot;
    for (let k = 0; k < duration; k++) {
      if (this.state.roomOcc[base + k] !== FREE) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------------------- seeding

  /** Hard rules a member's baseline slot breaks on its own under the changed dataset. */
  private unaryRules(m: ModelMember): string[] {
    const { instance } = this;
    const s = m.session;
    const entry = this.ctx.baseline.get(s.id) as Assignment;
    const out: string[] = [];
    if (!isTeachingDay(instance, entry.day)) return ["H1"];
    const start = entry.start_period;
    if (
      !isPyInt(start) ||
      start < 1 ||
      start + s.duration - 1 > LAST_TEACHING_PERIOD
    ) {
      return ["H9"];
    }
    const room = instance.rooms.get(entry.room_id);
    if (!room) out.push("H1");
    const per = block(start, s.duration);
    const lunch = instance.lunch_after_period;
    if (per[0] <= lunch && lunch < per[per.length - 1]) out.push("H9");
    if (s.kind === "lab" && !instance.lab_start_periods.has(start))
      out.push("H9");
    const fx = s.fixed_slot;
    if (fx && (fx.day !== entry.day || fx.start_period !== start))
      out.push("H14");
    if (
      per.some((p) =>
        isFacultyUnavailable(instance, s.faculty_id, entry.day, p),
      )
    ) {
      out.push("H7");
    }
    if (room) {
      if (room.capacity < s.size) out.push("H5");
      if (!s.room_types.includes(room.type)) out.push("H6");
      if (s.needs_accessible && !room.accessible) out.push("H10");
      if (per.some((p) => isRoomUnavailable(instance, room.id, entry.day, p))) {
        out.push("H8");
      }
    }
    return [...new Set(out)];
  }

  /**
   * Places a unit at its baseline when every member has a valid baseline at one shared start.
   * Otherwise records why (rules per member, or the pin that displaced it) and returns the lower
   * bound on the moves its repair costs.
   */
  private seed(u: number): "kept" | { lb: number; pinDisplaced: boolean } {
    const { model, state, ctx } = this;
    const unit = model.units[u];
    const members = unit.members;
    let slot = -2;
    let allBase = true;
    let sameSlot = true;
    let withBase = 0;
    let timeOk = true;
    let anyRule = false;
    for (const m of members) {
      if (!ctx.hasBase[m.index]) {
        allBase = false;
        this.causes[m.index] = "added";
        continue;
      }
      withBase++;
      const rules = this.unaryRules(m);
      this.rules[m.index] = rules;
      if (rules.length > 0) anyRule = true;
      // H1 here is an unknown room (an invalid day leaves no baseline slot).
      if (rules.some((r) => r === "H9" || r === "H14" || r === "H7")) {
        timeOk = false;
      }
      const bs = ctx.baseSlot[m.index];
      if (slot === -2) slot = bs;
      else if (slot !== bs) sameSlot = false;
    }
    if (withBase > 0 && !sameSlot) {
      timeOk = false;
      for (const m of members) {
        if (ctx.hasBase[m.index]) this.rules[m.index].push("H11");
      }
    }
    const markBroken = () => {
      for (const m of members) {
        if (ctx.hasBase[m.index]) {
          this.causes[m.index] = "broken";
          this.rules[m.index].sort(byRuleOrder);
        }
      }
    };
    if (withBase === 0) return { lb: 0, pinDisplaced: false };
    if (slot < 0 || !unit.starts.includes(slot)) timeOk = false;
    const lb = timeOk ? 1 : withBase;
    if (
      anyRule ||
      !allBase ||
      !sameSlot ||
      slot < 0 ||
      !unit.starts.includes(slot)
    ) {
      markBroken();
      return { lb, pinDisplaced: false };
    }

    const rooms = this.scratch.subarray(0, members.length);
    for (let i = 0; i < members.length; i++)
      rooms[i] = ctx.baseRoom[members[i].index];
    if (state.canPlace(u, slot, rooms)) {
      state.place(u, slot, rooms);
      return "kept";
    }
    const ok = state.conflicts(u, slot, rooms, this.buf);
    const pin = ok ? this.buf.find((v) => this.pinned[v]) : undefined;
    if (pin !== undefined) {
      const by = this.pinnedMemberId(pin);
      for (const m of members) {
        this.causes[m.index] = "evicted";
        this.displacedBy[m.index] = by;
      }
      return { lb: 1, pinDisplaced: true };
    }
    // The baseline clashes with itself (another baseline unit was seeded there first).
    const clash = this.clashRules(u, slot, rooms);
    for (const m of members) this.rules[m.index].push(...clash);
    markBroken();
    return { lb: 1, pinDisplaced: false };
  }

  /** The session a pinned unit was pinned for (its first member). */
  private pinnedMemberId(u: number): string {
    const members = this.model.units[u].members;
    const own = members.find((m) => this.pinnedWith[m.index] === null);
    return (own ?? members[0]).session.id;
  }

  /** Which of H4, H2, H3, H12 a placement breaks against the current state. */
  private clashRules(
    u: number,
    slot: number,
    rooms: ArrayLike<number>,
  ): string[] {
    const { model, state } = this;
    const { slotCount, dayCount } = model;
    const unit = model.units[u];
    const out = new Set<string>();
    const day = dayOfSlot(slot);
    unit.members.forEach((m, i) => {
      for (let k = 0; k < m.duration; k++) {
        if (state.roomOcc[rooms[i] * slotCount + slot + k] >= 0) out.add("H4");
        if (state.facOcc[m.faculty * slotCount + slot + k] >= 0) out.add("H2");
      }
      if (
        state.facHours[m.faculty * dayCount + day] + m.duration >
        model.facultyMax[m.faculty]
      ) {
        out.add("H12");
      }
    });
    unit.groups.forEach((g, i) => {
      for (let k = 0; k < unit.groupSpan[i]; k++) {
        if (state.grpOcc[g * slotCount + slot + k] >= 0) out.add("H3");
      }
    });
    return [...out];
  }

  // -------------------------------------------------------------------------------- search

  private exhausted(): boolean {
    if (this.exhaustedFlag) return true;
    if (this.nodes >= this.limits.maxNodes) {
      this.exhaustedFlag = true;
      this.stoppedBy = "nodes";
      return true;
    }
    if (this.nodes >= this.nextClock) {
      this.nextClock = this.nodes + CLOCK_EVERY;
      if (this.limits.clock() > this.limits.deadline) {
        this.exhaustedFlag = true;
        this.stoppedBy = "time";
        return true;
      }
    }
    return false;
  }

  /** The node budget of the unit being repaired is spent (it keeps the best plan found). */
  private unitSpent(): boolean {
    if (this.nodes - this.unitNodesStart < this.unitNodeCap) return false;
    if (this.stoppedBy === "complete") this.stoppedBy = "nodes";
    return true;
  }

  private placeOp(
    u: number,
    slot: number,
    rooms: ArrayLike<number>,
    by: number,
    level: number,
  ): void {
    this.state.place(u, slot, rooms);
    const [moved, time] = this.ctx.movesAt(u, slot, rooms);
    this.moved += moved;
    this.timeMoved += time;
    this.inChain[u]++;
    this.log.push({
      remove: false,
      unit: u,
      slot,
      rooms: Int32Array.from(rooms),
      by,
      level,
    });
  }

  private removeOp(u: number, by: number, level: number): void {
    const unit = this.model.units[u];
    const rooms = new Int32Array(unit.members.length);
    const slot = this.state.removeInto(u, rooms);
    const [moved, time] = this.ctx.movesAt(u, slot, rooms);
    this.moved -= moved;
    this.timeMoved -= time;
    this.log.push({ remove: true, unit: u, slot, rooms, by, level });
  }

  private undoTo(mark: number): void {
    const { log, state, ctx } = this;
    while (log.length > mark) {
      const op = log.pop() as Op;
      const [moved, time] = ctx.movesAt(op.unit, op.slot, op.rooms);
      if (op.remove) {
        state.place(op.unit, op.slot, op.rooms);
        this.moved += moved;
        this.timeMoved += time;
      } else {
        state.remove(op.unit);
        this.moved -= moved;
        this.timeMoved -= time;
        this.inChain[op.unit]--;
      }
    }
  }

  private replay(ops: readonly Op[]): void {
    for (const op of ops) {
      if (op.remove) this.removeOp(op.unit, op.by, op.level);
      else this.placeOp(op.unit, op.slot, op.rooms, op.by, op.level);
    }
  }

  /** Moved members of a placed unit right now. */
  private movedNow(u: number): number {
    const rooms = this.scratch.subarray(0, this.model.units[u].members.length);
    this.state.roomsOf(u, rooms);
    return this.ctx.movesAt(u, this.state.unitSlot[u], rooms)[0];
  }

  /**
   * The best plan for unit `u` (fewest moves, then fewest time changes, then lowest soft + fest)
   * with evictions up to `depth` levels deep and at most `limit` moves. Iterative deepening:
   * a deeper search runs only while it could still save a move.
   */
  private placeTop(u: number, lbOwn: number): Plan | null {
    let best: Plan | null = null;
    for (let d = 0; d <= this.limits.maxDepth; d++) {
      if (d > 0 && (this.exhausted() || this.unitSpent())) break;
      const limit = best ? best.moves - 1 : Number.POSITIVE_INFINITY;
      const plan = this.find(u, d, limit, lbOwn, -1, 0);
      if (plan) best = plan;
      if (best && best.moves <= lbOwn) break;
    }
    return best;
  }

  /** Applies a top-level plan and records who displaced whom. */
  private commit(plan: Plan, depthBase: number): void {
    this.replay(plan.ops);
    const { model } = this;
    for (const op of plan.ops) {
      this.depthUsed = Math.max(this.depthUsed, depthBase + op.level);
      this.inChain[op.unit] = 0;
      if (!op.remove || op.by < 0) continue;
      const by = model.units[op.by].members[0].session.id;
      for (const m of model.units[op.unit].members) {
        if (this.causes[m.index] === "kept") this.causes[m.index] = "evicted";
        if (this.causes[m.index] === "evicted") this.displacedBy[m.index] = by;
      }
    }
    this.log.length = 0;
  }

  /** Rooms for a direct placement at `slot` (baseline room first), or false. */
  private directRooms(u: number, slot: number, out: Int32Array): boolean {
    out.fill(-1);
    return this.fillRooms(u, slot, out, false);
  }

  /**
   * Room choices for a placement that evicts: for one session, the free room if there is one,
   * else up to `EJECT_ROOMS` rooms whose occupants are cheapest to move; for a basket, up to two
   * choices and the search keeps the cheaper (see below).
   */
  private ejectRooms(u: number, slot: number): Int32Array[] {
    const { model, state, ctx } = this;
    const unit = model.units[u];
    const { slotCount } = model;
    const occupantsOf = (r: number, duration: number): number[] | null => {
      const out: number[] = [];
      const base = r * slotCount + slot;
      for (let k = 0; k < duration; k++) {
        const cell = state.roomOcc[base + k];
        if (cell === BLOCKED) return null;
        if (cell >= 0 && !out.includes(cell)) out.push(cell);
      }
      return out;
    };
    const candidates = (m: ModelMember): number[] => {
      const list: number[] = [];
      const br = ctx.baseRoom[m.index];
      if (
        br !== -1 &&
        ctx.baseRoomSuits[m.index] &&
        slot === ctx.baseSlot[m.index]
      ) {
        list.push(br);
      }
      for (const r of m.rooms) if (!list.includes(r)) list.push(r);
      return list;
    };

    if (unit.members.length === 1) {
      const m = unit.members[0];
      const scored: { r: number; cost: number; count: number; k: number }[] =
        [];
      const seen = new Set<string>();
      candidates(m).forEach((r, k) => {
        const occ = occupantsOf(r, m.duration);
        if (occ === null) return;
        if (occ.some((v) => this.locked[v] || this.inChain[v] > 0)) return;
        const key = occ.join(",");
        if (seen.has(key)) return;
        seen.add(key);
        let cost = 0;
        for (const v of occ) cost += this.movedNow(v) === 0 ? 1 : 0;
        scored.push({ r, cost, count: occ.length, k });
      });
      const free = scored.find((x) => x.count === 0);
      if (free) return [Int32Array.of(free.r)];
      scored.sort((a, b) => a.cost - b.cost || a.count - b.count || a.k - b.k);
      return scored.slice(0, EJECT_ROOMS).map((x) => Int32Array.of(x.r));
    }

    // A basket. One choice keeps every member whose baseline slot this is in its own baseline
    // room whenever that room is open and its occupants can be moved, so a broken member never
    // takes a sibling's room (which would move the sibling too) and an occupant that has to go
    // anyway doesn't make the sibling's room look costly. The other gives each member, largest
    // first, the room with the fewest occupants. Both are offered when they differ.
    const evictable = (occ: number[] | null): occ is number[] =>
      occ !== null && !occ.some((v) => this.locked[v] || this.inChain[v] > 0);
    const assign = (keepBase: boolean): Int32Array | null => {
      const rooms = new Int32Array(unit.members.length).fill(-1);
      if (keepBase) {
        unit.members.forEach((m, i) => {
          const br = ctx.baseRoom[m.index];
          if (
            br === -1 ||
            !ctx.baseRoomSuits[m.index] ||
            slot !== ctx.baseSlot[m.index] ||
            rooms.includes(br)
          )
            return;
          if (evictable(occupantsOf(br, m.duration))) rooms[i] = br;
        });
      }
      for (let oi = 0; oi < unit.roomOrder.length; oi++) {
        const i = unit.roomOrder[oi];
        if (rooms[i] !== -1) continue;
        const m = unit.members[i];
        let best = -1;
        let bestCount = Number.POSITIVE_INFINITY;
        for (const r of candidates(m)) {
          if (rooms.includes(r)) continue;
          const occ = occupantsOf(r, m.duration);
          if (!evictable(occ)) continue;
          if (occ.length < bestCount) {
            bestCount = occ.length;
            best = r;
            if (bestCount === 0) break;
          }
        }
        if (best === -1) return null;
        rooms[i] = best;
      }
      return rooms;
    };
    const choices: Int32Array[] = [];
    for (const keepBase of [true, false]) {
      const rooms = assign(keepBase);
      if (rooms && !choices.some((c) => c.every((r, k) => r === rooms[k])))
        choices.push(rooms);
    }
    return choices;
  }

  private better(
    best: Plan | null,
    moves: number,
    time: number,
    obj: number,
  ): boolean {
    if (!best) return true;
    if (moves !== best.moves) return moves < best.moves;
    if (time !== best.time) return time < best.time;
    return obj < best.obj - EPS;
  }

  /**
   * Best plan to place unplaced unit `u`, leaving the state unchanged. Direct placements are
   * tried first; when none reaches `lbOwn` moves and `depth > 0`, placements that evict blockers
   * are tried in order of their lower bound, each blocker re-placed recursively.
   */
  private find(
    u: number,
    depth: number,
    limit: number,
    lbOwn: number,
    by: number,
    level: number,
  ): Plan | null {
    const { model, state, ctx } = this;
    const unit = model.units[u];
    const starts = unit.starts;
    const mark = this.log.length;
    const m0 = this.moved;
    const t0 = this.timeMoved;
    const o0 = state.objective;
    const rooms = new Int32Array(unit.members.length);
    let best: Plan | null = null;

    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      if (!this.directRooms(u, s, rooms) || !state.canPlace(u, s, rooms))
        continue;
      const [own, ownTime] = ctx.movesAt(u, s, rooms);
      if (own > limit) continue;
      if (
        best &&
        (own > best.moves || (own === best.moves && ownTime > best.time))
      )
        continue;
      this.nodes++;
      this.placeOp(u, s, rooms, by, level);
      const obj = state.objective - o0;
      if (this.better(best, this.moved - m0, this.timeMoved - t0, obj)) {
        best = {
          moves: this.moved - m0,
          time: this.timeMoved - t0,
          obj,
          ops: this.log.slice(mark),
        };
      }
      this.undoTo(mark);
    }
    if (best && best.moves <= lbOwn) return best;
    if (depth === 0 || this.exhausted() || this.unitSpent()) return best;

    type Candidate = {
      s: number;
      rooms: Int32Array;
      blockers: number[];
      lb: number;
      order: number;
    };
    const candidates: Candidate[] = [];
    let order = 0;
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      for (const choice of this.ejectRooms(u, s)) {
        if (!state.conflicts(u, s, choice, this.buf) || this.buf.length === 0)
          continue;
        if (this.buf.some((v) => this.locked[v] || this.inChain[v] > 0))
          continue;
        const [own] = ctx.movesAt(u, s, choice);
        let lb = own;
        for (const v of this.buf) {
          const now = this.movedNow(v);
          lb += now === 0 ? 1 : -now;
        }
        candidates.push({
          s,
          rooms: choice,
          blockers: [...this.buf],
          lb,
          order: order++,
        });
      }
    }
    candidates.sort(
      (a, b) =>
        a.lb - b.lb ||
        a.blockers.length - b.blockers.length ||
        a.order - b.order,
    );

    for (const c of candidates) {
      const cap = best ? Math.min(limit, best.moves - 1) : limit;
      if (c.lb > cap) break;
      if (this.exhausted() || this.unitSpent()) break;
      this.nodes++;
      const unmoved = c.blockers.map((v) => this.movedNow(v) === 0);
      for (const v of c.blockers) this.removeOp(v, u, level + 1);
      if (!state.canPlace(u, c.s, c.rooms)) {
        this.undoTo(mark);
        continue;
      }
      this.placeOp(u, c.s, c.rooms, by, level);
      const blockers = c.blockers
        .map((v, k) => ({ v, unmoved: unmoved[k] }))
        .sort(
          (a, b) =>
            model.units[a.v].options - model.units[b.v].options || a.v - b.v,
        );
      let ok = true;
      for (let j = 0; j < blockers.length; j++) {
        let rest = 0;
        for (let k = j + 1; k < blockers.length; k++)
          if (blockers[k].unmoved) rest++;
        const sublimit = cap - (this.moved - m0) - rest;
        const { v, unmoved: was } = blockers[j];
        const sub = this.find(
          v,
          depth - 1,
          sublimit,
          was ? 1 : 0,
          u,
          level + 1,
        );
        if (!sub) {
          ok = false;
          break;
        }
        this.replay(sub.ops);
      }
      if (ok) {
        const obj = state.objective - o0;
        if (this.better(best, this.moved - m0, this.timeMoved - t0, obj)) {
          best = {
            moves: this.moved - m0,
            time: this.timeMoved - t0,
            obj,
            ops: this.log.slice(mark),
          };
        }
      }
      this.undoTo(mark);
    }
    return best;
  }
}

/** Search limits from the public options, with the clock started now. */
export function searchLimits(
  opts: { maxDepth?: number; maxNodes?: number; timeBudgetMs?: number },
  defaults: { maxDepth: number; maxNodes: number; timeBudgetMs: number },
  clock: () => number = () => performance.now(),
): SearchLimits {
  const int = (v: number | undefined, fallback: number) =>
    v === undefined || !Number.isFinite(v)
      ? fallback
      : Math.max(0, Math.floor(v));
  const budget =
    opts.timeBudgetMs === undefined || Number.isNaN(opts.timeBudgetMs)
      ? defaults.timeBudgetMs
      : Math.max(0, opts.timeBudgetMs);
  return {
    maxDepth: int(opts.maxDepth, defaults.maxDepth),
    maxNodes: int(opts.maxNodes, defaults.maxNodes),
    deadline: clock() + budget,
    clock,
  };
}
