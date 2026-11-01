/**
 * Move suggestions on the public dataset and the committed timetable: every option is the full
 * repair with the session pinned there, inside the requested window, never the current slot,
 * best first; an impossible window comes back with the reasons.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ConflictEntrySchema,
  DisruptionSchema,
  MoveDiffSchema,
  type Assignment,
} from "@/lib/contracts";

import sampleDisruption from "../../../data/sample_disruption.json";

import { reschedule, suggestMoves, type MoveOption } from "./reschedule";
import { publicDataset } from "./test-fixtures";

const BASELINE: Assignment[] = JSON.parse(
  readFileSync("exports/schedule.json", "utf8"),
).sessions;
const SAMPLE = DisruptionSchema.parse(sampleDisruption).changes;
const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI"];

const baseOf = (id: string) =>
  BASELINE.find((a) => a.session_id === id) as Assignment;

function expectSorted(options: readonly MoveOption[]) {
  for (let i = 1; i < options.length; i++) {
    const a = options[i - 1];
    const b = options[i];
    const key = (o: MoveOption) => [
      o.moved_count,
      o.time_changed,
      o.soft_delta,
    ];
    const [x, y] = [key(a), key(b)];
    const cmp = x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    expect(cmp).toBeLessThanOrEqual(0);
  }
}

describe("suggestMoves", () => {
  const dataset = publicDataset();

  it("returns verified options, best first, never the current slot", () => {
    // A frozen clock: the node budgets alone end each repair, so a slow machine can't cut the
    // search short and the result is the same everywhere.
    const r = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "CS202-L2",
      options: { now: () => 0 },
    });
    expect(r.options).toHaveLength(3);
    expect(r.conflicts).toEqual([]);
    // Every other start of a one-period lecture.
    expect(r.considered).toBe(44);
    expectSorted(r.options);
    const now = baseOf("CS202-L2");
    for (const o of r.options) {
      expect([o.placement.day, o.placement.start_period]).not.toEqual([
        now.day,
        now.start_period,
      ]);
      expect(o.placement.session_id).toBe("CS202-L2");
      for (const d of o.diff) MoveDiffSchema.parse(d);
      // The option is exactly the repair with that placement.
      const full = reschedule({
        dataset,
        baseline: BASELINE,
        placements: [o.placement],
      });
      expect(full.feasible).toBe(true);
      expect(full.moved_count).toBe(o.moved_count);
      expect(full.time_changed).toBe(o.time_changed);
      expect(full.soft_delta).toBe(o.soft_delta);
      expect(full.diff).toEqual(o.diff);
    }
  });

  it("keeps every option inside the requested days and periods", () => {
    const r = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "CS202-L2",
      target: { days: ["TUE"], periods: [1, 2, 3, 4, 5] },
      limit: 5,
    });
    expect(r.considered).toBe(5);
    expect(r.options.length).toBeGreaterThan(0);
    expectSorted(r.options);
    for (const o of r.options) {
      expect(o.placement.day).toBe("TUE");
      expect(o.placement.start_period).toBeLessThanOrEqual(5);
    }
  });

  it("keeps a lab's whole block inside the requested periods", () => {
    const r = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "CS292-P1",
      target: { periods: [1, 2, 3, 4, 5] },
    });
    // Labs start at P2 or P6; only P2–P4 lies inside P1–P5.
    for (const o of r.options) expect(o.placement.start_period).toBe(2);
    expect(r.considered).toBeLessThanOrEqual(5);
  });

  it("honours a requested room", () => {
    const r = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "MA101-AB-L1",
      target: { room_id: "LH-1" },
    });
    expect(r.options.length).toBeGreaterThan(0);
    for (const o of r.options) expect(o.placement.room_id).toBe("LH-1");
  });

  it("explains a window where nothing fits", () => {
    // F08 is on campus only on Tuesdays and Thursdays.
    const r = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "CS204-L1",
      target: { days: ["MON"] },
    });
    expect(r.options).toEqual([]);
    expect(r.considered).toBe(9);
    expect(r.conflicts).toHaveLength(1);
    const [c] = r.conflicts;
    ConflictEntrySchema.parse(c);
    expect(c.session_id).toBe("CS204-L1");
    expect(c.blocking).toEqual([
      { rule: "H7", count: 9, detail: "F08 unavailable" },
    ]);
    expect(c.summary).toBe(
      "CS204-L1 can't be placed: across 9 start slots in the requested window, F08 is unavailable in 9.",
    );
  });

  it("suggests slots for a session the changes add", () => {
    const r = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "CS202-T2",
      changes: SAMPLE,
      limit: 5,
    });
    expect(r.options).toHaveLength(5);
    expect(r.considered).toBe(45);
    for (const o of r.options) {
      expect(o.moved_count).toBe(9);
      expect(o.diff.find((d) => d.session_id === "CS202-T2")).toMatchObject({
        move: "added",
        to: {
          day: o.placement.day,
          start_period: o.placement.start_period,
          room_id: o.placement.room_id,
        },
      });
    }
  });

  it("moves a basket as one and offers evictions when few slots are free", () => {
    const r = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "OE301-L1",
      limit: 2,
    });
    expect(r.options).toHaveLength(2);
    for (const o of r.options) {
      const moved = o.diff
        .filter((d) => d.cause === "requested")
        .map((d) => d.session_id);
      expect(moved.sort()).toEqual(["OE301-L1", "OE302-L1", "OE303-L1"]);
    }
  });

  it("caps the limit at 5 and is deterministic", () => {
    const a = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "CS202-L2",
      limit: 9,
    });
    const b = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "CS202-L2",
      limit: 9,
    });
    expect(a.options).toHaveLength(5);
    expect(b).toEqual(a);
    expect(
      suggestMoves({
        dataset,
        baseline: BASELINE,
        session_id: "CS202-L2",
        limit: 1,
      }).options,
    ).toHaveLength(1);
    expect(
      a.options.map((o) => DAY_ORDER.includes(o.placement.day)),
    ).not.toContain(false);
  });

  it("reports an unknown session", () => {
    const r = suggestMoves({
      dataset,
      baseline: BASELINE,
      session_id: "NOPE-1",
    });
    expect(r).toEqual({
      options: [],
      considered: 0,
      conflicts: [
        {
          session_id: "NOPE-1",
          blocking: [],
          contradictions: ["NOPE-1 isn't in the timetable after the changes"],
          summary:
            "NOPE-1 can't be moved: it isn't in the timetable after the changes.",
        },
      ],
    });
  });
});
