/**
 * Search phases of the timetable solver (backend.md §3.2) over a `TimetableState`:
 * soft- and fest-aware greedy construction, min-conflicts repair with tabu and restarts, and
 * simulated annealing with hard fixed at 0. Internal to the engine; `solver.ts` drives them.
 *
 * Every random choice comes from the seeded `Rng`, and every loop runs over arrays in a fixed
 * order, so the same instance, seed and iteration budget always give the same timetable.
 */
import type { FestDemand } from "./fest";
import {
  BLOCKED,
  dayOfSlot,
  slotOf,
  type Model,
  type StateSnapshot,
  type TimetableState,
} from "./model";
import type { Rng } from "./rng";
import { LAST_TEACHING_PERIOD } from "./types";

const EPS = 1e-9;

/** Rooms a fest demand can barely do without (its options use at most this many rooms). */
const RESERVED_ROOM_LIMIT = 3;

/** Rooms that some fest demand depends on: those of demands with few room choices. */
export function reservedRooms(demands: readonly FestDemand[]): string[] {
  const out = new Set<string>();
  for (const demand of demands) {
    const rooms = new Set(
      demand.options
        .filter((o) => o.room_periods.length > 0)
        .map((o) => o.room_id),
    );
    if (rooms.size > 0 && rooms.size <= RESERVED_ROOM_LIMIT) {
      for (const room of rooms) out.add(room);
    }
  }
  return [...out];
}

function maxMembers(model: Model): number {
  let max = 1;
  for (const unit of model.units) max = Math.max(max, unit.members.length);
  return max;
}

// ------------------------------------------------------------------------------- best state

/** The best state seen: fewest unplaced sessions, then lowest soft + fest, then lowest soft. */
export class BestState {
  readonly snap: StateSnapshot;
  unplaced: number;
  objective: number;
  soft: number;

  constructor(state: TimetableState) {
    this.snap = state.snapshot();
    this.unplaced = state.unplacedSessions;
    this.objective = state.objective;
    this.soft = state.soft;
  }

  /** Records the state if it beats the best; returns true if it did. */
  offer(state: TimetableState): boolean {
    const unplaced = state.unplacedSessions;
    const objective = state.objective;
    const soft = state.soft;
    const better =
      unplaced < this.unplaced ||
      (unplaced === this.unplaced &&
        (objective < this.objective - EPS ||
          (Math.abs(objective - this.objective) <= EPS && soft < this.soft)));
    if (!better) return false;
    state.snapshotInto(this.snap);
    this.unplaced = unplaced;
    this.objective = objective;
    this.soft = soft;
    return true;
  }
}

// ----------------------------------------------------------------------------- construction

/**
 * Unit order for the greedy: fixed units, then fewest options, then highest load on the
 * least-loaded room the unit could use, then baskets, larger, more groups, dataset order.
 * Only units with a non-empty domain are listed.
 */
export function constructionOrder(model: Model): Int32Array {
  const { rooms, slotCount, roomInit } = model;
  const load = new Float64Array(rooms.length);
  for (const unit of model.units) {
    if (unit.starts.length === 0) continue;
    for (const m of unit.members) {
      for (const r of m.rooms) load[r] += m.duration / m.rooms.length;
    }
  }
  const tight = new Float64Array(rooms.length);
  for (let r = 0; r < rooms.length; r++) {
    let open = 0;
    for (let d = 0; d < model.dayCount; d++) {
      for (let p = 1; p <= LAST_TEACHING_PERIOD; p++) {
        if (roomInit[r * slotCount + slotOf(d, p)] !== BLOCKED) open++;
      }
    }
    tight[r] = load[r] / Math.max(1, open);
  }
  const tightness = model.units.map((unit) => {
    let worst = 0;
    for (const m of unit.members) {
      let least = Number.POSITIVE_INFINITY;
      for (const r of m.rooms) least = Math.min(least, tight[r]);
      if (Number.isFinite(least)) worst = Math.max(worst, least);
    }
    return worst;
  });
  const order = [...model.placeable].sort((a, b) => {
    const ua = model.units[a];
    const ub = model.units[b];
    return (
      Number(ub.fixed) - Number(ua.fixed) ||
      ua.options - ub.options ||
      tightness[b] - tightness[a] ||
      Number(ub.basket !== null) - Number(ua.basket !== null) ||
      ub.size - ua.size ||
      ub.groups.length - ua.groups.length ||
      a - b
    );
  });
  return Int32Array.from(order);
}

