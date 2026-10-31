import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AuditLogEntrySchema,
  BookingDraftSchema,
  BookingRequestRecordSchema,
  ChangeDecisionRequestSchema,
  ChangeProposalRequestSchema,
  ChangeRequestSchema,
  ExamScheduleSchema,
  LoginRequestSchema,
  RoomAvailabilityQuerySchema,
  RoomAvailabilitySchema,
  SessionUserSchema,
  SettingsPatchSchema,
  SettingsSchema,
  StoredBookingDecisionSchema,
  TimetableCheckRequestSchema,
  TimetableCheckResultSchema,
  TimetableVersionSchema,
  TimetableViewQuerySchema,
  TimetableViewSchema,
  UserSchema,
  type ChangeRequest,
  type TimetableVersion,
} from "./index";
import { getBundledDataset } from "../dataset";

const AT = "2027-02-05T10:00:00+05:30";
const PENALTY = { S1: 0, S2: 4, S3: 0, S4: 0, S5: 6, S6: 2, total: 12 };

function accepts(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
}

function rejects(schema: z.ZodType, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false);
}

describe("user", () => {
  const user = {
    id: "u_coord_cse",
    email: "coord.cse@cit.demo",
    name: "CSE Coordinator",
    role: "department_coordinator",
    department: "CSE",
    faculty_id: null,
    club: null,
  };

  it("accepts a user and rejects one carrying a password hash", () => {
    accepts(UserSchema, user);
    rejects(UserSchema, { ...user, password_hash: "$2b$10$x" });
    rejects(UserSchema, { ...user, role: "dean" });
  });

  it("strips registered JWT claims from the session user", () => {
    const parsed = accepts(SessionUserSchema, { ...user, iat: 1, exp: 2 });
    expect(parsed).toEqual(user);
  });

  it("validates login requests", () => {
    accepts(LoginRequestSchema, { email: user.email, password: "demo1234" });
    rejects(LoginRequestSchema, { email: "not-an-email", password: "x" });
    rejects(LoginRequestSchema, { email: user.email, password: "" });
  });
});

describe("timetable", () => {
  const version: TimetableVersion = {
    id: "TT-0003",
    dataset_id: "cit-public-v1",
    status: "active",
    source: "reschedule",
    parent_version: "TT-0002",
    change_request_id: "CR-0001",
    assignments: [
      {
        session_id: "MA101-AB-L1",
        day: "MON",
        start_period: 2,
        room_id: "LH-1",
      },
    ],
    hard_violation_count: 0,
    soft_penalty: PENALTY,
    solver_meta: {
      seed: 42,
      ms: 3810,
      iterations: 120000,
      algorithm: "greedy+repair+SA",
    },
    created_by: "u_admin",
    created_at: AT,
  };

  it("accepts the documented version and rejects unknown keys or a bad status", () => {
    accepts(TimetableVersionSchema, version);
    accepts(TimetableVersionSchema, {
      ...version,
      solver_meta: null,
      parent_version: null,
    });
    rejects(TimetableVersionSchema, { ...version, _id: "TT-0003" });
    rejects(TimetableVersionSchema, { ...version, status: "archived" });
    rejects(TimetableVersionSchema, { ...version, created_at: "yesterday" });
  });

  it("parses view queries from search params", () => {
    expect(
      accepts(TimetableViewQuerySchema, { view: "group", id: "Y1-A" }),
    ).toEqual({
      view: "group",
      id: "Y1-A",
      week: "regular",
    });
    rejects(TimetableViewQuerySchema, { view: "building", id: "X" });
  });

  it("accepts a view with session and booking cells", () => {
    accepts(TimetableViewSchema, {
      view: "room",
      id: "AUD",
      week: "spectra",
      version_id: "TT-0003",
      cells: [
        {
          session_id: "ID101-ALL-L1",
          course_id: "ID101",
          kind: "lecture",
          groups: ["Y1-A"],
          faculty_id: "F40",
          room_id: "AUD",
          day: "WED",
          start_period: 4,
          duration: 1,
          basket_slot: null,
          size: 360,
          override: { displaced_by: "BR-01" },
        },
      ],
      bookings: [
        {
          request_id: "BR-01",
          title: "Spectra '27 Inauguration",
          room_id: "AUD",
          day: "MON",
          start_period: 4,
          end_period: 5,
          status: "approved",
          effective_category: "institute_event",
        },
      ],
    });
    rejects(TimetableViewSchema, {
      view: "room",
      id: "AUD",
      week: "spectra",
      version_id: null,
      cells: [{ session_id: "X" }],
      bookings: [],
    });
  });

  it("coerces room availability query params", () => {
    const query = accepts(RoomAvailabilityQuerySchema, {
      day: "THU",
      from_period: "10",
      to_period: "12",
      min_capacity: "130",
      needs: "stage, pa_system",
      accessible: "true",
    });
    expect(query).toEqual({
      day: "THU",
      from_period: 10,
      to_period: 12,
      min_capacity: 130,
      needs: ["stage", "pa_system"],
      accessible: true,
      use: "event",
    });
    expect(
      RoomAvailabilityQuerySchema.parse({
        day: "MON",
        from_period: "1",
        to_period: "2",
        use: "lab",
      }).use,
    ).toBe("lab");
    rejects(RoomAvailabilityQuerySchema, {
      day: "MON",
      from_period: "1",
      to_period: "2",
      use: "party",
    });
    rejects(RoomAvailabilityQuerySchema, {
      day: "THU",
      from_period: "12",
      to_period: "10",
    });
    rejects(RoomAvailabilityQuerySchema, {
      day: "THU",
      from_period: "10",
      to_period: "14",
    });
  });

  it("accepts room availability and what-if check payloads", () => {
    accepts(RoomAvailabilitySchema, {
      room_id: "LH-4",
      free: false,
      busy_with: [{ kind: "unavailable", id: "LH-4", label: "Ceiling repair" }],
    });
    rejects(RoomAvailabilitySchema, {
      room_id: "LH-4",
      free: "no",
      busy_with: [],
    });

    accepts(TimetableCheckRequestSchema, { assignments: version.assignments });
    rejects(TimetableCheckRequestSchema, version.assignments);
    accepts(TimetableCheckResultSchema, {
      violations: [
        { rule: "H4", where: "timetable", detail: "LH-1 double-booked MON P2" },
      ],
      soft_penalty: PENALTY,
      soft_delta: -2,
    });
    accepts(TimetableCheckResultSchema, {
      violations: [],
      soft_penalty: PENALTY,
      soft_delta: null,
    });
    rejects(TimetableCheckResultSchema, {
      violations: [],
      soft_penalty: PENALTY,
    });
    rejects(TimetableCheckResultSchema, {
      violations: [],
      soft_penalty: { S1: 0 },
      soft_delta: 0,
    });
  });
});

