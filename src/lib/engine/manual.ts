/**
 * Manual placement checks (backend.md §3.6): what a placement would break if applied as is, and
 * who is in the way. The violations come from the validator port, so they read exactly like the
 * validator's report.
 */
import type { Assignment, Dataset, Violation } from "@/lib/contracts";

import { block, checkTimetable } from "./checker";
import { Occupancy } from "./conflicts";
import { buildInstance, isTeachingDay } from "./instance";
import { isPyInt } from "./py";
import { softScore } from "./soft";

export type PlacementCheck = {
  /** True when the placement adds no hard violation. */
  ok: boolean;
  /** Violations the merged timetable has that the current one doesn't (validator wording). */
  violations: Violation[];
  /** Change in total soft penalty if applied as is. */
  soft_delta: number;
  /** Sessions occupying a room, faculty or group cell the placement needs. */
  blockers: string[];
};

const violationKey = (v: Violation) => `${v.rule}\u0001${v.detail}`;

/**
 * `assignments` with one session moved to `placement` (appended when it isn't there; every
 * other entry kept as is).
 */
export function mergePlacement(
  assignments: readonly Assignment[],
  placement: Assignment,
): Assignment[] {
  const merged: Assignment[] = [];
  let done = false;
  for (const a of assignments) {
    if (a.session_id !== placement.session_id) {
      merged.push(a);
    } else if (!done) {
      merged.push({ ...placement });
      done = true;
    }
  }
  if (!done) merged.push({ ...placement });
  return merged;
}

/** Violations of `after` that `before` doesn't have, keyed on rule and detail. */
export function newViolations(
  before: readonly Violation[],
  after: readonly Violation[],
): Violation[] {
  const seen = new Set(before.map(violationKey));
  return after.filter((v) => !seen.has(violationKey(v)));
}

/** Checks `placement` against `assignments` with every other session where it is. */
export function checkPlacement(input: {
  dataset: Dataset;
  assignments: readonly Assignment[];
  placement: Assignment;
}): PlacementCheck {
  const { assignments, placement } = input;
  const instance = buildInstance(input.dataset);
  const merged = mergePlacement(assignments, placement);
  const violations = newViolations(
    checkTimetable(instance, assignments).violations,
    checkTimetable(instance, merged).violations,
  );
  const soft_delta =
    softScore(instance, merged).total - softScore(instance, assignments).total;

  const blockers = new Set<string>();
  const s = instance.sessions.get(placement.session_id);
  const { day, start_period: start, room_id } = placement;
  if (s && isTeachingDay(instance, day) && isPyInt(start)) {
    const occ = new Occupancy(instance, assignments, new Set([s.id]));
    // Basket siblings share their groups' cells by design, so they never block on groups.
    const sameBasket = (id: string) =>
      Boolean(s.basket_slot) &&
      instance.sessions.get(id)?.basket_slot === s.basket_slot;
    for (const p of block(start, s.duration)) {
      for (const id of occ.room(room_id, day, p)) blockers.add(id);
      for (const id of occ.faculty(s.faculty_id, day, p)) blockers.add(id);
      for (const g of s.groups) {
        for (const id of occ.group(g, day, p))
          if (!sameBasket(id)) blockers.add(id);
      }
    }
  }
  const order = [...instance.sessions.keys()];
  return {
    ok: violations.length === 0,
    violations,
    soft_delta,
    blockers: [...blockers].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
  };
}
