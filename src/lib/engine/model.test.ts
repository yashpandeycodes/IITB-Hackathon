import { describe, expect, it } from "vitest";

import type { Dataset } from "@/lib/contracts";

import { checkAssignMap, toAssignMap } from "./checker";
import {
  deriveFestDemands,
  festDemandGroups,
  festSummaryFor,
  DEFAULT_FEST_WEIGHT,
} from "./fest";
import { buildInstance, type Instance } from "./instance";
import {
  BLOCKED,
  buildModel,
  dayOfSlot,
  periodOfSlot,
  slotOf,
  TimetableState,
  type Model,
} from "./model";
import { mulberry32, randomInt, shuffle, type Rng } from "./rng";
import { softScoreMap } from "./soft";
import { Moves, constructionOrder } from "./solver-search";
import { datasetWith, publicDataset } from "./test-fixtures";

const PUBLIC = buildInstance(publicDataset());
const MODEL = buildModel(PUBLIC);

const unitOf = (model: Model, sessionId: string) =>
  model.units.find((u) => u.members.some((m) => m.session.id === sessionId))!;
const roomIds = (model: Model, rooms: ArrayLike<number>) =>
  Array.from(rooms, (r) => model.rooms[r].id);
const startLabels = (model: Model, starts: ArrayLike<number>) =>
  Array.from(starts, (s) => `${model.days[dayOfSlot(s)]} P${periodOfSlot(s)}`);

function festState(instance: Instance, model: Model): TimetableState {
  const demands = deriveFestDemands(instance);
  return new TimetableState(model, {
    demands,
    groups: demands.map((d) => festDemandGroups(instance, d.request_id)),
    weightPerPoint: DEFAULT_FEST_WEIGHT,
  });
}

/** The incremental state agrees with every from-scratch reference. */
function expectConsistent(instance: Instance, state: TimetableState) {
  const assignments = state.toAssignments();
  const { assign } = toAssignMap(assignments);
  const reference = softScoreMap(instance, assign).penalties;
  expect(state.penalties()).toEqual(reference);
  expect(state.softFull()).toEqual(reference);
  const hard = checkAssignMap(instance, assign, "timetable").violations;
  // Only unplaced sessions may be reported (H1 "not scheduled").
  expect(hard.filter((v) => !v.detail.endsWith("is not scheduled"))).toEqual(
    [],
  );
  expect(state.festCost).toBe(festSummaryFor(instance, assignments).cost);
  expect(state.festPoints).toBe(state.festFull());
}

