import "server-only";
import type { Db } from "mongodb";
import {
  SpectraPublicDecisionViewSchema,
  SpectraPublicOverrideViewSchema,
  SpectraRunResultSchema,
  SpectraStateSchema,
  StoredBookingDecisionSchema,
  StoredSessionOverrideSchema,
  toExportDecision,
  type Dataset,
  type SessionOverride,
  type SessionUser,
  type SpectraRunResult,
  type SpectraRunSummary,
  type SpectraState,
  type StoredBookingDecision,
  type StoredSessionOverride,
  type TimetableVersion,
} from "@/lib/contracts";
import {
  buildInstance,
  checkBookings,
  decideBookings,
  toAssignMap,
  type EngineBookingDecision,
} from "@/lib/engine";
import { COLLECTIONS } from "@/lib/db/collections";
import { withDatasetLock } from "@/lib/db/locks";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import {
  listBookingDecisions,
  replaceBookingDecisions,
} from "@/lib/db/repos/booking-decisions";
import { nowIso, omit } from "@/lib/db/repos/meta";
import {
  listSessionOverrides,
  replaceSessionOverrides,
} from "@/lib/db/repos/session-overrides";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { internalError, notFound } from "@/lib/errors";
import { getDatasetForExport } from "./dataset";

/**
 * Spectra-week (Week 7) decisions for a timetable version. Only dataset-origin requests are
 * decided, with the dataset's own priority order (the validator's view; live requests arrive in
 * Phase 4). Decisions and overrides are keyed by request and session id, so one set exists at a
 * time, tagged with the version it was computed against.
 */

/** Computed, validated Spectra state for one version, not yet stored. */
export type SpectraPlan = SpectraRunResult;

/** The totals of a run, without the decision and override lists. */
export function spectraSummary(result: SpectraRunResult): SpectraRunSummary {
  const { decisions, overrides, ...summary } = result;
  void decisions;
  void overrides;
  return summary;
}

function toStoredDecision(
  decision: EngineBookingDecision,
  meta: { actor: string; versionId: string; at: string },
): StoredBookingDecision {
  // Explicit picks: the engine's `facts` (and anything else it adds) are not stored.
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
    auto: true,
    decided_by: "engine",
    // Only Week-7 moves need an approver: the admin whose run applied them.
    approved_by: decision.requires_admin_approval ? meta.actor : null,
    timetable_version: meta.versionId,
    decided_at: meta.at,
  });
}

/**
 * Decides every dataset request against `version` and validates the result, without writing.
 * An engine self-check failure (hard violations or priority inversions) is an engine bug: it is
 * logged and becomes `INTERNAL_ERROR`, so bad decisions are never stored.
 */
export async function planSpectra(
  db: Db,
  version: TimetableVersion,
  actor: string,
): Promise<SpectraPlan> {
  const dataset = await getDatasetForExport(db);
  const result = decideBookings(buildInstance(dataset), version.assignments);
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

  const at = nowIso();
  const meta = { actor, versionId: version.id, at };
  const decisions = result.decisions.map((d) => toStoredDecision(d, meta));
  const overrides: StoredSessionOverride[] = result.overrides.map((o) =>
    StoredSessionOverrideSchema.parse({
      session_id: o.session_id,
      day: o.day,
      start_period: o.start_period,
      room_id: o.room_id,
      displaced_by: o.displaced_by,
      approved_by: actor,
      timetable_version: version.id,
    }),
  );
  return SpectraRunResultSchema.parse({
    ...result.stats,
    timetable_version: version.id,
    decisions,
    overrides,
  });
}

/**
 * Replaces the stored decisions and overrides with `plan` and audits the run. Writes
 * dataset-wide state: call inside a held dataset lock.
 */
export async function saveSpectraUnlocked(
  db: Db,
  plan: SpectraPlan,
  actor: string,
): Promise<SpectraRunResult> {
  await replaceBookingDecisions(db, plan.decisions);
  await replaceSessionOverrides(db, plan.overrides);
  await appendAuditLog(db, {
    actor,
    action: "spectra_run",
    entity: COLLECTIONS.booking_decisions,
    entity_id: plan.timetable_version,
    after: spectraSummary(plan),
  });
  return plan;
}

/**
 * Re-decides every Week-7 request against the active timetable and replaces the stored
 * decisions and overrides. `NOT_FOUND` without an active timetable. Call inside a held dataset
 * lock; otherwise use {@link runSpectra}. Activation uses {@link planSpectra} and
 * {@link saveSpectraUnlocked} directly (plan first, so a failed plan leaves the old version active).
 */
export async function runSpectraUnlocked(
  db: Db,
  options: { actor: string },
): Promise<SpectraRunResult> {
  const version = await getActiveTimetableVersion(db);
  if (!version) throw notFound("No active timetable — generate one first.");
  const plan = await planSpectra(db, version, options.actor);
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
  const { dataset } = stored;
  const requestIds = new Set(dataset.booking_requests.map((r) => r.id));
  const sessionIds = new Set(dataset.sessions.map((s) => s.id));
  const bookings = stored.decisions
    .filter((d) => requestIds.has(d.request_id))
    .map(toExportDecision);
  // Nothing decided for the dataset's requests yet (e.g. only live requests): no score, not 0.
  if (bookings.length === 0) return null;
  // The same scope as schedule.json: overrides of dataset requests on sessions still in it.
  const session_overrides: SessionOverride[] = stored.overrides
    .filter(
      (o) => requestIds.has(o.displaced_by) && sessionIds.has(o.session_id),
    )
    .map(({ session_id, day, start_period, room_id, displaced_by }) => ({
      session_id,
      day,
      start_period,
      room_id,
      displaced_by,
    }));
  const { stats } = checkBookings(
    buildInstance(dataset),
    toAssignMap(version.assignments).assign,
    { bookings, session_overrides },
  );
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
 * dataset requests: live users' requests (Phase 4) stay with their owners and admins.
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
