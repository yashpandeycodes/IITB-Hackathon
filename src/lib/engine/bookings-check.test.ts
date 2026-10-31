import { describe, expect, it } from "vitest";

import type { Dataset } from "@/lib/contracts";

import { checkBookings, outranks } from "./bookings-check";
import { toAssignMap } from "./checker";
import { buildInstance } from "./instance";
import {
  SMALL_SESSIONS,
  SMALL_TIMETABLE,
  datasetWith,
  detailsOf,
} from "./test-fixtures";
import type { BookingDecisionInput, SessionOverrideInput } from "./types";

const dataset = datasetWith(SMALL_SESSIONS);
const instance = buildInstance(dataset);

function run(
  bookings: BookingDecisionInput[],
  session_overrides: SessionOverrideInput[] = [],
  data: Dataset = dataset,
) {
  return checkBookings(
    buildInstance(data),
    toAssignMap(SMALL_TIMETABLE).assign,
    { bookings, session_overrides },
  );
}

const approve = (
  request_id: string,
  day: string,
  start_period: number,
  end_period: number,
  room_id: string,
  status = "approved",
): BookingDecisionInput => ({
  request_id,
  status,
  day,
  start_period,
  end_period,
  room_id,
  reason: "ok",
});

const AUD_INAUGURATION = approve("BR-01", "MON", 4, 5, "AUD");

describe("checkBookings: scoring and stats", () => {
  it("approves a booking that fits and scores its category weight", () => {
    const { violations, stats, warnings } = run([AUD_INAUGURATION]);
    expect(violations).toEqual([]);
    expect(stats).toEqual({
      booking_score: 5,
      booking_score_max_if_all_approved: 70,
      approved: 1,
      alternatives: 0,
      rejected: 0,
      session_overrides: 0,
      priority_inversions: [],
    });
    expect(warnings).toHaveLength(24);
    expect(warnings[0]).toBe("No decision for BR-02");
  });

  it("an alternative scores half", () => {
    const { violations, stats } = run([
      approve("BR-07", "THU", 10, 12, "AUD", "alternative_offered"),
    ]);
    expect(violations).toEqual([]);
    expect(stats.booking_score).toBe(1);
    expect(stats.alternatives).toBe(1);
  });

  it("counts statuses over every decision, duplicates included", () => {
    const { stats, violations } = run([
      AUD_INAUGURATION,
      AUD_INAUGURATION,
      { request_id: "BR-09", status: "rejected", reason: "Too big" },
    ]);
    expect(stats.approved).toBe(2);
    expect(stats.rejected).toBe(1);
    expect(detailsOf(violations)).toContain("Two decisions for BR-01");
  });
});

describe("B1-B3", () => {
  it("B1: unknown status", () => {
    const { violations } = run([{ request_id: "BR-02", status: "maybe" }]);
    expect(violations).toEqual([
      {
        rule: "B1",
        where: "fest_week",
        detail: "BR-02: unknown status maybe",
      },
    ]);
  });

  it("B3: a cancelled request must not be approved or offered", () => {
    expect(run([approve("BR-04", "TUE", 10, 12, "SH-2")]).violations).toEqual([
      {
        rule: "B3",
        where: "fest_week",
        detail: "BR-04 was cancelled but is approved",
      },
    ]);
    expect(
      run([{ request_id: "BR-04", status: "rejected", reason: "Cancelled" }])
        .violations,
    ).toEqual([]);
  });

  it("B2: only an approved institute event may displace a session", () => {
    const move = (displaced_by: string, session_id = "MA101-AB-L1") => ({
      session_id,
      day: "FRI",
      start_period: 2,
      room_id: "LH-1",
      displaced_by,
    });
    expect(run([AUD_INAUGURATION], [move("BR-01")]).violations).toEqual([]);

    const { violations } = run(
      [
        AUD_INAUGURATION,
        approve("BR-06", "THU", 10, 11, "SH-1"),
        approve("BR-15", "FRI", 10, 12, "OAT"),
        { request_id: "BR-09", status: "rejected", reason: "Too big" },
      ],
      [
        move("BR-06"),
        move("BR-15", "CS201-L1"),
        move("BR-09", "ME201-L1"),
        move("BR-01", "XX-1"),
      ],
    );
    expect(detailsOf(violations.filter((v) => v.rule === "B2"))).toEqual([
      "BR-06 (club_event) is not allowed to displace a regular session",
      // A club that claims institute_event is capped at club_event.
      "BR-15 (club_event) is not allowed to displace a regular session",
      "Override of ME201-L1 names BR-09, which is not an approved booking",
      "Override for unknown session XX-1",
    ]);
  });

  it("re-checks the Spectra week with overrides applied", () => {
    const { violations, week } = run(
      [AUD_INAUGURATION],
      [
        {
          session_id: "MA101-AB-L1",
          day: "MON",
          start_period: 2,
          room_id: "CR-102",
          displaced_by: "BR-01",
        },
      ],
    );
    expect(week.get("MA101-AB-L1")).toEqual({
      day: "MON",
      start_period: 2,
      room_id: "CR-102",
    });
    expect(violations).toEqual([
      {
        rule: "H5",
        where: "fest_week",
        detail: "MA101-AB-L1: size 180 > CR-102 capacity 90",
      },
      {
        rule: "H4",
        where: "fest_week",
        detail: "CR-102 double-booked MON P2: CS201-L1, MA101-AB-L1",
      },
    ]);
  });
});

