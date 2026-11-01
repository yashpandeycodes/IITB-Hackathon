import "server-only";
import type {
  Assignment,
  BaselineStability,
  ChangeProposal,
  ChangeProposalRequest,
  ChangeScope,
  ConflictEntry,
  Dataset,
  DisruptionChange,
  MoveDiff,
  SessionUser,
  TimetableVersion,
} from "@/lib/contracts";
import {
  DisruptionError,
  buildInstance,
  computeStability,
  describeChanges,
  reschedule,
  toAssignMap,
  validateChanges,
  type RescheduleResult,
} from "@/lib/engine";
import { internalError, validationError } from "@/lib/errors";
import { assertChangeScope, sessionDepartment } from "./change-scope";
import { validateDataset } from "./dataset";

/**
 * Building a change proposal (architecture §7.3): the one place a change list and placements
 * become the moves, counts, soft delta, scope and conflicts that a change request stores. Pure:
 * no database, no lock, no pending cap. `POST /api/changes` and `/preview` (`changes.ts`) call it
 * with the stored data and the active timetable; the assistant (`assistant.ts`) calls it for each
 * option it offers, so an option shows exactly what filing it would store.
 */

/** What a proposal is built on: the stored data and the active timetable. */
export type ProposalContext = {
  dataset: Dataset;
  base: TimetableVersion;
  /** `schedule.json`'s sessions once a change has been applied (the baseline), else null. */
  baseline: readonly Assignment[] | null;
};

export type ProposeOptions = {
  /** Max ejection-chain depth for the rescheduler (default: the engine's). */
  maxDepth?: number;
  /** Runs after the request is validated and scoped, before the rescheduler (may throw). */
  precheck?: (context: ProposalContext) => void;
};

export type ComputedProposal = {
  proposal: ChangeProposal;
  result: RescheduleResult;
};

// ---------------------------------------------------------------------------------- scope

/** Touched sessions, faculty, groups, rooms and departments (`ChangeScope`). */
export function computeChangeScope(
  before: Dataset,
  after: Dataset,
  request: {
    changes: readonly DisruptionChange[];
    placements: readonly Assignment[];
  },
  diff: readonly MoveDiff[],
  conflicts: readonly ConflictEntry[],
): ChangeScope {
  const sessions = new Map(before.sessions.map((s) => [s.id, s]));
  for (const s of after.sessions) sessions.set(s.id, s);

  const touched = new Set<string>();
  const rooms = new Set<string>();
  const faculty = new Set<string>();
  for (const d of diff) {
    touched.add(d.session_id);
    if (d.from) rooms.add(d.from.room_id);
    if (d.to) rooms.add(d.to.room_id);
  }
  for (const p of request.placements) {
    touched.add(p.session_id);
    rooms.add(p.room_id);
  }
  for (const c of request.changes) {
    switch (c.type) {
      case "add_session":
        touched.add(c.session.id);
        break;
      case "remove_session":
        touched.add(c.session_id);
        break;
      case "faculty_unavailable":
        faculty.add(c.faculty_id);
        break;
      case "add_faculty":
        faculty.add(c.faculty.id);
        break;
      case "room_unavailable":
        rooms.add(c.room_id);
        break;
    }
  }
  for (const c of conflicts) touched.add(c.session_id);

  const groups = new Set<string>();
  const departments = new Set<string>();
  for (const id of touched) {
    const session = sessions.get(id);
    if (!session) continue;
    faculty.add(session.faculty_id);
    for (const g of session.groups) groups.add(g);
    const dept = sessionDepartment(after, session);
    if (dept) departments.add(dept);
  }
  const facultyDept = new Map(
    [...before.faculty, ...after.faculty].map((f) => [f.id, f.department]),
  );
  for (const id of faculty) {
    const dept = facultyDept.get(id);
    if (dept) departments.add(dept);
  }

  // Sessions in dataset order (changed dataset first, then removed ones), the rest sorted.
  const order = new Map<string, number>();
  for (const s of [...after.sessions, ...before.sessions]) {
    if (!order.has(s.id)) order.set(s.id, order.size);
  }
  const position = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  const sorted = (set: Set<string>) => [...set].sort();
  return {
    session_ids: [...touched].sort(
      (a, b) => position(a) - position(b) || (a < b ? -1 : a > b ? 1 : 0),
    ),
    faculty_ids: sorted(faculty),
    group_ids: sorted(groups),
    room_ids: sorted(rooms),
    departments: sorted(departments),
  };
}

// ----------------------------------------------------------------------------- proposals

/**
 * Moves of `result` against `baseline`, exactly as `validator.py --baseline` counts them for the
 * changed dataset; null without a baseline or a feasible result.
 */
