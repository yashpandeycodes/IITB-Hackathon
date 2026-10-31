import "server-only";
import type { Db } from "mongodb";
import {
  BookingDetailSchema,
  BookingViewSchema,
  CreateBookingResultSchema,
  ROLE_LABEL,
  SpectraDecisionViewSchema,
  type BookingApproval,
  type BookingDecideRequest,
  type BookingDetail,
  type BookingListQuery,
  type BookingRequestRecord,
  type BookingView,
  type CreateBookingRequest,
  type CreateBookingResult,
  type Dataset,
  type RequestState,
  type SessionUser,
  type StoredBookingDecision,
} from "@/lib/contracts";
import { assertNotSelf } from "@/lib/auth/policy";
import { COLLECTIONS } from "@/lib/db/collections";
import { withDatasetLock, type LockWaitOptions } from "@/lib/db/locks";
import { getAiLog } from "@/lib/db/repos/ai-logs";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import { listBookingDecisions } from "@/lib/db/repos/booking-decisions";
import {
  cancelRequest,
  deleteBookingRequests,
  deleteCancellation,
  insertBookingRequests,
  restoreRequest,
  setApproval,
  setRejection,
  type RequestSnapshot,
} from "@/lib/db/repos/booking-requests";
import { getDatasetId } from "@/lib/db/repos/datasets";
import { nowIso, omit } from "@/lib/db/repos/meta";
import {
  countBookingRequests,
  getBookingRequest,
  listBookingRequests,
  listRooms,
  type BookingRequestFilter,
} from "@/lib/db/repos/reference";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { findUserById } from "@/lib/db/repos/users";
import {
  ApiError,
  forbidden,
  isApiError,
  notFound,
  validationError,
} from "@/lib/errors";
import {
  approvalOf,
  bumpNotices,
  canApprove,
  canView,
  roomDepartments,
} from "./booking-approvals";
import {
  buildRequests,
  draftProblems,
  requesterLabel,
  submissionTime,
  type Provenance,
} from "./booking-drafts";
import { getImportedDataset } from "./dataset";
import { explainDecision } from "./explanations";
import {
  planSpectra,
  runSpectraUnlocked,
  saveSpectraUnlocked,
  spectraSummary,
  type SpectraPlan,
} from "./spectra";

/**
 * The bookings API (architecture §7.2, §8): users submit Week-7 venue requests, which the
 * Spectra engine decides together with the dataset's requests (`spectra.ts`); approvers accept
 * or reject the ones that need them; owners cancel. Every write takes the dataset lock (waiting
 * up to {@link LOCK_WAIT_MS} for a concurrent one), reads the dataset inside it, and re-runs
 * Spectra when a timetable is active, so the stored decisions always cover every request. Writes
 * answer `409 CONFLICT` until a dataset has been imported (or reset): the bundled fallback has no
 * stored requests, so live ones would never be decided.
 *
 * Visibility: a live request is seen by its owner, admins and the approvers who may act on it
 * (or did); to anyone else it doesn't exist (`404`, also for cancel and decide). Dataset requests
 * are public through `GET /api/spectra` and `GET /api/reference`; here only admins see them.
 * User ids of approvers are shown to admins only: on decisions (`decided_by`, `approved_by`, as
 * in `GET /api/spectra`) and on requests, where non-admins see the approver's role label instead
 * (`approval.approved_by`, `rejection.rejected_by`: "Admin", "CSE Department Coordinator").
 */

/** How long a booking write waits for the dataset lock before answering `409 CONFLICT`. */
export const LOCK_WAIT_MS = 3_000;

/**
 * Most open live requests one user may have at a time: `submitted`, `pending_approval` or
 * `decided` (approved, offered an alternative or rejected), until cancelled. Each day of a
 * series counts. Bounds what one account (the demo logins are public) can add to every run.
 */
export const OPEN_REQUEST_LIMIT = 20;

const OPEN_STATES: RequestState[] = [
  "submitted",
  "pending_approval",
  "decided",
];

