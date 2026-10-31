/**
 * Midsem exam scheduler (backend.md §3.3): DSATUR colouring of the shared-group conflict graph into
 * exam-week slots (days × sessions), with best-fit-decreasing room packing at half capacity.
 *
 * 1. Slots are `exam_days × exam_week.sessions`; rooms are those that allow `exam` and seat
 *    someone at half capacity.
 * 2. A slot's rooms are re-packed (largest exam first, best fit) whenever an exam joins it, so
 *    no room is listed twice in a slot (H4) and every exam has enough seats (H5).
 * 3. Exams go in DSATUR order (most days blocked by placed neighbours, then degree, size,
 *    dataset order) to the admissible slot with the lowest (same-day penalty, seat load, index).
 *    Neighbours never share a slot (H3).
 * 4. An exam with no admissible slot may evict one exam that can move elsewhere; otherwise it is
 *    left out and listed in `unplaced`.
 * 5. If the same-day penalty is above 0, a deterministic steepest descent over moves and swaps
 *    lowers it.
 * 6. Rooms under maintenance during a slot's periods are avoided (the validator ignores this),
 *    unless the slot cannot be packed without them.
 */
import type { ExamPlacement, Violation } from "@/lib/contracts";

import { checkExams, examSeats } from "./exams-check";
import { isRoomUnavailable, type Instance } from "./instance";

export type ExamSolveOptions = {
  /** Prefer rooms that are not under maintenance at the slot's periods (default true; relaxed if packing fails). */
  avoidRoomUnavailability?: boolean;
  /** Cap on improvement steps when the penalty is above 0 (default 5000). */
  maxImproveSteps?: number;
};

export type ExamSolveResult = {
  exams: ExamPlacement[];
  /** `checkExams` re-check; empty on success. */
  violations: Violation[];
  /** Exam soft penalty (5 per extra exam a group sits on the same day). */
  penalty: number;
  unplaced: string[];
  iterations: number;
};

const DEFAULT_IMPROVE_STEPS = 5000;

/** Exam index → positions in the sorted exam-room list, for one slot. */
type Packing = Map<number, number[]>;
/** Penalty per extra exam a group sits on one day. */
const SAME_DAY = 5;

const minutes = (clock: string): number => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

/** Teaching periods whose clock range overlaps the exam session's (AM → P2–P4, PM → P6–P7). */
function sessionPeriods(
  instance: Instance,
  session: { start: string; end: string },
): number[] {
  const from = minutes(session.start);
  const to = minutes(session.end);
  return instance.dataset.calendar.periods
    .filter((p) => minutes(p.start) < to && from < minutes(p.end))
    .map((p) => p.id);
}

