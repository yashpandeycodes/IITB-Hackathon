/**
 * Reference data for the UI (`GET /api/reference`): the active dataset's calendar, rooms,
 * faculty, student groups, courses, sessions, exams and Spectra requests, projected to the fields
 * screens need for labels, pickers and filters. The schedule endpoints return ids only; this is
 * where the names come from. Dataset-origin requests only (live user requests come from the
 * bookings API in Phase 4).
 *
 * Every shape is picked from the dataset schemas (`./dataset`), so field types can't drift, and
 * made strict, so unknown keys from an uploaded file, free text (`raw_text`) and solver-only
 * fields (preferences, unavailability, fixed slots) never reach the API. Keys keep the dataset's
 * names (`student_groups`, as in `cit_public.json`).
 */
import { z } from "zod";

import {
  BookingRequestSchema,
  BookingWindowSchema,
  CalendarPeriodSchema,
  CalendarSchema,
  CourseSchema,
  ExamSchema,
  ExamWeekSchema,
  ExamWeekSessionSchema,
  FacultySchema,
  LunchSchema,
  RoomSchema,
  RoomUnavailabilitySchema,
  SessionSchema,
  StudentGroupSchema,
} from "./dataset";
import { Category } from "./enums";
import { Id } from "./util";

export const ReferenceCalendarSchema = z.strictObject({
  days: CalendarSchema.shape.days,
  periods: z.array(
    CalendarPeriodSchema.pick({
      id: true,
      start: true,
      end: true,
      teaching: true,
    }).strict(),
  ),
  lunch: LunchSchema.pick({
    after_period: true,
    start: true,
    end: true,
  }).strict(),
  lab_start_periods: CalendarSchema.shape.lab_start_periods,
  event_only_periods: CalendarSchema.shape.event_only_periods,
  /** Display label, e.g. "Week 7 (Spectra '27)"; null when the dataset has none. */
  fest_week: z.string().nullable(),
  exam_week: z.strictObject({
    days: ExamWeekSchema.shape.days,
    sessions: z.array(
      ExamWeekSessionSchema.pick({ id: true, start: true, end: true }).strict(),
    ),
  }),
});
export type ReferenceCalendar = z.infer<typeof ReferenceCalendarSchema>;

export const ReferenceRoomSchema = RoomSchema.pick({
  id: true,
  name: true,
  building: true,
  type: true,
  capacity: true,
  features: true,
  accessible: true,
  allowed_uses: true,
}).strict();
export type ReferenceRoom = z.infer<typeof ReferenceRoomSchema>;

/** A room closed for maintenance on `day` at `periods`. */
export const ReferenceRoomUnavailabilitySchema = RoomUnavailabilitySchema.pick({
  room_id: true,
  day: true,
  periods: true,
}).strict();
export type ReferenceRoomUnavailability = z.infer<
  typeof ReferenceRoomUnavailabilitySchema
>;

export const ReferenceFacultySchema = FacultySchema.pick({
  id: true,
  name: true,
  department: true,
}).strict();
export type ReferenceFaculty = z.infer<typeof ReferenceFacultySchema>;

export const ReferenceStudentGroupSchema = StudentGroupSchema.pick({
  id: true,
  name: true,
  year: true,
  department: true,
  size: true,
}).strict();
export type ReferenceStudentGroup = z.infer<typeof ReferenceStudentGroupSchema>;

export const ReferenceCourseSchema = CourseSchema.pick({
  id: true,
  title: true,
  department: true,
  year: true,
}).strict();
export type ReferenceCourse = z.infer<typeof ReferenceCourseSchema>;

export const ReferenceSessionSchema = SessionSchema.pick({
  id: true,
  course_id: true,
  kind: true,
  groups: true,
  faculty_id: true,
  size: true,
  duration: true,
  /** Sessions sharing a basket slot run at the same time in different rooms. */
  basket_slot: true,
}).strict();
export type ReferenceSession = z.infer<typeof ReferenceSessionSchema>;

export const ReferenceExamSchema = ExamSchema.pick({
  id: true,
  course_ids: true,
  groups: true,
  size: true,
  duration_hours: true,
}).strict();
export type ReferenceExam = z.infer<typeof ReferenceExamSchema>;

/** A Week-7 request as the Spectra board shows it (no free text). */
export const ReferenceBookingRequestSchema = BookingRequestSchema.pick({
  id: true,
  /** Breaks ties between requests of the same effective category (earlier wins). */
  submitted_at: true,
  title: true,
  requester: true,
  role: true,
  department: true,
  /** As claimed by the requester. */
  requested_category: true,
  attendance: true,
  duration_periods: true,
  room_types: true,
  needs: true,
  requested_room: true,
  mandatory_for_groups: true,
  series_id: true,
})
  .extend({
    windows: z.array(
      BookingWindowSchema.pick({
        day: true,
        from_period: true,
        to_period: true,
      }).strict(),
    ),
    /** After the role's cap; this is what priority uses. */
    effective_category: Category,
    /** True when the cap lowered the claim (`isCategoryCapped`): show a "category capped" badge. */
    category_capped: z.boolean(),
    cancelled: z.boolean(),
  })
  .strict();
export type ReferenceBookingRequest = z.infer<
  typeof ReferenceBookingRequestSchema
>;

/** `GET /api/reference` (`data`). Lists keep dataset order. */
export const ReferenceDataSchema = z.strictObject({
  dataset_id: Id,
  calendar: ReferenceCalendarSchema,
  rooms: z.array(ReferenceRoomSchema),
  room_unavailability: z.array(ReferenceRoomUnavailabilitySchema),
  faculty: z.array(ReferenceFacultySchema),
  student_groups: z.array(ReferenceStudentGroupSchema),
  courses: z.array(ReferenceCourseSchema),
  sessions: z.array(ReferenceSessionSchema),
  exams: z.array(ReferenceExamSchema),
  booking_requests: z.array(ReferenceBookingRequestSchema),
});
export type ReferenceData = z.infer<typeof ReferenceDataSchema>;
