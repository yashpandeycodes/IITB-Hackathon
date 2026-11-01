/**
 * Change-request scope on the public dataset: what a coordinator and a faculty member may
 * propose, with the added-session rules (the course, its teacher and its groups) in detail.
 */
import { describe, expect, it } from "vitest";

import type {
  DisruptionChange,
  Faculty,
  Session,
  SessionUser,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";

import {
  assertCanApproveChange,
  assertKindShape,
  canSeeChange,
  changeScopeIssues,
} from "./change-scope";

const dataset = getBundledDataset();

const user = (
  role: SessionUser["role"],
  extra: Partial<SessionUser> = {},
): SessionUser => ({
  id: `u_${role}`,
  email: `${role}@cit.demo`,
  name: role,
  role,
  department: null,
  faculty_id: null,
  club: null,
  ...extra,
});
const ADMIN = user("admin");
const CSE = user("department_coordinator", { department: "CSE" });
const ECE = user("department_coordinator", { department: "ECE" });
const F06 = user("faculty", { department: "CSE", faculty_id: "F06" });

/** An extra CS202 tutorial for CSE-2 taught by F06, like the sample disruption's. */
const extra = (over: Partial<Session> = {}): DisruptionChange => ({
  type: "add_session",
  session: {
    id: "X-T9",
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
    ...over,
  },
});
const newFaculty = (over: Partial<Faculty> = {}): DisruptionChange => ({
  type: "add_faculty",
  faculty: {
    id: "F99",
    name: "Dr. New",
    department: "CSE",
    max_hours_per_day: 4,
    needs_accessible: false,
    unavailable: [],
    preferences: [],
    ...over,
  },
});

const issues = (
  who: SessionUser,
  changes: DisruptionChange[],
  kind: "disruption" | "faculty_request" = "disruption",
) => changeScopeIssues(who, dataset, { kind, changes, placements: [] });

describe("changeScopeIssues: added sessions", () => {
  it("lets an admin add anything", () => {
    expect(
      issues(ADMIN, [extra({ course_id: "ME201", groups: ["Y1-A"] })]),
    ).toEqual([]);
  });

  it("lets a coordinator add a session of their course, teacher and groups", () => {
    expect(issues(CSE, [extra()])).toEqual([]);
  });

  it("refuses a coordinator's session taught by another department's faculty", () => {
    // F25 is ME faculty and doesn't teach CS202.
    expect(issues(CSE, [extra({ faculty_id: "F25" })])).toEqual([
      "changes[0]: F25 isn't CSE faculty and doesn't teach CS202.",
    ]);
  });

  it("counts faculty the same request adds, with their department", () => {
    expect(issues(CSE, [newFaculty(), extra({ faculty_id: "F99" })])).toEqual(
      [],
    );
    expect(
      issues(CSE, [
        newFaculty({ department: "ME" }),
        extra({ faculty_id: "F99" }),
      ]),
    ).toEqual([
      "changes[0]: the new faculty member isn't in CSE.",
      "changes[1]: F99 isn't CSE faculty and doesn't teach CS202.",
    ]);
    // A faculty member added later in the list doesn't count.
    expect(issues(CSE, [extra({ faculty_id: "F99" }), newFaculty()])).toEqual([
      "changes[0]: F99 isn't CSE faculty and doesn't teach CS202.",
    ]);
  });

  it("refuses a coordinator's session for another department's groups", () => {
    expect(
      issues(CSE, [
        extra({ groups: ["CSE-2", "ME-2", "EE-2", "CE-2", "ECE-2"] }),
      ]),
    ).toEqual([
      "changes[0]: ME-2, EE-2, CE-2 and 1 more aren't groups of CSE or of CS202.",
    ]);
    expect(issues(CSE, [extra({ groups: ["ME-2"] })])).toEqual([
      "changes[0]: ME-2 isn't a group of CSE or of CS202.",
    ]);
  });

  it("allows a teacher or group already on the course (first-year and cross-listed courses)", () => {
    // CS101 is a CSE course for the common first-year sections.
    expect(
      issues(CSE, [
        extra({ course_id: "CS101", groups: ["Y1-A"], faculty_id: "F01" }),
      ]),
    ).toEqual([]);
    // EC292 is an ECE course taught by F05, a CSE faculty member.
    expect(
      issues(ECE, [
        extra({ course_id: "EC292", groups: ["ECE-2"], faculty_id: "F05" }),
      ]),
    ).toEqual([]);
  });

  it("still refuses another department's course", () => {
    expect(issues(ECE, [extra()])).toEqual([
      "changes[0]: CS202 isn't a ECE course.",
    ]);
  });

  it("lets a faculty member add a session of a course they already teach, for its groups", () => {
    expect(issues(F06, [extra()], "faculty_request")).toEqual([]);
    expect(
      issues(
        F06,
        [extra({ course_id: "CS303", groups: ["CSE-3"] })],
        "faculty_request",
      ),
    ).toEqual([]);
  });

  it("refuses a faculty member's session of a course they don't teach", () => {
    // F06 teaches CS202 and CS303, not CS203.
    expect(
      issues(F06, [extra({ course_id: "CS203" })], "faculty_request"),
    ).toEqual([
      "changes[0]: you can only add sessions to a course you already teach (not CS203).",
    ]);
  });

  it("refuses a faculty member's session for groups not on the course, or taught by someone else", () => {
    expect(
      issues(F06, [extra({ groups: ["CSE-2", "ME-2"] })], "faculty_request"),
    ).toEqual(["changes[0]: ME-2 doesn't take CS202."]);
    expect(
      issues(F06, [extra({ faculty_id: "F07" })], "faculty_request"),
    ).toEqual(["changes[0]: an extra session must be one you teach."]);
  });
});

describe("changeScopeIssues: other changes", () => {
  it("keeps a coordinator to their faculty, labs and sessions", () => {
    expect(
      issues(CSE, [
        {
          type: "faculty_unavailable",
          faculty_id: "F25",
          days: ["MON"],
          periods: [1],
        },
        {
          type: "room_unavailable",
          room_id: "CR-102",
          days: ["MON"],
          periods: [1],
        },
        { type: "remove_session", session_id: "CS202-L1" },
      ]),
    ).toEqual([
      "changes[0]: F25 isn't in CSE.",
      "changes[1]: only an admin can close CR-102 (not a CSE lab).",
    ]);
  });

  it("keeps a faculty member to their own unavailability", () => {
    expect(
      changeScopeIssues(F06, dataset, {
        kind: "unavailability",
        changes: [
          {
            type: "faculty_unavailable",
            faculty_id: "F07",
            days: ["MON"],
            periods: [1],
          },
        ],
        placements: [],
      }),
    ).toEqual(["changes[0]: you can only mark your own unavailability."]);
  });

  it("gives clubs and unlinked accounts nothing", () => {
    expect(issues(user("club"), [extra()])).toEqual([
      "Your role can't file disruption requests.",
    ]);
    expect(issues(user("department_coordinator"), [extra()])).toEqual([
      "Your account isn't linked to a department.",
    ]);
  });
});

describe("assertKindShape and canSeeChange", () => {
  it("answers 400 VALIDATION_ERROR when the changes don't fit the kind", () => {
    expect(() =>
      assertKindShape({
        kind: "unavailability",
        changes: [extra()],
        placements: [],
      }),
    ).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", status: 400 }),
    );
  });

  it("shows a change to the touched department and faculty only", () => {
    const cr = {
      requested_by: "u_other",
      scope: {
        session_ids: [],
        faculty_ids: ["F06"],
        group_ids: [],
        room_ids: [],
        departments: ["CSE"],
      },
    };
    expect(canSeeChange(CSE, cr)).toBe(true);
    expect(canSeeChange(ECE, cr)).toBe(false);
    expect(canSeeChange(F06, cr)).toBe(true);
    expect(canSeeChange(user("faculty", { faculty_id: "F07" }), cr)).toBe(
      false,
    );
  });
});

