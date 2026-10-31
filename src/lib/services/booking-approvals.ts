import "server-only";
import {
  BumpNoticeSchema,
  type BookingApproval,
  type BookingRequestRecord,
  type BumpNotice,
  type Dataset,
  type DecisionStatus,
  type SessionUser,
  type StoredBookingDecision,
} from "@/lib/contracts";
import { roomDepartment } from "@/lib/db/repos/reference";

/**
 * Booking approval policy (architecture §8), pure: who must approve a live request's decision,
 * whether a stored approval still covers it, who may approve, view, and what counts as a bump.
 * Shared by the bookings API (`bookings.ts`), the parse preview and Spectra runs (`spectra.ts`).
 *
 * - A live request whose decision moves classes needs an admin; one placed in a department lab
 *   needs that department's coordinator (an admin may also approve).
 * - An approval is tied to the exact slot it was given for, and to the approver's standing: a
 *   coordinator's approval never covers a decision that (now) moves classes.
 */

/** Who still has to approve a booking's current decision. */
export type ApprovalNeed = {
  approver_role: "admin" | "department_coordinator";
  /** The lab's department when a coordinator approves; null for an admin. */
  department: string | null;
};

export type SlotFields = Pick<
  StoredBookingDecision,
  "status" | "room_id" | "day" | "start_period" | "end_period"
>;

export type HeldSlot = SlotFields & {
  room_id: string;
  day: NonNullable<SlotFields["day"]>;
  start_period: number;
  end_period: number;
};

export const NO_APPROVAL: BookingApproval = {
  needed: false,
  approver_role: null,
  department: null,
};

/** True when the decision occupies a room (approved or alternative, with a full slot). */
export function holdsSlot(decision: SlotFields): decision is HeldSlot {
  return (
    decision.status !== "rejected" &&
    decision.room_id !== undefined &&
    decision.day !== undefined &&
    decision.start_period !== undefined &&
    decision.end_period !== undefined
  );
}

export function sameSlot(a: HeldSlot, b: HeldSlot): boolean {
  return (
    a.room_id === b.room_id &&
    a.day === b.day &&
    a.start_period === b.start_period &&
    a.end_period === b.end_period
  );
}

/** Room id → owning department (`lab_cs` → CSE, …; null for rooms no department owns). */
export function roomDepartments(
  rooms: Dataset["rooms"],
): Map<string, string | null> {
  return new Map(rooms.map((room) => [room.id, roomDepartment(room)]));
}

/**
 * The approver a live request's decision needs, or null: an admin when it moves classes, else
 * the department coordinator when it holds a department lab. Rejections need nobody.
 */
export function approvalNeed(
  decision:
    | (SlotFields & Pick<StoredBookingDecision, "requires_admin_approval">)
    | null
    | undefined,
  departments: ReadonlyMap<string, string | null>,
): ApprovalNeed | null {
  if (!decision || !holdsSlot(decision)) return null;
  if (decision.requires_admin_approval) {
    return { approver_role: "admin", department: null };
  }
  const department = departments.get(decision.room_id) ?? null;
  return department
    ? { approver_role: "department_coordinator", department }
    : null;
}

/**
 * True when `approval` was given for exactly the decision's slot and by someone whose standing
 * covers `need` (an admin's approval covers both kinds; a coordinator's never covers class
 * moves). With `need` null only the slot is compared.
 */
export function approvalMatches(
  approval: BookingRequestRecord["approval"],
  decision: SlotFields | null | undefined,
  need: ApprovalNeed | null,
): boolean {
  if (!approval || !decision || !holdsSlot(decision)) return false;
  const covers =
    need === null ||
    need.approver_role !== "admin" ||
    approval.approver_role === "admin";
  return (
    covers &&
    sameSlot(
      {
        status: decision.status,
        room_id: approval.room_id,
        day: approval.day,
        start_period: approval.start_period,
        end_period: approval.end_period,
      },
      decision,
    )
  );
}

