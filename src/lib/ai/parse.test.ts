/**
 * The LLM path with fake clients: valid output, one repair retry, fallback to the rule parser
 * (invalid twice, errors, timeouts), post-processing of what the LLM returns, and the cache.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  BookingDraftLLMSchema,
  BookingDraftSchema,
  type BookingDraftLLM,
} from "@/lib/contracts";

import {
  PARSE_PROMPT_ID,
  createParseCache,
  loadPrompt,
  parseBookingText,
  parseCacheKey,
} from "./index";
import { datasetContext } from "./test-context";
import type { LlmClient, LlmConfig } from "./types";

const ctx = datasetContext();
const TEXT = "seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye";

/** A fake Google API key, built at runtime so no key-shaped literal sits in the source. */
const FAKE_KEY = "AIza" + "X".repeat(35);

/** A reply, an error, a call that never answers, or a reply after a delay. */
type Step = string | Error | "hang" | { after: number; reply: string };
type JsonCall = Parameters<LlmClient["generateJson"]>[0];

function fakeLlm(steps: Step[], timeoutMs = 2000) {
  const calls: JsonCall[] = [];
  const client: LlmClient = {
    async generateJson(request) {
      calls.push(request);
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step === "hang") return new Promise<string>(() => {});
      if (step instanceof Error) throw step;
      if (typeof step === "object")
        return new Promise<string>((resolve) =>
          setTimeout(() => resolve(step.reply), step.after),
        );
      return step;
    },
    async generateText() {
      throw new Error("not used");
    },
  };
  const llm: LlmConfig = { client, model: "fake-flash", timeoutMs };
  return { llm, calls };
}

function llmDraft(overrides: Partial<BookingDraftLLM> = {}): BookingDraftLLM {
  return {
    title: "Music practice",
    attendance: 100,
    duration_periods: 2,
    windows: [{ day: "TUE", from_period: 10, to_period: 11 }],
    room_types: ["seminar_hall"],
    needs: ["pa_system"],
    requested_room_text: null,
    mandatory_for_groups: [],
    repeat_days: [],
    claimed_category: null,
    conditions: [],
    assumptions: ["'kal' read as tomorrow (TUE)"],
    follow_up: null,
    confidence: 0.9,
    ...overrides,
  };
}