/**
 * Request ids the routes accept: dataset ids (`BR-06`, or an uploaded file's own format) and live
 * ones (`REQ-0007`). Anything else can't exist, so it is a `404` without echoing the id.
 */
export const BOOKING_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

const LOCK: LockWaitOptions = {
  waitMs: LOCK_WAIT_MS,
  busyMessage:
    "Another change is being saved right now; try again in a moment.",
};

const conflict = (message: string, details?: unknown) =>
  new ApiError("CONFLICT", message, details);

const requestNotFound = () => notFound("No booking request with that id.");

/** Booking writes need an imported dataset (see the module comment). */
async function requireImportedDataset(db: Db): Promise<void> {
  if ((await getDatasetId(db)) === null) {
    throw conflict("Reset or import the dataset first.");
  }
}

// ---------------------------------------------------------------------------------- views

type ViewContext = {
  isAdmin: boolean;
  /** Decisions stored for the active timetable version, by request id. */
  decisions: ReadonlyMap<string, StoredBookingDecision>;
  departments: ReadonlyMap<string, string | null>;
};

/** Approver user id → role label ("Admin", "CSE Department Coordinator"), for non-admins. */
type ApproverLabels = ReadonlyMap<string, string>;

async function viewContext(db: Db, user: SessionUser): Promise<ViewContext> {
  const version = await getActiveTimetableVersion(db);
  const [decisions, rooms] = await Promise.all([
    version
      ? listBookingDecisions(db, { timetable_version: version.id })
      : Promise.resolve([]),
    listRooms(db),
  ]);
  return {
    isAdmin: user.role === "admin",
    decisions: new Map(decisions.map((d) => [d.request_id, d])),
    departments: roomDepartments(rooms),
  };
}

function roleLabel(user: {
  role: SessionUser["role"];
  department: string | null;
}): string {
  return user.role === "department_coordinator" && user.department
    ? `${user.department} ${ROLE_LABEL[user.role]}`
    : ROLE_LABEL[user.role];
}

/** Role labels of the approvers named on `records`; empty for admins (they see the ids). */
async function approverLabels(
  db: Db,
  ctx: ViewContext,
  records: readonly BookingRequestRecord[],
): Promise<ApproverLabels> {
  if (ctx.isAdmin) return new Map();
  const ids = [
    ...new Set(
      records.flatMap((r) => [
        ...(r.approval ? [r.approval.approved_by] : []),
        ...(r.rejection ? [r.rejection.rejected_by] : []),
      ]),
    ),
  ];
  const users = await Promise.all(ids.map((id) => findUserById(db, id)));
  return new Map(
    ids.flatMap((id, i) => {
      const found = users[i];
      return found ? [[id, roleLabel(found)] as const] : [];
    }),
  );
}

/**
 * `record` as a non-admin sees it: the approver's and rejecter's user ids replaced by their role
 * labels. An approver who no longer exists is labelled from the approval's standing (and the
 * lab's department); a rejecter as "Approver".
 */
function withApproverLabels(
  record: BookingRequestRecord,
  ctx: ViewContext,
  labels: ApproverLabels,
): BookingRequestRecord {
  const { approval, rejection } = record;
  if (!approval && !rejection) return record;
  return {
    ...record,
    ...(approval && {
      approval: {
        ...approval,
        approved_by:
          labels.get(approval.approved_by) ??
          roleLabel({
            role: approval.approver_role ?? "department_coordinator",
            department: ctx.departments.get(approval.room_id) ?? null,
          }),
      },
    }),
    ...(rejection && {
      rejection: {
        ...rejection,
        rejected_by: labels.get(rejection.rejected_by) ?? "Approver",
      },
    }),
  };
}

function decisionView(decision: StoredBookingDecision, isAdmin: boolean) {
  return SpectraDecisionViewSchema.parse(
    isAdmin ? decision : omit(decision, ["decided_by", "approved_by"]),
  );
}

function approvalFor(
  record: BookingRequestRecord,
  ctx: ViewContext,
): BookingApproval {
  return approvalOf(record, ctx.decisions.get(record.id), ctx.departments);
}

