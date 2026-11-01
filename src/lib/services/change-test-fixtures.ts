/**
 * Test-only stand-ins for the rescheduler (`reschedule`, `validateChanges`, `describeChanges`,
 * `checkPlacement`) on the tiny dataset (`test-fixtures.ts`), so the change-request services can
 * be tested on their own: a brute-force repair that re-places only the sessions whose slot breaks
 * a hard rule, first free slot in day / period / room order. The checker, soft scorer and
 * `applyDisruption` stay real (direct module imports, so the fakes keep working when a test mocks
 * the `@/lib/engine` barrel).
 */
import {
  ChangeProposalRequestSchema,
  type Assignment,
  type ChangeProposalRequest,
  type ChangeProposalRequestInput,
  type Dataset,
  type DisruptionChange,
  type MoveDiff,
  type SoftPenaltySummary,
} from "@/lib/contracts";
import type {
  ChangeIssue,
  PlacementCheck,
  RescheduleInput,
  RescheduleResult,
} from "@/lib/engine";
import { checkTimetable } from "@/lib/engine/checker";
import { applyDisruption } from "@/lib/engine/disruption";
import { buildInstance } from "@/lib/engine/instance";
import { softScore } from "@/lib/engine/soft";

const summary = (
  instance: ReturnType<typeof buildInstance>,
  assignments: readonly Assignment[],
): SoftPenaltySummary => {
  const { penalties, total } = softScore(instance, assignments);
  return { ...penalties, total };
};

const slotOf = (a: Assignment) => ({
  day: a.day,
  start_period: a.start_period,
  room_id: a.room_id,
});

const sameSlot = (a: Assignment, b: Assignment) =>
  a.day === b.day &&
  a.start_period === b.start_period &&
  a.room_id === b.room_id;

/** A deterministic minimal repair for small datasets (see the module comment). */
export function fakeReschedule(input: RescheduleInput): RescheduleResult {
  const changes = input.changes ?? [];
  const placements = input.placements ?? [];
  const dataset = applyDisruption(input.dataset, { changes });
  const instance = buildInstance(dataset);
  const count = (assignments: readonly Assignment[]) =>
    checkTimetable(instance, assignments).violations.length;

  const pinned = new Map(placements.map((p) => [p.session_id, p]));
  const baseline = new Map(input.baseline.map((a) => [a.session_id, a]));
  const current = new Map<string, Assignment>();
  for (const s of dataset.sessions) {
    const a = pinned.get(s.id) ?? baseline.get(s.id);
    if (a) current.set(s.id, { ...slotOf(a), session_id: s.id });
  }
  const list = () => [...current.values()];

  let nodes = 0;
  let broken = 0;
  const conflicts: RescheduleResult["conflicts"] = [];
  const causes = new Map<string, MoveDiff["cause"]>();
  for (const s of dataset.sessions) {
    if (pinned.has(s.id)) {
      causes.set(s.id, "requested");
      continue;
    }
    const own = current.get(s.id);
    current.delete(s.id);
    const without = count(list());
    if (own && count([...list(), own]) === without - 1) {
      current.set(s.id, own);
      continue;
    }
    broken += 1;
    causes.set(s.id, own ? "broken" : "added");
    let found: Assignment | null = null;
    search: for (const day of dataset.calendar.days) {
      for (const period of dataset.calendar.periods) {
        if (!period.teaching) continue;
        for (const room of dataset.rooms) {
          nodes += 1;
          const candidate: Assignment = {
            session_id: s.id,
            day,
            start_period: period.id,
            room_id: room.id,
          };
          if (count([...list(), candidate]) === without - 1) {
            found = candidate;
            break search;
          }
        }
      }
    }
    if (found) current.set(s.id, found);
    else {
      if (own) current.set(s.id, own);
      conflicts.push({
        session_id: s.id,
        blocking: [{ rule: "H7", count: 1, detail: "no free slot" }],
        contradictions: [],
        summary: `No slot is free for ${s.id}.`,
      });
    }
  }

  const assignments = dataset.sessions.flatMap((s) => {
    const a = current.get(s.id);
    return a ? [a] : [];
  });
  const hard = checkTimetable(instance, assignments).violations;
  const feasible = conflicts.length === 0 && hard.length === 0;

  const diff: MoveDiff[] = [];
  let moved = 0;
  let timeChanged = 0;
  for (const a of assignments) {
    const before = baseline.get(a.session_id);
    if (before && sameSlot(before, a)) continue;
    const cause = causes.get(a.session_id) ?? "broken";
    if (!before) {
      diff.push({
        session_id: a.session_id,
        from: null,
        to: slotOf(a),
        move: "added",
        cause: "added",
        rules: [],
        displaced_by: null,
        reason: `${a.session_id} added`,
      });
      continue;
    }
    moved += 1;
    const sameTime =
      before.day === a.day && before.start_period === a.start_period;
    if (!sameTime) timeChanged += 1;
    diff.push({
      session_id: a.session_id,
      from: slotOf(before),
      to: slotOf(a),
      move: sameTime
        ? "room_only"
        : before.room_id === a.room_id
          ? "time_only"
          : "time_and_room",
      cause,
      rules: cause === "broken" ? ["H7"] : [],
      displaced_by: null,
      reason: `${a.session_id} moved`,
    });
  }
  const kept = new Set(dataset.sessions.map((s) => s.id));
  for (const a of input.baseline) {
    if (kept.has(a.session_id)) continue;
    diff.push({
      session_id: a.session_id,
      from: slotOf(a),
      to: null,
      move: "removed",
      cause: "removed",
      rules: [],
      displaced_by: null,
      reason: `${a.session_id} removed`,
    });
  }

  const soft_before = summary(buildInstance(input.dataset), input.baseline);
  const soft_after = feasible ? summary(instance, assignments) : null;
  return {
    feasible,
    dataset,
    assignments,
    diff,
    moved_count: moved,
    time_changed: timeChanged,
    room_only_changed: moved - timeChanged,
    soft_before,
    soft_after,
    soft_delta: soft_after ? soft_after.total - soft_before.total : 0,
    hard,
    conflicts,
    meta: {
      broken,
      evictions: 0,
      depth: 0,
      nodes,
      ms: 3,
      stopped_by: "complete",
      algorithm: "fake repair",
    },
  };
}