describe("parseBookingText with an LLM", () => {
  it("valid JSON → source llm, one call with the prompt file, schema and campus context", async () => {
    const raw = JSON.stringify(llmDraft());
    const { llm, calls } = fakeLlm([raw]);
    const outcome = await parseBookingText(TEXT, ctx, { llm });

    expect(outcome).toMatchObject({
      source: "llm",
      model: "fake-flash",
      fallback_code: null,
      fallback_reason: null,
      repaired: false,
      raw_output: raw,
      cached: false,
    });
    expect(outcome.draft).toMatchObject({
      title: "Music practice",
      attendance: 100,
      duration_periods: 2,
      windows: [{ day: "TUE", from_period: 10, to_period: 11 }],
      needs: ["pa_system"],
      room_types: ["seminar_hall"],
      missing: [],
      follow_up: null,
    });
    expect(outcome.extraction).toEqual(llmDraft());
    expect(outcome.latency_ms).toBeGreaterThanOrEqual(0);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.model).toBe("fake-flash");
    expect(call.system).toBe(loadPrompt(PARSE_PROMPT_ID));
    expect(call.jsonSchema).toEqual(z.toJSONSchema(BookingDraftLLMSchema));
    expect(call.timeoutMs).toBe(2000);
    expect(call.signal).toBeInstanceOf(AbortSignal);
    expect(call.prompt).toContain("Reference date: 2027-02-08 (Monday, MON)");
    expect(call.prompt).toContain("tomorrow/kal = TUE");
    expect(call.prompt).toContain("P10: 18:00-19:00");
    expect(call.prompt).toContain("SH-2 | Seminar Hall 2 | seminar_hall | 100");
    expect(call.prompt).toContain("ECE-3 | ECE Year 3 | ECE | 3");
    expect(call.prompt).toContain(`<<<REQUEST_TEXT\n${TEXT}\nREQUEST_TEXT>>>`);
  });

  it("accepts JSON wrapped in a code fence", async () => {
    const { llm } = fakeLlm([
      "```json\n" + JSON.stringify(llmDraft()) + "\n```",
    ]);
    const outcome = await parseBookingText(TEXT, ctx, { llm });
    expect(outcome.source).toBe("llm");
  });

  it("invalid then valid → one repair call with the validation error, repaired: true", async () => {
    const bad = JSON.stringify({ ...llmDraft(), status: "approved" });
    const good = JSON.stringify(llmDraft());
    const { llm, calls } = fakeLlm([bad, good]);
    const outcome = await parseBookingText(TEXT, ctx, { llm });

    expect(outcome.source).toBe("llm");
    expect(outcome.repaired).toBe(true);
    expect(outcome.raw_output).toBe(good);
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain("Validation error");
    expect(calls[1].prompt).toContain(bad);
    expect(outcome.draft).not.toHaveProperty("status");
  });

  it("invalid twice → rule parser with fallback_code invalid_output and no model", async () => {
    const { llm, calls } = fakeLlm(["not json at all", '{"title": 5}']);
    const outcome = await parseBookingText(TEXT, ctx, { llm });

    expect(calls).toHaveLength(2);
    expect(outcome).toMatchObject({
      source: "rules",
      model: null,
      fallback_code: "invalid_output",
      repaired: false,
      raw_output: '{"title": 5}',
    });
    expect(outcome.fallback_reason).toMatch(
      /^invalid_output: failed the schema twice/,
    );
    expect(outcome.draft).toMatchObject({
      attendance: 100,
      windows: [{ day: "TUE", from_period: 10, to_period: 11 }],
      needs: ["pa_system"],
      room_types: ["seminar_hall"],
    });
  });

  it("a thrown error → rule parser, llm_error, a short secret-free reason", async () => {
    const { llm } = fakeLlm([
      new Error(`boom: key=${FAKE_KEY} https://x.test/?key=${FAKE_KEY}`),
    ]);
    const outcome = await parseBookingText(TEXT, ctx, { llm });
    expect(outcome.source).toBe("rules");
    expect(outcome.model).toBeNull();
    expect(outcome.fallback_code).toBe("llm_error");
    expect(outcome.fallback_reason).toMatch(/^llm_error: boom/);
    expect(outcome.fallback_reason).not.toContain("AIza");
    expect(outcome.fallback_reason).not.toContain("XXXX");
    expect(outcome.draft.attendance).toBe(100);
  });

  it("a hanging client times out → rule parser with fallback_code timeout", async () => {
    const { llm } = fakeLlm(["hang"], 30);
    const outcome = await parseBookingText(TEXT, ctx, { llm });
    expect(outcome.source).toBe("rules");
    expect(outcome.model).toBeNull();
    expect(outcome.fallback_code).toBe("timeout");
    expect(outcome.fallback_reason).toMatch(/^timeout: .*30 ms/);
    expect(outcome.draft.windows).toEqual([
      { day: "TUE", from_period: 10, to_period: 11 },
    ]);
  });

  it("an abort/timeout error from the SDK → fallback_code timeout", async () => {
    const abort = new Error("This operation was aborted");
    abort.name = "AbortError";
    const { llm } = fakeLlm([abort]);
    const outcome = await parseBookingText(TEXT, ctx, { llm });
    expect(outcome.fallback_code).toBe("timeout");
  });

  it("without an LLM the rule parser runs and no model is reported", async () => {
    const outcome = await parseBookingText(TEXT, ctx, { llm: null });
    expect(outcome).toMatchObject({
      source: "rules",
      model: null,
      fallback_code: null,
      fallback_reason: null,
      raw_output: null,
    });
  });
});

