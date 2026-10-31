/**
 * Test-only fixtures built from the bundled `cit_public.json`. Never import this from engine
 * code: it loads the dataset module, which the engine must not depend on.
 */
import type { Assignment, Dataset } from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";

import type { Violation } from "@/lib/contracts";

/** A private deep copy of the public dataset. */
export function publicDataset(): Dataset {
  return structuredClone(getBundledDataset());
}

/** The public dataset reduced to these sessions, so a short hand-made timetable can be complete. */
export function datasetWith(
  sessionIds: readonly string[],
  edit?: (dataset: Dataset) => void,
): Dataset {
  const dataset = publicDataset();
  const keep = new Set(sessionIds);
  dataset.sessions = dataset.sessions.filter((s) => keep.has(s.id));
  edit?.(dataset);
  return dataset;
}

export function at(
  session_id: string,
  day: Assignment["day"],
  start_period: number,
  room_id: string,
): Assignment {
  return { session_id, day, start_period, room_id };
}

/**
 * A complete, clash-free timetable for `SMALL_SESSIONS`: a combined lecture, a lab, a basket of
 * three electives, an accessible-room lecture and two plain lectures.
 */
export const SMALL_TIMETABLE: readonly Assignment[] = [
  at("MA101-AB-L1", "MON", 2, "LH-1"),
  at("PH191-A-P1", "TUE", 2, "PHY-LAB"),
  at("ID101-ALL-L1", "WED", 3, "AUD"),
  at("OE301-L1", "THU", 3, "LH-3"),
  at("OE302-L1", "THU", 3, "LH-5"),
  at("OE303-L1", "THU", 3, "CR-101"),
  at("ME201-L1", "MON", 3, "LH-2"),
  at("CS201-L1", "MON", 2, "CR-102"),
  at("EC301-L1", "THU", 8, "CR-104"),
];

export const SMALL_SESSIONS = SMALL_TIMETABLE.map((a) => a.session_id);

/** `SMALL_TIMETABLE` with some entries replaced (matched by session id) or added. */
export function withChanges(...changes: readonly Assignment[]): Assignment[] {
  const out = SMALL_TIMETABLE.map((a) => ({ ...a }));
  for (const change of changes) {
    const i = out.findIndex((a) => a.session_id === change.session_id);
    if (i === -1) out.push(change);
    else out[i] = change;
  }
  return out;
}

export const rulesOf = (violations: readonly Violation[]) =>
  violations.map((v) => v.rule);

export const detailsOf = (violations: readonly Violation[]) =>
  violations.map((v) => v.detail);
