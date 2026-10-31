import { describe, expect, it } from "vitest";

import {
  BookingDecisionSchema,
  ReasonCode,
  SessionOverrideSchema,
  type Assignment,
  type Dataset,
  type PriorityRules,
  type Session,
} from "@/lib/contracts";

import {
  decideBookings,
  suggestRoom,
  type EngineBookingDecision,
  type SpectraDecisionResult,
  type SpectraOptions,
} from "./bookings";
import { cancelledReason, formatDate } from "./bookings-text";
import { checkTimetable } from "./checker";
import {
  buildInstance,
  isFacultyUnavailable,
  isRoomUnavailable,
} from "./instance";
import { mulberry32, shuffle } from "./rng";
import {
  SMALL_TIMETABLE,
  at,
  datasetWith,
  publicDataset,
} from "./test-fixtures";

// ------------------------------------------------------------------------------ fixtures

/** `SMALL_TIMETABLE` without EC301-L1, which sits on ECE-3's THU P8 (BR-08). */
const FRIENDLY = SMALL_TIMETABLE.filter((a) => a.session_id !== "EC301-L1");
const FRIENDLY_IDS = FRIENDLY.map((a) => a.session_id);

const replace = (
  base: readonly Assignment[],
  ...changes: Assignment[]
): Assignment[] =>
  base.map((a) => changes.find((c) => c.session_id === a.session_id) ?? a);

/** A 4-hour lecture that fills AUD across BR-03's whole window (WED P6–P9). */
const AUD_BLOCKER: Session = {
  id: "GX-AUD-WED",
  course_id: "CS201",
  kind: "lecture",
  groups: ["CSE-2"],
  faculty_id: "F02",
  size: 300,
  duration: 4,
  room_types: ["auditorium"],
  needs_accessible: false,
  basket_slot: null,
  fixed_slot: null,
};

function run(
  data: Dataset,
  base: readonly Assignment[],
  options?: SpectraOptions,
): SpectraDecisionResult {
  const instance = buildInstance(data);
  // Every fixture timetable must be valid on its own, so any violation is the engine's.
  expect(checkTimetable(instance, base).violations).toEqual([]);
  return decideBookings(instance, base, options);
}

const byId = (result: SpectraDecisionResult) =>
  new Map(result.decisions.map((d) => [d.request_id, d]));

function decisionOf(
  result: SpectraDecisionResult,
  id: string,
): EngineBookingDecision {
  const d = byId(result).get(id);
  if (!d) throw new Error(`no decision for ${id}`);
  return d;
}

const slot = (d: EngineBookingDecision) =>
  `${d.room_id} ${d.day} P${d.start_period}-P${d.end_period}`;

function expectClean(result: SpectraDecisionResult) {
  expect(result.violations).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(result.stats.priority_inversions).toEqual([]);
}

const friendly = () => run(datasetWith(FRIENDLY_IDS), FRIENDLY);

// ------------------------------------------------------------------------------ FRIENDLY

