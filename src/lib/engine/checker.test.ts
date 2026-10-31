import { describe, expect, it } from "vitest";

import { checkTimetable, isGroupBusy } from "./checker";
import { buildInstance } from "./instance";
import {
  SMALL_SESSIONS,
  SMALL_TIMETABLE,
  at,
  datasetWith,
  detailsOf,
  publicDataset,
  rulesOf,
  withChanges,
} from "./test-fixtures";

const small = buildInstance(datasetWith(SMALL_SESSIONS));
const check = (assignments = SMALL_TIMETABLE, instance = small) =>
  checkTimetable(instance, assignments).violations;

describe("checkTimetable: the passing fixture", () => {
  it("has no violations for a complete, clash-free timetable", () => {
    expect(check()).toEqual([]);
  });

  it("labels violations with the view they were found in", () => {
    const [v] = checkTimetable(
      small,
      withChanges(at("CS201-L1", "MON", 2, "LH-1")),
      "fest_week",
    ).violations;
    expect(v.where).toBe("fest_week");
  });
});

describe("H1: every session scheduled exactly once", () => {
  it("reports an unscheduled session", () => {
    const v = check(SMALL_TIMETABLE.filter((a) => a.session_id !== "ME201-L1"));
    expect(v).toEqual([
      {
        rule: "H1",
        where: "timetable",
        detail: "Session ME201-L1 is not scheduled",
      },
    ]);
  });

  it("reports unknown sessions, invalid days and unknown rooms", () => {
    const v = check([
      ...withChanges(
        at("CS201-L1", "SAT" as "MON", 2, "CR-102"),
        at("ME201-L1", "MON", 3, "LH-99"),
      ),
      at("ZZ-999", "MON", 1, "LH-1"),
    ]);
    expect(detailsOf(v)).toEqual([
      "ME201-L1: unknown room LH-99",
      "CS201-L1: invalid day SAT",
      "Unknown session id ZZ-999",
    ]);
  });

  it("prints a missing session id as None, like the validator", () => {
    const v = check([...SMALL_TIMETABLE, { day: "MON" } as never]);
    expect(detailsOf(v)).toEqual(["Unknown session id None"]);
  });

  it("reports a repeated session once per extra entry; the last placement wins", () => {
    const v = check([...SMALL_TIMETABLE, at("CS201-L1", "FRI", 2, "CR-102")]);
    expect(v).toEqual([
      {
        rule: "H1",
        where: "timetable",
        detail: "Session CS201-L1 appears more than once",
      },
    ]);
  });
});

describe("H2/H3/H4: double bookings", () => {
  it("H4: two sessions in one room (ids sorted)", () => {
    const v = check(withChanges(at("CS201-L1", "MON", 2, "LH-1")));
    expect(v).toEqual([
      {
        rule: "H4",
        where: "timetable",
        detail: "LH-1 double-booked MON P2: CS201-L1, MA101-AB-L1",
      },
    ]);
  });

  it("H2: a faculty member in two places", () => {
    const v = check(
      withChanges(at("CS201-L2", "MON", 2, "CR-103")),
      buildInstance(datasetWith([...SMALL_SESSIONS, "CS201-L2"])),
    );
    expect(v).toContainEqual({
      rule: "H2",
      where: "timetable",
      detail: "F02 double-booked MON P2: CS201-L1, CS201-L2",
    });
    expect(v).toContainEqual({
      rule: "H3",
      where: "timetable",
      detail: "Group CSE-2 double-booked MON P2: CS201-L1, CS201-L2",
    });
  });

  it("H3: a combined lecture blocks every one of its groups", () => {
    const v = check(withChanges(at("MA101-AB-L1", "WED", 3, "LH-1")));
    expect(detailsOf(v)).toEqual([
      "Group Y1-A double-booked WED P3: ID101-ALL-L1, MA101-AB-L1",
      "Group Y1-B double-booked WED P3: ID101-ALL-L1, MA101-AB-L1",
    ]);
  });

  it("basket siblings share a slot without clashing; another basket clashes as a unit", () => {
    const instance = buildInstance(
      datasetWith([...SMALL_SESSIONS, "OE301-L2"]),
    );
    const ok = check(withChanges(at("OE301-L2", "FRI", 3, "LH-3")), instance);
    expect(ok).toEqual([]);

    const v = check(withChanges(at("OE301-L2", "THU", 3, "LH-6")), instance);
    expect(v).toContainEqual({
      rule: "H2",
      where: "timetable",
      detail: "F39 double-booked THU P3: OE301-L1, OE301-L2",
    });
    expect(detailsOf(v.filter((x) => x.rule === "H3"))).toEqual([
      "Group CSE-3 double-booked THU P3: OEB-1, OEB-2",
      "Group ECE-3 double-booked THU P3: OEB-1, OEB-2",
      "Group EE-3 double-booked THU P3: OEB-1, OEB-2",
      "Group ME-3 double-booked THU P3: OEB-1, OEB-2",
      "Group CE-3 double-booked THU P3: OEB-1, OEB-2",
    ]);
  });

  it("exposes group occupancy keyed by the basket unit", () => {
    const { group_occupancy } = checkTimetable(small, SMALL_TIMETABLE);
    expect(isGroupBusy(group_occupancy, "ECE-3", "THU", 3)).toBe(true);
    expect(isGroupBusy(group_occupancy, "ECE-3", "THU", 4)).toBe(false);
  });
});