/** Unknown faculty, rooms and sessions, and added ids that already exist, are errors. */
export function fakeValidateChanges(
  dataset: Dataset,
  changes: readonly DisruptionChange[],
  placements: readonly Assignment[] = [],
): ChangeIssue[] {
  const issues: ChangeIssue[] = [];
  const faculty = new Set(dataset.faculty.map((f) => f.id));
  const rooms = new Set(dataset.rooms.map((r) => r.id));
  const sessions = new Set(dataset.sessions.map((s) => s.id));
  const error = (path: string, message: string) =>
    issues.push({ path, message, severity: "error" });
  changes.forEach((c, i) => {
    const at = `changes[${i}]`;
    switch (c.type) {
      case "faculty_unavailable":
        if (!faculty.has(c.faculty_id))
          error(`${at}.faculty_id`, `Unknown faculty ${c.faculty_id}.`);
        for (const day of c.days) {
          if (!dataset.calendar.days.includes(day as never)) {
            issues.push({
              path: `${at}.days`,
              message: `${day} is not a teaching day; it is ignored.`,
              severity: "warning",
            });
          }
        }
        break;
      case "room_unavailable":
        if (!rooms.has(c.room_id))
          error(`${at}.room_id`, `Unknown room ${c.room_id}.`);
        break;
      case "add_faculty":
        if (faculty.has(c.faculty.id))
          error(`${at}.faculty.id`, `Faculty ${c.faculty.id} already exists.`);
        faculty.add(c.faculty.id);
        break;
      case "add_session":
        if (sessions.has(c.session.id))
          error(`${at}.session.id`, `Session ${c.session.id} already exists.`);
        if (!faculty.has(c.session.faculty_id))
          error(
            `${at}.session.faculty_id`,
            `Unknown faculty ${c.session.faculty_id}.`,
          );
        sessions.add(c.session.id);
        break;
      case "remove_session":
        if (!sessions.has(c.session_id))
          error(`${at}.session_id`, `Unknown session ${c.session_id}.`);
        sessions.delete(c.session_id);
        break;
    }
  });
  placements.forEach((p, i) => {
    if (!sessions.has(p.session_id))
      error(`placements[${i}].session_id`, `Unknown session ${p.session_id}.`);
    if (!rooms.has(p.room_id))
      error(`placements[${i}].room_id`, `Unknown room ${p.room_id}.`);
  });
  return issues;
}

export function fakeDescribeChanges(
  _dataset: Dataset,
  changes: readonly DisruptionChange[],
  placements: readonly Assignment[] = [],
): string {
  return [
    ...changes.map((c) => c.type),
    ...placements.map((p) => `place ${p.session_id}`),
  ].join(" · ");
}

/** The violations the merged timetable has that the current one doesn't. */
export function fakeCheckPlacement(input: {
  dataset: Dataset;
  assignments: readonly Assignment[];
  placement: Assignment;
}): PlacementCheck {
  const instance = buildInstance(input.dataset);
  const before = checkTimetable(instance, input.assignments).violations;
  const merged = [
    ...input.assignments.filter(
      (a) => a.session_id !== input.placement.session_id,
    ),
    input.placement,
  ];
  const seen = new Set(before.map((v) => `${v.rule}|${v.detail}`));
  const violations = checkTimetable(instance, merged).violations.filter(
    (v) => !seen.has(`${v.rule}|${v.detail}`),
  );
  return {
    ok: violations.length === 0,
    violations,
    soft_delta:
      softScore(instance, merged).total -
      softScore(instance, input.assignments).total,
    blockers: [],
  };
}

/** A tutorial for G1, taught by `faculty_id` (an `add_session` change on the tiny dataset). */
export function tinyTutorial(id = "C1-T1", faculty_id = "F1") {
  return {
    id,
    course_id: "C1",
    kind: "tutorial" as const,
    groups: ["G1"],
    faculty_id,
    size: 50,
    duration: 1,
    room_types: ["classroom", "lecture_hall"],
    needs_accessible: false,
    basket_slot: null,
    fixed_slot: null,
  };
}

/** A parsed `ChangeProposalRequest` (defaults applied), as the routes hand it to the services. */
export function proposal(
  request: ChangeProposalRequestInput,
): ChangeProposalRequest {
  return ChangeProposalRequestSchema.parse(request);
}
