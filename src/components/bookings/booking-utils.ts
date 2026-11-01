/**
 * Shared, pure helpers for the booking screens: labels, slot formatting, the editable draft
 * state (form ⇄ API draft), client-side checks with friendly messages, and error text.
 */
import { CATEGORY_META } from "@/config/semantics";
import { ROLE_META } from "@/config/roles";
import { isApiClientError } from "@/lib/api-client";
import {
  BookingDraftSchema,
  DAYS,
  Feature,
  RoomType,
  type BookingApproval,
  type BookingDraft,
  type BookingView,
  type CalendarPeriod,
  type Category,
  type Day,
  type FallbackCode,
  type Need,
  type ParsedBookingDraft,
  type ReferenceRoom,
  type ReferenceStudentGroup,
  type SessionUser,
} from "@/lib/contracts";
import { DEFAULT_PERIODS, formatDay, formatPeriodRange } from "@/lib/format";

// ------------------------------------------------------------------------------------ labels

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  classroom: "Classroom",
  lecture_hall: "Lecture hall",
  auditorium: "Auditorium",
  seminar_hall: "Seminar hall",
  outdoor: "Outdoor (OAT)",
  lab_cs: "CS lab",
  lab_elec: "Electrical lab",
  lab_phy: "Physics lab",
  workshop: "Workshop",
  lab_civil: "Civil lab",
};

export const NEED_LABEL: Record<Need, string> = {
  projector: "Projector",
  ac: "AC",
  pa_system: "PA / mic",
  stage: "Stage",
  power_benches: "Power benches",
  computers: "Computers",
  accessible: "Wheelchair accessible",
};

export const NEED_OPTIONS: readonly Need[] = [...Feature.options, "accessible"];

export function categoryLabel(category: Category): string {
  return CATEGORY_META[category]?.label ?? category;
}

export function roleLabel(role: string): string {
  return ROLE_META[role as SessionUser["role"]]?.label ?? role;
}

export const FALLBACK_LABEL: Record<FallbackCode, string> = {
  timeout: "the AI took too long to answer",
  invalid_output: "the AI's answer failed validation",
  llm_error: "the AI service failed",
};

export const DRAFT_FIELD_LABEL: Record<string, string> = {
  title: "title",
  attendance: "attendance",
  duration_periods: "duration",
  windows: "time window",
  room_types: "room type",
};

// ------------------------------------------------------------------------------------- slots

function periodsOrDefault(
  periods: readonly CalendarPeriod[],
): readonly CalendarPeriod[] {
  return periods.length > 0 ? periods : DEFAULT_PERIODS;
}

/** `("THU", 10, 11)` → `"Thu P10–P11 (18:00–20:00)"`. */
export function slotLabel(
  day: Day,
  start: number,
  end: number,
  periods: readonly CalendarPeriod[] = DEFAULT_PERIODS,
): string {
  const range = start === end ? `P${start}` : `P${start}–P${end}`;
  return `${formatDay(day)} ${range} (${formatPeriodRange(start, end, periodsOrDefault(periods))})`;
}

/** Slot of a decision-like object, or null when it has none (a rejection). */
export function decisionSlot(
  decision: {
    day?: Day;
    start_period?: number;
    end_period?: number;
  },
  periods: readonly CalendarPeriod[] = DEFAULT_PERIODS,
): string | null {
  const { day, start_period, end_period } = decision;
  if (!day || start_period === undefined || end_period === undefined)
    return null;
  return slotLabel(day, start_period, end_period, periods);
}

/** `"P10 · 18:00"` for a period select. */
export function periodOptionLabel(
  period: CalendarPeriod,
  edge: "start" | "end",
): string {
  return `P${period.id} · ${edge === "start" ? period.start : period.end}`;
}

export function calendarPeriods(
  periods: readonly CalendarPeriod[],
): readonly CalendarPeriod[] {
  return periodsOrDefault(periods);
}

