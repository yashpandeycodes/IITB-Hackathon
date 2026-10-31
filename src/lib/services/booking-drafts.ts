import "server-only";
import {
  ROLE_LABEL,
  roleCategoryCap,
  type AiMeta,
  type BookingRequest,
  type CreateBookingRequest,
  type Dataset,
  type Day,
  type DraftWindow,
  type SessionUser,
} from "@/lib/contracts";
import { buildInstance, suggestRoom } from "@/lib/engine";
import type { NewBookingRequest } from "@/lib/db/repos/booking-requests";
import { nowIso } from "@/lib/db/repos/meta";

/**
 * Booking drafts against the active dataset, shared by `POST /api/bookings` (`bookings.ts`) and
 * the parse preview (`booking-parse.ts`), so a preview checks and decides exactly what a
 * submission would. Pure: no database access.
 */

/** Why a draft can't be submitted as it is (same fields and messages as the `400`). */
export type DraftProblem = { field: string; message: string };

export type DraftCheck = {
  problems: DraftProblem[];
  /** Corrections to offer: `requested_room` (the closest room id) when the room is unknown. */
  suggestion: Record<string, string>;
};

/**
 * The draft fields the checks read. A complete `BookingDraft` and a parsed (maybe incomplete)
 * draft both fit; a missing duration or window list skips the duration check.
 */
export type DraftFields = {
  duration_periods: number | null;
  windows: readonly Pick<DraftWindow, "day" | "from_period" | "to_period">[];
  requested_room: string | null;
  mandatory_for_groups: readonly string[];
  repeat_days: readonly Day[];
};

/** The draft content a request is built from (a complete draft). */
export type RequestFields = DraftFields &
  Pick<
    CreateBookingRequest,
    "title" | "attendance" | "room_types" | "needs"
  > & {
    duration_periods: number;
  };

const plural = (n: number, word: string) => `${word}${n === 1 ? "" : "s"}`;

const periods = (w: Pick<DraftWindow, "from_period" | "to_period">) =>
  w.to_period - w.from_period + 1;

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];

/**
 * Groups `user` may make an event compulsory for (architecture §8): an admin any group, faculty
 * and department coordinators only their own department's (none without a department), clubs
 * none. Returns the offending group ids with the message to show, or null when all are allowed.
 */
function compulsoryGroupProblem(
  dataset: Dataset,
  user: Pick<SessionUser, "role" | "department">,
  groups: readonly string[],
): string | null {
  if (groups.length === 0 || user.role === "admin") return null;
  if (user.role === "club") {
    return "Clubs can't make an event compulsory for student groups.";
  }
  const department = new Map(
    dataset.student_groups.map((g) => [g.id, g.department]),
  );
  const foreign = groups.filter(
    (id) => user.department === null || department.get(id) !== user.department,
  );
  if (foreign.length === 0) return null;
  const role = ROLE_LABEL[user.role];
  return user.department === null
    ? `A ${role} without a department can't make an event compulsory for student groups.`
    : `A ${role} can only make an event compulsory for ${user.department} groups (not ${foreign.join(", ")}).`;
}

/**
 * Checks a draft against the active dataset and the requester's role: unknown room (with the
 * closest room as a suggestion), unknown groups, compulsory groups the role may not name, days
 * off the calendar, and a duration longer than every window. Empty `problems` means a
 * submission would be accepted (as far as the draft goes).
 */
export function draftProblems(
  dataset: Dataset,
  user: Pick<SessionUser, "role" | "department">,
  draft: DraftFields,
): DraftCheck {
  const problems: DraftProblem[] = [];
  const suggestion: Record<string, string> = {};

  if (draft.requested_room !== null) {
    const known = dataset.rooms.some((r) => r.id === draft.requested_room);
    if (!known) {
      const closest = suggestRoom(buildInstance(dataset), draft.requested_room);
      if (closest) suggestion.requested_room = closest;
      problems.push({
        field: "requested_room",
        message: closest
          ? `No room has the id "${draft.requested_room}". Did you mean ${closest}?`
          : `No room has the id "${draft.requested_room}".`,
      });
    }
  }

  const groupIds = new Set(dataset.student_groups.map((g) => g.id));
  const groups = unique(draft.mandatory_for_groups);
  const unknownGroups = groups.filter((g) => !groupIds.has(g));
  if (unknownGroups.length > 0) {
    problems.push({
      field: "mandatory_for_groups",
      message: `Unknown ${plural(unknownGroups.length, "student group")}: ${unknownGroups.join(", ")}.`,
    });
  }
  const policy = compulsoryGroupProblem(
    dataset,
    user,
    groups.filter((g) => groupIds.has(g)),
  );
  if (policy) problems.push({ field: "mandatory_for_groups", message: policy });

  const days = new Set<string>(dataset.calendar.days);
  const offDays = unique(
    [...draft.windows.map((w) => w.day), ...draft.repeat_days].filter(
      (day) => !days.has(day),
    ),
  );
  if (offDays.length > 0) {
    problems.push({
      field: draft.windows.some((w) => !days.has(w.day))
        ? "windows"
        : "repeat_days",
      message: `${offDays.join(", ")} ${offDays.length === 1 ? "is" : "are"} not on the calendar (${dataset.calendar.days.join(", ")}).`,
    });
  }

  if (draft.duration_periods !== null && draft.windows.length > 0) {
    const longest = Math.max(...draft.windows.map(periods));
    if (longest < draft.duration_periods) {
      problems.push({
        field: "duration_periods",
        message: `A ${draft.duration_periods}-period booking doesn't fit in any window (the longest is ${longest} ${plural(longest, "period")}).`,
      });
    }
  }

  return { problems, suggestion };
}