describe("exam schedule", () => {
  it("accepts a stored exam schedule and rejects an empty room list", () => {
    const schedule = {
      id: "EXS-0001",
      status: "draft",
      exams: [
        {
          exam_id: "EX-MA101",
          day: "SAT",
          session: "AM",
          rooms: ["AUD", "LH-1"],
        },
      ],
      penalty: 5,
      solver_meta: { seed: 42, ms: 120, algorithm: "greedy" },
      dataset_id: "cit-public-v1",
      created_by: "engine",
      created_at: AT,
    };
    accepts(ExamScheduleSchema, schedule);
    accepts(ExamScheduleSchema, { ...schedule, solver_meta: null });
    rejects(ExamScheduleSchema, { ...schedule, dataset_id: undefined });
    rejects(ExamScheduleSchema, {
      ...schedule,
      exams: [{ exam_id: "EX-MA101", day: "SAT", session: "AM", rooms: [] }],
    });
  });
});

describe("booking", () => {
  const decision = {
    request_id: "BR-07",
    status: "approved",
    day: "THU",
    start_period: 10,
    end_period: 12,
    room_id: "AUD",
    reason:
      "SH-1 is held by Quiz Club. AUD has stage + PA and is free inside your window.",
    reason_code: "ROOM_SWAPPED_IN_WINDOW",
    effective_category: "club_event",
    category_capped: false,
    requires_admin_approval: false,
    auto: true,
    decided_by: "engine",
    approved_by: null,
    timetable_version: "TT-0003",
    decided_at: AT,
  };

  it("accepts a stored decision and keeps the export refinements", () => {
    accepts(StoredBookingDecisionSchema, decision);
    rejects(StoredBookingDecisionSchema, { ...decision, reason_code: "MAYBE" });
    rejects(StoredBookingDecisionSchema, { ...decision, extra: true });
    const { room_id: _room, ...withoutRoom } = decision;
    void _room;
    rejects(StoredBookingDecisionSchema, withoutRoom);
    rejects(StoredBookingDecisionSchema, {
      ...decision,
      status: "rejected",
      reason: "",
    });
  });

  it("accepts dataset requests as records", () => {
    const request = getBundledDataset().booking_requests[0]!;
    const record = accepts(BookingRequestRecordSchema, {
      ...request,
      state: "decided",
      source: "dataset",
      created_by: null,
    });
    expect(record).toMatchObject({ id: "BR-01", state: "decided" });
    rejects(BookingRequestRecordSchema, {
      ...request,
      state: "approved",
      source: "dataset",
      created_by: null,
    });
  });

  it("validates drafts", () => {
    const draft = {
      title: "Quiz finals",
      attendance: 150,
      duration_periods: 2,
      windows: [{ day: "THU", from_period: 10, to_period: 12 }],
      room_types: ["seminar_hall", "lecture_hall"],
      needs: ["projector"],
      requested_room: "SH-1",
      mandatory_for_groups: [],
      repeat_days: [],
      assumptions: ["Evening read as 18:00–21:00"],
      follow_up: null,
    };
    accepts(BookingDraftSchema, draft);
    rejects(BookingDraftSchema, {
      ...draft,
      windows: [{ day: "THU", from_period: 13, to_period: 14 }],
    });
    rejects(BookingDraftSchema, {
      ...draft,
      windows: [{ day: "THU", from_period: 12, to_period: 10 }],
    });
    rejects(BookingDraftSchema, { ...draft, needs: ["hologram"] });
    rejects(BookingDraftSchema, {
      ...draft,
      requested_category: "institute_event",
    });
  });
});