describe("decideBookings: fest-friendly timetable", () => {
  const result = friendly();
  const d = (id: string) => decisionOf(result, id);

  it("reaches the realistic ceiling of 67 with a clean self-check", () => {
    expectClean(result);
    expect(result.overrides).toEqual([]);
    expect(result.stats).toEqual({
      booking_score: 67,
      booking_score_max_if_all_approved: 70,
      approved: 22,
      alternatives: 1,
      rejected: 2,
      session_overrides: 0,
      priority_inversions: [],
    });
  });

  it("returns one decision per request, in dataset order", () => {
    const instance = buildInstance(datasetWith(FRIENDLY_IDS));
    expect(result.decisions).toHaveLength(instance.requests.size);
    expect(result.decisions.map((x) => x.request_id)).toEqual([
      ...instance.requests.keys(),
    ]);
  });

  it("decides by effective category, then submission time; cancelled last", () => {
    expect(result.order).toEqual([
      "BR-01",
      "BR-11a",
      "BR-11b",
      "BR-20",
      "BR-16",
      "BR-03",
      "BR-19",
      "BR-08",
      "BR-13",
      "BR-18",
      "BR-02",
      "BR-06",
      "BR-05a",
      "BR-05b",
      "BR-05c",
      "BR-05d",
      "BR-05e",
      "BR-07",
      "BR-09",
      "BR-10",
      "BR-12",
      "BR-14",
      "BR-15",
      "BR-17",
      "BR-04",
    ]);
  });

  it("matches the expected trace", () => {
    const table = Object.fromEntries(
      result.decisions.map((x) => [
        x.request_id,
        x.status === "rejected"
          ? `rejected ${x.reason_code}`
          : `${x.status} ${slot(x)} ${x.reason_code}`,
      ]),
    );
    expect(table).toEqual({
      "BR-01": "approved AUD MON P4-P5 APPROVED_AS_REQUESTED",
      "BR-02": "approved CS-LAB-1 THU P6-P11 APPROVED_AS_REQUESTED",
      "BR-03": "approved AUD WED P6-P7 APPROVED_AS_REQUESTED",
      "BR-04": "rejected REJ_CANCELLED",
      "BR-05a": "approved OAT MON P11-P12 APPROVED_AS_REQUESTED",
      "BR-05b": "approved OAT TUE P11-P12 APPROVED_AS_REQUESTED",
      "BR-05c": "approved OAT WED P11-P12 APPROVED_AS_REQUESTED",
      "BR-05d": "approved OAT THU P11-P12 APPROVED_AS_REQUESTED",
      "BR-05e": "approved SH-2 FRI P11-P12 ROOM_SWAPPED_IN_WINDOW",
      "BR-06": "approved SH-1 THU P10-P11 APPROVED_AS_REQUESTED",
      "BR-07": "approved AUD THU P10-P12 ROOM_SWAPPED_IN_WINDOW",
      "BR-08": "approved CR-105 THU P8-P8 APPROVED_AS_REQUESTED",
      "BR-09": "rejected REJ_NO_CAPACITY",
      "BR-10": "approved SH-1 FRI P1-P9 APPROVED_AS_REQUESTED",
      "BR-11a": "approved OAT THU P6-P9 APPROVED_AS_REQUESTED",
      "BR-11b": "approved OAT FRI P6-P9 APPROVED_AS_REQUESTED",
      "BR-12": "approved LH-1 TUE P9-P9 APPROVED_AS_REQUESTED",
      "BR-13": "approved CR-103 WED P10-P11 APPROVED_AS_REQUESTED",
      "BR-14": "approved SH-2 WED P11-P12 ROOM_SWAPPED_IN_WINDOW",
      "BR-15": "approved AUD FRI P10-P12 APPROVED_AS_REQUESTED",
      "BR-16": "approved OAT FRI P10-P13 APPROVED_AS_REQUESTED",
      "BR-17": "alternative_offered OAT WED P9-P10 ALT_OUTSIDE_WINDOW",
      "BR-18": "approved CIVIL-LAB TUE P6-P8 APPROVED_AS_REQUESTED",
      "BR-19": "approved CR-105 MON P9-P9 APPROVED_AS_REQUESTED",
      "BR-20": "approved AUD FRI P4-P5 APPROVED_AS_REQUESTED",
    });
  });

  it("BR-04 (cancelled) is rejected with who, when and why", () => {
    const x = d("BR-04");
    expect(x).toMatchObject({
      status: "rejected",
      reason_code: "REJ_CANCELLED",
    });
    expect(x.reason).toBe(
      "Cancelled by Robotics Club on 3 Feb 2027: Workshop moved to after Spectra.",
    );
    expect(x.facts.cancelled).toEqual({
      by: "Robotics Club",
      at: "2027-02-03T18:40:00+05:30",
      note: "Workshop moved to after Spectra",
    });
    expect("day" in x || "room_id" in x || "start_period" in x).toBe(false);
  });

  it("BR-09 (1,200 people) is rejected for capacity, naming the largest venue", () => {
    const x = d("BR-09");
    expect(x.reason_code).toBe("REJ_NO_CAPACITY");
    expect(x.reason).toBe(
      "No auditorium/outdoor venue seats 1,200. The largest is OAT (800).",
    );
    expect(x.facts.largest_room).toEqual({ room_id: "OAT", capacity: 800 });
    expect(x.facts.candidate_rooms).toEqual([]);
  });

  it("BR-12 and BR-15 are capped to club_event and still approved", () => {
    for (const id of ["BR-12", "BR-15"]) {
      expect(d(id)).toMatchObject({
        status: "approved",
        effective_category: "club_event",
        category_capped: true,
      });
    }
    expect(d("BR-15").room_id).toBe("AUD");
    expect(result.decisions.filter((x) => x.category_capped)).toHaveLength(2);
  });

  it("BR-06 keeps SH-1; BR-07 moves to AUD inside its window and names BR-06", () => {
    expect(slot(d("BR-06"))).toBe("SH-1 THU P10-P11");
    const x = d("BR-07");
    expect(x.status).toBe("approved");
    expect(x.room_id).not.toBe("SH-1");
    expect(x.reason).toBe(
      "SH-1 is held by BR-06 (club event, submitted earlier). AUD has stage and pa_system and is free inside your window, THU P10–P12 (18:00–21:00).",
    );
    expect(x.facts.blocked_by).toEqual([
      {
        kind: "booking",
        id: "BR-06",
        room_id: "SH-1",
        day: "THU",
        periods: [10, 11],
      },
    ]);
  });

  it("BR-14 asks for LHC-5: suggests LH-5, notes it lacks pa_system, picks a PA room", () => {
    const x = d("BR-14");
    expect(x.facts).toMatchObject({
      requested_room: "LHC-5",
      requested_room_known: false,
      room_suggestion: "LH-5",
      requested_room_missing: ["pa_system"],
    });
    expect(x.reason_code).toBe("ROOM_SWAPPED_IN_WINDOW");
    expect(x.reason).toContain(
      "LHC-5 doesn't exist (closest: LH-5, which lacks pa_system)",
    );
    expect(["LH-1", "LH-2", "SH-1", "SH-2"]).toContain(x.room_id);
  });

  it("BR-17 (P13–P14) gets an OAT alternative that ends by P13", () => {
    const x = d("BR-17");
    expect(x).toMatchObject({
      status: "alternative_offered",
      reason_code: "ALT_OUTSIDE_WINDOW",
      room_id: "OAT",
    });
    expect(x.end_period).toBeLessThanOrEqual(13);
    expect(x.reason).toContain("events end at 22:00 (P13)");
    expect(x.reason).toContain("Offered OAT WED P9–P10 (17:00–19:00)");
  });

  it("BR-10 gets the accessible seminar hall; BR-05e falls back to a seminar hall", () => {
    expect(slot(d("BR-10"))).toBe("SH-1 FRI P1-P9");
    const e = d("BR-05e");
    expect(e.room_id).toMatch(/^SH-/);
    expect(e.reason).toContain("OAT is held by BR-16");
  });

  it("institute events take OAT and AUD as asked", () => {
    expect(slot(d("BR-11a"))).toBe("OAT THU P6-P9");
    expect(slot(d("BR-11b"))).toBe("OAT FRI P6-P9");
    expect(slot(d("BR-16"))).toBe("OAT FRI P10-P13");
    expect(d("BR-01").reason).toBe(
      "AUD is free MON P4–P5 (11:00–13:00) and has stage, pa_system and projector.",
    );
  });

  it("emits valid export shapes and reasons for every decision", () => {
    for (const x of result.decisions) {
      const exported = {
        request_id: x.request_id,
        status: x.status,
        day: x.day,
        start_period: x.start_period,
        end_period: x.end_period,
        room_id: x.room_id,
        reason: x.reason,
      };
      expect(BookingDecisionSchema.safeParse(exported).success).toBe(true);
      expect(ReasonCode.safeParse(x.reason_code).success).toBe(true);
      expect(x.reason.trim()).not.toBe("");
      expect(x.reason_code).not.toBe("REJ_ROOM_UNKNOWN");
      expect(x.requires_admin_approval).toBe(false);
    }
  });

  it("returns the base week unchanged when nothing moves", () => {
    expect(result.week).toEqual(FRIENDLY);
  });

  it("is deterministic", () => {
    expect(friendly()).toEqual(result);
  });
});

