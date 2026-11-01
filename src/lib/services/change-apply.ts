import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import type {
  Assignment,
  ChangeApplyResult,
  ChangeDecisionRequest,
  ChangeRequest,
  Dataset,
  DisruptionChange,
  Session,
  SessionUser,
  TimetableVersion,
} from "@/lib/contracts";
import {
  DisruptionError,
  applyDisruption,
  buildInstance,
  checkTimetable,
} from "@/lib/engine";
import { COLLECTIONS } from "@/lib/db/collections";
import { withDatasetLock } from "@/lib/db/locks";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import { deleteBaseline } from "@/lib/db/repos/baselines";
import {
  getChangeRequest,
  updateChangeRequest,
} from "@/lib/db/repos/change-requests";
import { nowIso } from "@/lib/db/repos/meta";
import {
  deleteReferenceDocs,
  findReferenceDocs,
  insertReferenceDocs,
  markSessionsRemoved,
  maxReferenceSeq,
  restoreReferenceDocs,
  setFacultyUnavailable,
  type FacultyDoc,
  type RoomUnavailabilityDoc,
  type SessionDoc,
} from "@/lib/db/repos/reference";
import {
  activateTimetableVersion,
  getActiveTimetableVersion,
  getTimetableVersion,
} from "@/lib/db/repos/timetable-versions";
import {
  conflict,
  hardConstraint,
  internalError,
  staleVersion,
  validationError,
} from "@/lib/errors";
import { assertCanApproveChange, canSeeChange } from "./change-scope";
import {
  rejectChangeRequest,
  supersedePendingChanges,
} from "./change-supersede";
import { brokenPlacements } from "./change-proposal";
import { CHANGE_LOCK, changeNotFound, requireImportedDataset } from "./changes";
import { validateDataset } from "./dataset";
import { captureBaselineIfMissing } from "./export";
import { runSpectraUnlocked } from "./spectra";
import { activateTimetableUnlocked } from "./timetable";

/**
 * Approving a change request (architecture §7.3, §8): verify it again from scratch, capture the
 * baseline `schedule.json` (first applied change only; it must be exportable), write its changes
 * into the reference collections, activate its proposed timetable (which re-checks it against the
 * changed data and re-runs Spectra), mark it `applied`, and reject every other pending proposal
 * (they were built on the timetable it replaced). All under the dataset lock.
 *
 * Failure and recovery: Mongo here has no multi-collection transactions (standalone locally), so
 * the writes are undone by hand, and the approval ends either fully applied or fully rolled back.
 * {@link applyChangesToDataset} snapshots every document it is about to change and records every
 * document it inserts. `activateTimetableUnlocked` puts the previous version and its Spectra
 * decisions back itself when it fails. When anything in the apply step throws,
 * {@link recoverFailedApply} looks at which version is active:
 *
 * - the proposed version: the change is live (only a step after the switch failed), so the
 *   approval is finished instead (Spectra is re-run for it, since its own save failed);
 * - none: the previous version is activated again, then the dataset writes are undone;
 * - the previous version: the dataset writes are undone.
 *
 * When rolled back, the request stays `pending` and the baseline is removed again if this
 * approval captured it. Once the proposed version is live, the request is marked `applied` first;
 * the audit entries and the superseding of other proposals after that are best-effort. If even
 * marking it failed, approving it again finishes the record (its proposal is already active).
 */

/** How many violations a refused approval lists (the count is in the message). */
const MAX_REPORTED_VIOLATIONS = 50;

// ------------------------------------------------------------------ dataset writes and undo

/** What {@link applyChangesToDataset} wrote, so {@link undoDatasetChanges} can reverse it exactly. */
export type DatasetUndo = {
  /** Documents as they were before the writes (put back as they are). */
  snapshots: { faculty: FacultyDoc[]; sessions: SessionDoc[] };
  /** Documents the writes inserted (deleted on undo). */
  inserted: {
    faculty: string[];
    room_unavailability: string[];
    sessions: string[];
  };
};

const emptyUndo = (): DatasetUndo => ({
  snapshots: { faculty: [], sessions: [] },
  inserted: { faculty: [], room_unavailability: [], sessions: [] },
});

/**
 * Where each session of `applyDisruption(before, changes)` came from, position by position:
 * `added` is the `add_session` entry that put it there, null for a session kept from `before`.
 * (The validator removes by id, including sessions added earlier in the same list, and appends
 * added sessions at the end.)
 */
