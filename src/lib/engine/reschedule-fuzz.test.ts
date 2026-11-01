/**
 * Seeded fuzz of the rescheduler over the public dataset and the committed timetable: every
 * change type, mixes of them, pins and fixed sessions. Each result is either feasible (every
 * session placed, 0 hard violations, pins honoured, fixed sessions in place, the validator's
 * stability, every move in the diff, at least one move per broken session) or infeasible with a
 * conflict report. A second, basket-focused fuzz checks the move count against a small
 * exhaustive search.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ConflictEntrySchema,
  MoveDiffSchema,
  RescheduleMetaSchema,
  type Assignment,
  type Dataset,
  type Day,
  type DisruptionChange,
} from "@/lib/contracts";

import { checkTimetable, toAssignMap } from "./checker";
import { applyDisruption } from "./disruption";
import { buildInstance } from "./instance";
import { RepairContext, searchLimits } from "./repair";
import { reschedule, type RescheduleResult } from "./reschedule";
import { mulberry32, randomInt, type Rng } from "./rng";
import { publicDataset } from "./test-fixtures";
import { computeStability } from "./validate";

const BASELINE: Assignment[] = JSON.parse(
  readFileSync("exports/schedule.json", "utf8"),
).sessions;
const DAYS: readonly Day[] = ["MON", "TUE", "WED", "THU", "FRI"];
const CASES = 150;

const periodRange = (rng: Rng) => {
  const from = 1 + randomInt(rng, 9);
  const to = Math.min(9, from + randomInt(rng, 9));
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
};
const someDays = (rng: Rng, n: number) => [
  ...new Set(Array.from({ length: n }, () => DAYS[randomInt(rng, 5)])),
];

type Case = {
  dataset: Dataset;
  changes: DisruptionChange[];
  pins: Assignment[];
  fixed: Assignment[];
};

/** One random case; `seed` picks the mix (cases cycle through every change type first). */
function makeCase(seed: number): Case {
  const rng = mulberry32(seed * 7919);
  const dataset = publicDataset();
  const plain = dataset.sessions.filter((s) => !s.basket_slot);
  const changes: DisruptionChange[] = [];
  const pins: Assignment[] = [];
  const removed = new Set<string>();
  const fixed: Assignment[] = [];

  // Every few cases, fix some sessions where the baseline has them.
  if (seed % 4 === 0) {
    for (let i = 0; i < 3; i++) {
      const s = plain[randomInt(rng, plain.length)];
      const at = BASELINE.find((a) => a.session_id === s.id) as Assignment;
      s.fixed_slot = { day: at.day, start_period: at.start_period };
      fixed.push(at);
    }
  }
  const count = seed <= 6 ? 1 : 1 + randomInt(rng, 4);
  for (let i = 0; i < count; i++) {
    const type = seed <= 6 ? seed - 1 : randomInt(rng, 6);
    if (type === 0) {
      const f = dataset.faculty[randomInt(rng, dataset.faculty.length)];
      changes.push({
        type: "faculty_unavailable",
        faculty_id: f.id,
        days: someDays(rng, 1 + randomInt(rng, 2)),
        periods: periodRange(rng),
        reason: "Fuzz leave",
      });
    } else if (type === 1) {
      const room = dataset.rooms[randomInt(rng, 17)];
      changes.push({
        type: "room_unavailable",
        room_id: room.id,
        days: someDays(rng, 1 + randomInt(rng, 3)),
        periods: periodRange(rng),
        reason: "Fuzz repair",
      });
    } else if (type === 2) {
      const id = `FZ-${seed}-${i}`;
      const template = plain[randomInt(rng, plain.length)];
      changes.push({
        type: "add_faculty",
        faculty: {
          id,
          name: "Fuzz Faculty",
          department: "CSE",
          max_hours_per_day: 4,
          needs_accessible: false,
          unavailable: [],
          preferences: [],
        },
      });
      changes.push({
        type: "add_session",
        session: {
          ...structuredClone(template),
          id: `${template.id}-F${seed}-${i}`,
          faculty_id: id,
          fixed_slot: null,
        },
      });
    } else if (type === 3) {
      const template = plain[randomInt(rng, plain.length)];
      changes.push({
        type: "add_session",
        session: {
          ...structuredClone(template),
          id: `${template.id}-A${seed}-${i}`,
          fixed_slot: null,
        },
      });
    } else if (type === 4) {
      const s = dataset.sessions[randomInt(rng, dataset.sessions.length)];
      if (!removed.has(s.id)) {
        removed.add(s.id);
        changes.push({ type: "remove_session", session_id: s.id });
      }
    } else {
      const s = plain[randomInt(rng, plain.length)];
      if (removed.has(s.id) || pins.some((p) => p.session_id === s.id))
        continue;
      const rooms = dataset.rooms.filter(
        (r) =>
          s.room_types.includes(r.type) &&
          r.capacity >= s.size &&
          (!s.needs_accessible || r.accessible),
      );
      const start =
        s.kind === "lab"
          ? rng() < 0.5
            ? 2
            : 6
          : 1 + randomInt(rng, 9 - s.duration + 1);
      pins.push({
        session_id: s.id,
        day: DAYS[randomInt(rng, 5)],
        start_period: start,
        room_id: rooms[randomInt(rng, rooms.length)].id,
      });
    }
  }
  return { dataset, changes, pins, fixed };
}