describe("buildModel (public dataset)", () => {
  it("has 183 units and no issues", () => {
    expect(MODEL.units).toHaveLength(183);
    expect(MODEL.sessionCount).toBe(189);
    expect(MODEL.issues).toEqual([]);
    expect(MODEL.placeable).toHaveLength(183);
    expect(MODEL.certainlyInfeasible).toBe(false);
  });

  it("ID101-ALL-L1 has 9 starts (MON/WED/FRI P3–5) and only AUD", () => {
    const unit = unitOf(MODEL, "ID101-ALL-L1");
    expect(startLabels(MODEL, unit.starts)).toEqual([
      "MON P3",
      "MON P4",
      "MON P5",
      "WED P3",
      "WED P4",
      "WED P5",
      "FRI P3",
      "FRI P4",
      "FRI P5",
    ]);
    expect(roomIds(MODEL, unit.members[0].rooms)).toEqual(["AUD"]);
  });

  it("labs start only at P2 or P6", () => {
    const labs = MODEL.units.filter((u) => u.members[0].session.kind === "lab");
    expect(labs).toHaveLength(27);
    for (const unit of labs) {
      expect(unit.starts.length).toBeGreaterThan(0);
      for (const s of unit.starts) expect([2, 6]).toContain(periodOfSlot(s));
    }
  });

  it("F08's units start only on TUE and THU", () => {
    const f08 = MODEL.units.filter(
      (u) => u.members[0].session.faculty_id === "F08",
    );
    expect(f08.length).toBeGreaterThan(0);
    for (const unit of f08) {
      const days = new Set(
        Array.from(unit.starts, (s) => MODEL.days[dayOfSlot(s)]),
      );
      expect([...days].sort()).toEqual(["THU", "TUE"]);
    }
  });

  it("blocks LH-4 all of Thursday and CR-103 on Friday afternoon", () => {
    const thu = MODEL.days.indexOf("THU");
    const fri = MODEL.days.indexOf("FRI");
    const lh4 = MODEL.roomIndex.get("LH-4")!;
    const cr103 = MODEL.roomIndex.get("CR-103")!;
    for (let p = 1; p <= 9; p++) {
      expect(MODEL.roomInit[lh4 * MODEL.slotCount + slotOf(thu, p)]).toBe(
        BLOCKED,
      );
    }
    expect(MODEL.roomInit[lh4 * MODEL.slotCount + slotOf(fri, 1)]).not.toBe(
      BLOCKED,
    );
    expect(MODEL.roomInit[cr103 * MODEL.slotCount + slotOf(fri, 6)]).toBe(
      BLOCKED,
    );
    expect(MODEL.roomInit[cr103 * MODEL.slotCount + slotOf(fri, 5)]).not.toBe(
      BLOCKED,
    );
  });

  it("each basket is one unit of 3 members over the 5 Year-3 groups", () => {
    const baskets = MODEL.units.filter((u) => u.basket !== null);
    expect(baskets.map((u) => u.basket)).toEqual(["OEB-1", "OEB-2", "OEB-3"]);
    for (const unit of baskets) {
      expect(unit.members).toHaveLength(3);
      expect(unit.groups).toHaveLength(5);
      expect(unit.s4bCourses).toHaveLength(3);
    }
  });

  it("never offers SH-1, SH-2 or OAT to a session", () => {
    const used = new Set<string>();
    for (const m of MODEL.members) {
      for (const id of roomIds(MODEL, m.rooms)) used.add(id);
    }
    for (const id of ["SH-1", "SH-2", "OAT"]) expect(used.has(id)).toBe(false);
  });
});