function sessionOrigins(
  before: Dataset,
  changes: readonly DisruptionChange[],
): { id: string; added: Session | null }[] {
  let list = before.sessions.map((s) => ({
    id: s.id,
    added: null as Session | null,
  }));
  for (const change of changes) {
    if (change.type === "add_session") {
      list.push({ id: change.session.id, added: change.session });
    } else if (change.type === "remove_session") {
      list = list.filter((entry) => entry.id !== change.session_id);
    }
  }
  return list;
}

/**
 * Writes `changes` into the reference collections, so that afterwards `getActiveDataset`
 * equals `applyDisruption(before, changes)` in content and order (`before` must be the stored
 * dataset as read now):
 *
 * - `faculty_unavailable`: the member's `unavailable` list is replaced by the changed one;
 * - `room_unavailable`: one `room_unavailability` document per (calendar) day, appended;
 * - `add_faculty` / `add_session`: appended documents (`origin: "disruption"`); an added
 *   session reusing the id of a soft-removed one replaces that document;
 * - `remove_session`: `removed: true` with `removed_by`.
 *
 * Added documents carry `change_request_id` and the next `seq`. A failed write undoes the ones
 * before it and rethrows. Returns what to pass to {@link undoDatasetChanges}.
 */
export async function applyChangesToDataset(
  db: Db,
  before: Dataset,
  changes: readonly DisruptionChange[],
  changeRequestId: string,
): Promise<DatasetUndo> {
  const after = applyDisruption(before, { changes });
  const at = nowIso();
  const meta = (id: string, seq: number) => ({
    _id: id,
    seq,
    origin: "disruption" as const,
    created_at: at,
    updated_at: at,
  });

  // Faculty: unavailability lists that changed, and members appended by add_faculty.
  const changedFaculty = before.faculty.flatMap((member, i) =>
    isDeepStrictEqual(member.unavailable, after.faculty[i].unavailable)
      ? []
      : [after.faculty[i]],
  );
  const addedFaculty = after.faculty.slice(before.faculty.length);
  const addedUnavailability = after.room_unavailability.slice(
    before.room_unavailability.length,
  );

  // Sessions: removed ones (kept from `before` no longer), added ones (in order).
  const origins = sessionOrigins(before, changes);
  if (origins.length !== after.sessions.length) {
    throw internalError(); // applyDisruption and the walk above disagree: a bug, never data.
  }
  const kept = new Set(origins.filter((o) => !o.added).map((o) => o.id));
  const removedIds = before.sessions
    .map((s) => s.id)
    .filter((id) => !kept.has(id));
  const addedSessions = after.sessions.filter((_, i) => origins[i].added);

  // Ids an insert would collide with (`validateChanges` reports these first; never write half).
  const [facultyClash, sessionDocs] = await Promise.all([
    findReferenceDocs(
      db,
      COLLECTIONS.faculty,
      addedFaculty.map((f) => f.id),
    ),
    findReferenceDocs(
      db,
      COLLECTIONS.sessions,
      addedSessions.map((s) => s.id),
    ),
  ]);
  const liveClash = sessionDocs.filter(
    (doc) => !doc.removed && kept.has(doc._id),
  );
  const repeated = (ids: readonly string[]) =>
    ids.filter((id, i) => ids.indexOf(id) !== i);
  const clashes = [
    ...facultyClash.map((doc) => `Faculty ${doc._id} already exists.`),
    ...repeated(addedFaculty.map((f) => f.id)).map(
      (id) => `Faculty ${id} is added twice.`,
    ),
    ...liveClash.map((doc) => `Session ${doc._id} already exists.`),
    ...repeated(addedSessions.map((s) => s.id)).map(
      (id) => `Session ${id} is added twice.`,
    ),
  ];
  if (clashes.length > 0) {
    throw validationError(
      "The changes add ids that already exist.",
      clashes.map((message) => ({ path: "changes", message })),
    );
  }
  const replaced = new Map(sessionDocs.map((doc) => [doc._id, doc]));

  const undo = emptyUndo();
  try {
    const [facultySnapshots, removedSnapshots] = await Promise.all([
      findReferenceDocs(
        db,
        COLLECTIONS.faculty,
        changedFaculty.map((f) => f.id),
      ),
      findReferenceDocs(db, COLLECTIONS.sessions, removedIds),
    ]);
    undo.snapshots.faculty = facultySnapshots;
    // A session removed and re-added keeps one snapshot: the document as it was before.
    undo.snapshots.sessions = [
      ...removedSnapshots,
      ...[...replaced.values()].filter((doc) => !removedIds.includes(doc._id)),
    ];

    for (const member of changedFaculty) {
      await setFacultyUnavailable(db, member.id, member.unavailable);
    }

    let seq = (await maxReferenceSeq(db, COLLECTIONS.faculty)) + 1;
    const facultyDocs: FacultyDoc[] = addedFaculty.map((member) => ({
      ...member,
      change_request_id: changeRequestId,
      ...meta(member.id, seq++),
    }));
    undo.inserted.faculty = facultyDocs.map((d) => d._id);
    await insertReferenceDocs(db, COLLECTIONS.faculty, facultyDocs);

    seq = (await maxReferenceSeq(db, COLLECTIONS.room_unavailability)) + 1;
    const unavailabilityDocs: RoomUnavailabilityDoc[] = addedUnavailability.map(
      (entry, n) => ({
        ...entry,
        change_request_id: changeRequestId,
        ...meta(
          `${changeRequestId}:${entry.room_id}:${entry.day}:${n + 1}`,
          seq++,
        ),
      }),
    );
    undo.inserted.room_unavailability = unavailabilityDocs.map((d) => d._id);
    await insertReferenceDocs(
      db,
      COLLECTIONS.room_unavailability,
      unavailabilityDocs,
    );

    await markSessionsRemoved(db, removedIds, changeRequestId);

    seq = (await maxReferenceSeq(db, COLLECTIONS.sessions)) + 1;
    const sessionWrites: SessionDoc[] = addedSessions.map((session) => {
      const previous = replaced.get(session.id);
      return {
        ...session,
        removed: false,
        change_request_id: changeRequestId,
        ...meta(session.id, seq++),
        ...(previous && { created_at: previous.created_at }),
      };
    });
    const fresh = sessionWrites.filter((doc) => !replaced.has(doc._id));
    undo.inserted.sessions = fresh.map((d) => d._id);
    await insertReferenceDocs(db, COLLECTIONS.sessions, fresh);
    await restoreReferenceDocs(
      db,
      COLLECTIONS.sessions,
      sessionWrites.filter((doc) => replaced.has(doc._id)),
    );
  } catch (err) {
    await undoDatasetChanges(db, undo).catch((undoErr: unknown) =>
      console.error("[changes] could not undo partial dataset writes", undoErr),
    );
    throw err;
  }
  return undo;
}

