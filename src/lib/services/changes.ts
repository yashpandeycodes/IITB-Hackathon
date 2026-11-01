import "server-only";
import type { Db } from "mongodb";
import {
  ChangePreviewSchema,
  type Assignment,
  type ChangeDecisionRequest,
  type ChangeListQuery,
  type ChangePreview,
  type ChangeProposal,
  type ChangeProposalRequest,
  type ChangeRequest,
  type Dataset,
  type RescheduleStopReason,
  type SessionUser,
  type SolverStopReason,
  type TimetableVersion,
} from "@/lib/contracts";
import type { RescheduleResult } from "@/lib/engine";
import { COLLECTIONS } from "@/lib/db/collections";
import { withDatasetLock, type LockWaitOptions } from "@/lib/db/locks";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import { getBaseline } from "@/lib/db/repos/baselines";
import {
  countChangeRequests,
  deleteChangeRequest,
  getChangeRequest,
  insertChangeRequest,
  listChangeRequests,
  updateChangeRequest,
  type ChangeViewer,
} from "@/lib/db/repos/change-requests";
import {
  KEEP_INACTIVE_VERSIONS,
  deleteDraftTimetableVersion,
  getActiveTimetableVersion,
  insertTimetableVersion,
  pruneInactiveTimetableVersions,
} from "@/lib/db/repos/timetable-versions";
import { conflict, forbidden, internalError, notFound } from "@/lib/errors";
import { computeProposal, type ProposeOptions } from "./change-proposal";
import {
  assertKindShape,
  canProposeChanges,
  canRejectChange,
  canSeeChange,
} from "./change-scope";
import { rejectChangeRequest, type ChangeClose } from "./change-supersede";
import { getImportedDataset } from "./dataset";

/**
 * Change requests (architecture §5.3, §7.3, §8): a change file, an unavailability notice, a
 * faculty request or a manual placement becomes a proposal. The rescheduler (engine) computes
 * the fewest moves that fix the timetable (`computeProposal`, `change-proposal.ts`); the proposal
 * is stored as `pending` with a draft timetable version, or as `infeasible` with the conflicting
 * constraints. An admin approves it (`change-apply.ts`), or an admin or the requester rejects it.
 *
 * Writes take the dataset lock (waiting up to {@link LOCK_WAIT_MS}), so a proposal is always
 * built on the timetable and data that are current while it is stored. Who may file, see,
 * approve and reject what is decided in `change-scope.ts`.
 */

/** How long a change write waits for the dataset lock before answering `409 CONFLICT`. */
export const LOCK_WAIT_MS = 3_000;

export const CHANGE_LOCK: LockWaitOptions = {
  waitMs: LOCK_WAIT_MS,
  busyMessage:
    "Another timetable change, reset or schedule run is in progress; try again in a moment.",
};

/**
 * Most open change requests one user may have on the active timetable: `pending` ones plus
 * `infeasible` ones (so an infeasible filing can't be repeated without limit). Requests built on an
 * older timetable don't count; withdrawing one frees a place.
 */
export const PENDING_CHANGE_LIMIT = 20;

/** How many change requests `GET /api/changes` returns at most (newest first). */
export const CHANGE_LIST_LIMIT = 100;

/** Change request ids the routes accept (`CR-0001`); anything else is a `404`. */
export const CHANGE_ID = /^CR-\d{4,6}$/;

export const changeNotFound = () => notFound("No change request with that id.");

/** Change writes need an imported dataset: its records are what an approval changes. */
export async function requireImportedDataset(db: Db): Promise<Dataset> {
  const dataset = await getImportedDataset(db);
  if (!dataset) throw conflict("Load or reset the dataset first.");
  return dataset;
}

async function requireActiveVersion(db: Db): Promise<TimetableVersion> {
  const version = await getActiveTimetableVersion(db);
  if (!version) throw conflict("Generate a timetable first.");
  return version;
}

// ----------------------------------------------------------------------------- proposals

/** The baseline's sessions, or null before any change has been applied. */
async function baselineSessions(db: Db): Promise<Assignment[] | null> {
  return (await getBaseline(db))?.schedule.sessions ?? null;
}

/** `canProposeChanges` (403) and `assertKindShape` (400): checks that need no data. */
function assertCanFile(
  user: SessionUser,
  request: ChangeProposalRequest,
): void {
  if (!canProposeChanges(user)) {
    throw forbidden("Your role can't request timetable changes.");
  }
  assertKindShape(request);
}

const STOP_REASON: Record<RescheduleStopReason, SolverStopReason> = {
  complete: "converged",
  nodes: "iterations",
  time: "time",
};

