/**
 * Small text helpers for the rescheduler's titles, move reasons and conflict reports:
 * day and period ranges ("MON–FRI", "P1–P3, P6"), lists ("a, b and c") and clipped free text.
 */
import type { Session } from "@/lib/contracts";

/** Longest free-text reason (from a change file) quoted in a sentence. */
export const REASON_CHARS = 120;

/** `text` cut to `max` characters with an ellipsis, whitespace collapsed. */
export function clip(text: string, max = REASON_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** "a", "a and b", "a, b and c". */
export function listJoin(items: readonly string[], word = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

/** Distinct values in first-seen order. */
export function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

/**
 * Days in calendar order, with runs of consecutive calendar days joined: "MON–FRI",
 * "MON, WED". Days outside the calendar are listed last, as given.
 */
export function formatDays(
  days: readonly string[],
  calendar: readonly string[],
): string {
  const wanted = new Set(days);
  const parts: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length === 1) parts.push(run[0]);
    else if (run.length > 1) parts.push(`${run[0]}–${run[run.length - 1]}`);
    run = [];
  };
  for (const day of calendar) {
    if (wanted.has(day)) run.push(day);
    else flush();
  }
  flush();
  for (const day of unique(days)) if (!calendar.includes(day)) parts.push(day);
  return parts.join(", ");
}

/** Periods as ranges: "P1–P9", "P2", "P1–P3, P6". */
export function formatPeriods(periods: readonly number[]): string {
  const sorted = unique(periods).sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j === i ? `P${sorted[i]}` : `P${sorted[i]}–P${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** "MON P2". */
export function slotLabel(day: string, start: number): string {
  return `${day} P${start}`;
}

const ROOM_TYPE_NAMES: Readonly<Record<string, string>> = {
  classroom: "classroom",
  lecture_hall: "lecture hall",
  auditorium: "auditorium",
  seminar_hall: "seminar hall",
  outdoor: "outdoor venue",
  lab_cs: "CS lab",
  lab_elec: "electronics lab",
  lab_phy: "physics lab",
  workshop: "workshop",
  lab_civil: "civil lab",
};

/** A readable room type ("lab_cs" → "CS lab"). */
export function roomTypeName(type: string): string {
  return ROOM_TYPE_NAMES[type] ?? type;
}

/**
 * The room a session needs, for sentences: "room ≥ 80 seats", "accessible CS lab ≥ 60 seats".
 * One allowed type is named; several read as "room".
 */
export function roomNeed(session: Session): string {
  const kind =
    session.room_types.length === 1
      ? roomTypeName(session.room_types[0])
      : "room";
  const access = session.needs_accessible ? "accessible " : "";
  return `${access}${kind} ≥ ${session.size} seats`;
}

/** "1 slot" / "3 slots". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
