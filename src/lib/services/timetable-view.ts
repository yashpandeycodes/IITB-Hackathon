import "server-only";
import type { Db } from "mongodb";
import {
  DAYS,
  type Assignment,
  type BookingRequestRecord,
  type Day,
  type SessionUser,
  type StoredBookingDecision,
  type StoredSessionOverride,
  type TimetableBookingCell,
  type TimetableCell,
  type TimetableCheckRequest,
  type TimetableCheckResult,
  type TimetableView,
  type TimetableViewQuery,
} from "@/lib/contracts";
import { buildInstance, checkTimetable, softScore } from "@/lib/engine";
import { listBookingDecisions } from "@/lib/db/repos/booking-decisions";
import {
  getFaculty,
  getRoom,
  getStudentGroup,
  listBookingRequests,
  listSessions,
  type SessionRecord,
} from "@/lib/db/repos/reference";
import { listSessionOverrides } from "@/lib/db/repos/session-overrides";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { findUserById } from "@/lib/db/repos/users";
import { notFound } from "@/lib/errors";
import { getActiveDataset } from "./dataset";

/** A placement after Week-7 overrides, with the override that moved it (if any). */
export type Placement = Assignment & { displaced_by: string | null };

/** Assignments with the Week-7 overrides applied. */
export function applyOverrides(
  assignments: readonly Assignment[],
  overrides: readonly StoredSessionOverride[],
): Placement[] {
  const bySession = new Map(overrides.map((o) => [o.session_id, o]));
  return assignments.map((assignment) => {
    const override = bySession.get(assignment.session_id);
    return override
      ? {
          session_id: assignment.session_id,
          day: override.day,
          start_period: override.start_period,
          room_id: override.room_id,
          displaced_by: override.displaced_by,
        }
      : { ...assignment, displaced_by: null };
  });
}

/** Decisions that hold a room in Week 7: approved and alternative offers (as `validator.py`). */
export type HeldBooking = StoredBookingDecision & {
  status: "approved" | "alternative_offered";
  day: Day;
  start_period: number;
  end_period: number;
  room_id: string;
};

export function isHeldBooking(
  decision: StoredBookingDecision,
): decision is HeldBooking {
  return (
    (decision.status === "approved" ||
      decision.status === "alternative_offered") &&
    decision.day !== undefined &&
    decision.start_period !== undefined &&
    decision.end_period !== undefined &&
    decision.room_id !== undefined
  );
}

/** The request fields the Week-7 views use (a projection: requests can be large). */
const HELD_REQUEST_FIELDS = [
  "id",
  "title",
  "state",
  "source",
  "created_by",
  "requester",
  "mandatory_for_groups",
] as const satisfies readonly (keyof BookingRequestRecord)[];

/** The part of a request the Week-7 views show or match on. */
export type HeldRequest = Pick<
  BookingRequestRecord,
  (typeof HELD_REQUEST_FIELDS)[number]
>;

export type HeldEntry = { decision: HeldBooking; request: HeldRequest | null };

/** The Week-7 picture of a timetable version beyond its regular week. */
export type Week7 = {
  /** Session overrides computed for the version. */
  overrides: StoredSessionOverride[];
  /** Bookings that hold a room, with their requests (cancelled requests left out). */
  held: HeldEntry[];
  /**
   * Live requests waiting in `pending_approval`: their slot and their class moves are held but
   * not confirmed by an approver yet.
   */
  pending: ReadonlySet<string>;
};

/**
 * The Week-7 overrides and room-holding bookings of `versionId` (the active timetable version;
 * null when there is none, which yields nothing). Decisions for cancelled requests are skipped.
 */
export async function loadWeek7(
  db: Db,
  versionId: string | null,
): Promise<Week7> {
  const [overrides, decisions, requests] = await Promise.all([
    listSessionOverrides(db, { timetable_version: versionId }),
    listBookingDecisions(db, {
      status: ["approved", "alternative_offered"],
      timetable_version: versionId,
    }),
    listBookingRequests(db, {}, HELD_REQUEST_FIELDS),
  ]);
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const held = decisions.filter(isHeldBooking).flatMap((decision) => {
    const request = requestById.get(decision.request_id) ?? null;
    return request?.state === "cancelled" ? [] : [{ decision, request }];
  });
  const pending = new Set(
    requests
      .filter((r) => isLive(r) && r.state === "pending_approval")
      .map((r) => r.id),
  );
  return { overrides, held, pending };
}

/**
 * Week-7 bookings that occupy a room, joined with their requests: only decisions made against
 * `versionId` (the active timetable version; null when there is none). Decisions for cancelled
 * requests are skipped.
 */