describe("H5/H6/H10: room fit", () => {
  it("H5: capacity below the session size", () => {
    expect(check(withChanges(at("MA101-AB-L1", "MON", 2, "CR-101")))).toEqual([
      {
        rule: "H5",
        where: "timetable",
        detail: "MA101-AB-L1: size 180 > CR-101 capacity 90",
      },
    ]);
  });

  it("H5: a combined lecture only fits the auditorium", () => {
    const v = check(withChanges(at("ID101-ALL-L1", "WED", 3, "LH-1")));
    expect(detailsOf(v)).toEqual([
      "ID101-ALL-L1: size 360 > LH-1 capacity 200",
    ]);
  });

  it("H6: room type not allowed (printed as a Python list)", () => {
    expect(check(withChanges(at("CS201-L1", "MON", 2, "SH-2")))).toEqual([
      {
        rule: "H6",
        where: "timetable",
        detail:
          "CS201-L1: needs ['classroom', 'lecture_hall', 'auditorium'], SH-2 is seminar_hall",
      },
    ]);
  });

  it("H10: accessible room required", () => {
    expect(check(withChanges(at("ME201-L1", "MON", 3, "CR-201")))).toEqual([
      {
        rule: "H10",
        where: "timetable",
        detail: "ME201-L1: needs an accessible room, CR-201 is not",
      },
    ]);
  });
});

describe("H7/H8: unavailability", () => {
  it("H7: faculty unavailable", () => {
    const v = check(withChanges(at("ID101-ALL-L1", "TUE", 5, "AUD")));
    expect(v).toEqual([
      {
        rule: "H7",
        where: "timetable",
        detail: "ID101-ALL-L1: F37 unavailable TUE P5",
      },
    ]);
  });

  it("H8: room closed", () => {
    expect(check(withChanges(at("CS201-L1", "THU", 2, "LH-4")))).toEqual([
      {
        rule: "H8",
        where: "timetable",
        detail: "CS201-L1: LH-4 unavailable THU P2",
      },
    ]);
  });
});