// ----------------------------------------------------------------------------- MANDATORY

describe("decideBookings: compulsory groups", () => {
  const result = run(datasetWith(SMALL_TIMETABLE.map((a) => a.session_id)), [
    ...SMALL_TIMETABLE,
  ]);

  it("offers BR-08 the nearest time ECE-3 is free, naming EC301-L1", () => {
    expectClean(result);
    const x = decisionOf(result, "BR-08");
    expect(x).toMatchObject({
      status: "alternative_offered",
      reason_code: "ALT_OUTSIDE_WINDOW",
      day: "THU",
      start_period: 7,
      end_period: 7,
    });
    expect(x.reason).toBe(
      "Compulsory for ECE-3, who have EC301-L1 at THU P8 (16:00–17:00). Offered CR-105 THU P7 (15:00–16:00) instead (outside your window).",
    );
    expect(x.facts.blocked_by).toContainEqual({
      kind: "group",
      id: "ECE-3",
      day: "THU",
      periods: [8],
    });
    expect(x.facts.blocked_by).toContainEqual({
      kind: "session",
      id: "EC301-L1",
      room_id: "CR-104",
      day: "THU",
      periods: [8],
    });
    expect(result.stats.booking_score).toBe(65.5);
  });

  it("rejects with REJ_MANDATORY_GROUP_BUSY when no other time works", () => {
    // BR-08 may only use seminar halls, and they are closed except THU P8.
    const allDay = Array.from({ length: 13 }, (_, i) => i + 1);
    const closed = (room_id: string): Dataset["room_unavailability"] => [
      ...(["MON", "TUE", "WED", "FRI"] as const).map((day) => ({
        room_id,
        day,
        periods: allDay,
      })),
      { room_id, day: "THU", periods: allDay.filter((p) => p !== 8) },
    ];
    const data = datasetWith(
      SMALL_TIMETABLE.map((a) => a.session_id),
      (ds) => {
        ds.booking_requests.find((r) => r.id === "BR-08")!.room_types = [
          "seminar_hall",
        ];
        ds.room_unavailability.push(...closed("SH-1"), ...closed("SH-2"));
      },
    );
    const r = run(data, [...SMALL_TIMETABLE]);
    expectClean(r);
    const x = decisionOf(r, "BR-08");
    expect(x).toMatchObject({
      status: "rejected",
      reason_code: "REJ_MANDATORY_GROUP_BUSY",
    });
    expect(x.reason).toBe(
      "Compulsory for ECE-3, who have EC301-L1 at THU P8 (16:00–17:00), and no other time works.",
    );
  });
});