function stabilityAgainst(
  result: RescheduleResult,
  baseline: readonly Assignment[] | null,
): BaselineStability | null {
  if (!baseline || !result.feasible) return null;
  const { sessions_moved, time_changed, room_only_changed } = computeStability(
    buildInstance(result.dataset),
    toAssignMap(result.assignments).assign,
    toAssignMap(baseline).assign,
  );
  return { sessions_moved, time_changed, room_only_changed };
}

/** Placements `assignments` doesn't hold exactly (session missing, or at another slot or room). */
export function brokenPlacements(
  placements: readonly Assignment[],
  assignments: readonly Assignment[],
): Assignment[] {
  const at = new Map(assignments.map((a) => [a.session_id, a]));
  return placements.filter((p) => {
    const a = at.get(p.session_id);
    return (
      !a ||
      a.day !== p.day ||
      a.start_period !== p.start_period ||
      a.room_id !== p.room_id
    );
  });
}

/**
 * Validates the request against the data (`400 VALIDATION_ERROR` with `PathIssue` details),
 * checks the requester's scope (`403`), runs the rescheduler on the base timetable, checks the
 * changed data loads like an imported file would, re-checks the rescheduler's verdict (a feasible
 * result with hard violations or unheld placements is a `500`, never a proposal) and builds the
 * proposal. `beforeReschedule` runs just before the rescheduler, after every check that needs no
 * engine run (the caller's pending cap goes there, so a bad request is a `400` / `403` first).
 * Pure apart from what the callbacks do.
 */
export function computeProposal(
  user: SessionUser,
  context: ProposalContext,
  request: ChangeProposalRequest,
  options: ProposeOptions = {},
  beforeReschedule?: () => void,
): ComputedProposal {
  const { dataset, base } = context;
  const issues = validateChanges(dataset, request.changes, request.placements);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    // The engine caps its list (the last entry then says how many more there are), so name the
    // first problem and point at the details rather than counting them here.
    throw validationError(
      `The change can't be applied: ${errors[0].message}${errors.length > 1 ? " (more problems in details)" : ""}`,
      errors.map(({ path, message }) => ({ path, message })),
    );
  }
  assertChangeScope(user, dataset, request);
  if (
    request.changes.length === 0 &&
    brokenPlacements(request.placements, base.assignments).length === 0
  ) {
    throw validationError(
      "Nothing would change: every session is already where the placement puts it.",
      request.placements.map((_, i) => ({
        path: `placements[${i}]`,
        message: "The session is already at this slot and room.",
      })),
    );
  }
  options.precheck?.(context);
  beforeReschedule?.();

  let result: RescheduleResult;
  try {
    result = reschedule({
      dataset,
      baseline: base.assignments,
      changes: request.changes,
      placements: request.placements,
      ...(options.maxDepth !== undefined && {
        options: { maxDepth: options.maxDepth },
      }),
    });
  } catch (err) {
    if (err instanceof DisruptionError) {
      throw validationError(`The change can't be applied: ${err.message}.`);
    }
    throw err;
  }
  // The changed data must load like an imported file would (dangling ids, duplicates), or every
  // later read of the dataset would fail once it is applied.
  validateDataset(result.dataset);
  const unheld = brokenPlacements(request.placements, result.assignments);
  if (
    result.feasible &&
    (result.hard.length > 0 || !result.soft_after || unheld.length > 0)
  ) {
    // The rescheduler's own re-check disagrees with its verdict: never store such a proposal.
    console.error("[changes] rescheduler self-check failed", {
      hard: result.hard.slice(0, 20),
      unheld,
    });
    throw internalError();
  }
  const { feasible } = result;

  const warnings = issues
    .filter((i) => i.severity === "warning")
    .map((i) => i.message);
  if (request.dataset !== undefined && request.dataset !== dataset.dataset_id) {
    warnings.push(
      `This change file was written for dataset ${request.dataset}; the loaded dataset is ${dataset.dataset_id}.`,
    );
  }

  const proposal: ChangeProposal = {
    feasible,
    title: describeChanges(dataset, request.changes, request.placements),
    warnings,
    diff: result.diff,
    moved_count: result.moved_count,
    time_changed: result.time_changed,
    room_only_changed: result.room_only_changed,
    soft_penalty: feasible ? result.soft_after : null,
    soft_delta: feasible ? result.soft_delta : 0,
    hard_violation_count: result.hard.length,
    conflicts: feasible ? [] : result.conflicts,
    scope: computeChangeScope(
      dataset,
      result.dataset,
      request,
      result.diff,
      feasible ? [] : result.conflicts,
    ),
    engine: result.meta,
    baseline_stability: stabilityAgainst(result, context.baseline),
  };
  return { proposal, result };
}
