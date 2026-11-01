/**
 * Minimal-move rescheduling on the public dataset and the committed `exports/schedule.json`:
 * the sample disruption, pins, infeasible change lists, determinism, change checks and titles.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ConflictEntrySchema,
  DisruptionSchema,
  MoveDiffSchema,
  RescheduleMetaSchema,
  SoftPenaltySummarySchema,
  type Assignment,
  type Dataset,
  type Day,
  type DisruptionChange,
  type Session,
} from "@/lib/contracts";

import sampleDisruption from "../../../data/sample_disruption.json";

import { checkTimetable, toAssignMap } from "./checker";
import { buildInstance } from "./instance";
import { checkPlacement } from "./manual";
import {
  describeChanges,
  RESCHEDULE_ALGORITHM,
  reschedule,
  suggestMoves,
  validateChanges,
  type RescheduleResult,
} from "./reschedule";
import { softScore } from "./soft";
import { at, datasetWith, publicDataset } from "./test-fixtures";
import { computeStability, validateSchedule } from "./validate";

const BASELINE: Assignment[] = JSON.parse(
  readFileSync("exports/schedule.json", "utf8"),
).sessions;
const SAMPLE = DisruptionSchema.parse(sampleDisruption).changes;
const ALL_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const baseOf = (id: string) =>
  BASELINE.find((a) => a.session_id === id) as Assignment;

/** Checks every invariant of a result that claims to be feasible. */
function expectFeasible(r: RescheduleResult, pins: readonly Assignment[] = []) {
  expect(r.feasible).toBe(true);
  expect(r.hard).toEqual([]);
  expect(r.conflicts).toEqual([]);
  const instance = buildInstance(r.dataset);
  expect(checkTimetable(instance, r.assignments).violations).toEqual([]);
  expect(r.assignments.map((a) => a.session_id)).toEqual(
    r.dataset.sessions.map((s) => s.id),
  );
  const stability = computeStability(
    instance,
    toAssignMap(r.assignments).assign,
    toAssignMap(BASELINE).assign,
  );
  expect(r.moved_count).toBe(stability.sessions_moved);
  expect(r.time_changed).toBe(stability.time_changed);
  expect(r.room_only_changed).toBe(stability.room_only_changed);
  const movedInDiff = r.diff
    .filter((d) => d.move !== "added" && d.move !== "removed")
    .map((d) => d.session_id)
    .sort();
  expect(movedInDiff).toEqual(stability.moved_ids);
  for (const pin of pins) expect(r.assignments).toContainEqual(pin);
  expect(r.soft_after).not.toBeNull();
  expect(r.soft_delta).toBe((r.soft_after?.total ?? 0) - r.soft_before.total);
  for (const d of r.diff) MoveDiffSchema.parse(d);
  RescheduleMetaSchema.parse(r.meta);
}

