/**
 * Soft penalties S1–S6, ported from `soft_score` in `validator.py`.
 */
import { isAvoidPreference, type SoftPenalties } from "@/lib/contracts";

import { block, toAssignMap } from "./checker";
import type { Instance } from "./instance";
import { isPyInt, tupleKey } from "./py";
import {
  LAST_TEACHING_PERIOD,
  type AssignMap,
  type AssignmentInput,
} from "./types";

export type SoftScore = { penalties: SoftPenalties; total: number };

/**
 * `soft_score(ctx, assign)`. Placements with an unknown session or room are skipped; every other
 * placement is scored even if it breaks a hard rule (an invalid day still counts as a day).
 * A start that is not an integer is skipped too (the validator itself cannot score it).
 */
export function softScoreMap(instance: Instance, assign: AssignMap): SoftScore {
  const pen: SoftPenalties = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 };
  const grpDay = new Map<string, Set<number>>();
  const grpHours = new Map<string, number>();
  const grpCourse = new Map<string, number>();
  const seenBasket = new Set<string>();
  const basketCourse = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string, by: number) =>
    map.set(key, (map.get(key) ?? 0) + by);

  for (const [sid, { day, start_period: start, room_id: rid }] of assign) {
    const s = typeof sid === "string" ? instance.sessions.get(sid) : undefined;
    const r = typeof rid === "string" ? instance.rooms.get(rid) : undefined;
    if (s === undefined || r === undefined || !isPyInt(start)) continue;
    const per = block(start, s.duration);

    for (const pref of instance.faculty.get(s.faculty_id)?.preferences ?? []) {
      if (!isAvoidPreference(pref)) continue;
      const days: readonly unknown[] = pref.days ?? instance.days;
      if (days.includes(day)) {
        pen.S1 += 2 * per.filter((p) => pref.periods.includes(p)).length;
      }
    }
    if (r.capacity && s.size / r.capacity < 0.4) pen.S5 += 1;
    if (per.includes(LAST_TEACHING_PERIOD)) pen.S6 += 1;

    for (const g of s.groups) {
      const gd = tupleKey(g, day);
      let periods = grpDay.get(gd);
      if (!periods) grpDay.set(gd, (periods = new Set()));
      for (const p of per) periods.add(p);
      if (s.basket_slot) {
        const seen = tupleKey(g, s.basket_slot);
        if (seenBasket.has(seen)) continue;
        seenBasket.add(seen);
      }
      bump(grpHours, gd, s.duration);
      if (s.kind === "lecture" && !s.basket_slot) {
        bump(grpCourse, tupleKey(g, day, s.course_id), 1);
      }
    }
  }

  for (const periods of grpDay.values()) {
    const min = Math.min(...periods);
    const max = Math.max(...periods);
    for (let p = min; p <= max; p++) if (!periods.has(p)) pen.S2 += 1;
  }
  for (const hours of grpHours.values()) {
    if (hours > 6) pen.S3 += 3 * (hours - 6);
  }
  for (const count of grpCourse.values()) {
    if (count > 1) pen.S4 += 3 * (count - 1);
  }
  // Basket lectures of the same course twice in a day; counted even when the room is unknown.
  for (const [sid, { day }] of assign) {
    const s = typeof sid === "string" ? instance.sessions.get(sid) : undefined;
    if (s?.basket_slot) bump(basketCourse, tupleKey(s.course_id, day), 1);
  }
  for (const count of basketCourse.values()) {
    if (count > 1) pen.S4 += 3 * (count - 1);
  }
  const total = pen.S1 + pen.S2 + pen.S3 + pen.S4 + pen.S5 + pen.S6;
  return { penalties: pen, total };
}

/** Soft penalties for a list of assignments (a repeated session counts once, at its last placement). */
export function softScore(
  instance: Instance,
  assignments: readonly AssignmentInput[],
): SoftScore {
  return softScoreMap(instance, toAssignMap(assignments).assign);
}
