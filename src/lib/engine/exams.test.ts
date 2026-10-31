import { describe, expect, it } from "vitest";

import type { Dataset } from "@/lib/contracts";

import { scheduleExams } from "./exams";
import { checkExams, examSeats } from "./exams-check";
import { buildInstance } from "./instance";
import { mulberry32, randomInt } from "./rng";
import { publicDataset } from "./test-fixtures";

const PUBLIC = buildInstance(publicDataset());

describe("scheduleExams (public dataset)", () => {
  const result = scheduleExams(PUBLIC);

  it("places all 41 exams with no violations and no same-day penalty", () => {
    expect(result.violations).toEqual([]);
    expect(result.penalty).toBe(0);
    expect(result.unplaced).toEqual([]);
    expect(result.exams).toHaveLength(41);
    expect(checkExams(PUBLIC, result.exams)).toEqual({
      violations: [],
      penalty: 0,
    });
  });

  it("lists each exam once, in dataset order, with enough seats", () => {
    expect(result.exams.map((e) => e.exam_id)).toEqual([
      ...PUBLIC.exams.keys(),
    ]);
    for (const placement of result.exams) {
      const exam = PUBLIC.exams.get(placement.exam_id)!;
      const seats = placement.rooms.reduce(
        (sum, id) => sum + examSeats(PUBLIC.rooms.get(id)!.capacity),
        0,
      );
      expect(seats).toBeGreaterThanOrEqual(exam.size);
      expect(new Set(placement.rooms).size).toBe(placement.rooms.length);
    }
  });

  it("never lists a room twice in one slot", () => {
    const used = new Set<string>();
    for (const e of result.exams) {
      for (const room of e.rooms) {
        const key = `${e.day} ${e.session} ${room}`;
        expect(used.has(key)).toBe(false);
        used.add(key);
      }
    }
  });

  it("packs the 295-seat basket exam into AUD plus one small room", () => {
    const basket = result.exams.find((e) => e.exam_id === "EX-OE-BASKET")!;
    expect(basket.rooms).toHaveLength(2);
    expect(basket.rooms[0]).toBe("AUD");
  });

  it("avoids LH-4 on Thursday (closed for repairs)", () => {
    for (const e of result.exams) {
      if (e.day === "THU") expect(e.rooms).not.toContain("LH-4");
    }
    // The validator ignores maintenance, so turning the preference off is still valid.
    expect(
      scheduleExams(PUBLIC, { avoidRoomUnavailability: false }).violations,
    ).toEqual([]);
  });

  it("is deterministic, with one DSATUR step per exam and no repair work", () => {
    const again = scheduleExams(PUBLIC);
    expect(again).toEqual(result);
    expect(result.iterations).toBe(41);
  });
});

describe("scheduleExams (synthetic)", () => {
  it("spreads a group with seven exams over six days at the lowest penalty", () => {
    const dataset = publicDataset();
    dataset.exams = Array.from({ length: 7 }, (_, i) => ({
      id: `EX-X${i + 1}`,
      course_ids: [`X${i + 1}`],
      groups: ["CSE-2"],
      size: 80,
      duration_hours: 2,
    }));
    const result = scheduleExams(buildInstance(dataset));
    expect(result.violations).toEqual([]);
    expect(result.unplaced).toEqual([]);
    expect(result.penalty).toBe(5);
  });

  it("leaves out exams that cannot be seated, without throwing", () => {
    const dataset: Dataset = publicDataset();
    for (const room of dataset.rooms) {
      room.capacity = Math.min(room.capacity, 30);
    }
    const result = scheduleExams(buildInstance(dataset));
    // 19 exam rooms × 15 seats = 285 per slot: the 360-, 320- and 295-student exams cannot fit.
    expect(result.unplaced.length).toBeGreaterThan(0);
    expect(result.exams.length + result.unplaced.length).toBe(41);
    const unplacedE1 = result.violations.filter((v) => v.rule === "E1");
    expect(unplacedE1).toHaveLength(result.unplaced.length);
    expect(result.violations.every((v) => v.rule === "E1")).toBe(true);
  });

  it("stays valid on random tight instances (evictions, improvement, omissions)", () => {
    const rng = mulberry32(2027);
    const base = publicDataset();
    const groups = base.student_groups.map((g) => g.id);
    let omitted = 0;
    let penalised = 0;
    for (let trial = 0; trial < 60; trial++) {
      const dataset = publicDataset();
      dataset.calendar.exam_week.days = ["MON", "TUE", "WED"].slice(
        0,
        1 + randomInt(rng, 3),
      ) as Dataset["calendar"]["exam_week"]["days"];
      dataset.rooms = dataset.rooms.filter(() => rng() < 0.4);
      dataset.exams = Array.from(
        { length: 4 + randomInt(rng, 10) },
        (_, i) => ({
          id: `EX-R${i}`,
          course_ids: [`R${i}`],
          // Distinct groups: the validator reports a group listed twice in one exam as H3.
          groups: [
            ...new Set(
              Array.from(
                { length: 1 + randomInt(rng, 2) },
                () => groups[randomInt(rng, groups.length)],
              ),
            ),
          ],
          size: 10 + randomInt(rng, 200),
          duration_hours: 2,
        }),
      );
      const instance = buildInstance(dataset);
      const result = scheduleExams(instance);
      expect(result.exams.length + result.unplaced.length).toBe(
        dataset.exams.length,
      );
      // Only omitted exams may be reported.
      expect(result.violations.map((v) => v.rule)).toEqual(
        result.unplaced.map(() => "E1"),
      );
      expect(result.penalty).toBe(checkExams(instance, result.exams).penalty);
      omitted += result.unplaced.length;
      if (result.penalty > 0) penalised++;
    }
    expect(omitted).toBeGreaterThan(0);
    expect(penalised).toBeGreaterThan(0);
  });

  it("handles an empty exam list", () => {
    const dataset = publicDataset();
    dataset.exams = [];
    expect(scheduleExams(buildInstance(dataset))).toEqual({
      exams: [],
      violations: [],
      penalty: 0,
      unplaced: [],
      iterations: 0,
    });
  });
});
