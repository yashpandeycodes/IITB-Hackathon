import "server-only";
import type { Db } from "mongodb";
import {
  ReferenceDataSchema,
  effectiveCategory,
  isCategoryCapped,
  type ReferenceData,
} from "@/lib/contracts";
import { getDatasetForExport } from "./dataset";

/**
 * Reference data for the UI (`GET /api/reference`): the names, sizes and options behind the
 * ids that the schedule endpoints return. Built on the dataset as the validator sees it
 * ({@link getDatasetForExport}): dataset-origin requests and their cancellations, soft-removed
 * sessions left out, and the bundled dataset when nothing has been imported. Every list keeps
 * dataset order and is projected to the contract's fields (no `raw_text`, cancellation notes,
 * unavailability reasons, solver-only fields or internal record fields).
 */
export async function getReferenceData(db: Db): Promise<ReferenceData> {
  const dataset = await getDatasetForExport(db);
  const { calendar } = dataset;
  const cancelled = new Set(dataset.cancellations.map((c) => c.request_id));

  // Parsed as a server-side contract check (strict objects: a missed projection fails loudly).
  return ReferenceDataSchema.parse({
    dataset_id: dataset.dataset_id,
    calendar: {
      days: calendar.days,
      periods: calendar.periods.map(({ id, start, end, teaching }) => ({
        id,
        start,
        end,
        teaching,
      })),
      lunch: {
        after_period: calendar.lunch.after_period,
        start: calendar.lunch.start,
        end: calendar.lunch.end,
      },
      lab_start_periods: calendar.lab_start_periods,
      event_only_periods: calendar.event_only_periods,
      fest_week: calendar.fest_week ?? null,
      exam_week: {
        days: calendar.exam_week.days,
        sessions: calendar.exam_week.sessions.map(({ id, start, end }) => ({
          id,
          start,
          end,
        })),
      },
    },
    rooms: dataset.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      building: room.building,
      type: room.type,
      capacity: room.capacity,
      features: room.features,
      accessible: room.accessible,
      allowed_uses: room.allowed_uses,
    })),
    room_unavailability: dataset.room_unavailability.map((entry) => ({
      room_id: entry.room_id,
      day: entry.day,
      periods: entry.periods,
    })),
    faculty: dataset.faculty.map((member) => ({
      id: member.id,
      name: member.name,
      department: member.department,
    })),
    student_groups: dataset.student_groups.map((group) => ({
      id: group.id,
      name: group.name,
      year: group.year,
      department: group.department,
      size: group.size,
    })),
    courses: dataset.courses.map((course) => ({
      id: course.id,
      title: course.title,
      department: course.department,
      year: course.year,
    })),
    sessions: dataset.sessions.map((session) => ({
      id: session.id,
      course_id: session.course_id,
      kind: session.kind,
      groups: session.groups,
      faculty_id: session.faculty_id,
      size: session.size,
      duration: session.duration,
      basket_slot: session.basket_slot,
    })),
    exams: dataset.exams.map((exam) => ({
      id: exam.id,
      course_ids: exam.course_ids,
      groups: exam.groups,
      size: exam.size,
      duration_hours: exam.duration_hours,
    })),
    booking_requests: dataset.booking_requests.map((request) => ({
      id: request.id,
      submitted_at: request.submitted_at,
      title: request.title,
      requester: request.requester,
      role: request.role,
      department: request.department,
      requested_category: request.requested_category,
      // The dataset's own rules (the validator's view), like the Spectra decisions.
      effective_category: effectiveCategory(dataset, request),
      category_capped: isCategoryCapped(dataset, request),
      attendance: request.attendance,
      duration_periods: request.duration_periods,
      windows: request.windows.map(({ day, from_period, to_period }) => ({
        day,
        from_period,
        to_period,
      })),
      room_types: request.room_types,
      needs: request.needs,
      requested_room: request.requested_room,
      mandatory_for_groups: request.mandatory_for_groups,
      series_id: request.series_id,
      cancelled: cancelled.has(request.id),
    })),
  });
}