describe("reschedule: the sample disruption", () => {
  const dataset = publicDataset();
  const r = reschedule({ dataset, baseline: BASELINE, changes: SAMPLE });

  it("is feasible, places CS202-T2 and moves only the nine CR-102 sessions, room only", () => {
    expectFeasible(r);
    const cr102 = BASELINE.filter((a) => a.room_id === "CR-102").map(
      (a) => a.session_id,
    );
    expect(cr102).toHaveLength(9);
    // Lower bound: every session in the closed room must move.
    expect(r.moved_count).toBe(9);
    expect(r.room_only_changed).toBe(9);
    expect(r.time_changed).toBe(0);
    expect(
      r.diff.filter((d) => d.cause === "broken").map((d) => d.session_id),
    ).toEqual(
      cr102.sort(
        (a, b) =>
          dataset.sessions.findIndex((s) => s.id === a) -
          dataset.sessions.findIndex((s) => s.id === b),
      ),
    );
    const added = r.diff.find((d) => d.session_id === "CS202-T2");
    expect(added).toMatchObject({ move: "added", cause: "added", from: null });
    expect(r.assignments.some((a) => a.session_id === "CS202-T2")).toBe(true);
    expect(r.meta).toMatchObject({
      broken: 10,
      evictions: 0,
      depth: 0,
      stopped_by: "complete",
      algorithm: RESCHEDULE_ALGORITHM,
    });
    // A deterministic work bound instead of a wall-clock one: 148 nodes today.
    expect(r.meta.nodes).toBeLessThan(1_000);
  });

  it("explains each move in plain words", () => {
    const first = r.diff.find((d) => d.cause === "broken");
    expect(first?.rules).toEqual(["H8"]);
    expect(first?.reason).toMatch(
      /^CR-102 closed MON–FRI P1–P9 \(Water leak, room closed for the rest of the semester\); same time, now in /,
    );
    expect(r.diff.find((d) => d.cause === "added")?.reason).toMatch(
      /^New session placed at (MON|TUE|WED|THU|FRI) P\d in /,
    );
  });

  it("matches the validator port's report (stability, hard, soft)", () => {
    const report = validateSchedule(
      r.dataset,
      { sessions: r.assignments },
      { sessions: BASELINE },
    );
    expect(report.hard_violation_count).toBe(0);
    expect(report.stability).toMatchObject({
      sessions_moved: r.moved_count,
      time_changed: r.time_changed,
      room_only_changed: r.room_only_changed,
    });
    expect(report.soft_total).toBe(r.soft_after?.total);
    expect(r.soft_before.total).toBe(
      softScore(buildInstance(dataset), BASELINE).total,
    );
    SoftPenaltySummarySchema.parse(r.soft_before);
    SoftPenaltySummarySchema.parse(r.soft_after);
  });

  it("is deterministic and leaves its inputs untouched", () => {
    const frozen = JSON.stringify(dataset);
    const again = reschedule({ dataset, baseline: BASELINE, changes: SAMPLE });
    const strip = (x: RescheduleResult) => ({
      ...x,
      meta: { ...x.meta, ms: 0 },
    });
    expect(strip(again)).toEqual(strip(r));
    expect(JSON.stringify(dataset)).toBe(frozen);
  });

  it("gives identical results, timing included, with a frozen clock", () => {
    let reads = 0;
    const now = () => {
      reads++;
      return 1_000;
    };
    const a = reschedule({
      dataset,
      baseline: BASELINE,
      changes: SAMPLE,
      options: { now },
    });
    const b = reschedule({
      dataset,
      baseline: BASELINE,
      changes: SAMPLE,
      options: { now },
    });
    expect(reads).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(a.meta.ms).toBe(0);
    expect(a.meta.stopped_by).not.toBe("time");
    expect(a.diff).toEqual(r.diff);

    const suggest = () =>
      suggestMoves({
        dataset,
        baseline: BASELINE,
        session_id: "CS202-L2",
        options: { now: () => 0 },
      });
    expect(suggest()).toEqual(suggest());
  });
});

describe("reschedule: baskets keep their rooms (fewest moves)", () => {
  const unavailable = (
    faculty_id: string,
    days: Day[],
    periods: number[],
  ): DisruptionChange => ({
    type: "faculty_unavailable",
    faculty_id,
    days,
    periods,
  });
  const closed = (
    room_id: string,
    days: Day[],
    periods: number[],
  ): DisruptionChange => ({ type: "room_unavailable", room_id, days, periods });

  it.each([
    {
      // OE301-L1 (basket OEB-1, THU P4 in LH-3) loses its room: only it moves, room only;
      // EE391-P1 moves for F18. Taking a sibling's room used to move the sibling too (3).
      name: "a closed basket room next to an unrelated move",
      changes: [
        unavailable("F18", ["WED"], [3, 4, 5, 6, 7, 8, 9]),
        closed("LH-3", ["TUE", "THU"], [4, 5, 6, 7, 8, 9]),
      ],
      moved: 2,
    },
    {
      // Basket OEB-1 must leave THU P4 (F39): its three members move, plus OE301-L3 for LH-3.
      // Counting a sibling's room as costly used to move more of the basket elsewhere (6).
      name: "a basket that must change time keeps its members' rooms",
      changes: [
        closed("LH-3", ["WED"], [5]),
        unavailable("F39", ["THU"], [1, 2, 3, 4]),
      ],
      moved: 4,
    },
    {
      name: "four mixed closures and an absence",
      changes: [
        closed("ELEC-LAB-1", ["FRI", "THU"], [3, 4, 5, 6, 7, 8, 9]),
        unavailable("F24", ["MON"], [5, 6, 7, 8, 9]),
        closed("CIVIL-LAB", ["FRI", "THU"], [5, 6, 7, 8]),
        closed("LH-3", ["THU", "MON"], [1, 2, 3, 4, 5]),
      ],
      moved: 6,
    },
  ])("$name: $moved moves", ({ changes, moved }) => {
    const r = reschedule({
      dataset: publicDataset(),
      baseline: BASELINE,
      changes,
    });
    expectFeasible(r);
    expect(r.hard).toEqual([]);
    expect(r.moved_count).toBe(moved);
  });
});

