import { describe, expect, it } from "vitest";

import { buildInstance } from "./instance";
import { softScore } from "./soft";
import {
  SMALL_SESSIONS,
  SMALL_TIMETABLE,
  at,
  datasetWith,
} from "./test-fixtures";

const ZERO = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 };
const instanceFor = (ids: string[]) => buildInstance(datasetWith(ids));

describe("softScore", () => {
  it("returns every key, and the total is their sum", () => {
    const { penalties, total } = softScore(
      buildInstance(datasetWith(SMALL_SESSIONS)),
      SMALL_TIMETABLE,
    );
    expect(Object.keys(penalties)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
    ]);
    expect(total).toBe(Object.values(penalties).reduce((a, b) => a + b, 0));
  });

  it("S1: 2 points per taught hour inside an avoided period", () => {
    const instance = instanceFor(["CS201-L1", "CS202-L1"]);
    // F02 avoids P1 on every day; F06 avoids Friday afternoons.
    expect(
      softScore(instance, [at("CS201-L1", "MON", 1, "CR-102")]).penalties.S1,
    ).toBe(2);
    expect(
      softScore(instance, [at("CS201-L1", "MON", 2, "CR-102")]).penalties.S1,
    ).toBe(0);
    expect(
      softScore(instance, [at("CS202-L1", "FRI", 6, "CR-102")]).penalties.S1,
    ).toBe(2);
    expect(
      softScore(instance, [at("CS202-L1", "THU", 6, "CR-102")]).penalties.S1,
    ).toBe(0);
  });

  it("S1: an avoid preference without days applies to every calendar day", () => {
    const instance = buildInstance(
      datasetWith(["CS202-L1"], (d) => {
        const f06 = d.faculty.find((f) => f.id === "F06")!;
        f06.preferences = [{ type: "avoid", periods: [6, 7, 8, 9] }];
      }),
    );
    expect(
      softScore(instance, [at("CS202-L1", "THU", 6, "CR-102")]).penalties.S1,
    ).toBe(2);
  });

  it("S2: 1 point per idle period between a group's first and last class", () => {
    const instance = instanceFor(["CS201-L1", "CS202-L1"]);
    const { penalties } = softScore(instance, [
      at("CS201-L1", "MON", 2, "CR-102"),
      at("CS202-L1", "MON", 5, "CR-102"),
    ]);
    expect(penalties).toEqual({ ...ZERO, S2: 2 });
  });

  it("S3 and S4: 7 hours in a day, three lectures of two courses", () => {
    const ids = [
      "CS203-L1",
      "CS201-L1",
      "CS201-L2",
      "CS201-L3",
      "CS202-L1",
      "CS202-L2",
      "CS202-L3",
    ];
    const { penalties, total } = softScore(
      instanceFor(ids),
      ids.map((id, i) => at(id, "MON", i + 1, "CR-102")),
    );
    expect(penalties).toEqual({ ...ZERO, S3: 3, S4: 12 });
    expect(total).toBe(15);
  });

  it("S4: tutorials don't count as a repeated lecture", () => {
    const { penalties } = softScore(instanceFor(["CS202-L1", "CS202-T1"]), [
      at("CS202-L1", "TUE", 2, "CR-102"),
      at("CS202-T1", "TUE", 3, "CR-102"),
    ]);
    expect(penalties.S4).toBe(0);
  });

  it("S4: two basket lectures of one course on the same day", () => {
    const instance = instanceFor(["OE301-L1", "OE301-L2"]);
    const sameDay = softScore(instance, [
      at("OE301-L1", "THU", 3, "LH-3"),
      at("OE301-L2", "THU", 4, "LH-3"),
    ]);
    expect(sameDay.penalties).toEqual({ ...ZERO, S4: 3 });
    const apart = softScore(instance, [
      at("OE301-L1", "THU", 3, "LH-3"),
      at("OE301-L2", "FRI", 3, "LH-3"),
    ]);
    expect(apart.penalties.S4).toBe(0);
  });

  it("S3: a basket slot counts once toward a group's hours", () => {
    const ids = [
      "CS301-L1",
      "CS302-L1",
      "CS303-L1",
      "CS391-P1",
      "OE301-L1",
      "OE302-L1",
      "OE303-L1",
    ];
    const { penalties } = softScore(instanceFor(ids), [
      at("CS301-L1", "TUE", 1, "CR-101"),
      at("CS302-L1", "TUE", 2, "CR-101"),
      at("CS303-L1", "TUE", 3, "CR-101"),
      at("OE301-L1", "TUE", 4, "LH-3"),
      at("OE302-L1", "TUE", 4, "LH-5"),
      at("OE303-L1", "TUE", 4, "CR-101"),
      at("CS391-P1", "TUE", 6, "CS-LAB-1"),
    ]);
    // CSE-3: 3 lectures + 1 basket hour + a 3-hour lab = 7 hours (not 9), idle at P5.
    expect(penalties).toEqual({ ...ZERO, S2: 1, S3: 3 });
  });

  it("S5: room less than 40% full; exactly 40% is fine", () => {
    const instance = instanceFor(["CS201-L1"]);
    expect(
      softScore(instance, [at("CS201-L1", "MON", 2, "AUD")]).penalties.S5,
    ).toBe(1);
    expect(
      softScore(instance, [at("CS201-L1", "MON", 2, "LH-1")]).penalties.S5,
    ).toBe(0);
  });

  it("S6: any session that uses P9", () => {
    const instance = instanceFor(["CS201-L1", "PH191-A-P1"]);
    expect(
      softScore(instance, [at("CS201-L1", "MON", 9, "CR-102")]).penalties.S6,
    ).toBe(1);
    expect(
      softScore(instance, [at("PH191-A-P1", "MON", 6, "PHY-LAB")]).penalties.S6,
    ).toBe(0);
  });

  it("skips placements with an unknown session or room", () => {
    const { total } = softScore(instanceFor(["CS201-L1"]), [
      at("CS201-L1", "MON", 1, "NOPE"),
      at("ZZ-1", "MON", 1, "CR-102"),
    ]);
    expect(total).toBe(0);
  });
});