// ------------------------------------------------------------------------------- HOSTILE

describe("decideBookings: displacement for institute events", () => {
  const base = replace(FRIENDLY, at("ID101-ALL-L1", "MON", 4, "AUD"));
  const data = datasetWith(FRIENDLY_IDS);
  const result = run(data, base);

  it("moves ID101-ALL-L1 out of AUD MON P4 for BR-01, with Admin approval", () => {
    expectClean(result);
    const x = decisionOf(result, "BR-01");
    expect(x).toMatchObject({
      status: "approved",
      reason_code: "APPROVED_WITH_DISPLACEMENT",
      requires_admin_approval: true,
      room_id: "AUD",
      day: "MON",
      start_period: 4,
      end_period: 5,
    });
    expect(result.overrides).toEqual([
      {
        session_id: "ID101-ALL-L1",
        day: "MON",
        start_period: 3,
        room_id: "AUD",
        displaced_by: "BR-01",
      },
    ]);
    expect(x.facts.displaced).toEqual([
      {
        session_id: "ID101-ALL-L1",
        from: at("ID101-ALL-L1", "MON", 4, "AUD"),
        to: at("ID101-ALL-L1", "MON", 3, "AUD"),
      },
    ]);
    expect(x.reason).toBe(
      "Institute event in AUD MON P4–P5 (11:00–13:00). ID101-ALL-L1 moves to MON P3 in AUD for Week 7 only (needs Admin approval).",
    );
    expect(result.stats.booking_score).toBe(67);
    expect(result.stats.session_overrides).toBe(1);
  });

  it("returns a valid Week-7 timetable with the override applied", () => {
    for (const o of result.overrides) {
      expect(SessionOverrideSchema.safeParse(o).success).toBe(true);
    }
    expect(result.week).toEqual(
      replace(base, at("ID101-ALL-L1", "MON", 3, "AUD")),
    );
    expect(
      checkTimetable(buildInstance(data), result.week, "fest_week").violations,
    ).toEqual([]);
    expect(
      result.decisions.filter((d) => d.requires_admin_approval),
    ).toHaveLength(1);
  });

  it("offers an alternative instead when displacement is switched off", () => {
    const r = run(data, base, { allowDisplacement: false });
    expectClean(r);
    expect(r.overrides).toEqual([]);
    const x = decisionOf(r, "BR-01");
    expect(x.reason_code).toBe("ALT_OUTSIDE_WINDOW");
    expect(x.reason).toContain("moving classes is switched off");
    expect(r.week).toEqual(base);
  });
});