describe("reschedule fuzz (seeded)", () => {
  it(`keeps every invariant over ${CASES} random change lists`, () => {
    let feasible = 0;
    let infeasible = 0;
    let cut = 0;
    for (let seed = 1; seed <= CASES; seed++) {
      const { dataset, changes, pins, fixed } = makeCase(seed);
      // A frozen clock: only the node budget can end a search, so every machine sees the
      // same results.
      const r = reschedule({
        dataset,
        baseline: BASELINE,
        changes,
        placements: pins,
        options: { now: () => 0 },
      });
      if (r.meta.stopped_by !== "complete") cut++;
      RescheduleMetaSchema.parse(r.meta);
      for (const d of r.diff) MoveDiffSchema.parse(d);
      const where = `seed ${seed}`;
      if (!r.feasible) {
        infeasible++;
        expect(r.conflicts.length, where).toBeGreaterThan(0);
        for (const c of r.conflicts) {
          ConflictEntrySchema.parse(c);
          expect(c.summary.length, where).toBeGreaterThan(0);
        }
        continue;
      }
      feasible++;
      const instance = buildInstance(r.dataset);
      expect(checkTimetable(instance, r.assignments).violations, where).toEqual(
        [],
      );
      expect(r.hard, where).toEqual([]);
      expect(r.assignments.length, where).toBe(r.dataset.sessions.length);
      for (const pin of pins) expect(r.assignments, where).toContainEqual(pin);
      for (const at of fixed) {
        if (removed(changes, at.session_id)) continue;
        const now = r.assignments.find((a) => a.session_id === at.session_id);
        expect([now?.day, now?.start_period], where).toEqual([
          at.day,
          at.start_period,
        ]);
      }
      const stability = computeStability(
        instance,
        toAssignMap(r.assignments).assign,
        toAssignMap(BASELINE).assign,
      );
      expect(r.moved_count, where).toBe(stability.sessions_moved);
      expect(r.time_changed, where).toBe(stability.time_changed);
      const moved = r.diff
        .filter((d) => d.move !== "added" && d.move !== "removed")
        .map((d) => d.session_id)
        .sort();
      expect(moved, where).toEqual(stability.moved_ids);
      const broken = r.diff.filter((d) => d.cause === "broken").length;
      expect(r.moved_count, where).toBeGreaterThanOrEqual(broken);
      for (const d of r.diff.filter((x) => x.cause === "evicted")) {
        expect(d.displaced_by, where).not.toBeNull();
      }
    }
    expect(feasible).toBeGreaterThan(CASES / 2);
    expect(infeasible).toBeGreaterThan(0);
    // Every case finishes within the default node budget.
    expect(cut).toBe(0);
  }, 60_000);

  it("is deterministic on a mixed case", () => {
    const { dataset, changes, pins } = makeCase(23);
    const a = reschedule({
      dataset,
      baseline: BASELINE,
      changes,
      placements: pins,
    });
    const b = reschedule({
      dataset,
      baseline: BASELINE,
      changes,
      placements: pins,
    });
    expect({ ...b, meta: { ...b.meta, ms: 0 } }).toEqual({
      ...a,
      meta: { ...a.meta, ms: 0 },
    });
  });
});

