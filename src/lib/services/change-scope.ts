import "server-only";
import type {
  Assignment,
  ChangeKind,
  ChangeRequest,
  Dataset,
  DisruptionChange,
  PathIssue,
  Role,
  Session,
  SessionUser,
} from "@/lib/contracts";
import { roomDepartment } from "@/lib/db/repos/reference";
import { forbidden, selfApproval, validationError } from "@/lib/errors";

/**
 * Who may propose, see, approve and withdraw timetable changes (architecture §9, Phase 5).
 *
 * - Admin: any change, and the only role that approves. An admin may approve their own change
 *   file or manual edit (loading change files and placing sessions are the admin's actions; each
 *   still stops at `pending` until they confirm the diff), but not a request they filed through
 *   the assistant or the request forms (`faculty_request`, `unavailability`).
 * - Department coordinator: changes to their department only (its faculty, its courses'
 *   sessions, its labs). An added session must be for one of its courses, taught by one of its
 *   faculty and attended by its own groups (a teacher or group already on that course counts
 *   too, so a first-year course's extra session can still go to its first-year sections). Never
 *   approves.
 * - Faculty: their own unavailability, moves of their own sessions, and extra sessions they
 *   teach for a course they already teach, attended by groups already on that course.
 * - Club: none.
 * - A request filed by a coordinator or faculty member is never approved by its requester, even
 *   if their role later becomes admin (`SELF_APPROVAL`); neither is an admin's own assistant or
 *   form request.
 * - A scope field that is null (a coordinator without a department, a faculty account without a
 *   `faculty_id`) denies, never widens.
 */

/** Change kinds each role may file. */
const KINDS_BY_ROLE: Readonly<Record<Role, readonly ChangeKind[]>> = {
  admin: ["disruption", "faculty_request", "manual_edit", "unavailability"],
  department_coordinator: [
    "disruption",
    "faculty_request",
    "manual_edit",
    "unavailability",
  ],
  faculty: ["unavailability", "faculty_request"],
  club: [],
};

/** Which change types each kind may carry, and whether placements are allowed or required. */
const KIND_SHAPE: Readonly<
  Record<
    ChangeKind,
    {
      types: readonly DisruptionChange["type"][];
      placements: "none" | "allowed" | "required";
    }
  >
> = {
  disruption: {
    types: [
      "faculty_unavailable",
      "room_unavailable",
      "add_faculty",
      "add_session",
      "remove_session",
    ],
    placements: "none",
  },
  unavailability: { types: ["faculty_unavailable"], placements: "none" },
  faculty_request: { types: ["add_session"], placements: "allowed" },
  manual_edit: { types: [], placements: "required" },
};

type ProposalShape = {
  kind: ChangeKind;
  changes: readonly DisruptionChange[];
  placements: readonly Assignment[];
};

/** The department a session belongs to: its course's department (null for an unknown course). */
export function sessionDepartment(
  dataset: Pick<Dataset, "courses">,
  session: Pick<Session, "course_id">,
): string | null {
  return (
    dataset.courses.find((c) => c.id === session.course_id)?.department ?? null
  );
}

/** True when `user` may file change requests of `kind`. */
export function canProposeKind(user: SessionUser, kind: ChangeKind): boolean {
  return KINDS_BY_ROLE[user.role].includes(kind);
}

/** True when `user` may file any change request at all (clubs may not). */
export function canProposeChanges(user: SessionUser): boolean {
  return KINDS_BY_ROLE[user.role].length > 0;
}

/**
 * `400 VALIDATION_ERROR` when the change types or placements don't fit `kind` (an
 * `unavailability` request carrying a room closure, a `manual_edit` without a placement, …),
 * with one `PathIssue` per problem as `details`.
 */
export function assertKindShape(request: ProposalShape): void {
  const shape = KIND_SHAPE[request.kind];
  const issues: PathIssue[] = [];
  request.changes.forEach((change, i) => {
    if (!shape.types.includes(change.type)) {
      issues.push({
        path: `changes[${i}].type`,
        message: `A ${request.kind} request can't carry a ${change.type} change.`,
      });
    }
  });
  if (shape.placements === "none" && request.placements.length > 0) {
    issues.push({
      path: "placements",
      message: `A ${request.kind} request can't carry placements.`,
    });
  }
  if (shape.placements === "required" && request.placements.length === 0) {
    issues.push({
      path: "placements",
      message: `A ${request.kind} request needs at least one placement.`,
    });
  }
  if (issues.length > 0) {
    throw validationError("The request doesn't fit its kind.", issues);
  }
}

/** Sessions of `dataset` plus those the request adds (later entries win, like the validator). */
function sessionLookup(
  dataset: Pick<Dataset, "sessions">,
  changes: readonly DisruptionChange[],
): Map<string, Pick<Session, "id" | "course_id" | "faculty_id">> {
  const byId = new Map<
    string,
    Pick<Session, "id" | "course_id" | "faculty_id">
  >();
  for (const s of dataset.sessions) byId.set(s.id, s);
  for (const c of changes)
    if (c.type === "add_session") byId.set(c.session.id, c.session);
  return byId;
}

