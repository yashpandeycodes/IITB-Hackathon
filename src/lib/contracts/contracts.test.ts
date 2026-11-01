import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import scheduleExample from "../../../CrunchWeek_StarterPack/examples/schedule.example.json";
import citPublic from "../../../data/cit_public.json";
import sampleDisruption from "../../../data/sample_disruption.json";
import { getBundledDataset, parseDataset } from "../dataset";
import {
  AssignmentSchema,
  AssistantIntentLLMSchema,
  AssistantReplySchema,
  BookingDecisionSchema,
  BookingDraftSchema,
  ChangePreviewSchema,
  ChangeProposalRequestSchema,
  ChangeRequestSchema,
  ExplainResultSchema,
  ExportQuerySchema,
  DatasetSchema,
  DisruptionChangeSchema,
  DisruptionSchema,
  ExamWeekSessionSchema,
  FacultySchema,
  RoomSchema,
  ScheduleAfterExportSchema,
  ScheduleExportSchema,
  SessionFactsSchema,
  SessionSchema,
  SettingsSchema,
  SpectraDecisionViewSchema,
  SpectraOverrideViewSchema,
  SpectraPublicDecisionViewSchema,
  StoredBookingDecisionSchema,
  StoredSessionOverrideSchema,
  TimetableVersionSchema,
  ValidateQuerySchema,
  ValidatorReportSchema,
  effectiveCategory,
  isAvoidPreference,
  isCategoryCapped,
  type AvoidPreference,
  type Category,
  type Dataset,
  type Day,
  type Faculty,
  type FacultyPreference,
  type Room,
  type Session,
} from "./index";

/** Fresh mutable copy of the raw dataset JSON for negative cases. */
function rawDataset() {
  return structuredClone(citPublic);
}

