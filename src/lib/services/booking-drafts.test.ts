/**
 * Draft checks and request building shared by `POST /api/bookings` and the parse preview: pure,
 * against the bundled dataset.
 */
import { describe, expect, it } from "vitest";
import type { CreateBookingRequest, SessionUser } from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import {
  buildRequests,
  draftProblems,
  draftRequests,
  requesterLabel,
  submissionTime,
  type DraftFields,
} from "./booking-drafts";

const dataset = getBundledDataset();

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: "u_test",
  email: "test@test.local",
  name: "Asha Rao",
  role: "faculty",
  department: "CSE",
  faculty_id: null,
  club: null,
  ...overrides,
});

const fields = (overrides: Partial<DraftFields> = {}): DraftFields => ({
  duration_periods: 2,
  windows: [{ day: "TUE", from_period: 10, to_period: 11 }],
  requested_room: null,
  mandatory_for_groups: [],
  repeat_days: [],
  ...overrides,
});

const body = (
  overrides: Partial<CreateBookingRequest> = {},
): CreateBookingRequest => ({
  title: "Improv night",
  attendance: 80,
  duration_periods: 2,
  windows: [{ day: "TUE", from_period: 10, to_period: 11 }],
  room_types: ["seminar_hall"],
  needs: ["projector"],
  requested_room: null,
  mandatory_for_groups: [],
  repeat_days: [],
  assumptions: [],
  follow_up: null,
  source: "form",
  ai_log_id: null,
  ...overrides,
});

describe("draftProblems", () => {
  it("accepts a valid draft", () => {
    expect(draftProblems(dataset, user(), fields())).toEqual({
      problems: [],
      suggestion: {},
    });
  });

  it("names an unknown room and suggests the closest one", () => {
    expect(
      draftProblems(dataset, user(), fields({ requested_room: "SH1" })),
    ).toEqual({
      problems: [
        {
          field: "requested_room",
          message: 'No room has the id "SH1". Did you mean SH-1?',
        },
      ],
      suggestion: { requested_room: "SH-1" },
    });
  });

  it("reports days off the calendar on the field that has them", () => {
    const offWindow = fields({
      windows: [{ day: "SAT" as "MON", from_period: 1, to_period: 2 }],
    });
    expect(draftProblems(dataset, user(), offWindow).problems).toEqual([
      {
        field: "windows",
        message: "SAT is not on the calendar (MON, TUE, WED, THU, FRI).",
      },
    ]);
    const offRepeat = fields({ repeat_days: ["SUN" as "MON", "SAT" as "MON"] });
    expect(draftProblems(dataset, user(), offRepeat).problems).toEqual([
      {
        field: "repeat_days",
        message: "SUN, SAT are not on the calendar (MON, TUE, WED, THU, FRI).",
      },
    ]);
  });

  it("reports a duration longer than every window, and skips it when unknown", () => {
    expect(
      draftProblems(dataset, user(), fields({ duration_periods: 3 })).problems,
    ).toEqual([
      {
        field: "duration_periods",
        message:
          "A 3-period booking doesn't fit in any window (the longest is 2 periods).",
      },
    ]);
    expect(
      draftProblems(
        dataset,
        user(),
        fields({
          duration_periods: 2,
          windows: [{ day: "MON", from_period: 3, to_period: 3 }],
        }),
      ).problems[0].message,
    ).toBe(
      "A 2-period booking doesn't fit in any window (the longest is 1 period).",
    );
    // A parsed draft may have no duration or no windows yet.
    expect(
      draftProblems(dataset, user(), fields({ duration_periods: null }))
        .problems,
    ).toEqual([]);
    expect(
      draftProblems(dataset, user(), fields({ windows: [] })).problems,
    ).toEqual([]);
  });

  describe("compulsory groups", () => {
    const groups = (who: SessionUser, ids: string[]) =>
      draftProblems(dataset, who, fields({ mandatory_for_groups: ids }))
        .problems;

    it("lets an admin name any group", () => {
      expect(groups(user({ role: "admin" }), ["CSE-3", "ME-2"])).toEqual([]);
    });

    it("lets faculty and coordinators name only their own department's groups", () => {
      expect(groups(user(), ["CSE-3", "CSE-2"])).toEqual([]);
      expect(groups(user(), ["CSE-3", "ECE-3", "ME-2"])).toEqual([
        {
          field: "mandatory_for_groups",
          message:
            "A Faculty can only make an event compulsory for CSE groups (not ECE-3, ME-2).",
        },
      ]);
      const coordinator = user({
        role: "department_coordinator",
        department: "ECE",
      });
      expect(groups(coordinator, ["ECE-2"])).toEqual([]);
      expect(groups(coordinator, ["Y1-A"])[0].message).toBe(
        "A Department Coordinator can only make an event compulsory for ECE groups (not Y1-A).",
      );
      expect(groups(user({ department: null }), ["CSE-3"])[0].message).toBe(
        "A Faculty without a department can't make an event compulsory for student groups.",
      );
    });

    it("lets clubs name none", () => {
      expect(
        groups(user({ role: "club", club: "Quiz Club" }), ["CSE-3"]),
      ).toEqual([
        {
          field: "mandatory_for_groups",
          message: "Clubs can't make an event compulsory for student groups.",
        },
      ]);
    });

    it("reports unknown groups first and applies the policy to known ones only", () => {
      expect(groups(user(), ["XYZ-9", "XYZ-9", "QQ-1"])).toEqual([
        {
          field: "mandatory_for_groups",
          message: "Unknown student groups: XYZ-9, QQ-1.",
        },
      ]);
      expect(groups(user({ role: "club" }), ["XYZ-9", "CSE-3"])).toEqual([
        {
          field: "mandatory_for_groups",
          message: "Unknown student group: XYZ-9.",
        },
        {
          field: "mandatory_for_groups",
          message: "Clubs can't make an event compulsory for student groups.",
        },
      ]);
    });
  });
});

