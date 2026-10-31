/**
 * Pins the AI eval's scoring rules (backend.md §5.6) so the reported accuracy stays honest:
 * clamping, series unions, set equality, overlap, and the cases' check builders.
 */
import { describe, expect, it } from "vitest";
import type { ParseOutcome } from "@/lib/ai";
import type { ParsedBookingDraft } from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";

import { EVAL_CASES, parseWindowSpec, runChecks } from "./ai-eval-cases";
import {
  EVAL_FIELDS,
  accuracyOf,
  clampWindow,
  datasetUnits,
  exactAccuracyOf,
  expandRepeatDays,
  fieldLabel,
  roomTypesExact,
  sameSet,
  sameWindows,
  scoreFields,
  sharesAny,
  type FieldScores,
  type ParsedValues,
} from "./ai-eval-scoring";

const w = (day: string, from_period: number, to_period = from_period) => ({
  day,
  from_period,
  to_period,
});

describe("window scoring", () => {
  it("clamps periods past the last one to P13", () => {
    expect(clampWindow(w("WED", 13, 14))).toEqual(w("WED", 13, 13));
    expect(clampWindow(w("MON", 4, 5))).toEqual(w("MON", 4, 5));
  });

  it("matches a window the dataset wrote past P13 (BR-17: 10 pm to midnight)", () => {
    expect(sameWindows([w("WED", 13, 14)], [w("WED", 13)])).toBe(true);
    expect(sameWindows([w("WED", 13, 14)], [w("WED", 12, 13)])).toBe(false);
  });

  it("is set equality: order and duplicates don't matter, extras and gaps do", () => {
    const expected = [w("THU", 6, 13), w("FRI", 6, 13)];
    expect(sameWindows(expected, [w("FRI", 6, 13), w("THU", 6, 13)])).toBe(
      true,
    );
    expect(
      sameWindows(expected, [
        w("THU", 6, 13),
        w("FRI", 6, 13),
        w("THU", 6, 13),
      ]),
    ).toBe(true);
    expect(sameWindows(expected, [w("THU", 6, 13)])).toBe(false);
    expect(sameWindows(expected, [...expected, w("WED", 6, 13)])).toBe(false);
    expect(sameWindows(expected, [w("THU", 6, 12), w("FRI", 6, 13)])).toBe(
      false,
    );
  });

  it("expands repeat days with the same periods, without duplicates", () => {
    expect(expandRepeatDays([w("MON", 11, 12)], ["TUE", "WED", "MON"])).toEqual(
      [w("MON", 11, 12), w("TUE", 11, 12), w("WED", 11, 12)],
    );
    expect(expandRepeatDays([w("MON", 11)], [])).toEqual([w("MON", 11)]);
  });
});

describe("dataset units", () => {
  const dataset = getBundledDataset();
  const units = datasetUnits(dataset.booking_requests);

  it("parses each series once, against the union of its members' windows", () => {
    expect(units).toHaveLength(dataset.booking_requests.length - 4 - 1);
    const dance = units.find((u) => u.id === "SER-DANCE")!;
    expect(dance.request_ids).toEqual([
      "BR-05a",
      "BR-05b",
      "BR-05c",
      "BR-05d",
      "BR-05e",
    ]);
    expect(dance.expected.windows).toEqual(
      ["MON", "TUE", "WED", "THU", "FRI"].map((d) => w(d, 11, 12)),
    );
    const robo = units.find((u) => u.id === "SER-ROBOWARS")!;
    expect(robo.expected.windows).toEqual([w("THU", 6, 9), w("FRI", 6, 9)]);
    expect(units.map((u) => u.id)).toContain("BR-01");
  });

  it("scores a series by its first day plus repeat days, or by all days listed", () => {
    const dance = units.find((u) => u.id === "SER-DANCE")!;
    const got = (windows: ParsedValues["windows"], repeat_days: string[]) =>
      scoreFields(dance.expected, {
        ...dance.expected,
        windows,
        repeat_days,
      }).windows;
    expect(got([w("MON", 11, 12)], ["TUE", "WED", "THU", "FRI"])).toBe(true);
    expect(got(dance.expected.windows, [])).toBe(true);
    expect(got([w("MON", 11, 12)], [])).toBe(false);
    expect(got([w("MON", 11, 12)], ["TUE", "WED", "THU"])).toBe(false);
  });

  it("gives the dataset's own structured fields 100% (the ground truth is consistent)", () => {
    const scores = units.map((unit) =>
      scoreFields(unit.expected, { ...unit.expected, repeat_days: [] }),
    );
    const accuracy = accuracyOf(scores);
    expect(accuracy.overall.accuracy).toBe(1);
    expect(accuracy.min_field).toBe(1);
  });
});

