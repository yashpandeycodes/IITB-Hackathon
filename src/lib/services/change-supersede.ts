import "server-only";
import type { Db } from "mongodb";
import type { ChangeRequest, ChangeStatus } from "@/lib/contracts";
import { COLLECTIONS } from "@/lib/db/collections";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import {
  listChangeRequestRefs,
  markChangeRequestRejected,
} from "@/lib/db/repos/change-requests";
import { nowIso } from "@/lib/db/repos/meta";
import { deleteDraftTimetableVersion } from "@/lib/db/repos/timetable-versions";

/**
 * Closing change requests (rejecting them and deleting their drafts). Kept apart from
 * `changes.ts` and imports only repositories, so `timetable.ts` can reject the proposals a newly
 * activated version made stale without an import cycle.
 */

/** How a request is closed: who acts, the audit action, who `decided_by` names, and why. */
export type ChangeClose = {
  actor: string;
  action: "reject" | "supersede";
  /** The deciding user, or `"system"` for automatic rejections (stale, superseded). */
  decided_by: string;
  comment: string | null;
};

/**
 * Rejects `cr` while it is still in `cr.status`, then deletes its draft timetable version and
 * writes one audit entry. Returns false when the request had already moved on (nothing done).
 * Once the status is written the request is closed: a failed draft deletion (the draft is pruned
 * later) or audit write is logged, never thrown.
 */
export async function rejectChangeRequest(
  db: Db,
  cr: Pick<ChangeRequest, "id" | "proposed_version"> & { status: ChangeStatus },
  close: ChangeClose,
): Promise<boolean> {
  const closed = await markChangeRequestRejected(db, cr.id, {
    expectStatus: cr.status,
    decided_by: close.decided_by,
    decided_at: nowIso(),
    comment: close.comment,
  });
  if (!closed) return false;
  if (cr.proposed_version) {
    await deleteDraftTimetableVersion(db, cr.proposed_version).catch(
      (err: unknown) =>
        console.warn(
          `[changes] ${cr.id} is rejected but its draft ${cr.proposed_version} could not be deleted`,
          err,
        ),
    );
  }
  await appendAuditLog(db, {
    actor: close.actor,
    action: close.action,
    entity: COLLECTIONS.change_requests,
    entity_id: cr.id,
    before: { status: cr.status },
    after: {
      status: "rejected",
      comment: close.comment,
      deleted_draft: cr.proposed_version,
    },
  }).catch((err: unknown) =>
    console.warn(`[changes] could not audit the rejection of ${cr.id}`, err),
  );
  return true;
}

/**
 * Rejects every `pending` change request built on another version than `activeVersion` (their
 * diffs were computed against a timetable that is no longer live), with `decided_by: "system"`,
 * audit action `supersede` and `comment`. Best-effort: a request that can't be closed is logged
 * and skipped, and nothing here throws, so it never fails the activation or approval that calls
 * it. Returns the ids it rejected, sorted.
 */
export async function supersedePendingChanges(
  db: Db,
  input: { activeVersion: string; actor: string; comment: string },
): Promise<string[]> {
  const superseded: string[] = [];
  try {
    const stale = await listChangeRequestRefs(db, {
      status: "pending",
      not_base_version: input.activeVersion,
    });
    for (const ref of stale) {
      try {
        const closed = await rejectChangeRequest(
          db,
          { ...ref, status: "pending" },
          {
            actor: input.actor,
            action: "supersede",
            decided_by: "system",
            comment: input.comment,
          },
        );
        if (closed) superseded.push(ref.id);
      } catch (err) {
        console.error(`[changes] could not supersede ${ref.id}`, err);
      }
    }
  } catch (err) {
    console.error(
      `[changes] could not list the proposals ${input.activeVersion} made stale`,
      err,
    );
  }
  return superseded.sort();
}

/** The comment on proposals a directly activated version made stale. */
export const staleComment = (activeVersion: string) =>
  `The timetable changed (${activeVersion} is active now); file it again.`;
