import "server-only";
import type { Db } from "mongodb";
import {
  ROLE_LABEL,
  SpectraPublicDecisionViewSchema,
  SpectraPublicOverrideViewSchema,
  SpectraRunResultSchema,
  SpectraStateSchema,
  StoredBookingDecisionSchema,
  StoredSessionOverrideSchema,
  effectiveCategory,
  isCategoryCapped,
  type BookingRequest,
  type BookingRequestRecord,
  type Dataset,
  type RequestState,
  type SessionUser,
  type SpectraRunResult,
  type SpectraRunSummary,
  type SpectraState,
  type StoredBookingDecision,
  type StoredSessionOverride,
  type TimetableVersion,
} from "@/lib/contracts";
import type { EngineBookingDecision } from "@/lib/engine";
import { COLLECTIONS } from "@/lib/db/collections";
import { withDatasetLock } from "@/lib/db/locks";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import {
  listBookingDecisions,
  replaceBookingDecisions,
} from "@/lib/db/repos/booking-decisions";
import {
  setRequestStates,
  type RequestStateUpdate,
} from "@/lib/db/repos/booking-requests";
import { nowIso, omit } from "@/lib/db/repos/meta";
import { listBookingRequests } from "@/lib/db/repos/reference";
import {
  listSessionOverrides,
  replaceSessionOverrides,
} from "@/lib/db/repos/session-overrides";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { findUserById } from "@/lib/db/repos/users";
import { internalError, notFound } from "@/lib/errors";
import { getActiveDataset, getDatasetForExport } from "./dataset";
import {
  approvalMatches,
  approvalNeed,
  holdsSlot,
  rejectionReason,
  roomDepartments,
  sameSlot,
} from "./booking-approvals";
import {
  checkExportScope,
  decideSpectra,
  engineInput,
  exportScope,
} from "./spectra-engine";

// Re-exported for existing callers; new code imports them from ./booking-approvals.
export {
  approvalMatches,
  approvalNeed,
  bumpNotices,
  holdsSlot,
  roomDepartments,
  type ApprovalNeed,
} from "./booking-approvals";

/**
 * Spectra-week (Week 7) decisions for a timetable version, over every non-draft request: the
 * imported file's (`source: "dataset"`) and the ones users submitted in the app (`nl`/`form`),
 * in one engine run with the dataset's priority order. Decisions and overrides are keyed by
 * request and session id, so one set exists at a time, tagged with the version it was computed
 * against; every run replaces all of them and updates each request's `state`.
 *
 * Approvals (architecture §8):
 * - Dataset requests never wait for an approver: the admin's run (or activation) approves them,
 *   and a decision that moves classes records that admin as `approved_by`.
 * - A live request whose decision moves classes needs an admin; one placed in a department lab
 *   (`roomDepartment`) needs that department's coordinator (an admin may also approve). Until
 *   someone approves that exact slot it is `pending_approval`, and its decision still holds the
 *   slot (and its class moves) in the run, so lower-priority requests can't take it meanwhile.
 *   A later run that moves it drops the stale approval and asks again.
 * - A request an approver rejected is left out of the engine and stored as `REJ_BY_APPROVER`.
 * - A cancelled live request is no longer decided at all: it has no decision and stays
 *   `cancelled`. (Cancelled dataset requests keep their `REJ_CANCELLED` decision, as the official
 *   file lists them.)
 *
 * Export safeguard (`decideSpectra`): `schedule.json` shows only dataset requests and their
 * class moves, so a live request is never allowed to move a class in a way that leaves that file
 * inconsistent; its displacement is switched off instead (`barred`). A plan whose export scope
 * still has a hard violation is an engine bug and is never saved.
 *
 * Scoring stays the validator's: the totals of a run (and of `GET /api/spectra`) cover dataset
 * requests only, exactly like `schedule.json` and `GET /api/validate`.
 */

/** Request states the engine decides (drafts are never decided). */
const DECIDED_STATES: RequestState[] = [
  "submitted",
  "pending_approval",
  "decided",
  "cancelled",
];

/** Computed, validated Spectra state for one version, not yet stored. */
export type SpectraPlan = SpectraRunResult & {
  /** Request state changes (and stale approvals to drop) the run implies. */
  request_states: RequestStateUpdate[];
  /**
   * Live requests whose class moves the export safeguard switched off (dataset order); their
   * decisions are what the engine offers without moving classes.
   */
  barred: string[];
};