describe("field rules", () => {
  it("needs and groups are set equality", () => {
    expect(
      sameSet(["projector", "pa_system"], ["pa_system", "projector"]),
    ).toBe(true);
    expect(sameSet(["projector"], ["projector", "projector"])).toBe(true);
    expect(sameSet(["projector"], ["projector", "stage"])).toBe(false);
    expect(sameSet([], [])).toBe(true);
  });

  it("room types need one shared type", () => {
    expect(sharesAny(["seminar_hall"], ["lecture_hall", "seminar_hall"])).toBe(
      true,
    );
    expect(sharesAny(["auditorium"], ["outdoor"])).toBe(false);
    expect(sharesAny(["auditorium"], [])).toBe(false);
  });

  it("room types as an exact set (reported next to the overlap score)", () => {
    const expected = { room_types: ["seminar_hall", "lecture_hall"] };
    expect(
      roomTypesExact(expected, {
        room_types: ["lecture_hall", "seminar_hall"],
      }),
    ).toBe(true);
    expect(roomTypesExact(expected, { room_types: ["seminar_hall"] })).toBe(
      false,
    );
    expect(
      roomTypesExact(expected, {
        room_types: ["seminar_hall", "lecture_hall", "classroom"],
      }),
    ).toBe(false);
  });

  it("attendance and duration are exact (null never matches)", () => {
    const expected = {
      attendance: 140,
      duration_periods: 2,
      windows: [w("THU", 10, 11)],
      needs: ["projector", "pa_system"],
      room_types: ["seminar_hall", "auditorium", "lecture_hall"],
      mandatory_for_groups: [],
    };
    const scores = scoreFields(expected, {
      ...expected,
      attendance: null,
      duration_periods: 3,
      room_types: ["lecture_hall"],
      repeat_days: [],
    });
    expect(scores).toEqual({
      attendance: false,
      duration_periods: false,
      windows: true,
      needs: true,
      room_types: true,
      mandatory_for_groups: true,
    });
    expect(fieldLabel(expected, "windows")).toBe("THU P10–P11");
    expect(fieldLabel({ ...expected, attendance: null }, "attendance")).toBe(
      "null",
    );
  });

  it("overall accuracy is the mean of the per-field accuracies", () => {
    const all = Object.fromEntries(EVAL_FIELDS.map((f) => [f, true]));
    const scores: FieldScores[] = [
      all as FieldScores,
      { ...(all as FieldScores), windows: false, needs: false },
    ];
    const accuracy = accuracyOf(scores);
    expect(accuracy.fields.windows).toEqual({
      correct: 1,
      total: 2,
      accuracy: 0.5,
    });
    expect(accuracy.overall).toEqual({
      correct: 10,
      total: 12,
      accuracy: 10 / 12,
    });
    expect(accuracy.min_field).toBe(0.5);
  });

  it("the exact-set overall swaps the room-type overlap count for the exact count", () => {
    const all = Object.fromEntries(
      EVAL_FIELDS.map((f) => [f, true]),
    ) as FieldScores;
    const scores: FieldScores[] = [all, all, { ...all, needs: false }];
    const exact = exactAccuracyOf(scores, [true, false, false]);
    expect(exact.room_types).toEqual({
      correct: 1,
      total: 3,
      accuracy: 1 / 3,
    });
    // 17 of 18 with overlap; two room-type checks fewer with exact sets.
    expect(accuracyOf(scores).overall.correct).toBe(17);
    expect(exact.overall).toEqual({
      correct: 15,
      total: 18,
      accuracy: 15 / 18,
    });
  });
});

describe("eval cases", () => {
  it("are well formed", () => {
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(EVAL_CASES.filter((c) => c.kind === "sample")).toHaveLength(8);
    expect(
      EVAL_CASES.filter((c) => c.kind === "adversarial").length,
    ).toBeGreaterThanOrEqual(15);
    for (const c of EVAL_CASES) expect(c.checks.length).toBeGreaterThan(0);
    expect(parseWindowSpec("TUE 10-11")).toEqual(w("TUE", 10, 11));
    expect(parseWindowSpec("MON 11")).toEqual(w("MON", 11));
    expect(() => parseWindowSpec("tue 10")).toThrow();
  });

  it("checks pass on the expected parse and report what a wrong one produced", () => {
    const s6 = EVAL_CASES.find((c) => c.id === "S6")!;
    const draft: ParsedBookingDraft = {
      title: null,
      attendance: 100,
      duration_periods: 2,
      windows: [{ day: "TUE", from_period: 10, to_period: 11 }],
      room_types: ["seminar_hall"],
      needs: ["pa_system"],
      requested_room: null,
      mandatory_for_groups: [],
      repeat_days: [],
      assumptions: ["kal → TUE"],
      follow_up: null,
      missing: ["title"],
    };
    const outcome = {
      draft,
      extraction: {},
      requested_room: {
        text: null,
        room_id: null,
        suggestion: null,
        note: null,
      },
      claimed_category: null,
      conditions: [],
      confidence: 0.8,
    } as unknown as ParseOutcome;
    const subject = {
      outcome,
      draft,
      requested_room: outcome.requested_room,
    };
    expect(runChecks(s6, subject).every((c) => c.pass)).toBe(true);

    const wrong: ParsedBookingDraft = {
      ...draft,
      attendance: 90,
      windows: [{ day: "WED", from_period: 10, to_period: 11 }],
    };
    const failed = runChecks(s6, { ...subject, draft: wrong }).filter(
      (c) => !c.pass,
    );
    expect(failed).toEqual([
      { name: "attendance 100", pass: false, got: 90 },
      { name: "windows TUE 10-11", pass: false, got: "WED P10–P11" },
    ]);
  });
});