export async function listHeldBookings(
  db: Db,
  versionId: string | null,
): Promise<HeldEntry[]> {
  return (await loadWeek7(db, versionId)).held;
}

/** A request submitted in the app (not from the imported dataset). */
export function isLive(request: Pick<HeldRequest, "source"> | null): boolean {
  return request !== null && request.source !== "dataset";
}

/** The account that submitted a live request (null for dataset requests). */
function liveOwner(request: HeldRequest | null): string | null {
  return isLive(request) ? (request?.created_by ?? null) : null;
}

/** What anyone but its owner and admins sees instead of another user's live request title. */
export const MASKED_TITLE = "Booked";

/**
 * The title `viewer` may see for a held booking: dataset requests keep theirs (the official
 * file is public); a live request's title is shown to its owner and admins only.
 */
export function bookingTitle(
  entry: HeldEntry,
  viewer: Pick<SessionUser, "id" | "role">,
): string {
  const { decision, request } = entry;
  const visible =
    !isLive(request) ||
    viewer.role === "admin" ||
    liveOwner(request) === viewer.id;
  return visible ? request?.title || decision.request_id : MASKED_TITLE;
}

function bookingSlot(decision: HeldBooking) {
  return {
    room_id: decision.room_id,
    day: decision.day,
    start_period: decision.start_period,
    end_period: decision.end_period,
    status: decision.status,
    effective_category: decision.effective_category,
  };
}

const DAY_INDEX = new Map<string, number>(DAYS.map((day, i) => [day, i]));

function compareSlots(
  a: { day: string; start_period: number },
  b: { day: string; start_period: number },
): number {
  return (
    (DAY_INDEX.get(a.day) ?? 99) - (DAY_INDEX.get(b.day) ?? 99) ||
    a.start_period - b.start_period
  );
}

async function assertSubjectExists(
  db: Db,
  query: TimetableViewQuery,
): Promise<{ name: string | null }> {
  switch (query.view) {
    case "group": {
      const group = await getStudentGroup(db, query.id);
      if (!group) throw notFound(`No student group with id ${query.id}.`);
      return { name: group.name };
    }
    case "faculty": {
      const faculty = await getFaculty(db, query.id);
      if (!faculty) throw notFound(`No faculty member with id ${query.id}.`);
      return { name: faculty.name || null };
    }
    case "room": {
      const room = await getRoom(db, query.id);
      if (!room) throw notFound(`No room with id ${query.id}.`);
      return { name: room.name };
    }
  }
}

function cellMatches(
  query: TimetableViewQuery,
  session: SessionRecord,
  placement: Placement,
): boolean {
  switch (query.view) {
    case "group":
      return session.groups.includes(query.id);
    case "faculty":
      return session.faculty_id === query.id;
    case "room":
      return placement.room_id === query.id;
  }
}

const normalise = (text: string) =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * True when a booking's free-text `requester` names this faculty member: either a trailing id
 * suffix (`"Dr. Amit Behera (F12)"`) or the plain name, with or without such a suffix.
 */
export function requesterMatchesFaculty(
  requester: string | null | undefined,
  faculty: { id: string; name?: string | null },
): boolean {
  if (!requester) return false;
  const suffix = /\(([^()]+)\)\s*$/.exec(requester);
  if (suffix && normalise(suffix[1]) === normalise(faculty.id)) return true;
  const name = normalise(faculty.name ?? "");
  if (!name) return false;
  const plain = requester.replace(/\s*\([^()]*\)\s*$/, "");
  return normalise(requester) === name || normalise(plain) === name;
}

function bookingMatches(
  query: TimetableViewQuery,
  subjectName: string | null,
  facultyUsers: ReadonlySet<string>,
  { decision, request }: HeldEntry,
): boolean {
  switch (query.view) {
    case "room":
      return decision.room_id === query.id;
    case "group":
      return request?.mandatory_for_groups.includes(query.id) ?? false;
    case "faculty":
      // A live request belongs to the account that submitted it: anyone can type any display
      // name, so live requests are never matched by name.
      if (isLive(request)) {
        const owner = liveOwner(request);
        return owner !== null && facultyUsers.has(owner);
      }
      // Dataset requests carry the requester's name (sometimes with an id suffix), not an id.
      return requesterMatchesFaculty(request?.requester, {
        id: query.id,
        name: subjectName,
      });
  }
}

/**
 * The submitters of `held`'s live requests whose account is linked to faculty member
 * `facultyId` (users repo, read only). Sign-ups never get a `faculty_id`, so only seeded faculty
 * accounts can match.
 */
