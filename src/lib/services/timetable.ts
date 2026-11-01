import "server-only";
import type { Db } from "mongodb";
import type {
  ActivateTimetableResult,
  GenerateTimetableResult,
  SolverProgress,
  StoredBookingDecision,
  StoredSessionOverride,
  TimetableVersion,
  TimetableVersionSummary,
} from "@/lib/contracts";
import {
  buildInstance,
  checkTimetable,
  solveSteps,
  type Instance,
  type SolverOptions,
  type SolverResult,
} from "@/lib/engine";
import { COLLECTIONS } from "@/lib/db/collections";
import {
  acquireDatasetLock,
  datasetBusy,
  withDatasetLock,
} from "@/lib/db/locks";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import {
  listBookingDecisions,
  replaceBookingDecisions,
} from "@/lib/db/repos/booking-decisions";
import {
  restoreRequest,
  type RequestSnapshot,
} from "@/lib/db/repos/booking-requests";
import { isDuplicateKeyError } from "@/lib/db/repos/meta";
import { listBookingRequests } from "@/lib/db/repos/reference";
import {
  listSessionOverrides,
  replaceSessionOverrides,
} from "@/lib/db/repos/session-overrides";
import {
  KEEP_INACTIVE_VERSIONS,
  activateTimetableVersion,
  getActiveTimetableVersion,
  getTimetableVersion,
  insertTimetableVersion,
  pruneInactiveTimetableVersions,
  listTimetableVersions,
} from "@/lib/db/repos/timetable-versions";
import { getServerEnv } from "@/lib/env";
import {
  ApiError,
  hardConstraint,
  infeasible,
  notFound,
  staleVersion,
} from "@/lib/errors";
import { staleComment, supersedePendingChanges } from "./change-supersede";
import { getActiveDataset } from "./dataset";
import { getSettings } from "./settings";
import {
  planSpectra,
  saveSpectraUnlocked,
  spectraSummary,
  type SpectraPlan,
} from "./spectra";

/**
 * Timetable generation and activation. Each public function takes the dataset lock; the
 * `*Unlocked` bodies run inside a lock someone else holds (the reset pipeline, a streamed run).
 */

export type GenerateTimetableOptions = {
  /** Defaults to `settings.solver_seed`. */
  seed?: number;
  /** Wall-clock safety cap; defaults to `SOLVER_TIME_BUDGET_MS`. */
  budgetMs?: number;
  /** Deterministic iteration budget; defaults to the solver's own (tests and scripts only). */
  maxIterations?: number;
  /** Activate the new version (re-runs Spectra decisions for it). */
  activate?: boolean;
  actor: string;
  /** Called with each solver progress snapshot (the SSE stream). Must not throw. */
  onProgress?: (progress: SolverProgress) => void;
};

/** How many hard violations an `INFEASIBLE` error lists. */
const MAX_REPORTED_VIOLATIONS = 50;

/** Minimum solver time between two forwarded progress snapshots (phase changes always pass). */
const PROGRESS_INTERVAL_MS = 100;

/**
 * Drives the solver generator, handing snapshots to `onProgress` and yielding to the event loop
 * in between so streamed frames flush while the solver runs. Snapshots are throttled to about
 * one per `PROGRESS_INTERVAL_MS` of solver time; the first of each phase and the final `verify`
 * snapshot are always forwarded.
 */
