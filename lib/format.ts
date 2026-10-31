/**
 * CIT Nexus - Central Time & Formatter Helpers
 * Strictly according to frontend spec §3.3
 */

import { DayCode, PeriodId } from './contracts';

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
  // Spectra Week Evening Event Periods
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

export function formatPeriodTiming(period: PeriodId, compact = false): string {
  const p = PERIOD_MAP[period];
  if (!p) return period;
  return compact ? p.short : p.timing;
}

export function formatDay(code: DayCode, full = false): string {
  const found = DAYS_LIST.find((d) => d.code === code);
  if (!found) return code;
  return full ? found.full : found.compact;
}

export function formatLunch(): { name: string; timing: string } {
  return { name: 'Lunch', timing: '13:00–14:00' };
}

