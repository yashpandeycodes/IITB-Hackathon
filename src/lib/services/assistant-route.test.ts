/**
 * `POST /api/assistant` and `POST /api/explain` through the real guards (signed session cookies),
 * the body limits and the quotas, against a throwaway database with AI off. No timetable is
 * generated here: the assistant then says one is needed, and session explanations still work.
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
import {
  AssistantReplySchema,
  ExplainResultSchema,
  type SessionUser,
} from "@/lib/contracts";
import { openTestDb } from "@/lib/db/repos/test-db";

const state = vi.hoisted(() => {
  process.env.AUTH_SECRET = "route-test-secret-0123456789-abcdefghijklmnop";
  process.env.JWT_SECRET = "";
  process.env.MONGODB_URI = "";
  process.env.GEMINI_API_KEY = "";
  return { db: undefined as Db | undefined };
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
  getLlmConfig: async () => null,
}));

const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
const { seedDemoUsers } = await import("@/lib/auth/seed");
const { limits, resetRateLimits } = await import("@/lib/auth/rate-limit");
const { findUserByEmail, toUser } = await import("@/lib/db/repos/users");
const assistantRoute = await import("@/app/api/assistant/route");
const explainRoute = await import("@/app/api/explain/route");

const testDb = await openTestDb("assistant-route.test");
state.db = testDb?.db;
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

type Route = typeof assistantRoute.POST;

async function post(
  route: Route,
  path: string,
  options: { user?: SessionUser; body?: unknown; raw?: string } = {},
): Promise<{
  status: number;
  body: { ok: boolean; data?: unknown; error?: { code: string } };
  headers: Headers;
}> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.user)
    headers.cookie = `${SESSION_COOKIE}=${await signSession(options.user)}`;
  const response = await route(
    new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers,
      body: options.raw ?? JSON.stringify(options.body ?? {}),
    }),
    undefined,
  );
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

describe.skipIf(!testDb)(
  "assistant and explain routes (MongoDB)",
  { timeout: 60_000 },
  () => {
    const demo = {} as Record<
      "admin" | "coordinator" | "faculty" | "club",
      SessionUser
    >;

    beforeAll(async () => {
      await seedDemoUsers(db);
      for (const [key, email] of [
        ["admin", "admin@cit.demo"],
        ["coordinator", "coord.cse@cit.demo"],
        ["faculty", "faculty@cit.demo"],
        ["club", "club@cit.demo"],
      ] as const) {
        const doc = await findUserByEmail(db, email);
        if (!doc) throw new Error(`demo user ${email} was not seeded`);
        demo[key] = toUser(doc);
      }
    });

    beforeEach(() => resetRateLimits());

    // -------------------------------------------------------------------- /api/assistant

    const ask = (options: Parameters<typeof post>[2]) =>
      post(assistantRoute.POST, "/api/assistant", options);

    it("requires a session (401) and refuses clubs (403)", async () => {
      expect((await ask({ body: { message: "hi" } })).status).toBe(401);
      const club = await ask({
        user: demo.club,
        body: { message: "move my event" },
      });
      expect(club.status).toBe(403);
      expect(club.body.error?.code).toBe("FORBIDDEN");
    });

    it("answers faculty, coordinators and admins with a reply, never cached", async () => {
      for (const user of [demo.faculty, demo.coordinator, demo.admin]) {
        const res = await ask({
          user,
          body: { message: "Move CS202-L2 to Thursday morning" },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const reply = AssistantReplySchema.parse(res.body.data);
        expect(reply.intent).toBe("move_session");
        expect(reply.verified).toBe(false);
      }
    });

    it("rejects an empty message, unknown fields and a body over 8 KB (400)", async () => {
      for (const body of [
        { message: "" },
        { message: "hi", status: "approved" },
        {},
      ]) {
        const res = await ask({ user: demo.faculty, body });
        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe("VALIDATION_ERROR");
      }
      const big = await ask({
        user: demo.faculty,
        raw: JSON.stringify({ message: "x".repeat(9_000) }),
      });
      expect(big.status).toBe(400);
    });

    it("limits turns per user (429)", async () => {
      for (let i = 0; i < 30; i++) limits.assistantUser.hit(demo.faculty.id);
      const res = await ask({ user: demo.faculty, body: { message: "hi" } });
      expect(res.status).toBe(429);
      expect(res.body.error?.code).toBe("RATE_LIMITED");
    });

    // ---------------------------------------------------------------------- /api/explain

    const why = (options: Parameters<typeof post>[2]) =>
      post(explainRoute.POST, "/api/explain", options);

    it("explains a session to any signed-in role, including clubs", async () => {
      expect(
        (await why({ body: { subject: "session", id: "CS202-L1" } })).status,
      ).toBe(401);
      const res = await why({
        user: demo.club,
        body: { subject: "session", id: "CS202-L1" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const result = ExplainResultSchema.parse(res.body.data);
      expect(result).toMatchObject({
        subject: "session",
        id: "CS202-L1",
        source: "template",
      });
    });

    it("answers 404 for unknown sessions and change requests, 400 for bad bodies", async () => {
      expect(
        (
          await why({
            user: demo.faculty,
            body: { subject: "session", id: "NOPE-1" },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await why({
            user: demo.admin,
            body: { subject: "change", id: "CR-0001" },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await why({
            user: demo.faculty,
            body: { subject: "timetable", id: "x" },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await why({
            user: demo.faculty,
            raw: JSON.stringify({ subject: "session", id: "x".repeat(5_000) }),
          })
        ).status,
      ).toBe(400);
    });

    it("limits explanation requests per user (429)", async () => {
      for (let i = 0; i < 60; i++) limits.explainUser.hit(demo.faculty.id);
      const res = await why({
        user: demo.faculty,
        body: { subject: "session", id: "CS202-L1" },
      });
      expect(res.status).toBe(429);
    });
  },
);
