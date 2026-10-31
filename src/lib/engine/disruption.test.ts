import { describe, expect, it } from "vitest";

import {
  DisruptionSchema,
  FacultySchema,
  SessionSchema,
  type Disruption,
} from "@/lib/contracts";

import sampleDisruption from "../../../data/sample_disruption.json";

import { DisruptionError, applyDisruption } from "./disruption";
import {
  buildInstance,
  isFacultyUnavailable,
  isRoomUnavailable,
} from "./instance";
import { publicDataset } from "./test-fixtures";

const base = publicDataset();
const frozen = JSON.stringify(base);
const apply = (changes: unknown[]) =>
  applyDisruption(base, DisruptionSchema.parse({ changes }));

const NEW_SESSION = SessionSchema.parse({
  id: "CS299-L1",
  course_id: "CS299",
  kind: "lecture",
  groups: ["CSE-2"],
  faculty_id: "F99",
  size: 75,
  duration: 1,
  room_types: ["classroom"],
});

describe("applyDisruption", () => {
  it("faculty_unavailable appends one entry per calendar day", () => {
    const d = apply([
      {
        type: "faculty_unavailable",
        faculty_id: "F07",
        days: ["MON", "SAT"],
        periods: [1, 2],
        reason: "Travel",
      },
    ]);
    const f07 = d.faculty.find((f) => f.id === "F07")!;
    expect(f07.unavailable).toEqual([
      { day: "MON", periods: [1, 2], reason: "Travel" },
    ]);
    const instance = buildInstance(d);
    expect(isFacultyUnavailable(instance, "F07", "MON", 2)).toBe(true);
    expect(isFacultyUnavailable(instance, "F07", "MON", 3)).toBe(false);
  });

  it("room_unavailable appends one entry per calendar day, reason defaulting to empty", () => {
    const d = apply([
      {
        type: "room_unavailable",
        room_id: "CR-102",
        days: ["TUE", "SUN"],
        periods: [3],
      },
    ]);
    expect(d.room_unavailability.slice(-1)).toEqual([
      { room_id: "CR-102", day: "TUE", periods: [3], reason: "" },
    ]);
    expect(d.room_unavailability).toHaveLength(
      base.room_unavailability.length + 1,
    );
    expect(isRoomUnavailable(buildInstance(d), "CR-102", "TUE", 3)).toBe(true);
  });

  it("add_faculty, then unavailability for the new member, then add_session", () => {
    const d = apply([
      { type: "add_faculty", faculty: FacultySchema.parse({ id: "F99" }) },
      {
        type: "faculty_unavailable",
        faculty_id: "F99",
        days: ["WED"],
        periods: [9],
      },
      { type: "add_session", session: NEW_SESSION },
    ]);
    const f99 = d.faculty.find((f) => f.id === "F99")!;
    expect(f99.max_hours_per_day).toBe(4);
    expect(f99.unavailable).toEqual([{ day: "WED", periods: [9], reason: "" }]);
    expect(d.sessions.at(-1)).toEqual(NEW_SESSION);
    expect(d.sessions).toHaveLength(base.sessions.length + 1);
  });

  it("remove_session drops every session with that id; a missing id is a no-op", () => {
    const d = apply([
      { type: "remove_session", session_id: "MA101-AB-L1" },
      { type: "remove_session", session_id: "NOT-THERE" },
    ]);
    expect(d.sessions.some((s) => s.id === "MA101-AB-L1")).toBe(false);
    expect(d.sessions).toHaveLength(base.sessions.length - 1);
  });

  it("applies the starter-pack sample (all of F07's Monday, CR-102 all week, a new tutorial)", () => {
    const d = applyDisruption(base, DisruptionSchema.parse(sampleDisruption));
    const instance = buildInstance(d);
    expect(isFacultyUnavailable(instance, "F07", "MON", 9)).toBe(true);
    for (const day of ["MON", "TUE", "WED", "THU", "FRI"]) {
      expect(isRoomUnavailable(instance, "CR-102", day, 5)).toBe(true);
    }
    expect(instance.sessions.has("CS202-T2")).toBe(true);
  });

  it("never mutates its input and returns a deep copy", () => {
    const d = apply([
      {
        type: "faculty_unavailable",
        faculty_id: "F01",
        days: ["MON"],
        periods: [1],
      },
      {
        type: "room_unavailable",
        room_id: "LH-1",
        days: ["MON"],
        periods: [1],
      },
      { type: "remove_session", session_id: "MA101-AB-L1" },
    ]);
    expect(JSON.stringify(base)).toBe(frozen);
    expect(d.rooms[0]).not.toBe(base.rooms[0]);
    const unchanged = applyDisruption(base, { changes: [] });
    expect(unchanged).toEqual(base);
    expect(unchanged).not.toBe(base);
  });

  it("throws on an unknown change type or faculty id, like the validator", () => {
    expect(() =>
      applyDisruption(base, {
        changes: [{ type: "swap_rooms" }],
      } as unknown as Disruption),
    ).toThrow(new DisruptionError("Unknown change type: swap_rooms"));
    expect(() =>
      apply([
        {
          type: "faculty_unavailable",
          faculty_id: "F404",
          days: ["MON"],
          periods: [1],
        },
      ]),
    ).toThrow(DisruptionError);
  });
});