function removed(changes: readonly DisruptionChange[], id: string): boolean {
  return changes.some(
    (c) => c.type === "remove_session" && c.session_id === id,
  );
}

// ------------------------------------------------------------------ baskets vs exhaustive search

/**
 * The fewest moves of a fix that moves only the sessions the rescheduler found broken (or added),
 * if that is below `r.moved_count`; null otherwise. Every other session stays exactly where the
 * baseline has it; a broken session is tried at every start in every suitable room, a broken
 * basket at every start with its baseline rooms first. Small depth-first search with a bound.
 */
function cheaperFix(
  dataset: Dataset,
  changes: readonly DisruptionChange[],
  r: RescheduleResult,
  nodeCap = 3_000,
): number | null {
  const changed = applyDisruption(dataset, { changes });
  const ctx = new RepairContext(changed, BASELINE);
  const { model, state } = ctx;
  const outcome = ctx.run(
    [],
    searchLimits(
      {},
      { maxDepth: 3, maxNodes: 200_000, timeBudgetMs: 0 },
      () => 0,
    ),
  );
  const broken = model.units
    .filter((u) =>
      u.members.some(
        (m) =>
          outcome.causes[m.index] === "broken" ||
          outcome.causes[m.index] === "added",
      ),
    )
    .map((u) => u.index);
  const brokenSet = new Set(broken);
  state.clear();
  for (const u of model.units) {
    if (brokenSet.has(u.index)) continue;
    const slot = ctx.baseSlot[u.members[0].index];
    const rooms = Int32Array.from(u.members.map((m) => ctx.baseRoom[m.index]));
    if (!state.canPlace(u.index, slot, rooms)) return null;
    state.place(u.index, slot, rooms);
  }
  const free = (room: number, slot: number, duration: number) => {
    for (let k = 0; k < duration; k++)
      if (state.roomOcc[room * model.slotCount + slot + k] !== -1) return false;
    return true;
  };
  const basketRooms = (u: number, slot: number): Int32Array | null => {
    const { members } = model.units[u];
    const rooms = new Int32Array(members.length).fill(-1);
    members.forEach((m, i) => {
      const br = ctx.baseRoom[m.index];
      if (
        br >= 0 &&
        ctx.baseRoomSuits[m.index] &&
        free(br, slot, m.duration) &&
        !rooms.includes(br)
      )
        rooms[i] = br;
    });
    for (let i = 0; i < members.length; i++) {
      if (rooms[i] !== -1) continue;
      const m = members[i];
      const pick = Array.from(m.rooms).find(
        (room) => !rooms.includes(room) && free(room, slot, m.duration),
      );
      if (pick === undefined) return null;
      rooms[i] = pick;
    }
    return rooms;
  };
  type Option = { slot: number; rooms: Int32Array; cost: number };
  const optionsOf = (u: number): Option[] => {
    const unit = model.units[u];
    const list: Option[] = [];
    for (const slot of unit.starts) {
      const choices =
        unit.members.length === 1
          ? Array.from(unit.members[0].rooms).map((room) => Int32Array.of(room))
          : [basketRooms(u, slot)];
      for (const rooms of choices)
        if (rooms && state.canPlace(u, slot, rooms))
          list.push({ slot, rooms, cost: ctx.movesAt(u, slot, rooms)[0] });
    }
    return list.sort((a, b) => a.cost - b.cost);
  };
  const order = [...broken].sort(
    (a, b) => optionsOf(a).length - optionsOf(b).length,
  );
  let best = r.moved_count;
  let found: Map<number, Option> | null = null;
  const chosen = new Map<number, Option>();
  let nodes = 0;
  const dfs = (i: number, cost: number) => {
    if (nodes++ > nodeCap || cost >= best) return;
    if (i === order.length) {
      best = cost;
      found = new Map(chosen);
      return;
    }
    const u = order[i];
    for (const o of optionsOf(u)) {
      if (cost + o.cost >= best) break;
      state.place(u, o.slot, o.rooms);
      chosen.set(u, o);
      dfs(i + 1, cost + o.cost);
      chosen.delete(u);
      state.remove(u);
    }
  };
  dfs(0, 0);
  if (!found) return null;
  for (const [u, o] of found as Map<number, Option>)
    state.place(u, o.slot, o.rooms);
  const assignments = state.toAssignments();
  if (checkTimetable(ctx.instance, assignments).violations.length > 0)
    return null;
  return computeStability(
    ctx.instance,
    toAssignMap(assignments).assign,
    toAssignMap(BASELINE).assign,
  ).sessions_moved;
}

