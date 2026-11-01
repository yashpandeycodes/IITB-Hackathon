/**
 * Session explanations on the committed timetable: the facts parse with the contract, the tallies
 * add up, the best alternatives really fit, and the summary quotes only numbers in the facts.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SessionFactsSchema,
  type Assignment,
  type SessionFacts,
} from "@/lib/contracts";

import { explainSession } from "./explain";
import { checkPlacement } from "./manual";
import { reschedule } from "./reschedule";
import { publicDataset } from "./test-fixtures";

const BASELINE: Assignment[] = JSON.parse(
  readFileSync("exports/schedule.json", "utf8"),
).sessions;
const baseOf = (id: string) =>
  BASELINE.find((a) => a.session_id === id) as Assignment;

const numbers = (text: string) => new Set(text.match(/\d+/g) ?? []);

function explain(
  id: string,
  assignments = BASELINE,
  dataset = publicDataset(),
) {
  const facts = explainSession({
    dataset,
    assignments,
    session_id: id,
    version_id: "TT-0001",
  });
  expect(facts).not.toBeNull();
  return SessionFactsSchema.parse(facts) as SessionFacts;
}

function expectConsistent(facts: SessionFacts) {
  const alt = facts.alternatives;
  const blocked = alt.blocked.reduce((n, b) => n + b.count, 0);
  expect(alt.free + blocked).toBe(alt.considered);
  expect(alt.better).toBeLessThanOrEqual(alt.free);
  expect(alt.best.length).toBeLessThanOrEqual(Math.min(3, alt.free));
  for (let i = 1; i < alt.best.length; i++) {
    expect(alt.best[i].soft_delta).toBeGreaterThanOrEqual(
      alt.best[i - 1].soft_delta,
    );
  }
  for (let i = 1; i < alt.blocked.length; i++) {
    expect(alt.blocked[i].count).toBeLessThanOrEqual(alt.blocked[i - 1].count);
  }
  const allowed = numbers(JSON.stringify({ ...facts, summary: "" }));
  for (const n of numbers(facts.summary))
    expect(allowed, `number ${n}`).toContain(n);
}

describe("explainSession", () => {
  const dataset = publicDataset();

  it("gives consistent facts for a spread of sessions, and the best slots really fit", () => {
    for (const s of dataset.sessions.filter((_, i) => i % 9 === 0)) {
      const facts = explain(s.id);
      expectConsistent(facts);
      expect(facts.version_id).toBe("TT-0001");
      for (const best of facts.alternatives.best) {
        if (!s.basket_slot) {
          const check = checkPlacement({
            dataset,
            assignments: BASELINE,
            placement: { session_id: s.id, ...best },
          });
          expect(check.ok, `${s.id} → ${best.day} P${best.start_period}`).toBe(
            true,
          );
          expect(check.soft_delta).toBe(best.soft_delta);
        } else {
          // A basket moves as one: pinning the member there moves only the basket.
          const size = dataset.sessions.filter(
            (x) => x.basket_slot === s.basket_slot,
          ).length;
          const r = reschedule({
            dataset,
            baseline: BASELINE,
            placements: [{ session_id: s.id, ...best }],
          });
          expect(r.feasible).toBe(true);
          expect(r.moved_count).toBe(size);
        }
      }
    }
  });

  it("explains a P1 class: the time, the room and why it stays", () => {
    const facts = explain("MA101-AB-L3");
    expect(facts.placed).toEqual({
      day: "MON",
      start_period: 1,
      end_period: 1,
      room_id: "LH-1",
      time: "08:00–09:00",
    });
    expect(facts.room).toMatchObject({
      room_id: "LH-1",
      capacity: 200,
      fill_percent: 90,
      suitable_rooms: 3,
    });
    expect(facts.soft_costs).toEqual([]);
    expect(facts.summary).toContain(
      "MA101-AB-L3 (Calculus and Linear Algebra lecture) is on MON 08:00–09:00 (P1) in LH-1.",
    );
    expect(facts.summary).toContain("That is why it stays at 08:00–09:00");
    expectConsistent(facts);
  });

  it("names the soft points a session costs where it is", () => {
    // F08's two CS204 lectures share a day: the timetable's only soft cost (S4 = 3).
    const cs204 = ["CS204-L1", "CS204-L2", "CS204-L3"].map((id) => explain(id));
    const s4 = cs204
      .flatMap((f) => f.soft_costs)
      .filter((c) => c.rule === "S4");
    expect(s4.length).toBeGreaterThan(0);
    expect(s4[0]).toMatchObject({ points: 3 });
    expect(s4[0].detail).toMatch(/^CSE-2 has another CS204 lecture on /);

    // F06 avoids Friday afternoons; P9 costs S6.
    const moved = BASELINE.map((a) =>
      a.session_id === "CS202-L2"
        ? { ...a, day: "FRI" as const, start_period: 9 }
        : a,
    );
    const facts = explain("CS202-L2", moved);
    expect(facts.soft_costs).toContainEqual({
      rule: "S1",
      points: 2,
      detail: "F06 asked to avoid FRI P9",
    });
    // The preference's own note never reaches the facts (every role reads them).
    expect(JSON.stringify(facts)).not.toContain("research");
    expect(facts.soft_costs).toContainEqual({
      rule: "S6",
      points: 1,
      detail: "runs in the last teaching period, P9",
    });
    expect(facts.summary).toContain("Here it costs S1 2 points");
    expectConsistent(facts);
  });

  it("explains a lab's room and its few starts", () => {
    const facts = explain("CS292-P1");
    expect(facts.placed?.time).toBe("09:00–12:00");
    expect(facts.room?.suitable_rooms).toBe(2);
    // Labs start at P2 or P6: 10 starts a week, 9 others.
    expect(facts.alternatives.considered).toBe(9);
    expect(facts.summary).toContain("CS292-P1 (Digital Logic Lab) is on");
    expectConsistent(facts);
  });

  it("explains a basket member with the whole basket moving", () => {
    const facts = explain("OE301-L1");
    expect(facts.basket_slot).toBe("OEB-1");
    expect(facts.summary).toContain(
      "It runs in elective basket OEB-1, whose sessions share one time slot",
    );
    expectConsistent(facts);
  });

  it("explains a fixed session", () => {
    const edited = publicDataset();
    const at = baseOf("CS202-L1");
    const s = edited.sessions.find((x) => x.id === "CS202-L1");
    if (s) s.fixed_slot = { day: at.day, start_period: at.start_period };
    const facts = explain("CS202-L1", BASELINE, edited);
    expect(facts.fixed_slot).toBe(true);
    expect(facts.alternatives.blocked).toEqual([
      {
        rule: "H14",
        count: facts.alternatives.considered,
        detail: `fixed at ${at.day} P${at.start_period}`,
      },
    ]);
    expect(facts.summary).toContain(
      `The dataset fixes it at ${at.day} P${at.start_period}, so it can't move.`,
    );
    expectConsistent(facts);
  });

  it("explains an unplaced session", () => {
    const facts = explain(
      "CS202-T1",
      BASELINE.filter((a) => a.session_id !== "CS202-T1"),
    );
    expect(facts).toMatchObject({ placed: null, room: null, soft_costs: [] });
    expect(facts.alternatives.considered).toBe(45);
    expect(facts.summary).toMatch(
      /^CS202-T1 \(Discrete Mathematics tutorial\) isn't placed in this timetable\. Of the 45 other start slots, \d+ would fit/,
    );
    expectConsistent(facts);
  });

  it("is null for an unknown session", () => {
    expect(
      explainSession({
        dataset,
        assignments: BASELINE,
        session_id: "NOPE-1",
        version_id: null,
      }),
    ).toBeNull();
  });
});
