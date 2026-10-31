/**
 * `POST /api/bookings/parse` through the real guards (signed session cookies), the body limits
 * and the per-user quota, against a throwaway database with AI off (no Gemini key: the rule
 * parser answers, as it does locally).
 */
import type { Db } from "mongodb";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { LlmClient, LlmConfig } from "@/lib/ai";
import {
  ParseBookingResultSchema,
  type Category,
  type SessionUser,
} from "@/lib/contracts";
import { openTestDb } from "@/lib/db/repos/test-db";

const state = vi.hoisted(() => {
  // Read lazily by the env module; set before anything calls getServerEnv().
  process.env.AUTH_SECRET = "route-test-secret-0123456789-abcdefghijklmnop";
  process.env.JWT_SECRET = "";
  process.env.MONGODB_URI = "";
  process.env.GEMINI_API_KEY = "";
  return {
    db: undefined as Db | undefined,
    /** What `getLlmConfig` returns (null: AI off, as without a key). */
    llm: null as LlmConfig,
  };
});

vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: async () => {
    if (!state.db) throw new Error("test database not open");
    return state.db;
  },
}));

vi.mock("./llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./llm")>()),
  getLlmConfig: async () => state.llm,
}));

const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
const { seedDemoUsers } = await import("@/lib/auth/seed");
const { limits, resetRateLimits } = await import("@/lib/auth/rate-limit");
const { findUserByEmail, toUser } = await import("@/lib/db/repos/users");
const { getAiLog } = await import("@/lib/db/repos/ai-logs");
const parseRoute = await import("@/app/api/bookings/parse/route");

const testDb = await openTestDb("booking-parse-route.test");
state.db = testDb?.db;
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

const DEMO = {
  admin: { email: "admin@cit.demo", cap: "institute_event" },
  coordinator: { email: "coord.cse@cit.demo", cap: "department_event" },
  faculty: { email: "faculty@cit.demo", cap: "guest_lecture" },
  club: { email: "club@cit.demo", cap: "club_event" },
} as const satisfies Record<string, { email: string; cap: Category }>;
type DemoKey = keyof typeof DEMO;
const demo = {} as Record<DemoKey, SessionUser>;

const TEXT = "Seminar on Thursday 4 to 5 pm, 60 people, projector needed";

async function post(
  options: { user?: SessionUser; body?: unknown; raw?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.user) {
    headers.cookie = `${SESSION_COOKIE}=${await signSession(options.user)}`;
  }
  return parseRoute.POST(
    new NextRequest("http://localhost/api/bookings/parse", {
      method: "POST",
      headers,
      body: options.raw ?? JSON.stringify(options.body ?? { text: TEXT }),
    }),
    undefined,
  );
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe.skipIf(!testDb)(
  "POST /api/bookings/parse (MongoDB)",
  { timeout: 60_000 },
  () => {
    beforeAll(async () => {
      await seedDemoUsers(db);
      for (const [key, { email }] of Object.entries(DEMO)) {
        const doc = await findUserByEmail(db, email);
        if (!doc) throw new Error(`demo user ${email} was not seeded`);
        demo[key as DemoKey] = toUser(doc);
      }
    });

    beforeEach(() => {
      resetRateLimits();
      state.llm = null;
    });

    it("requires a session", async () => {
      const { status, body } = await json(await post());
      expect(status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UNAUTHENTICATED");
    });

    it("parses for every role with AI off, never cached by the browser", async () => {
      for (const key of Object.keys(DEMO) as DemoKey[]) {
        const res = await post({ user: demo[key] });
        expect(res.headers.get("cache-control")).toBe("no-store");
        const { status, body } = await json(res);
        expect(status, key).toBe(200);
        expect(body.ok).toBe(true);
        const data = ParseBookingResultSchema.parse(body.data);
        expect(data).toEqual(body.data);
        expect(data.source).toBe("rules");
        expect(data.ai_enabled).toBe(false);
        // The category comes from the session's role, never from the text.
        expect(data.category.effective, key).toBe(DEMO[key].cap);
        expect(data.draft.attendance).toBe(60);
        expect(data.fallback_reason).toBeNull();
        expect(data.problems).toEqual([]);

        const log = await getAiLog(db, data.log_id);
        expect(log?.user_id).toBe(demo[key].id);
        expect(log?.input).toBe(TEXT);
      }
    });

    it("returns only the fallback code when the LLM times out; the detail stays in ai_logs", async () => {
      let calls = 0;
      const client: LlmClient = {
        generateJson: ({ signal }) => {
          calls += 1;
          // Never answers: the call times out.
          return new Promise<string>((_, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          });
        },
        generateText: async () => "",
      };
      state.llm = { client, model: "fake-flash", timeoutMs: 50 };
      const res = await post({ user: demo.club });
      const raw = await res.text();
      expect(res.status).toBe(200);
      const data = ParseBookingResultSchema.parse(JSON.parse(raw).data);
      expect(calls).toBe(1);
      expect(data).toMatchObject({
        source: "rules",
        model: null,
        ai_enabled: true,
        fallback_reason: "timeout",
      });
      // The rule parser filled the draft anyway.
      expect(data.draft.attendance).toBe(60);
      const log = await getAiLog(db, data.log_id);
      expect(log?.fallback_reason).toEqual(expect.stringContaining("timeout"));
      expect(log?.fallback_reason).not.toBe("timeout");
      expect(raw).not.toContain(log!.fallback_reason!);
    });

    it("rejects empty text, unknown fields and bodies over 8 KB", async () => {
      for (const body of [{ text: "   " }, {}, { text: TEXT, role: "admin" }]) {
        const res = await json(await post({ user: demo.club, body }));
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      }

      const big = await json(
        await post({
          user: demo.club,
          raw: JSON.stringify({ text: "a".repeat(9_000) }),
        }),
      );
      expect(big.status).toBe(400);
      expect(big.body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        details: { max_bytes: 8_192 },
      });

      const notJson = await json(await post({ user: demo.club, raw: "text" }));
      expect(notJson.status).toBe(400);
    });

    it("returns 429 once the user's parse quota is used up", async () => {
      // The route counts against the quota...
      expect((await post({ user: demo.club })).status).toBe(200);
      // ...and the rest of the window is used up directly (30 per user per 10 minutes).
      let left = 0;
      while (limits.aiParseUser.peek(demo.club.id).allowed) {
        limits.aiParseUser.hit(demo.club.id);
        left++;
      }
      expect(left).toBe(29);

      const blocked = await post({ user: demo.club });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
      expect((await blocked.json()).error.code).toBe("RATE_LIMITED");

      // Another user still has quota.
      expect((await post({ user: demo.faculty })).status).toBe(200);
    });
  },
);