function toView(
  record: BookingRequestRecord,
  ctx: ViewContext,
  labels: ApproverLabels,
): BookingView {
  const decision = ctx.decisions.get(record.id);
  return BookingViewSchema.parse({
    request: ctx.isAdmin ? record : withApproverLabels(record, ctx, labels),
    decision: decision ? decisionView(decision, ctx.isAdmin) : null,
    approval: approvalFor(record, ctx),
  });
}

async function viewsOf(
  db: Db,
  user: SessionUser,
  ids: readonly string[],
): Promise<BookingView[]> {
  const [ctx, found] = await Promise.all([
    viewContext(db, user),
    Promise.all(ids.map((id) => getBookingRequest(db, id))),
  ]);
  const records = found.flatMap((record) => (record ? [record] : []));
  const labels = await approverLabels(db, ctx, records);
  return records.map((record) => toView(record, ctx, labels));
}

/**
 * The request `id` for a user acting on it, with the view context. `404` for an unknown id, a
 * draft, or a request the user may not see, before any role or state check, so the answer never
 * tells whether someone else's request exists or what state it is in.
 */
async function visibleRequest(
  db: Db,
  user: SessionUser,
  id: string,
): Promise<{
  record: BookingRequestRecord;
  ctx: ViewContext;
  approval: BookingApproval;
}> {
  const [record, ctx] = await Promise.all([
    getBookingRequest(db, id),
    viewContext(db, user),
  ]);
  if (!record || record.state === "draft") throw requestNotFound();
  const approval = approvalFor(record, ctx);
  if (!canView(user, record, approval)) throw requestNotFound();
  return { record, ctx, approval };
}

// -------------------------------------------------------------------------------- create

/**
 * Checks a draft against the active dataset and the user's role (`draftProblems`, shared with
 * the parse preview); `VALIDATION_ERROR` (400) with the same `{formErrors, fieldErrors}` shape as
 * schema errors, plus `suggestion.requested_room` (the closest room id) when the room is unknown.
 */
function validateDraft(
  dataset: Dataset,
  user: SessionUser,
  body: CreateBookingRequest,
): void {
  const { problems, suggestion } = draftProblems(dataset, user, body);
  if (problems.length === 0) return;
  const fieldErrors: Record<string, string[]> = {};
  for (const { field, message } of problems) {
    (fieldErrors[field] ??= []).push(message);
  }
  throw validationError("The booking request is invalid.", {
    formErrors: [],
    fieldErrors,
    ...(Object.keys(suggestion).length > 0 && { suggestion }),
  });
}

/**
 * Provenance from the parse that produced the draft, when the log exists and is the user's. All
 * of it comes from the server-side log (source, model, the processed draft's assumptions and
 * follow-up, the text); the body's own `assumptions` / `follow_up` are never copied.
 */
async function aiProvenance(
  db: Db,
  user: SessionUser,
  body: CreateBookingRequest,
): Promise<Provenance | null> {
  if (!body.ai_log_id) return null;
  const log = await getAiLog(db, body.ai_log_id);
  if (!log || log.user_id !== user.id || log.feature !== "parse_booking") {
    return null;
  }
  const source = log.source === "llm" ? "llm" : "rules";
  return {
    ai_meta: {
      source,
      model: source === "llm" ? (log.model ?? "rules") : "rules",
      prompt_id: log.prompt_id,
      assumptions: log.assumptions,
      follow_up: log.follow_up,
      log_id: log.id,
    },
    raw_text: log.input,
  };
}

/** `409` when `adding` more requests would take the user past {@link OPEN_REQUEST_LIMIT}. */
async function assertUnderOpenLimit(
  db: Db,
  user: SessionUser,
  adding: number,
): Promise<void> {
  // Only live requests have a `created_by`, so dataset requests never count.
  const open = await countBookingRequests(db, {
    state: OPEN_STATES,
    created_by: user.id,
  });
  if (open + adding <= OPEN_REQUEST_LIMIT) return;
  throw conflict(
    `You have ${open} open booking request${open === 1 ? "" : "s"}${adding > 1 ? ` and this series adds ${adding}` : ""}; at most ${OPEN_REQUEST_LIMIT} can be open at once. Cancel requests you no longer need first.`,
    { limit: OPEN_REQUEST_LIMIT, open },
  );
}