function issuePaths(result: { success: boolean; error?: z.ZodError }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("dataset", () => {
  it("parses the bundled dataset with the documented counts", () => {
    const data = getBundledDataset();
    expect(data.dataset_id).toBe("cit-public-v1");
    expect(data.rooms).toHaveLength(27);
    expect(data.faculty).toHaveLength(40);
    expect(data.student_groups).toHaveLength(14);
    expect(data.courses).toHaveLength(62);
    expect(data.sessions).toHaveLength(189);
    expect(data.booking_requests).toHaveLength(25);
    expect(data.exams).toHaveLength(41);
    expect(data.cancellations).toHaveLength(1);
    expect(data.room_unavailability).toHaveLength(2);
  });

  it("memoises the bundled dataset and round-trips the source unchanged", () => {
    const data = getBundledDataset();
    expect(getBundledDataset()).toBe(data);
    expect(parseDataset(citPublic)).toEqual(citPublic);
  });

  it("reads calendar rules from the data", () => {
    const { calendar, priority_order, role_category_cap } = getBundledDataset();
    expect(calendar.lab_start_periods).toEqual([2, 6]);
    expect(calendar.lunch.after_period).toBe(5);
    expect(calendar.exam_week.sessions.map((s) => s.id)).toEqual(["AM", "PM"]);
    expect(priority_order[0]).toBe("exam");
    expect(role_category_cap.club).toBe("club_event");
  });

  it("accepts booking windows that run past P13 (BR-17)", () => {
    const br17 = getBundledDataset().booking_requests.find(
      (r) => r.id === "BR-17",
    );
    expect(br17?.windows[0]?.to_period).toBe(14);
  });

  it("rejects an invalid day with a field path", () => {
    const raw = rawDataset();
    (raw.room_unavailability[0] as { day: string }).day = "SUN";
    const result = DatasetSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("room_unavailability.0.day");
  });

  it("rejects duplicate ids", () => {
    const raw = rawDataset();
    raw.sessions[1]!.id = raw.sessions[0]!.id;
    const result = DatasetSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("sessions.1.id");
  });

  it("rejects dangling references with field paths", () => {
    const raw = rawDataset();
    raw.sessions[0]!.faculty_id = "F404";
    raw.sessions[1]!.groups = [raw.sessions[1]!.groups[0]!, "Y9-Z"];
    raw.sessions[2]!.course_id = "NOPE101";
    raw.exams[0]!.groups = ["Y9-Z"];
    raw.room_unavailability[0]!.room_id = "LH-404";
    raw.booking_requests[0]!.mandatory_for_groups = ["Y9-Z"];
    raw.cancellations[0]!.request_id = "BR-404";
    const result = DatasetSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(issuePaths(result).sort()).toEqual(
      [
        "sessions.0.faculty_id",
        "sessions.1.groups.1",
        "sessions.2.course_id",
        "exams.0.groups.0",
        "room_unavailability.0.room_id",
        "booking_requests.0.mandatory_for_groups.0",
        "cancellations.0.request_id",
      ].sort(),
    );
  });

  it("allows an unknown requested_room and skips course checks without courses", () => {
    const raw = rawDataset();
    raw.booking_requests[0]!.requested_room = "LHC-404";
    raw.sessions[0]!.course_id = "NOPE101";
    (raw as { courses: unknown[] }).courses = [];
    expect(DatasetSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects a priority_order that omits a role's cap", () => {
    const raw = rawDataset();
    raw.priority_order = raw.priority_order.filter(
      (c) => c !== "institute_event",
    );
    const result = DatasetSchema.safeParse(raw);
    expect(issuePaths(result)).toEqual(["role_category_cap.admin"]);
  });

  it("rejects an uncapped role when club_event is missing from priority_order", () => {
    const raw = rawDataset() as unknown as {
      priority_order: string[];
      booking_requests: { role: string }[];
    };
    raw.priority_order = raw.priority_order.filter((c) => c !== "club_event");
    // Keep every cap valid: only the role without a cap (falls back to club_event) is the problem.
    raw.booking_requests[0].role = "alien";
    const result = DatasetSchema.safeParse(raw);
    expect(issuePaths(result)).toContain("booking_requests.0.role");
  });

  it("rejects a priority_order that repeats a category", () => {
    const raw = rawDataset();
    raw.priority_order.push("exam");
    expect(DatasetSchema.safeParse(raw).success).toBe(false);
  });

  it("accepts and preserves unknown keys and new feature strings on a room", () => {
    const raw = rawDataset();
    Object.assign(raw.rooms[0]!, { floor: 2, wifi: { ssid: "CIT" } });
    raw.rooms[0]!.features.push("hologram");
    const room = parseDataset(raw).rooms[0]! as Room & Record<string, unknown>;
    expect(room.floor).toBe(2);
    expect(room.wifi).toEqual({ ssid: "CIT" });
    expect(room.features).toContain("hologram");

    const direct = RoomSchema.parse({ ...citPublic.rooms[0], floor: 2 });
    expect(direct).toMatchObject({ id: "AUD", floor: 2 });
  });

  it("applies the validator's defaults to sparse entries", () => {
    const faculty = FacultySchema.parse({
      id: "F99",
      name: "Dr. New",
      department: "CSE",
    });
    expect(faculty).toMatchObject({
      max_hours_per_day: 4,
      needs_accessible: false,
      unavailable: [],
      preferences: [],
    });

    const session = SessionSchema.parse({
      id: "X-L1",
      course_id: "X",
      kind: "lecture",
      groups: ["Y1-A"],
      faculty_id: "F99",
      size: 90,
      duration: 1,
      room_types: ["classroom"],
    });
    expect(session).toMatchObject({
      needs_accessible: false,
      basket_slot: null,
      fixed_slot: null,
    });
  });

  it("exposes documented fields only in the inferred types", () => {
    expectTypeOf<keyof Room>().toEqualTypeOf<
      | "id"
      | "name"
      | "building"
      | "type"
      | "capacity"
      | "features"
      | "accessible"
      | "allowed_uses"
    >();
    expectTypeOf<Faculty["max_hours_per_day"]>().toEqualTypeOf<number>();
    expectTypeOf<Dataset["role_category_cap"]>().toEqualTypeOf<
      Record<string, Category>
    >();
    expectTypeOf<AvoidPreference["days"]>().toEqualTypeOf<Day[] | undefined>();
    expectTypeOf<{
      type: "avoid";
      periods: number[];
    }>().toExtend<FacultyPreference>();
    expectTypeOf<Session["fixed_slot"]>().toEqualTypeOf<{
      day: Day;
      start_period: number;
    } | null>();
  });
});

describe("disruption", () => {
  it("parses the sample disruption", () => {
    const disruption = DisruptionSchema.parse(sampleDisruption);
    expect(disruption.dataset).toBe("cit-public-v1");
    expect(disruption.changes.map((c) => c.type)).toEqual([
      "faculty_unavailable",
      "room_unavailable",
      "add_session",
    ]);
  });

  it("parses every change type", () => {
    const changes = [
      {
        type: "add_faculty",
        faculty: { id: "F41", name: "Dr. New", department: "ME" },
      },
      { type: "remove_session", session_id: "HS201-H2-L2" },
    ];
    for (const change of changes) {
      expect(DisruptionChangeSchema.safeParse(change).success).toBe(true);
    }
  });

  it("rejects an unknown change type", () => {
    const result = DisruptionSchema.safeParse({
      changes: [{ type: "swap_rooms", from: "LH-1", to: "LH-2" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("schedule export", () => {
  it("parses the starter-pack example", () => {
    const schedule = ScheduleExportSchema.parse(scheduleExample);
    expect(schedule.sessions).toHaveLength(5);
    expect(schedule.fest_week.bookings.map((b) => b.status)).toEqual([
      "approved",
      "rejected",
      "alternative_offered",
    ]);
    expect(schedule.exams[0]?.rooms).toEqual(["AUD", "LH-1", "LH-2"]);
  });

  it("requires exams in schedule.json but not in schedule_after.json", () => {
    const withoutExams: Partial<typeof scheduleExample> =
      structuredClone(scheduleExample);
    delete withoutExams.exams;
    expect(ScheduleExportSchema.safeParse(withoutExams).success).toBe(false);
    expect(ScheduleAfterExportSchema.safeParse(withoutExams).success).toBe(
      true,
    );
  });

  it("allows schedule_after.json without fest_week", () => {
    const timetableOnly: Partial<typeof scheduleExample> =
      structuredClone(scheduleExample);
    delete timetableOnly.fest_week;
    delete timetableOnly.exams;
    expect(ScheduleAfterExportSchema.safeParse(timetableOnly).success).toBe(
      true,
    );
    expect(ScheduleExportSchema.safeParse(timetableOnly).success).toBe(false);
  });

  it("strips extra keys so the export is a projection", () => {
    const decision = BookingDecisionSchema.parse({
      request_id: "BR-09",
      status: "rejected",
      reason: "No venue seats 1,200",
      reason_code: "REJ_NO_CAPACITY",
    });
    expect(decision).not.toHaveProperty("reason_code");
  });

  it("rejects an assignment on an invalid day", () => {
    const result = AssignmentSchema.safeParse({
      session_id: "MA101-AB-L1",
      day: "SAT",
      start_period: 2,
      room_id: "LH-1",
    });
    expect(issuePaths(result)).toEqual(["day"]);
  });

  it("rejects a rejected decision with an empty reason", () => {
    const result = BookingDecisionSchema.safeParse({
      request_id: "BR-09",
      status: "rejected",
      reason: "   ",
    });
    expect(issuePaths(result)).toEqual(["reason"]);
  });

  it("rejects an approved decision missing its room", () => {
    const result = BookingDecisionSchema.safeParse({
      request_id: "BR-01",
      status: "approved",
      day: "MON",
      start_period: 4,
      end_period: 5,
      reason: "",
    });
    expect(issuePaths(result)).toEqual(["room_id"]);
  });

  it("rejects an alternative whose range runs backwards or lacks a reason", () => {
    const result = BookingDecisionSchema.safeParse({
      request_id: "BR-07",
      status: "alternative_offered",
      day: "THU",
      start_period: 12,
      end_period: 10,
      room_id: "AUD",
      reason: "",
    });
    expect(issuePaths(result).sort()).toEqual(["end_period", "reason"]);
  });
});

describe("validator report", () => {
  it("parses the shape produced by validator.py run()", () => {
    // Trimmed output of: validator.py --schedule schedule.example.json --disruption --baseline
    const report = {
      dataset_id: "cit-public-v1",
      schedule_dataset_id: "cit-public-v1",
      team: "Example team",
      soft_penalties: { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 },
      soft_total: 0,
      bookings: {
        booking_score: 6.0,
        booking_score_max_if_all_approved: 70,
        approved: 1,
        alternatives: 1,
        rejected: 1,
        session_overrides: 1,
        priority_inversions: [],
      },
      exam_soft_penalty: 0,
      stability: {
        sessions_moved: 0,
        time_changed: 0,
        room_only_changed: 0,
        moved_ids: [],
      },
      hard_violations: [
        {
          rule: "H1",
          where: "timetable",
          detail: "Session MA101-AB-L2 is not scheduled",
        },
        { rule: "E1", where: "exams", detail: "EX-PH101 not scheduled" },
      ],
      hard_violation_count: 225,
      hard_by_rule: { H1: 185, E1: 40 },
      warnings: ["No decision for BR-02"],
    };
    expect(ValidatorReportSchema.parse(report)).toEqual(report);
  });
});

describe("JSON Schema generation", () => {
  it("converts the main contracts for Mongo validators and structured LLM output", () => {
    for (const schema of [
      DatasetSchema,
      DisruptionSchema,
      ScheduleExportSchema,
      ValidatorReportSchema,
      BookingDraftSchema,
      ChangeRequestSchema,
      ChangePreviewSchema,
      AssistantIntentLLMSchema,
      AssistantReplySchema,
      SessionFactsSchema,
      ExplainResultSchema,
      StoredBookingDecisionSchema,
      TimetableVersionSchema,
      SettingsSchema,
    ]) {
      expect(() => z.toJSONSchema(schema)).not.toThrow();
    }
  });
});

describe("change files as proposals", () => {
  it("maps the sample disruption onto a change proposal request", () => {
    const file = DisruptionSchema.parse(sampleDisruption);
    const request = ChangeProposalRequestSchema.parse({
      kind: "disruption",
      changes: file.changes,
      description: file.description,
      dataset: file.dataset,
    });
    expect(request.changes).toEqual(file.changes);
    expect(request.placements).toEqual([]);
    expect(request.dataset).toBe("cit-public-v1");
  });
});

describe("export and validate queries", () => {
  it("defaults to schedule and accepts the Phase 5 files", () => {
    expect(ExportQuerySchema.parse({})).toEqual({ file: "schedule" });
    for (const file of ["schedule", "schedule_after", "disruption"]) {
      expect(ExportQuerySchema.parse({ file })).toEqual({ file });
    }
    expect(ExportQuerySchema.safeParse({ file: "exams" }).success).toBe(false);
    expect(
      ExportQuerySchema.safeParse({ file: ["schedule", "disruption"] }).success,
    ).toBe(false);
  });

  it("validates only the schedule files", () => {
    expect(ValidateQuerySchema.parse({})).toEqual({ file: "schedule" });
    expect(ValidateQuerySchema.parse({ file: "schedule_after" })).toEqual({
      file: "schedule_after",
    });
    expect(ValidateQuerySchema.safeParse({ file: "disruption" }).success).toBe(
      false,
    );
    // Unknown query parameters are stripped, like every query schema.
    expect(ValidateQuerySchema.parse({ file: "schedule", x: "1" })).toEqual({
      file: "schedule",
    });
  });
});

describe("validator tolerance (inputs validator.py accepts must load)", () => {
  it("keeps preference types other than avoid, and requires periods for avoid", () => {
    const faculty = FacultySchema.parse({
      id: "F41",
      preferences: [
        { type: "prefer", days: ["SAT"], slots: "mornings" },
        { note: "no type at all" },
        { type: "avoid", periods: [1] },
      ],
    });
    expect(faculty.preferences).toHaveLength(3);
    expect(faculty.preferences.filter(isAvoidPreference)).toEqual([
      { type: "avoid", periods: [1] },
    ]);
    expect(faculty).toMatchObject({ name: "", department: "" });

    const result = FacultySchema.safeParse({
      id: "F42",
      preferences: [{ type: "avoid", days: ["MON"] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts unknown roles, categories and room types on a booking request", () => {
    const raw = rawDataset();
    Object.assign(raw.booking_requests[0]!, {
      role: "alumni",
      requested_category: "mega_event",
      room_types: ["rooftop"],
      windows: [],
    });
    delete (raw.booking_requests[0] as { requester?: string }).requester;
    delete (raw.booking_requests[0] as { title?: string }).title;
    const request = parseDataset(raw).booking_requests[0]!;
    expect(request).toMatchObject({
      role: "alumni",
      requested_category: "mega_event",
      requester: "",
      title: "",
    });
  });

  it("accepts a role_category_cap that omits a role", () => {
    const raw = rawDataset();
    delete (raw.role_category_cap as Partial<typeof raw.role_category_cap>)
      .club;
    expect(DatasetSchema.safeParse(raw).success).toBe(true);
  });

  it("accepts loosened room, session, group and faculty fields", () => {
    const raw = rawDataset();
    raw.rooms[0]!.type = "rooftop";
    Object.assign(raw.sessions[0]!, { groups: [], room_types: ["rooftop"] });
    delete (raw.student_groups[0] as { needs_accessible?: boolean })
      .needs_accessible;
    raw.faculty[0]!.max_hours_per_day = 0;
    delete (raw as { courses?: unknown }).courses;

    const data = parseDataset(raw);
    expect(data.rooms[0]!.type).toBe("rooftop");
    expect(data.sessions[0]!.groups).toEqual([]);
    expect(data.student_groups[0]!.needs_accessible).toBe(false);
    expect(data.faculty[0]!.max_hours_per_day).toBe(0);
    expect(data.courses).toEqual([]);
  });

  it("accepts any day string and a missing changes list in a disruption", () => {
    const disruption = DisruptionSchema.parse({
      changes: [
        {
          type: "room_unavailable",
          room_id: "CR-102",
          days: ["SAT"],
          periods: [1, 2],
        },
      ],
    });
    expect(disruption.changes[0]).toMatchObject({ days: ["SAT"] });
    expect(DisruptionSchema.parse({ id: "empty" }).changes).toEqual([]);
  });

  it("keeps documented closed sets strict", () => {
    const session = { ...citPublic.sessions[0], kind: "seminar" };
    expect(SessionSchema.safeParse(session).success).toBe(false);

    const room = { ...citPublic.rooms[0], allowed_uses: ["party"] };
    expect(RoomSchema.safeParse(room).success).toBe(false);

    const examSession = { id: "EVE", start: "18:00", end: "20:00" };
    expect(ExamWeekSessionSchema.safeParse(examSession).success).toBe(false);
  });
});

describe("effectiveCategory", () => {
  it("matches validator.py for every dataset request", () => {
    // Output of validator.effective_category over cit_public.json.
    const expected: Record<string, string> = {
      "BR-01": "institute_event",
      "BR-02": "club_event",
      "BR-03": "guest_lecture",
      "BR-04": "club_event",
      "BR-05a": "club_event",
      "BR-05b": "club_event",
      "BR-05c": "club_event",
      "BR-05d": "club_event",
      "BR-05e": "club_event",
      "BR-06": "club_event",
      "BR-07": "club_event",
      "BR-08": "department_event",
      "BR-09": "club_event",
      "BR-10": "club_event",
      "BR-11a": "institute_event",
      "BR-11b": "institute_event",
      "BR-12": "club_event",
      "BR-13": "department_event",
      "BR-14": "club_event",
      "BR-15": "club_event",
      "BR-16": "institute_event",
      "BR-17": "club_event",
      "BR-18": "department_event",
      "BR-19": "guest_lecture",
      "BR-20": "institute_event",
    };
    const data = getBundledDataset();
    const actual = Object.fromEntries(
      data.booking_requests.map((r) => [r.id, effectiveCategory(data, r)]),
    );
    expect(actual).toEqual(expected);
  });

  it("caps unknown roles at club_event and ranks unknown categories lowest", () => {
    const data = getBundledDataset();
    expect(
      effectiveCategory(data, {
        role: "alumni",
        requested_category: "institute_event",
      }),
    ).toBe("club_event");
    expect(
      effectiveCategory(data, {
        role: "toString",
        requested_category: "institute_event",
      }),
    ).toBe("club_event");
    expect(
      effectiveCategory(data, {
        role: "admin",
        requested_category: "mega_event",
      }),
    ).toBe("club_event");
  });
});

describe("Spectra view schemas", () => {
  it("list exactly the stored fields (approver ids optional in the view, absent in public)", () => {
    const stored = Object.keys(StoredBookingDecisionSchema.shape).sort();
    expect(Object.keys(SpectraDecisionViewSchema.shape).sort()).toEqual(stored);
    expect(Object.keys(SpectraPublicDecisionViewSchema.shape).sort()).toEqual(
      stored.filter((k) => k !== "decided_by" && k !== "approved_by"),
    );
    expect(Object.keys(SpectraOverrideViewSchema.shape).sort()).toEqual(
      Object.keys(StoredSessionOverrideSchema.shape).sort(),
    );
  });
});

describe("isCategoryCapped", () => {
  const rules = {
    priority_order: [
      "exam",
      "regular_session",
      "institute_event",
      "guest_lecture",
      "department_event",
      "club_event",
    ] as Category[],
    role_category_cap: {
      club: "club_event",
      admin: "institute_event",
    } as Record<string, Category>,
  };
  it("is true only when a known claim was lowered by the cap", () => {
    expect(
      isCategoryCapped(rules, {
        role: "club",
        requested_category: "guest_lecture",
      }),
    ).toBe(true);
    expect(
      isCategoryCapped(rules, {
        role: "club",
        requested_category: "club_event",
      }),
    ).toBe(false);
    expect(
      isCategoryCapped(rules, {
        role: "admin",
        requested_category: "institute_event",
      }),
    ).toBe(false);
    // An unknown claim ranks lowest; it isn't "capped".
    expect(
      isCategoryCapped(rules, { role: "club", requested_category: "bogus" }),
    ).toBe(false);
  });
});