describe("submissionTime", () => {
  it("never counts a request as filed before one already in the system", () => {
    // The dataset's requests carry fest-season dates, later than the real clock.
    expect(submissionTime(dataset, Date.parse("2026-11-01T12:00:00Z"))).toBe(
      "2027-02-02T10:00:01+05:30",
    );
    expect(submissionTime(dataset, Date.parse("2027-03-01T04:30:00Z"))).toBe(
      "2027-03-01T10:00:00+05:30",
    );
    expect(
      submissionTime(
        { booking_requests: [] },
        Date.parse("2026-11-01T12:00:00Z"),
      ),
    ).toBe("2026-11-01T17:30:00+05:30");
  });
});

describe("requesterLabel", () => {
  it("uses the club name, else the name and role", () => {
    expect(requesterLabel(user({ role: "club", club: "Quiz Club" }))).toBe(
      "Quiz Club",
    );
    expect(requesterLabel(user({ role: "club", club: null }))).toBe(
      "Asha Rao (Club Representative)",
    );
    expect(requesterLabel(user())).toBe("Asha Rao (Faculty)");
  });
});

describe("request building", () => {
  it("ranks at the role's cap and drops duplicates", () => {
    const [request] = draftRequests(dataset, user({ role: "club" }), {
      ...body(),
      windows: [
        { day: "TUE", from_period: 10, to_period: 11 },
        { day: "TUE", from_period: 10, to_period: 11 },
        { day: "WED", from_period: 10, to_period: 11 },
      ],
      room_types: ["seminar_hall", "seminar_hall", "lecture_hall"],
      needs: ["projector", "projector"],
      mandatory_for_groups: ["CSE-3", "CSE-3"],
    });
    expect(request).toMatchObject({
      requested_category: "club_event",
      windows: [
        { day: "TUE", from_period: 10, to_period: 11 },
        { day: "WED", from_period: 10, to_period: 11 },
      ],
      room_types: ["seminar_hall", "lecture_hall"],
      needs: ["projector"],
      mandatory_for_groups: ["CSE-3"],
    });
    // A role the dataset doesn't list is capped at club_event.
    const unknown = draftRequests(
      { role_category_cap: {} },
      user({ role: "admin" }),
      body(),
    );
    expect(unknown[0].requested_category).toBe("club_event");
  });

  it("adds one request per repeat day not already covered", () => {
    const requests = buildRequests(
      dataset,
      user({ role: "admin" }),
      body({
        windows: [
          { day: "MON", from_period: 12, to_period: 13 },
          { day: "MON", from_period: 10, to_period: 11 },
        ],
        repeat_days: ["WED", "MON", "WED", "FRI"],
      }),
      { submitted_at: "2027-02-08T10:00:00+05:30", provenance: null },
    );
    expect(requests.map((r) => r.windows)).toEqual([
      [
        { day: "MON", from_period: 12, to_period: 13 },
        { day: "MON", from_period: 10, to_period: 11 },
      ],
      [
        { day: "WED", from_period: 12, to_period: 13 },
        { day: "WED", from_period: 10, to_period: 11 },
      ],
      [
        { day: "FRI", from_period: 12, to_period: 13 },
        { day: "FRI", from_period: 10, to_period: 11 },
      ],
    ]);
    for (const request of requests) {
      expect(request).toMatchObject({
        submitted_at: "2027-02-08T10:00:00+05:30",
        requester: "Asha Rao (Admin)",
        role: "admin",
        requested_category: "institute_event",
        state: "submitted",
        source: "form",
        created_by: "u_test",
      });
      expect(request).not.toHaveProperty("ai_meta");
    }
  });

  it("stores provenance only from what it is given (never the body's chips)", () => {
    const provenance = {
      ai_meta: {
        source: "rules" as const,
        model: "rules",
        prompt_id: "parse_booking.v1",
        assumptions: ["From the log"],
        follow_up: null,
        log_id: "AI-1",
      },
      raw_text: "text",
    };
    const [request] = buildRequests(
      dataset,
      user(),
      body({ source: "nl", assumptions: ["From the body"] }),
      { submitted_at: "2027-02-08T10:00:00+05:30", provenance },
    );
    expect(request.ai_meta).toEqual(provenance.ai_meta);
    expect(request.raw_text).toBe("text");
    expect(request).not.toHaveProperty("assumptions");
  });
});
