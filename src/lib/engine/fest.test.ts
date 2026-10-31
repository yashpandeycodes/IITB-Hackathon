import { describe, expect, it } from "vitest";

import {
  DEFAULT_FEST_WEIGHT,
  deriveFestDemands,
  festDemandGroups,
  festSummaryFor,
} from "./fest";
import { buildInstance } from "./instance";
import { at, publicDataset } from "./test-fixtures";

const PUBLIC = buildInstance(publicDataset());
const DEMANDS = deriveFestDemands(PUBLIC);
const demand = (id: string) => DEMANDS.find((d) => d.request_id === id)!;

describe("deriveFestDemands (public dataset)", () => {
  it("keeps exactly the eight timetable-dependent requests", () => {
    expect(DEMANDS.map((d) => d.request_id).sort()).toEqual([
      "BR-01",
      "BR-02",
      "BR-03",
      "BR-08",
      "BR-12",
      "BR-18",
      "BR-19",
      "BR-20",
    ]);
  });

  it("drops cancelled, unplaceable and evening-only requests", () => {
    const ids = new Set(DEMANDS.map((d) => d.request_id));
    // BR-04 cancelled; BR-09 1,200 people; BR-17 ends past P13; BR-10 SH-1 only (no session
    // can use it); BR-11a/BR-16 OAT; BR-13 evening (its CSE-3 periods are past P9).
    for (const id of [
      "BR-04",
      "BR-09",
      "BR-17",
      "BR-10",
      "BR-11a",
      "BR-13",
      "BR-16",
    ]) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it("weights each demand by its effective category", () => {
    expect(DEFAULT_FEST_WEIGHT).toBe(2);
    expect(demand("BR-01")).toMatchObject({
      effective_category: "institute_event",
      weight: 10,
    });
    expect(demand("BR-03")).toMatchObject({
      effective_category: "guest_lecture",
      weight: 8,
    });
    expect(demand("BR-08")).toMatchObject({
      effective_category: "department_event",
      weight: 6,
    });
    // A club claiming a guest lecture is capped at club_event.
    expect(demand("BR-12")).toMatchObject({
      effective_category: "club_event",
      weight: 4,
    });
    expect(
      deriveFestDemands(PUBLIC, { weightPerPoint: 1 }).find(
        (d) => d.request_id === "BR-01",
      )?.weight,
    ).toBe(5);
  });

  it("lists every in-window, statically feasible option", () => {
    expect(demand("BR-01").options).toEqual([
      {
        room_id: "AUD",
        day: "MON",
        start_period: 4,
        end_period: 5,
        room_periods: [4, 5],
        group_periods: [],
      },
    ]);
    // BR-03: WED P6–9, two periods, needs 300 seats with a PA: only AUD, three starts.
    expect(
      demand("BR-03").options.map((o) => `${o.room_id} ${o.start_period}`),
    ).toEqual(["AUD 6", "AUD 7", "AUD 8"]);
    // BR-02 runs into the evening: only P8–P9 of a P8–P13 option are teaching periods.
    const late = demand("BR-02").options.find((o) => o.start_period === 8)!;
    expect(late.end_period).toBe(13);
    expect(late.room_periods).toEqual([8, 9]);
    // BR-19 depends on ECE-3 being free at P9, even in a room no session uses (SH-1).
    const sh1 = demand("BR-19").options.find((o) => o.room_id === "SH-1")!;
    expect(sh1).toMatchObject({ room_periods: [], group_periods: [9] });
    expect(festDemandGroups(PUBLIC, "BR-19")).toEqual(["ECE-3"]);
    // BR-18: CIVIL-LAB and MECH-WS × TUE/THU × starts 6 and 7.
    expect(demand("BR-18").options).toHaveLength(8);
    for (const d of DEMANDS) {
      for (const o of d.options) {
        expect(o.room_periods.length + o.group_periods.length).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("drops a cancelled request even if the timetable could block it", () => {
    const dataset = publicDataset();
    dataset.cancellations.push({ request_id: "BR-01" });
    const ids = deriveFestDemands(buildInstance(dataset)).map(
      (d) => d.request_id,
    );
    expect(ids).not.toContain("BR-01");
    expect(ids).toContain("BR-20");
  });

  it("drops options in a room that is closed at those periods", () => {
    const dataset = publicDataset();
    dataset.room_unavailability.push({
      room_id: "AUD",
      day: "MON",
      periods: [5],
    });
    const ids = deriveFestDemands(buildInstance(dataset)).map(
      (d) => d.request_id,
    );
    expect(ids).not.toContain("BR-01");
  });
});

describe("festSummaryFor", () => {
  it("is 0 for an empty timetable", () => {
    expect(festSummaryFor(PUBLIC, [])).toEqual({
      cost: 0,
      weight_per_point: 2,
      demands: DEMANDS.map((d) => d.request_id),
      blocked: [],
    });
  });

  it("charges BR-01 when ID101 holds AUD on Monday at P4", () => {
    const summary = festSummaryFor(PUBLIC, [
      at("ID101-ALL-L1", "MON", 4, "AUD"),
    ]);
    expect(summary.blocked).toEqual([{ request_id: "BR-01", min_blockers: 1 }]);
    expect(summary.cost).toBe(10);
    expect(
      festSummaryFor(PUBLIC, [at("ID101-ALL-L1", "MON", 4, "AUD")], {
        weightPerPoint: 3,
      }).cost,
    ).toBe(15);
  });

  it("is 0 when ID101 is on Wednesday at P3", () => {
    const summary = festSummaryFor(PUBLIC, [
      at("ID101-ALL-L1", "WED", 3, "AUD"),
    ]);
    expect(summary.cost).toBe(0);
    expect(summary.blocked).toEqual([]);
  });

  it("charges BR-08 when ECE-3 has class on Thursday at P8", () => {
    const summary = festSummaryFor(PUBLIC, [
      at("EC301-L1", "THU", 8, "CR-104"),
    ]);
    expect(summary.blocked).toEqual([{ request_id: "BR-08", min_blockers: 1 }]);
    expect(summary.cost).toBe(6);
  });

  it("uses the fewest blockers over a demand's options", () => {
    // BR-03 has three AUD options on Wednesday afternoon; blocking P6–P7 leaves P8–P9 free.
    const free = festSummaryFor(PUBLIC, [
      at("ID101-ALL-L1", "WED", 3, "AUD"),
      at("MA101-AB-L1", "WED", 6, "AUD"),
      at("MA101-AB-L2", "WED", 7, "AUD"),
    ]);
    expect(free.cost).toBe(0);
    const blocked = festSummaryFor(PUBLIC, [
      at("MA101-AB-L1", "WED", 6, "AUD"),
      at("MA101-AB-L2", "WED", 8, "AUD"),
    ]);
    // Options P6–7, P7–8 and P8–9 hold 1, 1 and 1 classes.
    expect(blocked.blocked).toEqual([{ request_id: "BR-03", min_blockers: 1 }]);
    expect(blocked.cost).toBe(8);
  });
});