const PLAN_ONLY_KEYS = ["request_states", "barred"] as const;

/** The stored run result of a plan (what `POST /api/spectra/run` returns). */
function runResultOf(plan: SpectraPlan): SpectraRunResult {
  return omit(plan, PLAN_ONLY_KEYS);
}

/** The totals of a run, without the decision and override lists. */
export function spectraSummary(
  result: SpectraRunResult | SpectraPlan,
): SpectraRunSummary {
  const { decisions, overrides, ...rest } = result;
  void decisions;
  void overrides;
  return omit(rest as SpectraRunSummary & Partial<SpectraPlan>, PLAN_ONLY_KEYS);
}

// ------------------------------------------------------------------------------- planning

/** Engine facts as plain JSON (no `undefined`), so they survive the Mongo round trip unchanged. */
function plainFacts(facts: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(facts ?? {})) as Record<string, unknown>;
}

function toStoredDecision(
  decision: EngineBookingDecision,
  meta: {
    versionId: string;
    at: string;
    /** False when an approver must still act on this live request. */
    auto: boolean;
    approvedBy: string | null;
  },
): StoredBookingDecision {
  return StoredBookingDecisionSchema.parse({
    request_id: decision.request_id,
    status: decision.status,
    ...(decision.day !== undefined && { day: decision.day }),
    ...(decision.start_period !== undefined && {
      start_period: decision.start_period,
    }),
    ...(decision.end_period !== undefined && {
      end_period: decision.end_period,
    }),
    ...(decision.room_id !== undefined && { room_id: decision.room_id }),
    reason: decision.reason,
    reason_code: decision.reason_code,
    effective_category: decision.effective_category,
    category_capped: decision.category_capped,
    requires_admin_approval: decision.requires_admin_approval,
    auto: meta.auto,
    decided_by: "engine",
    approved_by: meta.approvedBy,
    timetable_version: meta.versionId,
    decided_at: meta.at,
    facts: plainFacts(decision.facts),
  });
}

/** "Admin", "CSE Department Coordinator", … for the users who rejected requests. */
async function approverLabels(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const users = await Promise.all(unique.map((id) => findUserById(db, id)));
  return new Map(
    unique.map((id, i) => {
      const user = users[i];
      if (!user) return [id, "the approver"];
      const label =
        user.role === "department_coordinator" && user.department
          ? `the ${user.department} ${ROLE_LABEL[user.role]}`
          : `the ${ROLE_LABEL[user.role]}`;
      return [id, label];
    }),
  );
}

function rejectedByApprover(
  request: BookingRequest,
  rejection: NonNullable<BookingRequestRecord["rejection"]>,
  label: string,
  rules: Pick<Dataset, "priority_order" | "role_category_cap">,
  meta: { versionId: string; at: string },
): StoredBookingDecision {
  return StoredBookingDecisionSchema.parse({
    request_id: request.id,
    status: "rejected",
    reason: rejectionReason(label, rejection.comment),
    reason_code: "REJ_BY_APPROVER",
    effective_category: effectiveCategory(rules, request),
    category_capped: isCategoryCapped(rules, request),
    requires_admin_approval: false,
    auto: false,
    decided_by: rejection.rejected_by,
    approved_by: null,
    timetable_version: meta.versionId,
    decided_at: meta.at,
    facts: {
      rejected_by: label,
      rejected_at: rejection.rejected_at,
      comment: rejection.comment,
    },
  });
}

export type SpectraRunOptions = {
  /**
   * The run was triggered by someone who can't approve class moves (a booking submitted,
   * cancelled or decided by a non-admin): a dataset decision that moves classes keeps the
   * approver stored for it only while its slot and its moves are unchanged (null otherwise)
   * instead of naming `actor`. Its overrides follow the same rule.
   */
  carryApprovals?: boolean;
  /**
   * The active dataset ({@link getActiveDataset}) when the caller already read it inside the
   * same dataset lock and nothing changed since (activation): saves reading it again. It must
   * list every non-draft request.
   */
  dataset?: Dataset;
};

/** The sessions a decision moves and where to, as a comparable key (null without facts). */
function movesKey(facts: StoredBookingDecision["facts"]): string | null {
  if (!facts || !("displaced" in facts)) return null;
  return facts.displaced
    .map(
      ({ session_id, to }) =>
        `${session_id}>${to.day}:${to.start_period}:${to.room_id}`,
    )
    .sort()
    .join("|");
}

