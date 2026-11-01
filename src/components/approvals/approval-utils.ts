/**
 * Labels and small formatters shared by the approvals inbox and the change detail page.
 * Display only: every value comes from the API contracts.
 */
import { ROLE_META } from "@/config/roles";
import { isApiClientError } from "@/lib/api-client";
import type {
  ChangeKind,
  ChangeRequest,
  MoveCause,
  MoveKind,
  Role,
  SlotRef,
} from "@/lib/contracts";
import { formatDay } from "@/lib/format";

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  disruption: "Change file",
  faculty_request: "Faculty request",
  manual_edit: "Manual edit",
  unavailability: "Unavailability",
};

export const MOVE_KIND_LABEL: Record<MoveKind, string> = {
  room_only: "Room only",
  time_only: "Time",
  time_and_room: "Time + room",
  added: "Added",
  removed: "Removed",
};

export const MOVE_CAUSE_LABEL: Record<MoveCause, string> = {
  broken: "Old slot breaks a rule",
  evicted: "Moved to make room",
  requested: "Requested placement",
  added: "New session",
  removed: "Session removed",
};

/** The validator's hard rules in plain words (docs/backend.md, H1–H14). */
export const HARD_RULE_LABEL: Record<string, string> = {
  H1: "every session scheduled once",
  H2: "teacher double-booked",
  H3: "student group double-booked",
  H4: "room double-booked",
  H5: "room too small",
  H6: "wrong room type",
  H7: "teacher unavailable",
  H8: "room closed",
  H9: "outside teaching hours / across lunch / lab start",
  H10: "needs an accessible room",
  H11: "elective basket must share a time",
  H12: "teacher over daily hours",
  H13: "booking not valid",
  H14: "fixed slot not kept",
};

export function ruleLabel(code: string): string | undefined {
  return HARD_RULE_LABEL[code];
}

export function roleLabel(role: Role | string): string {
  return ROLE_META[role as Role]?.label ?? role;
}

/** `{ day: "MON", start_period: 3, room_id: "CR-201" }` → "Mon P3 · CR-201". */
export function slotText(slot: SlotRef | null, duration = 1): string {
  if (!slot) return "—";
  const end = slot.start_period + Math.max(1, duration) - 1;
  const periods =
    end > slot.start_period
      ? `P${slot.start_period}–P${end}`
      : `P${slot.start_period}`;
  return `${formatDay(slot.day)} ${periods} · ${slot.room_id}`;
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "just now", "5 min ago", "3 h ago", "2 d ago"; the absolute time beyond a week. */
export function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "—";
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return ts;
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} d ago`;
  return formatDateTime(ts);
}

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Try again in a moment.",
): string {
  if (isApiClientError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Soft penalty of the base timetable, from the proposal's total and delta (null when infeasible). */
export function softBefore(change: ChangeRequest): number | null {
  if (!change.soft_penalty) return null;
  return change.soft_penalty.total - change.soft_delta;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Whether the server would refuse this user's approval as self-approval: an admin may approve
 * their own request only when it is a change file or manual edit they filed as admin.
 */
export function isSelfApproval(change: ChangeRequest, userId: string): boolean {
  if (change.requested_by !== userId) return false;
  return !(
    change.requested_by_role === "admin" &&
    (change.kind === "disruption" || change.kind === "manual_edit")
  );
}

/** Query keys every approval invalidates once the timetable or bookings changed. */
export const AFTER_CHANGE_KEYS = [
  ["changes"],
  ["dashboard"],
  ["timetable"],
  ["spectra"],
  ["bookings"],
  ["reference"],
  ["validate"],
  ["export"],
] as const;

export const AFTER_BOOKING_KEYS = [
  ["bookings"],
  ["dashboard"],
  ["spectra"],
  ["timetable"],
] as const;