async function facultyUserIds(
  db: Db,
  facultyId: string,
  held: readonly HeldEntry[],
): Promise<Set<string>> {
  const creators = [
    ...new Set(
      held.flatMap(({ request }) => {
        const owner = liveOwner(request);
        return owner ? [owner] : [];
      }),
    ),
  ];
  const users = await Promise.all(creators.map((id) => findUserById(db, id)));
  return new Set(creators.filter((_, i) => users[i]?.faculty_id === facultyId));
}

const NO_WEEK7: Week7 = { overrides: [], held: [], pending: new Set() };

/**
 * `GET /api/timetable`: one group's, faculty member's or room's week from the active
 * timetable version. `week=spectra` applies the Week-7 session overrides and adds the bookings
 * that hold a room. With no active version, `cells` is empty and `version_id` is null.
 * Throws NOT_FOUND for an unknown id.
 *
 * Week 7 never presents a pending approval as done: a booking cell whose live request waits for
 * an approver has `pending_approval`, and so does the `override` of a session it moved. Another
 * user's live request is titled "Booked" for `viewer` unless they are an admin or its owner.
 * A faculty member's bookings are dataset requests naming them and live requests submitted from
 * their linked account.
 */
export async function getTimetableView(
  db: Db,
  query: TimetableViewQuery,
  viewer: SessionUser,
): Promise<TimetableView> {
  const [subject, version] = await Promise.all([
    assertSubjectExists(db, query),
    getActiveTimetableVersion(db),
  ]);
  const versionId = version?.id ?? null;
  const spectra = query.week === "spectra";
  const [sessions, week7] = await Promise.all([
    listSessions(db, { includeRemoved: true }),
    spectra ? loadWeek7(db, versionId) : Promise.resolve(NO_WEEK7),
  ]);
  const { overrides, held, pending } = week7;
  const facultyUsers =
    spectra && query.view === "faculty"
      ? await facultyUserIds(db, query.id, held)
      : new Set<string>();

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const placements = applyOverrides(version?.assignments ?? [], overrides);
  const cells: TimetableCell[] = [];
  for (const placement of placements) {
    const session = sessionById.get(placement.session_id);
    if (!session || !cellMatches(query, session, placement)) continue;
    cells.push({
      session_id: session.id,
      course_id: session.course_id,
      kind: session.kind,
      groups: session.groups,
      faculty_id: session.faculty_id,
      room_id: placement.room_id,
      day: placement.day,
      start_period: placement.start_period,
      duration: session.duration,
      basket_slot: session.basket_slot,
      size: session.size,
      override: placement.displaced_by
        ? {
            displaced_by: placement.displaced_by,
            pending_approval: pending.has(placement.displaced_by),
          }
        : null,
    });
  }
  cells.sort(
    (a, b) => compareSlots(a, b) || a.session_id.localeCompare(b.session_id),
  );

  const bookings: TimetableBookingCell[] = held
    .filter((entry) => bookingMatches(query, subject.name, facultyUsers, entry))
    .map((entry) => ({
      request_id: entry.decision.request_id,
      title: bookingTitle(entry, viewer),
      pending_approval: entry.request?.state === "pending_approval",
      ...bookingSlot(entry.decision),
    }))
    .sort(
      (a, b) => compareSlots(a, b) || a.request_id.localeCompare(b.request_id),
    );

  return {
    view: query.view,
    id: query.id,
    week: query.week,
    version_id: version?.id ?? null,
    cells,
    bookings,
  };
}

/**
 * `POST /api/timetable/check` (what-if): the given assignments replace those sessions'
 * placements in the active timetable (all other sessions stay where they are), and the merged
 * timetable is run through the engine's checker and soft score on the loaded dataset.
 * `soft_delta` is the merged total minus the active timetable's total, both scored here on the
 * same data (negative is better). With no active timetable the assignments are checked on their
 * own, unlisted sessions are reported as not scheduled and `soft_delta` is null. Nothing is
 * stored.
 */
export async function checkTimetableWhatIf(
  db: Db,
  request: TimetableCheckRequest,
): Promise<TimetableCheckResult> {
  const [dataset, version] = await Promise.all([
    getActiveDataset(db),
    getActiveTimetableVersion(db),
  ]);
  const changed = new Set(request.assignments.map((a) => a.session_id));
  const merged = [
    ...(version?.assignments ?? []).filter((a) => !changed.has(a.session_id)),
    ...request.assignments,
  ];
  const instance = buildInstance(dataset);
  const { violations } = checkTimetable(instance, merged);
  const { penalties, total } = softScore(instance, merged);
  const soft_delta = version
    ? total - softScore(instance, version.assignments).total
    : null;
  return { violations, soft_penalty: { ...penalties, total }, soft_delta };
}