/**
 * Files a change request (`POST /api/changes`) under the dataset lock and returns it: `pending`
 * with a draft timetable version when the rescheduler finds a fix, `infeasible` with the
 * conflicts otherwise. Errors: `403` (role, or something outside the requester's scope), `400
 * VALIDATION_ERROR` (the request doesn't fit its kind, unknown ids, nothing would change), `409
 * CONFLICT` (no dataset loaded, no active timetable, {@link PENDING_CHANGE_LIMIT} open requests on
 * the active timetable already, the lock stayed busy).
 */
export async function proposeChange(
  db: Db,
  user: SessionUser,
  request: ChangeProposalRequest,
  options: ProposeOptions = {},
): Promise<ChangeRequest> {
  assertCanFile(user, request);
  return withDatasetLock(
    db,
    async () => {
      const dataset = await requireImportedDataset(db);
      const base = await requireActiveVersion(db);
      const baseline = await baselineSessions(db);
      const pending = await countChangeRequests(db, {
        requested_by: user.id,
        status: ["pending", "infeasible"],
        base_version: base.id,
      });
      const { proposal, result } = computeProposal(
        user,
        { dataset, base, baseline },
        request,
        options,
        () => {
          if (pending >= PENDING_CHANGE_LIMIT) {
            throw conflict(
              `You already have ${pending} open change requests (pending or infeasible) on the current timetable; wait for a decision or withdraw one first.`,
              { limit: PENDING_CHANGE_LIMIT, pending },
            );
          }
        },
      );
      return storeProposal(db, user, request, base, proposal, result);
    },
    CHANGE_LOCK,
  );
}

async function storeProposal(
  db: Db,
  user: SessionUser,
  request: ChangeProposalRequest,
  base: TimetableVersion,
  proposal: ChangeProposal,
  result: RescheduleResult,
): Promise<ChangeRequest> {
  let cr = await insertChangeRequest(db, {
    kind: request.kind,
    requested_by: user.id,
    requested_by_role: user.role,
    changes: request.changes,
    placements: request.placements,
    description: request.description || null,
    nl_prompt: request.nl_prompt || null,
    base_version: base.id,
    proposed_version: null,
    status: proposal.feasible ? "pending" : "infeasible",
    ...proposal,
    approved_by: null,
    decided_by: null,
    decided_at: null,
    comment: null,
  });

  if (proposal.feasible && result.soft_after) {
    let draftId: string | null = null;
    try {
      const draft = await insertTimetableVersion(db, {
        dataset_id: base.dataset_id,
        status: "draft",
        source: request.kind === "manual_edit" ? "manual" : "reschedule",
        parent_version: base.id,
        change_request_id: cr.id,
        assignments: result.assignments,
        hard_violation_count: 0,
        soft_penalty: result.soft_after,
        solver_meta: {
          seed: 0,
          ms: Math.round(result.meta.ms),
          iterations: result.meta.nodes,
          algorithm: result.meta.algorithm,
          stopped_by: STOP_REASON[result.meta.stopped_by],
        },
        created_by: user.id,
      });
      draftId = draft.id;
      const updated = await updateChangeRequest(db, cr.id, {
        proposed_version: draft.id,
      });
      if (!updated) throw internalError();
      cr = updated;
    } catch (err) {
      // Never leave a pending request without its draft, or a draft without its request.
      if (draftId)
        await deleteDraftTimetableVersion(db, draftId).catch(logUndo);
      await deleteChangeRequest(db, cr.id).catch(logUndo);
      throw err;
    }
    await pruneInactiveTimetableVersions(db, KEEP_INACTIVE_VERSIONS);
  }

  await appendAuditLog(db, {
    actor: user.id,
    action: "propose",
    entity: COLLECTIONS.change_requests,
    entity_id: cr.id,
    after: {
      kind: cr.kind,
      status: cr.status,
      base_version: cr.base_version,
      proposed_version: cr.proposed_version,
      changes: cr.changes.length,
      placements: cr.placements.length,
      moved_count: cr.moved_count,
      conflicts: cr.conflicts.length,
    },
  });
  return cr;
}

const logUndo = (err: unknown) =>
  console.error("[changes] could not undo a partial proposal", err);

/**
 * `POST /api/changes/preview`: the same checks and rescheduler run as {@link proposeChange},
 * without the lock and without storing anything (the pending cap doesn't apply).
 */
export async function previewChange(
  db: Db,
  user: SessionUser,
  request: ChangeProposalRequest,
  options: ProposeOptions = {},
): Promise<ChangePreview> {
  assertCanFile(user, request);
  const dataset = await requireImportedDataset(db);
  const base = await requireActiveVersion(db);
  const { proposal } = computeProposal(
    user,
    { dataset, base, baseline: await baselineSessions(db) },
    request,
    options,
  );
  return ChangePreviewSchema.parse({ ...proposal, base_version: base.id });
}