describe("reschedule: minimal moves", () => {
  it("changes nothing for an empty change list", () => {
    const r = reschedule({ dataset: publicDataset(), baseline: BASELINE });
    expectFeasible(r);
    expect(r.moved_count).toBe(0);
    expect(r.diff).toEqual([]);
    expect(r.assignments).toEqual(
      BASELINE.slice().sort(
        (a, b) =>
          r.dataset.sessions.findIndex((s) => s.id === a.session_id) -
          r.dataset.sessions.findIndex((s) => s.id === b.session_id),
      ),
    );
  });

  it("moves a basket member whose room closes to another room, alone", () => {
    const oe = baseOf("OE301-L1");
    const r = reschedule({
      dataset: publicDataset(),
      baseline: BASELINE,
      changes: [
        {
          type: "room_unavailable",
          room_id: oe.room_id,
          days: [oe.day],
          periods: [oe.start_period],
        },
      ],
    });
    expectFeasible(r);
    expect(r.moved_count).toBe(1);
    expect(r.diff).toEqual([
      expect.objectContaining({
        session_id: "OE301-L1",
        move: "room_only",
        cause: "broken",
        rules: ["H8"],
      }),
    ]);
  });

  it("moves a teacher's sessions off a day they become unavailable (time changes)", () => {
    const day = baseOf("CS202-L1").day;
    const f06 = BASELINE.filter(
      (a) =>
        a.day === day &&
        publicDataset().sessions.find((s) => s.id === a.session_id)
          ?.faculty_id === "F06",
    );
    expect(f06.length).toBeGreaterThan(0);
    const r = reschedule({
      dataset: publicDataset(),
      baseline: BASELINE,
      changes: [
        {
          type: "faculty_unavailable",
          faculty_id: "F06",
          days: [day],
          periods: ALL_PERIODS,
          reason: "Medical leave",
        },
      ],
    });
    expectFeasible(r);
    expect(r.moved_count).toBe(f06.length);
    expect(r.time_changed).toBe(f06.length);
    for (const d of r.diff) {
      expect(d).toMatchObject({ cause: "broken", rules: ["H7"] });
      expect(d.reason).toContain(
        `F06 unavailable ${day} P1–P9 (Medical leave)`,
      );
      expect(d.to?.day).not.toBe(day);
    }
  });

  it("lists a removed session and moves nothing", () => {
    const r = reschedule({
      dataset: publicDataset(),
      baseline: BASELINE,
      changes: [{ type: "remove_session", session_id: "HS201-H2-L2" }],
    });
    expectFeasible(r);
    expect(r.moved_count).toBe(0);
    expect(r.diff).toEqual([
      expect.objectContaining({
        session_id: "HS201-H2-L2",
        to: null,
        move: "removed",
        cause: "removed",
        reason: "Removed from the timetable by the change",
      }),
    ]);
    expect(r.assignments.some((a) => a.session_id === "HS201-H2-L2")).toBe(
      false,
    );
  });
});

/** A placement whose only blocker is one other session holding the room (found with `checkPlacement`). */
function roomClashPin(dataset: Dataset): { pin: Assignment; occupant: string } {
  const sessions = new Map(dataset.sessions.map((s) => [s.id, s]));
  for (const target of BASELINE) {
    const occupant = sessions.get(target.session_id) as Session;
    if (occupant.basket_slot || occupant.kind === "lab") continue;
    for (const a of BASELINE) {
      const s = sessions.get(a.session_id) as Session;
      if (s.id === occupant.id || s.basket_slot || s.kind === "lab") continue;
      if (s.duration !== occupant.duration || s.size > occupant.size) continue;
      if (
        !s.room_types.includes(
          dataset.rooms.find((r) => r.id === target.room_id)?.type ?? "",
        )
      )
        continue;
      if (s.needs_accessible) continue;
      const pin = { ...target, session_id: s.id };
      const check = checkPlacement({
        dataset,
        assignments: BASELINE,
        placement: pin,
      });
      if (
        check.blockers.length === 1 &&
        check.blockers[0] === occupant.id &&
        check.violations.every((v) => v.rule === "H4")
      ) {
        return { pin, occupant: occupant.id };
      }
    }
  }
  throw new Error("no room-clash placement found");
}

