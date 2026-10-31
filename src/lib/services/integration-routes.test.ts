/**
 * Route-level tests for the frontend integration reads: `GET /api/reference`, `GET /api/spectra`
 * and the dashboard's booking score. RBAC through the real guards (signed session cookies),
 * against a throwaway database and the real engine.
 */
import type { Db } from "mongodb";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DashboardSchema,
  ReferenceDataSchema,
  SpectraStateSchema,
  type ReferenceData,
  type SessionUser,
  type SpectraState,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { openTestDb } from "@/lib/db/repos/test-db";
import { phase3Dataset, seedTinyWorkingState } from "./test-fixtures";

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

const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
const { seedDemoUsers } = await import("@/lib/auth/seed");
const { findUserByEmail, toUser } = await import("@/lib/db/repos/users");
const { importDataset } = await import("./dataset");
const { resetDemo } = await import("./reset");
const { validateCurrentSchedule } = await import("./export");
const referenceRoute = await import("@/app/api/reference/route");
const spectraRoute = await import("@/app/api/spectra/route");
const dashboardRoute = await import("@/app/api/dashboard/route");

const testDb = await openTestDb("integration-routes.test");
state.db = testDb?.db;
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

async function request(path: string, user?: SessionUser): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (user) headers.cookie = `${SESSION_COOKIE}=${await signSession(user)}`;
  return new NextRequest(`http://localhost${path}`, { headers });
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

/** The seeded demo accounts; the guards re-read the user, so sessions must name real users. */
const DEMO_EMAILS = {
  admin: "admin@cit.demo",
  coordinator: "coord.cse@cit.demo",
  faculty: "faculty@cit.demo",
  club: "club@cit.demo",
} as const;
const demo = {} as Record<keyof typeof DEMO_EMAILS, SessionUser>;

async function getReference(user: SessionUser): Promise<ReferenceData> {
  const { status, body } = await json(
    await referenceRoute.GET(await request("/api/reference", user), undefined),
  );
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(ReferenceDataSchema.parse(body.data)).toEqual(body.data);
  return body.data;
}

async function getSpectra(user: SessionUser): Promise<SpectraState> {
  const { status, body } = await json(
    await spectraRoute.GET(await request("/api/spectra", user), undefined),
  );
  expect(status).toBe(200);
  expect(SpectraStateSchema.parse(body.data)).toEqual(body.data);
  return body.data;
}

/**
 * Makes sure the bundled timetable and its Spectra decisions are active, so each test that needs
 * them also passes when run on its own (`vitest -t`).
 */
async function ensureDecisions(): Promise<void> {
  const active = await db
    .collection("timetable_versions")
    .findOne({ status: "active", dataset_id: "cit-public-v1" });
  const decided = active
    ? await db
        .collection("booking_decisions")
        .countDocuments({ timetable_version: active._id })
    : 0;
  if (decided === 0) await resetDemo(db, { ...FAST, actor: "u_admin" });
}

async function bookingScore(user: SessionUser) {
  const { status, body } = await json(
    await dashboardRoute.GET(await request("/api/dashboard", user), undefined),
  );
  expect(status).toBe(200);
  const { booking_score, booking_score_max_if_all_approved } =
    DashboardSchema.parse(body.data).bookings;
  return { booking_score, booking_score_max_if_all_approved };
}

/** Deterministic and quick: a fixed iteration budget, the wall clock only as a backstop. */
const FAST = { solverMaxIterations: 200_000, solverBudgetMs: 20_000 };