// ------------------------------------------------------------------------- reading

/**
 * The Mongo side of `canSeeChange` (`change-scope.ts`): everything for an admin (undefined),
 * otherwise the user's own requests plus those whose scope names a coordinator's department or a
 * faculty member's id. Kept in step with `canSeeChange`, which still filters the result.
 */
function visibleTo(user: SessionUser): ChangeViewer | undefined {
  switch (user.role) {
    case "admin":
      return undefined;
    case "department_coordinator":
      return { requested_by: user.id, department: user.department };
    case "faculty":
      return { requested_by: user.id, faculty_id: user.faculty_id };
    default:
      return { requested_by: user.id };
  }
}

/**
 * `cr` as `user` may read it: the assistant message it came from (`nl_prompt`) is the
 * requester's own words, so only the requester and admins see it (null for anyone else).
 */
export function forViewer(user: SessionUser, cr: ChangeRequest): ChangeRequest {
  if (user.role === "admin" || cr.requested_by === user.id) return cr;
  return cr.nl_prompt === null ? cr : { ...cr, nl_prompt: null };
}

/**
 * `GET /api/changes`: newest first, at most {@link CHANGE_LIST_LIMIT}, only what `user` may see
 * (filtered in the query, then by `canSeeChange`). `scope=mine`: filed by the user; `pending`:
 * waiting for approval; `all` (default): everything visible. `status` narrows any scope.
 */
export async function listChanges(
  db: Db,
  user: SessionUser,
  query: ChangeListQuery,
): Promise<ChangeRequest[]> {
  if (query.scope === "pending" && query.status && query.status !== "pending") {
    return [];
  }
  const status =
    query.scope === "pending" ? ("pending" as const) : query.status;
  const viewer = visibleTo(user);
  const requests = await listChangeRequests(db, {
    ...(status !== undefined && { status }),
    ...(query.scope === "mine" && { requested_by: user.id }),
    ...(viewer !== undefined && { visible_to: viewer }),
    limit: CHANGE_LIST_LIMIT,
  });
  return requests
    .filter((cr) => canSeeChange(user, cr))
    .map((cr) => forViewer(user, cr));
}

/** `GET /api/changes/:id`: `404` for an unknown id or a request `user` may not see. */
export async function getChange(
  db: Db,
  user: SessionUser,
  id: string,
): Promise<ChangeRequest> {
  const cr = await getChangeRequest(db, id);
  if (!cr || !canSeeChange(user, cr)) throw changeNotFound();
  return forViewer(user, cr);
}

// ------------------------------------------------------------------------- rejection

/**
 * Rejects `cr` (still in its current status) and deletes its draft timetable version, with one
 * audit entry (`rejectChangeRequest`). `decided_by` is the user, or `"system"` for automatic
 * rejections (stale, superseded). Returns the updated request (null if it had already moved on).
 */
export async function closeChangeRequest(
  db: Db,
  cr: ChangeRequest,
  close: ChangeClose,
): Promise<ChangeRequest | null> {
  if (!(await rejectChangeRequest(db, cr, close))) return null;
  return getChangeRequest(db, cr.id);
}

/**
 * `POST /api/changes/:id/reject`: an admin rejects, or the requester withdraws (default comment
 * "Withdrawn by the requester"), a `pending` or `infeasible` request; its draft is deleted.
 * Errors: `404` (unknown or not visible), `403` (neither an admin nor the requester), `409
 * CONFLICT` (already decided, or the lock stayed busy).
 */
export async function rejectChange(
  db: Db,
  user: SessionUser,
  id: string,
  body: ChangeDecisionRequest,
): Promise<ChangeRequest> {
  return withDatasetLock(
    db,
    async () => {
      const cr = await getChangeRequest(db, id);
      if (!cr || !canSeeChange(user, cr)) throw changeNotFound();
      if (!canRejectChange(user, cr)) {
        throw forbidden(
          "Only an admin or the person who filed it can reject this change.",
        );
      }
      if (cr.status !== "pending" && cr.status !== "infeasible") {
        throw conflict(`${cr.id} is already ${cr.status}.`, {
          status: cr.status,
        });
      }
      const withdrawing = cr.requested_by === user.id;
      const updated = await closeChangeRequest(db, cr, {
        actor: user.id,
        action: "reject",
        decided_by: user.id,
        comment:
          body.comment || (withdrawing ? "Withdrawn by the requester" : null),
      });
      if (!updated) throw conflict(`${cr.id} was decided meanwhile.`);
      return updated;
    },
    CHANGE_LOCK,
  );
}
