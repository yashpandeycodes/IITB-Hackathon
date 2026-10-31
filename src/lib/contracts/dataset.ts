/**
 * Reference-data contracts. Mirrors `cit_public.json` field for field (snake_case, same values).
 *
 * Import tolerance: judges load their own dataset and change files, and a rejected file costs
 * marks. So these schemas accept whatever `validator.py` accepts:
 * - every entity is a loose object (unknown keys are accepted and preserved);
 * - vocabularies the validator only compares as strings (room types, features, needs, roles,
 *   requested categories) are plain strings here; the enums in `enums.ts` are for our own writes;
 * - fields the validator reads with a fallback (`x.get(key, default)`) or never reads get a default.
 * Ids, days, periods, session `kind`, `allowed_uses` and exam sessions stay strict.
 */
import { z } from "zod";

import {
  Category,
  Day,
  ExamDay,
  ExamSession,
  Period,
  RoomUse,
  SessionKind,
  TeachingPeriod,
} from "./enums";
import { ClockTime, Count, Id, type KnownFields } from "./util";

// ---------------------------------------------------------------------------------- calendar

export const CalendarPeriodSchema = z.looseObject({
  id: Period,
  start: ClockTime,
  end: ClockTime,
  teaching: z.boolean(),
});
export type CalendarPeriod = KnownFields<z.infer<typeof CalendarPeriodSchema>>;

export const LunchSchema = z.looseObject({
  /** Lunch sits between this period and the next; no session may span it. */
  after_period: TeachingPeriod,
  start: ClockTime,
  end: ClockTime,
});
export type Lunch = KnownFields<z.infer<typeof LunchSchema>>;

export const ExamWeekSessionSchema = z.looseObject({
  id: ExamSession,
  start: ClockTime,
  end: ClockTime,
});
export type ExamWeekSession = KnownFields<
  z.infer<typeof ExamWeekSessionSchema>
>;

export const ExamWeekSchema = z.looseObject({
  days: z.array(ExamDay).min(1),
  sessions: z.array(ExamWeekSessionSchema).min(1),
});
export type ExamWeek = KnownFields<z.infer<typeof ExamWeekSchema>>;

export const CalendarSchema = z.looseObject({
  days: z.array(Day).min(1),
  periods: z.array(CalendarPeriodSchema).min(1),
  lunch: LunchSchema,
  lab_start_periods: z.array(TeachingPeriod),
  event_only_periods: z.array(Period),
  /** Display label only, e.g. "Week 7 (Spectra '27)". */
  fest_week: z.string().optional(),
  exam_week: ExamWeekSchema,
});
export type Calendar = KnownFields<z.infer<typeof CalendarSchema>>;

// ------------------------------------------------------------------------------------- rooms

export const RoomSchema = z.looseObject({
  id: Id,
  name: z.string(),
  building: z.string(),
  /** Compared as a string by the validator; `RoomType` lists the known values. */
  type: z.string(),
  capacity: Count,
  /** Free-form so a new feature string doesn't block loading. */
  features: z.array(z.string()),
  accessible: z.boolean(),
  allowed_uses: z.array(RoomUse),
});
export type Room = KnownFields<z.infer<typeof RoomSchema>>;

export const RoomUnavailabilitySchema = z.looseObject({
  room_id: Id,
  day: Day,
  periods: z.array(Period),
  reason: z.string().optional(),
});
export type RoomUnavailability = KnownFields<
  z.infer<typeof RoomUnavailabilitySchema>
>;

// ----------------------------------------------------------------------------------- faculty

/** Hard: the faculty member cannot teach at these periods. */
export const FacultyUnavailabilitySchema = z.looseObject({
  day: Day,
  periods: z.array(Period),
  reason: z.string().optional(),
});
export type FacultyUnavailability = KnownFields<
  z.infer<typeof FacultyUnavailabilitySchema>
>;

/** Soft (S1): each taught hour inside an avoided day and period costs 2 points. */
export const AvoidPreferenceSchema = z.looseObject({
  type: z.literal("avoid"),
  /** Omitted means every calendar day. */
  days: z.array(Day).optional(),
  periods: z.array(Period),
  note: z.string().optional(),
});
export type AvoidPreference = KnownFields<
  z.infer<typeof AvoidPreferenceSchema>
>;

/** Any other preference. The validator ignores it, so it is kept but never scored. */
export const OtherPreferenceSchema = z.looseObject({
  type: z
    .string()
    .refine((type) => type !== "avoid", 'An "avoid" preference needs periods')
    .optional(),
});
export type OtherPreference = KnownFields<
  z.infer<typeof OtherPreferenceSchema>
>;

export const FacultyPreferenceSchema = z.union([
  AvoidPreferenceSchema,
  OtherPreferenceSchema,
]);
export type FacultyPreference = KnownFields<
  z.infer<typeof FacultyPreferenceSchema>
>;

/** Narrows a preference to the only kind that is scored (S1). */
export function isAvoidPreference(
  preference: FacultyPreference,
): preference is AvoidPreference {
  return preference.type === "avoid";
}

