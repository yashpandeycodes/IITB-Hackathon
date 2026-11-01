import { describe, expect, it } from "vitest";

import { DisruptionSchema, SessionSchema, type Session } from "@/lib/contracts";

import sampleDisruption from "../../../data/sample_disruption.json";

import { deriveExtraSession } from "./extra-session";
import { publicDataset } from "./test-fixtures";

const SAMPLE_SESSION = (
  DisruptionSchema.parse(sampleDisruption).changes[2] as {
    session: Session;
  }
).session;

describe("deriveExtraSession", () => {
  const dataset = publicDataset();

  it("derives exactly the sample disruption's extra CS202 tutorial", () => {
    const session = deriveExtraSession(dataset, {
      course_id: "CS202",
      kind: "tutorial",
      faculty_id: "F06",
    });
    expect(session).toEqual(SAMPLE_SESSION);
    expect(SessionSchema.parse(session)).toEqual(SAMPLE_SESSION);
  });

  it("takes the next free number in the template's pattern", () => {
    const withT2 = structuredClone(dataset);
    withT2.sessions.push({ ...SAMPLE_SESSION });
    expect(
      deriveExtraSession(withT2, {
        course_id: "CS202",
        kind: "tutorial",
        faculty_id: "F06",
      })?.id,
    ).toBe("CS202-T3");
    expect(
      deriveExtraSession(dataset, {
        course_id: "CS202",
        kind: "lecture",
        faculty_id: "F06",
      })?.id,
    ).toBe("CS202-L4");
  });

  it("is null when the course has no session of that kind", () => {
    expect(
      deriveExtraSession(dataset, {
        course_id: "CS202",
        kind: "lab",
        faculty_id: "F06",
      }),
    ).toBeNull();
    expect(
      deriveExtraSession(dataset, {
        course_id: "ZZ999",
        kind: "lecture",
        faculty_id: "F06",
      }),
    ).toBeNull();
  });

  it("never copies a basket or a fixed slot, and keeps accessibility needs", () => {
    const oe = deriveExtraSession(dataset, {
      course_id: "OE301",
      kind: "lecture",
      faculty_id: "F39",
    });
    expect(oe).toMatchObject({
      basket_slot: null,
      fixed_slot: null,
      id: "OE301-L4",
    });
    // ME-2 needs an accessible room, so ME202's sessions do too.
    const me = deriveExtraSession(dataset, {
      course_id: "ME202",
      kind: "tutorial",
      faculty_id: "F26",
    });
    expect(me?.needs_accessible).toBe(true);
    // A teacher who needs step-free access makes the new session need it too.
    const edited = structuredClone(dataset);
    const f06 = edited.faculty.find((f) => f.id === "F06");
    if (f06) f06.needs_accessible = true;
    expect(
      deriveExtraSession(edited, {
        course_id: "CS202",
        kind: "tutorial",
        faculty_id: "F06",
      })?.needs_accessible,
    ).toBe(true);
  });
});