/**
 * When a request filed now counts as submitted: now, but never before a request already in the
 * system. The dataset's requests carry fest-season dates (Jan–Feb 2027), later than the real
 * clock, and ties between requests of the same category go to the earlier submission; a request
 * made now must not jump ahead of ones that were already filed. The preview uses the same rule,
 * so it loses same-category ties exactly as a submission would.
 */
export function submissionTime(
  dataset: Pick<Dataset, "booking_requests">,
  now: number = Date.now(),
): string {
  let latest = Number.NEGATIVE_INFINITY;
  for (const request of dataset.booking_requests) {
    const at = Date.parse(request.submitted_at);
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  return nowIso(new Date(Math.max(now, latest + 1_000)));
}

/**
 * The `requester` stored on a user's requests and cancellations: the club's name, else the
 * user's name and role ("Asha Rao (Faculty)"). Self-registered club accounts have no club name.
 */
export function requesterLabel(
  user: Pick<SessionUser, "club" | "name" | "role">,
): string {
  return user.club ?? `${user.name} (${ROLE_LABEL[user.role]})`;
}

/** Windows without duplicates (same day and periods), in draft order. */
function dedupeWindows(
  windows: DraftFields["windows"],
): BookingRequest["windows"] {
  const seen = new Set<string>();
  const out: BookingRequest["windows"] = [];
  for (const { day, from_period, to_period } of windows) {
    const key = `${day}|${from_period}|${to_period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day, from_period, to_period });
  }
  return out;
}

/** The draft's windows moved to `day` (same periods), without duplicates. */
function windowsOn(
  windows: DraftFields["windows"],
  day: Day,
): BookingRequest["windows"] {
  return dedupeWindows(windows.map((w) => ({ ...w, day })));
}

/** Request fields shared by every day of a submission and by the preview. */
type RequestBase = Omit<BookingRequest, "id" | "submitted_at" | "series_id">;

function requestBase(
  dataset: Pick<Dataset, "role_category_cap">,
  user: Pick<SessionUser, "club" | "name" | "role" | "department">,
  draft: RequestFields,
): RequestBase {
  return {
    requester: requesterLabel(user),
    role: user.role,
    department: user.department,
    // Never above the role's cap, whatever the draft or the text claimed.
    requested_category: roleCategoryCap(dataset, user.role),
    title: draft.title,
    attendance: draft.attendance,
    duration_periods: draft.duration_periods,
    windows: dedupeWindows(draft.windows),
    room_types: unique(draft.room_types),
    needs: unique(draft.needs),
    requested_room: draft.requested_room,
    mandatory_for_groups: unique(draft.mandatory_for_groups),
  };
}

/**
 * The requests a draft becomes, without ids: one for the draft's own windows, plus one per
 * `repeat_days` day it doesn't already cover (same periods, moved to that day).
 */
export function draftRequests(
  dataset: Pick<Dataset, "role_category_cap">,
  user: Pick<SessionUser, "club" | "name" | "role" | "department">,
  draft: RequestFields,
): RequestBase[] {
  const base = requestBase(dataset, user, draft);
  const ownDays = new Set<string>(base.windows.map((w) => w.day));
  const extraDays = unique(draft.repeat_days).filter(
    (day) => !ownDays.has(day),
  );
  return [
    base,
    ...extraDays.map((day) => ({
      ...base,
      windows: windowsOn(draft.windows, day),
    })),
  ];
}

/** AI provenance of a submission: copied from the server-side parse log. */
export type Provenance = { ai_meta: AiMeta; raw_text: string };

/**
 * The live requests `POST /api/bookings` stores for `body` (a series when it repeats; ids and
 * `series_id` are assigned on insert).
 */
export function buildRequests(
  dataset: Pick<Dataset, "role_category_cap">,
  user: SessionUser,
  body: CreateBookingRequest,
  meta: { submitted_at: string; provenance: Provenance | null },
): NewBookingRequest[] {
  return draftRequests(dataset, user, body).map((request) => ({
    ...request,
    submitted_at: meta.submitted_at,
    state: "submitted",
    source: body.source,
    created_by: user.id,
    ...(meta.provenance ?? {}),
  }));
}
