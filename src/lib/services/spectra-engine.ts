import "server-only";
import {
  toExportDecision,
  type Assignment,
  type BookingDecision,
  type BookingRequestRecord,
  type Dataset,
  type SessionOverride,
  type Violation,
} from "@/lib/contracts";
import {
  buildInstance,
  checkBookings,
  decideBookings,
  toAssignMap,
  type BookingsCheck,
  type Instance,
  type SpectraDecisionResult,
} from "@/lib/engine";

/**
 * One Spectra engine run over every request that should be decided, shared by Spectra runs
 * (`planSpectra`) and the parse preview, so a preview decides exactly what a submission would.
 * Pure (no database access).
 */

export type ApproverRejection = NonNullable<BookingRequestRecord["rejection"]>;

export type EngineInput = {
  /**
   * The dataset the engine decides: the active dataset's requests minus those an approver
   * rejected (still not cancelled) and minus cancelled live requests, with their cancellation
   * rows removed too. Cancelled dataset-origin requests stay (the official file lists them).
   */
  dataset: Dataset;
  /** Approver rejections of requests that are not cancelled, by request id. */
  rejected: Map<string, ApproverRejection>;
  /** Live (app-submitted) requests still in `dataset`. */
  liveIds: Set<string>;
  /**
   * The requests the official `schedule.json` holds: dataset-origin ones (every request of the
   * bundled fallback, which has no records), approver-rejected ones excluded.
   */
  exportIds: Set<string>;
};

/**
 * Builds the engine input from the active dataset (its `booking_requests` merged from the
 * collection) and the stored records. `options.live`: ids to treat as live although they have no
 * record (the preview's hypothetical request).
 */
export function engineInput(
  dataset: Dataset,
  records: readonly BookingRequestRecord[],
  options: { live?: readonly string[] } = {},
): EngineInput {
  const recordById = new Map(records.map((r) => [r.id, r]));
  const extraLive = new Set(options.live ?? []);
  const isLive = (id: string) =>
    extraLive.has(id) ||
    (recordById.get(id)?.source ?? "dataset") !== "dataset";

  const rejected = new Map<string, ApproverRejection>();
  const dropped = new Set<string>();
  for (const request of dataset.booking_requests) {
    const record = recordById.get(request.id);
    if (!record) continue;
    if (record.state === "cancelled") {
      // A later cancellation takes precedence over a rejection; cancelled live requests are
      // simply gone (the file never lists them).
      if (isLive(request.id)) dropped.add(request.id);
      continue;
    }
    if (record.rejection) {
      rejected.set(request.id, record.rejection);
      dropped.add(request.id);
    }
  }

  const engineDataset: Dataset =
    dropped.size === 0
      ? dataset
      : {
          ...dataset,
          booking_requests: dataset.booking_requests.filter(
            (r) => !dropped.has(r.id),
          ),
          cancellations: dataset.cancellations.filter(
            (c) => !dropped.has(c.request_id),
          ),
        };
  const liveIds = new Set<string>();
  const exportIds = new Set<string>();
  for (const request of engineDataset.booking_requests) {
    if (isLive(request.id)) liveIds.add(request.id);
    else exportIds.add(request.id);
  }
  return { dataset: engineDataset, rejected, liveIds, exportIds };
}

// ------------------------------------------------------------------------- export scope

/** `dataset` restricted to the requests the official file holds (and their cancellations). */
export function exportScope(
  dataset: Dataset,
  ids: ReadonlySet<string>,
): Dataset {
  return {
    ...dataset,
    booking_requests: dataset.booking_requests.filter((r) => ids.has(r.id)),
    cancellations: dataset.cancellations.filter((c) => ids.has(c.request_id)),
  };
}

export type ExportScopeCheck = BookingsCheck & {
  /** The decisions `schedule.json` shows (export shape, `scope` request order of `decisions`). */
  bookings: BookingDecision[];
};

