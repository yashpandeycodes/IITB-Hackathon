/**
 * Wording helpers for Spectra booking reasons (backend.md §3.4 templates). Pure string
 * formatting from facts the engine already has: no locale APIs, so output is identical
 * everywhere.
 */
import type { Instance } from "./instance";
import { MAX_PERIOD } from "./types";

/** Clock times per period id, plus the event day's opening and closing times. */
export type Clock = {
  readonly times: ReadonlyMap<number, { start: string; end: string }>;
  /** Start of the first period, e.g. "08:00". */
  readonly opens: string;
  /** End of the last bookable period (P13), e.g. "22:00". */
  readonly closes: string;
  /** "Week 7" from the calendar's fest-week label. */
  readonly weekLabel: string;
};

export function clockOf(instance: Instance): Clock {
  const { calendar } = instance.dataset;
  const times = new Map<number, { start: string; end: string }>();
  for (const p of calendar.periods)
    times.set(p.id, { start: p.start, end: p.end });
  const ids = [...times.keys()].sort((a, b) => a - b);
  const lastId = times.has(MAX_PERIOD) ? MAX_PERIOD : ids[ids.length - 1];
  const week = /Week\s*\d+/.exec(calendar.fest_week ?? "");
  return {
    times,
    opens: ids.length > 0 ? (times.get(ids[0])?.start ?? "") : "",
    closes: lastId !== undefined ? (times.get(lastId)?.end ?? "") : "",
    weekLabel: week ? week[0].replace(/\s+/, " ") : "the fest week",
  };
}

/** "P10–P11", or "P8" for a single period. */
export function periodsLabel(a: number, b: number): string {
  return a === b ? `P${a}` : `P${a}–P${b}`;
}

/** "THU P10–P11 (18:00–20:00)"; the clock part is left out when the calendar lacks a period. */
export function span(clock: Clock, day: string, a: number, b: number): string {
  const from = clock.times.get(a);
  const to = clock.times.get(b);
  const label = `${day} ${periodsLabel(a, b)}`;
  return from && to ? `${label} (${from.start}–${to.end})` : label;
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  exam: "exam",
  regular_session: "regular session",
  institute_event: "institute event",
  guest_lecture: "guest lecture",
  department_event: "department event",
  club_event: "club event",
};

/** "institute event" for `institute_event`. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

/** First letter upper-cased. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ROOM_TYPE_LABELS: Readonly<Record<string, string>> = {
  lab_cs: "CS lab",
  lab_elec: "electronics lab",
  lab_phy: "physics lab",
  lab_civil: "civil lab",
};

export function roomTypeLabel(type: string): string {
  return ROOM_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

/** "auditorium/outdoor" for `["auditorium", "outdoor"]`. */
export function roomTypesLabel(types: readonly string[]): string {
  return types.length > 0 ? types.map(roomTypeLabel).join("/") : "matching";
}

/** Needs keep their dataset names (`pa_system`), except `accessible`, which reads as a phrase. */
export function needLabel(need: string): string {
  return need === "accessible" ? "wheelchair access" : need;
}

/** "a", "a and b", "a, b and c". */
export function listLabel(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function needsLabel(needs: readonly string[]): string {
  return listLabel(needs.map(needLabel));
}

/** "1,200" for 1200 (hand-rolled thousands separators). */
export function formatCount(n: number): string {
  const [whole, fraction] = String(n).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * "3 Feb 2027" from the date prefix of an ISO timestamp, or null when there is no real date
 * (no prefix, month 13, 30 Feb, …). Leap years are not checked: 29 Feb is always accepted.
 */
export function formatDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const month = MONTHS[monthIndex];
  if (month === undefined || day < 1 || day > DAYS_IN_MONTH[monthIndex]) {
    return null;
  }
  return `${day} ${month} ${match[1]}`;
}

/** Appends a full stop unless the text already ends with sentence punctuation. */
export function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** "Cancelled by Robotics Club on 3 Feb 2027: Workshop moved to after Spectra." */
export function cancelledReason(by: string, at: string, note: string): string {
  let text = "Cancelled";
  if (by.trim()) text += ` by ${by.trim()}`;
  const date = formatDate(at);
  if (date) text += ` on ${date}`;
  if (note.trim()) text += `: ${note.trim()}`;
  return sentence(text);
}
