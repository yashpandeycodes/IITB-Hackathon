/**
 * Exam-week checks (E1, E2, H5, H4, H3 and the exam soft penalty), ported from `check_exams` in
 * `validator.py`. Rooms seat half their capacity (`capacity // 2`) during exams.
 */
import type { Violation } from "@/lib/contracts";

import type { Instance } from "./instance";
import { pyRepr, pyStr, tupleKey } from "./py";
import type { ExamPlacementInput } from "./types";

export type ExamsCheck = {
  violations: Violation[];
  /** 5 points for each extra exam a group sits on the same day. */
  penalty: number;
};

/** Exams in one (room or group, day, session) cell, in placement order. */
type SlotUse = { owner: string; day: string; session: string; eids: string[] };

/** Seats a room offers during exams. */
export function examSeats(capacity: number): number {
  return Math.floor(capacity / 2);
}

/** `check_exams(ctx, exams_out)`. */
export function checkExams(
  instance: Instance,
  exams: readonly ExamPlacementInput[],
): ExamsCheck {
  const V: Violation[] = [];
  const v = (rule: string, detail: string) =>
    V.push({ rule, where: "exams", detail });
  const roomUse = new Map<string, SlotUse>();
  const grpUse = new Map<string, SlotUse>();
  const grpDay = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const record = (
    map: Map<string, SlotUse>,
    owner: string,
    day: string,
    session: string,
    eid: string,
  ) => {
    const key = tupleKey(owner, day, session);
    const entry = map.get(key);
    if (entry) entry.eids.push(eid);
    else map.set(key, { owner, day, session, eids: [eid] });
  };

  for (const e of exams) {
    const eid = e.exam_id ?? null;
    const exam = typeof eid === "string" ? instance.exams.get(eid) : undefined;
    if (exam === undefined) {
      v("E1", `Unknown exam ${pyStr(eid)}`);
      continue;
    }
    if (seen.has(exam.id)) v("E1", `${exam.id} scheduled twice`);
    seen.add(exam.id);
    const { day, session } = e;
    if (
      typeof day !== "string" ||
      !instance.exam_days.includes(day) ||
      typeof session !== "string" ||
      !instance.exam_sessions.has(session)
    ) {
      v("E1", `${exam.id}: invalid slot`);
      continue;
    }
    let seats = 0;
    for (const rid of Array.isArray(e.rooms) ? (e.rooms as unknown[]) : []) {
      const r = typeof rid === "string" ? instance.rooms.get(rid) : undefined;
      if (r === undefined || !r.allowed_uses.includes("exam")) {
        v("E2", `${exam.id}: ${pyStr(rid)} cannot host exams`);
        continue;
      }
      seats += examSeats(r.capacity);
      record(roomUse, r.id, day, session, exam.id);
    }
    if (seats < exam.size) {
      v(
        "H5",
        `${exam.id}: ${seats} seats at half capacity for ${exam.size} students`,
      );
    }
    for (const g of exam.groups) {
      record(grpUse, g, day, session, exam.id);
      const key = tupleKey(g, day);
      let set = grpDay.get(key);
      if (!set) grpDay.set(key, (set = new Set()));
      set.add(exam.id);
    }
  }
  for (const eid of instance.exams.keys()) {
    if (!seen.has(eid)) v("E1", `${eid} not scheduled`);
  }
  for (const { owner, day, session, eids } of roomUse.values()) {
    if (eids.length > 1)
      v("H4", `${owner} has ${pyRepr(eids)} in ${day} ${session}`);
  }
  for (const { owner, day, session, eids } of grpUse.values()) {
    if (eids.length > 1) {
      v("H3", `Group ${owner} has ${pyRepr(eids)} in ${day} ${session}`);
    }
  }
  let penalty = 0;
  for (const set of grpDay.values()) {
    if (set.size > 1) penalty += 5 * (set.size - 1);
  }
  return { violations: V, penalty };
}