/**
 * The validator's booking check of `decisions` and `overrides` as `schedule.json` shows them:
 * only decisions for `scope`'s requests and the overrides they caused on sessions still in it,
 * against the regular week `assignments`. `scope` is the export dataset ({@link exportScope});
 * pass its `instance` when it is already built.
 */
export function checkExportScope(
  scope: Dataset,
  assignments: readonly Assignment[],
  decisions: readonly BookingDecision[],
  overrides: readonly SessionOverride[],
  instance: Instance = buildInstance(scope),
): ExportScopeCheck {
  const requestIds = new Set(scope.booking_requests.map((r) => r.id));
  const sessionIds = new Set(scope.sessions.map((s) => s.id));
  const bookings = decisions
    .filter((d) => requestIds.has(d.request_id))
    .map(toExportDecision);
  const session_overrides: SessionOverride[] = overrides
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
  const check = checkBookings(instance, toAssignMap(assignments).assign, {
    bookings,
    session_overrides,
  });
  return { bookings, ...check };
}

// ------------------------------------------------------------------------------ decisions

/** Most rounds that bar newly found live displacers before every live request is barred. */
export const MAX_SAFEGUARD_ROUNDS = 4;

export type SpectraDecision = {
  result: SpectraDecisionResult;
  /**
   * Live requests whose session displacement had to be switched off so the official
   * `schedule.json` (which never shows live requests or their class moves) stays valid, in
   * dataset order.
   */
  barred: string[];
  /** Hard violations of the export scope; empty unless the safeguard itself failed. */
  export_violations: Violation[];
};

/**
 * Decides every request of `input.dataset` against `assignments`.
 *
 * Export safeguard: `schedule.json` shows only dataset-origin requests and the class moves they
 * caused. A live request's class move frees a cell the export still shows as taken, so a dataset
 * request placed there would clash in the file. When the export scope has hard violations, the
 * run is repeated with displacement switched off for the live requests that displaced sessions
 * (`barred`), adding any new live displacer each round. After {@link MAX_SAFEGUARD_ROUNDS}
 * rounds every live request is barred; the export scope is then the dataset requests' own
 * decisions and moves, which the engine's self-check already covers. With no live request in
 * the dataset this is exactly one `decideBookings` run.
 */
export function decideSpectra(
  input: EngineInput,
  assignments: readonly Assignment[],
): SpectraDecision {
  const instance = buildInstance(input.dataset);
  let result = decideBookings(instance, assignments);
  if (input.liveIds.size === 0) {
    return { result, barred: [], export_violations: [] };
  }

  const scope = exportScope(input.dataset, input.exportIds);
  const scopeInstance = buildInstance(scope);
  const exportViolations = (r: SpectraDecisionResult) =>
    checkExportScope(
      scope,
      assignments,
      r.decisions,
      r.overrides,
      scopeInstance,
    ).violations;
  const barred = new Set<string>();
  const decideWithBar = () =>
    decideBookings(instance, assignments, { noDisplacement: barred });

  let violations = exportViolations(result);
  for (let round = 0; violations.length > 0; round++) {
    const fresh = [
      ...new Set(
        result.overrides
          .map((o) => o.displaced_by)
          .filter((id) => input.liveIds.has(id) && !barred.has(id)),
      ),
    ];
    if (round >= MAX_SAFEGUARD_ROUNDS || fresh.length === 0) {
      // Last resort: no live request moves classes at all.
      const before = barred.size;
      for (const id of input.liveIds) barred.add(id);
      if (barred.size > before) {
        result = decideWithBar();
        violations = exportViolations(result);
      }
      break;
    }
    for (const id of fresh) barred.add(id);
    result = decideWithBar();
    violations = exportViolations(result);
  }

  return {
    result,
    barred: input.dataset.booking_requests
      .map((r) => r.id)
      .filter((id) => barred.has(id)),
    export_violations: violations,
  };
}