/** Shared scratch buffers and the moves every phase uses. */
export class Moves {
  readonly state: TimetableState;
  readonly model: Model;
  readonly rng: Rng;
  readonly a: Int32Array;
  readonly b: Int32Array;
  readonly c: Int32Array;
  readonly d: Int32Array;
  readonly best: Int32Array;

  constructor(state: TimetableState, rng: Rng) {
    this.state = state;
    this.model = state.model;
    this.rng = rng;
    const n = maxMembers(state.model);
    this.a = new Int32Array(n);
    this.b = new Int32Array(n);
    this.c = new Int32Array(n);
    this.d = new Int32Array(n);
    this.best = new Int32Array(n);
  }

  /**
   * Places an unplaced unit at its best feasible start (first free rooms in preference order),
   * scored by soft + fest with a tiny random tie-break. Returns false if no start is feasible.
   */
  placeBest(u: number, tieBreak = true): boolean {
    const { state, rng } = this;
    const starts = this.model.units[u].starts;
    const rooms = this.a;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestSlot = -1;
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      if (!state.firstFreeRooms(u, s, rooms) || !state.canPlace(u, s, rooms)) {
        continue;
      }
      state.place(u, s, rooms);
      const score = state.objective + (tieBreak ? rng() * 1e-3 : 0);
      state.removeInto(u, this.d);
      if (score < bestScore) {
        bestScore = score;
        bestSlot = s;
        this.best.set(rooms);
      }
    }
    if (bestSlot === -1) return false;
    state.place(u, bestSlot, this.best);
    return true;
  }

  /** Greedy pass over `order`; returns the units that found no feasible start. */
  construct(order: ArrayLike<number>): number[] {
    const stuck: number[] = [];
    for (let i = 0; i < order.length; i++) {
      const u = order[i];
      if (this.state.isPlaced(u)) continue;
      if (!this.placeBest(u)) stuck.push(u);
    }
    return stuck;
  }
}

// ----------------------------------------------------------------------------------- repair

const TABU_BASE = 7;
const TABU_SPREAD = 7;
const RANDOM_WALK = 0.02;
const RESTART_AFTER = 5000;
/** Repair gives up (leaving the rest to the annealer's insertions) after this long without a new best. */
const GIVE_UP_AFTER = 25_000;

/**
 * Min-conflicts repair with ejection. Each step first re-inserts every stuck unit that now fits
 * without evicting anything; then the most constrained stuck unit goes where it evicts the
 * cheapest set of placed units (never a fixed one; a constrained unit costs more to evict), and
 * the evicted units join the stuck list. Tabu on just-vacated (unit, start) pairs, aspiration
 * on a new best, a 2 % random walk, and a greedy restart with a perturbed order after a long
 * stall.
 */
export class Repairer {
  readonly stuck: number[];
  readonly best: BestState;
  iterations = 0;
  restarts = 0;
  private readonly moves: Moves;
  private readonly state: TimetableState;
  private readonly model: Model;
  private readonly rng: Rng;
  private readonly rank: Int32Array;
  private readonly order: Int32Array;
  private readonly tabu: Int32Array;
  private readonly conflictsBuf: number[] = [];
  private readonly bestConflicts: number[] = [];
  private nonImproving = 0;
  private lastBest = 0;

  constructor(moves: Moves, order: Int32Array, stuck: number[]) {
    this.moves = moves;
    this.state = moves.state;
    this.model = moves.model;
    this.rng = moves.rng;
    this.order = order;
    this.rank = new Int32Array(this.model.units.length);
    order.forEach((u, i) => (this.rank[u] = i));
    this.stuck = [...stuck];
    this.tabu = new Int32Array(this.model.units.length * this.model.slotCount);
    this.best = new BestState(this.state);
  }

  /** True when nothing is stuck, or the search has stalled for too long. */
  get done(): boolean {
    return (
      this.stuck.length === 0 ||
      this.iterations - this.lastBest >= GIVE_UP_AFTER
    );
  }

  private improved(): void {
    this.nonImproving = 0;
    this.lastBest = this.iterations;
  }