/**
 * True when `next` holds the same slot as `prior` and moves the same sessions to the same
 * places, so an approval given for `prior`'s class moves still describes `next`.
 */
function sameMoves(
  prior: StoredBookingDecision,
  next: EngineBookingDecision,
): boolean {
  if (!holdsSlot(prior) || !holdsSlot(next) || !sameSlot(prior, next)) {
    return false;
  }
  const before = movesKey(prior.facts);
  return before !== null && before === movesKey(next.facts);
}

/**
 * Decides every non-draft request against `version` and validates the result, without writing.
 * Reads the active dataset once (or takes `options.dataset`). An engine self-check failure
 * (hard violations or priority inversions), or an export scope the safeguard could not keep
 * valid, is an engine bug: it is logged and becomes `INTERNAL_ERROR`, so bad decisions are never
 * stored. The totals are scored on the export scope (dataset requests), like `GET /api/validate`.
 */
export async function planSpectra(
  db: Db,
  version: TimetableVersion,
  actor: string,
  options: SpectraRunOptions = {},
): Promise<SpectraPlan> {
  const [dataset, records, previous] = await Promise.all([
    options.dataset ?? getActiveDataset(db),
    listBookingRequests(db, { state: DECIDED_STATES }),
    options.carryApprovals
      ? listBookingDecisions(db, { timetable_version: version.id })
      : Promise.resolve([]),
  ]);
  const previousById = new Map(previous.map((d) => [d.request_id, d]));
  const recordById = new Map(records.map((r) => [r.id, r]));
  const input = engineInput(dataset, records);
  const { result, barred } = decideSpectra(input, version.assignments);
  const inversions = result.stats.priority_inversions;
  if (result.violations.length > 0 || inversions.length > 0) {
    console.error("[spectra] booking engine self-check failed", {
      timetable_version: version.id,
      violations: result.violations.slice(0, 20),
      priority_inversions: inversions,
    });
    throw internalError(
      "The booking engine produced an inconsistent result, so nothing was saved. Please report this.",
    );
  }
  if (barred.length > 0) {
    console.info(
      "[spectra] class moves of live requests switched off to keep schedule.json valid",
      { timetable_version: version.id, barred },
    );
  }

  const at = nowIso();
  const meta = { versionId: version.id, at };
  const departments = roomDepartments(dataset.rooms);
  const labels = await approverLabels(
    db,
    [...input.rejected.values()].map((r) => r.rejected_by),
  );
  const engineById = new Map(result.decisions.map((d) => [d.request_id, d]));

  const decisions: StoredBookingDecision[] = [];
  const request_states: RequestStateUpdate[] = [];
  /** Displacing request id → who approved its class moves (null while a live one is pending). */
  const moveApprover = new Map<string, string | null>();
  /** The admin's run approves dataset requests' class moves; other runs carry an unchanged one. */
  const datasetApprover = (decision: EngineBookingDecision): string | null => {
    if (!options.carryApprovals) return actor;
    const prior = previousById.get(decision.request_id);
    return prior?.approved_by && sameMoves(prior, decision)
      ? prior.approved_by
      : null;
  };
  for (const request of dataset.booking_requests) {
    const record = recordById.get(request.id);
    const live = record !== undefined && record.source !== "dataset";
    // Cancelled live requests are gone: no decision, and they stay `cancelled`.
    if (live && record.state === "cancelled") continue;
    const rejection = input.rejected.get(request.id);
    let decision: StoredBookingDecision;
    let state: RequestState;
    if (rejection) {
      decision = rejectedByApprover(
        request,
        rejection,
        labels.get(rejection.rejected_by) ?? "the approver",
        dataset,
        meta,
      );
      state = "decided";
    } else {
      const engineDecision = engineById.get(request.id);
      if (!engineDecision) {
        throw internalError(
          "The booking engine skipped a request, so nothing was saved. Please report this.",
        );
      }
      if (!live) {
        const approvedBy = engineDecision.requires_admin_approval
          ? datasetApprover(engineDecision)
          : null;
        decision = toStoredDecision(engineDecision, {
          ...meta,
          auto: true,
          approvedBy,
        });
        if (engineDecision.requires_admin_approval) {
          moveApprover.set(request.id, approvedBy);
        }
        state = "decided";
      } else {
        const need = approvalNeed(engineDecision, departments);
        const approved =
          need !== null &&
          approvalMatches(record.approval, engineDecision, need);
        const approvedBy = approved ? record.approval!.approved_by : null;
        decision = toStoredDecision(engineDecision, {
          ...meta,
          auto: need === null,
          approvedBy,
        });
        if (engineDecision.requires_admin_approval) {
          moveApprover.set(request.id, approvedBy);
        }
        state = need !== null && !approved ? "pending_approval" : "decided";
      }
    }
    decisions.push(decision);
    if (!record) continue;
    if (record.state === "cancelled") state = "cancelled";
    const clear =
      record.approval !== undefined &&
      !approvalMatches(
        record.approval,
        decision,
        approvalNeed(decision, departments),
      );
    if (state !== record.state || clear) {
      request_states.push({ id: record.id, state, clear_approval: clear });
    }
  }

  const overrides: StoredSessionOverride[] = result.overrides.map((o) =>
    StoredSessionOverrideSchema.parse({
      session_id: o.session_id,
      day: o.day,
      start_period: o.start_period,
      room_id: o.room_id,
      displaced_by: o.displaced_by,
      // Every displacer's decision moves classes, so it is in `moveApprover`; never guess.
      approved_by: moveApprover.get(o.displaced_by) ?? null,
      timetable_version: version.id,
    }),
  );

  // The file's requests: dataset-origin records (or every request of the bundled fallback).
  const datasetIds = new Set(
    dataset.booking_requests
      .filter((r) => (recordById.get(r.id)?.source ?? "dataset") === "dataset")
      .map((r) => r.id),
  );
  const exportCheck = checkExportScope(
    exportScope(dataset, datasetIds),
    version.assignments,
    decisions,
    overrides,
  );
  if (exportCheck.violations.length > 0) {
    console.error(
      "[spectra] the export safeguard left schedule.json inconsistent",
      {
        timetable_version: version.id,
        barred,
        violations: exportCheck.violations.slice(0, 20),
      },
    );
    throw internalError(
      "The booking engine would leave the official Week-7 schedule inconsistent, so nothing was saved. Please report this.",
    );
  }
  return {
    ...SpectraRunResultSchema.parse({
      ...exportCheck.stats,
      timetable_version: version.id,
      decisions,
      overrides,
    }),
    request_states,
    barred,
  };
}

