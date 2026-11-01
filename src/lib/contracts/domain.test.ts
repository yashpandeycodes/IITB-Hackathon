import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AssistantIntentLLMSchema,
  AssistantReplySchema,
  AssistantRequestSchema,
  AuditLogEntrySchema,
  BookingDraftSchema,
  BookingRequestRecordSchema,
  ChangeApplyResultSchema,
  ChangeDecisionRequestSchema,
  ChangeListQuerySchema,
  ChangePreviewSchema,
  ChangeProposalRequestSchema,
  ChangeProposalSchema,
  ChangeRequestSchema,
  ChangeScopeSchema,
  ConflictEntrySchema,
  ExplainRequestSchema,
  ExplainResultSchema,
  ManualPlacementRequestSchema,
  MoveDiffSchema,
  PathIssueSchema,
  RescheduleMetaSchema,
  SessionFactsSchema,
  changeRequestBoundsIssues,
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
  type ChangeProposalRequest,
  type ChangeRequest,
  type ManualPlacementRequest,
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
          override: { displaced_by: "BR-01", pending_approval: false },
        },
      ],
      bookings: [
        {
          request_id: "BR-01",
          title: "Spectra '27 Inauguration",
          pending_approval: false,
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
      busy_with: [
        {
          kind: "unavailable",
          id: "LH-4",
          label: "Ceiling repair",
          pending_approval: false,
        },
      ],
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
  const scope = {
    session_ids: ["CS203-L1"],
    faculty_ids: ["F07"],
    group_ids: ["CSE-2"],
    room_ids: ["CR-201"],
    departments: ["CSE"],
  };
  const engine = {
    broken: 1,
    evictions: 0,
    depth: 0,
    nodes: 42,
    ms: 12,
    stopped_by: "complete",
    algorithm: "minimal-move repair (room, time, ejection chains ≤ 3)",
  } as const;
  const request: ChangeRequest = {
    id: "CR-0001",
    kind: "disruption",
    requested_by: "u_coord_cse",
    requested_by_role: "department_coordinator",
    changes: [
      {
        type: "faculty_unavailable",
        faculty_id: "F07",
        days: ["MON"],
        periods: [1, 2, 3],
      },
    ],
    placements: [],
    description: "Conference travel",
    nl_prompt: null,
    base_version: "TT-0002",
    proposed_version: "TT-0003",
    status: "pending",
    feasible: true,
    title: "F07 unavailable MON P1–P3",
    warnings: [],
    diff: [
      {
        session_id: "CS203-L1",
        from: { day: "MON", start_period: 3, room_id: "CR-201" },
        to: { day: "TUE", start_period: 4, room_id: "CR-201" },
        move: "time_only",
        cause: "broken",
        rules: ["H7"],
        displaced_by: null,
        reason: "F07 unavailable MON P1–P3",
      },
    ],
    moved_count: 1,
    time_changed: 1,
    room_only_changed: 0,
    soft_penalty: PENALTY,
    soft_delta: -2,
    hard_violation_count: 0,
    conflicts: [],
    scope,
    baseline_stability: null,
    engine,
    approved_by: null,
    decided_by: null,
    decided_at: null,
    comment: null,
    created_at: AT,
  };
  const conflict = {
    session_id: "CS203-L1",
    blocking: [{ rule: "H7", count: 9, detail: "F07 unavailable" }],
    contradictions: ["fixed_slot MON P3 vs F07 unavailable MON P1–P3"],
    summary: "No slot keeps F07 free",
  };

  it("accepts the documented change request", () => {
    accepts(ChangeRequestSchema, request);
    accepts(ChangeRequestSchema, {
      ...request,
      status: "infeasible",
      feasible: false,
      proposed_version: null,
      soft_penalty: null,
      soft_delta: 0,
      diff: [],
      conflicts: [conflict],
    });
    accepts(ChangeRequestSchema, {
      ...request,
      status: "applied",
      approved_by: "u_admin",
      decided_by: "u_admin",
      decided_at: AT,
      comment: "Approved after review",
    });
    accepts(ChangeRequestSchema, {
      ...request,
      kind: "manual_edit",
      changes: [],
      placements: [
        {
          session_id: "CS203-L1",
          day: "TUE",
          start_period: 4,
          room_id: "LH-1",
        },
      ],
      diff: [
        {
          ...request.diff[0],
          to: { day: "TUE", start_period: 4, room_id: "LH-1" },
          move: "time_and_room",
          cause: "requested",
          rules: [],
        },
      ],
    });
    rejects(ChangeRequestSchema, { ...request, status: "done" });
    rejects(ChangeRequestSchema, { ...request, requested_by_role: "dean" });
    rejects(ChangeRequestSchema, {
      ...request,
      changes: [{ type: "swap_rooms" }],
    });
    rejects(ChangeRequestSchema, { ...request, extra: true });
    const { scope: _scope, ...withoutScope } = request;
    void _scope;
    rejects(ChangeRequestSchema, withoutScope);
  });

  it("checks move diffs, conflicts and engine metadata", () => {
    const diff = request.diff[0];
    accepts(MoveDiffSchema, {
      ...diff,
      from: null,
      move: "added",
      cause: "added",
      rules: [],
    });
    accepts(MoveDiffSchema, {
      ...diff,
      to: null,
      move: "removed",
      cause: "removed",
      rules: [],
    });
    accepts(MoveDiffSchema, { ...diff, cause: "evicted", displaced_by: "X" });
    rejects(MoveDiffSchema, { ...diff, move: "teleported" });
    rejects(MoveDiffSchema, { ...diff, cause: "whim" });
    rejects(MoveDiffSchema, { ...diff, rules: ["hard-7"] });
    const { displaced_by: _d, ...noDisplaced } = diff;
    void _d;
    rejects(MoveDiffSchema, noDisplaced);

    accepts(ConflictEntrySchema, conflict);
    rejects(ConflictEntrySchema, { ...conflict, contradictions: undefined });
    rejects(ConflictEntrySchema, {
      ...conflict,
      blocking: [{ rule: "H7", count: -1, detail: "" }],
    });

    accepts(RescheduleMetaSchema, engine);
    accepts(RescheduleMetaSchema, { ...engine, stopped_by: "time" });
    rejects(RescheduleMetaSchema, { ...engine, stopped_by: "bored" });
    rejects(RescheduleMetaSchema, { ...engine, algorithm: "" });
    accepts(ChangeScopeSchema, scope);
    rejects(ChangeScopeSchema, { ...scope, departments: undefined });
  });

  it("validates proposal bodies, including the change-or-placement rule", () => {
    const parsed = accepts(ChangeProposalRequestSchema, {
      kind: "disruption",
      changes: request.changes,
      description: "  From the change file  ",
      dataset: "cit-public-v1",
    }) as ChangeProposalRequest;
    expect(parsed.placements).toEqual([]);
    expect(parsed.description).toBe("From the change file");

    const placement = {
      session_id: "CS203-L1",
      day: "TUE",
      start_period: 4,
      room_id: "LH-1",
    };
    expect(
      (
        accepts(ChangeProposalRequestSchema, {
          kind: "manual_edit",
          placements: [placement],
        }) as ChangeProposalRequest
      ).changes,
    ).toEqual([]);

    // At least one change or placement, reported on `changes`.
    const empty = ChangeProposalRequestSchema.safeParse({
      kind: "manual_edit",
      changes: [],
    });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues.map((i) => i.path.join("."))).toEqual([
      "changes",
    ]);
    rejects(ChangeProposalRequestSchema, { kind: "disruption" });

    // A starter-pack change file as it is: `kind` defaults to disruption, its `id` is accepted.
    const file = accepts(ChangeProposalRequestSchema, {
      id: "sample-disruption",
      dataset: "cit-public-v1",
      description: "Practice disruption",
      changes: request.changes,
    }) as ChangeProposalRequest;
    expect(file.kind).toBe("disruption");
    expect(
      accepts(ChangeProposalRequestSchema, { changes: request.changes }),
    ).toMatchObject({
      kind: "disruption",
    });

    rejects(ChangeProposalRequestSchema, {
      kind: "wish",
      changes: request.changes,
    });
    rejects(ChangeProposalRequestSchema, {
      kind: "manual_edit",
      placements: [{ ...placement, note: "strict" }],
    });
    rejects(ChangeProposalRequestSchema, {
      kind: "manual_edit",
      placements: [{ ...placement, day: "SAT" }],
    });
    rejects(ChangeProposalRequestSchema, {
      kind: "manual_edit",
      placements: Array.from({ length: 21 }, () => placement),
    });
    rejects(ChangeProposalRequestSchema, {
      kind: "disruption",
      changes: Array.from({ length: 201 }, () => request.changes[0]),
    });
    rejects(ChangeProposalRequestSchema, {
      kind: "disruption",
      changes: request.changes,
      description: "x".repeat(1001),
    });
    rejects(ChangeProposalRequestSchema, {
      kind: "disruption",
      changes: request.changes,
      approve: true,
    });
  });

  describe("request bounds inside changes and placements", () => {
    const placement = {
      session_id: "CS203-L1",
      day: "TUE",
      start_period: 4,
      room_id: "LH-1",
    };
    const unavailable = {
      type: "faculty_unavailable",
      faculty_id: "F07",
      days: ["MON"],
      periods: [1, 2, 3],
      reason: "Conference travel",
    };
    const newSession = {
      id: "CS202-T2",
      course_id: "CS202",
      kind: "tutorial",
      groups: ["CSE-2"],
      faculty_id: "F06",
      size: 80,
      duration: 1,
      room_types: ["classroom", "lecture_hall"],
      needs_accessible: false,
      basket_slot: null,
      fixed_slot: null,
    };
    const newFaculty = {
      id: "F99",
      name: "Dr. New",
      department: "CSE",
      max_hours_per_day: 4,
      needs_accessible: false,
      unavailable: [{ day: "MON", periods: [1, 2], reason: "Clinic" }],
      preferences: [
        { type: "avoid", days: ["FRI"], periods: [6, 7, 8, 9], note: "Rest" },
      ],
    };
    /** The issues of a body, as `[path, message]`. */
    const problems = (body: Record<string, unknown>) => {
      const result = ChangeProposalRequestSchema.safeParse({
        kind: "disruption",
        ...body,
      });
      expect(result.success).toBe(false);
      return (result.error?.issues ?? []).map(
        (i) => [i.path.join("."), i.message] as const,
      );
    };
    const paths = (body: Record<string, unknown>) =>
      problems(body).map(([path]) => path);

    it("accepts real change files, every change type at full size", () => {
      accepts(ChangeProposalRequestSchema, {
        kind: "disruption",
        changes: [
          {
            ...unavailable,
            days: ["MON", "TUE", "WED", "THU", "FRI"],
            periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            reason: "r".repeat(500),
          },
          {
            type: "room_unavailable",
            room_id: "CR-102",
            days: ["MON"],
            periods: [1],
          },
          { type: "add_faculty", faculty: newFaculty },
          {
            type: "add_session",
            session: { ...newSession, id: "x".repeat(64) },
          },
          { type: "remove_session", session_id: "HS201-H2-L2" },
        ],
        placements: [placement],
      });
    });

    it("rejects over-long ids, text, days and periods, at the field", () => {
      expect(
        problems({
          changes: [
            {
              ...unavailable,
              faculty_id: "F".repeat(65),
              reason: "r".repeat(501),
            },
            {
              type: "room_unavailable",
              room_id: "CR-102",
              days: ["MON", "M".repeat(11)],
              periods: Array.from({ length: 14 }, () => 1),
            },
            {
              type: "add_session",
              session: {
                ...newSession,
                id: "S".repeat(65),
                course_id: "C".repeat(65),
                faculty_id: "F".repeat(65),
                groups: ["CSE-2", "G".repeat(65)],
              },
            },
            {
              type: "add_faculty",
              faculty: { ...newFaculty, id: "F".repeat(65) },
            },
            { type: "remove_session", session_id: "S".repeat(65) },
          ],
          placements: [{ ...placement, room_id: "R".repeat(65) }],
        }),
      ).toEqual([
        [
          "changes.0.faculty_id",
          "changes[0].faculty_id: an id can be at most 64 characters.",
        ],
        [
          "changes.0.reason",
          "changes[0].reason: text can be at most 500 characters.",
        ],
        [
          "changes.1.days.1",
          "changes[1].days[1]: a day can be at most 10 characters.",
        ],
        [
          "changes.1.periods",
          "changes[1].periods: at most 13 entries (got 14).",
        ],
        ["changes.2.session.id", expect.stringContaining("an id")],
        ["changes.2.session.course_id", expect.stringContaining("an id")],
        ["changes.2.session.groups.1", expect.stringContaining("an id")],
        ["changes.2.session.faculty_id", expect.stringContaining("an id")],
        ["changes.3.faculty.id", expect.stringContaining("an id")],
        ["changes.4.session_id", expect.stringContaining("an id")],
        [
          "placements.0.room_id",
          "placements[0].room_id: an id can be at most 64 characters.",
        ],
      ]);
      expect(
        paths({ changes: [{ ...unavailable, days: Array(15).fill("MON") }] }),
      ).toEqual(["changes.0.days"]);
    });

    it("rejects long lists, wide objects and deep nesting", () => {
      const wide = Object.fromEntries(
        Array.from({ length: 41 }, (_, i) => [`k${i}`, i]),
      );
      const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
      expect(
        paths({
          changes: [
            {
              type: "add_session",
              session: {
                ...newSession,
                room_types: Array(65).fill("classroom"),
              },
            },
            { type: "remove_session", session_id: "X-1", extra: wide },
            { type: "remove_session", session_id: "X-1", extra: deep },
          ],
        }),
      ).toEqual([
        "changes.0.session.room_types",
        "changes.1.extra",
        "changes.2.extra.a.b.c.d.e",
      ]);
      // Six levels inside one change are fine.
      accepts(ChangeProposalRequestSchema, {
        kind: "disruption",
        changes: [
          {
            type: "remove_session",
            session_id: "X-1",
            extra: { a: { b: { c: { d: 1 } } } },
          },
        ],
      });
      expect(paths({ changes: Array(201).fill(unavailable) })).toEqual([
        "changes",
      ]);
      expect(
        paths({ changes: [], placements: Array(21).fill(placement) }),
      ).toEqual(["placements"]);
    });

    it("rejects operator, dotted, NUL and reserved field names", () => {
      const session = (extra: Record<string, unknown>) => ({
        type: "add_session",
        session: { ...newSession, ...extra },
      });
      expect(
        paths({
          changes: [
            session({ $where: "1" }),
            session({ "a.b": 1 }),
            session({ "nul\u0000": 1 }),
            session({ _id: "x", seq: 1, origin: "y" }),
            { ...unavailable, change_request_id: "CR-0001", removed_by: "u" },
            {
              type: "add_faculty",
              faculty: { ...newFaculty, created_at: "now", updated_at: "now" },
            },
            session({ ["k".repeat(65)]: 1 }),
          ],
        }),
      ).toEqual([
        "changes.0.session.$where",
        "changes.1.session.a.b",
        "changes.2.session.nul\u0000",
        "changes.3.session._id",
        "changes.3.session.seq",
        "changes.3.session.origin",
        "changes.4.change_request_id",
        "changes.4.removed_by",
        "changes.5.faculty.created_at",
        "changes.5.faculty.updated_at",
        `changes.6.session.${"k".repeat(65)}`,
      ]);
      const [[, message]] = problems({ changes: [session({ $where: "1" })] });
      expect(message).toBe(
        'changes[0].session["$where"]: field names can\'t start with "$" or contain "." or a NUL character.',
      );
    });

    it("lists at most 20 problems, then counts the rest", () => {
      const issues = problems({
        changes: Array.from({ length: 30 }, () => ({
          ...unavailable,
          faculty_id: "F".repeat(65),
        })),
      });
      expect(issues).toHaveLength(21);
      expect(issues[20]).toEqual(["", "… and 10 more problems like these."]);
    });

    it("gives the routes the same problems as PathIssues with written-out paths", () => {
      const body = {
        kind: "disruption",
        changes: [
          { ...unavailable, reason: "r".repeat(501) },
          {
            type: "add_session",
            session: { ...newSession, groups: ["CSE-2", "G".repeat(65)] },
          },
          {
            type: "add_session",
            session: { ...newSession, $where: "1" },
          },
        ],
      };
      const issues = changeRequestBoundsIssues(body);
      expect(issues).toEqual([
        {
          path: "changes[0].reason",
          message: "Text can be at most 500 characters.",
        },
        {
          path: "changes[1].session.groups[1]",
          message: "An id can be at most 64 characters.",
        },
        {
          path: 'changes[2].session["$where"]',
          message:
            'Field names can\'t start with "$" or contain "." or a NUL character.',
        },
      ]);
      for (const issue of issues) accepts(PathIssueSchema, issue);
      expect(changeRequestBoundsIssues({ changes: [unavailable] })).toEqual([]);
      const many = changeRequestBoundsIssues({
        changes: Array.from({ length: 22 }, () => ({
          ...unavailable,
          faculty_id: "F".repeat(65),
        })),
      });
      expect(many).toHaveLength(21);
      expect(many[20]).toEqual({
        path: "",
        message: "… and 2 more problems like these.",
      });
    });

    it("bounds placement ids of a manual placement too", () => {
      rejects(ManualPlacementRequestSchema, {
        ...placement,
        session_id: "S".repeat(65),
      });
      rejects(ManualPlacementRequestSchema, {
        ...placement,
        room_id: "R".repeat(65),
      });
      accepts(ManualPlacementRequestSchema, {
        ...placement,
        room_id: "R".repeat(64),
      });
    });
  });

  it("validates manual placements, previews, list queries and decisions", () => {
    const placement = {
      session_id: "CS203-L1",
      day: "TUE",
      start_period: 4,
      room_id: "LH-1",
    };
    expect(
      (
        accepts(
          ManualPlacementRequestSchema,
          placement,
        ) as ManualPlacementRequest
      ).repair,
    ).toBe(false);
    accepts(ManualPlacementRequestSchema, {
      ...placement,
      repair: true,
      description: "Swap for the lab",
    });
    rejects(ManualPlacementRequestSchema, { ...placement, start_period: 10 });
    rejects(ManualPlacementRequestSchema, { ...placement, repair: "yes" });
    rejects(ManualPlacementRequestSchema, { ...placement, force: true });
    rejects(ManualPlacementRequestSchema, { day: "TUE", start_period: 4 });

    const proposal = Object.fromEntries(
      Object.keys(ChangeProposalSchema.shape).map((key) => [
        key,
        request[key as keyof ChangeRequest],
      ]),
    );
    accepts(ChangeProposalSchema, proposal);
    accepts(ChangePreviewSchema, { ...proposal, base_version: "TT-0002" });
    // A preview needs an active timetable (409 without one), so it always names it.
    rejects(ChangePreviewSchema, { ...proposal, base_version: null });
    rejects(ChangePreviewSchema, proposal);
    rejects(ChangePreviewSchema, {
      ...proposal,
      base_version: "TT-0002",
      status: "pending",
    });

    expect(ChangeListQuerySchema.parse({})).toEqual({ scope: "all" });
    expect(
      ChangeListQuerySchema.parse({ scope: "mine", status: "applied" }),
    ).toEqual({ scope: "mine", status: "applied" });
    rejects(ChangeListQuerySchema, { scope: "everyone" });
    rejects(ChangeListQuerySchema, { status: "done" });
    // Only statuses a stored request can have.
    for (const status of ["pending", "infeasible", "applied", "rejected"])
      accepts(ChangeListQuerySchema, { status });
    rejects(ChangeListQuerySchema, { status: "proposing" });
    rejects(ChangeListQuerySchema, { status: "approved" });

    accepts(ChangeApplyResultSchema, {
      change: { ...request, status: "applied" },
      version_id: "TT-0003",
      superseded: ["CR-0002"],
    });
    rejects(ChangeApplyResultSchema, {
      change: request,
      version_id: "TT-0003",
    });

    accepts(ChangeDecisionRequestSchema, {});
    expect(
      ChangeDecisionRequestSchema.parse({ comment: "  Looks good " }),
    ).toEqual({ comment: "Looks good" });
    rejects(ChangeDecisionRequestSchema, { comment: "ok", approve: true });
    rejects(ChangeDecisionRequestSchema, { comment: "x".repeat(1001) });
  });
});

