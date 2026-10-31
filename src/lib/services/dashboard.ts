import "server-only";
import type { Db } from "mongodb";
import { type Dashboard, type SessionUser } from "@/lib/contracts";
import {
  countBookingDecisionsByStatus,
  listDecidedRequestIds,
} from "@/lib/db/repos/booking-decisions";
import { countChangeRequestsByStatus } from "@/lib/db/repos/change-requests";
import { getDatasetMeta } from "@/lib/db/repos/datasets";
import { getActiveExamSchedule } from "@/lib/db/repos/exam-schedules";
import {
  LAB_DEPARTMENT,
  countBookingRequests,
  countBookingRequestsByState,
  countUndecidedBookingRequests,
  getFaculty,
  listBookingRequests,
  listExams,
  listRooms,
  listSessions,
  type RoomRecord,
} from "@/lib/db/repos/reference";
import { countSessionOverrides } from "@/lib/db/repos/session-overrides";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { getBundledDataset } from "@/lib/dataset";
import { storedSpectraSummary } from "./spectra";
import { requesterMatchesFaculty } from "./timetable-view";

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Rooms whose (derived lab) department is `department`. */
function departmentRoomIds(rooms: readonly RoomRecord[], department: string) {
  return new Set(
    rooms.filter((room) => room.department === department).map((r) => r.id),
  );
}