/**
 * Baskets under pressure: two basket members (usually of different baskets) each lose their room
 * at the basket's slot or their teacher then, so a basket must change room or time while another
 * session competes for the same rooms; sometimes another teacher is away too.
 */
function basketCase(seed: number): {
  dataset: Dataset;
  changes: DisruptionChange[];
} {
  const rng = mulberry32(seed * 104_729);
  const dataset = publicDataset();
  const byId = new Map(dataset.sessions.map((s) => [s.id, s]));
  const members = BASELINE.filter((a) => byId.get(a.session_id)?.basket_slot);
  const around = (p: number) => {
    const from = Math.max(1, p - randomInt(rng, 3));
    const to = Math.min(9, p + randomInt(rng, 4));
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  };
  const changes: DisruptionChange[] = [];
  for (let k = 0; k < 2; k++) {
    const at = members[randomInt(rng, members.length)];
    if (rng() < 0.5)
      changes.push({
        type: "room_unavailable",
        room_id: at.room_id,
        days: [at.day],
        periods: around(at.start_period),
        reason: "Fuzz repair",
      });
    else
      changes.push({
        type: "faculty_unavailable",
        faculty_id: byId.get(at.session_id)!.faculty_id,
        days: [at.day],
        periods: around(at.start_period),
        reason: "Fuzz leave",
      });
  }
  if (rng() < 0.5)
    changes.push({
      type: "faculty_unavailable",
      faculty_id: dataset.faculty[randomInt(rng, dataset.faculty.length)].id,
      days: [DAYS[randomInt(rng, 5)]],
      periods: periodRange(rng),
      reason: "Fuzz leave",
    });
  return { dataset, changes };
}

const BASKET_CASES = 30;

describe("reschedule fuzz: baskets against an exhaustive search", () => {
  it(`never moves more than a fix that moves only the broken sessions (${BASKET_CASES} cases)`, () => {
    let checked = 0;
    for (let seed = 1; seed <= BASKET_CASES; seed++) {
      const { dataset, changes } = basketCase(seed);
      const r = reschedule({
        dataset,
        baseline: BASELINE,
        changes,
        options: { now: () => 0 },
      });
      if (!r.feasible) continue;
      checked++;
      const where = `seed ${seed}: ${JSON.stringify(changes)}`;
      expect(r.hard, where).toEqual([]);
      expect(cheaperFix(dataset, changes, r), where).toBeNull();
    }
    expect(checked).toBeGreaterThan(BASKET_CASES / 2);
  }, 60_000);
});