describe("reschedule: placements (pins)", () => {
  it("evicts the occupant of a pinned slot and re-places it", () => {
    const dataset = publicDataset();
    const { pin, occupant } = roomClashPin(dataset);
    const r = reschedule({ dataset, baseline: BASELINE, placements: [pin] });
    expectFeasible(r, [pin]);
    expect(r.meta.depth).toBeGreaterThanOrEqual(1);
    expect(r.meta.evictions).toBeGreaterThanOrEqual(1);
    const requested = r.diff.find((d) => d.session_id === pin.session_id);
    expect(requested).toMatchObject({ cause: "requested" });
    expect(requested?.reason).toBe(
      `Placed at ${pin.day} P${pin.start_period} in ${pin.room_id} as requested`,
    );
    const evicted = r.diff.find((d) => d.session_id === occupant);
    expect(evicted).toMatchObject({
      cause: "evicted",
      displaced_by: pin.session_id,
    });
    // The pinned session took the occupant's room.
    expect(evicted?.reason).toMatch(
      new RegExp(
        `^Moved to free \\S+ P\\d in ${pin.room_id} for ${pin.session_id}; `,
      ),
    );
    // The pinned session itself moved, and its occupant moved: nothing else.
    expect(r.moved_count).toBe(2);
  });

  it("never evicts a fixed session: a pin onto one can't hold", () => {
    const base = publicDataset();
    const { pin, occupant } = roomClashPin(base);
    const occ = baseOf(occupant);
    const dataset = structuredClone(base);
    const fixed = dataset.sessions.find((s) => s.id === occupant) as Session;
    fixed.fixed_slot = { day: occ.day, start_period: occ.start_period };
    const r = reschedule({ dataset, baseline: BASELINE, placements: [pin] });
    expect(r.feasible).toBe(false);
    expect(r.assignments).toContainEqual(occ);
    const conflict = r.conflicts.find((c) => c.session_id === pin.session_id);
    expect(conflict?.contradictions.join(" ")).toContain(
      `collides with fixed session ${occupant}`,
    );
    for (const c of r.conflicts) ConflictEntrySchema.parse(c);
  });

  it("refuses a pin that moves a fixed session off its slot", () => {
    const dataset = publicDataset();
    const at = baseOf("CS202-L1");
    const s = dataset.sessions.find((x) => x.id === "CS202-L1") as Session;
    s.fixed_slot = { day: at.day, start_period: at.start_period };
    const elsewhere: Assignment = {
      ...at,
      day: at.day === "MON" ? "TUE" : "MON",
    };
    const r = reschedule({
      dataset,
      baseline: BASELINE,
      placements: [elsewhere],
    });
    expect(r.feasible).toBe(false);
    expect(r.assignments).toContainEqual(at);
    const conflict = r.conflicts.find((c) => c.session_id === "CS202-L1");
    expect(conflict?.contradictions).toEqual([
      `CS202-L1 has fixed_slot ${at.day} P${at.start_period}; the placement asks for ${elsewhere.day} P${at.start_period}`,
    ]);
    expect(conflict?.summary).toMatch(
      /^The placement of CS202-L1 can't hold: /,
    );
  });

  it("pins a whole basket to the requested time and keeps its other rooms", () => {
    const oe = baseOf("OE301-L1");
    const dataset = publicDataset();
    // Find a start where the basket fits without moving anything else.
    const days = ["MON", "TUE", "WED", "THU", "FRI"] as const;
    let pin: Assignment | null = null;
    for (const day of days) {
      for (let p = 1; p <= 9 && !pin; p++) {
        if (day === oe.day && p === oe.start_period) continue;
        const candidate = { ...oe, day, start_period: p };
        const r = reschedule({
          dataset,
          baseline: BASELINE,
          placements: [candidate],
        });
        if (r.feasible && r.moved_count === 3) pin = candidate;
      }
      if (pin) break;
    }
    expect(pin).not.toBeNull();
    const r = reschedule({
      dataset,
      baseline: BASELINE,
      placements: [pin as Assignment],
    });
    expectFeasible(r, [pin as Assignment]);
    const siblings = r.diff.filter((d) => d.session_id !== "OE301-L1");
    expect(siblings.map((d) => d.session_id).sort()).toEqual([
      "OE302-L1",
      "OE303-L1",
    ]);
    for (const d of siblings) {
      expect(d).toMatchObject({ cause: "requested", move: "time_only" });
      expect(d.reason).toContain("requested for OE301-L1");
    }
  });
});