  /** The stuck unit with the fewest options (ties: construction order). */
  private takeStuck(): number {
    const { stuck, model, rank } = this;
    let at = 0;
    for (let i = 1; i < stuck.length; i++) {
      const a = model.units[stuck[i]];
      const b = model.units[stuck[at]];
      if (
        a.options < b.options ||
        (a.options === b.options && rank[stuck[i]] < rank[stuck[at]])
      ) {
        at = i;
      }
    }
    const u = stuck[at];
    stuck[at] = stuck[stuck.length - 1];
    stuck.pop();
    return u;
  }

  /** Per member, the room whose cells hold the fewest other units (ties: preference order). */
  private fewestBlockerRooms(
    u: number,
    slot: number,
    out: Int32Array,
  ): boolean {
    const { state, model } = this;
    const unit = model.units[u];
    const { slotCount } = model;
    for (let oi = 0; oi < unit.roomOrder.length; oi++) {
      const i = unit.roomOrder[oi];
      const m = unit.members[i];
      let bestRoom = -1;
      let bestCount = Number.POSITIVE_INFINITY;
      for (let k = 0; k < m.rooms.length; k++) {
        const r = m.rooms[k];
        let taken = false;
        for (let j = 0; j < oi; j++)
          if (out[unit.roomOrder[j]] === r) taken = true;
        if (taken) continue;
        let count = 0;
        let prev = -1;
        let closed = false;
        const base = r * slotCount + slot;
        for (let q = 0; q < m.duration; q++) {
          const cell = state.roomOcc[base + q];
          if (cell === BLOCKED) {
            closed = true;
            break;
          }
          if (cell >= 0 && cell !== prev) count++;
          prev = cell;
        }
        if (closed) continue;
        if (count < bestCount) {
          bestCount = count;
          bestRoom = r;
          if (count === 0) break;
        }
      }
      if (bestRoom === -1) return false;
      out[i] = bestRoom;
    }
    return true;
  }

  private hasFixed(units: readonly number[]): boolean {
    for (const v of units) if (this.model.units[v].fixed) return true;
    return false;
  }

  private sessionsOf(units: readonly number[]): number {
    let n = 0;
    for (const v of units) n += this.model.units[v].members.length;
    return n;
  }

  /** Eviction cost: 1 per unit, more for units with few options (they are hard to re-place). */
  private evictionCost(units: readonly number[]): number {
    let cost = 0;
    for (const v of units)
      cost += 1 + 10 / Math.max(1, this.model.units[v].options);
    return cost;
  }

  /** Re-inserts every stuck unit that fits without evictions; returns true if any did. */
  private insertFree(): boolean {
    const { stuck, moves } = this;
    let placed = false;
    for (let i = stuck.length - 1; i >= 0; i--) {
      if (moves.placeBest(stuck[i])) {
        stuck[i] = stuck[stuck.length - 1];
        stuck.pop();
        placed = true;
      }
    }
    return placed;
  }

  /** One repair step. */
  step(): void {
    const { state, model, rng, moves } = this;
    this.iterations++;
    const iter = this.iterations;
    if (this.insertFree()) {
      if (this.best.offer(state)) this.improved();
      if (this.stuck.length === 0) return;
    }
    const u = this.takeStuck();
    const unit = model.units[u];
    const starts = unit.starts;
    const rooms = moves.a;
    const conflicts = this.conflictsBuf;
    let chosen = -1;

    if (rng() < RANDOM_WALK) {
      const s = starts[Math.floor(rng() * starts.length)];
      if (
        this.fewestBlockerRooms(u, s, rooms) &&
        state.conflicts(u, s, rooms, conflicts) &&
        !this.hasFixed(conflicts)
      ) {
        chosen = s;
        moves.best.set(rooms);
        this.bestConflicts.length = 0;
        this.bestConflicts.push(...conflicts);
      }
    } else {
      let bestScore = Number.POSITIVE_INFINITY;
      const offset = Math.floor(rng() * starts.length);
      const base = u * model.slotCount;
      for (let k = 0; k < starts.length; k++) {
        const s = starts[(offset + k) % starts.length];
        if (!this.fewestBlockerRooms(u, s, rooms)) continue;
        if (!state.conflicts(u, s, rooms, conflicts)) continue;
        if (this.hasFixed(conflicts)) continue;
        if (this.tabu[base + s] > iter) {
          const after =
            state.unplacedSessions -
            unit.members.length +
            this.sessionsOf(conflicts);
          if (after >= this.best.unplaced) continue;
        }
        const score = this.evictionCost(conflicts) + rng() * 0.1;
        if (score < bestScore) {
          bestScore = score;
          chosen = s;
          moves.best.set(rooms);
          this.bestConflicts.length = 0;
          this.bestConflicts.push(...conflicts);
          if (conflicts.length === 0) break;
        }
      }
    }

    if (chosen === -1) {
      this.stuck.push(u);
      this.stalled();
      return;
    }
    const scratch = moves.d;
    for (const v of this.bestConflicts) {
      const old = state.removeInto(v, scratch);
      this.tabu[v * model.slotCount + old] =
        iter + TABU_BASE + Math.floor(rng() * TABU_SPREAD);
      this.stuck.push(v);
    }
    if (state.canPlace(u, chosen, moves.best)) {
      state.place(u, chosen, moves.best);
    } else {
      this.stuck.push(u); // Not reachable when `conflicts` is complete; kept as a guard.
    }
    if (this.best.offer(state)) this.improved();
    else this.stalled();
  }