describe("decideBookings: retry after a displacement", () => {
  // R (institute) needs CE-3 free at MON P5, where T-S sits, and T-S has nowhere to go: its
  // faculty FX only teaches MON P2/P5/P6, P2 is taken by FX's other class T-S2 and CE-3 has
  // T-S3 at P6. D (institute, later) needs CIVIL-LAB MON P2–P5: it moves T-S2 to P6, which
  // frees FX at P2, then T-S to P2. R must get its slot back before O (club) can take it.
  const session = (
    id: string,
    groups: string[],
    faculty_id: string,
    room_types: string[],
  ): Session => ({
    id,
    course_id: "CE301",
    kind: "lecture",
    groups,
    faculty_id,
    size: 40,
    duration: 1,
    room_types,
    needs_accessible: false,
    basket_slot: null,
    fixed_slot: null,
  });
  const request = (
    id: string,
    role: string,
    requested_category: string,
    submitted_at: string,
    extra: Partial<Dataset["booking_requests"][number]>,
  ): Dataset["booking_requests"][number] => ({
    id,
    submitted_at,
    requester: id,
    role,
    department: null,
    requested_category,
    title: id,
    attendance: 40,
    duration_periods: 1,
    windows: [{ day: "MON", from_period: 5, to_period: 5 }],
    room_types: ["seminar_hall"],
    needs: ["accessible"],
    requested_room: null,
    mandatory_for_groups: [],
    series_id: null,
    ...extra,
  });
  const allDay = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const data = datasetWith([], (ds) => {
    ds.sessions.push(
      session("T-S", ["CE-3"], "FX", ["lab_civil", "workshop"]),
      session("T-S2", ["EE-3"], "FX", ["lab_civil"]),
      session("T-S3", ["CE-3"], "FY", ["classroom"]),
    );
    const teacher = { ...ds.faculty[0], unavailable: [], preferences: [] };
    ds.faculty.push(
      {
        ...teacher,
        id: "FX",
        unavailable: [
          { day: "MON", periods: [1, 3, 4, 7, 8, 9] },
          ...(["TUE", "WED", "THU", "FRI"] as const).map((day) => ({
            day,
            periods: allDay.slice(0, 9),
          })),
        ],
      },
      { ...teacher, id: "FY" },
    );
    ds.room_unavailability.push(
      { room_id: "MECH-WS", day: "MON", periods: [5] },
      { room_id: "SH-1", day: "MON", periods: allDay.filter((p) => p !== 5) },
      ...(["TUE", "WED", "THU", "FRI"] as const).map((day) => ({
        room_id: "SH-1",
        day,
        periods: allDay,
      })),
    );
    ds.cancellations = [];
    ds.booking_requests = [
      request("R", "admin", "institute_event", "2027-01-01T09:00:00+05:30", {
        mandatory_for_groups: ["CE-3"],
      }),
      request("D", "admin", "institute_event", "2027-01-02T09:00:00+05:30", {
        windows: [{ day: "MON", from_period: 2, to_period: 5 }],
        duration_periods: 4,
        room_types: ["lab_civil"],
        needs: [],
      }),
      request("O", "club", "club_event", "2027-01-03T09:00:00+05:30", {}),
    ];
  });
  const base = [
    at("T-S", "MON", 5, "CIVIL-LAB"),
    at("T-S2", "MON", 2, "CIVIL-LAB"),
    at("T-S3", "MON", 6, "CR-205"),
  ];
  const result = run(data, base);

  it("gives R the slot D's displacement freed, so O cannot cause an inversion", () => {
    expectClean(result);
    expect(result.order).toEqual(["R", "D", "O"]);
    expect(slot(decisionOf(result, "R"))).toBe("SH-1 MON P5-P5");
    expect(decisionOf(result, "R").reason_code).toBe("APPROVED_AS_REQUESTED");
    expect(decisionOf(result, "D")).toMatchObject({
      status: "approved",
      reason_code: "APPROVED_WITH_DISPLACEMENT",
      room_id: "CIVIL-LAB",
      start_period: 2,
      end_period: 5,
    });
    expect(result.overrides).toEqual([
      { ...at("T-S2", "MON", 6, "CIVIL-LAB"), displaced_by: "D" },
      { ...at("T-S", "MON", 2, "MECH-WS"), displaced_by: "D" },
    ]);
    expect(decisionOf(result, "O")).toMatchObject({
      status: "rejected",
      reason_code: "REJ_OUTRANKED",
      reason:
        "SH-1 MON P5 (12:00–13:00) goes to R (institute event outranks club event), and no other slot fits.",
    });
  });
});

// --------------------------------------------------------------------------------- GUEST

describe("decideBookings: guest lectures never displace", () => {
  const data = datasetWith([...FRIENDLY_IDS, AUD_BLOCKER.id], (ds) => {
    ds.sessions.push(AUD_BLOCKER);
  });
  const base = [...FRIENDLY, at(AUD_BLOCKER.id, "WED", 6, "AUD")];
  const result = run(data, base);

  it("BR-03 gets no override, and an alternative outside its window", () => {
    expectClean(result);
    expect(result.overrides).toEqual([]);
    const x = decisionOf(result, "BR-03");
    expect(x.status).not.toBe("approved");
    expect(x).toMatchObject({
      status: "alternative_offered",
      room_id: "AUD",
      day: "WED",
      start_period: 4,
      end_period: 5,
    });
    expect(x.reason).toBe(
      "AUD WED P6–P9 (14:00–18:00) goes to GX-AUD-WED (regular session outranks guest lecture; only institute events can move classes). Offered AUD WED P4–P5 (11:00–13:00) instead (outside your window).",
    );
    expect(result.week).toEqual(base);
  });
});