/** The dataset fields the scope checks read. */
export type ScopeDataset = Pick<
  Dataset,
  "courses" | "faculty" | "rooms" | "sessions" | "student_groups"
>;

/** Who already teaches, and which groups already attend, each course (dataset sessions only). */
function courseRoster(dataset: Pick<Dataset, "sessions">): {
  teachers: (courseId: string) => ReadonlySet<string>;
  groups: (courseId: string) => ReadonlySet<string>;
} {
  const teachers = new Map<string, Set<string>>();
  const groups = new Map<string, Set<string>>();
  const into = (map: Map<string, Set<string>>, key: string) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    return set;
  };
  for (const s of dataset.sessions) {
    into(teachers, s.course_id).add(s.faculty_id);
    for (const g of s.groups) into(groups, s.course_id).add(g);
  }
  const none: ReadonlySet<string> = new Set();
  return {
    teachers: (id) => teachers.get(id) ?? none,
    groups: (id) => groups.get(id) ?? none,
  };
}

/** "CE-3", "CE-3 and ME-3", "CE-3, EE-3 and 4 more". */
function idList(ids: readonly string[]): string {
  const shown = ids.slice(0, 3);
  const rest = ids.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  return shown.length <= 1
    ? (shown[0] ?? "")
    : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * Why `user` may not file this request: one message per out-of-scope item (empty = allowed).
 * Unknown ids are left to `validateChanges` (`400 VALIDATION_ERROR`); here they simply aren't
 * in scope.
 */
export function changeScopeIssues(
  user: SessionUser,
  dataset: ScopeDataset,
  request: ProposalShape,
): string[] {
  if (!canProposeKind(user, request.kind)) {
    return [`Your role can't file ${request.kind} requests.`];
  }
  if (user.role === "admin") return [];

  const issues: string[] = [];
  const sessions = sessionLookup(dataset, request.changes);
  const roster = courseRoster(dataset);
  const facultyDept = (id: string) =>
    dataset.faculty.find((f) => f.id === id)?.department ?? null;
  const groupDept = (id: string) =>
    dataset.student_groups.find((g) => g.id === id)?.department ?? null;

  if (user.role === "department_coordinator") {
    const dept = user.department;
    if (!dept) return ["Your account isn't linked to a department."];
    const ownSession = (id: string) => {
      const s = sessions.get(id);
      return s !== undefined && sessionDepartment(dataset, s) === dept;
    };
    /** Departments of faculty added earlier in this request (later entries win). */
    const addedDept = new Map<string, string>();
    request.changes.forEach((c, i) => {
      const at = `changes[${i}]`;
      switch (c.type) {
        case "faculty_unavailable":
          if (facultyDept(c.faculty_id) !== dept)
            issues.push(`${at}: ${c.faculty_id} isn't in ${dept}.`);
          break;
        case "room_unavailable": {
          const room = dataset.rooms.find((r) => r.id === c.room_id);
          if (!room || roomDepartment(room) !== dept)
            issues.push(
              `${at}: only an admin can close ${c.room_id} (not a ${dept} lab).`,
            );
          break;
        }
        case "add_faculty":
          if (c.faculty.department !== dept)
            issues.push(`${at}: the new faculty member isn't in ${dept}.`);
          addedDept.set(c.faculty.id, c.faculty.department);
          break;
        case "add_session": {
          const { course_id, faculty_id, groups } = c.session;
          if (sessionDepartment(dataset, c.session) !== dept) {
            issues.push(`${at}: ${course_id} isn't a ${dept} course.`);
            break;
          }
          const teacherDept =
            addedDept.get(faculty_id) ?? facultyDept(faculty_id);
          if (
            teacherDept !== dept &&
            !roster.teachers(course_id).has(faculty_id)
          )
            issues.push(
              `${at}: ${faculty_id} isn't ${dept} faculty and doesn't teach ${course_id}.`,
            );
          const outside = [...new Set(groups)].filter(
            (g) => groupDept(g) !== dept && !roster.groups(course_id).has(g),
          );
          if (outside.length > 0)
            issues.push(
              `${at}: ${idList(outside)} ${outside.length === 1 ? "isn't a group" : "aren't groups"} of ${dept} or of ${course_id}.`,
            );
          break;
        }
        case "remove_session":
          if (!ownSession(c.session_id))
            issues.push(`${at}: ${c.session_id} isn't a ${dept} session.`);
          break;
      }
    });
    request.placements.forEach((p, i) => {
      if (!ownSession(p.session_id))
        issues.push(
          `placements[${i}]: ${p.session_id} isn't a ${dept} session.`,
        );
    });
    return issues;
  }

  if (user.role === "faculty") {
    const me = user.faculty_id;
    if (!me) return ["Your account isn't linked to a faculty member."];
    request.changes.forEach((c, i) => {
      const at = `changes[${i}]`;
      switch (c.type) {
        case "faculty_unavailable":
          if (c.faculty_id !== me)
            issues.push(`${at}: you can only mark your own unavailability.`);
          break;
        case "add_session": {
          const { course_id, faculty_id, groups } = c.session;
          if (faculty_id !== me) {
            issues.push(`${at}: an extra session must be one you teach.`);
            break;
          }
          if (!roster.teachers(course_id).has(me)) {
            issues.push(
              `${at}: you can only add sessions to a course you already teach (not ${course_id}).`,
            );
            break;
          }
          const outside = [...new Set(groups)].filter(
            (g) => !roster.groups(course_id).has(g),
          );
          if (outside.length > 0)
            issues.push(
              `${at}: ${idList(outside)} ${outside.length === 1 ? "doesn't" : "don't"} take ${course_id}.`,
            );
          break;
        }
        default:
          issues.push(`${at}: faculty can't file ${c.type} changes.`);
      }
    });
    request.placements.forEach((p, i) => {
      if (sessions.get(p.session_id)?.faculty_id !== me)
        issues.push(
          `placements[${i}]: ${p.session_id} isn't one of your sessions.`,
        );
    });
    return issues;
  }

  return ["Your role can't file timetable changes."];
}

/** `403 FORBIDDEN` listing every out-of-scope item, unless {@link changeScopeIssues} is empty. */
export function assertChangeScope(
  user: SessionUser,
  dataset: ScopeDataset,
  request: ProposalShape,
): void {
  const issues = changeScopeIssues(user, dataset, request);
  if (issues.length > 0) {
    throw forbidden("This change is outside what your role may request.", {
      issues,
    });
  }
}

/** Sessions `user` may ask to move (assistant, faculty requests), in dataset order. */
export function sessionsInScope(
  user: SessionUser,
  dataset: Pick<Dataset, "courses" | "sessions">,
): Session[] {
  switch (user.role) {
    case "admin":
      return [...dataset.sessions];
    case "department_coordinator":
      return user.department
        ? dataset.sessions.filter(
            (s) => sessionDepartment(dataset, s) === user.department,
          )
        : [];
    case "faculty":
      return user.faculty_id
        ? dataset.sessions.filter((s) => s.faculty_id === user.faculty_id)
        : [];
    default:
      return [];
  }
}

/**
 * Whether `user` may see change request `cr`: admins see all; anyone sees their own; a
 * coordinator sees those touching their department; a faculty member those touching them.
 */
export function canSeeChange(
  user: SessionUser,
  cr: Pick<ChangeRequest, "requested_by" | "scope">,
): boolean {
  if (user.role === "admin" || cr.requested_by === user.id) return true;
  if (user.role === "department_coordinator") {
    return (
      user.department !== null && cr.scope.departments.includes(user.department)
    );
  }
  if (user.role === "faculty") {
    return (
      user.faculty_id !== null && cr.scope.faculty_ids.includes(user.faculty_id)
    );
  }
  return false;
}

/**
 * Throws unless `user` may approve `cr`: `403` for non-admins; `SELF_APPROVAL` when an admin
 * would approve their own request, unless it is a `disruption` or `manual_edit` they filed as an
 * admin ({@link ADMIN_ACTION_KINDS}). Their own `faculty_request` or `unavailability`, and
 * anything they filed under another role, needs another admin.
 */
export function assertCanApproveChange(
  user: SessionUser,
  cr: Pick<ChangeRequest, "requested_by" | "requested_by_role" | "kind">,
): void {
  if (user.role !== "admin") {
    throw forbidden("Only an admin can approve timetable changes.");
  }
  if (cr.requested_by !== user.id) return;
  // An admin's own change file or manual edit is the admin's action (they load change files and
  // place sessions); it still stops at `pending` until they confirm the engine's diff. Anything
  // else they filed (a request through the assistant or the request forms) is a request like
  // anyone's, and so is whatever they filed under another role.
  if (cr.requested_by_role !== "admin" || !ADMIN_ACTION_KINDS.has(cr.kind)) {
    throw selfApproval("You can't approve a change you requested.");
  }
}

/** Change kinds an admin may approve after filing them themselves (see `assertCanApproveChange`). */
export const ADMIN_ACTION_KINDS: ReadonlySet<ChangeKind> = new Set([
  "disruption",
  "manual_edit",
]);

/** Who may reject `cr`: an admin, or its requester (withdrawing it). */
export function canRejectChange(
  user: SessionUser,
  cr: Pick<ChangeRequest, "requested_by">,
): boolean {
  return user.role === "admin" || cr.requested_by === user.id;
}
