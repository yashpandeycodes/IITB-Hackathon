/**
 * What each role may pick in the change forms. Mirrors the server's scope rules
 * (`src/lib/services/change-scope.ts`, docs/api.md "Who may file what") so pickers only offer
 * what the API will accept; the server re-checks everything.
 */
import type {
  ChangeKind,
  ReferenceData,
  ReferenceSession,
  SessionUser,
} from "@/lib/contracts";

/** Lab room types owned by a department (same table as the server's `LAB_DEPARTMENT`). */
const LAB_DEPARTMENT: Readonly<Record<string, string>> = {
  lab_cs: "CSE",
  lab_elec: "ECE",
  workshop: "ME",
  lab_civil: "CE",
  lab_phy: "PH",
};

export function labTypeForDepartment(department: string): string | null {
  for (const [type, dept] of Object.entries(LAB_DEPARTMENT))
    if (dept === department) return type;
  return null;
}

export function canFileChanges(user: SessionUser): boolean {
  return user.role !== "club";
}

export const isStaff = (user: SessionUser) =>
  user.role === "admin" || user.role === "department_coordinator";

/**
 * The `kind` a form files under. An admin's form entries go in as `disruption` (the same as
 * loading a one-item change file), which the admin may approve after reviewing the diff; the
 * server refuses self-approval of an admin's own `unavailability` / `faculty_request`.
 */
export function kindFor(
  user: SessionUser,
  form: "unavailability" | "add_session" | "disruption",
): ChangeKind {
  if (form === "unavailability")
    return user.role === "admin" ? "disruption" : "unavailability";
  if (form === "add_session")
    return user.role === "faculty" ? "faculty_request" : "disruption";
  return "disruption";
}

function courseDepartments(ref: ReferenceData): Map<string, string> {
  return new Map(ref.courses.map((c) => [c.id, c.department]));
}

/** Faculty whose unavailability the user may mark. */
export function facultyInScope(user: SessionUser, ref: ReferenceData) {
  switch (user.role) {
    case "admin":
      return ref.faculty;
    case "department_coordinator":
      return user.department
        ? ref.faculty.filter((f) => f.department === user.department)
        : [];
    case "faculty":
      return user.faculty_id
        ? ref.faculty.filter((f) => f.id === user.faculty_id)
        : [];
    default:
      return [];
  }
}

/** Sessions the user may move or remove (admin: all; coordinator: their department's; faculty: their own). */
export function sessionsInScope(
  user: SessionUser,
  ref: ReferenceData,
): ReferenceSession[] {
  switch (user.role) {
    case "admin":
      return ref.sessions;
    case "department_coordinator": {
      if (!user.department) return [];
      const depts = courseDepartments(ref);
      return ref.sessions.filter(
        (s) => depts.get(s.course_id) === user.department,
      );
    }
    case "faculty":
      return user.faculty_id
        ? ref.sessions.filter((s) => s.faculty_id === user.faculty_id)
        : [];
    default:
      return [];
  }
}

/** Courses the user may add a session to. */
export function coursesForNewSession(user: SessionUser, ref: ReferenceData) {
  switch (user.role) {
    case "admin":
      return ref.courses;
    case "department_coordinator":
      return user.department
        ? ref.courses.filter((c) => c.department === user.department)
        : [];
    case "faculty": {
      const taught = new Set(
        ref.sessions
          .filter((s) => s.faculty_id === user.faculty_id)
          .map((s) => s.course_id),
      );
      return ref.courses.filter((c) => taught.has(c.id));
    }
    default:
      return [];
  }
}

/** Who may teach an added session of `courseId`. */
export function teachersForNewSession(
  user: SessionUser,
  ref: ReferenceData,
  courseId: string,
) {
  switch (user.role) {
    case "admin":
      return ref.faculty;
    case "department_coordinator": {
      const onCourse = new Set(
        ref.sessions
          .filter((s) => s.course_id === courseId)
          .map((s) => s.faculty_id),
      );
      return ref.faculty.filter(
        (f) => f.department === user.department || onCourse.has(f.id),
      );
    }
    case "faculty":
      return ref.faculty.filter((f) => f.id === user.faculty_id);
    default:
      return [];
  }
}

/** Groups that may attend an added session of `courseId`. */
export function groupsForNewSession(
  user: SessionUser,
  ref: ReferenceData,
  courseId: string,
) {
  const onCourse = new Set(
    ref.sessions
      .filter((s) => s.course_id === courseId)
      .flatMap((s) => s.groups),
  );
  switch (user.role) {
    case "admin":
      return ref.student_groups;
    case "department_coordinator":
      return ref.student_groups.filter(
        (g) => g.department === user.department || onCourse.has(g.id),
      );
    case "faculty":
      return ref.student_groups.filter((g) => onCourse.has(g.id));
    default:
      return [];
  }
}

/** Rooms the user may close (admin: any; coordinator: their department's labs). */
export function closableRooms(user: SessionUser, ref: ReferenceData) {
  if (user.role === "admin") return ref.rooms;
  if (user.role === "department_coordinator" && user.department)
    return ref.rooms.filter(
      (r) =>
        Object.hasOwn(LAB_DEPARTMENT, r.type) &&
        LAB_DEPARTMENT[r.type] === user.department,
    );
  return [];
}

/** The department of a session's course, or null. */
export function sessionDepartment(
  ref: ReferenceData,
  session: Pick<ReferenceSession, "course_id">,
): string | null {
  return (
    ref.courses.find((c) => c.id === session.course_id)?.department ?? null
  );
}