describe("reschedule: ejection chains", () => {
  /** Three CSE-2 lectures whose teachers can each teach only two MON periods. */
  function chainCase() {
    const ids = ["CS202-L1", "CS203-L1", "CS204-L1"];
    const dataset = datasetWith(ids, (d) => {
      const allowed: Record<string, number[]> = {
        F06: [1, 2],
        F07: [1, 3],
        F08: [3, 4],
      };
      for (const f of d.faculty) {
        const free = allowed[f.id];
        if (!free) continue;
        f.unavailable = (["MON", "TUE", "WED", "THU", "FRI"] as const).map(
          (day) => ({
            day,
            periods: ALL_PERIODS.filter(
              (p) => day !== "MON" || !free.includes(p),
            ),
          }),
        );
      }
    });
    const baseline = [
      at("CS202-L1", "MON", 2, "CR-103"),
      at("CS203-L1", "MON", 1, "CR-104"),
      at("CS204-L1", "MON", 3, "CR-201"),
    ];
    const changes: DisruptionChange[] = [
      {
        type: "faculty_unavailable",
        faculty_id: "F06",
        days: ["MON"],
        periods: [2],
      },
    ];
    return { dataset, baseline, changes };
  }

  it("follows a chain two levels deep: A takes B's slot, B takes C's, C moves on", () => {
    const { dataset, baseline, changes } = chainCase();
    const r = reschedule({ dataset, baseline, changes });
    expect(r.feasible).toBe(true);
    expect(r.hard).toEqual([]);
    expect(r.moved_count).toBe(3);
    expect(r.meta).toMatchObject({ broken: 1, evictions: 2, depth: 2 });
    expect(r.diff.map((d) => [d.session_id, d.cause, d.displaced_by])).toEqual([
      ["CS202-L1", "broken", null],
      ["CS203-L1", "evicted", "CS202-L1"],
      ["CS204-L1", "evicted", "CS203-L1"],
    ]);
    // CS202-L1 needs CSE-2 at MON P1, not CS203-L1's room.
    expect(r.diff[1].reason).toMatch(
      /^Moved to free CSE-2 at MON P1 for CS202-L1; now at MON P3/,
    );
  });

  it("says no chain within the depth limit frees a slot", () => {
    const { dataset, baseline, changes } = chainCase();
    const r = reschedule({
      dataset,
      baseline,
      changes,
      options: { maxDepth: 1 },
    });
    expect(r.feasible).toBe(false);
    expect(r.conflicts[0].summary).toBe(
      "CS202-L1 can't be placed: across 45 start slots, F06 is unavailable in 44 and CSE-2 is already in class in 1, and no chain of up to 1 move frees one.",
    );
  });
});

