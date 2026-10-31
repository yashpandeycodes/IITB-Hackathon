/**
 * Route-level tests for the data routes: RBAC through the real auth guards (signed session
 * cookies), envelopes and status codes, against a throwaway database.
 */
import type { Db } from "mongodb";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  HealthStatusSchema,
  ImportReportSchema,
  ResetReportSchema,
  ScheduleExportSchema,
  type SessionUser,
} from "@/lib/contracts";
import { openTestDb } from "@/lib/db/repos/test-db";
import { tinyDataset } from "./test-fixtures";

const state = vi.hoisted(() => {
  // Read lazily by the env module; set before anything calls getServerEnv().
  process.env.AUTH_SECRET = "route-test-secret-0123456789-abcdefghijklmnop";
  process.env.JWT_SECRET = "";
  process.env.MONGODB_URI = "";
  // Every reset here runs the real solver; a short wall-clock cap keeps the suite quick.
  process.env.SOLVER_TIME_BUDGET_MS = "1500";
  return { db: undefined as Db | undefined };
});

vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: async () => {
    if (!state.db) throw new Error("test database not open");
    return state.db;
  },
}));

const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
const { seedDemoUsers } = await import("@/lib/auth/seed");
const { findUserByEmail, toUser } = await import("@/lib/db/repos/users");
const settingsRoute = await import("@/app/api/settings/route");
const resetRoute = await import("@/app/api/admin/reset/route");
const datasetRoute = await import("@/app/api/admin/dataset/route");
const timetableRoute = await import("@/app/api/timetable/route");
const roomsRoute = await import("@/app/api/rooms/available/route");
const dashboardRoute = await import("@/app/api/dashboard/route");
const checkRoute = await import("@/app/api/timetable/check/route");
const healthRoute = await import("@/app/api/health/route");
const exportRoute = await import("@/app/api/export/route");
const validateRoute = await import("@/app/api/validate/route");

const testDb = await openTestDb("routes.test");
state.db = testDb?.db;

afterAll(async () => {
  await testDb?.cleanup();
});

