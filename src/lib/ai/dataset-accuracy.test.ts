/**
 * The rule parser on the 25 dataset `raw_text`s, scored per field against the structured
 * request (backend.md §5.6): attendance and duration exact, windows as sets (series compared as
 * the union of their members), needs as sets, room types by overlap, mandatory groups exact.
 * Target: ≥ 90 % per field with the rule parser alone.
 */
import { describe, expect, it } from "vitest";

import {
  BookingDraftLLMSchema,
  ParsedBookingDraftSchema,
  type BookingRequest,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";

import { extractWithRules, parseBookingText } from "./index";
import { datasetContext } from "./test-context";
import type { ParseOutcome } from "./types";

const dataset = getBundledDataset();
const ctx = datasetContext(dataset);
const requests = dataset.booking_requests;

type Field =
  | "attendance"
  | "duration"
  | "windows"
  | "needs"
  | "room_types"
  | "mandatory_for_groups";
const FIELDS: Field[] = [
  "attendance",
  "duration",
  "windows",
  "needs",
  "room_types",
  "mandatory_for_groups",
];

const windowKey = (day: string, from: number, to: number) =>
  `${day}:${from}-${Math.min(13, to)}`;

function expectedWindows(request: BookingRequest): Set<string> {
  const members = request.series_id
    ? requests.filter((r) => r.series_id === request.series_id)
    : [request];
  return new Set(
    members.flatMap((r) =>
      r.windows.map((w) => windowKey(w.day, w.from_period, w.to_period)),
    ),
  );
}

function parsedWindows(outcome: ParseOutcome): Set<string> {
  const { windows, repeat_days } = outcome.draft;
  const keys = windows.map((w) => windowKey(w.day, w.from_period, w.to_period));
  const firstWindow = windows[0];
  if (firstWindow)
    for (const day of repeat_days)
      keys.push(windowKey(day, firstWindow.from_period, firstWindow.to_period));
  return new Set(keys);
}

const sameSet = (a: Iterable<string>, b: Iterable<string>) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
};

function score(
  request: BookingRequest,
  outcome: ParseOutcome,
): Record<Field, boolean> {
  const d = outcome.draft;
  return {
    attendance: d.attendance === request.attendance,
    duration: d.duration_periods === request.duration_periods,
    windows: sameSet(parsedWindows(outcome), expectedWindows(request)),
    needs: sameSet(d.needs, request.needs),
    room_types: d.room_types.some((t) => request.room_types.includes(t)),
    mandatory_for_groups: sameSet(
      d.mandatory_for_groups,
      request.mandatory_for_groups,
    ),
  };
}

describe("rule parser on the dataset's 25 raw texts", async () => {
  const outcomes = await Promise.all(
    requests.map((r) => parseBookingText(r.raw_text ?? "", ctx, { llm: null })),
  );
  const scores = requests.map((r, i) => score(r, outcomes[i]));

  it("parses all 25 requests with the rule parser and valid drafts", () => {
    expect(requests).toHaveLength(25);
    for (const r of requests) expect(r.raw_text, r.id).toBeTruthy();
    for (const outcome of outcomes) {
      expect(ParsedBookingDraftSchema.safeParse(outcome.draft).success).toBe(
        true,
      );
      expect(BookingDraftLLMSchema.safeParse(outcome.extraction).success).toBe(
        true,
      );
      expect(outcome.source).toBe("rules");
      expect(outcome.fallback_reason).toBeNull();
    }
  });

  it.each(FIELDS)("scores at least 90 percent on %s", (field) => {
    const misses = requests
      .filter((_, i) => !scores[i][field])
      .map((r) => r.id);
    const accuracy = (requests.length - misses.length) / requests.length;
    if (misses.length > 0)
      console.info(
        `[ai] ${field}: ${(accuracy * 100).toFixed(0)}% (misses: ${misses.join(", ")})`,
      );
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it("extractWithRules agrees with the draft and is schema-valid", () => {
    requests.forEach((r, i) => {
      const extraction = extractWithRules(r.raw_text ?? "", ctx);
      expect(BookingDraftLLMSchema.safeParse(extraction).success, r.id).toBe(
        true,
      );
      const d = outcomes[i].draft;
      expect(extraction.attendance, r.id).toBe(d.attendance);
      expect(extraction.windows, r.id).toEqual(d.windows);
      expect(extraction.needs, r.id).toEqual(d.needs);
      expect(extraction.mandatory_for_groups, r.id).toEqual(
        d.mandatory_for_groups,
      );
    });
  });

  it("matches the room types exactly for most requests", () => {
    const exact = requests.filter((r, i) =>
      sameSet(outcomes[i].draft.room_types, r.room_types),
    ).length;
    expect(exact).toBeGreaterThanOrEqual(12);
  });

  it("resolves the requested room for every request that names an existing one", () => {
    requests.forEach((r, i) => {
      const room = outcomes[i].requested_room;
      if (r.requested_room && ctx.rooms.some((x) => x.id === r.requested_room))
        expect(room.room_id, r.id).toBe(r.requested_room);
    });
  });

  it("keeps unknown room text with a suggestion and a note (BR-14 LHC-5)", () => {
    const i = requests.findIndex((r) => r.id === "BR-14");
    const room = outcomes[i].requested_room;
    expect(room).toMatchObject({
      text: "LHC-5",
      room_id: null,
      suggestion: "LH-5",
    });
    expect(room.note).toContain("LHC-5 doesn't exist; did you mean LH-5?");
    expect(room.note).toContain("PA system");
    expect(outcomes[i].draft.requested_room).toBeNull();
  });

  it("reports claimed categories without acting on them", () => {
    const claimed = (id: string) =>
      outcomes[requests.findIndex((r) => r.id === id)].claimed_category;
    expect(claimed("BR-12")).toBe("guest_lecture");
    expect(claimed("BR-15")).toBe("institute_event");
  });

  it("flags the request past 22:00 (BR-17) and clamps it to P13", () => {
    const outcome = outcomes[requests.findIndex((r) => r.id === "BR-17")];
    expect(outcome.draft.windows).toEqual([
      { day: "WED", from_period: 13, to_period: 13 },
    ]);
    expect(outcome.draft.assumptions).toContain("Events end at 22:00 (P13)");
    expect(outcome.draft.follow_up).toMatch(/22:00 \(P13\)/);
  });

  it("gives every request a title", () => {
    for (const outcome of outcomes) expect(outcome.draft.title).toBeTruthy();
  });
});