describe("H9: time grid", () => {
  it("lab at P6 is fine", () => {
    expect(check(withChanges(at("PH191-A-P1", "TUE", 6, "PHY-LAB")))).toEqual(
      [],
    );
  });

  it("lab not at a lab start", () => {
    expect(
      detailsOf(check(withChanges(at("PH191-A-P1", "TUE", 3, "PHY-LAB")))),
    ).toEqual(["PH191-A-P1: lab must start at P2 or P6, starts at P3"]);
  });

  it("a block that crosses lunch", () => {
    expect(
      detailsOf(check(withChanges(at("PH191-A-P1", "TUE", 4, "PHY-LAB")))),
    ).toEqual([
      "PH191-A-P1: crosses lunch (TUE P4-P6)",
      "PH191-A-P1: lab must start at P2 or P6, starts at P4",
    ]);
  });

  it("a block that runs past P9 (or starts before P1) stops further checks", () => {
    const v = check(
      withChanges(
        at("PH191-A-P1", "TUE", 8, "PHY-LAB"),
        at("CS201-L1", "MON", 0, "CR-102"),
      ),
    );
    expect(detailsOf(v)).toEqual([
      "PH191-A-P1: start period 8 with duration 3 runs outside P1-P9",
      "CS201-L1: start period 0 with duration 1 runs outside P1-P9",
    ]);
  });

  it("a non-integer start is H9, printed as given", () => {
    const v = check(
      withChanges({
        session_id: "CS201-L1",
        day: "MON",
        start_period: "2",
        room_id: "CR-102",
      } as never),
    );
    expect(detailsOf(v)).toEqual([
      "CS201-L1: start period 2 with duration 1 runs outside P1-P9",
    ]);
  });
});

describe("H11: basket sessions at the same time", () => {
  it("lists the distinct times, sorted, as Python tuples", () => {
    const v = check(withChanges(at("OE303-L1", "MON", 4, "CR-101")));
    expect(v).toEqual([
      {
        rule: "H11",
        where: "timetable",
        detail:
          "Basket OEB-1 sessions are not at the same time: [('MON', 4), ('THU', 3)]",
      },
    ]);
  });
});

describe("H12: daily teaching limit", () => {
  const capped = buildInstance(
    datasetWith([...SMALL_SESSIONS, "CS201-L2"], (d) => {
      d.faculty.find((f) => f.id === "F02")!.max_hours_per_day = 1;
    }),
  );

  it("passes at the limit", () => {
    expect(
      check(withChanges(at("CS201-L2", "TUE", 2, "CR-102")), capped),
    ).toEqual([]);
  });

  it("fails above it", () => {
    expect(
      check(withChanges(at("CS201-L2", "MON", 4, "CR-102")), capped),
    ).toEqual([
      {
        rule: "H12",
        where: "timetable",
        detail: "F02 teaches 2 hours on MON (max 1)",
      },
    ]);
  });
});

describe("H14: fixed slots", () => {
  const fixed = buildInstance(
    datasetWith(SMALL_SESSIONS, (d) => {
      d.sessions.find((s) => s.id === "CS201-L1")!.fixed_slot = {
        day: "MON",
        start_period: 2,
      };
    }),
  );

  it("passes when placed at the fixed slot", () => {
    expect(check(SMALL_TIMETABLE, fixed)).toEqual([]);
  });

  it("fails anywhere else", () => {
    expect(
      check(withChanges(at("CS201-L1", "TUE", 2, "CR-102")), fixed),
    ).toEqual([
      {
        rule: "H14",
        where: "timetable",
        detail: "CS201-L1: fixed at MON P2, placed at TUE P2",
      },
    ]);
  });
});

describe("rules read from the dataset", () => {
  it("uses the dataset's lab starts and lunch position", () => {
    const instance = buildInstance(
      datasetWith(SMALL_SESSIONS, (d) => {
        d.calendar.lab_start_periods = [3];
        d.calendar.lunch.after_period = 3;
      }),
    );
    const v = check(
      withChanges(at("PH191-A-P1", "TUE", 3, "PHY-LAB")),
      instance,
    );
    // P3 is now a valid lab start, but lunch after P3 now splits the block P3-P5.
    expect(detailsOf(v)).toEqual(["PH191-A-P1: crosses lunch (TUE P3-P5)"]);
  });

  it("checks the full public dataset without throwing", () => {
    const v = checkTimetable(buildInstance(publicDataset()), []).violations;
    expect(rulesOf(v).every((r) => r === "H1")).toBe(true);
    expect(v).toHaveLength(publicDataset().sessions.length);
  });
});