describe("explain", () => {
  const facts = {
    session_id: "CS202-L1",
    course_id: "CS202",
    course_name: "Data Structures",
    kind: "lecture",
    groups: ["CSE-2"],
    faculty_id: "F06",
    faculty_name: "Dr. Arjun Mehta",
    size: 80,
    duration: 1,
    fixed_slot: false,
    basket_slot: null,
    version_id: "TT-0001",
    placed: {
      day: "MON",
      start_period: 1,
      end_period: 1,
      room_id: "CR-201",
      time: "08:00–09:00",
    },
    room: {
      room_id: "CR-201",
      room_name: "Classroom 201",
      type: "classroom",
      capacity: 90,
      fill_percent: 89,
      suitable_rooms: 6,
      smaller_suitable_busy: [],
      note: "The smallest room that fits.",
    },
    soft_costs: [{ rule: "S4", points: 1, detail: "Early start" }],
    alternatives: {
      considered: 44,
      free: 3,
      better: 1,
      blocked: [{ rule: "H3", count: 30, detail: "CSE-2 already has a class" }],
      best: [
        { day: "TUE", start_period: 2, room_id: "CR-201", soft_delta: -1 },
      ],
    },
    summary: "CS202-L1 is at MON P1 because …",
  };

  it("accepts requests for each subject and rejects unknown ones", () => {
    for (const subject of ["session", "booking", "change"]) {
      accepts(ExplainRequestSchema, { subject, id: "X-1" });
    }
    rejects(ExplainRequestSchema, { subject: "room", id: "LH-1" });
    rejects(ExplainRequestSchema, { subject: "session", id: "" });
    rejects(ExplainRequestSchema, { subject: "session", id: "x".repeat(101) });
    rejects(ExplainRequestSchema, { subject: "session" });
    rejects(ExplainRequestSchema, { subject: "session", id: "A", lang: "hi" });
  });

  it("accepts session facts, with nothing placed before a timetable exists", () => {
    accepts(SessionFactsSchema, facts);
    accepts(SessionFactsSchema, {
      ...facts,
      version_id: null,
      placed: null,
      room: null,
      soft_costs: [],
    });
    rejects(SessionFactsSchema, {
      ...facts,
      alternatives: {
        ...facts.alternatives,
        best: Array.from({ length: 4 }, () => facts.alternatives.best[0]),
      },
    });
    rejects(SessionFactsSchema, { ...facts, kind: "seminar" });
    rejects(SessionFactsSchema, { ...facts, duration: 0 });
  });

  it("types a result's facts by its subject", () => {
    const result = {
      subject: "session",
      id: "CS202-L1",
      text: "Because CSE-2 is busy elsewhere.",
      source: "template",
      facts,
    };
    accepts(ExplainResultSchema, result);
    rejects(ExplainResultSchema, { ...result, source: "oracle" });
    rejects(ExplainResultSchema, { ...result, facts: ["not", "an", "object"] });
    rejects(ExplainResultSchema, { ...result, facts: {} });
    rejects(ExplainResultSchema, { ...result, subject: "room" });

    const changeFacts = {
      change_id: "CR-0001",
      status: "pending",
      title: "F07 unavailable MON",
      moved_count: 1,
      time_changed: 1,
      room_only_changed: 0,
      soft_delta: 2,
      diff: [],
      conflicts: [],
      summary: "CR-0001 (F07 unavailable MON): 1 session moves.",
    };
    accepts(ExplainResultSchema, {
      ...result,
      subject: "change",
      id: "CR-0001",
      facts: changeFacts,
    });
    // Session facts under another subject (or the other way round) don't pass.
    rejects(ExplainResultSchema, { ...result, subject: "change" });
    rejects(ExplainResultSchema, { ...result, facts: changeFacts });

    // A booking: the facts stored with its decision, or {} while it has none.
    const booking = { ...result, subject: "booking", id: "BR-07" };
    accepts(ExplainResultSchema, { ...booking, facts: {} });
    accepts(ExplainResultSchema, {
      ...booking,
      facts: {
        rejected_by: "the Admin",
        rejected_at: AT,
        comment: "Clashes with the convocation.",
      },
    });
    rejects(ExplainResultSchema, { ...booking, facts: { comment: "x" } });
    rejects(ExplainResultSchema, booking);
  });
});