describe("H13: booking validity", () => {
  const h13 = (decisions: BookingDecisionInput[], data?: Dataset) =>
    detailsOf(
      run(decisions, [], data).violations.filter((v) => v.rule === "H13"),
    );

  it("unknown room and invalid time stop further checks", () => {
    expect(
      h13([
        { request_id: "BR-01", status: "approved", reason: "" },
        approve("BR-20", "FRI", 4, 14, "AUD"),
        approve("BR-11a", "SUN", 6, 9, "OAT"),
      ]),
    ).toEqual([
      "BR-01: unknown room None",
      "BR-11a: invalid time SUN P6-P9",
      "BR-20: invalid time FRI P4-P14",
    ]);
  });

  it("duration, room type, capacity and features (Python list formatting)", () => {
    expect(h13([approve("BR-01", "MON", 4, 4, "LH-1")])).toEqual([
      "BR-01: booked 1 periods, request needs 2",
      "BR-01: LH-1 (lecture_hall) is not one of ['auditorium']",
      "BR-01: LH-1 seats 200, request needs 450",
      "BR-01: LH-1 lacks ['stage']",
    ]);
  });

  it("an approval must sit inside a requested window; an alternative need not", () => {
    expect(h13([approve("BR-01", "MON", 6, 7, "AUD")])).toEqual([
      "BR-01: approved at MON P6-P7, outside the requested windows (use alternative_offered)",
    ]);
    expect(
      h13([approve("BR-01", "MON", 6, 7, "AUD", "alternative_offered")]),
    ).toEqual([]);
  });

  it("the room must be free of sessions and earlier bookings", () => {
    expect(
      h13([
        AUD_INAUGURATION,
        approve("BR-12", "MON", 2, 2, "LH-1", "alternative_offered"),
        approve("BR-20", "MON", 4, 5, "AUD", "alternative_offered"),
      ]),
    ).toEqual([
      "BR-12: LH-1 MON P2 already used by MA101-AB-L1",
      "BR-20: AUD MON P4 already used by BR-01",
      "BR-20: AUD MON P5 already used by BR-01",
    ]);
  });

  it("room closures and mandatory groups", () => {
    expect(
      h13([approve("BR-08", "THU", 8, 8, "LH-4", "alternative_offered")]),
    ).toEqual([
      "BR-08: LH-4 unavailable THU P8",
      "BR-08: mandatory for ECE-3, who have class THU P8",
    ]);
    expect(
      h13([approve("BR-08", "THU", 9, 9, "CR-105", "alternative_offered")]),
    ).toEqual([]);
  });

  it("the room must allow events", () => {
    const noEvents = datasetWith(SMALL_SESSIONS, (d) => {
      const sh2 = d.rooms.find((r) => r.id === "SH-2")!;
      sh2.allowed_uses = ["exam"];
    });
    expect(h13([approve("BR-13", "WED", 10, 11, "SH-2")], noEvents)).toEqual([
      "BR-13: SH-2 cannot host events",
    ]);
  });

  it("a failed booking does not score or hold the room", () => {
    const { stats } = run([
      approve("BR-01", "MON", 4, 4, "AUD"),
      approve("BR-20", "MON", 4, 5, "AUD", "alternative_offered"),
    ]);
    expect(stats.booking_score).toBe(2.5);
  });
});

describe("priority inversions", () => {
  it("flags a rejected request that could have used a lower-priority approval's slot", () => {
    const { stats } = run([
      { request_id: "BR-06", status: "rejected", reason: "Taken" },
      approve("BR-07", "THU", 10, 12, "SH-1"),
    ]);
    expect(stats.priority_inversions).toEqual([
      "BR-06 rejected, but BR-07 (lower priority) holds SH-1 THU P10-P12 that BR-06 could use",
    ]);
  });

  it("ignores alternatives and higher-priority holders", () => {
    expect(
      run([
        { request_id: "BR-06", status: "rejected", reason: "Taken" },
        approve("BR-07", "THU", 10, 12, "SH-1", "alternative_offered"),
      ]).stats.priority_inversions,
    ).toEqual([]);
    expect(
      run([
        { request_id: "BR-07", status: "rejected", reason: "Taken" },
        approve("BR-06", "THU", 10, 11, "SH-1"),
      ]).stats.priority_inversions,
    ).toEqual([]);
  });

  it("outranks: category first (after the role cap), then submission time", () => {
    const req = (id: string) => instance.requests.get(id)!;
    expect(outranks(instance, req("BR-06"), req("BR-07"))).toBe(true);
    expect(outranks(instance, req("BR-07"), req("BR-06"))).toBe(false);
    expect(outranks(instance, req("BR-03"), req("BR-06"))).toBe(true);
    expect(outranks(instance, req("BR-15"), req("BR-01"))).toBe(false);
  });
});

describe("warnings", () => {
  it("rejections and alternatives need a reason; a null reason prints as None", () => {
    const { warnings } = run([
      { request_id: "BR-09", status: "rejected" },
      { request_id: "BR-10", status: "rejected", reason: "   " },
      { request_id: "BR-02", status: "rejected", reason: null },
    ]);
    expect(warnings).toContain("BR-09: rejected without a reason");
    expect(warnings).toContain("BR-10: rejected without a reason");
    expect(warnings.some((w) => w.startsWith("BR-02"))).toBe(false);
  });
});
