import { describe, expect, it } from "vitest";

import {
  Category,
  ChangeStatus,
  DecisionStatus,
  RequestState,
  SessionKind,
} from "@/lib/contracts/enums";

import {
  CATEGORY_META,
  CHANGE_STATUS_META,
  DECISION_STATUS_META,
  getRuleSeverity,
  getStatusMeta,
  KIND_META,
  REQUEST_STATE_META,
} from "./semantics";

describe("semantic maps", () => {
  it("cover every enum value with a label, icon and token classes", () => {
    const cases: [
      readonly string[],
      Record<string, { label: string; className: string }>,
    ][] = [
      [[...SessionKind.options, "basket"], KIND_META],
      [DecisionStatus.options, DECISION_STATUS_META],
      [RequestState.options, REQUEST_STATE_META],
      [ChangeStatus.options, CHANGE_STATUS_META],
      [Category.options, CATEGORY_META],
    ];
    for (const [values, meta] of cases) {
      expect(Object.keys(meta).sort()).toEqual([...values].sort());
      for (const value of values) {
        expect(meta[value]!.label.length).toBeGreaterThan(0);
        expect(meta[value]!.className).toMatch(/\btext-/);
      }
    }
  });

  it("maps change outcomes to the agreed meanings", () => {
    expect(CHANGE_STATUS_META.applied.label).toBe("Applied");
    expect(CHANGE_STATUS_META.applied.className).toContain("status-approved");
    expect(CHANGE_STATUS_META.infeasible.label).toBe("No valid fix");
    expect(CHANGE_STATUS_META.infeasible.className).toContain("hard");
    expect(CHANGE_STATUS_META.proposing.className).toContain("status-pending");
  });

  it("resolves shared status values consistently", () => {
    expect(getStatusMeta("approved")).toBe(DECISION_STATUS_META.approved);
    expect(getStatusMeta("cancelled").label).toBe("Cancelled");
    expect(getStatusMeta("pending_approval").label).toBe("Awaiting approval");
  });
});

describe("getRuleSeverity", () => {
  it("treats S rules as soft and everything else as hard", () => {
    expect(getRuleSeverity("S1")).toBe("soft");
    expect(getRuleSeverity("s6")).toBe("soft");
    expect(getRuleSeverity("H4")).toBe("hard");
    expect(getRuleSeverity("B2")).toBe("hard");
    expect(getRuleSeverity("E1")).toBe("hard");
    expect(getRuleSeverity("X9")).toBe("hard");
  });
});