  private stalled(): void {
    this.nonImproving++;
    if (this.nonImproving >= RESTART_AFTER) this.restart();
  }

  /** Greedy from scratch with the stuck units first and a noisy order for the rest. */
  private restart(): void {
    const { state, rng, rank, order } = this;
    this.restarts++;
    this.nonImproving = 0;
    const first = new Set(this.stuck);
    const noise = order.length * 0.2;
    const key = new Float64Array(this.model.units.length);
    for (const u of order) {
      key[u] = this.model.units[u].fixed
        ? -2 * order.length + rank[u]
        : first.has(u)
          ? -order.length + rank[u]
          : rank[u] + rng() * noise;
    }
    const next = Int32Array.from(
      [...order].sort((a, b) => key[a] - key[b] || a - b),
    );
    state.clear();
    const stuck = this.moves.construct(next);
    this.stuck.length = 0;
    this.stuck.push(...stuck);
    if (this.best.offer(state)) this.improved();
  }

  /** Leaves the state at the best placement found. */
  finish(): void {
    if (this.state.unplacedSessions > this.best.unplaced) {
      this.state.restore(this.best.snap);
      this.stuck.length = 0;
      for (const u of this.model.placeable) {
        if (!this.state.isPlaced(u)) this.stuck.push(u);
      }
    }
  }
}

// ---------------------------------------------------------------------------------- anneal

export const T0 = 3;
export const T_END = 0.05;
const REHEAT_AFTER = 0.15;
const MAX_REHEATS = 3;
const INSERT_EVERY = 1000;

/**
 * Simulated annealing on soft + fest with hard fixed at 0. Every move removes units, checks
 * `canPlace`, places them, and is undone exactly if rejected.
 */
export class Annealer {
  readonly best: BestState;
  temperature = T0;
  reheats = 0;
  private readonly moves: Moves;
  private readonly state: TimetableState;
  private readonly model: Model;
  private readonly rng: Rng;
  private readonly budget: number;
  private readonly neighbours: Int32Array[];
  private readonly sameDuration: Map<number, Int32Array>;
  private readonly inDomain: Uint8Array;
  private readonly unplaceable: number;
  private factor: number;
  private lastImprovement = 0;
  private iteration = 0;

  constructor(moves: Moves, budget: number, best: BestState) {
    this.moves = moves;
    this.state = moves.state;
    this.model = moves.model;
    this.rng = moves.rng;
    this.budget = budget;
    this.best = best;
    const { model } = this;
    this.unplaceable = model.units.length - model.placeable.length;

    const byGroup: number[][] = model.groupIds.map(() => []);
    for (const u of model.placeable) {
      for (const g of model.units[u].groups) byGroup[g].push(u);
    }
    this.neighbours = model.units.map((unit) => {
      const set = new Set<number>();
      if (unit.starts.length > 0) {
        for (const g of unit.groups) for (const v of byGroup[g]) set.add(v);
      }
      set.delete(unit.index);
      return Int32Array.from([...set].sort((a, b) => a - b));
    });
    const byDuration = new Map<number, number[]>();
    for (const u of model.placeable) {
      const dur = model.units[u].duration;
      const list = byDuration.get(dur);
      if (list) list.push(u);
      else byDuration.set(dur, [u]);
    }
    this.sameDuration = new Map(
      [...byDuration].map(([dur, list]) => [dur, Int32Array.from(list)]),
    );
    this.inDomain = new Uint8Array(model.units.length * model.slotCount);
    for (const unit of model.units) {
      for (const s of unit.starts) {
        this.inDomain[unit.index * model.slotCount + s] = 1;
      }
    }
    this.factor = Math.pow(T_END / T0, 1 / Math.max(1, budget));
  }

