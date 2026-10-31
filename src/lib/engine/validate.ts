/**
 * The full validator report for a schedule, ported from `run()` in `validator.py`.
 * For a disruption check, apply the change first (`applyDisruption`) and pass the baseline.
 */
import type {
  Dataset,
  Stability,
  ValidatorReport,
  Violation,
} from "@/lib/contracts";

import { checkBookings } from "./bookings-check";
import { checkAssignMap, duplicateViolation, toAssignMap } from "./checker";
import { checkExams } from "./exams-check";
import { buildInstance, type Instance } from "./instance";
import { pyEquals, sortedStrings } from "./py";
import { softScoreMap } from "./soft";
import type { AssignMap, ScheduleInput } from "./types";

const asText = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

/**
 * Drops repeated (rule, detail) pairs, keeping the first. The Spectra-week view repeats every
 * base-timetable problem, and the validator counts each once.
 */
export function dedupeViolations(
  violations: readonly Violation[],
): Violation[] {
  const seen = new Set<string>();
  const unique: Violation[] = [];
  for (const x of violations) {
    const key = `${x.rule}\u0001${x.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(x);
  }
  return unique;
}

/** Sessions placed differently from the baseline (unknown and newly added sessions excluded). */
export function computeStability(
  instance: Instance,
  assign: AssignMap,
  baseline: AssignMap,
): Stability {
  const moved: string[] = [];
  let time_changed = 0;
  let room_only_changed = 0;
  for (const [sid, now] of assign) {
    const before = baseline.get(sid);
    if (before === undefined || typeof sid !== "string") continue;
    if (!instance.sessions.has(sid)) continue;
    const sameTime =
      pyEquals(now.day, before.day) &&
      pyEquals(now.start_period, before.start_period);
    if (sameTime && pyEquals(now.room_id, before.room_id)) continue;
    moved.push(sid);
    if (sameTime) room_only_changed += 1;
    else time_changed += 1;
  }
  return {
    sessions_moved: moved.length,
    time_changed,
    room_only_changed,
    moved_ids: sortedStrings(moved),
  };
}

/**
 * `run(data, sched, baseline)`: hard violations (de-duplicated), soft penalties, Spectra-week
 * stats when `fest_week` is present, exams (required unless this is a disruption check with no
 * exams in the schedule) and stability against the baseline.
 */
export function validateSchedule(
  dataset: Dataset,
  schedule: ScheduleInput,
  baseline?: ScheduleInput | null,
): ValidatorReport {
  const instance = buildInstance(dataset);
  const { assign, duplicates } = toAssignMap(schedule.sessions);
  const V: Violation[] = [
    ...checkAssignMap(instance, assign, "timetable").violations,
  ];
  for (const sid of duplicates) V.push(duplicateViolation(sid, "timetable"));

  const soft = softScoreMap(instance, assign);
  const W: string[] = [];
  let bookings: ValidatorReport["bookings"];
  if (schedule.fest_week !== undefined && schedule.fest_week !== null) {
    const result = checkBookings(instance, assign, schedule.fest_week);
    V.push(...result.violations);
    W.push(...result.warnings);
    bookings = result.stats;
  }

  const hasBaseline = baseline !== undefined && baseline !== null;
  const scheduleExams = Array.isArray(schedule.exams) ? schedule.exams : [];
  let exam_soft_penalty: number | undefined;
  if (instance.exams.size > 0 && (!hasBaseline || scheduleExams.length > 0)) {
    const result = checkExams(instance, scheduleExams);
    V.push(...result.violations);
    exam_soft_penalty = result.penalty;
  }

  const stability = hasBaseline
    ? computeStability(instance, assign, toAssignMap(baseline.sessions).assign)
    : undefined;

  const hard_violations = dedupeViolations(V);
  const hard_by_rule: Record<string, number> = {};
  for (const x of hard_violations) {
    hard_by_rule[x.rule] = (hard_by_rule[x.rule] ?? 0) + 1;
  }

  return {
    dataset_id: asText(dataset.dataset_id),
    schedule_dataset_id: asText(schedule.dataset_id),
    team: asText(schedule.team),
    soft_penalties: soft.penalties,
    soft_total: soft.total,
    ...(bookings && { bookings }),
    ...(exam_soft_penalty !== undefined && { exam_soft_penalty }),
    ...(stability && { stability }),
    hard_violations,
    hard_violation_count: hard_violations.length,
    hard_by_rule,
    warnings: W,
  };
}
