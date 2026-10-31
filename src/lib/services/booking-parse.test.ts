/**
 * The plain-language parse service: AI on (a fake LLM injected via `deps.llm`), AI failing, AI
 * off (the rule parser, the live path locally), the category cap, the engine preview and the
 * `ai_logs` entry. Pure helpers are tested without a database; the rest against a throwaway one.
 */
import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LlmClient, LlmConfig } from "@/lib/ai";
import {
  ParseBookingResultSchema,
  type BookingDraftLLM,
  type BookingRequestRecord,
  type ParsedBookingDraft,
  type SessionUser,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { openTestDb } from "@/lib/db/repos/test-db";

vi.hoisted(() => {
  // Read lazily by the env module. No Gemini key: AI is off unless a test injects an LLM.
  process.env.AUTH_SECRET = "route-test-secret-0123456789-abcdefghijklmnop";
  process.env.JWT_SECRET = "";
  process.env.MONGODB_URI = "";
  process.env.GEMINI_API_KEY = "";
});

const { seedDemoUsers } = await import("@/lib/auth/seed");
const { findUserByEmail, toUser } = await import("@/lib/db/repos/users");
const { getAiLog } = await import("@/lib/db/repos/ai-logs");
const { getActiveTimetableVersion } =
  await import("@/lib/db/repos/timetable-versions");
const { listBookingRequests } = await import("@/lib/db/repos/reference");
const { createParseCache } = await import("@/lib/ai");
const { getActiveDataset } = await import("./dataset");
const { resetDemo } = await import("./reset");
const { runSpectra } = await import("./spectra");
const { createBooking } = await import("./bookings");
const {
  PREVIEW_REQUEST_ID,
  buildParseContext,
  categoryFor,
  parseBookingRequest,
  previewDecision,
  requestedRoomFor,
} = await import("./booking-parse");

const dataset = getBundledDataset();

/** Deterministic and quick: a fixed iteration budget, the wall clock only as a backstop. */
const FAST = { solverMaxIterations: 200_000, solverBudgetMs: 20_000 };

/** BR-06's text, complete enough for a preview. */
const QUIZ_TEXT =
  "Quiz prelims Thursday 6 to 8 pm, 140 people, SH-1, projector and mic";

const QUIZ_EXTRACTION: BookingDraftLLM = {
  title: "Quiz prelims",
  attendance: 140,
  duration_periods: 2,
  windows: [{ day: "THU", from_period: 10, to_period: 11 }],
  room_types: ["seminar_hall"],
  needs: ["projector", "pa_system"],
  requested_room_text: "SH-1",
  mandatory_for_groups: [],
  repeat_days: [],
  claimed_category: null,
  conditions: [],
  assumptions: [],
  follow_up: null,
  confidence: 0.9,
};

/** Never answers (until aborted): an LLM call that times out. */
const HANG = Symbol("hang");

/** A fake LLM answering `generateJson` from `answers` in turn (the last one repeats). */
function fakeLlm(
  answers: readonly (string | Error | typeof HANG)[],
  timeoutMs = 2_000,
): {
  llm: NonNullable<LlmConfig>;
  calls: () => number;
} {
  let calls = 0;
  const client: LlmClient = {
    generateJson: async ({ signal }) => {
      const answer = answers[Math.min(calls++, answers.length - 1)];
      if (answer === HANG) {
        return new Promise<string>((_, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }
      if (answer instanceof Error) throw answer;
      return answer;
    },
    generateText: async () => {
      throw new Error("generateText is not used by the parser");
    },
  };
  return {
    llm: { client, model: "fake-flash", timeoutMs },
    calls: () => calls,
  };
}

/** A fake LLM whose extraction is QUIZ_EXTRACTION with `overrides`. */
const extracting = (overrides: Partial<BookingDraftLLM>) =>
  fakeLlm([JSON.stringify({ ...QUIZ_EXTRACTION, ...overrides })]).llm;

/** The CS-lab extraction: a club's lab booking waits for the CSE coordinator. */
const LAB_EXTRACTION: Partial<BookingDraftLLM> = {
  title: "Hackathon prep",
  attendance: 60,
  duration_periods: 2,
  windows: [{ day: "WED", from_period: 10, to_period: 11 }],
  room_types: ["lab_cs"],
  needs: ["computers"],
  requested_room_text: null,
};

function draft(
  overrides: Partial<ParsedBookingDraft> = {},
): ParsedBookingDraft {
  return {
    title: "Poster session",
    attendance: 60,
    duration_periods: 1,
    windows: [{ day: "FRI", from_period: 3, to_period: 3 }],
    room_types: ["seminar_hall"],
    needs: ["accessible"],
    requested_room: "SH-2",
    mandatory_for_groups: [],
    repeat_days: [],
    assumptions: [],
    follow_up: null,
    missing: [],
    ...overrides,
  };
}

const NO_ROOM = { text: null, room_id: null, suggestion: null, note: null };

// ----------------------------------------------------------------------------- pure helpers

describe("categoryFor", () => {
  it("caps a club's institute claim at club_event", () => {
    expect(categoryFor(dataset, "club", "institute_event")).toEqual({
      claimed: "institute_event",
      effective: "club_event",
      capped: true,
    });
  });

  it("uses the role cap when nothing is claimed", () => {
    expect(categoryFor(dataset, "admin", null)).toEqual({
      claimed: null,
      effective: "institute_event",
      capped: false,
    });
    expect(categoryFor(dataset, "faculty", null).effective).toBe(
      "guest_lecture",
    );
    expect(categoryFor(dataset, "department_coordinator", null).effective).toBe(
      "department_event",
    );
  });

  it("ranks at the role's cap whatever the text claims (like a submitted booking)", () => {
    // A lower claim doesn't lower priority either: submissions carry no category.
    expect(categoryFor(dataset, "admin", "club_event")).toEqual({
      claimed: "club_event",
      effective: "institute_event",
      capped: false,
    });
    expect(categoryFor(dataset, "faculty", "exam")).toEqual({
      claimed: "exam",
      effective: "guest_lecture",
      capped: true,
    });
  });

  it("caps a role the dataset does not list at club_event", () => {
    const rules = { ...dataset, role_category_cap: {} };
    expect(categoryFor(rules, "faculty", null).effective).toBe("club_event");
  });
});

describe("requestedRoomFor", () => {
  const named = { text: "SH-2", room_id: "SH-2", suggestion: null, note: null };

  it("flags a named room that lacks a need and offers one that has it", () => {
    const room = requestedRoomFor(
      { requested_room: named, draft: draft() },
      dataset.rooms,
    );
    expect(room.room_id).toBe("SH-2");
    expect(room.suggestion).toBe("SH-1");
    expect(room.note).toMatch(/SH-2.*wheelchair access/);
    expect(room.note).toContain("SH-1");
  });

  it("keeps the parser's own note and suggestion", () => {
    const own = {
      ...named,
      suggestion: "SH-1",
      note: "SH-2 is not accessible.",
    };
    expect(
      requestedRoomFor({ requested_room: own, draft: draft() }, dataset.rooms),
    ).toEqual(own);
  });

  it("leaves a room that covers every need, or no room, alone", () => {
    const covered = draft({ needs: ["projector", "pa_system"] });
    expect(
      requestedRoomFor(
        { requested_room: named, draft: covered },
        dataset.rooms,
      ),
    ).toEqual(named);
    expect(
      requestedRoomFor(
        { requested_room: NO_ROOM, draft: draft() },
        dataset.rooms,
      ),
    ).toEqual(NO_ROOM);
  });

  it("names what is missing even when no room has it all", () => {
    const room = requestedRoomFor(
      {
        requested_room: named,
        draft: draft({ attendance: 900, needs: ["accessible", "stage"] }),
      },
      dataset.rooms,
    );
    expect(room.suggestion).toBeNull();
    expect(room.note).toBe(
      "SH-2 (Seminar Hall 2) has no wheelchair access or a stage.",
    );
  });
});

describe("buildParseContext", () => {
  it("projects the calendar, rooms and groups the parser may use", () => {
    const ctx = buildParseContext(dataset, "2027-02-08");
    expect(ctx.referenceDate).toBe("2027-02-08");
    expect(ctx.datasetId).toBe("cit-public-v1");
    expect(ctx.calendar.days).toEqual(["MON", "TUE", "WED", "THU", "FRI"]);
    expect(ctx.calendar.periods).toHaveLength(13);
    expect(ctx.calendar.lunch).toEqual({
      after_period: 5,
      start: "13:00",
      end: "14:00",
    });
    expect(ctx.rooms.find((r) => r.id === "SH-2")).toEqual({
      id: "SH-2",
      name: "Seminar Hall 2",
      type: "seminar_hall",
      capacity: 100,
      features: ["projector", "pa_system", "ac"],
      accessible: false,
      allowed_uses: ["exam", "event"],
    });
    expect(ctx.groups.find((g) => g.id === "ME-3")).toEqual({
      id: "ME-3",
      name: "ME Year 3",
      year: 3,
      department: "ME",
      size: dataset.student_groups.find((g) => g.id === "ME-3")!.size,
    });
  });
});

// ------------------------------------------------------------------------------- database

const testDb = await openTestDb("booking-parse.test");
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

describe.skipIf(!testDb)(
  "parseBookingRequest (MongoDB)",
  { timeout: 120_000 },
  () => {
    const users = {} as Record<"admin" | "club" | "faculty", SessionUser>;

    beforeAll(async () => {
      await seedDemoUsers(db);
      for (const [key, email] of [
        ["admin", "admin@cit.demo"],
        ["club", "club@cit.demo"],
        ["faculty", "faculty@cit.demo"],
      ] as const) {
        const doc = await findUserByEmail(db, email);
        if (!doc) throw new Error(`demo user ${email} was not seeded`);
        users[key] = toUser(doc);
      }
    });

    describe("no active timetable", () => {
      it("uses the rule parser with AI off and logs the parse", async () => {
        const result = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          cache: null,
        });
        expect(ParseBookingResultSchema.parse(result)).toEqual(result);
        expect(result).toMatchObject({
          source: "rules",
          ai_enabled: false,
          fallback_reason: null,
          category: { claimed: null, effective: "club_event", capped: false },
        });
        expect(result.draft).toMatchObject({
          attendance: 140,
          duration_periods: 2,
          windows: [{ day: "THU", from_period: 10, to_period: 11 }],
          requested_room: "SH-1",
        });
        // Complete and valid, but there is no timetable to decide it against.
        expect(result.draft.missing).toEqual([]);
        expect(result.problems).toEqual([]);
        expect(result.preview).toBeNull();

        // The log keeps the processed draft's chips: a submission's provenance copies them.
        const log = await getAiLog(db, result.log_id);
        expect(log).toEqual({
          id: result.log_id,
          feature: "parse_booking",
          source: "rules",
          model: null,
          prompt_id: "parse_booking.v1",
          input: QUIZ_TEXT,
          output_raw: null,
          parsed_ok: true,
          repaired: false,
          cached: false,
          fallback_reason: null,
          assumptions: result.draft.assumptions,
          follow_up: result.draft.follow_up,
          engine_verdict: null,
          latency_ms: expect.any(Number),
          user_id: users.club.id,
          at: expect.stringMatching(/\+05:30$/),
        });
        expect(log?.assumptions.length).toBeGreaterThan(0);
      });

      it("reports ai_enabled false when the LLM is explicitly off", async () => {
        const result = await parseBookingRequest(db, users.admin, QUIZ_TEXT, {
          llm: null,
          cache: null,
        });
        expect(result.ai_enabled).toBe(false);
        expect(result.source).toBe("rules");
        expect(result.category).toEqual({
          claimed: null,
          effective: "institute_event",
          capped: false,
        });
      });

      it("uses the LLM's extraction when it validates", async () => {
        const raw = JSON.stringify(QUIZ_EXTRACTION);
        const fake = fakeLlm([raw]);
        const result = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          llm: fake.llm,
          cache: null,
        });
        expect(fake.calls()).toBe(1);
        expect(result).toMatchObject({
          source: "llm",
          model: "fake-flash",
          ai_enabled: true,
          fallback_reason: null,
        });
        expect(result.draft).toMatchObject({
          title: "Quiz prelims",
          attendance: 140,
          requested_room: "SH-1",
        });
        const log = await getAiLog(db, result.log_id);
        expect(log).toMatchObject({
          source: "llm",
          model: "fake-flash",
          output_raw: raw,
          parsed_ok: true,
          repaired: false,
          fallback_reason: null,
          user_id: users.club.id,
        });
      });

      it("records a repaired LLM answer", async () => {
        const fake = fakeLlm(["{ not json", JSON.stringify(QUIZ_EXTRACTION)]);
        const result = await parseBookingRequest(
          db,
          users.club,
          `${QUIZ_TEXT} (repair)`,
          { llm: fake.llm, cache: null },
        );
        expect(fake.calls()).toBe(2);
        expect(result.source).toBe("llm");
        const log = await getAiLog(db, result.log_id);
        expect(log?.repaired).toBe(true);
        expect(log?.parsed_ok).toBe(true);
      });

      it("falls back to the rule parser when the LLM fails, returning only the code", async () => {
        const fake = fakeLlm([new Error("503 Service Unavailable")]);
        const result = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          llm: fake.llm,
          cache: null,
        });
        expect(fake.calls()).toBe(1);
        expect(result).toMatchObject({
          source: "rules",
          model: null,
          ai_enabled: true,
          fallback_reason: "llm_error",
        });
        // The rule parser still fills the form.
        expect(result.draft.attendance).toBe(140);
        // The detail stays in the log.
        const log = await getAiLog(db, result.log_id);
        expect(log).toMatchObject({
          source: "rules",
          model: null,
          parsed_ok: false,
          fallback_reason: expect.stringContaining("503"),
        });
      });

      it("reports a timed-out LLM call as fallback code timeout", async () => {
        const fake = fakeLlm([HANG], 50);
        const result = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          llm: fake.llm,
          cache: null,
        });
        expect(fake.calls()).toBe(1);
        expect(ParseBookingResultSchema.parse(result)).toEqual(result);
        expect(result).toMatchObject({
          source: "rules",
          model: null,
          ai_enabled: true,
          fallback_reason: "timeout",
        });
        expect(result.draft.attendance).toBe(140);
        const log = await getAiLog(db, result.log_id);
        expect(log).toMatchObject({
          source: "rules",
          parsed_ok: false,
          fallback_reason: expect.stringContaining("timeout"),
        });
      });

      it("records a cached LLM parse in the log", async () => {
        const fake = fakeLlm([JSON.stringify(QUIZ_EXTRACTION)]);
        const cache = createParseCache();
        const text = `${QUIZ_TEXT} (cached)`;
        const first = await parseBookingRequest(db, users.club, text, {
          llm: fake.llm,
          cache,
        });
        const second = await parseBookingRequest(db, users.club, text, {
          llm: fake.llm,
          cache,
        });
        expect(fake.calls()).toBe(1);
        expect(second.draft).toEqual(first.draft);
        expect((await getAiLog(db, first.log_id))?.cached).toBe(false);
        expect((await getAiLog(db, second.log_id))?.cached).toBe(true);
      });

      it("lists the problems a submission would be refused for, with no preview", async () => {
        // A club can't make an event compulsory for a group.
        const groups = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          llm: extracting({ mandatory_for_groups: ["CSE-3"] }),
          cache: null,
        });
        expect(groups.draft.mandatory_for_groups).toEqual(["CSE-3"]);
        expect(groups.problems).toEqual([
          {
            field: "mandatory_for_groups",
            message: "Clubs can't make an event compulsory for student groups.",
          },
        ]);
        expect(groups.preview).toBeNull();
      });

      it("never lets a claim in the text raise the role's category", async () => {
        const claim = fakeLlm([
          JSON.stringify({
            ...QUIZ_EXTRACTION,
            claimed_category: "institute_event",
          }),
        ]);
        const viaLlm = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          llm: claim.llm,
          cache: null,
        });
        expect(viaLlm.category).toEqual({
          claimed: "institute_event",
          effective: "club_event",
          capped: true,
        });

        // BR-15's text through the rule parser (the live path).
        const viaRules = await parseBookingRequest(
          db,
          users.club,
          "Jam night Friday 6 to 9 pm, 300 people. This is an official Spectra event so mark it institute level.",
          { cache: null },
        );
        expect(viaRules.category).toEqual({
          claimed: "institute_event",
          effective: "club_event",
          capped: true,
        });
      });
    });

    describe("with the demo timetable", () => {
      beforeAll(async () => {
        await resetDemo(db, { ...FAST, actor: "u_admin" });
      });

      /** Removes the live requests a test submitted and re-decides the dataset's. */
      async function clearLiveRequests(): Promise<void> {
        await db
          .collection("booking_requests")
          .deleteMany({ origin: "manual" });
        await db.collection("cancellations").deleteMany({ origin: "manual" });
        await runSpectra(db, { actor: users.admin.id });
      }

      /** What a Spectra run decides from: the active dataset and the stored records. */
      async function engineState() {
        const version = await getActiveTimetableVersion(db);
        expect(version).not.toBeNull();
        const [active, records] = await Promise.all([
          getActiveDataset(db),
          listBookingRequests(db, {
            state: ["submitted", "pending_approval", "decided", "cancelled"],
          }),
        ]);
        return {
          assignments: version!.assignments,
          active,
          records: records as BookingRequestRecord[],
        };
      }

      const QUIZ_DRAFT = draft({
        title: "Quiz prelims",
        attendance: 140,
        duration_periods: 2,
        windows: [{ day: "THU", from_period: 10, to_period: 11 }],
        room_types: ["seminar_hall", "lecture_hall"],
        needs: ["pa_system", "projector"],
        requested_room: "SH-1",
      });

      /** SH-1 is BR-06's (filed earlier, same category): the club's quiz gets LH-1. */
      const QUIZ_PREVIEW = {
        status: "approved",
        reason_code: "ROOM_SWAPPED_IN_WINDOW",
        reason:
          "SH-1 is held by BR-06 (club event, submitted earlier). LH-1 has pa_system and projector and is free inside your window, THU P10–P11 (18:00–20:00).",
        room_id: "LH-1",
        day: "THU",
        start_period: 10,
        end_period: 11,
        approval: { needed: false, approver_role: null, department: null },
      };

      it("decides the draft as one more request against the active timetable", async () => {
        const { active, records, assignments } = await engineState();
        const preview = previewDecision(
          active,
          records,
          assignments,
          QUIZ_DRAFT,
          users.club,
        );
        expect(preview).toEqual(QUIZ_PREVIEW);
        // The dataset itself is left alone.
        expect(
          active.booking_requests.some((r) => r.id === PREVIEW_REQUEST_ID),
        ).toBe(false);

        // An admin's draft ranks first and takes the room it asked for.
        expect(
          previewDecision(
            active,
            records,
            assignments,
            QUIZ_DRAFT,
            users.admin,
          ),
        ).toMatchObject({
          status: "approved",
          reason_code: "APPROVED_AS_REQUESTED",
          room_id: "SH-1",
        });

        // Incomplete drafts are not decided.
        expect(
          previewDecision(
            active,
            records,
            assignments,
            draft({ duration_periods: null, missing: ["duration_periods"] }),
            users.club,
          ),
        ).toBeNull();
      });

      it("previews the engine's decision for a complete draft and stores nothing", async () => {
        const before = {
          requests: await db.collection("booking_requests").countDocuments(),
          decisions: await db.collection("booking_decisions").countDocuments(),
        };
        const result = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          cache: null,
        });
        expect(ParseBookingResultSchema.parse(result)).toEqual(result);
        expect(result.draft.missing).toEqual([]);
        expect(result.problems).toEqual([]);
        expect(result.preview).toEqual(QUIZ_PREVIEW);

        expect(await db.collection("booking_requests").countDocuments()).toBe(
          before.requests,
        );
        expect(await db.collection("booking_decisions").countDocuments()).toBe(
          before.decisions,
        );
        const log = await getAiLog(db, result.log_id);
        expect(log?.engine_verdict).toBe("approved");
      });

      it("names the approver a CS-lab booking would need", async () => {
        const result = await parseBookingRequest(db, users.club, "lab", {
          llm: extracting(LAB_EXTRACTION),
          cache: null,
        });
        expect(result.problems).toEqual([]);
        expect(result.preview).toEqual({
          status: "approved",
          reason_code: "APPROVED_AS_REQUESTED",
          reason:
            "CS-LAB-1 is free WED P10–P11 (18:00–20:00) and has computers.",
          room_id: "CS-LAB-1",
          day: "WED",
          start_period: 10,
          end_period: 11,
          approval: {
            needed: true,
            approver_role: "department_coordinator",
            department: "CSE",
          },
        });
      });

      it("gives no preview for a draft a submission would refuse, with the submission's messages", async () => {
        // Complete and valid, the quiz would be previewed; a compulsory group a club may not
        // name takes the preview away.
        const groups = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          llm: extracting({ mandatory_for_groups: ["CSE-3"] }),
          cache: null,
        });
        expect(groups.draft.missing).toEqual([]);
        expect(groups.problems).toEqual([
          {
            field: "mandatory_for_groups",
            message: "Clubs can't make an event compulsory for student groups.",
          },
        ]);
        expect(groups.preview).toBeNull();
        expect((await getAiLog(db, groups.log_id))?.engine_verdict).toBeNull();

        const result = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          llm: extracting({ duration_periods: 3 }),
          cache: null,
        });
        expect(result.draft).toMatchObject({
          duration_periods: 3,
          windows: [{ day: "THU", from_period: 10, to_period: 11 }],
        });
        expect(result.problems).toEqual([
          {
            field: "duration_periods",
            message:
              "A 3-period booking doesn't fit in any window (the longest is 2 periods).",
          },
        ]);
        expect(result.preview).toBeNull();
        expect((await getAiLog(db, result.log_id))?.engine_verdict).toBeNull();
      });

      it("matches what submitting the same draft decides", async () => {
        try {
          const cases: [SessionUser, Partial<BookingDraftLLM>][] = [
            [users.club, QUIZ_EXTRACTION],
            [users.club, LAB_EXTRACTION],
            // A series: the preview reports its first day, decided with the rest.
            [users.faculty, { repeat_days: ["FRI"] }],
          ];
          for (const [user, extraction] of cases) {
            const parsed = await parseBookingRequest(db, user, "text", {
              llm: extracting(extraction),
              cache: null,
            });
            expect(parsed.preview).not.toBeNull();
            const { title, attendance, duration_periods, ...rest } =
              parsed.draft;
            const submitted = await createBooking(db, user, {
              ...rest,
              title: title!,
              attendance: attendance!,
              duration_periods: duration_periods!,
              source: "nl",
              ai_log_id: parsed.log_id,
            });
            const [first] = submitted.bookings;
            const { approval, ...slot } = parsed.preview!;
            expect(first.decision).toMatchObject(slot);
            expect(first.approval).toEqual(approval);
            await clearLiveRequests();
          }
        } finally {
          await clearLiveRequests();
        }
      });

      it("previews nothing while the draft is incomplete", async () => {
        const result = await parseBookingRequest(
          db,
          users.club,
          "Need somewhere for the quiz finals after lunch on Thursday, maybe 150 people.",
          { cache: null },
        );
        expect(result.draft.missing).toContain("duration_periods");
        expect(result.preview).toBeNull();
        const log = await getAiLog(db, result.log_id);
        expect(log?.engine_verdict).toBeNull();
      });

      it("flags a named room that lacks a need (SH-2 is not accessible)", async () => {
        const result = await parseBookingRequest(
          db,
          users.club,
          "I want SH-2 on Friday at 10 am for a wheelchair-accessible poster session, 60 people.",
          { cache: null },
        );
        expect(result.requested_room).toMatchObject({
          room_id: "SH-2",
          suggestion: "SH-1",
        });
        expect(result.requested_room.note).toContain("SH-1");
        expect(result.draft.needs).toContain("accessible");
        // The engine moves it to an accessible room inside the window.
        expect(result.preview).toMatchObject({
          status: "approved",
          reason_code: "ROOM_SWAPPED_IN_WINDOW",
          room_id: "CR-103",
          day: "FRI",
          start_period: 3,
        });
      });

      it("ranks a club's draft after every request already filed", async () => {
        // A club draft is the lowest category and filed last, so it can only take what is left:
        // its slot never overlaps a slot a stored decision holds in the same room.
        const version = await getActiveTimetableVersion(db);
        const held = await db
          .collection<{
            request_id: string;
            status: string;
            room_id?: string;
            day?: string;
            start_period?: number;
            end_period?: number;
          }>("booking_decisions")
          .find({ timetable_version: version!.id, status: { $ne: "rejected" } })
          .toArray();
        expect(held.length).toBeGreaterThan(0);

        const result = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
          cache: null,
        });
        const preview = result.preview!;
        expect(preview.status).toBe("approved");
        const clash = held.filter(
          (d) =>
            d.room_id === preview.room_id &&
            d.day === preview.day &&
            d.start_period! <= preview.end_period! &&
            preview.start_period! <= d.end_period!,
        );
        expect(clash.map((d) => d.request_id)).toEqual([]);
      });

      it("leaves out requests an approver rejected, as a Spectra run does", async () => {
        // BR-06 and BR-07 are the club requests that want SH-1 on Thursday evening.
        const ids = ["BR-06", "BR-07"];
        const requests = db.collection("booking_requests");
        await requests.updateMany({ _id: { $in: ids } } as never, {
          $set: {
            rejection: {
              rejected_by: "u_admin",
              rejected_at: "2027-02-05T10:00:00+05:30",
              comment: "test",
            },
          },
        });
        try {
          const result = await parseBookingRequest(db, users.club, QUIZ_TEXT, {
            cache: null,
          });
          expect(result.preview).toMatchObject({
            status: "approved",
            reason_code: "APPROVED_AS_REQUESTED",
            room_id: "SH-1",
            day: "THU",
            start_period: 10,
            end_period: 11,
          });
        } finally {
          await requests.updateMany({ _id: { $in: ids } } as never, {
            $unset: { rejection: "" },
          });
        }
      });
    });
  },
);