  private randomPlaced(): number {
    const { placeable } = this.model;
    if (placeable.length === 0) return -1;
    for (let tries = 0; tries < 8; tries++) {
      const u = placeable[Math.floor(this.rng() * placeable.length)];
      if (this.state.isPlaced(u)) return u;
    }
    return -1;
  }

  private accept(delta: number): boolean {
    return delta <= EPS || this.rng() < Math.exp(-delta / this.temperature);
  }

  /** One annealing iteration (`i` counts from 0 to `budget - 1`). */
  step(i: number): void {
    const { state } = this;
    this.iteration = i;
    if (i % INSERT_EVERY === 0 && state.unplacedUnits > this.unplaceable) {
      this.insertUnplaced();
    }
    const r = this.rng();
    if (r < 0.45) this.relocate();
    else if (r < 0.65) this.changeRoom();
    else if (r < 0.9) this.swap();
    else this.kick();

    if (i - this.lastImprovement > REHEAT_AFTER * this.budget) {
      if (this.reheats < MAX_REHEATS) {
        this.reheats++;
        state.restore(this.best.snap);
        this.temperature = T0 / 2;
        this.factor = Math.pow(
          T_END / this.temperature,
          1 / Math.max(1, this.budget - i),
        );
      }
      this.lastImprovement = i;
    }
    this.temperature *= this.factor;
  }

  /** Records an accepted state; returns true on a new best. */
  private accepted(): boolean {
    if (this.best.offer(this.state)) {
      this.lastImprovement = this.iteration;
      return true;
    }
    return false;
  }

  /** Tries to place every unplaced unit (a strict improvement whenever it succeeds). */
  insertUnplaced(): void {
    const { state, model, moves } = this;
    let placed = false;
    for (const u of model.placeable) {
      if (!state.isPlaced(u) && moves.placeBest(u)) placed = true;
    }
    if (placed) this.accepted();
  }

  private relocate(): void {
    const { state, rng, moves } = this;
    const u = this.randomPlaced();
    if (u === -1) return;
    const starts = this.model.units[u].starts;
    const s = starts[Math.floor(rng() * starts.length)];
    const before = state.objective;
    const oldRooms = moves.b;
    const oldSlot = state.removeInto(u, oldRooms);
    const rooms = moves.a;
    const found =
      rng() < 0.7
        ? state.firstFreeRooms(u, s, rooms)
        : state.randomFreeRooms(u, s, rng, rooms);
    if (!found || !state.canPlace(u, s, rooms)) {
      state.place(u, oldSlot, oldRooms);
      return;
    }
    state.place(u, s, rooms);
    if (this.accept(state.objective - before)) {
      this.accepted();
    } else {
      state.removeInto(u, moves.d);
      state.place(u, oldSlot, oldRooms);
    }
  }

  private changeRoom(): void {
    const { state, rng, moves } = this;
    const u = this.randomPlaced();
    if (u === -1) return;
    const unit = this.model.units[u];
    const i = Math.floor(rng() * unit.members.length);
    const domain = unit.members[i].rooms;
    if (domain.length < 2) return;
    const room = domain[Math.floor(rng() * domain.length)];
    const before = state.objective;
    const oldRooms = moves.b;
    const slot = state.removeInto(u, oldRooms);
    if (room === oldRooms[i]) {
      state.place(u, slot, oldRooms);
      return;
    }
    const rooms = moves.a;
    rooms.set(oldRooms);
    rooms[i] = room;
    if (!state.canPlace(u, slot, rooms)) {
      state.place(u, slot, oldRooms);
      return;
    }
    state.place(u, slot, rooms);
    if (this.accept(state.objective - before)) {
      this.accepted();
    } else {
      state.removeInto(u, moves.d);
      state.place(u, slot, oldRooms);
    }
  }

  /** Places `u` at `slot`, keeping `own` rooms if they are free, else the first free ones. */
  private placeKeeping(
    u: number,
    slot: number,
    own: Int32Array,
    buf: Int32Array,
  ): boolean {
    const { state } = this;
    if (state.canPlace(u, slot, own)) {
      state.place(u, slot, own);
      return true;
    }
    if (state.firstFreeRooms(u, slot, buf) && state.canPlace(u, slot, buf)) {
      state.place(u, slot, buf);
      return true;
    }
    return false;
  }