async function runSolver(
  instance: Instance,
  options: SolverOptions,
  onProgress?: (progress: SolverProgress) => void,
): Promise<SolverResult> {
  let listener = onProgress;
  let lastPhase: SolverProgress["phase"] | null = null;
  let lastMs = Number.NEGATIVE_INFINITY;
  const steps = solveSteps(instance, options);
  let step = steps.next();
  while (!step.done) {
    const progress = step.value;
    const due =
      progress.phase !== lastPhase ||
      progress.phase === "verify" ||
      progress.ms - lastMs >= PROGRESS_INTERVAL_MS;
    if (listener && due) {
      lastPhase = progress.phase;
      lastMs = progress.ms;
      try {
        listener(progress);
      } catch (err) {
        // A broken listener must not abort a run that holds the dataset lock.
        console.warn("[timetable] progress listener failed; detaching it", err);
        listener = undefined;
      }
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    step = steps.next();
  }
  return step.value;
}

/**
 * Generates a timetable for the active dataset and stores it as a draft version (or activates
 * it with `activate`). `INFEASIBLE` (422) when the solver leaves a session unplaced or its
 * independent re-check finds a hard violation; nothing is saved then.
 */
export async function generateTimetableUnlocked(
  db: Db,
  opts: GenerateTimetableOptions,
): Promise<GenerateTimetableResult> {
  const dataset = await getActiveDataset(db);
  const instance = buildInstance(dataset);
  const seed = opts.seed ?? (await getSettings(db)).solver_seed;
  const timeBudgetMs = opts.budgetMs ?? getServerEnv().SOLVER_TIME_BUDGET_MS;
  const result = await runSolver(
    instance,
    {
      seed,
      timeBudgetMs,
      ...(opts.maxIterations !== undefined && {
        maxIterations: opts.maxIterations,
      }),
    },
    opts.onProgress,
  );

  if (result.unplaced.length > 0 || result.hard.length > 0) {
    const parts = [
      result.unplaced.length > 0 &&
        `${result.unplaced.length} session${result.unplaced.length === 1 ? "" : "s"} could not be placed`,
      result.hard.length > 0 &&
        `${result.hard.length} hard violation${result.hard.length === 1 ? "" : "s"} remain`,
    ].filter(Boolean);
    throw infeasible(
      `Could not place every session without breaking a hard rule (${parts.join(", ")}). Nothing was saved.`,
      {
        unplaced: result.unplaced.slice(0, MAX_REPORTED_VIOLATIONS),
        unplaced_total: result.unplaced.length,
        violations: result.hard.slice(0, MAX_REPORTED_VIOLATIONS),
        violations_total: result.hard.length,
        issues: result.issues.slice(0, MAX_REPORTED_VIOLATIONS),
      },
    );
  }

  const parent = await getActiveTimetableVersion(db);
  const { penalties, total } = result.soft;
  const version = await insertTimetableVersion(db, {
    dataset_id: dataset.dataset_id,
    status: "draft",
    source: "generate",
    parent_version: parent?.id ?? null,
    change_request_id: null,
    assignments: result.assignments,
    hard_violation_count: 0,
    soft_penalty: {
      S1: penalties.S1,
      S2: penalties.S2,
      S3: penalties.S3,
      S4: penalties.S4,
      S5: penalties.S5,
      S6: penalties.S6,
      total,
    },
    solver_meta: {
      seed,
      ms: Math.round(result.ms),
      iterations: result.iterations,
      algorithm: result.algorithm,
      stopped_by: result.stopped_by,
    },
    created_by: opts.actor,
  });
  await pruneInactiveTimetableVersions(db, KEEP_INACTIVE_VERSIONS);
  await appendAuditLog(db, {
    actor: opts.actor,
    action: "generate",
    entity: COLLECTIONS.timetable_versions,
    entity_id: version.id,
    after: {
      seed,
      soft_total: total,
      fest_cost: result.fest.cost,
      iterations: result.iterations,
      ms: Math.round(result.ms),
      stopped_by: result.stopped_by,
    },
  });

  if (!opts.activate) return { version, activated: false, spectra: null };
  const activated = await activateTimetableUnlocked(db, version.id, opts.actor);
  return {
    version: activated.version,
    activated: true,
    spectra: activated.spectra,
  };
}

/** {@link generateTimetableUnlocked} under the dataset lock (`CONFLICT` while another run holds it). */
export function generateTimetable(
  db: Db,
  opts: GenerateTimetableOptions,
): Promise<GenerateTimetableResult> {
  return withDatasetLock(db, () => generateTimetableUnlocked(db, opts));
}

/**
 * For a streamed generation: takes the dataset lock now, so a busy lock is a plain `CONFLICT`
 * before any stream opens, and returns the run. The run generates under that lock and always
 * releases it, whether it succeeds, fails or its listener goes away. Call the run exactly once.
 */
export async function beginTimetableGeneration(
  db: Db,
  opts: Omit<GenerateTimetableOptions, "onProgress">,
): Promise<
  (
    onProgress?: (progress: SolverProgress) => void,
  ) => Promise<GenerateTimetableResult>
> {
  const release = await acquireDatasetLock(db);
  let started = false;
  return async (onProgress) => {
    if (started) throw new Error("A generation run can only be started once.");
    started = true;
    try {
      return await generateTimetableUnlocked(db, { ...opts, onProgress });
    } catch (err) {
      if (isDuplicateKeyError(err)) throw datasetBusy(err);
      throw err;
    } finally {
      await release();
    }
  };
}

export type ActivateTimetableOptions = {
  /**
   * Set only by the approval flow of this change request (`change-apply.ts`): a version proposed
   * by a change request (`change_request_id`) is activated by approving that request, never
   * directly, because approval also writes the request's changes into the dataset. The approval
   * then supersedes the other pending proposals itself.
   */
  changeRequestId?: string;
};

/** The stored Spectra state an activation replaces, so a failed save can put it back exactly. */
type SpectraSnapshot = {
  decisions: StoredBookingDecision[];
  overrides: StoredSessionOverride[];
  /** The requests whose state the plan changes, as they are now. */
  requests: { id: string; before: RequestSnapshot }[];
};

async function snapshotSpectra(
  db: Db,
  plan: SpectraPlan,
): Promise<SpectraSnapshot> {
  const changed = new Set(plan.request_states.map((u) => u.id));
  const [decisions, overrides, records] = await Promise.all([
    listBookingDecisions(db),
    listSessionOverrides(db),
    changed.size > 0
      ? listBookingRequests(db, {}, ["id", "state", "approval", "rejection"])
      : Promise.resolve([]),
  ]);
  return {
    decisions,
    overrides,
    requests: records
      .filter((r) => changed.has(r.id))
      .map((r) => ({
        id: r.id,
        before: {
          state: r.state,
          approval: r.approval,
          rejection: r.rejection,
        },
      })),
  };
}

/** Puts back what {@link snapshotSpectra} saw: decisions, overrides and request states. */
async function restoreSpectra(
  db: Db,
  snapshot: SpectraSnapshot,
): Promise<void> {
  await replaceBookingDecisions(db, snapshot.decisions);
  await replaceSessionOverrides(db, snapshot.overrides);
  for (const { id, before } of snapshot.requests) {
    await restoreRequest(db, id, before);
  }
}

/**
 * Makes version `id` the active timetable. It must belong to the loaded dataset
 * (`STALE_VERSION` otherwise) and pass a fresh hard-rule check against the current data
 * (`HARD_CONSTRAINT`, with the violations). A version proposed by a change request is refused
 * (`CONFLICT`) unless `options.changeRequestId` names that request.
 *
 * Spectra decisions are planned for it first, so an engine failure changes nothing. The stored
 * Spectra state is snapshotted next; if switching the active version or saving the new decisions
 * then fails, the snapshot and the previous active version are put back (each best-effort and
 * logged) and the error is rethrown. (With no previous version, as on a first activation, the new
 * one may stay active without its decisions; the export refuses it until Spectra is re-run.)
 * Once the new version is active with its decisions, nothing
 * after that throws: the `activate` audit entry and the rejection of pending change requests
 * built on another version (outside an approval: "The timetable changed (…)", `decided_by:
 * "system"`) are best-effort.
 */
export async function activateTimetableUnlocked(
  db: Db,
  id: string,
  actor: string,
  options: ActivateTimetableOptions = {},
): Promise<ActivateTimetableResult> {
  const version = await getTimetableVersion(db, id);
  if (!version) throw notFound(`Timetable version ${id} not found.`);
  if (
    version.change_request_id !== null &&
    version.change_request_id !== options.changeRequestId
  ) {
    throw new ApiError(
      "CONFLICT",
      `Timetable ${id} was proposed by ${version.change_request_id}. Approve ${version.change_request_id} to apply this version.`,
      { change_request_id: version.change_request_id },
    );
  }
  const dataset = await getActiveDataset(db);
  if (version.dataset_id !== dataset.dataset_id) {
    throw staleVersion(
      `This timetable was generated for another dataset (${version.dataset_id}, not ${dataset.dataset_id}). Generate a new one.`,
    );
  }
  const { violations } = checkTimetable(
    buildInstance(dataset),
    version.assignments,
  );
  if (violations.length > 0) {
    throw hardConstraint(
      `Timetable ${id} breaks ${violations.length} hard rule${violations.length === 1 ? "" : "s"} against the current data, so it can't be activated.`,
      violations.slice(0, MAX_REPORTED_VIOLATIONS),
    );
  }

  const previous = await getActiveTimetableVersion(db);
  // Plan first: a booking-engine failure leaves the previous version active and nothing written.
  // The dataset was just read under the same lock, so the plan reuses it.
  const plan = await planSpectra(db, version, actor, { dataset });
  const snapshot = await snapshotSpectra(db, plan);
  let activated: TimetableVersion;
  try {
    activated = await activateTimetableVersion(db, id);
    await saveSpectraUnlocked(db, plan, actor);
  } catch (err) {
    // Don't leave a new active version without its decisions, or no active version at all: put
    // the previous decisions and the previous version back.
    await restoreSpectra(db, snapshot).catch((restoreErr: unknown) =>
      console.error(
        "[timetable] could not restore the previous Spectra decisions; re-run Spectra",
        restoreErr,
      ),
    );
    if (previous && previous.id !== id) {
      await activateTimetableVersion(db, previous.id).catch(
        (restoreErr: unknown) =>
          console.error(
            "[timetable] could not restore the previous version",
            restoreErr,
          ),
      );
    }
    throw err;
  }
  const spectra = spectraSummary(plan);
  await appendAuditLog(db, {
    actor,
    action: "activate",
    entity: COLLECTIONS.timetable_versions,
    entity_id: id,
    before: { active_version: previous?.id ?? null },
    after: { active_version: id, spectra },
  }).catch((err: unknown) =>
    console.warn(`[timetable] could not audit the activation of ${id}`, err),
  );
  if (options.changeRequestId === undefined) {
    await supersedePendingChanges(db, {
      activeVersion: id,
      actor,
      comment: staleComment(id),
    });
  }
  return { version: activated, spectra };
}

/** {@link activateTimetableUnlocked} under the dataset lock. */
export function activateTimetable(
  db: Db,
  id: string,
  actor: string,
): Promise<ActivateTimetableResult> {
  return withDatasetLock(db, () => activateTimetableUnlocked(db, id, actor));
}

/** Every stored version, newest first, without assignments. */
export function listTimetableVersionSummaries(
  db: Db,
): Promise<TimetableVersionSummary[]> {
  return listTimetableVersions(db);
}