describe("reschedule: no valid fix", () => {
  const extra: Session = {
    ...(SAMPLE[2] as Extract<DisruptionChange, { type: "add_session" }>)
      .session,
  };

  it("names the room contradiction for a 2000-seat session", () => {
    const r = reschedule({
      dataset: publicDataset(),
      baseline: BASELINE,
      changes: [{ type: "add_session", session: { ...extra, size: 2000 } }],
    });
    expect(r.feasible).toBe(false);
    expect(r.soft_after).toBeNull();
    expect(r.soft_delta).toBe(0);
    expect(r.moved_count).toBe(0);
    expect(r.hard.map((v) => v.detail)).toContain(
      "Session CS202-T2 is not scheduled",
    );
    expect(r.conflicts).toHaveLength(1);
    const [c] = r.conflicts;
    ConflictEntrySchema.parse(c);
    expect(c.contradictions).toEqual([
      "no room of type classroom/lecture_hall/auditorium seats 2000",
    ]);
    expect(c.summary).toBe(
      "CS202-T2 can't be placed: no room of type classroom/lecture_hall/auditorium seats 2000.",
    );
    expect(c.blocking.reduce((n, b) => n + b.count, 0)).toBe(45);
  });

  it("names a fixed slot that clashes with the teacher's unavailability", () => {
    const r = reschedule({
      dataset: publicDataset(),
      baseline: BASELINE,
      changes: [
        {
          type: "faculty_unavailable",
          faculty_id: "F06",
          days: ["THU"],
          periods: [6, 7, 8, 9],
        },
        {
          type: "add_session",
          session: { ...extra, fixed_slot: { day: "THU", start_period: 6 } },
        },
      ],
    });
    expect(r.feasible).toBe(false);
    const c = r.conflicts.find((x) => x.session_id === "CS202-T2");
    expect(c?.contradictions).toContain(
      "fixed_slot THU P6 vs F06 unavailable THU P6–P9",
    );
    expect(c?.summary).toBe(
      "CS202-T2 can't be placed: fixed_slot THU P6 vs F06 unavailable THU P6–P9.",
    );
  });

  it("names every reason a fixed slot breaks the period rules", () => {
    const dataset = publicDataset();
    const lab = dataset.sessions.find((s) => s.id === "PH191-A-P1") as Session;
    const r = reschedule({
      dataset,
      baseline: BASELINE,
      changes: [
        {
          type: "add_session",
          session: {
            ...lab,
            id: "PH191-A-P9",
            // A 3-period lab at P4 crosses lunch (after P5) and labs start only at P2 or P6.
            fixed_slot: { day: "TUE", start_period: 4 },
          },
        },
      ],
    });
    expect(r.feasible).toBe(false);
    const c = r.conflicts.find((x) => x.session_id === "PH191-A-P9");
    expect(c?.contradictions).toEqual([
      "fixed_slot TUE P4 crosses lunch for PH191-A-P9",
      "fixed_slot TUE P4, but labs start only at P2 or P6",
    ]);
  });

  it("reports every session of a teacher unavailable all week", () => {
    const dataset = publicDataset();
    const own = dataset.sessions.filter((s) => s.faculty_id === "F06");
    const r = reschedule({
      dataset,
      baseline: BASELINE,
      changes: [
        {
          type: "faculty_unavailable",
          faculty_id: "F06",
          days: ["MON", "TUE", "WED", "THU", "FRI"],
          periods: ALL_PERIODS,
        },
      ],
    });
    expect(r.feasible).toBe(false);
    expect(r.conflicts.map((c) => c.session_id)).toEqual(own.map((s) => s.id));
    for (const c of r.conflicts) {
      ConflictEntrySchema.parse(c);
      expect(c.contradictions).toContain(
        `F06 is unavailable at every start that fits ${c.session_id}`,
      );
      expect(c.blocking).toEqual([
        { rule: "H7", count: 45, detail: "F06 unavailable" },
      ]);
    }
    // Everyone else stays where they were.
    expect(r.moved_count).toBe(0);
    expect(r.assignments).toHaveLength(dataset.sessions.length - own.length);
  });
});