describe("assistant", () => {
  const intent = {
    intent: "move_session",
    session: {
      course_id: "CS202",
      kind: "lecture",
      day: "FRI",
      start_period: 8,
      session_id: null,
    },
    target: { days: ["THU"], periods: [1, 2, 3, 4, 5], room_id: null },
    new_session: { course_id: null, kind: null },
    faculty_hint: null,
    reason: null,
  };
  const option = {
    option_id: "opt-1",
    label: "Move CS202-L2 to THU P2 in LH-3 (no other class moves)",
    proposal: {
      kind: "faculty_request",
      changes: [],
      placements: [
        {
          session_id: "CS202-L2",
          day: "THU",
          start_period: 2,
          room_id: "LH-3",
        },
      ],
    },
    moved_count: 1,
    time_changed: 1,
    room_only_changed: 0,
    soft_delta: 0,
    diff: [],
  };
  const reply = {
    intent: "move_session",
    intent_source: "rules",
    text: "Here is one option.",
    text_source: "template",
    verified: true,
    session: {
      session_id: "CS202-L2",
      course_id: "CS202",
      kind: "lecture",
      day: "FRI",
      start_period: 8,
      room_id: "LH-3",
    },
    candidates: [],
    options: [option],
    conflicts: [],
    follow_up: null,
    assumptions: ["'morning' read as P1–P5"],
    facts: null,
    log_id: "AI-1",
  };

  it("accepts an extracted intent with every field present", () => {
    accepts(AssistantIntentLLMSchema, intent);
    accepts(AssistantIntentLLMSchema, {
      ...intent,
      intent: "mark_unavailable",
      session: {
        course_id: null,
        kind: null,
        day: null,
        start_period: null,
        session_id: null,
      },
      target: { days: ["MON"], periods: [], room_id: null },
      faculty_hint: "F07",
      reason: "Conference",
    });
    rejects(AssistantIntentLLMSchema, { ...intent, intent: "book_room" });
    const { faculty_hint: _h, ...missing } = intent;
    void _h;
    rejects(AssistantIntentLLMSchema, missing);
    rejects(AssistantIntentLLMSchema, {
      ...intent,
      target: { ...intent.target, periods: [10] },
    });
    rejects(AssistantIntentLLMSchema, {
      ...intent,
      target: {
        ...intent.target,
        days: ["MON", "TUE", "WED", "THU", "FRI", "MON"],
      },
    });
    rejects(AssistantIntentLLMSchema, { ...intent, extra: 1 });
  });

  it("accepts requests with an optional session pick", () => {
    accepts(AssistantRequestSchema, { message: "Move my Friday lecture" });
    accepts(AssistantRequestSchema, {
      message: "this one",
      session_id: "CS202-L2",
    });
    rejects(AssistantRequestSchema, { message: "   " });
    rejects(AssistantRequestSchema, { message: "x".repeat(1001) });
    rejects(AssistantRequestSchema, { message: "hi", thread_id: "t1" });
  });

  it("accepts a verified reply whose options carry submit-ready proposals", () => {
    accepts(AssistantReplySchema, reply);
    accepts(AssistantReplySchema, {
      ...reply,
      verified: false,
      session: null,
      options: [],
      candidates: [reply.session],
      follow_up: "Which session do you mean?",
    });
    rejects(AssistantReplySchema, {
      ...reply,
      options: Array.from({ length: 6 }, () => option),
    });
    rejects(AssistantReplySchema, {
      ...reply,
      options: [{ ...option, proposal: { kind: "manual_edit", changes: [] } }],
    });
    rejects(AssistantReplySchema, { ...reply, intent_source: "magic" });
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
