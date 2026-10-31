import "server-only";
import type { Db } from "mongodb";
import {
  DAYS,
  type Assignment,
  type BookingRequestRecord,
  type Day,
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

/**
 * Week-7 bookings that occupy a room, joined with their requests: only decisions made against
 * `versionId` (the active timetable version; null when there is none). Decisions for cancelled
 * requests are skipped.
 */
export async function listHeldBookings(
  db: Db,
  versionId: string | null,
): Promise<{ decision: HeldBooking; request: BookingRequestRecord | null }[]> {
  const [decisions, requests] = await Promise.all([
    listBookingDecisions(db, {
      status: ["approved", "alternative_offered"],
      timetable_version: versionId,
    }),
    listBookingRequests(db),
  ]);
  const requestById = new Map(requests.map((r) => [r.id, r]));
  return decisions.filter(isHeldBooking).flatMap((decision) => {
    const request = requestById.get(decision.request_id) ?? null;
    return request?.state === "cancelled" ? [] : [{ decision, request }];
  });
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
  decision: HeldBooking,
  request: BookingRequestRecord | null,
): boolean {
  switch (query.view) {
    case "room":
      return decision.room_id === query.id;
    case "group":
      return request?.mandatory_for_groups.includes(query.id) ?? false;
    case "faculty":
      // Bookings carry the requester's name (sometimes with an id suffix), not a faculty id.
      return requesterMatchesFaculty(request?.requester, {
        id: query.id,
        name: subjectName,
      });
  }
}

/**
 * `GET /api/timetable`: one group's, faculty member's or room's week from the active
 * timetable version. `week=spectra` applies the Week-7 session overrides and adds the bookings
 * that hold a room. With no active version, `cells` is empty and `version_id` is null.
 * Throws NOT_FOUND for an unknown id.
 */
export async function getTimetableView(
  db: Db,
  query: TimetableViewQuery,
): Promise<TimetableView> {
  const [subject, version] = await Promise.all([
    assertSubjectExists(db, query),
    getActiveTimetableVersion(db),
  ]);
  const versionId = version?.id ?? null;
  const spectra = query.week === "spectra";
  const [sessions, overrides, held] = await Promise.all([
    listSessions(db, { includeRemoved: true }),
    spectra
      ? listSessionOverrides(db, { timetable_version: versionId })
      : Promise.resolve([]),
    spectra ? listHeldBookings(db, versionId) : Promise.resolve([]),
  ]);

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
        ? { displaced_by: placement.displaced_by }
        : null,
    });
  }
  cells.sort(
    (a, b) => compareSlots(a, b) || a.session_id.localeCompare(b.session_id),
  );

  const bookings: TimetableBookingCell[] = held
    .filter(({ decision, request }) =>
      bookingMatches(query, subject.name, decision, request),
    )
    .map(({ decision, request }) => ({
      request_id: decision.request_id,
      title: request?.title || decision.request_id,
      room_id: decision.room_id,
      day: decision.day,
      start_period: decision.start_period,
      end_period: decision.end_period,
      status: decision.status,
      effective_category: decision.effective_category,
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
