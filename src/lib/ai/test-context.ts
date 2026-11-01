/**
 * Test helper: the parse context for the bundled dataset (as the service builds it, plus group
 * sizes), with fest-week Monday as the reference date.
 */
import type { Dataset } from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";

import type { AssistantContext, ParseContext } from "./types";

export const REFERENCE_DATE = "2027-02-08";

export function datasetContext(
  dataset: Dataset = getBundledDataset(),
  referenceDate = REFERENCE_DATE,
): ParseContext {
  return {
    datasetId: dataset.dataset_id,
    calendar: {
      days: dataset.calendar.days,
      periods: dataset.calendar.periods.map(({ id, start, end, teaching }) => ({
        id,
        start,
        end,
        teaching,
      })),
      lunch: {
        after_period: dataset.calendar.lunch.after_period,
        start: dataset.calendar.lunch.start,
        end: dataset.calendar.lunch.end,
      },
    },
    rooms: dataset.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      capacity: r.capacity,
      features: r.features,
      accessible: r.accessible,
      allowed_uses: r.allowed_uses,
    })),
    groups: dataset.student_groups.map((g) => ({
      id: g.id,
      name: g.name,
      year: g.year,
      department: g.department,
      size: g.size,
    })),
    referenceDate,
  };
}

/** The bundled dataset's demo users as the assistant sees them. */
export const ASSISTANT_USERS = {
  faculty: { role: "faculty", faculty_id: "F06", department: "CSE" },
  coordinator: {
    role: "department_coordinator",
    faculty_id: null,
    department: "CSE",
  },
  admin: { role: "admin", faculty_id: null, department: null },
} as const;

/**
 * The assistant context for the bundled dataset as the service builds it: every course, faculty
 * member and room, plus the asker's sessions (no placements: tests of the rule parser don't need
 * them), with fest-week Monday as the reference date.
 */
export function assistantContext(
  who: keyof typeof ASSISTANT_USERS = "faculty",
  dataset: Dataset = getBundledDataset(),
  referenceDate = REFERENCE_DATE,
): AssistantContext {
  const user = ASSISTANT_USERS[who];
  const base = datasetContext(dataset, referenceDate);
  const own = dataset.sessions.filter((s) =>
    user.role === "faculty"
      ? s.faculty_id === user.faculty_id
      : user.role === "department_coordinator"
        ? dataset.courses.find((c) => c.id === s.course_id)?.department ===
          user.department
        : true,
  );
  return {
    datasetId: dataset.dataset_id,
    calendar: base.calendar,
    referenceDate,
    role: user.role,
    selfFacultyId: user.faculty_id,
    courses: dataset.courses.map((c) => ({
      id: c.id,
      title: c.title,
      department: c.department,
    })),
    faculty: dataset.faculty.map((f) => ({
      id: f.id,
      name: f.name,
      department: f.department,
    })),
    rooms: dataset.rooms.map((r) => ({ id: r.id, name: r.name })),
    sessions: own.slice(0, 40).map((s) => ({
      id: s.id,
      course_id: s.course_id,
      kind: s.kind,
      day: null,
      start_period: null,
      room_id: null,
    })),
    sessionsOmitted: Math.max(0, own.length - 40),
  };
}