/** Reverses {@link applyChangesToDataset}: deletes what it inserted and puts the snapshots back. */
export async function undoDatasetChanges(
  db: Db,
  undo: DatasetUndo,
): Promise<void> {
  await deleteReferenceDocs(db, COLLECTIONS.sessions, undo.inserted.sessions);
  await deleteReferenceDocs(
    db,
    COLLECTIONS.room_unavailability,
    undo.inserted.room_unavailability,
  );
  await deleteReferenceDocs(db, COLLECTIONS.faculty, undo.inserted.faculty);
  await restoreReferenceDocs(db, COLLECTIONS.sessions, undo.snapshots.sessions);
  await restoreReferenceDocs(db, COLLECTIONS.faculty, undo.snapshots.faculty);
}

// ------------------------------------------------------------------------------- approval

const describePlacement = (p: Assignment) =>
  `${p.session_id} at ${p.day} P${p.start_period} in ${p.room_id}`;

/**
 * Admin: verify and apply change request `id` (see the module comment), then activate its
 * proposed version. Errors: `404` (unknown, or not visible to `user`), `403` (not an admin) /
 * `403 SELF_APPROVAL` (this admin's own request, unless it is a `disruption` or `manual_edit`
 * filed as an admin; see `assertCanApproveChange`), `409 CONFLICT` (not pending: an infeasible
 * request can only be rejected; no dataset loaded; the draft is gone; the first approval while
 * `schedule.json` isn't exportable, so the baseline would be incomplete (it stays pending); the
 * lock stayed busy), `409 STALE_VERSION` (another timetable became active since the proposal;
 * the request is rejected), `409 HARD_CONSTRAINT` (the proposal no longer holds against the
 * current data; it stays pending).
 */