export function calendarDays(days: readonly Day[]): readonly Day[] {
  return days.length > 0 ? days : DAYS;
}

/** An ISO timestamp as "1 Nov 2026, 10:30 am" (local time). */
export function formatWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------------------------------------------------------------------------------- approval

/** Who still has to approve, in words; null when nobody does. */
export function approvalNeededText(approval: BookingApproval): string | null {
  if (!approval.needed) return null;
  if (approval.approver_role === "admin")
    return "Needs Admin approval (classes move for Week 7)";
  if (approval.approver_role === "department_coordinator")
    return `Needs ${approval.department ?? "the department"} coordinator approval (department lab)`;
  return "Needs approval";
}

export const OPEN_STATES = ["submitted", "pending_approval", "decided"];

/** Live, still-open requests can be cancelled by their requester or an admin. */
export function canCancel(view: BookingView, user: SessionUser): boolean {
  const { request } = view;
  if (request.source === "dataset") return false;
  if (!OPEN_STATES.includes(request.state)) return false;
  return user.role === "admin" || request.created_by === user.id;
}

// ------------------------------------------------------------------------------- draft state

export type DraftWindowForm = {
  day: Day;
  from_period: number;
  to_period: number;
};

/** The editable draft as the form holds it (attendance as typed, nulls while unset). */
export type DraftFormState = {
  title: string;
  attendance: string;
  duration_periods: number | null;
  windows: DraftWindowForm[];
  room_types: RoomType[];
  needs: Need[];
  requested_room: string | null;
  mandatory_for_groups: string[];
  repeat_days: Day[];
  assumptions: string[];
  follow_up: string | null;
};

export type DraftField = keyof DraftFormState;
export type FieldErrors = Partial<Record<string, string[]>>;

export function emptyDraft(
  prefill: {
    room?: ReferenceRoom | null;
    day?: Day | null;
    period?: number | null;
  } = {},
): DraftFormState {
  const roomType = prefill.room
    ? RoomType.safeParse(prefill.room.type)
    : undefined;
  return {
    title: "",
    attendance: "",
    duration_periods: 1,
    windows:
      prefill.day && prefill.period
        ? [
            {
              day: prefill.day,
              from_period: prefill.period,
              to_period: prefill.period,
            },
          ]
        : [{ day: "TUE", from_period: 10, to_period: 10 }],
    room_types: roomType?.success ? [roomType.data] : [],
    needs: [],
    requested_room: prefill.room?.id ?? null,
    mandatory_for_groups: [],
    repeat_days: [],
    assumptions: [],
    follow_up: null,
  };
}

export function draftFromParse(draft: ParsedBookingDraft): DraftFormState {
  return {
    title: draft.title ?? "",
    attendance: draft.attendance === null ? "" : String(draft.attendance),
    duration_periods: draft.duration_periods,
    windows: draft.windows.map((w) => ({ ...w })),
    room_types: [...draft.room_types],
    needs: [...draft.needs],
    requested_room: draft.requested_room,
    mandatory_for_groups: [...draft.mandatory_for_groups],
    repeat_days: [...draft.repeat_days],
    assumptions: [...draft.assumptions],
    follow_up: draft.follow_up,
  };
}

function windowLength(w: DraftWindowForm): number {
  return w.to_period - w.from_period + 1;
}

/**
 * Checks the form with friendly messages (the server checks the rest: rooms, groups, role
 * rules) and returns the API draft when it is complete.
 */
