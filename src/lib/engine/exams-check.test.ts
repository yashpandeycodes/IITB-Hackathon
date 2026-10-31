import { describe, expect, it } from "vitest";

import { checkExams, examSeats } from "./exams-check";
import { buildInstance } from "./instance";
import { detailsOf, publicDataset } from "./test-fixtures";
import type { ExamPlacementInput } from "./types";

/** Only the first-year exams, so the rest of the list need not be scheduled. */
const instance = buildInstance(
  (() => {
    const d = publicDataset();
    d.exams = d.exams.filter((e) =>
      ["EX-MA101", "EX-PH101", "EX-CS101"].includes(e.id),
    );
    return d;
  })(),
);

const exam = (
  exam_id: string,
  day: string,
  session: string,
  rooms: string[],
): ExamPlacementInput => ({ exam_id, day, session, rooms });

const VALID = [
  exam("EX-MA101", "MON", "AM", ["AUD", "LH-1", "LH-2"]),
  exam("EX-PH101", "TUE", "AM", ["AUD", "LH-1", "LH-2"]),
  exam("EX-CS101", "WED", "AM", ["AUD", "LH-1", "LH-2"]),
];

describe("checkExams", () => {
  it("accepts one exam per group per day with enough half-capacity seats", () => {
    expect(checkExams(instance, VALID)).toEqual({ violations: [], penalty: 0 });
  });

  it("H5: rooms seat half their capacity, rounded down", () => {
    expect(examSeats(25)).toBe(12);
    const { violations } = checkExams(instance, [
      exam("EX-MA101", "MON", "AM", ["AUD", "LH-1"]),
      ...VALID.slice(1),
    ]);
    expect(violations).toEqual([
      {
        rule: "H5",
        where: "exams",
        detail: "EX-MA101: 350 seats at half capacity for 360 students",
      },
    ]);
  });

  it("E2: a room that cannot host exams adds no seats", () => {
    const { violations } = checkExams(instance, [
      exam("EX-MA101", "MON", "AM", ["AUD", "LH-1", "LH-2", "OAT", "NOPE"]),
      ...VALID.slice(1),
    ]);
    expect(detailsOf(violations)).toEqual([
      "EX-MA101: OAT cannot host exams",
      "EX-MA101: NOPE cannot host exams",
    ]);
  });

  it("E1: unknown, repeated, invalid slot and missing exams", () => {
    const { violations } = checkExams(instance, [
      exam("EX-ZZ", "MON", "AM", ["AUD"]),
      VALID[0],
      exam("EX-MA101", "THU", "AM", ["AUD", "LH-1", "LH-2"]),
      exam("EX-PH101", "SUN", "AM", ["AUD"]),
    ]);
    expect(violations.map((v) => `${v.rule} ${v.detail}`)).toEqual([
      "E1 Unknown exam EX-ZZ",
      "E1 EX-MA101 scheduled twice",
      "E1 EX-PH101: invalid slot",
      "E1 EX-CS101 not scheduled",
    ]);
  });

  it("H4 and H3: shared rooms and groups in one slot (printed as Python lists)", () => {
    const { violations } = checkExams(instance, [
      VALID[0],
      exam("EX-PH101", "MON", "AM", ["AUD", "SH-1"]),
      VALID[2],
    ]);
    expect(detailsOf(violations)).toEqual([
      "EX-PH101: 325 seats at half capacity for 360 students",
      "AUD has ['EX-MA101', 'EX-PH101'] in MON AM",
      "Group Y1-A has ['EX-MA101', 'EX-PH101'] in MON AM",
      "Group Y1-B has ['EX-MA101', 'EX-PH101'] in MON AM",
      "Group Y1-C has ['EX-MA101', 'EX-PH101'] in MON AM",
      "Group Y1-D has ['EX-MA101', 'EX-PH101'] in MON AM",
    ]);
  });

  it("soft: 5 points per extra exam a group sits on one day", () => {
    const { violations, penalty } = checkExams(instance, [
      VALID[0],
      exam("EX-PH101", "MON", "PM", ["AUD", "LH-1", "LH-2"]),
      VALID[2],
    ]);
    expect(violations).toEqual([]);
    expect(penalty).toBe(4 * 5);
  });
});