describe("buildModel (edge cases)", () => {
  it("a fixed slot leaves exactly one start", () => {
    const model = buildModel(
      buildInstance(
        datasetWith(["CS201-L1", "MA101-AB-L1"], (d) => {
          d.sessions.find((x) => x.id === "MA101-AB-L1")!.fixed_slot = {
            day: "TUE",
            start_period: 4,
          };
        }),
      ),
    );
    const unit = unitOf(model, "MA101-AB-L1");
    expect(unit.fixed).toBe(true);
    expect(startLabels(model, unit.starts)).toEqual(["TUE P4"]);
    expect(model.issues).toEqual([]);
  });

  it("an impossible fixed slot is reported and leaves the unit unplaceable", () => {
    const model = buildModel(
      buildInstance(
        datasetWith(["PH191-A-P1"], (d) => {
          d.sessions[0].fixed_slot = { day: "MON", start_period: 3 };
        }),
      ),
    );
    expect(model.issues.map((i) => i.kind)).toEqual(["fixed_slot_invalid"]);
    expect(model.units[0].starts).toHaveLength(0);
    expect(model.placeable).toHaveLength(0);
  });

  it("falls back to the validator's room rules when allowed_uses would empty a domain", () => {
    const model = buildModel(
      buildInstance(
        datasetWith(["CS201-L1", "PH191-A-P1"], (d) => {
          for (const room of d.rooms) {
            room.allowed_uses = room.allowed_uses.filter(
              (u) => u !== "lecture",
            );
          }
        }),
      ),
    );
    expect(model.issues).toEqual([
      expect.objectContaining({
        kind: "domain_relaxed",
        session_ids: ["CS201-L1"],
      }),
    ]);
    expect(unitOf(model, "CS201-L1").members[0].rooms.length).toBeGreaterThan(
      0,
    );
  });

  it("reports a basket whose members share a faculty member", () => {
    const model = buildModel(
      buildInstance(
        datasetWith(["OE301-L1", "OE302-L1", "OE303-L1"], (d) => {
          d.sessions[1].faculty_id = d.sessions[0].faculty_id;
        }),
      ),
    );
    expect(model.issues.map((i) => i.kind)).toEqual(["basket_conflict"]);
    expect(model.units[0].starts).toHaveLength(0);
  });

  it("drops starts where every room that fits is closed", () => {
    // MECH-WS (the only workshop) closed all of Monday: no workshop lab may start on MON.
    const model = buildModel(
      buildInstance(
        datasetWith(["WS101-A-P1"], (d) => {
          d.room_unavailability.push({
            room_id: "MECH-WS",
            day: "MON",
            periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          });
        }),
      ),
    );
    const days = new Set(
      Array.from(model.units[0].starts, (s) => model.days[dayOfSlot(s)]),
    );
    expect(days.has("MON")).toBe(false);
    expect(days.size).toBe(4);
    expect(model.issues).toEqual([]);
  });

  it("reports a fixed slot when every room that fits is closed then", () => {
    const model = buildModel(
      buildInstance(
        datasetWith(["ID101-ALL-L1"], (d) => {
          d.sessions[0].fixed_slot = { day: "WED", start_period: 4 };
          d.room_unavailability.push({
            room_id: "AUD",
            day: "WED",
            periods: [4],
          });
        }),
      ),
    );
    expect(model.issues).toEqual([
      {
        kind: "fixed_slot_invalid",
        session_ids: ["ID101-ALL-L1"],
        detail:
          "ID101-ALL-L1: fixed at WED P4, but every room that fits it is closed then",
      },
    ]);
    expect(model.units[0].starts).toHaveLength(0);
    expect(model.certainlyInfeasible).toBe(true);
  });

  it("reports an empty domain when the only room is closed at every feasible start", () => {
    const model = buildModel(
      buildInstance(
        datasetWith(["ID101-ALL-L1"], (d) => {
          for (const day of ["MON", "WED", "FRI"] as const) {
            d.room_unavailability.push({
              room_id: "AUD",
              day,
              periods: [3, 4, 5],
            });
          }
        }),
      ),
    );
    expect(model.issues).toEqual([
      expect.objectContaining({
        kind: "empty_domain",
        detail: expect.stringContaining("every room that fits is closed"),
      }),
    ]);
  });

  it("reports fixed sessions that share a group, a faculty member or the only open room", () => {
    const fix = (d: Dataset, id: string, day: "TUE" | "WED", start: number) => {
      d.sessions.find((s) => s.id === id)!.fixed_slot = {
        day,
        start_period: start,
      };
    };
    const issuesFor = (ids: string[], edit: (d: Dataset) => void) =>
      buildModel(buildInstance(datasetWith(ids, edit))).issues;

    // CS201-L1 and CS202-L1 both teach CSE-2.
    expect(
      issuesFor(["CS201-L1", "CS202-L1"], (d) => {
        fix(d, "CS201-L1", "TUE", 3);
        fix(d, "CS202-L1", "TUE", 3);
      }),
    ).toEqual([
      {
        kind: "fixed_slot_invalid",
        session_ids: ["CS201-L1", "CS202-L1"],
        detail:
          "CS201-L1 (fixed TUE P3) and CS202-L1 (fixed TUE P3) overlap and share group CSE-2",
      },
    ]);
    // Different times on the same day are fine.
    expect(
      issuesFor(["CS201-L1", "CS202-L1"], (d) => {
        fix(d, "CS201-L1", "TUE", 3);
        fix(d, "CS202-L1", "TUE", 4);
      }),
    ).toEqual([]);
    // A 3-hour lab (moved to F02 and another group) overlaps F02's lecture at P4.
    expect(
      issuesFor(["CS201-L1", "CS291-P1"], (d) => {
        const lab = d.sessions.find((s) => s.id === "CS291-P1")!;
        lab.faculty_id = "F02";
        lab.groups = ["CE-3"];
        fix(d, "CS291-P1", "WED", 2);
        fix(d, "CS201-L1", "WED", 4);
      }).map((i) => i.detail),
    ).toEqual([
      "CS201-L1 (fixed WED P4) and CS291-P1 (fixed WED P2) overlap and share faculty F02",
    ]);
    // Different groups and faculty, but both need AUD, the only room that seats 400.
    expect(
      issuesFor(["CS201-L1", "CS202-L1"], (d) => {
        for (const s of d.sessions) s.size = 400;
        d.sessions.find((s) => s.id === "CS202-L1")!.groups = ["ECE-2"];
        fix(d, "CS201-L1", "WED", 3);
        fix(d, "CS202-L1", "WED", 3);
      }).map((i) => i.detail),
    ).toEqual([
      "CS201-L1 (fixed WED P3) and CS202-L1 (fixed WED P3) overlap and share room AUD, the only open room that fits both",
    ]);
  });

  it("reports fixed sessions that exceed a faculty member's daily cap", () => {
    // F03's three 3-hour labs, two of them fixed on the same day (cap 4).
    const model = buildModel(
      buildInstance(
        datasetWith(["CS191-A-P1", "CS191-B-P1"], (d) => {
          d.sessions[0].fixed_slot = { day: "MON", start_period: 2 };
          d.sessions[1].fixed_slot = { day: "MON", start_period: 6 };
        }),
      ),
    );
    expect(model.issues).toEqual([
      {
        kind: "fixed_slot_invalid",
        session_ids: ["CS191-A-P1", "CS191-B-P1"],
        detail: "Fixed sessions of F03 on MON add up to 6 hours (max 4)",
      },
    ]);
    expect(model.certainlyInfeasible).toBe(true);
  });

  it("reports a session that no room can hold", () => {
    const model = buildModel(
      buildInstance(
        datasetWith(["ID101-ALL-L1"], (d) => {
          d.sessions[0].size = 9999;
        }),
      ),
    );
    expect(model.issues.map((i) => i.kind)).toEqual(["empty_domain"]);
  });
});