export const FacultySchema = z.looseObject({
  id: Id,
  name: z.string().default(""),
  department: z.string().default(""),
  max_hours_per_day: z.number().int().nonnegative().default(4),
  needs_accessible: z.boolean().default(false),
  unavailable: z.array(FacultyUnavailabilitySchema).default([]),
  preferences: z.array(FacultyPreferenceSchema).default([]),
});
export type Faculty = KnownFields<z.infer<typeof FacultySchema>>;

// ---------------------------------------------------------------------- groups and courses

export const StudentGroupSchema = z.looseObject({
  id: Id,
  name: z.string(),
  year: z.number().int().min(1),
  department: z.string(),
  size: Count,
  needs_accessible: z.boolean().default(false),
});
export type StudentGroup = KnownFields<z.infer<typeof StudentGroupSchema>>;

/** Reference information only; sessions are what gets scheduled. */
export const CourseSchema = z.looseObject({
  id: Id,
  title: z.string(),
  department: z.string(),
  year: z.number().int().min(1),
  lecture_hours: Count,
  tutorial_hours: Count,
  lab_blocks: Count,
});
export type Course = KnownFields<z.infer<typeof CourseSchema>>;

// ---------------------------------------------------------------------------------- sessions

export const FixedSlotSchema = z.looseObject({
  day: Day,
  start_period: TeachingPeriod,
});
export type FixedSlot = KnownFields<z.infer<typeof FixedSlotSchema>>;

export const SessionSchema = z.looseObject({
  id: Id,
  course_id: Id,
  kind: SessionKind,
  /** Every group that must attend. */
  groups: z.array(Id),
  faculty_id: Id,
  size: Count,
  /** Periods occupied from `start_period`; must not span lunch. */
  duration: z.number().int().min(1).max(9),
  /** Acceptable room types, compared as strings. */
  room_types: z.array(z.string()),
  needs_accessible: z.boolean().default(false),
  /** Sessions sharing a basket slot run at the same day and period, in different rooms. */
  basket_slot: z.string().nullable().default(null),
  /** When set, the session must be placed exactly here. */
  fixed_slot: FixedSlotSchema.nullable().default(null),
});
export type Session = KnownFields<z.infer<typeof SessionSchema>>;

// -------------------------------------------------------------------------- booking requests

/**
 * A window the requester can accept. Periods are not capped at 13: real requests ask past
 * 22:00 (BR-17 wants P13–P14). The engine rejects those; the importer must still load them.
 */
export const BookingWindowSchema = z.looseObject({
  day: Day,
  from_period: z.number().int().min(1),
  to_period: z.number().int().min(1),
});
export type BookingWindow = KnownFields<z.infer<typeof BookingWindowSchema>>;

export const BookingRequestSchema = z.looseObject({
  id: Id,
  /** ISO-8601 with offset; ties in priority go to the earlier value. */
  submitted_at: z.string().min(1),
  requester: z.string().default(""),
  /** Usually a `Role`. An unknown role is capped at `club_event` (see `effectiveCategory`). */
  role: z.string().min(1),
  department: z.string().nullable().default(null),
  /** As claimed; usually a `Category`. An unknown value ranks lowest. */
  requested_category: z.string().min(1),
  title: z.string().default(""),
  attendance: Count,
  duration_periods: z.number().int().min(1),
  windows: z.array(BookingWindowSchema),
  /** Acceptable room types, compared as strings. */
  room_types: z.array(z.string()),
  /** Room features, or "accessible". Free-form for import tolerance. */
  needs: z.array(z.string()),
  /** A wish; may be null and may name a room that doesn't exist. */
  requested_room: z.string().nullable().default(null),
  /** These groups must be free for the whole booking. */
  mandatory_for_groups: z.array(Id),
  series_id: z.string().nullable().default(null),
  /** Original plain-language message. */
  raw_text: z.string().optional(),
});
export type BookingRequest = KnownFields<z.infer<typeof BookingRequestSchema>>;

/** A request withdrawn after submission. Never approve it. */
export const CancellationSchema = z.looseObject({
  request_id: Id,
  cancelled_at: z.string().optional(),
  by: z.string().optional(),
  note: z.string().optional(),
});
export type Cancellation = KnownFields<z.infer<typeof CancellationSchema>>;

// ------------------------------------------------------------------------------------- exams

/** Rooms seat half their capacity during exams; an exam may use several rooms. */
export const ExamSchema = z.looseObject({
  id: Id,
  course_ids: z.array(Id),
  /**
   * Each group at most once: `validator.py` lists an exam once per listed group, so a repeated
   * group always reads as that group sitting two exams at once (H3), wherever it is placed.
   */
  groups: z
    .array(Id)
    .refine((groups) => new Set(groups).size === groups.length, {
      message: "lists a group more than once",
    }),
  size: Count,
  duration_hours: z.number().positive(),
});
export type Exam = KnownFields<z.infer<typeof ExamSchema>>;

// ----------------------------------------------------------------------------- whole dataset

/** Highest priority first, each category at most once. */
export const PriorityOrderSchema = z
  .array(Category)
  .min(1)
  .refine((order) => new Set(order).size === order.length, {
    message: "priority_order lists a category more than once",
  });

