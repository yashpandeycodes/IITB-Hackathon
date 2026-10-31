/**
 * End-to-end over the public dataset: solve → schedule exams → decide Spectra bookings → the
 * validator port. This is the `schedule.json` the app exports, so it must have 0 hard violations.
 */
import { describe, expect, it } from "vitest";

import { decideBookings } from "./bookings";
import { scheduleExams } from "./exams";
import { buildInstance } from "./instance";
import { solve } from "./solver";
import { publicDataset } from "./test-fixtures";
import { validateSchedule } from "./validate";

describe("engine end to end (public dataset, seed 42)", () => {
  it("produces a schedule with 0 hard violations, booking score 67 and exam penalty 0", () => {
    const dataset = publicDataset();
    const instance = buildInstance(dataset);

    const timetable = solve(instance, {
      seed: 42,
      timeBudgetMs: Number.POSITIVE_INFINITY,
    });
    expect(timetable.unplaced).toEqual([]);
    expect(timetable.hard).toEqual([]);
    expect(timetable.fest.cost).toBe(0);
    // The headline result: the proven soft floor (S4 = 3, F08's CS204) straight from the greedy.
    expect(timetable.stopped_by).toBe("converged");
    expect(timetable.soft.total).toBe(3);
    expect(timetable.soft.penalties).toEqual({
      S1: 0,
      S2: 0,
      S3: 0,
      S4: 3,
      S5: 0,
      S6: 0,
    });

    const exams = scheduleExams(instance);
    expect(exams.violations).toEqual([]);

    const spectra = decideBookings(instance, timetable.assignments);
    expect(spectra.violations).toEqual([]);

    const report = validateSchedule(dataset, {
      team: "e2e",
      dataset_id: dataset.dataset_id,
      sessions: timetable.assignments,
      fest_week: {
        bookings: spectra.decisions.map(
          ({
            request_id,
            status,
            day,
            start_period,
            end_period,
            room_id,
            reason,
          }) => ({
            request_id,
            status,
            day,
            start_period,
            end_period,
            room_id,
            reason,
          }),
        ),
        session_overrides: spectra.overrides,
      },
      exams: exams.exams,
    });

    expect(report.hard_violation_count).toBe(0);
    expect(report.warnings).toEqual([]);
    expect(report.soft_total).toBe(timetable.soft.total);
    expect(report.soft_total).toBe(3);
    expect(report.exam_soft_penalty).toBe(0);
    expect(report.bookings?.booking_score).toBe(67);
    expect(report.bookings?.booking_score_max_if_all_approved).toBe(70);
    expect(report.bookings?.priority_inversions).toEqual([]);
  }, 30_000);
});
