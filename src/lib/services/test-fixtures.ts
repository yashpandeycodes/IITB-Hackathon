/**
 * Test-only fixtures: a tiny dataset plus an active timetable, Week-7 decisions and overrides,
 * small enough to reason about availability and views by hand.
 */
import type { Db } from "mongodb";
import type {
  SessionUser,
  SoftPenaltySummary,
  StoredBookingDecision,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { replaceBookingDecisions } from "@/lib/db/repos/booking-decisions";
import { replaceSessionOverrides } from "@/lib/db/repos/session-overrides";
import {
  activateTimetableVersion,
  insertTimetableVersion,
} from "@/lib/db/repos/timetable-versions";

export function tinyDataset() {
  const bundled = getBundledDataset();
  const request = {
    submitted_at: "2027-02-01T10:00:00+05:30",
    department: null,
    requested_room: null,
    mandatory_for_groups: [] as string[],
    series_id: null,
    needs: [] as string[],
  };
  return {
    dataset_id: "tiny-v1",
    institute: "Tiny Institute",
    calendar: bundled.calendar,
    priority_order: bundled.priority_order,
    role_category_cap: bundled.role_category_cap,
    rooms: [
      {
        id: "AUD",
        name: "Auditorium",
        building: "Admin",
        type: "auditorium",
        capacity: 500,
        features: ["stage", "pa_system"],
        accessible: true,
        allowed_uses: ["lecture", "event"],
      },
      {
        id: "LH-1",
        name: "Lecture Hall 1",
        building: "Academic",
        type: "lecture_hall",
        capacity: 120,
        features: ["projector"],
        accessible: true,
        allowed_uses: ["lecture", "tutorial", "event"],
      },
      {
        id: "CR-1",
        name: "Classroom 1",
        building: "Academic",
        type: "classroom",
        capacity: 60,
        features: [],
        accessible: false,
        allowed_uses: ["lecture", "tutorial"],
      },
      {
        id: "CS-LAB",
        name: "CS Lab",
        building: "CSE",
        type: "lab_cs",
        capacity: 40,
        features: ["computers"],
        accessible: true,
        allowed_uses: ["lab"],
      },
    ],
    room_unavailability: [
      { room_id: "CR-1", day: "THU", periods: [1, 2], reason: "Painting" },
    ],
    faculty: [
      { id: "F1", name: "Dr. One", department: "CSE" },
      { id: "F2", name: "Dr. Two", department: "ECE" },
    ],
    student_groups: [
      { id: "G1", name: "Group 1", year: 1, department: "CSE", size: 50 },
      { id: "G2", name: "Group 2", year: 1, department: "ECE", size: 50 },
    ],
    courses: [
      {
        id: "C1",
        title: "Course One",
        department: "CSE",
        year: 1,
        lecture_hours: 2,
        tutorial_hours: 0,
        lab_blocks: 1,
      },
    ],
    sessions: [
      {
        id: "C1-L1",
        course_id: "C1",
        kind: "lecture",
        groups: ["G1"],
        faculty_id: "F1",
        size: 50,
        duration: 1,
        room_types: ["classroom", "lecture_hall"],
      },
      {
        id: "C1-L2",
        course_id: "C1",
        kind: "lecture",
        groups: ["G1", "G2"],
        faculty_id: "F2",
        size: 100,
        duration: 1,
        room_types: ["lecture_hall"],
      },
      {
        id: "C1-P1",
        course_id: "C1",
        kind: "lab",
        groups: ["G1"],
        faculty_id: "F1",
        size: 40,
        duration: 2,
        room_types: ["lab_cs"],
      },
    ],
    booking_requests: [
      {
        ...request,
        id: "BR-01",
        requester: "Drama Club",
        role: "club",
        requested_category: "club_event",
        title: "Annual play",
        attendance: 300,
        duration_periods: 3,
        windows: [{ day: "THU", from_period: 10, to_period: 12 }],
        room_types: ["auditorium"],
        needs: ["stage"],
        requested_room: "AUD",
      },
      {
        ...request,
        id: "BR-02",
        // Faculty requests name the member with an id suffix (as BR-09 in the starter pack).
        requester: "Dr. O. One (F1)",
        role: "faculty",
        requested_category: "guest_lecture",
        title: "Guest talk",
        attendance: 100,
        duration_periods: 1,
        windows: [{ day: "THU", from_period: 3, to_period: 3 }],
        room_types: ["lecture_hall"],
        mandatory_for_groups: ["G1"],
      },
      {
        ...request,
        id: "BR-03",
        requester: "Robotics Club",
        role: "club",
        requested_category: "club_event",
        title: "Robot demo",
        attendance: 30,
        duration_periods: 1,
        windows: [{ day: "FRI", from_period: 10, to_period: 10 }],
        room_types: ["lab_cs"],
      },
    ],
    cancellations: [{ request_id: "BR-03", note: "Moved" }],
    exams: [
      {
        id: "EX1",
        course_ids: ["C1"],
        groups: ["G1"],
        size: 50,
        duration_hours: 2,
      },
    ],
  };
}

export const ZERO_SOFT: SoftPenaltySummary = {
  S1: 0,
  S2: 0,
  S3: 0,
  S4: 0,
  S5: 0,
  S6: 0,
  total: 0,
};

const decisionBase = {
  effective_category: "club_event",
  category_capped: false,
  auto: true,
  decided_by: "engine",
  approved_by: null,
  timetable_version: "TT-0001",
  decided_at: "2027-02-05T10:02:00+05:30",
} as const;

export const TINY_DECISIONS: StoredBookingDecision[] = [
  {
    ...decisionBase,
    request_id: "BR-01",
    status: "approved",
    day: "THU",
    start_period: 10,
    end_period: 12,
    room_id: "AUD",
    reason: "",
    reason_code: "APPROVED_AS_REQUESTED",
  },
  {
    ...decisionBase,
    request_id: "BR-02",
    status: "approved",
    day: "THU",
    start_period: 3,
    end_period: 3,
    room_id: "LH-1",
    reason: "",
    reason_code: "APPROVED_WITH_DISPLACEMENT",
    effective_category: "guest_lecture",
  },
  {
    ...decisionBase,
    request_id: "BR-03",
    status: "rejected",
    reason: "The request was cancelled.",
    reason_code: "REJ_CANCELLED",
  },
];

/**
 * Regular week: C1-L1 MON P1 CR-1, C1-P1 TUE P1–P2 CS-LAB, C1-L2 THU P3 LH-1.
 * Week 7: C1-L2 moves to THU P5 (LH-1) for BR-02; BR-01 holds AUD THU P10–P12.
 */
export async function seedTinyWorkingState(db: Db): Promise<string> {
  const version = await insertTimetableVersion(db, {
    dataset_id: "tiny-v1",
    status: "draft",
    source: "generate",
    parent_version: null,
    change_request_id: null,
    assignments: [
      { session_id: "C1-L1", day: "MON", start_period: 1, room_id: "CR-1" },
      { session_id: "C1-P1", day: "TUE", start_period: 1, room_id: "CS-LAB" },
      { session_id: "C1-L2", day: "THU", start_period: 3, room_id: "LH-1" },
    ],
    hard_violation_count: 0,
    soft_penalty: { ...ZERO_SOFT, S2: 4, total: 4 },
    solver_meta: { seed: 42, ms: 5, algorithm: "fixture" },
    created_by: "u_admin",
  });
  await activateTimetableVersion(db, version.id);
  await replaceBookingDecisions(
    db,
    TINY_DECISIONS.map((d) => ({ ...d, timetable_version: version.id })),
  );
  await replaceSessionOverrides(db, [
    {
      session_id: "C1-L2",
      day: "THU",
      start_period: 5,
      room_id: "LH-1",
      displaced_by: "BR-02",
      approved_by: "u_admin",
      timetable_version: version.id,
    },
  ]);
  return version.id;
}

export const USERS = {
  admin: {
    id: "u_admin",
    email: "admin@cit.demo",
    name: "Admin",
    role: "admin",
    department: null,
    faculty_id: null,
    club: null,
  },
  coordinator: {
    id: "u_coord_cse",
    email: "coord.cse@cit.demo",
    name: "CSE Coordinator",
    role: "department_coordinator",
    department: "CSE",
    faculty_id: null,
    club: null,
  },
  faculty: {
    id: "u_faculty",
    email: "faculty@cit.demo",
    name: "Dr. One",
    role: "faculty",
    department: "CSE",
    faculty_id: "F1",
    club: null,
  },
  club: {
    id: "u_club",
    email: "club@cit.demo",
    name: "Drama Club",
    role: "club",
    department: null,
    faculty_id: null,
    club: "Drama Club",
  },
} as const satisfies Record<string, SessionUser>;