export async function approveChange(
  db: Db,
  user: SessionUser,
  id: string,
  body: ChangeDecisionRequest,
): Promise<ChangeApplyResult> {
  return withDatasetLock(
    db,
    () => approveChangeUnlocked(db, user, id, body),
    CHANGE_LOCK,
  );
}

async function approveChangeUnlocked(
  db: Db,
  user: SessionUser,
  id: string,
  body: ChangeDecisionRequest,
): Promise<ChangeApplyResult> {
  const cr = await getChangeRequest(db, id);
  if (!cr || !canSeeChange(user, cr)) throw changeNotFound();
  assertCanApproveChange(user, cr);
  if (cr.status !== "pending") {
    throw conflict(
      cr.status === "infeasible"
        ? `${cr.id} has no valid fix, so it can't be approved; reject it or file a new change.`
        : `${cr.id} is ${cr.status}, not pending.`,
      { status: cr.status },
    );
  }
  const dataset = await requireImportedDataset(db);

  const active = await getActiveTimetableVersion(db);
  if (
    active &&
    active.id === cr.proposed_version &&
    active.change_request_id === cr.id
  ) {
    // An earlier approval made this proposal live but could not record it: finish the record.
    console.warn(
      `[changes] ${cr.id}: its proposal ${active.id} is already active; recording the approval`,
    );
    return recordApproval(db, user, cr, body, {
      version: active,
      previousVersion: cr.base_version,
      baselineCaptured: false,
    });
  }
  if (!active || active.id !== cr.base_version) {
    const message = active
      ? `The timetable changed since this proposal (${active.id} is active now); file it again.`
      : "No timetable is active any more; generate one and file this change again.";
    await rejectChangeRequest(db, cr, {
      actor: user.id,
      action: "reject",
      decided_by: "system",
      comment: message,
    });
    throw staleVersion(message, {
      base_version: cr.base_version,
      active_version: active?.id ?? null,
    });
  }

  const version = cr.proposed_version
    ? await getTimetableVersion(db, cr.proposed_version)
    : null;
  if (!version || version.change_request_id !== cr.id) {
    const message =
      "The proposed timetable for this change is no longer stored; file it again.";
    await rejectChangeRequest(db, cr, {
      actor: user.id,
      action: "reject",
      decided_by: "system",
      comment: message,
    });
    throw conflict(message);
  }

  // Re-verify from scratch: the stored data with the changes applied, the proposed timetable.
  let changed: Dataset;
  try {
    changed = applyDisruption(dataset, { changes: cr.changes });
  } catch (err) {
    if (!(err instanceof DisruptionError)) throw err;
    throw hardConstraint(
      `${cr.id} can no longer be applied to the current data: ${err.message}.`,
    );
  }
  validateDataset(changed); // the changed data must load like an imported file
  const { violations } = checkTimetable(
    buildInstance(changed),
    version.assignments,
  );
  const broken = brokenPlacements(cr.placements, version.assignments);
  if (violations.length > 0 || broken.length > 0) {
    const parts = [
      violations.length > 0 &&
        `breaks ${violations.length} hard rule${violations.length === 1 ? "" : "s"}`,
      broken.length > 0 &&
        `no longer places ${broken.map(describePlacement).join(", ")}`,
    ].filter(Boolean);
    throw hardConstraint(
      `The proposal for ${cr.id} ${parts.join(" and ")} against the current data; it stays pending.`,
      violations.slice(0, MAX_REPORTED_VIOLATIONS),
    );
  }

  // Refused (409, nothing written) unless schedule.json is exportable as it stands.
  const baselineCaptured = await captureBaselineIfMissing(db, {
    version_id: active.id,
    change_request_id: cr.id,
    actor: user.id,
  });
  let undo: DatasetUndo | undefined;
  try {
    undo = await applyChangesToDataset(db, dataset, cr.changes, cr.id);
    await activateTimetableUnlocked(db, version.id, user.id, {
      changeRequestId: cr.id,
    });
  } catch (err) {
    const outcome = await recoverFailedApply(db, {
      cr,
      version,
      previous: active,
      undo,
      baselineCaptured,
      actor: user.id,
      cause: err,
    });
    if (outcome === "rolled_back") throw err;
  }
  return recordApproval(db, user, cr, body, {
    version,
    previousVersion: active.id,
    baselineCaptured,
  });
}