describe("time budget and the caller's signal", () => {
  const bad = JSON.stringify({ ...llmDraft(), status: "approved" });
  const good = JSON.stringify(llmDraft());

  it("skips the repair when the budget left is under the minimum → timeout", async () => {
    const { llm, calls } = fakeLlm([bad, good], 2000);
    const outcome = await parseBookingText(TEXT, ctx, { llm, budgetMs: 1000 });
    expect(calls).toHaveLength(1);
    expect(outcome).toMatchObject({
      source: "rules",
      model: null,
      fallback_code: "timeout",
      repaired: false,
      raw_output: bad,
    });
    expect(outcome.fallback_reason).toMatch(/no time left for the repair/);
  });

  it("skips the repair when a slow first call used up the budget", async () => {
    const { llm, calls } = fakeLlm(
      [{ after: 60, reply: bad }, good],
      // 25% of 8000 ms = 2000 ms needed for the repair; 1600 of the 1650 ms budget is not enough.
      8000,
    );
    const outcome = await parseBookingText(TEXT, ctx, { llm, budgetMs: 1650 });
    expect(calls).toHaveLength(1);
    expect(calls[0].timeoutMs).toBe(1650);
    expect(outcome.fallback_code).toBe("timeout");
  });

  it("gives the repair only what is left of the budget", async () => {
    const { llm, calls } = fakeLlm([bad, good], 8000);
    const outcome = await parseBookingText(TEXT, ctx, { llm, budgetMs: 5000 });
    expect(outcome.source).toBe("llm");
    expect(outcome.repaired).toBe(true);
    expect(calls[0].timeoutMs).toBe(5000);
    expect(calls[1].timeoutMs).toBeLessThanOrEqual(5000);
    expect(calls[1].timeoutMs).toBeGreaterThan(2000);
  });

  it("passes the caller's signal through: aborting it ends a hanging call → timeout", async () => {
    const { llm, calls } = fakeLlm(["hang"], 5000);
    const caller = new AbortController();
    const pending = parseBookingText(TEXT, ctx, {
      llm,
      signal: caller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls[0].signal?.aborted).toBe(false);
    caller.abort();
    const outcome = await pending;
    expect(calls[0].signal?.aborted).toBe(true);
    expect(outcome).toMatchObject({
      source: "rules",
      model: null,
      fallback_code: "timeout",
    });
    expect(outcome.fallback_reason).toMatch(/aborted by the caller/);
  });

  it("an already-aborted signal makes no LLM call", async () => {
    const { llm, calls } = fakeLlm([good]);
    const caller = new AbortController();
    caller.abort();
    const outcome = await parseBookingText(TEXT, ctx, {
      llm,
      signal: caller.signal,
    });
    expect(calls).toHaveLength(0);
    expect(outcome.source).toBe("rules");
    expect(outcome.fallback_code).toBe("timeout");
  });
});

describe("post-processing of LLM output", () => {
  it("nulls an unknown room id, suggests the closest one, and never invents ids", async () => {
    const { llm } = fakeLlm([
      JSON.stringify(
        llmDraft({
          requested_room_text: "LHC-5",
          room_types: [],
          needs: ["pa_system"],
          attendance: 90,
        }),
      ),
    ]);
    const outcome = await parseBookingText("Open mic in LHC-5", ctx, { llm });
    expect(outcome.draft.requested_room).toBeNull();
    expect(outcome.requested_room).toMatchObject({
      text: "LHC-5",
      room_id: null,
      suggestion: "LH-5",
    });
    expect(outcome.requested_room.note).toBe(
      "LHC-5 doesn't exist; did you mean LH-5? It has no PA system.",
    );
    expect(outcome.draft.room_types.length).toBeGreaterThan(0);

    const { llm: llm2 } = fakeLlm([
      JSON.stringify(llmDraft({ requested_room_text: "ROOM-404" })),
    ]);
    const unknown = await parseBookingText("Book ROOM-404", ctx, { llm: llm2 });
    expect(unknown.draft.requested_room).toBeNull();
    expect(unknown.requested_room.suggestion).toBeNull();
  });

  it("treats a room type the LLM copied as room text as no specific room", async () => {
    const { llm } = fakeLlm([
      JSON.stringify(llmDraft({ requested_room_text: "a seminar hall" })),
    ]);
    const outcome = await parseBookingText("a seminar hall please", ctx, {
      llm,
    });
    expect(outcome.requested_room).toEqual({
      text: null,
      room_id: null,
      suggestion: null,
      note: null,
    });
  });

  it("resolves room names and aliases the LLM copies from the text", async () => {
    const { llm } = fakeLlm([
      JSON.stringify(llmDraft({ requested_room_text: "main audi" })),
    ]);
    const outcome = await parseBookingText("main audi please", ctx, { llm });
    expect(outcome.requested_room.room_id).toBe("AUD");
    expect(outcome.draft.room_types[0]).toBe("auditorium");
  });

  it("resolves group phrases, drops unknown groups, and fills attendance from group sizes", async () => {
    const { llm } = fakeLlm([
      JSON.stringify(
        llmDraft({
          attendance: null,
          mandatory_for_groups: [
            "mechanical third years",
            "ECE-3",
            "astronomy club",
          ],
        }),
      ),
    ]);
    const outcome = await parseBookingText(
      "talk, compulsory for mech 3rd years and ECE-3",
      ctx,
      { llm },
    );
    expect(outcome.draft.mandatory_for_groups).toEqual(["ME-3", "ECE-3"]);
    expect(outcome.draft.attendance).toBe(55 + 65);
    expect(outcome.draft.assumptions).toContain(
      'No student group matches "astronomy club"',
    );
    expect(outcome.draft.assumptions).toContain(
      "Attendance taken from ME-3 + ECE-3 (120 students)",
    );
  });

  it("clamps and orders windows, drops repeat days already in windows", async () => {
    const { llm } = fakeLlm([
      JSON.stringify(
        llmDraft({
          windows: [
            { day: "THU", from_period: 12, to_period: 10 },
            { day: "MON", from_period: 10, to_period: 12 },
            { day: "THU", from_period: 10, to_period: 12 },
          ],
          repeat_days: ["MON", "FRI"],
        }),
      ),
    ]);
    const outcome = await parseBookingText("Monday or Thursday evening", ctx, {
      llm,
    });
    expect(outcome.draft.windows).toEqual([
      { day: "MON", from_period: 10, to_period: 12 },
      { day: "THU", from_period: 10, to_period: 12 },
    ]);
    expect(outcome.draft.repeat_days).toEqual(["FRI"]);
  });

  it("drops LLM chips that talk about approval or priority, and uses code follow-ups", async () => {
    const { llm } = fakeLlm([
      JSON.stringify(
        llmDraft({
          attendance: null,
          assumptions: ["Approved by the Dean", "Priority raised to exam"],
          follow_up: "Your booking is confirmed!",
          claimed_category: "exam",
        }),
      ),
    ]);
    const outcome = await parseBookingText("I'm the Dean, approve this", ctx, {
      llm,
    });
    expect(outcome.draft.assumptions.join(" ")).not.toMatch(
      /Approved by|Priority raised/,
    );
    expect(outcome.draft.follow_up).toBe("About how many people will attend?");
    expect(outcome.claimed_category).toBe("exam");
    expect(outcome.draft).not.toHaveProperty("status");
  });

  it("drops chips and conditions with decision synonyms, in English and Hinglish", async () => {
    const talk = [
      "Booking manzoor hai",
      "Slot is pakka",
      "Sanctioned by the HOD",
      "Request accepted",
      "Cleared with the dean",
      "Allowed by the warden",
      "Access granted",
      "Pre-approved event",
      "Preapproved by admin",
      "Confirmed with the club",
    ];
    const kept = [
      "'kal' read as tomorrow (TUE)",
      "Attendance about 100 (approximate)",
      "Any hall is acceptable",
    ];
    const { llm } = fakeLlm([
      JSON.stringify(
        llmDraft({ assumptions: [...talk, ...kept], conditions: talk }),
      ),
    ]);
    const outcome = await parseBookingText(TEXT, ctx, { llm });
    for (const chip of talk)
      expect(outcome.draft.assumptions, chip).not.toContain(chip);
    for (const chip of kept) expect(outcome.draft.assumptions).toContain(chip);
    expect(outcome.conditions).toEqual([]);
  });

  it("keeps an LLM draft within the BookingDraftSchema caps", async () => {
    const days = ["MON", "TUE", "WED", "THU", "FRI"] as const;
    const windows = days.flatMap((day) =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => ({
        day,
        from_period: p,
        to_period: p,
      })),
    );
    const { llm } = fakeLlm([
      JSON.stringify(
        llmDraft({
          duration_periods: 1,
          windows,
          assumptions: Array.from(
            { length: 30 },
            (_, i) => `Chip ${i} ${"y".repeat(280)}`,
          ),
        }),
      ),
    ]);
    const outcome = await parseBookingText(TEXT, ctx, { llm });
    const { draft } = outcome;
    expect(outcome.source).toBe("llm");
    expect(draft.windows).toHaveLength(20);
    expect(draft.assumptions.length).toBeLessThanOrEqual(16);
    for (const a of draft.assumptions)
      expect(a.length).toBeLessThanOrEqual(300);
    expect(draft.assumptions).toContain(
      "Only the first 20 of 50 time windows were kept",
    );
    // Everything but the missing title fits the submission schema.
    const body = {
      ...Object.fromEntries(
        BookingDraftSchema.keyof().options.map((key) => [key, draft[key]]),
      ),
      title: draft.title ?? "x",
    };
    expect(BookingDraftSchema.safeParse(body).success).toBe(true);
  });

  it("a duration longer than every window stays missing, with a follow-up", async () => {
    const { llm } = fakeLlm([
      JSON.stringify(
        llmDraft({
          duration_periods: 4,
          windows: [{ day: "TUE", from_period: 10, to_period: 11 }],
        }),
      ),
    ]);
    const outcome = await parseBookingText(
      "Music practice Tuesday 6 to 8 pm, 4 hours, 100 people, seminar hall, mic",
      ctx,
      { llm },
    );
    expect(outcome.draft.duration_periods).toBe(4);
    expect(outcome.draft.missing).toContain("duration_periods");
    expect(outcome.draft.follow_up).toMatch(/shorter than 4 hours/);
  });

  it("derives room types and implied needs when the LLM leaves them empty", async () => {
    const { llm } = fakeLlm([
      JSON.stringify(
        llmDraft({
          room_types: [],
          needs: [],
          attendance: 300,
          title: "Guest lecture",
        }),
      ),
    ]);
    const outcome = await parseBookingText(
      "Guest lecture for 300 people",
      ctx,
      { llm },
    );
    expect(outcome.draft.needs).toEqual(["projector", "pa_system"]);
    expect(outcome.draft.room_types).toEqual(["auditorium"]);
  });
});

