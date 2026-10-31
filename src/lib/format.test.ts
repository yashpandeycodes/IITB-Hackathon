import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { CalendarPeriod } from "@/lib/contracts";

import {
  DEFAULT_EXAM_SESSIONS,
  DEFAULT_PERIODS,
  formatDay,
  formatExamSession,
  formatPeriod,
  formatPeriodRange,
  formatPeriodShort,
  formatPeriodTime,
  isEventOnlyPeriod,
} from "./format";

describe("formatDay", () => {
  it("formats short and long names", () => {
    expect(formatDay("MON")).toBe("Mon");
    expect(formatDay("THU", "short")).toBe("Thu");
    expect(formatDay("THU", "long")).toBe("Thursday");
    expect(formatDay("SAT", "long")).toBe("Saturday");
  });
});

describe("formatPeriod", () => {
  it("prefixes the period number", () => {
    expect(formatPeriod(6)).toBe("P6");
    expect(formatPeriod(13)).toBe("P13");
  });
});

describe("formatPeriodTime", () => {
  it("uses the default starter-pack calendar", () => {
    expect(formatPeriodTime(1)).toBe("08:00–09:00");
    expect(formatPeriodTime(5)).toBe("12:00–13:00");
    expect(formatPeriodTime(6)).toBe("14:00–15:00");
    expect(formatPeriodTime(13)).toBe("21:00–22:00");
  });

  it("uses a provided calendar table", () => {
    const periods: CalendarPeriod[] = [
      { id: 1, start: "07:30", end: "08:20", teaching: true },
    ];
    expect(formatPeriodTime(1, periods)).toBe("07:30–08:20");
  });

  it("falls back to the period label when unknown", () => {
    expect(formatPeriodTime(14)).toBe("P14");
  });
});

describe("formatPeriodRange", () => {
  it("treats the end period as inclusive", () => {
    expect(formatPeriodRange(10, 12)).toBe("18:00–21:00");
    expect(formatPeriodRange(2, 4)).toBe("09:00–12:00");
  });

  it("spans lunch without inventing a period", () => {
    expect(formatPeriodRange(5, 6)).toBe("12:00–15:00");
  });

  it("handles a single period and reversed input", () => {
    expect(formatPeriodRange(6, 6)).toBe("14:00–15:00");
    expect(formatPeriodRange(12, 10)).toBe("18:00–21:00");
  });

  it("falls back to period labels when unknown", () => {
    expect(formatPeriodRange(14, 15)).toBe("P14–P15");
    expect(formatPeriodRange(14, 14)).toBe("P14");
  });
});

describe("formatPeriodShort", () => {
  it("formats the compact phone label", () => {
    expect(formatPeriodShort(1)).toBe("P1 · 8 AM");
    expect(formatPeriodShort(5)).toBe("P5 · 12 PM");
    expect(formatPeriodShort(6)).toBe("P6 · 2 PM");
    expect(formatPeriodShort(13)).toBe("P13 · 9 PM");
  });

  it("keeps minutes when not on the hour", () => {
    const periods: CalendarPeriod[] = [
      { id: 1, start: "07:30", end: "08:20", teaching: true },
    ];
    expect(formatPeriodShort(1, periods)).toBe("P1 · 7:30 AM");
  });
});

describe("formatExamSession", () => {
  it("formats AM and PM slots", () => {
    expect(formatExamSession("AM")).toBe("09:30–11:30");
    expect(formatExamSession("PM")).toBe("14:00–16:00");
  });

  it("uses a provided session table", () => {
    expect(
      formatExamSession("AM", [{ id: "AM", start: "10:00", end: "12:00" }]),
    ).toBe("10:00–12:00");
  });
});

describe("isEventOnlyPeriod", () => {
  it("flags P10–P13 only", () => {
    expect(isEventOnlyPeriod(9)).toBe(false);
    expect(isEventOnlyPeriod(10)).toBe(true);
    expect(isEventOnlyPeriod(13)).toBe(true);
    expect(isEventOnlyPeriod(1)).toBe(false);
  });

  it("reads the teaching flag from a provided calendar", () => {
    const periods: CalendarPeriod[] = [
      { id: 9, start: "17:00", end: "18:00", teaching: false },
    ];
    expect(isEventOnlyPeriod(9, periods)).toBe(true);
  });
});

describe("default tables", () => {
  it("mirror the bundled dataset calendar", () => {
    const path = fileURLToPath(
      new URL("../../data/cit_public.json", import.meta.url),
    );
    const dataset = JSON.parse(readFileSync(path, "utf8")) as {
      calendar: {
        periods: CalendarPeriod[];
        exam_week: { sessions: { id: string; start: string; end: string }[] };
      };
    };
    expect(DEFAULT_PERIODS).toEqual(dataset.calendar.periods);
    expect(DEFAULT_EXAM_SESSIONS).toEqual(dataset.calendar.exam_week.sessions);
  });
});