  private swap(): void {
    const { state, rng, moves, model } = this;
    const u = this.randomPlaced();
    if (u === -1) return;
    const near = this.neighbours[u];
    const pool =
      near.length > 0 && rng() < 0.7
        ? near
        : (this.sameDuration.get(model.units[u].duration) as Int32Array);
    const v = pool[Math.floor(rng() * pool.length)];
    if (v === u || !state.isPlaced(v)) return;
    const su = state.unitSlot[u];
    const sv = state.unitSlot[v];
    if (
      su === sv ||
      !this.inDomain[u * model.slotCount + sv] ||
      !this.inDomain[v * model.slotCount + su]
    ) {
      return;
    }
    const before = state.objective;
    const roomsU = moves.b;
    const roomsV = moves.c;
    state.removeInto(u, roomsU);
    state.removeInto(v, roomsV);
    const okU = this.placeKeeping(u, sv, roomsU, moves.a);
    const okV = okU && this.placeKeeping(v, su, roomsV, moves.d);
    if (okU && okV && this.accept(state.objective - before)) {
      this.accepted();
      return;
    }
    if (okU) state.removeInto(u, moves.a);
    if (okV) state.removeInto(v, moves.d);
    state.place(u, su, roomsU);
    state.place(v, sv, roomsV);
  }

  /** Removes a unit and reinserts it at its best start; accepted like any other move. */
  private kick(): void {
    const { state, rng, moves } = this;
    const u = this.randomPlaced();
    if (u === -1) return;
    const starts = this.model.units[u].starts;
    const before = state.objective;
    const oldRooms = moves.b;
    const oldSlot = state.removeInto(u, oldRooms);
    const rooms = moves.a;
    const offset = Math.floor(rng() * starts.length);
    let bestScore = Number.POSITIVE_INFINITY;
    let bestSlot = -1;
    for (let k = 0; k < starts.length; k++) {
      const s = starts[(offset + k) % starts.length];
      if (!state.firstFreeRooms(u, s, rooms) || !state.canPlace(u, s, rooms)) {
        continue;
      }
      state.place(u, s, rooms);
      const score = state.objective;
      state.removeInto(u, moves.d);
      if (score < bestScore - EPS) {
        bestScore = score;
        bestSlot = s;
        moves.best.set(rooms);
      }
    }
    if (bestSlot === -1) {
      state.place(u, oldSlot, oldRooms);
      return;
    }
    state.place(u, bestSlot, moves.best);
    if (this.accept(state.objective - before)) {
      this.accepted();
    } else {
      state.removeInto(u, moves.d);
      state.place(u, oldSlot, oldRooms);
    }
  }
}

// ------------------------------------------------------------------------------ lower bound

/**
 * A provable lower bound on S1–S6 for a complete timetable. Only S4a is bounded: the
 * non-basket lectures of one course for one group can use at most as many distinct days as a
 * maximum matching of those sessions to the days their domains allow; every other session
 * repeats a day (3 points each). On the public data this proves S4 ≥ 3 (F08's CS204).
 */
export function softLowerBound(model: Model): number {
  const byPair = new Map<number, { units: number[]; extra: number }>();
  for (const u of model.placeable) {
    const unit = model.units[u];
    unit.s4aPairs.forEach((pair, i) => {
      let entry = byPair.get(pair);
      if (!entry) byPair.set(pair, (entry = { units: [], extra: 0 }));
      entry.units.push(u);
      entry.extra += unit.s4aCounts[i] - 1;
    });
  }
  let bound = 0;
  for (const { units, extra } of byPair.values()) {
    const daysOf = units.map((u) => {
      const set = new Set<number>();
      for (const s of model.units[u].starts) set.add(dayOfSlot(s));
      return [...set];
    });
    const owner = new Int32Array(model.dayCount).fill(-1);
    const tryAssign = (i: number, seen: Uint8Array): boolean => {
      for (const d of daysOf[i]) {
        if (seen[d]) continue;
        seen[d] = 1;
        if (owner[d] === -1 || tryAssign(owner[d], seen)) {
          owner[d] = i;
          return true;
        }
      }
      return false;
    };
    let matched = 0;
    for (let i = 0; i < units.length; i++) {
      if (tryAssign(i, new Uint8Array(model.dayCount))) matched++;
    }
    bound += 3 * (extra + units.length - matched);
  }
  return bound;
}
