import { describe, expect, it } from "vitest";

import {
  DisruptionSchema,
  ValidatorReportSchema,
  type ScheduleExport,
} from "@/lib/contracts";

import scheduleExample from "../../../CrunchWeek_StarterPack/examples/schedule.example.json";
import sampleDisruption from "../../../data/sample_disruption.json";

import { applyDisruption } from "./disruption";
import {
  SMALL_SESSIONS,
  SMALL_TIMETABLE,
  at,
  datasetWith,
  publicDataset,
  withChanges,
} from "./test-fixtures";
import { validateSchedule } from "./validate";

const small = datasetWith(SMALL_SESSIONS, (d) => {
  d.exams = d.exams.filter((e) => e.id === "EX-MA101");
});

const smallSchedule = (sessions = [...SMALL_TIMETABLE]): ScheduleExport => ({
  team: "Test",
  dataset_id: small.dataset_id,
  sessions,
  fest_week: { bookings: [], session_overrides: [] },
  exams: [
    {
      exam_id: "EX-MA101",
      day: "MON",
      session: "AM",
      rooms: ["AUD", "LH-1", "LH-2"],
    },
  ],
});

describe("validateSchedule", () => {
  it("matches the official validator on the starter-pack example", () => {
    const report = validateSchedule(publicDataset(), scheduleExample);
    expect(report.hard_violation_count).toBe(224);
    expect(report.hard_by_rule).toEqual({ H1: 184, E1: 40 });
    expect(report.soft_total).toBe(0);
    expect(report.exam_soft_penalty).toBe(0);
    expect(report.bookings).toMatchObject({
      booking_score: 6,
      booking_score_max_if_all_approved: 70,
      approved: 1,
      alternatives: 1,
      rejected: 1,
      session_overrides: 1,
      priority_inversions: [],
    });
    expect(report.warnings).toHaveLength(22);
    expect(report.dataset_id).toBe("cit-public-v1");
    expect(report.team).toBe(scheduleExample.team);
  });

  it("returns a report that satisfies the shared contract", () => {
    const report = validateSchedule(publicDataset(), scheduleExample);
    expect(ValidatorReportSchema.parse(report)).toEqual(report);
  });

  it("a clean schedule has no hard violations", () => {
    const report = validateSchedule(small, smallSchedule());
    expect(report.hard_violations).toEqual([]);
    expect(report.hard_by_rule).toEqual({});
    expect(report.stability).toBeUndefined();
  });

  it("counts a base-timetable problem once, though the Spectra week repeats it", () => {
    const report = validateSchedule(
      small,
      smallSchedule(withChanges(at("CS201-L1", "MON", 2, "LH-1"))),
    );
    expect(report.hard_violations).toEqual([
      {
        rule: "H4",
        where: "timetable",
        detail: "LH-1 double-booked MON P2: CS201-L1, MA101-AB-L1",
      },
    ]);
  });

  it("without fest_week there are no booking stats", () => {
    const noFest = { ...smallSchedule(), fest_week: undefined };
    expect(validateSchedule(small, noFest).bookings).toBeUndefined();
  });

  it("exams are required in a plain check, optional in a disruption check", () => {
    const noExams = { ...smallSchedule(), exams: undefined };
    const plain = validateSchedule(small, noExams);
    expect(plain.hard_by_rule).toEqual({ E1: 1 });
    expect(plain.exam_soft_penalty).toBe(0);

    const after = validateSchedule(small, noExams, smallSchedule());
    expect(after.hard_violations).toEqual([]);
    expect(after.exam_soft_penalty).toBeUndefined();
  });

  it("reports stability against the baseline", () => {
    const after = smallSchedule(
      withChanges(
        at("CS201-L1", "MON", 2, "CR-103"),
        at("ME201-L1", "TUE", 3, "LH-2"),
        at("ZZ-NEW", "MON", 1, "LH-1"),
      ),
    );
    const { stability } = validateSchedule(small, after, smallSchedule());
    expect(stability).toEqual({
      sessions_moved: 2,
      time_changed: 1,
      room_only_changed: 1,
      moved_ids: ["CS201-L1", "ME201-L1"],
    });
  });

  it("checks a schedule against the disrupted dataset", () => {
    const disrupted = applyDisruption(
      small,
      DisruptionSchema.parse(sampleDisruption),
    );
    const after = smallSchedule([
      ...SMALL_TIMETABLE,
      at("CS202-T2", "MON", 4, "CR-102"),
    ]);
    const report = validateSchedule(disrupted, after, smallSchedule());
    // CR-102 is closed all week: the existing CS201-L1 and the new tutorial both hit H8.
    expect(report.hard_violations.map((v) => v.detail)).toEqual([
      "CS201-L1: CR-102 unavailable MON P2",
      "CS202-T2: CR-102 unavailable MON P4",
    ]);
    expect(report.stability?.sessions_moved).toBe(0);
  });

  it("de-duplicates repeated sessions to a single H1", () => {
    const report = validateSchedule(
      small,
      smallSchedule([
        ...SMALL_TIMETABLE,
        at("CS201-L1", "MON", 2, "CR-102"),
        at("CS201-L1", "MON", 2, "CR-102"),
      ]),
    );
    expect(report.hard_violations).toEqual([
      {
        rule: "H1",
        where: "timetable",
        detail: "Session CS201-L1 appears more than once",
      },
    ]);
  });
});
