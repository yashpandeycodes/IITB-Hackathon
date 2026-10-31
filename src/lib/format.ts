/**
 * Display-only formatting for days, periods and exam slots (docs/frontend.md §3.3).
 * Shared across frontend components and backend validator/services.
 */

import type {
  CalendarPeriod,
  ExamDay,
  ExamSession,
  ExamWeekSession,
} from "@/lib/contracts";

export type DayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type PeriodId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9' | 'P10' | 'P11' | 'P12' | 'P13';

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

export const PERIOD_MAP: Record<PeriodId, { timing: string; short: string; label: string; startHour: number }> = {
  P1: { timing: '08:00–09:00', short: 'P1 · 8 AM', label: 'Period 1 (08:00)', startHour: 8 },
  P2: { timing: '09:00–10:00', short: 'P2 · 9 AM', label: 'Period 2 (09:00)', startHour: 9 },
  P3: { timing: '10:00–11:00', short: 'P3 · 10 AM', label: 'Period 3 (10:00)', startHour: 10 },
  P4: { timing: '11:00–12:00', short: 'P4 · 11 AM', label: 'Period 4 (11:00)', startHour: 11 },
  P5: { timing: '12:00–13:00', short: 'P5 · 12 PM', label: 'Period 5 (12:00)', startHour: 12 },
  P6: { timing: '14:00–15:00', short: 'P6 · 2 PM', label: 'Period 6 (14:00)', startHour: 14 },
  P7: { timing: '15:00–16:00', short: 'P7 · 3 PM', label: 'Period 7 (15:00)', startHour: 15 },
  P8: { timing: '16:00–17:00', short: 'P8 · 4 PM', label: 'Period 8 (16:00)', startHour: 16 },
  P9: { timing: '17:00–18:00', short: 'P9 · 5 PM', label: 'Period 9 (17:00)', startHour: 17 },
  P10: { timing: '18:00–19:00', short: 'P10 · 6 PM', label: 'Period 10 (18:00)', startHour: 18 },
  P11: { timing: '19:00–20:00', short: 'P11 · 7 PM', label: 'Period 11 (19:00)', startHour: 19 },
  P12: { timing: '20:00–21:00', short: 'P12 · 8 PM', label: 'Period 12 (20:00)', startHour: 20 },
  P13: { timing: '21:00–22:00', short: 'P13 · 9 PM', label: 'Period 13 (21:00)', startHour: 21 },
};

export const DAYS_LIST: Array<{ code: DayCode; full: string; compact: string }> = [
  { code: 'MON', full: 'Monday', compact: 'Mon' },
  { code: 'TUE', full: 'Tuesday', compact: 'Tue' },
  { code: 'WED', full: 'Wednesday', compact: 'Wed' },
  { code: 'THU', full: 'Thursday', compact: 'Thu' },
  { code: 'FRI', full: 'Friday', compact: 'Fri' },
];

export const EXAM_SLOTS: Record<'AM' | 'PM', { timing: string; label: string }> = {
  AM: { timing: '09:30–11:30', label: 'Morning Slot (AM)' },
  PM: { timing: '14:00–16:00', label: 'Afternoon Slot (PM)' },
};

export const DEFAULT_EXAM_SESSIONS: readonly ExamWeekSession[] = [
  { id: "AM", start: "09:30", end: "11:30" },
  { id: "PM", start: "14:00", end: "16:00" },
];

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

/** `"MON"` → `"Mon"` (short) or `"Monday"` (long). Accepts boolean or style string. */
export function formatDay(
  day: ExamDay | DayCode,
  style: "short" | "long" | boolean = "short",
): string {
  const resolvedStyle = typeof style === 'boolean' ? (style ? 'long' : 'short') : style;
  return DAY_NAMES[day as ExamDay]?.[resolvedStyle] || day;
}

/** `6` → `"P6"`. */
export function formatPeriod(period: number): string {
  return `P${period}`;
}

export function formatPeriodTiming(period: PeriodId, compact = false): string {
  const p = PERIOD_MAP[period];
  if (!p) return period;
  return compact ? p.short : p.timing;
}

export function formatLunch(): { name: string; timing: string } {
  return { name: 'Lunch', timing: '13:00–14:00' };
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

/** Inclusive range: `(10, 12)` → `"18:00–21:00"` */
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

/** Compact phone label: `6` → `"P6 · 2 PM"`, `1` → `"P1 · 8 AM"` */
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