// -------------------------------------------------------------------------------- BASKET

describe("decideBookings: basket sessions never move", () => {
  const base = replace(
    FRIENDLY,
    at("OE301-L1", "FRI", 4, "AUD"),
    at("OE302-L1", "FRI", 4, "LH-5"),
    at("OE303-L1", "FRI", 4, "CR-101"),
  );
  const result = run(datasetWith(FRIENDLY_IDS), base);

  it("leaves the basket in place and does not approve BR-20 in its window", () => {
    expectClean(result);
    expect(
      result.overrides.filter((o) => o.session_id.startsWith("OE")),
    ).toEqual([]);
    expect(result.overrides).toEqual([]);
    const x = decisionOf(result, "BR-20");
    expect(x.status).not.toBe("approved");
    expect(x.reason).toContain("elective basket OEB-1, which never moves");
    expect(result.week).toEqual(base);
  });
});

// ------------------------------------------------------------------------ other branches

describe("decideBookings: rejection reasons", () => {
  it("REJ_INVALID_TIME when the window is past P13 and nothing else is free", () => {
    const data = datasetWith(FRIENDLY_IDS, (ds) => {
      ds.room_unavailability.push(
        ...(["MON", "TUE", "WED", "THU", "FRI"] as const).map((day) => ({
          room_id: "OAT",
          day,
          periods: Array.from({ length: 13 }, (_, i) => i + 1),
        })),
      );
    });
    const r = run(data, FRIENDLY);
    expectClean(r);
    const x = decisionOf(r, "BR-17");
    expect(x).toMatchObject({
      status: "rejected",
      reason_code: "REJ_INVALID_TIME",
    });
    expect(x.reason).toBe(
      "WED P13–P14 is outside 08:00–22:00; events end at 22:00 (P13), and no alternative is free.",
    );
  });

  it("REJ_OUTRANKED names the earlier request holding the room", () => {
    // AUD is closed all week (bar ID101-ALL-L1's own WED P3) and SH-1 only opens for
    // THU P10–P11, which BR-06 takes first.
    const allDay = Array.from({ length: 13 }, (_, i) => i + 1);
    const data = datasetWith(FRIENDLY_IDS, (ds) => {
      for (const day of ["MON", "TUE", "WED", "THU", "FRI"] as const) {
        ds.room_unavailability.push({
          room_id: "AUD",
          day,
          periods: day === "WED" ? allDay.filter((p) => p !== 3) : allDay,
        });
        ds.room_unavailability.push({
          room_id: "SH-1",
          day,
          periods:
            day === "THU" ? allDay.filter((p) => p < 10 || p > 11) : allDay,
        });
      }
    });
    const r = run(data, FRIENDLY);
    expect(r.violations).toEqual([]);
    expect(r.stats.priority_inversions).toEqual([]);
    expect(slot(decisionOf(r, "BR-06"))).toBe("SH-1 THU P10-P11");
    const x = decisionOf(r, "BR-07");
    expect(x).toMatchObject({
      status: "rejected",
      reason_code: "REJ_OUTRANKED",
    });
    expect(x.reason).toBe(
      "SH-1 THU P10–P11 (18:00–20:00) goes to BR-06 (club event, submitted earlier), and no other slot fits.",
    );
  });

  it("REJ_NO_ROOM_WITH_NEEDS when no room of the type has the needs", () => {
    const data = datasetWith(FRIENDLY_IDS, (ds) => {
      ds.rooms.find((room) => room.id === "SH-1")!.accessible = false;
    });
    const x = decisionOf(run(data, FRIENDLY), "BR-10");
    expect(x).toMatchObject({
      status: "rejected",
      reason_code: "REJ_NO_ROOM_WITH_NEEDS",
      reason: "No seminar hall room has wheelchair access for 80 people.",
    });
  });
});