/** Highest category each role may claim. A role missing here is capped at `club_event`. */
export const RoleCategoryCapSchema = z.record(z.string(), Category);

const ID_COLLECTIONS = [
  "rooms",
  "faculty",
  "student_groups",
  "courses",
  "sessions",
  "booking_requests",
  "exams",
] as const;

export const DatasetSchema = z
  .looseObject({
    dataset_id: Id,
    institute: z.string().optional(),
    calendar: CalendarSchema,
    priority_order: PriorityOrderSchema,
    role_category_cap: RoleCategoryCapSchema,
    rooms: z.array(RoomSchema),
    room_unavailability: z.array(RoomUnavailabilitySchema).default([]),
    faculty: z.array(FacultySchema),
    student_groups: z.array(StudentGroupSchema),
    courses: z.array(CourseSchema).default([]),
    sessions: z.array(SessionSchema),
    booking_requests: z.array(BookingRequestSchema),
    cancellations: z.array(CancellationSchema).default([]),
    exams: z.array(ExamSchema).default([]),
  })
  .superRefine((data, ctx) => {
    // The validator looks every cap up in priority_order and fails if one is missing.
    for (const [role, cap] of Object.entries(data.role_category_cap)) {
      if (!data.priority_order.includes(cap)) {
        ctx.addIssue({
          code: "custom",
          path: ["role_category_cap", role],
          message: `${cap} is not in priority_order`,
        });
      }
    }
    // A role without a cap is capped at club_event, which the validator also looks up.
    if (!data.priority_order.includes("club_event")) {
      data.booking_requests.forEach((request, index) => {
        if (!Object.hasOwn(data.role_category_cap, request.role)) {
          ctx.addIssue({
            code: "custom",
            path: ["booking_requests", index, "role"],
            message: `Role "${request.role}" has no cap in role_category_cap, so it is capped at club_event, which is not in priority_order`,
          });
        }
      });
    }
    for (const key of ID_COLLECTIONS) {
      const items: ReadonlyArray<{ id: string }> = data[key];
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: "custom",
            path: [key, index, "id"],
            message: `Duplicate id "${item.id}" in ${key}`,
          });
        }
        seen.add(item.id);
      });
    }
    checkReferences(data, ctx);
  });
export type Dataset = KnownFields<z.infer<typeof DatasetSchema>>;

/**
 * Every id one entity uses must name an entity in the file: a dangling reference makes the
 * official validator crash on export. `requested_room` is only a wish and may be unknown;
 * `course_id` is checked only when the file lists courses (the validator never reads them).
 */
function checkReferences(
  data: {
    rooms: readonly { id: string }[];
    faculty: readonly { id: string }[];
    student_groups: readonly { id: string }[];
    courses: readonly { id: string }[];
    booking_requests: readonly {
      id: string;
      mandatory_for_groups: readonly string[];
    }[];
    sessions: readonly {
      course_id: string;
      faculty_id: string;
      groups: readonly string[];
    }[];
    exams: readonly { groups: readonly string[] }[];
    room_unavailability: readonly { room_id: string }[];
    cancellations: readonly { request_id: string }[];
  },
  ctx: z.RefinementCtx,
): void {
  const ids = (items: readonly { id: string }[]) =>
    new Set(items.map((item) => item.id));
  const rooms = ids(data.rooms);
  const faculty = ids(data.faculty);
  const groups = ids(data.student_groups);
  const courses = ids(data.courses);
  const requests = ids(data.booking_requests);

  const checkRef = (
    known: ReadonlySet<string>,
    value: string,
    path: (string | number)[],
    what: string,
  ) => {
    if (!known.has(value)) {
      ctx.addIssue({
        code: "custom",
        path,
        message: `Unknown ${what} "${value}"`,
      });
    }
  };
  const checkGroups = (list: readonly string[], path: (string | number)[]) =>
    list.forEach((group, j) =>
      checkRef(groups, group, [...path, j], "student group"),
    );

  data.sessions.forEach((session, i) => {
    checkRef(
      faculty,
      session.faculty_id,
      ["sessions", i, "faculty_id"],
      "faculty",
    );
    checkGroups(session.groups, ["sessions", i, "groups"]);
    if (courses.size > 0) {
      checkRef(
        courses,
        session.course_id,
        ["sessions", i, "course_id"],
        "course",
      );
    }
  });
  data.exams.forEach((exam, i) =>
    checkGroups(exam.groups, ["exams", i, "groups"]),
  );
  data.room_unavailability.forEach((entry, i) =>
    checkRef(
      rooms,
      entry.room_id,
      ["room_unavailability", i, "room_id"],
      "room",
    ),
  );
  data.booking_requests.forEach((request, i) =>
    checkGroups(request.mandatory_for_groups, [
      "booking_requests",
      i,
      "mandatory_for_groups",
    ]),
  );
  data.cancellations.forEach((cancellation, i) =>
    checkRef(
      requests,
      cancellation.request_id,
      ["cancellations", i, "request_id"],
      "booking request",
    ),
  );
}