describe("validateChanges", () => {
  const dataset = publicDataset();
  const errors = (changes: unknown[], placements: Assignment[] = []) =>
    validateChanges(dataset, changes as DisruptionChange[], placements).filter(
      (i) => i.severity === "error",
    );
  const warnings = (changes: unknown[], placements: Assignment[] = []) =>
    validateChanges(dataset, changes as DisruptionChange[], placements).filter(
      (i) => i.severity === "warning",
    );
  const session = (
    SAMPLE[2] as Extract<DisruptionChange, { type: "add_session" }>
  ).session;
  const faculty = {
    id: "F99",
    name: "Dr. New",
    department: "CSE",
    max_hours_per_day: 4,
    needs_accessible: false,
    unavailable: [],
    preferences: [],
  };

  it("accepts the sample disruption", () => {
    expect(validateChanges(dataset, SAMPLE)).toEqual([]);
  });

  it("flags unknown faculty and rooms", () => {
    expect(
      errors([
        {
          type: "faculty_unavailable",
          faculty_id: "F404",
          days: ["MON"],
          periods: [1],
        },
        {
          type: "room_unavailable",
          room_id: "XR-1",
          days: ["MON"],
          periods: [1],
        },
      ]),
    ).toEqual([
      {
        path: "changes[0].faculty_id",
        message: "Unknown faculty F404.",
        severity: "error",
      },
      {
        path: "changes[1].room_id",
        message: "Unknown room XR-1.",
        severity: "error",
      },
    ]);
  });

  it("flags duplicate added ids, against the dataset and within the list", () => {
    const issues = errors([
      { type: "add_faculty", faculty: { ...faculty, id: "F06" } },
      { type: "add_faculty", faculty },
      { type: "add_faculty", faculty },
      { type: "add_session", session: { ...session, id: "CS202-T1" } },
      { type: "add_session", session },
      { type: "add_session", session },
    ]);
    expect(issues.map((i) => [i.path, i.message])).toEqual([
      ["changes[0].faculty.id", "Faculty F06 already exists."],
      ["changes[2].faculty.id", "Faculty F99 is added twice."],
      ["changes[3].session.id", "Session CS202-T1 already exists."],
      ["changes[5].session.id", "Session CS202-T2 is added twice."],
    ]);
  });

  it("allows re-adding a session removed earlier in the list", () => {
    expect(
      errors([
        { type: "remove_session", session_id: "CS202-T1" },
        { type: "add_session", session: { ...session, id: "CS202-T1" } },
      ]),
    ).toEqual([]);
  });

  it("checks an added session's course, groups and faculty (counting added faculty)", () => {
    expect(
      errors([
        {
          type: "add_session",
          session: {
            ...session,
            course_id: "ZZ999",
            groups: ["CSE-2", "NOPE"],
            faculty_id: "F99",
          },
        },
      ]).map((i) => i.path),
    ).toEqual([
      "changes[0].session.course_id",
      "changes[0].session.groups[1]",
      "changes[0].session.faculty_id",
    ]);
    expect(
      errors([
        { type: "add_faculty", faculty },
        { type: "add_session", session: { ...session, faculty_id: "F99" } },
      ]),
    ).toEqual([]);
  });

  it("flags removing an unknown or already removed session", () => {
    expect(
      errors([
        { type: "remove_session", session_id: "NOPE-1" },
        { type: "remove_session", session_id: "CS202-T1" },
        { type: "remove_session", session_id: "CS202-T1" },
      ]).map((i) => [i.path, i.message]),
    ).toEqual([
      ["changes[0].session_id", "Unknown session NOPE-1."],
      [
        "changes[2].session_id",
        "Session CS202-T1 is already removed by an earlier change.",
      ],
    ]);
  });

  it("checks placements: unknown or removed sessions, rooms, duplicates, days and periods", () => {
    const at = (
      session_id: string,
      day: string,
      start_period: number,
      room_id: string,
    ) => ({ session_id, day, start_period, room_id }) as Assignment;
    const issues = errors(
      [{ type: "remove_session", session_id: "CS202-T1" }],
      [
        at("NOPE-1", "MON", 1, "LH-1"),
        at("CS202-T1", "MON", 1, "LH-1"),
        at("CS202-L1", "MON", 1, "XR-9"),
        at("CS202-L2", "MON", 2, "LH-1"),
        at("CS202-L2", "TUE", 2, "LH-1"),
        at("CS292-P1", "MON", 8, "ELEC-LAB-1"),
      ],
    );
    expect(issues.map((i) => i.path)).toEqual([
      "placements[0].session_id",
      "placements[1].session_id",
      "placements[2].room_id",
      "placements[4].session_id",
      "placements[5].start_period",
    ]);
    expect(issues[1].message).toBe(
      "Session CS202-T1 is removed by the changes, so it can't be placed.",
    );
    const noFriday = structuredClone(dataset);
    noFriday.calendar.days = ["MON", "TUE", "WED", "THU"];
    expect(
      validateChanges(noFriday, [], [at("CS202-L1", "FRI", 1, "LH-1")]).map(
        (i) => i.path,
      ),
    ).toEqual(["placements[0].day"]);
  });

  it("warns about days outside the calendar, non-teaching periods and empty changes", () => {
    expect(
      warnings([
        {
          type: "faculty_unavailable",
          faculty_id: "F07",
          days: ["SAT"],
          periods: [1, 11],
        },
        { type: "room_unavailable", room_id: "CR-102", days: [], periods: [1] },
        {
          type: "room_unavailable",
          room_id: "CR-102",
          days: ["MON", "SUN"],
          periods: [1],
        },
        {
          type: "faculty_unavailable",
          faculty_id: "F07",
          days: ["MON"],
          periods: [10, 11, 13],
        },
      ]).map((i) => [i.path, i.message]),
    ).toEqual([
      [
        "changes[0]",
        "SAT is not a teaching day and P11 is outside the teaching periods P1–P9, so they never affect the timetable.",
      ],
      [
        "changes[1]",
        "This change lists no days or no periods, so it has no effect.",
      ],
      [
        "changes[2].days",
        "SUN is not a teaching day, so it never affects the timetable.",
      ],
      [
        "changes[3].periods",
        "P10–P11, P13 are outside the teaching periods P1–P9, so they never affect the timetable.",
      ],
    ]);
    expect(warnings([])).toEqual([
      expect.objectContaining({ path: "changes" }),
    ]);
  });

  it("warns once per change however many days and periods are off", () => {
    const issues = warnings([
      {
        type: "faculty_unavailable",
        faculty_id: "F07",
        days: ["SAT", "SUN", "X1", "X2", "X3", "X4", "X5", "SAT", "MON"],
        periods: [10, 11, 12, 13, 1],
      },
    ]);
    expect(issues).toEqual([
      {
        path: "changes[0]",
        message:
          "SAT, SUN, X1, X2, X3 and 2 more are not teaching days and P10–P13 are outside the teaching periods P1–P9, so they never affect the timetable.",
        severity: "warning",
      },
    ]);
  });

  it("lists at most 20 issues of each kind, then counts the rest", () => {
    const changes = Array.from({ length: 30 }, (_, i) => ({
      type: "faculty_unavailable",
      faculty_id: `F${400 + i}`,
      days: ["SAT"],
      periods: [1],
    }));
    const all = validateChanges(dataset, changes as DisruptionChange[]);
    const errs = all.filter((i) => i.severity === "error");
    const warns = all.filter((i) => i.severity === "warning");
    expect(errs).toHaveLength(21);
    expect(warns).toHaveLength(21);
    expect(errs[19].path).toBe("changes[19].faculty_id");
    expect(errs[20]).toEqual({
      path: "changes[20].faculty_id",
      message: "… and 10 more problems like these.",
      severity: "error",
    });
    expect(warns[20]).toEqual({
      path: "changes[20].days",
      message: "… and 10 more warnings like these.",
      severity: "warning",
    });
  });
});