describe("decideBookings: preview priority rules", () => {
  it("orders by the given rules; the self-check still uses the dataset's", () => {
    const data = datasetWith(FRIENDLY_IDS);
    const priority: PriorityRules = {
      priority_order: [
        "exam",
        "regular_session",
        "club_event",
        "institute_event",
        "guest_lecture",
        "department_event",
      ],
      role_category_cap: data.role_category_cap,
    };
    const r = run(data, FRIENDLY, { priority });
    expect(r.order[0]).toBe("BR-02");
    expect(slot(decisionOf(r, "BR-05e"))).toBe("OAT FRI P11-P12");
    expect(decisionOf(r, "BR-16").status).not.toBe("approved");
    // Under the dataset's rules BR-16 outranks BR-05e, so the validator reports an inversion
    // only if BR-16 was rejected; an alternative never counts.
    expect(r.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------- suggestRoom

describe("suggestRoom", () => {
  const instance = buildInstance(publicDataset());

  it.each([
    ["LHC-5", "LH-5"],
    ["aud", "AUD"],
    ["Seminar Hall 1", "SH-1"],
    ["Main Auditorium", "AUD"],
    ["sh 2", "SH-2"],
    ["CR-1O1", "CR-101"],
    ["OAT", "OAT"],
  ])("%s → %s", (text, id) => {
    expect(suggestRoom(instance, text)).toBe(id);
  });

  it.each(["", "  --  ", "A", "Stadium", "XYZ-99"])(
    "%j matches nothing",
    (text) => {
      expect(suggestRoom(instance, text)).toBeNull();
    },
  );

  it("breaks distance ties by dataset order", () => {
    expect(suggestRoom(instance, "LH-7")).toBe("LH-1");
  });
});

// ------------------------------------------------------------------------- full dataset

/** A greedy, clash-free week for every session (no fest awareness, so AUD often clashes). */
function greedyWeek(data: Dataset, rotate: number): Assignment[] {
  const instance = buildInstance(data);
  const { days, lab_start_periods: labStarts } = data.calendar;
  const lunch = data.calendar.lunch.after_period;
  const rooms = [...data.rooms].sort(
    (a, b) => a.capacity - b.capacity || (a.id < b.id ? -1 : 1),
  );
  const used = new Set<string>();
  const unit = new Map<string, string>();
  const hours = new Map<string, number>();
  const basket = new Map<string, [Assignment["day"], number]>();
  const order = [...data.sessions].sort(
    (a, b) =>
      Number(b.kind === "lab") - Number(a.kind === "lab") ||
      b.size - a.size ||
      (a.id < b.id ? -1 : 1),
  );
  const out = new Map<string, Assignment>();
  order.forEach((s, i) => {
    const own = s.basket_slot || s.id;
    const cands: [Assignment["day"], number][] =
      s.basket_slot && basket.has(s.basket_slot)
        ? [basket.get(s.basket_slot)!]
        : days
            .map((_, k) => days[(k + i + rotate) % days.length])
            .flatMap((day) =>
              [1, 2, 3, 4, 5, 6, 7, 8, 9].map(
                (p): [Assignment["day"], number] => [day, p],
              ),
            );
    for (const [day, start] of cands) {
      const per = Array.from({ length: s.duration }, (_, k) => start + k);
      const last = per[per.length - 1];
      if (last > 9 || (per[0] <= lunch && lunch < last)) continue;
      if (s.kind === "lab" && !labStarts.includes(start)) continue;
      const f = s.faculty_id;
      const max = instance.faculty.get(f)?.max_hours_per_day ?? 4;
      if ((hours.get(`${f}|${day}`) ?? 0) + s.duration > max) continue;
      const free = per.every(
        (p) =>
          !isFacultyUnavailable(instance, f, day, p) &&
          !used.has(`f|${f}|${day}|${p}`) &&
          s.groups.every((g) => {
            const x = unit.get(`${g}|${day}|${p}`);
            return x === undefined || x === own;
          }),
      );
      if (!free) continue;
      const room = rooms.find(
        (r) =>
          s.room_types.includes(r.type) &&
          r.capacity >= s.size &&
          (!s.needs_accessible || r.accessible) &&
          per.every(
            (p) =>
              !isRoomUnavailable(instance, r.id, day, p) &&
              !used.has(`r|${r.id}|${day}|${p}`),
          ),
      );
      if (!room) continue;
      for (const p of per) {
        used.add(`r|${room.id}|${day}|${p}`);
        used.add(`f|${f}|${day}|${p}`);
        for (const g of s.groups) unit.set(`${g}|${day}|${p}`, own);
      }
      hours.set(`${f}|${day}`, (hours.get(`${f}|${day}`) ?? 0) + s.duration);
      if (s.basket_slot) basket.set(s.basket_slot, [day, start]);
      out.set(s.id, at(s.id, day, start, room.id));
      return;
    }
  });
  return data.sessions.flatMap((s) => out.get(s.id) ?? []);
}

/** Pushes movable sessions into requested venues at requested times, keeping the week valid. */
function hostileWeek(
  data: Dataset,
  week: readonly Assignment[],
  seed: number,
): Assignment[] {
  const instance = buildInstance(data);
  const rng = mulberry32(seed);
  const targets: [Assignment["day"], number, string][] = [
    ["MON", 4, "AUD"],
    ["MON", 5, "AUD"],
    ["FRI", 4, "AUD"],
    ["FRI", 5, "AUD"],
    ["WED", 6, "AUD"],
    ["WED", 8, "AUD"],
    ["TUE", 9, "LH-1"],
    ["THU", 8, "CR-105"],
    ["MON", 9, "CR-105"],
  ];
  let current = [...week];
  for (const [day, start, roomId] of targets) {
    if (rng() < 0.3) continue;
    const room = instance.rooms.get(roomId)!;
    const movable = data.sessions.filter(
      (s) =>
        !s.basket_slot &&
        !s.fixed_slot &&
        s.room_types.includes(room.type) &&
        s.size <= room.capacity,
    );
    for (const s of shuffle(rng, movable).slice(0, 40)) {
      const next = replace(current, at(s.id, day, start, roomId));
      if (checkTimetable(instance, next).violations.length === 0) {
        current = next;
        break;
      }
    }
  }
  return current;
}

describe("decideBookings: full dataset", () => {
  const data = publicDataset();
  const instance = buildInstance(data);

  it("scores 67 on a clean greedy week, deterministically", () => {
    const week = greedyWeek(data, 0);
    expect(week).toHaveLength(data.sessions.length);
    expect(checkTimetable(instance, week).violations).toEqual([]);
    const result = decideBookings(instance, week);
    expectClean(result);
    expect(result.stats.booking_score).toBe(67);
    expect(decideBookings(instance, week)).toEqual(result);
  });

  it("displaces a session that sits in AUD at BR-01's time", () => {
    const week = greedyWeek(data, 0);
    // The first movable session that can legally sit in AUD MON P4.
    const intruder = data.sessions
      .filter(
        (s) =>
          !s.basket_slot &&
          !s.fixed_slot &&
          s.room_types.includes("auditorium"),
      )
      .map((s) => replace(week, at(s.id, "MON", 4, "AUD")))
      .find((w) => checkTimetable(instance, w).violations.length === 0);
    expect(intruder).toBeDefined();
    const result = decideBookings(instance, intruder!);
    expectClean(result);
    const x = decisionOf(result, "BR-01");
    expect(x.reason_code).toBe("APPROVED_WITH_DISPLACEMENT");
    expect(result.overrides.length).toBeGreaterThan(0);
    for (const o of result.overrides) expect(o.displaced_by).toBe("BR-01");
    expect(
      checkTimetable(instance, result.week, "fest_week").violations,
    ).toEqual([]);
  });

  it("keeps the self-check clean on hostile weeks", () => {
    for (let rotate = 0; rotate < 5; rotate++) {
      const week = greedyWeek(data, rotate);
      for (const seed of [1, 2, 3]) {
        const hostile = hostileWeek(data, week, rotate * 100 + seed);
        expect(checkTimetable(instance, hostile).violations).toEqual([]);
        for (const options of [{}, { allowDisplacement: false }]) {
          const result = decideBookings(instance, hostile, options);
          expectClean(result);
          expect(result.decisions).toHaveLength(instance.requests.size);
          const approved = new Set(
            result.decisions
              .filter((d) => d.reason_code === "APPROVED_WITH_DISPLACEMENT")
              .map((d) => d.request_id),
          );
          for (const o of result.overrides) {
            expect(approved.has(o.displaced_by)).toBe(true);
          }
          expect(
            checkTimetable(instance, result.week, "fest_week").violations,
          ).toEqual([]);
        }
      }
    }
  });
});

describe("cancellation text", () => {
  it("formats real dates and leaves out ones that don't exist", () => {
    expect(formatDate("2027-02-03T10:00:00+05:30")).toBe("3 Feb 2027");
    expect(formatDate("2027-02-30")).toBeNull();
    expect(formatDate("2027-13-01")).toBeNull();
    expect(formatDate("garbage-date")).toBeNull();
    expect(cancelledReason("Robotics Club", "2027-02-30", "Moved.")).toBe(
      "Cancelled by Robotics Club: Moved.",
    );
    expect(cancelledReason("", "garbage-date", "")).toBe("Cancelled.");
  });
});