describe("change", () => {
  const request: ChangeRequest = {
    id: "CR-0001",
    kind: "disruption",
    requested_by: "u_coord_cse",
    changes: [
      {
        type: "faculty_unavailable",
        faculty_id: "F07",
        days: ["MON"],
        periods: [1, 2, 3],
      },
    ],
    base_version: "TT-0002",
    proposed_version: "TT-0003",
    status: "pending",
    diff: [
      {
        session_id: "CS203-L1",
        from: { day: "MON", start_period: 3, room_id: "CR-201" },
        to: { day: "TUE", start_period: 4, room_id: "CR-201" },
        reason: "F07 unavailable MON P1–P9",
      },
    ],
    moved_count: 1,
    time_changed: 1,
    room_only_changed: 0,
    soft_delta: -2,
    hard_violation_count: 0,
    conflicts: [],
    nl_prompt: null,
    approved_by: null,
    decided_at: null,
    comment: null,
    created_at: AT,
  };

  it("accepts the documented change request", () => {
    accepts(ChangeRequestSchema, request);
    accepts(ChangeRequestSchema, {
      ...request,
      status: "infeasible",
      proposed_version: null,
      diff: [],
      conflicts: [
        {
          session_id: "CS203-L1",
          blocking: [{ rule: "H7", count: 9, detail: "F07 unavailable" }],
          summary: "No slot keeps F07 free",
        },
      ],
    });
    rejects(ChangeRequestSchema, { ...request, status: "done" });
    rejects(ChangeRequestSchema, {
      ...request,
      changes: [{ type: "swap_rooms" }],
    });
  });

  it("validates proposal and decision bodies", () => {
    accepts(ChangeProposalRequestSchema, {
      kind: "manual_edit",
      changes: request.changes,
    });
    rejects(ChangeProposalRequestSchema, { kind: "manual_edit", changes: [] });
    rejects(ChangeProposalRequestSchema, {
      kind: "wish",
      changes: request.changes,
    });

    accepts(ChangeDecisionRequestSchema, {});
    accepts(ChangeDecisionRequestSchema, { comment: "Looks good" });
    rejects(ChangeDecisionRequestSchema, { comment: "ok", approve: true });
  });
});

describe("settings", () => {
  const settings = {
    team: "Kabootar",
    priority_order: getBundledDataset().priority_order,
    llm_enabled: true,
    reference_date: "2027-02-01",
    solver_seed: 42,
  };

  it("accepts full settings and rejects an incomplete priority order", () => {
    accepts(SettingsSchema, settings);
    rejects(SettingsSchema, {
      ...settings,
      priority_order: ["exam", "club_event"],
    });
    rejects(SettingsSchema, { ...settings, reference_date: "01/02/2027" });
    accepts(SettingsSchema, { ...settings, team: "x".repeat(100) });
    rejects(SettingsSchema, { ...settings, team: "x".repeat(101) });
    rejects(SettingsSchema, { ...settings, team: "" });
  });

  it("accepts a partial patch but not an empty or unknown one", () => {
    accepts(SettingsPatchSchema, { llm_enabled: false });
    rejects(SettingsPatchSchema, {});
    rejects(SettingsPatchSchema, { theme: "dark" });
  });
});

describe("audit", () => {
  it("accepts an entry with snapshots and rejects a missing timestamp", () => {
    const entry = {
      id: "AUD-0001",
      actor: "u_admin",
      action: "approve",
      entity: "change_requests",
      entity_id: "CR-0001",
      at: AT,
      before: { status: "pending" },
      after: { status: "applied" },
    };
    accepts(AuditLogEntrySchema, entry);
    const { at: _at, ...withoutAt } = entry;
    void _at;
    rejects(AuditLogEntrySchema, withoutAt);
  });
});