/**
 * Who must still approve `record`'s current decision: only live requests waiting in
 * `pending_approval` whose decision needs an approver that hasn't accepted this exact slot.
 */
export function approvalOf(
  record: BookingRequestRecord,
  decision: StoredBookingDecision | undefined,
  departments: ReadonlyMap<string, string | null>,
): BookingApproval {
  if (record.source === "dataset" || record.state !== "pending_approval") {
    return NO_APPROVAL;
  }
  const need = approvalNeed(decision, departments);
  if (!need || approvalMatches(record.approval, decision, need)) {
    return NO_APPROVAL;
  }
  return { needed: true, ...need };
}

/** True when `user` may approve or reject a booking with this approval status. */
export function canApprove(
  user: SessionUser,
  approval: BookingApproval,
): boolean {
  if (!approval.needed) return false;
  if (user.role === "admin") return true;
  return (
    user.role === "department_coordinator" &&
    approval.approver_role === "department_coordinator" &&
    user.department !== null &&
    approval.department === user.department
  );
}

/** Owner, admin, an approver who may act on it now, or the approver who already did. */
export function canView(
  user: SessionUser,
  record: BookingRequestRecord,
  approval: BookingApproval,
): boolean {
  return (
    user.role === "admin" ||
    (record.created_by !== null && record.created_by === user.id) ||
    canApprove(user, approval) ||
    record.approval?.approved_by === user.id ||
    record.rejection?.rejected_by === user.id
  );
}

/** Stored text of an approver's rejection (`REJ_BY_APPROVER`). */
export function rejectionReason(label: string, comment: string): string {
  const text = comment.trim();
  if (!text) return `Rejected by ${label} with no comment.`;
  return `Rejected by ${label}: ${text}${/[.!?]$/.test(text) ? "" : "."}`;
}

// ------------------------------------------------------------------------------- bump diff

const STATUS_RANK: Record<DecisionStatus, number> = {
  approved: 0,
  alternative_offered: 1,
  rejected: 2,
};

/** Codes that are not a bump: the requester or an approver withdrew the booking. */
const NOT_A_BUMP = new Set(["REJ_CANCELLED", "REJ_BY_APPROVER"]);

function slotView(decision: SlotFields): BumpNotice["before"] {
  return {
    status: decision.status,
    ...(decision.room_id !== undefined && { room_id: decision.room_id }),
    ...(decision.day !== undefined && { day: decision.day }),
    ...(decision.start_period !== undefined && {
      start_period: decision.start_period,
    }),
    ...(decision.end_period !== undefined && {
      end_period: decision.end_period,
    }),
  };
}

/**
 * Earlier decisions that `next` made worse (approved → alternative or rejected, alternative →
 * rejected) or moved to another slot at the same status, for requests that already had a
 * decision in `previous`. A decision whose status improved (alternative → approved) is never a
 * bump, even if its slot moved. The requests in `by` (the new ones) are never listed;
 * cancellations and approver rejections are not bumps. Pure; in `next` order.
 */
export function bumpNotices(
  previous: readonly StoredBookingDecision[],
  next: readonly StoredBookingDecision[],
  by: readonly string[],
): BumpNotice[] {
  const newIds = new Set(by);
  const before = new Map(previous.map((d) => [d.request_id, d]));
  const notices: BumpNotice[] = [];
  for (const after of next) {
    const prior = before.get(after.request_id);
    if (!prior || newIds.has(after.request_id)) continue;
    if (NOT_A_BUMP.has(after.reason_code) || NOT_A_BUMP.has(prior.reason_code))
      continue;
    const rank = STATUS_RANK[after.status] - STATUS_RANK[prior.status];
    if (rank < 0) continue; // improved: not a bump, wherever it went
    const moved =
      holdsSlot(prior) && holdsSlot(after) && !sameSlot(prior, after);
    if (rank === 0 && !moved) continue;
    notices.push(
      BumpNoticeSchema.parse({
        request_id: after.request_id,
        before: slotView(prior),
        after: slotView(after),
        by: [...by],
      }),
    );
  }
  return notices;
}