/** Lab room types owned by `department` (`lab_cs` for CSE, …). */
function departmentLabTypes(department: string): Set<string> {
  return new Set(
    Object.entries(LAB_DEPARTMENT)
      .filter(([, dept]) => dept === department)
      .map(([type]) => type),
  );
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const OPEN_STATES = ["submitted", "pending_approval"] as const;

/** Booking requests whose free-text requester names this user's club or faculty entry. */
function namesUser(
  requester: string,
  user: SessionUser,
  facultyName: string | null,
): boolean {
  return (
    sameText(requester, user.club) ||
    (user.faculty_id !== null &&
      requesterMatchesFaculty(requester, {
        id: user.faculty_id,
        name: facultyName,
      }))
  );
}

/**
 * Role-aware dashboard for `user`. Counts come from aggregate/count queries; the dataset's own
 * entities (rooms, sessions, exams) and the small sets of pending or own requests are read.
 * The booking score is the validator port's score of the stored decisions for the active
 * version ({@link storedSpectraSummary}: one export-dataset read plus a few ms of scoring),
 * null before Spectra has run for it. A failure there only blanks the score (logged), so the
 * landing page still renders.
 */
export async function getDashboard(
  db: Db,
  user: SessionUser,
): Promise<Dashboard> {
  const isAdmin = user.role === "admin";
  const coordinatorDept =
    user.role === "department_coordinator" ? user.department : null;
  const version = await getActiveTimetableVersion(db);
  const versionId = version?.id ?? null;
  const [
    meta,
    examSchedule,
    sessions,
    exams,
    rooms,
    requestStates,
    undecided,
    byStatus,
    overrides,
    adminPendingBookings,
    coordinatorPending,
    ownRequests,
    datasetRequests,
    pendingChanges,
    myChanges,
    faculty,
    spectra,
  ] = await Promise.all([
    getDatasetMeta(db),
    getActiveExamSchedule(db),
    listSessions(db),
    listExams(db),
    listRooms(db),
    countBookingRequestsByState(db),
    listDecidedRequestIds(db, { timetable_version: versionId }).then(
      (decided) => countUndecidedBookingRequests(db, decided),
    ),
    countBookingDecisionsByStatus(db, { timetable_version: versionId }),
    countSessionOverrides(db, { timetable_version: versionId }),
    isAdmin
      ? countBookingRequests(db, {
          state: "pending_approval",
          not_created_by: user.id,
        })
      : Promise.resolve(0),
    coordinatorDept
      ? listBookingRequests(db, {
          state: "pending_approval",
          not_created_by: user.id,
        })
      : Promise.resolve([]),
    listBookingRequests(db, { created_by: user.id, not_state: ["draft"] }),
    user.club || user.faculty_id
      ? listBookingRequests(db, { source: "dataset", not_state: ["draft"] })
      : Promise.resolve([]),
    isAdmin
      ? countChangeRequestsByStatus(db, { not_requested_by: user.id })
      : Promise.resolve(null),
    countChangeRequestsByStatus(db, { requested_by: user.id }),
    user.faculty_id ? getFaculty(db, user.faculty_id) : Promise.resolve(null),
    version
      ? storedSpectraSummary(db, version).catch((err: unknown) => {
          console.error("[dashboard] booking score unavailable", err);
          return null;
        })
      : Promise.resolve(null),
  ]);
  const { dataset_id, calendar } = meta ?? getBundledDataset();

  // ------------------------------------------------------------------- timetable coverage
  const sessionIds = new Set(sessions.map((s) => s.id));
  const assignments = version?.assignments ?? [];
  const scheduled = new Set(
    assignments.map((a) => a.session_id).filter((id) => sessionIds.has(id)),
  );

  const examIds = new Set(exams.map((e) => e.id));
  const examsScheduled = new Set(
    (examSchedule?.exams ?? [])
      .map((e) => e.exam_id)
      .filter((id) => examIds.has(id)),
  );

  // -------------------------------------------------------------------- pending approvals
  let pendingBookings = adminPendingBookings;
  if (coordinatorDept) {
    const deptRooms = departmentRoomIds(rooms, coordinatorDept);
    const deptLabTypes = departmentLabTypes(coordinatorDept);
    pendingBookings = coordinatorPending.filter(
      (r) =>
        (r.requested_room !== null && deptRooms.has(r.requested_room)) ||
        r.room_types.some((type) => deptLabTypes.has(type)),
    ).length;
  }
  const pendingChangeCount = pendingChanges?.pending ?? 0;

  // ---------------------------------------------------------------------------------- mine
  const mineRequests = [
    ...ownRequests,
    ...datasetRequests.filter(
      (r) =>
        r.created_by === null &&
        namesUser(r.requester, user, faculty?.name ?? null),
    ),
  ];
  const mySessions = user.faculty_id
    ? sessions.filter((s) => s.faculty_id === user.faculty_id)
    : null;

  // --------------------------------------------------------------------------- utilisation
  const days = calendar.days;
  const periods = calendar.periods.filter((p) => p.teaching).map((p) => p.id);
  const durationOf = new Map(sessions.map((s) => [s.id, s.duration]));
  const occupied = new Set<string>();
  for (const a of assignments) {
    const duration = durationOf.get(a.session_id);
    if (duration === undefined) continue;
    for (let p = a.start_period; p < a.start_period + duration; p++) {
      occupied.add(`${a.room_id}|${a.day}|${p}`);
    }
  }
  let busyTotal = 0;
  const roomRows = rooms.map((room) => {
    let roomBusy = 0;
    const busy = days.map((day) =>
      periods.map((p) => {
        const used = occupied.has(`${room.id}|${day}|${p}`) ? 1 : 0;
        roomBusy += used;
        return used;
      }),
    );
    busyTotal += roomBusy;
    const cells = days.length * periods.length;
    return {
      room_id: room.id,
      busy,
      fraction: cells ? round(roomBusy / cells) : 0,
    };
  });
  const allCells = rooms.length * days.length * periods.length;

  return {
    role: user.role,
    dataset_id,
    timetable: {
      version_id: version?.id ?? null,
      sessions_total: sessions.length,
      sessions_scheduled: scheduled.size,
      hard_violation_count: version?.hard_violation_count ?? null,
      soft_penalty: version?.soft_penalty ?? null,
    },
    exams: {
      schedule_id: examSchedule?.id ?? null,
      exams_total: exams.length,
      exams_scheduled: examsScheduled.size,
      penalty: examSchedule?.penalty ?? null,
    },
    bookings: {
      requests_total:
        requestStates.submitted +
        requestStates.pending_approval +
        requestStates.decided +
        requestStates.cancelled,
      cancelled: requestStates.cancelled,
      undecided,
      by_status: byStatus,
      session_overrides: overrides,
      booking_score: spectra?.booking_score ?? null,
      booking_score_max_if_all_approved:
        spectra?.booking_score_max_if_all_approved ?? null,
    },
    pending_approvals: {
      booking_requests: pendingBookings,
      change_requests: pendingChangeCount,
      total: pendingBookings + pendingChangeCount,
    },
    mine: {
      booking_requests: mineRequests.length,
      booking_requests_open: mineRequests.filter((r) =>
        (OPEN_STATES as readonly string[]).includes(r.state),
      ).length,
      change_requests: Object.values(myChanges).reduce((a, b) => a + b, 0),
      change_requests_pending: myChanges.pending + myChanges.proposing,
      sessions_total: mySessions?.length ?? null,
      sessions_scheduled: mySessions
        ? mySessions.filter((s) => scheduled.has(s.id)).length
        : null,
    },
    utilisation: {
      days,
      periods,
      rooms: roomRows,
      overall: allCells ? round(busyTotal / allCells) : 0,
    },
  };
}