export function scheduleExams(
  instance: Instance,
  options?: ExamSolveOptions,
): ExamSolveResult {
  const avoid = options?.avoidRoomUnavailability ?? true;
  const steps = options?.maxImproveSteps ?? DEFAULT_IMPROVE_STEPS;
  const maxImprove = Number.isFinite(steps)
    ? Math.max(0, Math.floor(steps))
    : DEFAULT_IMPROVE_STEPS;

  // --------------------------------------------------------------------------- slots, rooms
  const days = [...new Set(instance.exam_days)];
  const sessionList: { id: string; start: string; end: string }[] = [];
  for (const s of instance.dataset.calendar.exam_week.sessions) {
    if (!sessionList.some((x) => x.id === s.id)) sessionList.push(s);
  }
  const perDay = sessionList.length;
  const slotCount = days.length * perDay;
  const dayOf = (slot: number) => Math.floor(slot / perDay);

  const rooms = [...instance.rooms.values()]
    .map((room, index) => ({ room, index, seats: examSeats(room.capacity) }))
    .filter((r) => r.room.allowed_uses.includes("exam") && r.seats > 0)
    .sort((a, b) => a.seats - b.seats || a.index - b.index);
  const roomCount = rooms.length;
  const seats = rooms.map((r) => r.seats);

  // closed[slot * roomCount + r]: the room is under maintenance during the slot.
  const closed = new Uint8Array(slotCount * roomCount);
  if (avoid) {
    const periods = sessionList.map((s) => sessionPeriods(instance, s));
    for (let slot = 0; slot < slotCount; slot++) {
      const day = days[dayOf(slot)];
      const ps = periods[slot % perDay];
      rooms.forEach(({ room }, r) => {
        if (ps.some((p) => isRoomUnavailable(instance, room.id, day, p))) {
          closed[slot * roomCount + r] = 1;
        }
      });
    }
  }

  // ------------------------------------------------------------------------ conflict graph
  const exams = [...instance.exams.values()];
  const examCount = exams.length;
  const groupIndex = new Map<string, number>();
  const examGroups = exams.map((exam) => [
    ...new Set(
      exam.groups.map((g) => {
        let i = groupIndex.get(g);
        if (i === undefined) groupIndex.set(g, (i = groupIndex.size));
        return i;
      }),
    ),
  ]);
  const groupCount = groupIndex.size;
  const byGroup: number[][] = Array.from({ length: groupCount }, () => []);
  examGroups.forEach((gs, e) => gs.forEach((g) => byGroup[g].push(e)));
  const neighbours = examGroups.map((gs, e) => {
    const set = new Set<number>();
    for (const g of gs) for (const f of byGroup[g]) if (f !== e) set.add(f);
    return [...set].sort((a, b) => a - b);
  });

  // ------------------------------------------------------------------------------- state
  const slotOf = new Int32Array(examCount).fill(-1);
  const inSlot: number[][] = Array.from({ length: slotCount }, () => []);
  /** Exam → room positions (into `rooms`) for each slot. */
  const packing: (Packing | null)[] = new Array(slotCount).fill(null);
  /** Exams per (group, day). */
  const groupDay = new Int32Array(groupCount * Math.max(1, days.length));
  const shift = (e: number, day: number, by: number) => {
    for (const g of examGroups[e]) groupDay[g * days.length + day] += by;
  };
  let iterations = 0;

  /** Best-fit-decreasing packing of these exams into the slot's rooms, or null. */
  const packWith = (
    slot: number,
    list: readonly number[],
    allowClosed: boolean,
  ): Packing | null => {
    const order = [...list].sort(
      (a, b) => exams[b].size - exams[a].size || a - b,
    );
    const used = new Uint8Array(roomCount);
    if (!allowClosed) {
      for (let r = 0; r < roomCount; r++) {
        if (closed[slot * roomCount + r]) used[r] = 1;
      }
    }
    const out: Packing = new Map();
    for (const e of order) {
      let need = exams[e].size;
      const chosen: number[] = [];
      while (need > 0 || chosen.length === 0) {
        let pickedSingle = -1;
        for (let r = 0; r < roomCount; r++) {
          if (!used[r] && seats[r] >= need) {
            pickedSingle = r;
            break;
          }
        }
        if (pickedSingle !== -1) {
          used[pickedSingle] = 1;
          chosen.push(pickedSingle);
          break;
        }
        let largest = -1;
        for (let r = roomCount - 1; r >= 0; r--) {
          if (!used[r]) {
            largest = r;
            break;
          }
        }
        if (largest === -1) return null;
        used[largest] = 1;
        chosen.push(largest);
        need -= seats[largest];
      }
      out.set(e, chosen);
    }
    return out;
  };
  /** Packing that avoids closed rooms when it can. */
  const pack = (slot: number, list: readonly number[]) =>
    (avoid ? packWith(slot, list, false) : null) ?? packWith(slot, list, true);

  /** No neighbour of `e` is in the slot (ignoring `except`). */
  const clashFree = (e: number, slot: number, except = -1) =>
    inSlot[slot].every((f) => f === except || !neighbours[e].includes(f));

  const sameDayCost = (e: number, day: number) => {
    let cost = 0;
    for (const g of examGroups[e]) {
      if (groupDay[g * days.length + day] > 0) cost += SAME_DAY;
    }
    return cost;
  };

  const put = (e: number, slot: number, packed: Packing) => {
    slotOf[e] = slot;
    inSlot[slot].push(e);
    packing[slot] = packed;
    shift(e, dayOf(slot), 1);
  };
  /** Removes a placed exam; the rest of its slot is re-packed (a subset always fits). */
  const take = (e: number) => {
    const slot = slotOf[e];
    slotOf[e] = -1;
    inSlot[slot] = inSlot[slot].filter((f) => f !== e);
    packing[slot] = inSlot[slot].length > 0 ? pack(slot, inSlot[slot]) : null;
    shift(e, dayOf(slot), -1);
    return slot;
  };
  const load = (slot: number) =>
    inSlot[slot].reduce((sum, f) => sum + exams[f].size, 0);

  /** The best admissible slot for an unplaced exam, or -1. */
  const bestSlot = (
    e: number,
    skip = -1,
  ): { slot: number; packed: Packing | null; cost: number } => {
    let best: { slot: number; packed: Packing | null; cost: number } = {
      slot: -1,
      packed: null,
      cost: 0,
    };
    let bestKey: [number, number, number] | null = null;
    for (let slot = 0; slot < slotCount; slot++) {
      if (slot === skip || !clashFree(e, slot)) continue;
      const key: [number, number, number] = [
        sameDayCost(e, dayOf(slot)),
        load(slot),
        slot,
      ];
      if (
        bestKey &&
        (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] >= bestKey[1]))
      ) {
        continue;
      }
      const packed = pack(slot, [...inSlot[slot], e]);
      if (!packed) continue;
      bestKey = key;
      best = { slot, packed, cost: key[0] };
    }
    return best;
  };

  // ---------------------------------------------------------------------------- DSATUR
  const unplaced: number[] = [];
  const done = new Uint8Array(examCount);
  for (let step = 0; step < examCount; step++) {
    iterations++;
    let e = -1;
    let eSat = -1;
    for (let f = 0; f < examCount; f++) {
      if (done[f]) continue;
      const blocked = new Set<number>();
      for (const n of neighbours[f])
        if (slotOf[n] !== -1) blocked.add(dayOf(slotOf[n]));
      const sat = blocked.size;
      if (
        e === -1 ||
        sat > eSat ||
        (sat === eSat &&
          (neighbours[f].length > neighbours[e].length ||
            (neighbours[f].length === neighbours[e].length &&
              exams[f].size > exams[e].size)))
      ) {
        e = f;
        eSat = sat;
      }
    }
    done[e] = 1;

    const found = bestSlot(e);
    if (found.slot !== -1 && found.packed) {
      put(e, found.slot, found.packed);
      continue;
    }
    // One eviction: move a single exam out of a slot so `e` fits there.
    let evict: {
      slot: number;
      victim: number;
      to: number;
      cost: number;
    } | null = null;
    for (let slot = 0; slot < slotCount; slot++) {
      const day = dayOf(slot);
      for (const victim of inSlot[slot]) {
        iterations++;
        if (!clashFree(e, slot, victim)) continue;
        if (!pack(slot, [...inSlot[slot].filter((f) => f !== victim), e])) {
          continue;
        }
        // Score the victim's best other slot as if `e` had already taken its place.
        shift(victim, day, -1);
        const here = sameDayCost(e, day);
        shift(e, day, 1);
        const moved = bestSlot(victim, slot);
        shift(e, day, -1);
        shift(victim, day, 1);
        if (moved.slot === -1) continue;
        const cost = here + moved.cost;
        if (!evict || cost < evict.cost) {
          evict = { slot, victim, to: moved.slot, cost };
        }
      }
    }
    if (evict) {
      const { slot, victim, to } = evict;
      take(victim);
      put(e, slot, pack(slot, [...inSlot[slot], e]) as Packing);
      put(victim, to, pack(to, [...inSlot[to], victim]) as Packing);
    } else {
      unplaced.push(e);
    }
  }

  // An eviction may have opened room for an exam left out earlier.
  for (const e of [...unplaced]) {
    const found = bestSlot(e);
    if (found.slot !== -1 && found.packed) {
      put(e, found.slot, found.packed);
      unplaced.splice(unplaced.indexOf(e), 1);
    }
    iterations++;
  }

  // ----------------------------------------------------------------------- improvement
  const f5 = (c: number) => (c > 1 ? SAME_DAY * (c - 1) : 0);
  const penalty = () => {
    let total = 0;
    for (const c of groupDay) total += f5(c);
    return total;
  };
  const moveDelta = (e: number, from: number, to: number) => {
    if (from === to) return 0;
    let delta = 0;
    for (const g of examGroups[e]) {
      const a = groupDay[g * days.length + from];
      const b = groupDay[g * days.length + to];
      delta += f5(a - 1) - f5(a) + f5(b + 1) - f5(b);
    }
    return delta;
  };
  for (let step = 0; step < maxImprove && penalty() > 0; step++) {
    let bestDelta = 0;
    let apply: (() => void) | null = null;
    for (let e = 0; e < examCount; e++) {
      const from = slotOf[e];
      if (from === -1) continue;
      for (let to = 0; to < slotCount; to++) {
        if (to === from) continue;
        const delta = moveDelta(e, dayOf(from), dayOf(to));
        if (delta >= bestDelta || !clashFree(e, to)) continue;
        const packed = pack(to, [...inSlot[to], e]);
        if (!packed) continue;
        bestDelta = delta;
        apply = () => {
          take(e);
          put(e, to, pack(to, [...inSlot[to], e]) as Packing);
        };
      }
    }
    const base = penalty();
    for (let e = 0; e < examCount; e++) {
      const se = slotOf[e];
      if (se === -1) continue;
      for (let f = e + 1; f < examCount; f++) {
        const sf = slotOf[f];
        if (sf === -1 || dayOf(sf) === dayOf(se) || neighbours[e].includes(f)) {
          continue;
        }
        shift(e, dayOf(se), -1);
        shift(e, dayOf(sf), 1);
        shift(f, dayOf(sf), -1);
        shift(f, dayOf(se), 1);
        const delta = penalty() - base;
        shift(f, dayOf(se), -1);
        shift(f, dayOf(sf), 1);
        shift(e, dayOf(sf), -1);
        shift(e, dayOf(se), 1);
        if (delta >= bestDelta) continue;
        if (!clashFree(e, sf, f) || !clashFree(f, se, e)) continue;
        const restE = inSlot[se].filter((x) => x !== e);
        const restF = inSlot[sf].filter((x) => x !== f);
        if (!pack(sf, [...restF, e]) || !pack(se, [...restE, f])) continue;
        bestDelta = delta;
        apply = () => {
          take(e);
          take(f);
          put(e, sf, pack(sf, [...inSlot[sf], e]) as Packing);
          put(f, se, pack(se, [...inSlot[se], f]) as Packing);
        };
      }
    }
    if (!apply) break;
    apply();
    iterations++;
  }

  // ---------------------------------------------------------------------------- output
  const out: ExamPlacement[] = [];
  exams.forEach((exam, e) => {
    const slot = slotOf[e];
    if (slot === -1) return;
    const roomList = (packing[slot] as Packing).get(e) as number[];
    out.push({
      exam_id: exam.id,
      day: days[dayOf(slot)] as ExamPlacement["day"],
      session: sessionList[slot % perDay].id as ExamPlacement["session"],
      rooms: roomList.map((r) => rooms[r].room.id),
    });
  });
  const check = checkExams(instance, out);
  return {
    exams: out,
    violations: check.violations,
    penalty: check.penalty,
    unplaced: exams.filter((_, e) => slotOf[e] === -1).map((x) => x.id),
    iterations,
  };
}