/**
 * `POST /api/bookings`: validates the draft against the active dataset, stores one request per
 * day (a series shares `series_id`), and, with an active timetable, re-decides every request so
 * the new ones get decisions; earlier decisions they made worse are returned as `bumped`.
 * Without an active timetable the requests stay `submitted` with no decision.
 *
 * `409 CONFLICT` when no dataset has been imported, when the user would have more than
 * {@link OPEN_REQUEST_LIMIT} open requests (details `{limit, open}`), and when the submission's
 * class moves would leave the official `schedule.json` inconsistent (only possible for institute
 * events; the submission is undone).
 */
export async function createBooking(
  db: Db,
  user: SessionUser,
  body: CreateBookingRequest,
): Promise<CreateBookingResult> {
  return withDatasetLock(
    db,
    async () => {
      // Everything is read under the lock, so the checks hold for what is stored.
      const dataset = await getImportedDataset(db);
      if (!dataset) throw conflict("Reset or import the dataset first.");
      validateDraft(dataset, user, body);
      const provenance = await aiProvenance(db, user, body);
      const drafts = buildRequests(dataset, user, body, {
        submitted_at: submissionTime(dataset),
        provenance,
      });
      await assertUnderOpenLimit(db, user, drafts.length);

      const version = await getActiveTimetableVersion(db);
      const previous = version
        ? await listBookingDecisions(db, { timetable_version: version.id })
        : [];

      const inserted = await insertBookingRequests(db, drafts);
      const ids = inserted.map((r) => r.id);
      let plan: SpectraPlan | null = null;
      if (version) {
        try {
          // planSpectra keeps the official export consistent (it switches off class moves of
          // live requests that would break it) and never returns a plan that breaks it.
          plan = await planSpectra(db, version, user.id, {
            carryApprovals: user.role !== "admin",
          });
          await saveSpectraUnlocked(db, plan, user.id);
        } catch (err) {
          await deleteBookingRequests(db, ids);
          throw err;
        }
      }

      const bumpedAll = plan ? bumpNotices(previous, plan.decisions, ids) : [];
      await appendAuditLog(db, {
        actor: user.id,
        action: "booking_submit",
        entity: COLLECTIONS.booking_requests,
        entity_id: ids[0],
        after: {
          request_ids: ids,
          series_id: inserted[0].series_id ?? null,
          source: body.source,
          bumped: bumpedAll.map((b) => b.request_id),
        },
      });

      // Other users' live requests stay private: non-admins only see bumps of dataset requests
      // and their own (the audit log has the full list).
      const bumped =
        user.role === "admin"
          ? bumpedAll
          : (
              await Promise.all(
                bumpedAll.map(async (notice) => {
                  const r = await getBookingRequest(db, notice.request_id);
                  const shown =
                    r !== null &&
                    (r.source === "dataset" || r.created_by === user.id);
                  return shown ? [notice] : [];
                }),
              )
            ).flat();
      return CreateBookingResultSchema.parse({
        bookings: await viewsOf(db, user, ids),
        bumped,
        spectra: plan ? spectraSummary(plan) : null,
      });
    },
    LOCK,
  );
}

// ---------------------------------------------------------------------------------- read

/**
 * `GET /api/bookings`. `mine`: the user's own requests. `all`: every request (admin only,
 * `403` otherwise). `approvals`: requests waiting in `pending_approval` that this user may
 * approve, never their own (admin: all of them; coordinator: their department's labs; other
 * roles: none). Requests are in submission order (dataset requests first).
 */
