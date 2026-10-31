/**
 * Display-only formatting for days, periods and exam slots (docs/frontend.md §3.3).
 * Data is never stored pre-formatted; the engine reads the real dataset calendar.
 * Every helper accepts an optional calendar table and falls back to a copy of the
 * starter-pack calendar for display.
 */
import type {
  CalendarPeriod,
  ExamDay,
  ExamSession,
  ExamWeekSession,
} from "@/lib/contracts";

export const DEFAULT_PERIODS: readonly CalendarPeriod[] = [
  { id: 1, start: "08:00", end: "09:00", teaching: true },
  { id: 2, start: "09:00", end: "10:00", teaching: true },
  { id: 3, start: "10:00", end: "11:00", teaching: true },
  { id: 4, start: "11:00", end: "12:00", teaching: true },
  { id: 5, start: "12:00", end: "13:00", teaching: true },
  { id: 6, start: "14:00", end: "15:00", teaching: true },
  { id: 7, start: "15:00", end: "16:00", teaching: true },
  { id: 8, start: "16:00", end: "17:00", teaching: true },
  { id: 9, start: "17:00", end: "18:00", teaching: true },
  { id: 10, start: "18:00", end: "19:00", teaching: false },
  { id: 11, start: "19:00", end: "20:00", teaching: false },
  { id: 12, start: "20:00", end: "21:00", teaching: false },
  { id: 13, start: "21:00", end: "22:00", teaching: false },
];

export const DEFAULT_EXAM_SESSIONS: readonly ExamWeekSession[] = [
  { id: "AM", start: "09:30", end: "11:30" },
  { id: "PM", start: "14:00", end: "16:00" },
];

/** First period that is events-only when no calendar entry says otherwise. */
const FIRST_EVENT_ONLY_PERIOD = 10;

const EN_DASH = "–";

const DAY_NAMES: Record<ExamDay, { short: string; long: string }> = {
  MON: { short: "Mon", long: "Monday" },
  TUE: { short: "Tue", long: "Tuesday" },
  WED: { short: "Wed", long: "Wednesday" },
  THU: { short: "Thu", long: "Thursday" },
  FRI: { short: "Fri", long: "Friday" },
  SAT: { short: "Sat", long: "Saturday" },
};

/** `"MON"` → `"Mon"` (short) or `"Monday"` (long). Accepts exam-week days too. */
export function formatDay(
  day: ExamDay,
  style: "short" | "long" = "short",
): string {
  return DAY_NAMES[day][style];
}

/** `6` → `"P6"`. */
export function formatPeriod(period: number): string {
  return `P${period}`;
}

function findPeriod(
  period: number,
  periods: readonly CalendarPeriod[],
): CalendarPeriod | undefined {
  return periods.find((p) => p.id === period);
}

/** `6` → `"14:00–15:00"`. Unknown periods fall back to `"P<n>"`. */
export function formatPeriodTime(
  period: number,
  periods: readonly CalendarPeriod[] = DEFAULT_PERIODS,
): string {
  const p = findPeriod(period, periods);
  return p ? `${p.start}${EN_DASH}${p.end}` : formatPeriod(period);
}

/** Inclusive range: `(10, 12)` → `"18:00–21:00"` (booking `start_period`..`end_period`). */
export function formatPeriodRange(
  start: number,
  endInclusive: number,
  periods: readonly CalendarPeriod[] = DEFAULT_PERIODS,
): string {
  const first = findPeriod(Math.min(start, endInclusive), periods);
  const last = findPeriod(Math.max(start, endInclusive), periods);
  if (!first || !last) {
    return start === endInclusive
      ? formatPeriod(start)
      : `${formatPeriod(start)}${EN_DASH}${formatPeriod(endInclusive)}`;
  }
  return `${first.start}${EN_DASH}${last.end}`;
}

/** Compact phone label: `6` → `"P6 · 2 PM"`, `1` → `"P1 · 8 AM"`; keeps minutes when a period starts off the hour. */
export function formatPeriodShort(
  period: number,
  periods: readonly CalendarPeriod[] = DEFAULT_PERIODS,
): string {
  const p = findPeriod(period, periods);
  if (!p) return formatPeriod(period);
  const [hh, mm] = p.start.split(":").map(Number);
  const suffix = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  const clock = mm ? `${hour12}:${String(mm).padStart(2, "0")}` : `${hour12}`;
  return `${formatPeriod(period)} · ${clock} ${suffix}`;
}

/** `"AM"` → `"09:30–11:30"`, `"PM"` → `"14:00–16:00"`. */
export function formatExamSession(
  session: ExamSession,
  sessions: readonly ExamWeekSession[] = DEFAULT_EXAM_SESSIONS,
): string {
  const slot = sessions.find((s) => s.id === session);
  return slot ? `${slot.start}${EN_DASH}${slot.end}` : session;
}

/** P10–P13 are for events only (no teaching). */
export function isEventOnlyPeriod(
  period: number,
  periods: readonly CalendarPeriod[] = DEFAULT_PERIODS,
): boolean {
  const p = findPeriod(period, periods);
  return p ? !p.teaching : period >= FIRST_EVENT_ONLY_PERIOD;
}