describe("parse cache", () => {
  it("a hit returns cached: true without a second LLM call", async () => {
    const { llm, calls } = fakeLlm([JSON.stringify(llmDraft())]);
    const cache = createParseCache();
    const first = await parseBookingText(TEXT, ctx, { llm, cache });
    const second = await parseBookingText(TEXT, ctx, { llm, cache });
    expect(calls).toHaveLength(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.draft).toEqual(first.draft);

    const otherDay = await parseBookingText(
      TEXT,
      datasetContext(undefined, "2027-02-09"),
      {
        llm,
        cache,
      },
    );
    expect(otherDay.cached).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("does not cache a fallback, so the LLM is retried next time", async () => {
    const { llm, calls } = fakeLlm([new Error("down")]);
    const cache = createParseCache();
    await parseBookingText(TEXT, ctx, { llm, cache });
    const again = await parseBookingText(TEXT, ctx, { llm, cache });
    expect(again.cached).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("evicts the least recently used entry", () => {
    const cache = createParseCache(2);
    const outcome = { cached: false } as never;
    cache.set("a", outcome);
    cache.set("b", outcome);
    cache.get("a");
    cache.set("c", outcome);
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBeDefined();
  });

  it("parseCacheKey is a sha256 of text, reference date, dataset and model", () => {
    const base = {
      text: TEXT,
      referenceDate: "2027-02-08",
      datasetId: "cit-public-v1",
      model: "fake-flash",
    };
    const key = parseCacheKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(parseCacheKey({ ...base })).toBe(key);
    for (const change of [
      { referenceDate: "2027-02-09" },
      { text: `${TEXT} ` },
      { datasetId: "other-campus" },
      { model: "fake-pro" },
      { model: null },
    ])
      expect(
        parseCacheKey({ ...base, ...change }),
        JSON.stringify(change),
      ).not.toBe(key);
  });

  it("does not reuse an outcome across datasets or models", async () => {
    const { llm, calls } = fakeLlm([JSON.stringify(llmDraft())]);
    const cache = createParseCache();
    await parseBookingText(TEXT, ctx, { llm, cache });
    const otherCampus = await parseBookingText(
      TEXT,
      { ...ctx, datasetId: "other-campus" },
      { llm, cache },
    );
    expect(otherCampus.cached).toBe(false);
    const otherModel = await parseBookingText(TEXT, ctx, {
      llm: { ...llm!, model: "fake-pro" },
      cache,
    });
    expect(otherModel.cached).toBe(false);
    expect(calls).toHaveLength(3);
  });
});