describe("describeChanges", () => {
  const dataset = publicDataset();

  it("titles the sample disruption", () => {
    expect(describeChanges(dataset, SAMPLE)).toBe(
      "F07 unavailable MON · CR-102 closed MON–FRI · add CS202-T2",
    );
  });

  it("adds placements, partial periods, removals and new faculty", () => {
    expect(
      describeChanges(
        dataset,
        [
          {
            type: "faculty_unavailable",
            faculty_id: "F07",
            days: ["MON", "WED"],
            periods: [1, 2, 3],
          },
          { type: "remove_session", session_id: "HS201-H2-L2" },
        ],
        [
          {
            session_id: "CS202-L2",
            day: "THU",
            start_period: 2,
            room_id: "LH-3",
          },
        ],
      ),
    ).toBe(
      "F07 unavailable MON, WED P1–P3 · remove HS201-H2-L2 · move CS202-L2 to THU P2",
    );
    expect(describeChanges(dataset, [])).toBe("No changes");
  });

  it("shortens long lists", () => {
    const many: DisruptionChange[] = Array.from({ length: 9 }, (_, i) => ({
      type: "remove_session",
      session_id: `S-${i}`,
    }));
    expect(describeChanges(dataset, many)).toBe(
      "remove S-0 · remove S-1 · remove S-2 · remove S-3 · remove S-4 · +4 more",
    );
  });
});