/**
 * Replaces the stored decisions and overrides with `plan`, applies its request states and
 * audits the run. Writes dataset-wide state: call inside a held dataset lock.
 */
export async function saveSpectraUnlocked(
  db: Db,
  plan: SpectraPlan,
  actor: string,
): Promise<SpectraRunResult> {
  await replaceBookingDecisions(db, plan.decisions);
  await replaceSessionOverrides(db, plan.overrides);
  await setRequestStates(db, plan.request_states);
  await appendAuditLog(db, {
    actor,
    action: "spectra_run",
    entity: COLLECTIONS.booking_decisions,
    entity_id: plan.timetable_version,
    after: spectraSummary(plan),
  });
  return runResultOf(plan);
}

/**
 * Re-decides every Week-7 request against the active timetable and replaces the stored
 * decisions and overrides. `NOT_FOUND` without an active timetable. Call inside a held dataset
 * lock; otherwise use {@link runSpectra}. Activation uses {@link planSpectra} and
 * {@link saveSpectraUnlocked} directly (plan first, so a failed plan leaves the old version active).
 */
export async function runSpectraUnlocked(
  db: Db,
  options: { actor: string } & SpectraRunOptions,
): Promise<SpectraRunResult> {
  const version = await getActiveTimetableVersion(db);
  if (!version) throw notFound("No active timetable — generate one first.");
  const plan = await planSpectra(db, version, options.actor, options);
  return saveSpectraUnlocked(db, plan, options.actor);
}

/** {@link runSpectraUnlocked} under the dataset lock (`CONFLICT` while another run holds it). */
export function runSpectra(
  db: Db,
  options: { actor: string },
): Promise<SpectraRunResult> {
  return withDatasetLock(db, () => runSpectraUnlocked(db, options));
}

// --------------------------------------------------------------------------------- reading