/**
 * After the apply step of `cr` threw (see the module comment). When `version` is active the
 * change is live: Spectra is decided again for it (best-effort) and the result is `"applied"`,
 * for the caller to record. Otherwise everything is rolled back (the previous version activated
 * again if none is active, the dataset writes undone, a baseline this approval captured removed;
 * each best-effort and logged) and the result is `"rolled_back"`.
 */
async function recoverFailedApply(
  db: Db,
  input: {
    cr: ChangeRequest;
    version: TimetableVersion;
    previous: TimetableVersion;
    undo: DatasetUndo | undefined;
    baselineCaptured: boolean;
    actor: string;
    cause: unknown;
  },
): Promise<"applied" | "rolled_back"> {
  const { cr, version, previous } = input;
  const log = (what: string) => (err: unknown) =>
    console.error(`[changes] ${cr.id}: could not ${what}`, err);

  let current: TimetableVersion | null = null;
  let known = true;
  try {
    current = await getActiveTimetableVersion(db);
  } catch (err) {
    known = false;
    log("read the active version after a failed apply")(err);
  }
  if (current?.id === version.id) {
    console.error(
      `[changes] ${cr.id}: a step after activating ${version.id} failed; the change stays applied`,
      input.cause,
    );
    // The activation's own Spectra save failed (and was put back), so decide again for this version.
    await runSpectraUnlocked(db, { actor: input.actor }).catch(
      log(`re-run Spectra for ${version.id}; run it again by hand`),
    );
    return "applied";
  }
  if (!current || !known) {
    // Superseded but nothing activated (or unknown): the previous version goes back first.
    await activateTimetableVersion(db, previous.id).catch(
      log(`re-activate ${previous.id}`),
    );
  }
  if (input.undo) {
    await undoDatasetChanges(db, input.undo).catch(
      log("undo the dataset writes"),
    );
  }
  if (input.baselineCaptured) {
    await deleteBaseline(db).catch(log("remove the baseline"));
  }
  return "rolled_back";
}

/**
 * Records that `cr` is live on `context.version`: marks it `applied` (with its apply position)
 * first, then (best-effort, logged) the `approve` and `apply` audit entries and the rejection of
 * every other pending proposal ("Superseded by …"), so an applied change is never left `pending`
 * and the caller still gets its result.
 */
async function recordApproval(
  db: Db,
  user: SessionUser,
  cr: ChangeRequest,
  body: ChangeDecisionRequest,
  context: {
    version: TimetableVersion;
    previousVersion: string;
    baselineCaptured: boolean;
  },
): Promise<ChangeApplyResult> {
  const { version } = context;
  const comment = body.comment || null;
  const applied = await updateChangeRequest(
    db,
    cr.id,
    {
      status: "applied",
      approved_by: user.id,
      decided_by: user.id,
      decided_at: nowIso(),
      comment,
    },
    { expectStatus: "pending", markApplied: true },
  );
  if (!applied) {
    // Only possible if something wrote outside the lock; the timetable is already live.
    console.error(`[changes] ${cr.id} was applied but left its pending state`);
    throw internalError();
  }
  const audit = (entry: Parameters<typeof appendAuditLog>[1]) =>
    appendAuditLog(db, entry).catch((err: unknown) =>
      console.warn(
        `[changes] could not audit ${entry.action} of ${cr.id}`,
        err,
      ),
    );
  await audit({
    actor: user.id,
    action: "approve",
    entity: COLLECTIONS.change_requests,
    entity_id: cr.id,
    before: { status: "pending" },
    after: { status: "applied", comment },
  });
  await audit({
    actor: user.id,
    action: "apply",
    entity: COLLECTIONS.change_requests,
    entity_id: cr.id,
    before: { active_version: context.previousVersion },
    after: {
      active_version: version.id,
      changes: cr.changes.length,
      placements: cr.placements.length,
      moved_count: cr.moved_count,
      baseline_captured: context.baselineCaptured,
    },
  });
  const superseded = await supersedePendingChanges(db, {
    activeVersion: version.id,
    actor: user.id,
    comment: `Superseded by ${cr.id}`,
  });
  return { change: applied, version_id: version.id, superseded };
}