// ------------------------------------------------------------------------- property test

/** One random feasible move; returns false (state unchanged) if the move is infeasible. */
function randomMove(state: TimetableState, rng: Rng): boolean {
  const { model } = state;
  const units = model.placeable;
  const u = units[Math.floor(rng() * units.length)];
  if (!state.isPlaced(u)) return false;
  const unit = model.units[u];
  const n = unit.members.length;
  const own = state.roomsOf(u, new Int32Array(n));
  const slot = state.unitSlot[u];
  const kind = rng();

  if (kind < 0.6) {
    // Relocate to a random start, with random or first-free rooms.
    const s = unit.starts[Math.floor(rng() * unit.starts.length)];
    state.remove(u);
    const rooms = new Int32Array(n);
    const found =
      rng() < 0.5
        ? state.randomFreeRooms(u, s, rng, rooms)
        : state.firstFreeRooms(u, s, rooms);
    if (found && state.canPlace(u, s, rooms)) {
      state.place(u, s, rooms);
      return true;
    }
    state.place(u, slot, own);
    return false;
  }

  // Swap starts with another unit (sharing a group half the time).
  const sharing = units.filter(
    (v) =>
      v !== u &&
      model.units[v].groups.some((g) => unit.groups.includes(g)) &&
      state.isPlaced(v),
  );
  const pool = rng() < 0.5 && sharing.length > 0 ? sharing : units;
  const v = pool[Math.floor(rng() * pool.length)];
  if (v === u || !state.isPlaced(v)) return false;
  const other = model.units[v];
  const sv = state.unitSlot[v];
  if (!unit.starts.includes(sv) || !other.starts.includes(slot)) return false;
  const ownV = state.roomsOf(v, new Int32Array(other.members.length));
  state.remove(u);
  state.remove(v);
  const ru = new Int32Array(n);
  const rv = new Int32Array(other.members.length);
  if (state.firstFreeRooms(u, sv, ru) && state.canPlace(u, sv, ru)) {
    state.place(u, sv, ru);
    if (state.firstFreeRooms(v, slot, rv) && state.canPlace(v, slot, rv)) {
      state.place(v, slot, rv);
      return true;
    }
    state.remove(u);
  }
  state.place(u, slot, own);
  state.place(v, sv, ownV);
  return false;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;

/**
 * The public data with the shapes soft.ts handles specially: basket members of 1–3 periods,
 * partial group overlap between members, groups listed twice, tutorials inside baskets, and
 * day-restricted avoid preferences.
 */
function mutatedDataset(rng: Rng): Dataset {
  const dataset = publicDataset();
  const year3 = ["CSE-3", "ECE-3", "EE-3", "ME-3", "CE-3"];
  for (const s of dataset.sessions) {
    if (s.basket_slot) {
      s.duration = 1 + randomInt(rng, 3);
      s.groups = shuffle(rng, year3).slice(0, 1 + randomInt(rng, 4));
      if (rng() < 0.4) s.groups.push(s.groups[0]);
      if (rng() < 0.3) s.kind = "tutorial";
    } else if (rng() < 0.15) {
      s.groups = [...s.groups, s.groups[0]];
    }
  }
  for (const f of dataset.faculty) {
    if (rng() < 0.4) {
      f.preferences = [
        ...f.preferences,
        {
          type: "avoid",
          days: shuffle(rng, DAYS).slice(0, 1 + randomInt(rng, 2)),
          periods: [1 + randomInt(rng, 9), 1 + randomInt(rng, 9)],
        },
      ];
    }
  }
  return dataset;
}

/** Public data plus `n` seeded daytime club requests (half of them with a mandatory group). */
function withSyntheticRequests(n: number): Dataset {
  const dataset = publicDataset();
  const rng = mulberry32(n + 9);
  const groups = dataset.student_groups.map((g) => g.id);
  for (let i = 0; i < n; i++) {
    const from = 1 + randomInt(rng, 8);
    dataset.booking_requests.push({
      id: `SYN-${i}`,
      submitted_at: "2027-01-10T10:00:00+05:30",
      requester: "synthetic",
      role: "club",
      department: null,
      requested_category: "club_event",
      title: "Synthetic",
      attendance: 30,
      duration_periods: 1 + randomInt(rng, 2),
      windows: [
        {
          day: DAYS[randomInt(rng, 5)],
          from_period: from,
          to_period: from + 2,
        },
      ],
      room_types: ["classroom", "lecture_hall"],
      needs: [],
      requested_room: null,
      mandatory_for_groups:
        rng() < 0.5 ? [groups[randomInt(rng, groups.length)]] : [],
      series_id: null,
    });
  }
  return dataset;
}

describe("TimetableState", () => {
  it("keeps soft, fest and hard-feasibility exact over 3,000 random moves", () => {
    const state = festState(PUBLIC, MODEL);
    const rng = mulberry32(7);
    const moves = new Moves(state, rng);
    expect(moves.construct(constructionOrder(MODEL))).toEqual([]);
    expectConsistent(PUBLIC, state);

    let applied = 0;
    let swaps = 0;
    const seen = { S2: false, S3: false, S4: false, S5: false, S6: false };
    for (let i = 1; i <= 3000; i++) {
      const before = state.unitSlot.slice();
      if (randomMove(state, rng)) {
        applied++;
        let changed = 0;
        for (let u = 0; u < before.length; u++) {
          if (before[u] !== state.unitSlot[u]) changed++;
        }
        if (changed === 2) swaps++;
      }
      const pen = state.penalties();
      for (const key of Object.keys(seen) as (keyof typeof seen)[]) {
        if (pen[key] > 0) seen[key] = true;
      }
      if (i % 25 === 0) expectConsistent(PUBLIC, state);
    }
    expect(state.unplacedSessions).toBe(0);
    expect(applied).toBeGreaterThan(1000);
    expect(swaps).toBeGreaterThan(50);
    // The walk visits states where the bucketed penalties are actually exercised.
    expect(seen).toEqual({ S2: true, S3: true, S4: true, S5: true, S6: true });
  });

  it("stays exact on mutated datasets (odd baskets, repeated groups, day-limited preferences)", () => {
    for (const seed of [99, 100, 101]) {
      const rng = mulberry32(seed);
      const instance = buildInstance(mutatedDataset(rng));
      const model = buildModel(instance);
      expect(model.units).toHaveLength(183);
      const state = festState(instance, model);
      new Moves(state, rng).construct(constructionOrder(model));
      const baskets = model.units.filter(
        (u) => u.basket !== null && state.isPlaced(u.index),
      );
      expect(baskets.length).toBeGreaterThan(0);
      expect(model.units.some((u) => new Set(u.groupSpan).size > 1)).toBe(true);
      expectConsistent(instance, state);
      let applied = 0;
      for (let i = 1; i <= 1000; i++) {
        if (randomMove(state, rng)) applied++;
        if (i % 25 === 0) expectConsistent(instance, state);
      }
      expect(applied).toBeGreaterThan(300);
    }
  });

  it("updates fest costs in proportion to the touched cells, not the number of demands", () => {
    const instance = buildInstance(withSyntheticRequests(200));
    const model = buildModel(instance);
    const demands = deriveFestDemands(instance);
    const options = demands.reduce((n, d) => n + d.options.length, 0);
    expect(demands.length).toBeGreaterThan(150);
    const state = festState(instance, model);
    const rng = mulberry32(5);
    new Moves(state, rng).construct(constructionOrder(model));
    const start = state.festWork;
    let ops = 0;
    const own = new Int32Array(1);
    const rooms = new Int32Array(1);
    for (let k = 0; k < 2000; k++) {
      const u = model.placeable[randomInt(rng, model.placeable.length)];
      if (!state.isPlaced(u) || model.units[u].members.length !== 1) continue;
      const slot = state.removeInto(u, own);
      const starts = model.units[u].starts;
      const s = starts[randomInt(rng, starts.length)];
      if (state.firstFreeRooms(u, s, rooms) && state.canPlace(u, s, rooms)) {
        state.place(u, s, rooms);
      } else {
        state.place(u, slot, own);
      }
      ops += 2;
    }
    const perOp = (state.festWork - start) / ops;
    // Scanning every demand on every place/remove (the old cost) would alone exceed this.
    expect(perOp).toBeLessThan(demands.length);
    expect(perOp).toBeLessThan(options / 50);
    expect(state.festPoints).toBe(state.festFull());
    expect(state.festCost).toBe(
      festSummaryFor(instance, state.toAssignments()).cost,
    );
  });

  it("snapshot/restore and clear rebuild the same state", () => {
    const state = festState(PUBLIC, MODEL);
    const moves = new Moves(state, mulberry32(3));
    moves.construct(constructionOrder(MODEL));
    const snap = state.snapshot();
    const pen = state.penalties();
    const fest = state.festPoints;
    const assignments = state.toAssignments();
    state.clear();
    expect(state.unplacedSessions).toBe(189);
    expect(state.soft).toBe(0);
    expect(state.festPoints).toBe(0);
    state.restore(snap);
    expect(state.penalties()).toEqual(pen);
    expect(state.festPoints).toBe(fest);
    expect(state.toAssignments()).toEqual(assignments);
  });

  it("emits assignments in dataset session order", () => {
    const state = festState(PUBLIC, MODEL);
    new Moves(state, mulberry32(1)).construct(constructionOrder(MODEL));
    expect(state.toAssignments().map((a) => a.session_id)).toEqual([
      ...PUBLIC.sessions.keys(),
    ]);
  });

  it("counts S3 above 6 hours exactly like soft.ts", () => {
    // One group, eight one-hour lectures with eight different faculty on one day.
    const ids = publicDataset()
      .sessions.filter(
        (s) =>
          s.groups.length === 1 &&
          s.groups[0] === "CSE-2" &&
          s.kind === "lecture" &&
          s.duration === 1,
      )
      .map((s) => s.id)
      .slice(0, 8);
    expect(ids).toHaveLength(8);
    const dataset = datasetWith(ids, (d: Dataset) => {
      d.sessions.forEach((s, i) => (s.faculty_id = d.faculty[i].id));
      for (const f of d.faculty) {
        f.max_hours_per_day = 9;
        f.unavailable = [];
        f.preferences = [];
      }
    });
    const instance = buildInstance(dataset);
    const model = buildModel(instance);
    const state = new TimetableState(model);
    const tue = model.days.indexOf("TUE");
    model.units.forEach((unit, i) => {
      const rooms = new Int32Array(1);
      expect(state.firstFreeRooms(unit.index, slotOf(tue, i + 1), rooms)).toBe(
        true,
      );
      expect(state.canPlace(unit.index, slotOf(tue, i + 1), rooms)).toBe(true);
      state.place(unit.index, slotOf(tue, i + 1), rooms);
    });
    expect(state.penalties().S3).toBe(6);
    expect(state.penalties()).toEqual(
      softScoreMap(instance, toAssignMap(state.toAssignments()).assign)
        .penalties,
    );
    state.remove(model.units[7].index);
    expect(state.penalties().S3).toBe(3);
    expect(state.penalties()).toEqual(state.softFull());
  });

  it("charges S4 +9 when two baskets share a day", () => {
    const ids = [
      "OE301-L1",
      "OE302-L1",
      "OE303-L1",
      "OE301-L2",
      "OE302-L2",
      "OE303-L2",
    ];
    const instance = buildInstance(datasetWith(ids));
    const model = buildModel(instance);
    const state = new TimetableState(model);
    const [oeb1, oeb2] = model.units;
    const rooms = new Int32Array(3);
    const mon = model.days.indexOf("MON");
    const tue = model.days.indexOf("TUE");
    const put = (u: number, slot: number) => {
      expect(state.firstFreeRooms(u, slot, rooms)).toBe(true);
      expect(state.canPlace(u, slot, rooms)).toBe(true);
      state.place(u, slot, rooms);
    };
    put(oeb1.index, slotOf(mon, 3));
    put(oeb2.index, slotOf(tue, 3));
    expect(state.penalties().S4).toBe(0);
    state.remove(oeb2.index);
    put(oeb2.index, slotOf(mon, 4));
    expect(state.penalties().S4).toBe(9);
    expect(state.penalties()).toEqual(
      softScoreMap(instance, toAssignMap(state.toAssignments()).assign)
        .penalties,
    );
    expect(state.softFull()).toEqual(state.penalties());
  });

  it("lists the occupants of a placement's cells as blockers", () => {
    const state = festState(PUBLIC, MODEL);
    new Moves(state, mulberry32(5)).construct(constructionOrder(MODEL));
    const unit = unitOf(MODEL, "MA101-AB-L1");
    const slot = state.unitSlot[unit.index];
    const rooms = state.roomsOf(unit.index, new Int32Array(1));
    state.remove(unit.index);
    const out: number[] = [];
    expect(state.conflicts(unit.index, slot, rooms, out)).toBe(true);
    expect(out).toEqual([]);
    let checked = 0;
    for (const s of unit.starts) {
      if (state.canPlace(unit.index, s, rooms)) continue;
      expect(state.conflicts(unit.index, s, rooms, out)).toBe(true);
      expect(out.length).toBeGreaterThan(0);
      const snap = state.snapshot();
      for (const v of out) state.remove(v);
      expect(state.canPlace(unit.index, s, rooms)).toBe(true);
      state.restore(snap);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("treats H12 overflow as a conflict", () => {
    // F03 teaches three 3-hour labs under a 4-hour daily cap.
    const instance = buildInstance(
      datasetWith(["CS191-A-P1", "CS191-B-P1", "CS291-P1"]),
    );
    const model = buildModel(instance);
    const state = new TimetableState(model);
    const [a, b] = model.units;
    const mon = model.days.indexOf("MON");
    const rooms = new Int32Array(1);
    expect(state.firstFreeRooms(a.index, slotOf(mon, 2), rooms)).toBe(true);
    state.place(a.index, slotOf(mon, 2), rooms);
    expect(state.firstFreeRooms(b.index, slotOf(mon, 6), rooms)).toBe(true);
    expect(state.canPlace(b.index, slotOf(mon, 6), rooms)).toBe(false);
    const out: number[] = [];
    expect(state.conflicts(b.index, slotOf(mon, 6), rooms, out)).toBe(true);
    expect(out).toEqual([a.index]);
    // A session longer than the daily cap can never be made to fit.
    const tight = buildModel(
      buildInstance(
        datasetWith(["CS191-A-P1"], (d) => {
          d.faculty.find((f) => f.id === "F03")!.max_hours_per_day = 2;
        }),
      ),
    );
    expect(tight.issues.map((i) => i.kind)).toEqual(["empty_domain"]);
  });
});