/** The stored Spectra state of one timetable version, ordered against the export dataset. */
type StoredSpectra = {
  dataset: Dataset;
  /** Every stored decision for the version: dataset requests in dataset order, then the rest. */
  decisions: StoredBookingDecision[];
  /** Every stored override for the version: dataset session order, then the rest. */
  overrides: StoredSessionOverride[];
};

/** `items` in the order of `order` (by `key`); items whose key is not listed go last, in their order. */
function inOrder<T>(
  items: readonly T[],
  order: readonly string[],
  key: (item: T) => string,
): T[] {
  const position = new Map(order.map((id, i) => [id, i]));
  const rank = (item: T) => position.get(key(item)) ?? order.length;
  return [...items].sort((a, b) => rank(a) - rank(b));
}

async function loadStoredSpectra(
  db: Db,
  version: TimetableVersion,
): Promise<StoredSpectra> {
  const [dataset, decisions, overrides] = await Promise.all([
    getDatasetForExport(db),
    listBookingDecisions(db, { timetable_version: version.id }),
    listSessionOverrides(db, { timetable_version: version.id }),
  ]);
  return {
    dataset,
    decisions: inOrder(
      decisions,
      dataset.booking_requests.map((r) => r.id),
      (d) => d.request_id,
    ),
    overrides: inOrder(
      overrides,
      dataset.sessions.map((s) => s.id),
      (o) => o.session_id,
    ),
  };
}

/**
 * The validator's booking stats for the stored state, scored like `schedule.json` (and
 * `GET /api/validate`): only decisions for dataset requests and the overrides they caused,
 * against the version's regular week. Null when nothing is stored for the version.
 */
function summarise(
  stored: StoredSpectra,
  version: TimetableVersion,
): SpectraRunSummary | null {
  const { bookings, stats } = checkExportScope(
    stored.dataset,
    version.assignments,
    stored.decisions,
    stored.overrides,
  );
  // Nothing decided for the dataset's requests yet (e.g. only live requests): no score, not 0.
  if (bookings.length === 0) return null;
  return { ...stats, timetable_version: version.id };
}

/**
 * Booking stats of the decisions stored for `version` (normally the active one), recomputed by
 * the validator port: the same numbers a Spectra run reported, without re-deciding anything.
 * Null when no decision is stored for that version.
 */
export async function storedSpectraSummary(
  db: Db,
  version: TimetableVersion,
): Promise<SpectraRunSummary | null> {
  return summarise(await loadStoredSpectra(db, version), version);
}

/**
 * `GET /api/spectra`: the active timetable's stored decisions (dataset request order) and
 * Week-7 overrides, with their booking stats ({@link storedSpectraSummary}). Everything is
 * null or empty without an active timetable; `summary` is null until Spectra has run for it.
 * Who decided and approved (`decided_by`, `approved_by`: user ids) is shown to admins only.
 * Other roles get the strict public views (a leaked key fails loudly) and only decisions for
 * dataset requests: live users' requests stay with their owners and admins (`/api/bookings`).
 */
export async function getSpectraState(
  db: Db,
  user: SessionUser,
): Promise<SpectraState> {
  const version = await getActiveTimetableVersion(db);
  if (!version) {
    return {
      timetable_version: null,
      summary: null,
      decisions: [],
      overrides: [],
    };
  }
  const stored = await loadStoredSpectra(db, version);
  const summary = summarise(stored, version);
  if (user.role === "admin") {
    return SpectraStateSchema.parse({
      timetable_version: version.id,
      summary,
      decisions: stored.decisions,
      overrides: stored.overrides,
    });
  }
  const requestIds = new Set(stored.dataset.booking_requests.map((r) => r.id));
  const sessionIds = new Set(stored.dataset.sessions.map((s) => s.id));
  return SpectraStateSchema.parse({
    timetable_version: version.id,
    summary,
    decisions: stored.decisions
      .filter((d) => requestIds.has(d.request_id))
      .map((d) =>
        SpectraPublicDecisionViewSchema.parse(
          omit(d, ["decided_by", "approved_by"]),
        ),
      ),
    overrides: stored.overrides
      .filter(
        (o) => requestIds.has(o.displaced_by) && sessionIds.has(o.session_id),
      )
      .map((o) =>
        SpectraPublicOverrideViewSchema.parse(omit(o, ["approved_by"])),
      ),
  });
}