describe("assertCanApproveChange", () => {
  const filed = (
    requested_by: string,
    requested_by_role: SessionUser["role"],
    kind: "disruption" | "manual_edit" | "faculty_request" | "unavailability",
  ) => ({ requested_by, requested_by_role, kind });
  const code = (fn: () => void) => {
    try {
      fn();
      return null;
    } catch (err) {
      return (err as { code?: string }).code ?? "thrown";
    }
  };

  it("lets only admins approve", () => {
    for (const who of [CSE, F06, user("club")]) {
      expect(
        code(() =>
          assertCanApproveChange(who, filed(ADMIN.id, "admin", "disruption")),
        ),
      ).toBe("FORBIDDEN");
    }
  });

  it("lets an admin approve their own change file or manual edit, nothing else they filed", () => {
    expect(
      code(() =>
        assertCanApproveChange(ADMIN, filed(ADMIN.id, "admin", "disruption")),
      ),
    ).toBeNull();
    expect(
      code(() =>
        assertCanApproveChange(ADMIN, filed(ADMIN.id, "admin", "manual_edit")),
      ),
    ).toBeNull();
    for (const kind of ["faculty_request", "unavailability"] as const) {
      expect(
        code(() =>
          assertCanApproveChange(ADMIN, filed(ADMIN.id, "admin", kind)),
        ),
      ).toBe("SELF_APPROVAL");
    }
  });

  it("never lets a requester approve what they filed under another role", () => {
    expect(
      code(() =>
        assertCanApproveChange(
          ADMIN,
          filed(ADMIN.id, "department_coordinator", "disruption"),
        ),
      ),
    ).toBe("SELF_APPROVAL");
  });

  it("lets an admin approve anyone else's request", () => {
    for (const kind of [
      "disruption",
      "manual_edit",
      "faculty_request",
      "unavailability",
    ] as const) {
      expect(
        code(() =>
          assertCanApproveChange(ADMIN, filed("u_other", "faculty", kind)),
        ),
      ).toBeNull();
    }
  });
});
