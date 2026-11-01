/**
 * Manual placement checks on the committed timetable: new violations in the validator's wording,
 * who is in the way, and the soft delta.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Assignment } from "@/lib/contracts";

import { buildInstance } from "./instance";
import { checkPlacement, mergePlacement } from "./manual";
import { softScore } from "./soft";
import { publicDataset } from "./test-fixtures";

const BASELINE: Assignment[] = JSON.parse(
  readFileSync("exports/schedule.json", "utf8"),
).sessions;
const baseOf = (id: string) =>
  BASELINE.find((a) => a.session_id === id) as Assignment;

describe("checkPlacement", () => {
  const dataset = publicDataset();
  const check = (placement: Assignment, assignments = BASELINE) =>
    checkPlacement({ dataset, assignments, placement });

  it("accepts a session where it already is", () => {
    expect(check(baseOf("CS202-L2"))).toEqual({
      ok: true,
      violations: [],
      soft_delta: 0,
      blockers: [],
    });
  });

  it("reports a room clash in the validator's words and names the occupant", () => {
    const l1 = baseOf("CS202-L1");
    // MA101-AB-L3 holds LH-1 at MON P1; CSE-2 and F06 are free then.
    const occupant = baseOf("MA101-AB-L3");
    const placement = { ...occupant, session_id: "CS202-T1" };
    const result = check(placement);
    expect(result.ok).toBe(false);
    expect(result.blockers).toEqual(["MA101-AB-L3"]);
    expect(result.violations).toEqual([
      {
        rule: "H4",
        where: "timetable",
        detail: `${occupant.room_id} double-booked ${occupant.day} P${occupant.start_period}: CS202-T1, MA101-AB-L3`,
      },
    ]);
    expect(l1.session_id).toBe("CS202-L1");
  });

  it("reports the teacher's unavailability", () => {
    const at = baseOf("CS204-L1");
    const result = check({ ...at, day: "MON", start_period: 1 });
    expect(result.violations).toContainEqual({
      rule: "H7",
      where: "timetable",
      detail: "CS204-L1: F08 unavailable MON P1",
    });
  });

  it("reports teacher and group clashes and their blockers", () => {
    const l1 = baseOf("CS202-L1");
    const free = dataset.rooms.find(
      (r) =>
        r.type === "lecture_hall" &&
        !BASELINE.some(
          (a) =>
            a.room_id === r.id &&
            a.day === l1.day &&
            a.start_period === l1.start_period,
        ),
    );
    const result = check({
      session_id: "CS202-L2",
      day: l1.day,
      start_period: l1.start_period,
      room_id: free?.id as string,
    });
    expect(result.violations.map((v) => v.rule).sort()).toEqual(["H2", "H3"]);
    expect(result.blockers).toEqual(["CS202-L1"]);
  });

  it("reports a basket member moved alone (H11)", () => {
    const oe = baseOf("OE301-L1");
    const result = check({
      ...oe,
      start_period: oe.start_period === 1 ? 2 : 1,
    });
    expect(result.violations.map((v) => v.rule)).toContain("H11");
  });

  it("gives the soft delta of the merged timetable", () => {
    const placement: Assignment = { ...baseOf("CS202-L2"), start_period: 9 };
    const result = check(placement);
    const instance = buildInstance(dataset);
    expect(result.soft_delta).toBe(
      softScore(instance, mergePlacement(BASELINE, placement)).total -
        softScore(instance, BASELINE).total,
    );
  });

  it("adds a session the timetable doesn't have yet", () => {
    const without = BASELINE.filter((a) => a.session_id !== "CS202-T1");
    const result = check(baseOf("CS202-T1"), without);
    expect(result).toMatchObject({ ok: true, violations: [], blockers: [] });
    expect(mergePlacement(without, baseOf("CS202-T1"))).toHaveLength(
      BASELINE.length,
    );
  });

  it("reports an unknown session", () => {
    const result = check({ ...baseOf("CS202-L2"), session_id: "NOPE-1" });
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.detail)).toContain(
      "Unknown session id NOPE-1",
    );
    expect(result.blockers).toEqual([]);
  });
});