export async function listBookings(
  db: Db,
  user: SessionUser,
  query: BookingListQuery,
): Promise<BookingView[]> {
  const stateFilter: BookingRequestFilter = query.state
    ? { state: query.state }
    : { not_state: ["draft"] };
  let records: BookingRequestRecord[];
  switch (query.scope) {
    case "mine":
      records = await listBookingRequests(db, {
        ...stateFilter,
        created_by: user.id,
      });
      break;
    case "all":
      if (user.role !== "admin") {
        throw forbidden("Only an admin can list every booking request.");
      }
      records = await listBookingRequests(db, stateFilter);
      break;
    case "approvals":
      if (
        (query.state && query.state !== "pending_approval") ||
        (user.role !== "admin" && user.role !== "department_coordinator")
      ) {
        return [];
      }
      records = await listBookingRequests(db, {
        state: "pending_approval",
        not_created_by: user.id,
      });
      break;
  }
  const ctx = await viewContext(db, user);
  if (query.scope === "approvals") {
    records = records.filter((r) => canApprove(user, approvalFor(r, ctx)));
  }
  const labels = await approverLabels(db, ctx, records);
  return records.map((record) => toView(record, ctx, labels));
}

/**
 * `GET /api/bookings/:id`: the request, its decision for the active timetable, approval status
 * and an explanation (`explanations.ts`). `404` unless the user may see it (owner, admin, an
 * approver who may act on it now, or the approver who did).
 */
export async function getBookingDetail(
  db: Db,
  user: SessionUser,
  id: string,
): Promise<BookingDetail> {
  const { record, ctx } = await visibleRequest(db, user, id);
  const labels = await approverLabels(db, ctx, [record]);
  const decision = ctx.decisions.get(record.id);
  return BookingDetailSchema.parse({
    ...toView(record, ctx, labels),
    explanation: decision ? await explainDecision(db, user, decision) : null,
  });
}

// --------------------------------------------------------------------------------- writes

/** Re-decides everything after a change, if a timetable is active. Call inside the lock. */
async function rerunSpectraUnlocked(db: Db, user: SessionUser): Promise<void> {
  if (!(await getActiveTimetableVersion(db))) return;
  await runSpectraUnlocked(db, {
    actor: user.id,
    carryApprovals: user.role !== "admin",
  });
}

function snapshotOf(record: BookingRequestRecord): RequestSnapshot {
  return {
    state: record.state,
    approval: record.approval,
    rejection: record.rejection,
  };
}

/** The error code an undone write is audited with (never internal details). */
const failureCode = (err: unknown) =>
  isApiError(err) ? err.code : "INTERNAL_ERROR";

/**
 * Applies `write`, then re-runs Spectra. When the run fails the write is undone (`undo`), the
 * audit entry records the failed outcome, and the run's error is rethrown; otherwise the entry
 * records `after`.
 */
