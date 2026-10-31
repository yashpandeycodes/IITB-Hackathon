/**
 * Route-level tests for the Phase-3 routes (generate + SSE, versions, activate, exams, Spectra,
 * export, validate): RBAC through the real guards, envelopes, headers and the SSE frame format,
 * against a throwaway database with the engine's search functions faked (`test-fixtures.ts`).
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
  ActivateTimetableResultSchema,
  ExamScheduleSchema,
  GenerateTimetableResultSchema,
  ScheduleExportSchema,
  SolverProgressSchema,
  SpectraRunResultSchema,
  TimetableVersionSummarySchema,
  ValidatorReportSchema,
  type SessionUser,
} from "@/lib/contracts";
import { openTestDb } from "@/lib/db/repos/test-db";
import {
  TINY_ASSIGNMENTS,
  fakeDecideBookings,
  fakeScheduleExams,
  fakeSolveSteps,
  phase3Dataset,
} from "./test-fixtures";

const state = vi.hoisted(() => {
  // Read lazily by the env module; set before anything calls getServerEnv().
  process.env.AUTH_SECRET = "route-test-secret-0123456789-abcdefghijklmnop";
  process.env.JWT_SECRET = "";
  process.env.MONGODB_URI = "";
  return { db: undefined as Db | undefined };
});

vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: async () => {
    if (!state.db) throw new Error("test database not open");
    return state.db;
  },
}));

vi.mock("@/lib/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine")>()),
  solveSteps: vi.fn(),
  scheduleExams: vi.fn(),
  decideBookings: vi.fn(),
}));

const engine = await import("@/lib/engine");
const solveSteps = vi.mocked(engine.solveSteps);
vi.mocked(engine.decideBookings).mockImplementation(fakeDecideBookings);
vi.mocked(engine.scheduleExams).mockImplementation(fakeScheduleExams);
solveSteps.mockImplementation(fakeSolveSteps());

const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
const { seedDemoUsers } = await import("@/lib/auth/seed");
const { findUserByEmail, toUser } = await import("@/lib/db/repos/users");
const { acquireDatasetLock } = await import("@/lib/db/locks");
const { limits, resetRateLimits } = await import("@/lib/auth/rate-limit");
const { importDataset } = await import("./dataset");
const generateRoute = await import("@/app/api/timetable/generate/route");
const versionsRoute = await import("@/app/api/timetable/versions/route");
const activateRoute =
  await import("@/app/api/timetable/versions/[id]/activate/route");
const examsRoute = await import("@/app/api/exams/route");
const examsGenerateRoute = await import("@/app/api/exams/generate/route");
const spectraRoute = await import("@/app/api/spectra/run/route");
const exportRoute = await import("@/app/api/export/route");
const validateRoute = await import("@/app/api/validate/route");

const testDb = await openTestDb("engine-routes.test");
state.db = testDb?.db;
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

async function request(
  path: string,
  options: {
    user?: SessionUser;
    method?: string;
    body?: unknown;
    accept?: string;
  } = {},
): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (options.user) {
    headers.cookie = `${SESSION_COOKIE}=${await signSession(options.user)}`;
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.accept) headers.accept = options.accept;
  return new NextRequest(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

type Frame = { event: string; data: unknown };

/** Splits an SSE body into `{event, data}` frames (every frame is `event:` + one `data:` line). */
function parseFrames(text: string): Frame[] {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const lines = chunk.split("\n");
      const event = lines.find((l) => l.startsWith("event: "));
      const data = lines.find((l) => l.startsWith("data: "));
      if (!event || !data) throw new Error(`malformed frame: ${chunk}`);
      return { event: event.slice(7), data: JSON.parse(data.slice(6)) };
    });
}

const SSE = "text/event-stream";
const count = (name: string) => db.collection(name).countDocuments();

const DEMO_EMAILS = {
  admin: "admin@cit.demo",
  coordinator: "coord.cse@cit.demo",
  faculty: "faculty@cit.demo",
  club: "club@cit.demo",
} as const;
const demo = {} as Record<keyof typeof DEMO_EMAILS, SessionUser>;

const activateParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!testDb)("Phase-3 routes (MongoDB, mocked engine)", () => {
  beforeAll(async () => {
    await seedDemoUsers(db);
    for (const [key, email] of Object.entries(DEMO_EMAILS)) {
      const doc = await findUserByEmail(db, email);
      if (!doc) throw new Error(`demo user ${email} was not seeded`);
      demo[key as keyof typeof DEMO_EMAILS] = toUser(doc);
    }
    await importDataset(db, phase3Dataset(), "upload");
  });

  // Schedule runs are rate-limited per admin and per IP; every test starts with fresh counters.
  beforeEach(() => resetRateLimits());

  /** Every new admin route, called as `user` (or anonymously). */
  async function adminCalls(user?: SessionUser): Promise<Response[]> {
    return Promise.all([
      generateRoute.POST(
        await request("/api/timetable/generate", { user, method: "POST" }),
        undefined,
      ),
      generateRoute.POST(
        await request("/api/timetable/generate", {
          user,
          method: "POST",
          accept: SSE,
        }),
        undefined,
      ),
      versionsRoute.GET(
        await request("/api/timetable/versions", { user }),
        undefined,
      ),
      activateRoute.POST(
        await request("/api/timetable/versions/TT-0001/activate", {
          user,
          method: "POST",
        }),
        activateParams("TT-0001"),
      ),
      examsGenerateRoute.POST(
        await request("/api/exams/generate", { user, method: "POST" }),
        undefined,
      ),
      spectraRoute.POST(
        await request("/api/spectra/run", { user, method: "POST" }),
        undefined,
      ),
      exportRoute.GET(await request("/api/export", { user }), undefined),
      validateRoute.GET(await request("/api/validate", { user }), undefined),
    ]);
  }

  it("requires a session on every new route", async () => {
    const responses = [
      ...(await adminCalls()),
      await examsRoute.GET(await request("/api/exams"), undefined),
    ];
    for (const res of responses) {
      const { status, body } = await json(res);
      expect(status).toBe(401);
      expect(body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("keeps the admin routes to admins", async () => {
    for (const user of [demo.faculty, demo.club, demo.coordinator]) {
      for (const res of await adminCalls(user)) {
        const { status, body } = await json(res);
        expect(status).toBe(403);
        expect(body.error.code).toBe("FORBIDDEN");
      }
    }
    expect(solveSteps).not.toHaveBeenCalled();
    expect(await count("timetable_versions")).toBe(0);
  });

  it("serves the exam schedule (null before one exists) to every role", async () => {
    for (const user of Object.values(demo)) {
      const res = await json(
        await examsRoute.GET(await request("/api/exams", { user }), undefined),
      );
      expect(res).toEqual({ status: 200, body: { ok: true, data: null } });
    }
  });

  it("validates the generate body", async () => {
    for (const body of [
      { time_budget_ms: 50 },
      { activate: "yes" },
      { seed: -1 },
      { budget: 1000 },
    ]) {
      const res = await json(
        await generateRoute.POST(
          await request("/api/timetable/generate", {
            user: demo.admin,
            method: "POST",
            body,
          }),
          undefined,
        ),
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("generates a draft and answers with the JSON envelope", async () => {
    const res = await json(
      await generateRoute.POST(
        await request("/api/timetable/generate", {
          user: demo.admin,
          method: "POST",
          body: { seed: 5, time_budget_ms: 1000 },
        }),
        undefined,
      ),
    );
    expect(res.status).toBe(200);
    const data = GenerateTimetableResultSchema.parse(res.body.data);
    expect(data).toMatchObject({
      activated: false,
      spectra: null,
      version: {
        id: "TT-0001",
        status: "draft",
        created_by: demo.admin.id,
        solver_meta: { seed: 5 },
      },
    });
    expect(solveSteps.mock.lastCall?.[1]).toMatchObject({
      seed: 5,
      timeBudgetMs: 1000,
    });
    // No body at all is fine too (seed from settings).
    const bare = await generateRoute.POST(
      await request("/api/timetable/generate", {
        user: demo.admin,
        method: "POST",
      }),
      undefined,
    );
    expect(bare.status).toBe(200);
  });

  it("streams progress frames and then the result", async () => {
    const res = await generateRoute.POST(
      await request("/api/timetable/generate", {
        user: demo.admin,
        method: "POST",
        body: { activate: true },
        accept: SSE,
      }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const frames = parseFrames(await res.text());
    expect(frames.map((f) => f.event)).toEqual([
      "progress",
      "progress",
      "result",
    ]);
    for (const frame of frames.slice(0, -1)) {
      expect(SolverProgressSchema.parse(frame.data)).toEqual(frame.data);
    }
    const result = GenerateTimetableResultSchema.parse(frames[2].data);
    expect(result).toMatchObject({
      activated: true,
      version: { status: "active" },
      spectra: { approved: 2, rejected: 1, session_overrides: 1 },
    });
    expect(await count("locks")).toBe(0);
  });

  it("streams an error frame when the run fails and releases the lock", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    solveSteps.mockImplementationOnce(
      fakeSolveSteps(TINY_ASSIGNMENTS.slice(1)),
    );
    const before = await count("timetable_versions");
    const res = await generateRoute.POST(
      await request("/api/timetable/generate", {
        user: demo.admin,
        method: "POST",
        accept: SSE,
      }),
      undefined,
    );
    expect(res.status).toBe(200);
    const frames = parseFrames(await res.text());
    expect(frames.map((f) => f.event)).toEqual([
      "progress",
      "progress",
      "error",
    ]);
    expect(frames[2].data).toMatchObject({
      code: "INFEASIBLE",
      message: expect.stringMatching(/Nothing was saved/),
      details: { unplaced: ["C1-L1"] },
    });
    expect(await count("timetable_versions")).toBe(before);
    expect(await count("locks")).toBe(0);
  });

  it("hides internal failures in the error frame", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    solveSteps.mockImplementationOnce(() => {
      throw new Error("mongodb://user:secret@host exploded");
    });
    const res = await generateRoute.POST(
      await request("/api/timetable/generate", {
        user: demo.admin,
        method: "POST",
        accept: SSE,
      }),
      undefined,
    );
    const text = await res.text();
    expect(text).not.toContain("secret");
    expect(parseFrames(text)).toEqual([
      {
        event: "error",
        data: { code: "INTERNAL_ERROR", message: expect.any(String) },
      },
    ]);
    expect(spy).toHaveBeenCalled();
    expect(await count("locks")).toBe(0);
  });

  it("answers a plain 409 before streaming while the lock is held", async () => {
    const release = await acquireDatasetLock(db);
    try {
      for (const accept of [SSE, undefined]) {
        const res = await generateRoute.POST(
          await request("/api/timetable/generate", {
            user: demo.admin,
            method: "POST",
            accept,
          }),
          undefined,
        );
        expect(res.status).toBe(409);
        expect(res.headers.get("content-type")).toMatch(/^application\/json/);
        expect((await res.json()).error.code).toBe("CONFLICT");
      }
    } finally {
      await release();
    }
  });

  it("finishes the run and releases the lock when the client goes away", async () => {
    const before = await count("timetable_versions");
    const res = await generateRoute.POST(
      await request("/api/timetable/generate", {
        user: demo.admin,
        method: "POST",
        accept: SSE,
      }),
      undefined,
    );
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toMatch(/^event: progress\n/);
    await reader.cancel();
    await vi.waitFor(async () => {
      expect(await count("timetable_versions")).toBe(before + 1);
      expect(await count("locks")).toBe(0);
    });
  });

  it("lists versions newest first without assignments", async () => {
    const res = await json(
      await versionsRoute.GET(
        await request("/api/timetable/versions", { user: demo.admin }),
        undefined,
      ),
    );
    expect(res.status).toBe(200);
    const ids = res.body.data.map((v: { id: string }) => v.id);
    expect(ids).toEqual([...ids].sort().reverse());
    for (const summary of res.body.data) {
      expect(TimetableVersionSummarySchema.parse(summary)).toEqual(summary);
    }
  });

  it("activates a version by id", async () => {
    const res = await json(
      await activateRoute.POST(
        await request("/api/timetable/versions/TT-0001/activate", {
          user: demo.admin,
          method: "POST",
        }),
        activateParams("TT-0001"),
      ),
    );
    expect(res.status).toBe(200);
    const data = ActivateTimetableResultSchema.parse(res.body.data);
    expect(data.version).toMatchObject({ id: "TT-0001", status: "active" });
    expect(data.spectra.timetable_version).toBe("TT-0001");

    const missing = await json(
      await activateRoute.POST(
        await request("/api/timetable/versions/TT-9999/activate", {
          user: demo.admin,
          method: "POST",
        }),
        activateParams("TT-9999"),
      ),
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });

  it("runs Spectra decisions", async () => {
    const res = await json(
      await spectraRoute.POST(
        await request("/api/spectra/run", { user: demo.admin, method: "POST" }),
        undefined,
      ),
    );
    expect(res.status).toBe(200);
    const data = SpectraRunResultSchema.parse(res.body.data);
    expect(data).toMatchObject({ timetable_version: "TT-0001", approved: 2 });
    expect(data.decisions).toHaveLength(3);
  });

  it("generates exams and serves them to every role", async () => {
    const res = await json(
      await examsGenerateRoute.POST(
        await request("/api/exams/generate", {
          user: demo.admin,
          method: "POST",
        }),
        undefined,
      ),
    );
    expect(res.status).toBe(200);
    const schedule = ExamScheduleSchema.parse(res.body.data);
    expect(schedule.status).toBe("active");
    for (const user of [demo.club, demo.faculty]) {
      const read = await json(
        await examsRoute.GET(await request("/api/exams", { user }), undefined),
      );
      expect(read.body.data).toEqual(schedule);
    }
  });

  it("serves the validator report", async () => {
    const res = await json(
      await validateRoute.GET(
        await request("/api/validate", { user: demo.admin }),
        undefined,
      ),
    );
    expect(res.status).toBe(200);
    expect(ValidatorReportSchema.parse(res.body.data)).toEqual(res.body.data);
    expect(res.body.data.hard_violation_count).toBe(0);
  });

  it("downloads schedule.json as a file", async () => {
    const res = await exportRoute.GET(
      await request("/api/export?file=schedule", { user: demo.admin }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="schedule.json"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text.endsWith("}\n")).toBe(true);
    const schedule = JSON.parse(text);
    expect(ScheduleExportSchema.parse(schedule)).toStrictEqual(schedule);
    expect(text).toBe(JSON.stringify(schedule, null, 2) + "\n");
    expect(schedule.sessions).toEqual(TINY_ASSIGNMENTS);

    const bad = await exportRoute.GET(
      await request("/api/export?file=secrets", { user: demo.admin }),
      undefined,
    );
    expect(bad.status).toBe(400);
  });

  it("answers 409 HARD_CONSTRAINT instead of a file when the schedule is invalid", async () => {
    await db
      .collection("booking_decisions")
      .updateOne({ _id: "BR-01" as never }, { $set: { room_id: "CS-LAB" } });
    const res = await exportRoute.GET(
      await request("/api/export", { user: demo.admin }),
      undefined,
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("content-disposition")).toBeNull();
    const body = await res.json();
    expect(body.error.code).toBe("HARD_CONSTRAINT");
    expect(body.error.details.length).toBeGreaterThan(0);
    expect(body.error.details[0]).toHaveProperty("rule");
  });

  it("answers 429 with Retry-After once an admin has used up the schedule-run quota", async () => {
    for (let i = 0; i < 30; i += 1) limits.scheduleRunUser.hit(demo.admin.id);
    const before = await count("booking_decisions");
    const response = await spectraRoute.POST(
      await request("/api/spectra/run", { user: demo.admin, method: "POST" }),
      undefined,
    );
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    const { body } = await json(response);
    expect(body.error).toMatchObject({
      code: "RATE_LIMITED",
      details: { retry_after_seconds: expect.any(Number) },
    });
    expect(await count("booking_decisions")).toBe(before);
  });

  it("answers 404 for a malformed version id without echoing it", async () => {
    const id = "x".repeat(300);
    const { status, body } = await json(
      await activateRoute.POST(
        await request(`/api/timetable/versions/${id}/activate`, {
          user: demo.admin,
          method: "POST",
        }),
        activateParams(id),
      ),
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).not.toContain("xxx");
  });

  it("rejects a generate body sent without a JSON content type", async () => {
    const response = await generateRoute.POST(
      new NextRequest("http://localhost/api/timetable/generate", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=${await signSession(demo.admin)}`,
          "content-length": "17",
        },
        body: '{"activate":true}',
      }),
      undefined,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