async function request(
  path: string,
  options: { user?: SessionUser; method?: string; body?: unknown } = {},
): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (options.user) {
    headers.cookie = `${SESSION_COOKIE}=${await signSession(options.user)}`;
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("GET /api/health", () => {
  it("is 200 with the bundled dataset id when the database is down", async () => {
    const { status, body } = await json(
      await healthRoute.GET(await request("/api/health"), undefined),
    );
    expect(status).toBe(200);
    expect(HealthStatusSchema.parse(body.data)).toEqual(body.data);
    expect(body.data).toMatchObject({
      status: "ok",
      db: "down",
      dataset_id: "cit-public-v1",
    });
  });
});

/** The seeded demo accounts; the guards re-read the user, so sessions must name real users. */
const DEMO_EMAILS = {
  admin: "admin@cit.demo",
  coordinator: "coord.cse@cit.demo",
  faculty: "faculty@cit.demo",
  club: "club@cit.demo",
} as const;
const demo = {} as Record<keyof typeof DEMO_EMAILS, SessionUser>;

describe.skipIf(!testDb)(
  "data routes (MongoDB, real engine)",
  { timeout: 60_000 },
  () => {
    beforeAll(async () => {
      const db = testDb?.db as Db;
      await seedDemoUsers(db);
      for (const [key, email] of Object.entries(DEMO_EMAILS)) {
        const doc = await findUserByEmail(db, email);
        if (!doc) throw new Error(`demo user ${email} was not seeded`);
        demo[key as keyof typeof DEMO_EMAILS] = toUser(doc);
      }
      const res = await resetRoute.POST(
        await request("/api/admin/reset", { user: demo.admin, method: "POST" }),
        undefined,
      );
      expect(res.status).toBe(200);
      // The reset generated and activated a timetable, decided Spectra and scheduled exams.
      expect((await res.json()).data).toMatchObject({
        timetable_version: expect.stringMatching(/^TT-\d{4}$/),
        exam_schedule_id: expect.stringMatching(/^EXS-\d{4}$/),
      });
    }, 60_000);

    it("requires a session everywhere", async () => {
      const calls = [
        settingsRoute.GET(await request("/api/settings"), undefined),
        timetableRoute.GET(
          await request("/api/timetable?view=group&id=Y1-A"),
          undefined,
        ),
        roomsRoute.GET(
          await request(
            "/api/rooms/available?day=MON&from_period=1&to_period=2",
          ),
          undefined,
        ),
        dashboardRoute.GET(await request("/api/dashboard"), undefined),
        resetRoute.POST(
          await request("/api/admin/reset", { method: "POST" }),
          undefined,
        ),
      ];
      for (const res of await Promise.all(calls)) {
        const { status, body } = await json(res);
        expect(status).toBe(401);
        expect(body.error.code).toBe("UNAUTHENTICATED");
      }
    });

    it("keeps admin routes to admins", async () => {
      for (const user of [demo.coordinator, demo.faculty, demo.club]) {
        const reset = await json(
          await resetRoute.POST(
            await request("/api/admin/reset", { user, method: "POST" }),
            undefined,
          ),
        );
        expect(reset.status).toBe(403);
        expect(reset.body.error.code).toBe("FORBIDDEN");
        const upload = await datasetRoute.POST(
          await request("/api/admin/dataset", {
            user,
            method: "POST",
            body: tinyDataset(),
          }),
          undefined,
        );
        expect(upload.status).toBe(403);
        const patch = await settingsRoute.PATCH(
          await request("/api/settings", {
            user,
            method: "PATCH",
            body: { team: "Hacked" },
          }),
          undefined,
        );
        expect(patch.status).toBe(403);
      }
    });

    it("serves and updates settings", async () => {
      const read = await json(
        await settingsRoute.GET(
          await request("/api/settings", { user: demo.club }),
          undefined,
        ),
      );
      expect(read.status).toBe(200);
      expect(read.body.data.priority_order).toHaveLength(6);

      const bad = await json(
        await settingsRoute.PATCH(
          await request("/api/settings", {
            user: demo.admin,
            method: "PATCH",
            body: { priority_order: ["exam", "exam"] },
          }),
          undefined,
        ),
      );
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe("VALIDATION_ERROR");

      const empty = await settingsRoute.PATCH(
        await request("/api/settings", {
          user: demo.admin,
          method: "PATCH",
          body: {},
        }),
        undefined,
      );
      expect(empty.status).toBe(400);

      const good = await json(
        await settingsRoute.PATCH(
          await request("/api/settings", {
            user: demo.admin,
            method: "PATCH",
            body: { llm_enabled: false, team: "Team Crunch" },
          }),
          undefined,
        ),
      );
      expect(good.status).toBe(200);
      expect(good.body.data).toMatchObject({
        llm_enabled: false,
        team: "Team Crunch",
      });
    });

    it("serves timetable views to every role and validates the query", async () => {
      for (const user of Object.values(demo)) {
        const res = await json(
          await timetableRoute.GET(
            await request("/api/timetable?view=group&id=Y1-A&week=spectra", {
              user,
            }),
            undefined,
          ),
        );
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
          view: "group",
          id: "Y1-A",
          week: "spectra",
          version_id: expect.stringMatching(/^TT-\d{4}$/),
        });
        expect(res.body.data.cells.length).toBeGreaterThan(0);
      }
      const unknown = await json(
        await timetableRoute.GET(
          await request("/api/timetable?view=room&id=NOPE", {
            user: demo.faculty,
          }),
          undefined,
        ),
      );
      expect(unknown.status).toBe(404);
      expect(unknown.body.error.code).toBe("NOT_FOUND");
      const invalid = await json(
        await timetableRoute.GET(
          await request("/api/timetable?view=planet&id=X", {
            user: demo.faculty,
          }),
          undefined,
        ),
      );
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.details.fieldErrors.view).toBeDefined();
    });

    it("serves room availability with filters", async () => {
      const res = await json(
        await roomsRoute.GET(
          await request(
            "/api/rooms/available?day=THU&from_period=1&to_period=9&needs=stage&needs=pa_system",
            { user: demo.club },
          ),
          undefined,
        ),
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      // The reset placed classes, so a room is free only when nothing occupies the range.
      for (const row of res.body.data) {
        expect(row.free).toBe(row.busy_with.length === 0);
        for (const busy of row.busy_with) {
          expect(["session", "booking", "unavailable"]).toContain(busy.kind);
        }
      }
      const bad = await roomsRoute.GET(
        await request(
          "/api/rooms/available?day=THU&from_period=5&to_period=2",
          {
            user: demo.club,
          },
        ),
        undefined,
      );
      expect(bad.status).toBe(400);
    });

    it("runs what-if checks for any signed-in user", async () => {
      const anonymous = await checkRoute.POST(
        await request("/api/timetable/check", {
          method: "POST",
          body: { assignments: [] },
        }),
        undefined,
      );
      expect(anonymous.status).toBe(401);
      const res = await json(
        await checkRoute.POST(
          await request("/api/timetable/check", {
            user: demo.club,
            method: "POST",
            body: {
              assignments: [
                {
                  session_id: "MA101-AB-L1",
                  day: "MON",
                  start_period: 1,
                  room_id: "LH-1",
                },
              ],
            },
          }),
          undefined,
        ),
      );
      expect(res.status).toBe(200);
      expect(res.body.data.violations.length).toBeGreaterThan(0);
      expect(res.body.data.soft_penalty).toHaveProperty("total");
      // The reset activated a timetable, so the delta is against its soft total.
      expect(res.body.data.soft_delta).toEqual(expect.any(Number));
      const invalid = await checkRoute.POST(
        await request("/api/timetable/check", {
          user: demo.club,
          method: "POST",
          body: { assignments: [{ session_id: "X", day: "SUN" }] },
        }),
        undefined,
      );
      expect(invalid.status).toBe(400);
    });

    it("serves a role-aware dashboard", async () => {
      const res = await json(
        await dashboardRoute.GET(
          await request("/api/dashboard", { user: demo.faculty }),
          undefined,
        ),
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        role: "faculty",
        dataset_id: "cit-public-v1",
        timetable: { sessions_total: 189, sessions_scheduled: 189 },
      });
    });

    it("validates and exports the generated schedule with 0 hard violations", async () => {
      const report = await json(
        await validateRoute.GET(
          await request("/api/validate", { user: demo.admin }),
          undefined,
        ),
      );
      expect(report.status).toBe(200);
      expect(report.body.data).toMatchObject({
        dataset_id: "cit-public-v1",
        hard_violation_count: 0,
        bookings: { priority_inversions: [] },
      });
      const res = await exportRoute.GET(
        await request("/api/export?file=schedule", { user: demo.admin }),
        undefined,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="schedule.json"',
      );
      const schedule = ScheduleExportSchema.parse(await res.json());
      expect(schedule.dataset_id).toBe("cit-public-v1");
      expect(schedule.sessions).toHaveLength(189);
      expect(schedule.exams.length).toBeGreaterThan(0);
    });

    it("imports an uploaded dataset and rejects a bad one with issues", async () => {
      const bad = await json(
        await datasetRoute.POST(
          await request("/api/admin/dataset", {
            user: demo.admin,
            method: "POST",
            body: { dataset_id: "broken" },
          }),
          undefined,
        ),
      );
      expect(bad.status).toBe(400);
      expect(bad.body.error.details.issues.length).toBeGreaterThan(0);

      const good = await json(
        await datasetRoute.POST(
          await request("/api/admin/dataset", {
            user: demo.admin,
            method: "POST",
            body: tinyDataset(),
          }),
          undefined,
        ),
      );
      expect(good.status).toBe(200);
      expect(ImportReportSchema.parse(good.body.data)).toEqual(good.body.data);
      expect(good.body.data).toMatchObject({
        dataset_id: "tiny-v1",
        source: "upload",
        counts: { rooms: 4, sessions: 3 },
      });

      const back = await json(
        await resetRoute.POST(
          await request("/api/admin/reset", {
            user: demo.admin,
            method: "POST",
            body: { from: "bundled" },
          }),
          undefined,
        ),
      );
      expect(back.status).toBe(200);
      expect(back.body.data.dataset.dataset_id).toBe("cit-public-v1");
    });

    it("answers overlapping resets with 409 CONFLICT", async () => {
      const statuses = await Promise.all(
        [1, 2, 3, 4].map(async () => {
          const res = await resetRoute.POST(
            await request("/api/admin/reset", {
              user: demo.admin,
              method: "POST",
            }),
            undefined,
          );
          const body = await res.json();
          if (res.status === 409) expect(body.error.code).toBe("CONFLICT");
          return res.status;
        }),
      );
      expect(statuses.sort()).toEqual([200, 409, 409, 409]);
    });

    it("resets to the bundled dataset unless the stored one is asked for", async () => {
      await datasetRoute.POST(
        await request("/api/admin/dataset", {
          user: demo.admin,
          method: "POST",
          body: tinyDataset(),
        }),
        undefined,
      );
      const stored = await json(
        await resetRoute.POST(
          await request("/api/admin/reset", {
            user: demo.admin,
            method: "POST",
            body: { from: "stored" },
          }),
          undefined,
        ),
      );
      expect(stored.body.data.dataset.dataset_id).toBe("tiny-v1");
      const plain = await json(
        await resetRoute.POST(
          await request("/api/admin/reset", {
            user: demo.admin,
            method: "POST",
          }),
          undefined,
        ),
      );
      expect(ResetReportSchema.parse(plain.body.data)).toEqual(plain.body.data);
      expect(plain.body.data.dataset).toMatchObject({
        dataset_id: "cit-public-v1",
        source: "bundled",
      });
    });

    it("rejects a team name over 100 characters", async () => {
      const res = await settingsRoute.PATCH(
        await request("/api/settings", {
          user: demo.admin,
          method: "PATCH",
          body: { team: "x".repeat(101) },
        }),
        undefined,
      );
      expect(res.status).toBe(400);
    });
  },
);
