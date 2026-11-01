/**
 * Display helpers for change requests (pure, client-safe): rule names, slot / day / period
 * labels and timestamps.
 */
import type { SlotRef } from "@/lib/contracts";

/** Short names for the validator's rule codes (docs/backend.md, "Validator rules"). */
export const RULE_LABELS: Readonly<Record<string, string>> = {
  H1: "scheduled exactly once",
  H2: "faculty double-booked",
  H3: "group double-booked",
  H4: "room double-booked",
  H5: "room too small",
  H6: "wrong room type",
  H7: "faculty unavailable",
  H8: "room closed",
  H9: "outside P1–P9, across lunch or a bad lab start",
  H10: "needs an accessible room",
  H11: "basket sessions not aligned",
  H12: "faculty over daily hours",
  H13: "booking invalid",
  H14: "fixed slot not respected",
};

export function ruleLabel(code: string): string | undefined {
  return RULE_LABELS[code];
}

/** `[1,2,3,6]` → `"P1–P3, P6"`. */
export function formatPeriodList(periods: readonly number[]): string {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const p of sorted) {
    if (start === null || prev === null) {
      start = p;
    } else if (p !== prev + 1) {
      parts.push(start === prev ? `P${start}` : `P${start}–P${prev}`);
      start = p;
    }
    prev = p;
  }
  if (start !== null && prev !== null)
    parts.push(start === prev ? `P${start}` : `P${start}–P${prev}`);
  return parts.join(", ");
}

const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** `["MON","TUE","WED","THU","FRI"]` → `"MON–FRI"`; otherwise a comma list. */
export function formatDayList(days: readonly string[]): string {
  const sorted = [...new Set(days)].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b),
  );
  if (sorted.length >= 3) {
    const idx = sorted.map((d) => DAY_ORDER.indexOf(d));
    const contiguous =
      idx.every((v) => v >= 0) &&
      idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    if (contiguous) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  }
  return sorted.join(", ");
}

/** `{ day: "WED", start_period: 2, room_id: "CR-102" }` → `"WED P2 · CR-102"` (P2–P3 for 2 periods). */
export function formatSlot(slot: SlotRef | null, duration = 1): string {
  if (!slot) return "—";
  const end = slot.start_period + Math.max(1, duration) - 1;
  const periods =
    end > slot.start_period
      ? `P${slot.start_period}–P${end}`
      : `P${slot.start_period}`;
  return `${slot.day} ${periods} · ${slot.room_id}`;
}

/** ISO timestamp → "1 Nov, 09:24" (local time). */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `3` → `"+3"`, `-2` → `"−2"`, `0` → `"±0"`. */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "±0";
}