describe.skipIf(!testDb)(
  "integration reads (MongoDB, real engine)",
  { timeout: 60_000 },
  () => {
    beforeAll(async () => {
      await seedDemoUsers(db);
      for (const [key, email] of Object.entries(DEMO_EMAILS)) {
        const doc = await findUserByEmail(db, email);
        if (!doc) throw new Error(`demo user ${email} was not seeded`);
        demo[key as keyof typeof DEMO_EMAILS] = toUser(doc);
      }
    });

    it("requires a session", async () => {
      for (const res of [
        await referenceRoute.GET(await request("/api/reference"), undefined),
        await spectraRoute.GET(await request("/api/spectra"), undefined),
      ]) {
        const { status, body } = await json(res);
        expect(status).toBe(401);
        expect(body.error.code).toBe("UNAUTHENTICATED");
      }
    });

    describe("GET /api/reference", () => {
      it("serves the bundled dataset to every role before anything is imported", async () => {
        const first = await getReference(demo.admin);
        for (const user of Object.values(demo)) {
          expect(await getReference(user)).toEqual(first);
        }
        expect(first.dataset_id).toBe("cit-public-v1");
      });

      it("handles an uploaded dataset without a fest-week label and with unknown keys", async () => {
        const edited = structuredClone(getBundledDataset()) as unknown as {
          calendar: Record<string, unknown>;
          rooms: Record<string, unknown>[];
          dataset_id: string;
        };
        delete edited.calendar.fest_week;
        edited.rooms[0].secret_note = "should never reach the API";
        edited.dataset_id = "cit-edited-v1";
        await importDataset(db, edited, "upload");
        try {
          const data = await getReference(demo.club);
          expect(data.dataset_id).toBe("cit-edited-v1");
          expect(data.calendar.fest_week).toBeNull();
          expect(Object.keys(data.rooms[0])).not.toContain("secret_note");
        } finally {
          await importDataset(db, getBundledDataset(), "bundled");
        }
      });

      it("projects the imported dataset in dataset order", async () => {
        const bundled = getBundledDataset();
        const fallback = await getReference(demo.club);
        await importDataset(db, bundled, "bundled");
        const data = await getReference(demo.faculty);
        expect(data).toEqual(fallback);

        expect({
          rooms: data.rooms.length,
          room_unavailability: data.room_unavailability.length,
          faculty: data.faculty.length,
          student_groups: data.student_groups.length,
          courses: data.courses.length,
          sessions: data.sessions.length,
          exams: data.exams.length,
          booking_requests: data.booking_requests.length,
        }).toEqual({
          rooms: 27,
          room_unavailability: 2,
          faculty: 40,
          student_groups: 14,
          courses: 62,
          sessions: 189,
          exams: 41,
          booking_requests: 25,
        });
        expect(data.sessions.map((s) => s.id)).toEqual(
          bundled.sessions.map((s) => s.id),
        );
        expect(data.booking_requests.map((r) => r.id)).toEqual(
          bundled.booking_requests.map((r) => r.id),
        );
        expect(data.calendar.fest_week).toBe("Week 7 (Spectra '27)");

        const byId = new Map(data.booking_requests.map((r) => [r.id, r]));
        expect(byId.get("BR-04")?.cancelled).toBe(true);
        expect(
          data.booking_requests.filter((r) => r.cancelled).map((r) => r.id),
        ).toEqual(["BR-04"]);
        // A club may claim at most club_event, whatever it asks for.
        expect(byId.get("BR-12")).toMatchObject({
          requested_category: "guest_lecture",
          effective_category: "club_event",
          category_capped: true,
          cancelled: false,
        });
        expect(byId.get("BR-01")).toMatchObject({
          effective_category: "institute_event",
          category_capped: false,
        });
        // Ties in priority go to the earlier submission, so the board can explain them.
        expect(byId.get("BR-16")?.submitted_at).toMatch(/^2027-02-02/);
        // No free text from the file and no internal record fields.
        expect(Object.keys(byId.get("BR-12")!)).not.toContain("raw_text");
        expect(Object.keys(data.rooms[0])).not.toContain("department");
        expect(Object.keys(data.faculty[0]).sort()).toEqual([
          "department",
          "id",
          "name",
        ]);
      });
    });

    describe("GET /api/spectra and the dashboard booking score", () => {
      it("is empty before any timetable is active", async () => {
        for (const user of Object.values(demo)) {
          expect(await getSpectra(user)).toEqual({
            timetable_version: null,
            summary: null,
            decisions: [],
            overrides: [],
          });
          expect(await bookingScore(user)).toEqual({
            booking_score: null,
            booking_score_max_if_all_approved: null,
          });
        }
      });

      it("shows approvers of decisions and Week-7 moves to admins only", async () => {
        await importDataset(db, phase3Dataset(), "upload");
        const versionId = await seedTinyWorkingState(db);

        const admin = await getSpectra(demo.admin);
        expect(admin.timetable_version).toBe(versionId);
        expect(admin.decisions.map((d) => d.request_id)).toEqual([
          "BR-01",
          "BR-02",
          "BR-03",
        ]);
        expect(admin.decisions[0]).toMatchObject({
          decided_by: "engine",
          approved_by: null,
        });
        expect(admin.overrides).toEqual([
          {
            session_id: "C1-L2",
            day: "THU",
            start_period: 5,
            room_id: "LH-1",
            displaced_by: "BR-02",
            approved_by: "u_admin",
            timetable_version: versionId,
          },
        ]);
        expect(admin.summary).toMatchObject({
          timetable_version: versionId,
          approved: 2,
          rejected: 1,
          session_overrides: 1,
        });

        for (const user of [demo.coordinator, demo.faculty, demo.club]) {
          const view = await getSpectra(user);
          expect(view.summary).toEqual(admin.summary);
          for (const decision of view.decisions) {
            expect(decision).not.toHaveProperty("decided_by");
            expect(decision).not.toHaveProperty("approved_by");
          }
          expect(view.overrides[0]).not.toHaveProperty("approved_by");
          expect(view.overrides[0]).toMatchObject({ displaced_by: "BR-02" });
        }
      });

      it("scores a soft-removed session's override like the export (left out)", async () => {
        await importDataset(db, phase3Dataset(), "upload");
        await seedTinyWorkingState(db);
        await db
          .collection("sessions")
          .updateOne({ _id: "C1-L2" as never }, { $set: { removed: true } });
        const admin = await getSpectra(demo.admin);
        const report = await validateCurrentSchedule(db);
        const { timetable_version, ...stats } = admin.summary!;
        expect(timetable_version).toBe(admin.timetable_version);
        expect(stats).toEqual(report.bookings);
        expect(stats.session_overrides).toBe(0);
      });

      it("reports the stored decisions' score after a reset", async () => {
        const report = await resetDemo(db, { ...FAST, actor: demo.admin.id });
        expect(report.timetable_version).not.toBeNull();

        const admin = await getSpectra(demo.admin);
        expect(admin.timetable_version).toBe(report.timetable_version);
        expect(admin.summary).toEqual({
          timetable_version: report.timetable_version,
          booking_score: 67,
          booking_score_max_if_all_approved: 70,
          approved: 22,
          alternatives: 1,
          rejected: 2,
          session_overrides: 0,
          priority_inversions: [],
        });
        expect(admin.decisions).toHaveLength(25);
        expect(admin.decisions.map((d) => d.request_id)).toEqual(
          getBundledDataset().booking_requests.map((r) => r.id),
        );
        expect(admin.overrides).toEqual([]);
        for (const decision of admin.decisions) {
          expect(decision).toHaveProperty("approved_by");
          expect(decision).toHaveProperty("decided_by", "engine");
        }
        expect(
          admin.decisions.find((d) => d.request_id === "BR-04"),
        ).toMatchObject({ status: "rejected", reason_code: "REJ_CANCELLED" });

        for (const user of [demo.club, demo.faculty]) {
          const view = await getSpectra(user);
          expect(view.summary).toEqual(admin.summary);
          expect(view.decisions).toHaveLength(25);
          for (const decision of view.decisions) {
            expect(Object.keys(decision)).not.toContain("approved_by");
            expect(Object.keys(decision)).not.toContain("decided_by");
          }
          // Everything else is the admin's view.
          expect(view.decisions).toEqual(
            admin.decisions.map((d) =>
              Object.fromEntries(
                Object.entries(d).filter(
                  ([key]) => key !== "decided_by" && key !== "approved_by",
                ),
              ),
            ),
          );
        }

        for (const user of Object.values(demo)) {
          expect(await bookingScore(user)).toEqual({
            booking_score: 67,
            booking_score_max_if_all_approved: 70,
          });
        }
      });

      it("scores exactly like the validator report on the export", async () => {
        await ensureDecisions();
        const admin = await getSpectra(demo.admin);
        const report = await validateCurrentSchedule(db);
        const { timetable_version, ...stats } = admin.summary!;
        expect(timetable_version).toBe(admin.timetable_version);
        expect(stats).toEqual(report.bookings);
      });

      it("shows a decision for a non-dataset (live) request to admins only", async () => {
        await ensureDecisions();
        const stored = await db
          .collection("booking_decisions")
          .findOne({ _id: "BR-13" as never });
        expect(stored).not.toBeNull();
        await db.collection("booking_decisions").insertOne({
          ...stored!,
          _id: "LIVE-1" as never,
          request_id: "LIVE-1",
        });
        try {
          const admin = await getSpectra(demo.admin);
          const club = await getSpectra(demo.club);
          expect(admin.decisions.map((d) => d.request_id)).toContain("LIVE-1");
          expect(club.decisions.map((d) => d.request_id)).not.toContain(
            "LIVE-1",
          );
          expect(club.decisions).toHaveLength(25);
          // The score covers dataset requests only, like schedule.json.
          expect(club.summary).toEqual(admin.summary);
          expect(admin.summary?.booking_score).toBe(67);
        } finally {
          await db
            .collection("booking_decisions")
            .deleteOne({ _id: "LIVE-1" as never });
        }
      });

      it("has no summary once the active version's decisions are gone", async () => {
        await ensureDecisions();
        await db.collection("booking_decisions").deleteMany({});
        const view = await getSpectra(demo.admin);
        expect(view.timetable_version).toMatch(/^TT-\d{4}$/);
        expect(view).toMatchObject({ summary: null, decisions: [] });
        expect(await bookingScore(demo.admin)).toEqual({
          booking_score: null,
          booking_score_max_if_all_approved: null,
        });
      });
    });
  },
);