export function checkDraft(
  form: DraftFormState,
): { ok: true; draft: BookingDraft } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const add = (field: string, message: string) => {
    (errors[field] ??= []).push(message);
  };

  const title = form.title.trim();
  if (!title) add("title", "Give the event a title.");
  if (title.length > 200) add("title", "Keep the title under 200 characters.");

  const attendance = Number(form.attendance.trim());
  if (
    !form.attendance.trim() ||
    !Number.isInteger(attendance) ||
    attendance <= 0
  )
    add("attendance", "Enter how many people will attend (a whole number).");

  if (form.duration_periods === null)
    add("duration_periods", "Choose how many periods you need.");

  if (form.windows.length === 0)
    add("windows", "Add at least one time window.");
  if (form.windows.some((w) => w.to_period < w.from_period))
    add("windows", "A window can't end before it starts.");
  if (
    form.duration_periods !== null &&
    form.windows.length > 0 &&
    Math.max(...form.windows.map(windowLength)) < form.duration_periods
  )
    add(
      "duration_periods",
      `A ${form.duration_periods}-period booking doesn't fit in any window; widen a window or shorten the booking.`,
    );

  if (form.room_types.length === 0)
    add("room_types", "Pick at least one acceptable room type.");

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = BookingDraftSchema.safeParse({
    title,
    attendance,
    duration_periods: form.duration_periods,
    windows: form.windows,
    room_types: form.room_types,
    needs: form.needs,
    requested_room: form.requested_room,
    mandatory_for_groups: form.mandatory_for_groups,
    repeat_days: form.repeat_days.filter(
      (d) => !form.windows.some((w) => w.day === d),
    ),
    assumptions: form.assumptions.slice(0, 16).map((a) => a.slice(0, 300)),
    follow_up: form.follow_up ? form.follow_up.slice(0, 300) : null,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      add(String(issue.path[0] ?? "form"), issue.message);
    }
    return { ok: false, errors };
  }
  return { ok: true, draft: parsed.data };
}

/** Problems (`{ field, message }`) as field errors. */
export function problemsToErrors(
  problems: ReadonlyArray<{ field: string; message: string }>,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const { field, message } of problems) {
    const key = field.split(".")[0];
    (errors[key] ??= []).push(message);
  }
  return errors;
}

/** Groups this user may make an event compulsory for (the server enforces the same rule). */
export function allowedGroups(
  groups: readonly ReferenceStudentGroup[],
  user: Pick<SessionUser, "role" | "department">,
): ReferenceStudentGroup[] {
  if (user.role === "admin") return [...groups];
  if (user.role === "club" || !user.department) return [];
  return groups.filter((g) => g.department === user.department);
}

// ------------------------------------------------------------------------------------ errors

function detailsRecord(details: unknown): Record<string, unknown> | null {
  return typeof details === "object" &&
    details !== null &&
    !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : null;
}

/** A toast-ready sentence for any error the booking screens can hit. */
export function errorText(error: unknown, fallback: string): string {
  if (!isApiClientError(error)) return fallback;
  if (error.code === "RATE_LIMITED") {
    const seconds = detailsRecord(error.details)?.retry_after_seconds;
    return typeof seconds === "number" && seconds > 0
      ? `${error.message} Try again in ${seconds}s.`
      : `${error.message} Try again in a moment.`;
  }
  return error.message || fallback;
}

/** `fieldErrors` and `suggestion.requested_room` from a `400 VALIDATION_ERROR`. */
export function validationDetails(error: unknown): {
  fieldErrors: FieldErrors;
  roomSuggestion: string | null;
} | null {
  if (!isApiClientError(error) || error.code !== "VALIDATION_ERROR")
    return null;
  const details = detailsRecord(error.details);
  const rawFields = detailsRecord(details?.fieldErrors);
  const fieldErrors: FieldErrors = {};
  if (rawFields) {
    for (const [field, messages] of Object.entries(rawFields)) {
      if (Array.isArray(messages))
        fieldErrors[field] = messages.filter(
          (m): m is string => typeof m === "string",
        );
    }
  }
  const formErrors = details?.formErrors;
  if (Array.isArray(formErrors) && formErrors.length > 0)
    fieldErrors.form = formErrors.filter(
      (m): m is string => typeof m === "string",
    );
  const suggestion = detailsRecord(details?.suggestion)?.requested_room;
  return {
    fieldErrors,
    roomSuggestion: typeof suggestion === "string" ? suggestion : null,
  };
}