async function writeAndRerun(
  db: Db,
  user: SessionUser,
  audit: {
    action: string;
    entity_id: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
  write: () => Promise<void>,
  undo: () => Promise<void>,
): Promise<void> {
  await write();
  let failure: unknown = undefined;
  let failed = false;
  try {
    await rerunSpectraUnlocked(db, user);
  } catch (err) {
    failed = true;
    failure = err;
    try {
      await undo();
    } catch (undoErr) {
      console.error(
        `[bookings] could not undo ${audit.action} on ${audit.entity_id}`,
        undoErr,
      );
    }
  }
  const entry = {
    actor: user.id,
    action: audit.action,
    entity: COLLECTIONS.booking_requests,
    entity_id: audit.entity_id,
    before: audit.before,
    after: failed
      ? { outcome: "undone", error: failureCode(failure) }
      : audit.after,
  };
  if (!failed) {
    await appendAuditLog(db, entry);
    return;
  }
  await appendAuditLog(db, entry).catch((err: unknown) => {
    console.error("[bookings] could not audit an undone write", err);
  });
  throw failure;
}

/**
 * `POST /api/bookings/:id/cancel` (owner or admin): cancels the request (dropping any approval)
 * and re-decides everything, since the freed slot may help others. Cancelling twice is a no-op
 * that returns the current view. Order of checks: `409` before any dataset import; `404` unless
 * the user may see the request; `403` unless owner or admin; `409` for a request from the
 * imported dataset (the official validator only knows the file's cancellations). When the
 * re-run fails the cancellation is undone and the error returned.
 */
export async function cancelBooking(
  db: Db,
  user: SessionUser,
  id: string,
): Promise<BookingView> {
  return withDatasetLock(
    db,
    async () => {
      await requireImportedDataset(db);
      const { record } = await visibleRequest(db, user, id);
      const isOwner =
        record.created_by !== null && record.created_by === user.id;
      if (!isOwner && user.role !== "admin") {
        throw forbidden("Only the requester or an admin can cancel a booking.");
      }
      if (record.source === "dataset") {
        throw conflict(
          "This request comes from the imported dataset; change the dataset to cancel it.",
        );
      }
      if (record.state !== "cancelled") {
        const before = snapshotOf(record);
        await writeAndRerun(
          db,
          user,
          {
            action: "booking_cancel",
            entity_id: id,
            before: { state: record.state },
            after: { state: "cancelled" },
          },
          () => cancelRequest(db, id, { by: requesterLabel(user) }),
          async () => {
            await restoreRequest(db, id, before);
            await deleteCancellation(db, id);
          },
        );
      }
      const [view] = await viewsOf(db, user, [id]);
      return view;
    },
    LOCK,
  );
}

/**
 * `POST /api/bookings/:id/decide`: an approver accepts the engine's slot (`approve`, the request
 * becomes `decided`) or rejects the request (`reject`, stored as `REJ_BY_APPROVER`, its slot
 * freed). Order of checks: `409` before any dataset import; `404` unless the user may see the
 * request; `403` for roles that never approve; `409` unless it is `pending_approval` with a
 * decision to approve; `403` unless the user is an admin or the coordinator of the lab's
 * department (class moves: admins only); `403 SELF_APPROVAL` for the requester. Then everything
 * is re-decided; when that fails the decision is undone and the error returned.
 */
export async function decideBooking(
  db: Db,
  user: SessionUser,
  id: string,
  body: BookingDecideRequest,
): Promise<BookingView> {
  return withDatasetLock(
    db,
    async () => {
      await requireImportedDataset(db);
      const { record, ctx, approval } = await visibleRequest(db, user, id);
      if (user.role !== "admin" && user.role !== "department_coordinator") {
        throw forbidden(
          "Only an admin or a department coordinator can decide bookings.",
        );
      }
      if (record.state !== "pending_approval") {
        throw conflict("This request isn't waiting for approval.");
      }
      const decision = ctx.decisions.get(record.id);
      if (!approval.needed || !decision) {
        throw conflict(
          user.role === "admin"
            ? "This request has no approval to give right now; re-run Spectra first."
            : "This request has no approval to give right now.",
        );
      }
      if (!canApprove(user, approval)) {
        throw forbidden(
          approval.approver_role === "admin"
            ? "Only an admin can approve a booking that moves classes."
            : `Only an admin or the ${approval.department} coordinator can decide this booking.`,
        );
      }
      assertNotSelf(user.id, record.created_by);

      const at = nowIso();
      const comment = body.comment ?? "";
      const before = snapshotOf(record);
      await writeAndRerun(
        db,
        user,
        {
          action:
            body.decision === "approve" ? "booking_approve" : "booking_reject",
          entity_id: id,
          before: {
            state: record.state,
            room_id: decision.room_id,
            day: decision.day,
            start_period: decision.start_period,
            end_period: decision.end_period,
          },
          after: {
            decision: body.decision,
            ...(comment ? { comment } : {}),
          },
        },
        () =>
          body.decision === "approve"
            ? setApproval(db, id, {
                approved_by: user.id,
                approver_role:
                  user.role === "admin" ? "admin" : "department_coordinator",
                approved_at: at,
                room_id: decision.room_id!,
                day: decision.day!,
                start_period: decision.start_period!,
                end_period: decision.end_period!,
              })
            : setRejection(db, id, {
                rejected_by: user.id,
                rejected_at: at,
                comment,
              }),
        () => restoreRequest(db, id, before),
      );
      const [view] = await viewsOf(db, user, [id]);
      return view;
    },
    LOCK,
  );
}
