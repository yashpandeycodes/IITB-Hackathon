/**
 * The bookings API (`/api/bookings`, `/api/bookings/:id`, `…/cancel`, `…/decide`) end to end:
 * real guards (signed session cookies), a throwaway database and the real engine on the bundled
 * dataset. Covers submissions and series, validation and the compulsory-groups policy, the
 * per-user cap, bumps, department-lab and class-move approvals, self-approval, approver
 * rejections, cancellations, no leaks to unrelated users, approver labels, undo when a re-run
 * fails, list scopes, AI provenance, explanations (template and a fake LLM), RBAC, rate limits,
 * the lock, and that the export and the Spectra summary still only cover dataset requests.
 *
 * Every test starts from the same state (the demo timetable with only dataset requests): live
 * requests are removed after each test and Spectra re-run, so tests pass alone or in any order.
 */
import type { Db } from "mongodb";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { LlmClient, LlmConfig } from "@/lib/ai";
import {
  BookingDetailSchema,
  BookingViewSchema,
  CreateBookingResultSchema,
  DashboardSchema,
  ROLE_LABEL,
  SpectraStateSchema,
  type BookingView,
  type CreateBookingResult,
  type Role,
  type SessionUser,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { openTestDb } from "@/lib/db/repos/test-db";

const state = vi.hoisted(() => {
  // Read lazily by the env module; set before anything calls getServerEnv().
  process.env.AUTH_SECRET = "route-test-secret-0123456789-abcdefghijklmnop";
  process.env.JWT_SECRET = "";
  process.env.MONGODB_URI = "";
  process.env.GEMINI_API_KEY = "";
  return {
    db: undefined as Db | undefined,
    /** What `getLlmConfig` returns (null: AI off). */
    llm: null as LlmConfig,
    /** Makes the Spectra re-run after a cancel or decide throw. */
    failRun: false,
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

vi.mock("./spectra", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./spectra")>();
  return {
    ...actual,
    runSpectraUnlocked: async (
      ...args: Parameters<typeof actual.runSpectraUnlocked>
    ) => {
      if (state.failRun) throw new Error("simulated Spectra failure");
      return actual.runSpectraUnlocked(...args);
    },
  };
});

const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
const { seedDemoUsers } = await import("@/lib/auth/seed");
const { insertSessionUsers } = await import("@/lib/auth/test-db");
const { limits, resetRateLimits } = await import("@/lib/auth/rate-limit");
const { findUserByEmail, toUser } = await import("@/lib/db/repos/users");
const { acquireDatasetLock } = await import("@/lib/db/locks");
const { appendAiLog, getAiLog } = await import("@/lib/db/repos/ai-logs");
const { listBookingDecisions } =
  await import("@/lib/db/repos/booking-decisions");
const { insertBookingRequests, setApproval } =
  await import("@/lib/db/repos/booking-requests");
const { getBookingRequest } = await import("@/lib/db/repos/reference");
const { getActiveTimetableVersion } =
  await import("@/lib/db/repos/timetable-versions");
const { listAuditLog } = await import("@/lib/db/repos/audit-log");
const { importDataset } = await import("./dataset");
const { resetDemo } = await import("./reset");
const { runSpectra } = await import("./spectra");
const { parseBookingRequest } = await import("./booking-parse");
const { BOOKING_ID, OPEN_REQUEST_LIMIT } = await import("./bookings");
const { clearExplanationCache } = await import("./explanations");
const { buildScheduleProjection, exportSchedule, validateCurrentSchedule } =
  await import("./export");
const bookingsRoute = await import("@/app/api/bookings/route");
const detailRoute = await import("@/app/api/bookings/[id]/route");
const cancelRoute = await import("@/app/api/bookings/[id]/cancel/route");
const decideRoute = await import("@/app/api/bookings/[id]/decide/route");
const spectraRoute = await import("@/app/api/spectra/route");
const dashboardRoute = await import("@/app/api/dashboard/route");

const testDb = await openTestDb("bookings-routes.test");
state.db = testDb?.db;
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

beforeEach(() => {
  resetRateLimits();
  clearExplanationCache();
  state.llm = null;
  state.failRun = false;
});

// ------------------------------------------------------------------------------ helpers

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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** The seeded demo accounts; the guards re-read the user, so sessions must name real users. */
const DEMO_EMAILS = {
  admin: "admin@cit.demo",
  coordinator: "coord.cse@cit.demo",
  faculty: "faculty@cit.demo",
  club: "club@cit.demo",
} as const;
const demo = {} as Record<keyof typeof DEMO_EMAILS, SessionUser>;

/** A second coordinator (ECE) that only exists in this test database. */
const ECE_COORDINATOR: SessionUser = {
  id: "u_coord_ece_test",
  email: "coord.ece@test.local",
  name: "ECE Coordinator",
  role: "department_coordinator",
  department: "ECE",
  faculty_id: null,
  club: null,
};

let userSeq = 0;
/** A new account of `role` (stored, so the guards accept it), for tests that need a stranger. */
async function freshUser(
  role: Role,
  overrides: Partial<SessionUser> = {},
): Promise<SessionUser> {
  userSeq += 1;
  const user: SessionUser = {
    id: `u_test_${role}_${userSeq}`,
    email: `${role}.${userSeq}@test.local`,
    name: `Test ${ROLE_LABEL[role]} ${userSeq}`,
    role,
    department:
      role === "department_coordinator" || role === "faculty" ? "CSE" : null,
    faculty_id: null,
    club: role === "club" ? `Test Club ${userSeq}` : null,
    ...overrides,
  };
  await insertSessionUsers(db, [user]);
  return user;
}

/** Deterministic and quick: a fixed iteration budget, the wall clock only as a backstop. */
const FAST = { solverMaxIterations: 200_000, solverBudgetMs: 20_000 };

type Draft = Record<string, unknown>;

/** A complete form draft: an evening seminar-hall slot unless overridden. */
const draft = (overrides: Draft = {}): Draft => ({
  title: "Improv night",
  attendance: 80,
  duration_periods: 2,
  windows: [{ day: "TUE", from_period: 10, to_period: 11 }],
  room_types: ["seminar_hall"],
  needs: ["projector"],
  requested_room: null,
  mandatory_for_groups: [],
  repeat_days: [],
  assumptions: [],
  follow_up: null,
  ...overrides,
});

/** A club's CS-lab booking: the engine places it in CS-LAB-1, pending the CSE coordinator. */
const CS_LAB: Draft = {
  title: "Hackathon prep",
  attendance: 60,
  windows: [{ day: "WED", from_period: 10, to_period: 11 }],
  room_types: ["lab_cs"],
  needs: ["computers"],
};

/**
 * An institute event that only fits by moving a class (both CS labs hold sessions on Wednesday
 * morning): it needs an admin's approval.
 */
const CLASS_MOVE: Draft = {
  title: "Hackathon kickoff",
  attendance: 70,
  windows: [{ day: "WED", from_period: 2, to_period: 3 }],
  room_types: ["lab_cs"],
  needs: [],
};

async function submit(user: SessionUser | undefined, body: unknown) {
  return json(
    await bookingsRoute.POST(
      await request("/api/bookings", { user, method: "POST", body }),
      undefined,
    ),
  );
}

/** Submits and expects `201`; returns the parsed result. */
async function create(
  user: SessionUser,
  overrides: Draft = {},
): Promise<CreateBookingResult> {
  const { status, body } = await submit(user, draft(overrides));
  expect(status, JSON.stringify(body)).toBe(201);
  expect(body.ok).toBe(true);
  expect(CreateBookingResultSchema.parse(body.data)).toEqual(body.data);
  return body.data;
}

/** Submits one request and returns its view. */
async function createOne(
  user: SessionUser,
  overrides: Draft = {},
): Promise<BookingView> {
  const { bookings } = await create(user, overrides);
  expect(bookings).toHaveLength(1);
  return bookings[0];
}

async function list(user: SessionUser | undefined, query = "") {
  return json(
    await bookingsRoute.GET(
      await request(`/api/bookings${query}`, { user }),
      undefined,
    ),
  );
}

async function listIds(user: SessionUser, query: string): Promise<string[]> {
  const { status, body } = await list(user, query);
  expect(status).toBe(200);
  return (body.data as BookingView[]).map((v) => v.request.id);
}

async function detail(user: SessionUser | undefined, id: string) {
  return json(
    await detailRoute.GET(
      await request(`/api/bookings/${id}`, { user }),
      ctx(id),
    ),
  );
}

async function cancel(user: SessionUser | undefined, id: string) {
  return json(
    await cancelRoute.POST(
      await request(`/api/bookings/${id}/cancel`, { user, method: "POST" }),
      ctx(id),
    ),
  );
}

async function decide(
  user: SessionUser | undefined,
  id: string,
  body: unknown,
) {
  return json(
    await decideRoute.POST(
      await request(`/api/bookings/${id}/decide`, {
        user,
        method: "POST",
        body,
      }),
      ctx(id),
    ),
  );
}

/** The view in a `200` response, schema-checked. */
function viewOf(response: { status: number; body: { data: unknown } }) {
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return BookingViewSchema.parse(response.body.data);
}

/** The detail (view + explanation) in a `200` response, schema-checked. */
function detailOf(response: { status: number; body: { data: unknown } }) {
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return BookingDetailSchema.parse(response.body.data);
}

/** Asserts an error response's status and code; returns its error body. */
function errorOf(
  response: { status: number; body: { error?: unknown } },
  status: number,
  code: string,
) {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  const error = response.body.error as {
    code: string;
    message: string;
    details?: { fieldErrors?: unknown; [key: string]: unknown };
  };
  expect(error.code).toBe(code);
  return error;
}

/** The stored decision for `id` in the active timetable, if any. */
async function storedDecision(id: string) {
  return (await listBookingDecisions(db)).find((d) => d.request_id === id);
}

/** Back to the baseline: no live requests, Spectra re-run over the dataset's requests. */
async function clearLiveRequests(): Promise<void> {
  await db.collection("booking_requests").deleteMany({ origin: "manual" });
  await db.collection("cancellations").deleteMany({ origin: "manual" });
  if (await getActiveTimetableVersion(db)) {
    await runSpectra(db, { actor: demo.admin.id });
  }
}

/** A fake LLM whose `generateText` answers `text` (and counts the calls). */
function fakeExplainer(text: string): {
  llm: NonNullable<LlmConfig>;
  calls: () => number;
} {
  let calls = 0;
  const client: LlmClient = {
    generateJson: async () => {
      throw new Error("generateJson is not used by explanations");
    },
    generateText: async () => {
      calls += 1;
      return text;
    },
  };
  return {
    llm: { client, model: "fake-smart", timeoutMs: 2_000 },
    calls: () => calls,
  };
}

/** A user's `explain` entries in `ai_logs`, oldest first. */
const explainLogs = (userId: string) =>
  db
    .collection("ai_logs")
    .find({ feature: "explain", user_id: userId })
    .sort({ _id: 1 })
    .toArray();

const datasetIds = getBundledDataset().booking_requests.map((r) => r.id);

const BUSY = "Another change is being saved right now; try again in a moment.";

// --------------------------------------------------------------------------------- tests

describe("BOOKING_ID", () => {
  it("accepts dataset and live ids in other formats, and nothing unsafe", () => {
    for (const id of ["BR-06", "REQ-0007", "EVT_2027.01", "ext:42", "A"]) {
      expect(BOOKING_ID.test(id), id).toBe(true);
    }
    for (const id of ["", "-x", "a b", "x<script>", "a/b", "x".repeat(65)]) {
      expect(BOOKING_ID.test(id), id).toBe(false);
    }
  });
});

describe.skipIf(!testDb)(
  "bookings API (MongoDB, real engine)",
  { timeout: 120_000 },
  () => {
    beforeAll(async () => {
      await seedDemoUsers(db);
      for (const [key, email] of Object.entries(DEMO_EMAILS)) {
        const doc = await findUserByEmail(db, email);
        if (!doc) throw new Error(`demo user ${email} was not seeded`);
        demo[key as keyof typeof DEMO_EMAILS] = toUser(doc);
      }
      await insertSessionUsers(db, [ECE_COORDINATOR]);
    });

    it("answers 409 on every booking write until a dataset is imported", async () => {
      // A database where nothing was ever imported: reads fall back to the bundled file, whose
      // requests have no records, so a live request would never be decided.
      const empty = await openTestDb("bookings-routes.empty");
      if (!empty) return;
      state.db = empty.db;
      try {
        await insertSessionUsers(empty.db, [demo.club, demo.admin]);
        for (const response of [
          await submit(demo.club, draft()),
          await cancel(demo.admin, "REQ-0001"),
          await decide(demo.admin, "REQ-0001", { decision: "approve" }),
        ]) {
          const error = errorOf(response, 409, "CONFLICT");
          expect(error.message).toBe("Reset or import the dataset first.");
        }
        expect(
          await empty.db.collection("booking_requests").countDocuments(),
        ).toBe(0);
      } finally {
        state.db = db;
        await empty.cleanup();
      }
    });

    describe("without an active timetable", () => {
      beforeAll(async () => {
        await importDataset(db, getBundledDataset(), "bundled");
      });
      afterEach(clearLiveRequests);

      it("stores the request as submitted, with no decision", async () => {
        const result = await create(demo.club);
        expect(result.spectra).toBeNull();
        expect(result.bumped).toEqual([]);
        expect(result.bookings).toHaveLength(1);
        const [view] = result.bookings;
        expect(view.decision).toBeNull();
        expect(view.approval).toEqual({
          needed: false,
          approver_role: null,
          department: null,
        });
        expect(view.request).toMatchObject({
          id: expect.stringMatching(/^REQ-\d{4}$/),
          state: "submitted",
          source: "form",
          created_by: demo.club.id,
          role: "club",
          requested_category: "club_event",
          requester: "Dramatics Society",
          series_id: null,
          submitted_at: expect.stringMatching(/\+05:30$/),
        });
      });

      it("labels a self-registered club (no club name) by name and role", async () => {
        const club = await freshUser("club", { club: null, name: "Asha Rao" });
        const view = await createOne(club);
        expect(view.request.requester).toBe("Asha Rao (Club Representative)");
      });
    });

    describe("with the demo timetable active", () => {
      beforeAll(async () => {
        const report = await resetDemo(db, { ...FAST, actor: "u_admin" });
        expect(report.timetable_version).not.toBeNull();
      }, 60_000);
      afterEach(clearLiveRequests);

      it("requires a session on every route", async () => {
        const responses = [
          await list(undefined),
          await submit(undefined, draft()),
          await detail(undefined, "REQ-0001"),
          await cancel(undefined, "REQ-0001"),
          await decide(undefined, "REQ-0001", { decision: "approve" }),
        ];
        for (const { status, body } of responses) {
          expect(status).toBe(401);
          expect(body.error.code).toBe("UNAUTHENTICATED");
        }
      });

      it("answers 404 for a malformed id without echoing it", async () => {
        const weird = "x<script>";
        for (const { status, body } of [
          await detail(demo.admin, weird),
          await cancel(demo.admin, weird),
          await decide(demo.admin, weird, { decision: "approve" }),
        ]) {
          expect(status).toBe(404);
          expect(body.error.message).not.toContain(weird);
        }
        expect((await detail(demo.admin, "REQ-9999")).status).toBe(404);
      });

      it("decides a club's evening seminar-hall request at once", async () => {
        const result = await create(demo.club);
        expect(result.spectra).toMatchObject({
          timetable_version: expect.stringMatching(/^TT-/),
          priority_inversions: [],
        });
        const [view] = result.bookings;
        expect(view.request.state).toBe("decided");
        expect(view.decision).toMatchObject({
          request_id: view.request.id,
          status: "approved",
          room_id: "SH-2",
          day: "TUE",
          start_period: 10,
          end_period: 11,
          effective_category: "club_event",
          auto: true,
        });
        // Non-admins never see who decided or approved.
        expect(view.decision).not.toHaveProperty("decided_by");
        expect(view.decision).not.toHaveProperty("approved_by");
        expect(view.decision?.facts).toMatchObject({ attendance: 80 });
        expect(view.approval.needed).toBe(false);
        // Counted as submitted after every request already filed (the dataset's run to
        // 2 Feb 2027), so it never wins a same-category tie it would lose in real life.
        expect(Date.parse(view.request.submitted_at)).toBeGreaterThan(
          Date.parse("2027-02-02T10:00:00+05:30"),
        );

        const [entry] = await listAuditLog(db, { entity: "booking_requests" });
        expect(entry).toMatchObject({
          actor: demo.club.id,
          action: "booking_submit",
          entity_id: view.request.id,
        });
      });

      it("turns repeat_days into a series sharing one series_id", async () => {
        const result = await create(demo.club, {
          title: "Rehearsal",
          attendance: 30,
          windows: [
            { day: "MON", from_period: 12, to_period: 13 },
            { day: "MON", from_period: 12, to_period: 13 },
          ],
          room_types: ["classroom", "classroom"],
          needs: [],
          repeat_days: ["WED", "FRI", "MON", "WED"],
        });
        expect(result.bookings).toHaveLength(3);
        const [first] = result.bookings;
        const series = `SER-${first.request.id}`;
        expect(result.bookings.map((v) => v.request.series_id)).toEqual([
          series,
          series,
          series,
        ]);
        // Duplicate windows, room types and days are dropped.
        expect(result.bookings.map((v) => v.request.windows)).toEqual([
          [{ day: "MON", from_period: 12, to_period: 13 }],
          [{ day: "WED", from_period: 12, to_period: 13 }],
          [{ day: "FRI", from_period: 12, to_period: 13 }],
        ]);
        expect(first.request.room_types).toEqual(["classroom"]);
        for (const view of result.bookings) {
          expect(view.request.state).toBe("decided");
          expect(view.decision?.status).toBe("approved");
        }
        // The engine keeps a series in one room where it can.
        expect(
          new Set(result.bookings.map((v) => v.decision?.room_id)).size,
        ).toBe(1);
      });

      it("rejects an unknown room with a suggestion, unknown groups and a duration no window fits", async () => {
        const room = await submit(demo.club, draft({ requested_room: "SH1" }));
        expect(errorOf(room, 400, "VALIDATION_ERROR").details).toEqual({
          formErrors: [],
          fieldErrors: {
            requested_room: ['No room has the id "SH1". Did you mean SH-1?'],
          },
          suggestion: { requested_room: "SH-1" },
        });

        const group = await submit(
          demo.admin,
          draft({ mandatory_for_groups: ["CSE-3", "XYZ-9"] }),
        );
        expect(errorOf(group, 400, "VALIDATION_ERROR").details).toEqual({
          formErrors: [],
          fieldErrors: {
            mandatory_for_groups: ["Unknown student group: XYZ-9."],
          },
        });

        const long = await submit(demo.club, draft({ duration_periods: 3 }));
        expect(
          errorOf(long, 400, "VALIDATION_ERROR").details?.fieldErrors,
        ).toEqual({
          duration_periods: [
            "A 3-period booking doesn't fit in any window (the longest is 2 periods).",
          ],
        });

        // Schema errors (a claimed category) never reach the service.
        const schema = await submit(
          demo.club,
          draft({ requested_category: "institute_event" }),
        );
        expect(schema.status).toBe(400);
        expect(await listIds(demo.admin, "?scope=all")).toEqual(datasetIds);
      });

      it("enforces who may make an event compulsory for which groups", async () => {
        const groupErrors = async (user: SessionUser, groups: string[]) =>
          errorOf(
            await submit(user, draft({ mandatory_for_groups: groups })),
            400,
            "VALIDATION_ERROR",
          ).details?.fieldErrors;

        expect(await groupErrors(demo.club, ["CSE-3"])).toEqual({
          mandatory_for_groups: [
            "Clubs can't make an event compulsory for student groups.",
          ],
        });
        expect(await groupErrors(demo.club, ["XYZ-9", "CSE-3"])).toEqual({
          mandatory_for_groups: [
            "Unknown student group: XYZ-9.",
            "Clubs can't make an event compulsory for student groups.",
          ],
        });
        expect(await groupErrors(demo.faculty, ["CSE-3", "ECE-3"])).toEqual({
          mandatory_for_groups: [
            "A Faculty can only make an event compulsory for CSE groups (not ECE-3).",
          ],
        });
        expect(await groupErrors(ECE_COORDINATOR, ["CSE-2", "ECE-2"])).toEqual({
          mandatory_for_groups: [
            "A Department Coordinator can only make an event compulsory for ECE groups (not CSE-2).",
          ],
        });
        const noDepartment = await freshUser("faculty", { department: null });
        expect(await groupErrors(noDepartment, ["CSE-3"])).toEqual({
          mandatory_for_groups: [
            "A Faculty without a department can't make an event compulsory for student groups.",
          ],
        });

        // Own department's groups, and any group for an admin.
        const evening = {
          windows: [{ day: "TUE", from_period: 12, to_period: 13 }],
          room_types: ["classroom"],
          needs: [],
          attendance: 40,
        };
        const own = await createOne(demo.faculty, {
          ...evening,
          mandatory_for_groups: ["CSE-3", "CSE-2"],
        });
        expect(own.request.mandatory_for_groups).toEqual(["CSE-3", "CSE-2"]);
        const any = await createOne(demo.admin, {
          ...evening,
          mandatory_for_groups: ["ECE-3", "ME-2"],
        });
        expect(any.request.mandatory_for_groups).toEqual(["ECE-3", "ME-2"]);
      });

      it(`caps a user at ${OPEN_REQUEST_LIMIT} open requests, counting every series day`, async () => {
        const club = await freshUser("club");
        const filler = (title: string, state: "decided" | "cancelled") => ({
          submitted_at: "2027-02-02T10:00:01+05:30",
          requester: club.club!,
          role: "club",
          department: null,
          requested_category: "club_event",
          title,
          attendance: 20,
          duration_periods: 1,
          windows: [{ day: "MON" as const, from_period: 13, to_period: 13 }],
          room_types: ["classroom"],
          needs: [],
          requested_room: null,
          mandatory_for_groups: [],
          state,
          source: "form" as const,
          created_by: club.id,
        });
        await insertBookingRequests(db, [
          ...Array.from({ length: OPEN_REQUEST_LIMIT }, (_, i) =>
            filler(`Open ${i + 1}`, "decided"),
          ),
          filler("Cancelled", "cancelled"),
        ]);

        const full = errorOf(await submit(club, draft()), 409, "CONFLICT");
        expect(full.details).toEqual({ limit: OPEN_REQUEST_LIMIT, open: 20 });
        expect(full.message).toContain("at most 20 can be open at once");

        // Two cancelled: one more request fits, a three-day series doesn't.
        const open = await db
          .collection("booking_requests")
          .find({ created_by: club.id, state: "decided" })
          .limit(2)
          .toArray();
        await db
          .collection("booking_requests")
          .updateMany(
            { _id: { $in: open.map((d) => d._id) } },
            { $set: { state: "cancelled" } },
          );
        const series = errorOf(
          await submit(club, draft({ repeat_days: ["WED", "THU"] })),
          409,
          "CONFLICT",
        );
        expect(series.details).toEqual({ limit: 20, open: 18 });
        expect(series.message).toContain("this series adds 3");
        await createOne(club);
        // Other users are not affected.
        await createOne(demo.club);
      });

      it("reports the dataset booking an institute event bumps, then frees it on cancel", async () => {
        const before = await storedDecision("BR-06");
        expect(before).toMatchObject({
          status: "approved",
          room_id: "SH-1",
          day: "THU",
          start_period: 10,
          end_period: 11,
        });

        const result = await create(demo.admin, {
          title: "Spectra press meet",
          attendance: 140,
          windows: [{ day: "THU", from_period: 10, to_period: 11 }],
          room_types: ["seminar_hall"],
          needs: ["projector", "pa_system"],
          requested_room: "SH-1",
        });
        const [view] = result.bookings;
        const id = view.request.id;
        expect(view.request.requested_category).toBe("institute_event");
        expect(view.decision).toMatchObject({
          status: "approved",
          room_id: "SH-1",
          effective_category: "institute_event",
          decided_by: "engine",
          approved_by: null,
        });
        expect(view.request.state).toBe("decided");
        const bump = result.bumped.find((b) => b.request_id === "BR-06");
        expect(bump).toMatchObject({
          before: { status: "approved", room_id: "SH-1", day: "THU" },
          by: [id],
        });
        expect(bump?.after.room_id).not.toBe("SH-1");

        // The owner (admin) cancels: the slot goes back to BR-06.
        const cancelled = viewOf(await cancel(demo.admin, id));
        expect(cancelled.request.state).toBe("cancelled");
        expect(await storedDecision("BR-06")).toMatchObject({
          status: "approved",
          room_id: "SH-1",
        });
      });

      it("routes a club's CS-lab booking to the CSE coordinator, showing approvers by role", async () => {
        const view = await createOne(demo.club, CS_LAB);
        const id = view.request.id;
        expect(view.request.state).toBe("pending_approval");
        expect(view.decision).toMatchObject({
          status: "approved",
          room_id: "CS-LAB-1",
          auto: false,
        });
        expect(view.approval).toEqual({
          needed: true,
          approver_role: "department_coordinator",
          department: "CSE",
        });

        expect(await listIds(demo.coordinator, "?scope=approvals")).toEqual([
          id,
        ]);
        expect(await listIds(demo.admin, "?scope=approvals")).toEqual([id]);
        expect(await listIds(ECE_COORDINATOR, "?scope=approvals")).toEqual([]);
        expect(await listIds(demo.faculty, "?scope=approvals")).toEqual([]);
        expect(await listIds(demo.club, "?scope=approvals")).toEqual([]);

        // Only the eligible approver (and owner, admin) can see it.
        expect((await detail(demo.coordinator, id)).status).toBe(200);
        expect((await detail(ECE_COORDINATOR, id)).status).toBe(404);
        expect((await detail(demo.faculty, id)).status).toBe(404);

        // Users who can't see it get 404; the owner (who can) gets 403.
        errorOf(
          await decide(ECE_COORDINATOR, id, { decision: "approve" }),
          404,
          "NOT_FOUND",
        );
        errorOf(
          await decide(demo.faculty, id, { decision: "approve" }),
          404,
          "NOT_FOUND",
        );
        errorOf(
          await decide(demo.club, id, { decision: "approve" }),
          403,
          "FORBIDDEN",
        );

        const approved = viewOf(
          await decide(demo.coordinator, id, {
            decision: "approve",
            comment: "Lab assistant on duty",
          }),
        );
        expect(approved.request.state).toBe("decided");
        // Non-admins see the approver's role, never their user id.
        expect(approved.request.approval).toEqual({
          approved_by: "CSE Department Coordinator",
          approver_role: "department_coordinator",
          approved_at: expect.stringMatching(/\+05:30$/),
          room_id: "CS-LAB-1",
          day: "WED",
          start_period: 10,
          end_period: 11,
        });
        expect(approved.approval.needed).toBe(false);
        expect(approved.decision).toMatchObject({ status: "approved" });
        expect(
          detailOf(await detail(demo.club, id)).request.approval?.approved_by,
        ).toBe("CSE Department Coordinator");
        // Admins see ids, on the request and on the stored decision.
        const adminView = detailOf(await detail(demo.admin, id));
        expect(adminView.request.approval?.approved_by).toBe(
          demo.coordinator.id,
        );
        expect(adminView.decision?.approved_by).toBe(demo.coordinator.id);

        // Already decided: a second decision conflicts (no state in the details); the approver
        // can still read it.
        const again = errorOf(
          await decide(demo.coordinator, id, { decision: "reject" }),
          409,
          "CONFLICT",
        );
        expect(again).toEqual({
          code: "CONFLICT",
          message: "This request isn't waiting for approval.",
        });
        expect((await detail(demo.coordinator, id)).status).toBe(200);
        expect(await listIds(demo.admin, "?scope=approvals")).toEqual([]);

        const [entry] = await listAuditLog(db, { entity_id: id });
        expect(entry).toMatchObject({
          actor: demo.coordinator.id,
          action: "booking_approve",
          after: { decision: "approve", comment: "Lab assistant on duty" },
        });
      });

      it("lets only another admin approve a class move", async () => {
        const otherAdmin = await freshUser("admin");
        const view = await createOne(demo.admin, CLASS_MOVE);
        const id = view.request.id;
        expect(view.request.state).toBe("pending_approval");
        expect(view.decision).toMatchObject({
          status: "approved",
          room_id: "CS-LAB-1",
          day: "WED",
          start_period: 2,
          end_period: 3,
          requires_admin_approval: true,
          auto: false,
          approved_by: null,
        });
        expect(
          (view.decision?.facts as { displaced: unknown[] }).displaced,
        ).toHaveLength(1);
        expect(view.approval).toEqual({
          needed: true,
          approver_role: "admin",
          department: null,
        });

        // A coordinator never approves a class move, and can't even see it (even in their lab).
        expect(await listIds(demo.coordinator, "?scope=approvals")).toEqual([]);
        expect((await detail(demo.coordinator, id)).status).toBe(404);
        errorOf(
          await decide(demo.coordinator, id, { decision: "approve" }),
          404,
          "NOT_FOUND",
        );
        // The requester can't approve their own.
        errorOf(
          await decide(demo.admin, id, { decision: "approve" }),
          403,
          "SELF_APPROVAL",
        );

        expect(await listIds(otherAdmin, "?scope=approvals")).toEqual([id]);
        const approved = viewOf(
          await decide(otherAdmin, id, { decision: "approve" }),
        );
        expect(approved.request.state).toBe("decided");
        expect(approved.request.approval).toMatchObject({
          approved_by: otherAdmin.id,
          approver_role: "admin",
          room_id: "CS-LAB-1",
          day: "WED",
          start_period: 2,
          end_period: 3,
        });
        expect(approved.decision).toMatchObject({
          room_id: "CS-LAB-1",
          requires_admin_approval: true,
          approved_by: otherAdmin.id,
        });
        expect(approved.approval.needed).toBe(false);
        expect(await listIds(otherAdmin, "?scope=approvals")).toEqual([]);
      });

      it("asks again when a later run moves an approved booking", async () => {
        const view = await createOne(demo.club, {
          title: "Algo study group",
          attendance: 40,
          windows: [{ day: "MON", from_period: 12, to_period: 13 }],
          room_types: ["lab_cs"],
          needs: ["computers"],
        });
        expect(view.request.state).toBe("pending_approval");
        // An approval for another slot is stale: the run drops it and keeps asking.
        await setApproval(db, view.request.id, {
          approved_by: demo.coordinator.id,
          approved_at: "2027-02-08T10:00:00+05:30",
          room_id: "CS-LAB-2",
          day: "MON",
          start_period: 12,
          end_period: 13,
        });
        await runSpectra(db, { actor: demo.admin.id });
        const record = await getBookingRequest(db, view.request.id);
        expect(record?.state).toBe("pending_approval");
        expect(record).not.toHaveProperty("approval");
      });

      it("never lets a coordinator approve their own lab booking", async () => {
        const view = await createOne(demo.coordinator, {
          title: "CSE alumni meet",
          attendance: 50,
          windows: [{ day: "WED", from_period: 12, to_period: 13 }],
          room_types: ["lab_cs"],
          needs: [],
        });
        const id = view.request.id;
        expect(view.request).toMatchObject({
          role: "department_coordinator",
          requested_category: "department_event",
          department: "CSE",
          requester: "CSE Coordinator (Department Coordinator)",
          state: "pending_approval",
        });
        expect(await listIds(demo.coordinator, "?scope=approvals")).toEqual([]);

        errorOf(
          await decide(demo.coordinator, id, { decision: "approve" }),
          403,
          "SELF_APPROVAL",
        );

        const approved = viewOf(
          await decide(demo.admin, id, { decision: "approve" }),
        );
        expect(approved.request.state).toBe("decided");
        expect(approved.request.approval).toMatchObject({
          approved_by: demo.admin.id,
          approver_role: "admin",
        });
        expect(approved.decision?.approved_by).toBe(demo.admin.id);
        // The coordinator (owner) sees who approved by role only.
        expect(
          detailOf(await detail(demo.coordinator, id)).request.approval
            ?.approved_by,
        ).toBe("Admin");
      });

      it("frees the slot when an approver rejects, with a REJ_BY_APPROVER decision", async () => {
        const lab = {
          attendance: 60,
          windows: [{ day: "MON", from_period: 10, to_period: 11 }],
          room_types: ["lab_cs"],
          needs: ["computers"],
        };
        const first = await createOne(demo.club, {
          ...lab,
          title: "Robotics demo",
        });
        expect(first.decision?.room_id).toBe("CS-LAB-1");
        // A later request of the same rank can't have CS-LAB-1 while the first one is pending.
        const second = await createOne(demo.club, {
          ...lab,
          title: "Coding dojo",
          requested_room: "CS-LAB-1",
        });
        expect(second.decision?.room_id).toBe("CS-LAB-2");

        const rejected = viewOf(
          await decide(demo.admin, first.request.id, {
            decision: "reject",
            comment: "Lab maintenance that week",
          }),
        );
        expect(rejected.request.state).toBe("decided");
        expect(rejected.request.rejection).toMatchObject({
          rejected_by: demo.admin.id,
          comment: "Lab maintenance that week",
        });
        expect(rejected.decision).toMatchObject({
          status: "rejected",
          reason_code: "REJ_BY_APPROVER",
          reason: "Rejected by the Admin: Lab maintenance that week.",
          decided_by: demo.admin.id,
          auto: false,
        });

        // The owner sees it with the rejecter's role (no ids) and a template explanation.
        const owner = detailOf(await detail(demo.club, first.request.id));
        expect(owner.decision).not.toHaveProperty("decided_by");
        expect(owner.request.rejection?.rejected_by).toBe("Admin");
        expect(owner.explanation).toEqual({
          source: "template",
          text: "Rejected by the Admin: Lab maintenance that week.",
          facts: {
            rejected_by: "the Admin",
            rejected_at: expect.any(String),
            comment: "Lab maintenance that week",
          },
        });

        // The freed lab goes to the next request.
        const moved = detailOf(await detail(demo.club, second.request.id));
        expect(moved.decision?.room_id).toBe("CS-LAB-1");
        expect(moved.request.state).toBe("pending_approval");
      });

      it("lets the owner or an admin cancel, and nobody else", async () => {
        const view = await createOne(demo.club, {
          title: "Poetry slam",
          attendance: 40,
          windows: [{ day: "FRI", from_period: 12, to_period: 13 }],
          room_types: ["classroom"],
          needs: [],
        });
        const id = view.request.id;

        // A stranger can't tell that the request exists.
        errorOf(await cancel(demo.faculty, id), 404, "NOT_FOUND");

        const cancelled = viewOf(await cancel(demo.club, id));
        expect(cancelled.request.state).toBe("cancelled");
        // A cancelled live request leaves the engine: no decision is kept for it.
        expect(cancelled.decision).toBeNull();
        expect(await storedDecision(id)).toBeUndefined();
        expect(
          await db.collection("cancellations").findOne({ _id: id } as never),
        ).toMatchObject({ request_id: id, by: "Dramatics Society" });
        // Twice is a no-op returning the same view.
        expect(viewOf(await cancel(demo.club, id))).toEqual(cancelled);
        // Nothing to approve on a cancelled request.
        errorOf(
          await decide(demo.admin, id, { decision: "approve" }),
          409,
          "CONFLICT",
        );

        // An approver who may see a request (it waits for them) still can't cancel it.
        const lab = await createOne(demo.club, CS_LAB);
        errorOf(
          await cancel(demo.coordinator, lab.request.id),
          403,
          "FORBIDDEN",
        );
        // An admin may cancel anyone's.
        expect(
          viewOf(await cancel(demo.admin, lab.request.id)).request.state,
        ).toBe("cancelled");

        // Dataset requests are the imported file's: not cancellable here (and not visible to
        // non-admins).
        errorOf(await cancel(demo.admin, "BR-06"), 409, "CONFLICT");
        errorOf(await cancel(demo.club, "BR-06"), 404, "NOT_FOUND");
      });

      it("drops the approval and the decision when an approved booking is cancelled", async () => {
        const view = await createOne(demo.club, CS_LAB);
        const id = view.request.id;
        viewOf(await decide(demo.coordinator, id, { decision: "approve" }));
        expect((await getBookingRequest(db, id))?.approval).toBeDefined();

        const cancelled = viewOf(await cancel(demo.club, id));
        expect(cancelled.request.state).toBe("cancelled");
        expect(cancelled.request).not.toHaveProperty("approval");
        expect(cancelled.decision).toBeNull();
        expect(cancelled.approval.needed).toBe(false);
        const record = await getBookingRequest(db, id);
        expect(record?.state).toBe("cancelled");
        expect(record).not.toHaveProperty("approval");
        expect(await storedDecision(id)).toBeUndefined();

        // The lab is free again for the next request.
        const next = await createOne(demo.club, { ...CS_LAB, title: "Next" });
        expect(next.decision).toMatchObject({
          room_id: "CS-LAB-1",
          day: "WED",
          start_period: 10,
        });
        const [entry] = await listAuditLog(db, { entity_id: id });
        expect(entry).toMatchObject({
          action: "booking_cancel",
          before: { state: "decided" },
          after: { state: "cancelled" },
        });
      });

      it("answers 409 on a decision that no longer needs approving", async () => {
        const view = await createOne(demo.club, CS_LAB);
        const id = view.request.id;
        // The stored decision is gone (e.g. a stale run): nothing to approve.
        await db.collection("booking_decisions").deleteMany({ request_id: id });
        const stale = errorOf(
          await decide(demo.admin, id, { decision: "approve" }),
          409,
          "CONFLICT",
        );
        expect(stale.message).toBe(
          "This request has no approval to give right now; re-run Spectra first.",
        );
        // The coordinator has nothing to act on, so the request isn't theirs to see.
        errorOf(
          await decide(demo.coordinator, id, { decision: "approve" }),
          404,
          "NOT_FOUND",
        );

        // A coordinator who may see it (their own) gets no advice about Spectra runs.
        const own = await createOne(demo.coordinator, {
          ...CS_LAB,
          windows: [{ day: "THU", from_period: 10, to_period: 11 }],
        });
        await db
          .collection("booking_decisions")
          .deleteMany({ request_id: own.request.id });
        const mine = errorOf(
          await decide(demo.coordinator, own.request.id, {
            decision: "approve",
          }),
          409,
          "CONFLICT",
        );
        expect(mine).toEqual({
          code: "CONFLICT",
          message: "This request has no approval to give right now.",
        });
        expect((await getBookingRequest(db, id))?.state).toBe(
          "pending_approval",
        );
      });

      it("answers 404 to unrelated users for decide and cancel, exactly as for an unknown id", async () => {
        const stranger = await freshUser("club");
        const unknown = await cancel(stranger, "REQ-9999");
        errorOf(unknown, 404, "NOT_FOUND");

        const evening = await createOne(demo.club);
        const lab = await createOne(demo.club, CS_LAB);
        for (const id of [evening.request.id, lab.request.id]) {
          expect(await cancel(stranger, id)).toEqual(unknown);
          expect(await cancel(demo.faculty, id)).toEqual(unknown);
          expect(await cancel(ECE_COORDINATOR, id)).toEqual(unknown);
          for (const user of [stranger, demo.faculty, ECE_COORDINATOR]) {
            expect(await decide(user, id, { decision: "reject" })).toEqual(
              unknown,
            );
          }
        }
        // The CSE coordinator only sees the lab booking waiting for them.
        expect(
          await decide(demo.coordinator, evening.request.id, {
            decision: "approve",
          }),
        ).toEqual(unknown);
        expect((await getBookingRequest(db, lab.request.id))?.state).toBe(
          "pending_approval",
        );
      });

      it("undoes a cancel or a decision when the Spectra re-run fails", async () => {
        const view = await createOne(demo.club);
        const id = view.request.id;
        state.failRun = true;
        errorOf(await cancel(demo.club, id), 500, "INTERNAL_ERROR");
        const record = await getBookingRequest(db, id);
        expect(record?.state).toBe("decided");
        expect(
          await db.collection("cancellations").findOne({ _id: id } as never),
        ).toBeNull();
        const [cancelEntry] = await listAuditLog(db, { entity_id: id });
        expect(cancelEntry).toMatchObject({
          action: "booking_cancel",
          before: { state: "decided" },
          after: { outcome: "undone", error: "INTERNAL_ERROR" },
        });

        state.failRun = false;
        const lab = await createOne(demo.club, CS_LAB);
        const labId = lab.request.id;
        state.failRun = true;
        errorOf(
          await decide(demo.coordinator, labId, { decision: "approve" }),
          500,
          "INTERNAL_ERROR",
        );
        let labRecord = await getBookingRequest(db, labId);
        expect(labRecord?.state).toBe("pending_approval");
        expect(labRecord).not.toHaveProperty("approval");
        errorOf(
          await decide(demo.admin, labId, { decision: "reject" }),
          500,
          "INTERNAL_ERROR",
        );
        labRecord = await getBookingRequest(db, labId);
        expect(labRecord).not.toHaveProperty("rejection");
        const [decideEntry] = await listAuditLog(db, { entity_id: labId });
        expect(decideEntry).toMatchObject({
          action: "booking_reject",
          after: { outcome: "undone", error: "INTERNAL_ERROR" },
        });

        // Once runs work again, the same decision goes through.
        state.failRun = false;
        expect(
          viewOf(await decide(demo.coordinator, labId, { decision: "approve" }))
            .request.state,
        ).toBe("decided");
      });

      it("limits list scopes by role", async () => {
        const kept = await createOne(demo.club);
        const gone = await createOne(demo.club, {
          title: "Poetry slam",
          attendance: 40,
          windows: [{ day: "FRI", from_period: 12, to_period: 13 }],
          room_types: ["classroom"],
          needs: [],
        });
        viewOf(await cancel(demo.club, gone.request.id));

        errorOf(await list(demo.club, "?scope=all"), 403, "FORBIDDEN");
        expect(await listIds(demo.admin, "?scope=all")).toEqual([
          ...datasetIds,
          kept.request.id,
          gone.request.id,
        ]);
        expect(await listIds(demo.club, "")).toEqual([
          kept.request.id,
          gone.request.id,
        ]);
        expect(await listIds(demo.club, "?state=cancelled")).toEqual([
          gone.request.id,
        ]);
        expect(await listIds(demo.faculty, "")).toEqual([]);

        expect((await list(demo.club, "?scope=everything")).status).toBe(400);
        // Dataset requests are only shown to admins here.
        expect((await detail(demo.club, "BR-07")).status).toBe(404);
        expect((await detail(demo.admin, "BR-07")).status).toBe(200);
      });

      it("takes AI provenance from the server-side parse log, never from the body", async () => {
        const text =
          "Improv night on Tuesday 6 to 8 pm for 80 people in a seminar hall with a projector";
        const parsed = await parseBookingRequest(db, demo.club, text, {
          llm: null,
          cache: null,
        });
        const log = await getAiLog(db, parsed.log_id);
        const forged = {
          source: "nl",
          ai_log_id: parsed.log_id,
          assumptions: ["Forged assumption"],
          follow_up: "Forged question?",
        };
        const view = await createOne(demo.club, forged);
        expect(view.request.ai_meta).toEqual({
          source: "rules",
          model: "rules",
          prompt_id: "parse_booking.v1",
          assumptions: log!.assumptions,
          follow_up: log!.follow_up,
          log_id: parsed.log_id,
        });
        expect(view.request.raw_text).toBe(text);

        // An LLM parse: the model and the processed draft's chips come from its log.
        const llmLog = await appendAiLog(db, {
          feature: "parse_booking",
          source: "llm",
          model: "fake-flash",
          prompt_id: "parse_booking.v1",
          input: "Quiz prelims Thursday 6 to 8 pm",
          output_raw: "{}",
          parsed_ok: true,
          repaired: false,
          fallback_reason: null,
          assumptions: ["Assumed the seminar hall"],
          follow_up: "How many people?",
          engine_verdict: null,
          latency_ms: 12,
          user_id: demo.club.id,
        });
        const viaLlm = await createOne(demo.club, {
          ...forged,
          ai_log_id: llmLog.id,
          windows: [{ day: "MON", from_period: 10, to_period: 11 }],
        });
        expect(viaLlm.request.ai_meta).toEqual({
          source: "llm",
          model: "fake-flash",
          prompt_id: "parse_booking.v1",
          assumptions: ["Assumed the seminar hall"],
          follow_up: "How many people?",
          log_id: llmLog.id,
        });

        // Someone else's parse log gives no provenance at all.
        const other = await createOne(demo.faculty, {
          ...forged,
          windows: [{ day: "WED", from_period: 10, to_period: 11 }],
        });
        expect(other.request).not.toHaveProperty("ai_meta");
        expect(other.request).not.toHaveProperty("raw_text");
      });

      it("explains a decision from the template while AI is off", async () => {
        const logsBefore = (await explainLogs(demo.faculty.id)).length;
        const view = await createOne(demo.faculty, {
          title: "Guest talk on compilers",
          attendance: 60,
          windows: [{ day: "THU", from_period: 12, to_period: 13 }],
          room_types: ["classroom", "lecture_hall"],
          needs: [],
        });
        expect(view.request.requested_category).toBe("guest_lecture");
        const parsed = detailOf(await detail(demo.faculty, view.request.id));
        expect(parsed.explanation).toEqual({
          text: parsed.decision?.reason,
          source: "template",
          facts: parsed.decision?.facts,
        });
        expect(parsed.explanation?.text).toMatch(/is free/);
        expect(await explainLogs(demo.faculty.id)).toHaveLength(logsBefore);
      });

      it("phrases explanations with the LLM: cached, logged, quota-bound, never for approver rejections", async () => {
        const sentence =
          "The room you asked for was free, so your booking is confirmed exactly as requested.";
        const fake = fakeExplainer(sentence);
        state.llm = fake.llm;
        const talk = await createOne(demo.faculty, {
          title: "Guest talk on compilers",
          attendance: 60,
          windows: [{ day: "THU", from_period: 12, to_period: 13 }],
          room_types: ["classroom", "lecture_hall"],
          needs: [],
        });

        const before = {
          faculty: (await explainLogs(demo.faculty.id)).length,
          club: (await explainLogs(demo.club.id)).length,
        };
        const first = detailOf(await detail(demo.faculty, talk.request.id));
        expect(first.explanation).toEqual({
          text: sentence,
          source: "llm",
          facts: first.decision?.facts,
        });
        // A second view of the unchanged decision is served from the cache.
        const second = detailOf(await detail(demo.faculty, talk.request.id));
        expect(second.explanation).toEqual(first.explanation);
        expect(fake.calls()).toBe(1);

        const logs = (await explainLogs(demo.faculty.id)).slice(before.faculty);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          feature: "explain",
          source: "llm",
          model: "fake-smart",
          prompt_id: "explain_booking.v1",
          input: JSON.stringify({
            request_id: talk.request.id,
            status: "approved",
            reason_code: first.decision?.reason_code,
          }),
          output_raw: sentence,
          parsed_ok: true,
          repaired: false,
          cached: false,
          fallback_reason: null,
          engine_verdict: "approved",
          user_id: demo.faculty.id,
        });
        // Kept for 30 days (TTL on expire_at).
        const expireAt = (logs[0] as { expire_at?: Date }).expire_at;
        expect(expireAt).toBeInstanceOf(Date);
        expect(expireAt!.getTime() - Date.now()).toBeGreaterThan(
          29 * 24 * 3_600_000,
        );

        // Over the user's quota: the template, no model call, nothing logged.
        while (limits.aiExplainUser.peek(demo.faculty.id).allowed) {
          limits.aiExplainUser.hit(demo.faculty.id);
        }
        const other = await createOne(demo.faculty, {
          title: "Reading group",
          attendance: 30,
          windows: [{ day: "MON", from_period: 12, to_period: 13 }],
          room_types: ["classroom"],
          needs: [],
        });
        const limited = detailOf(await detail(demo.faculty, other.request.id));
        expect(limited.explanation).toEqual({
          text: limited.decision?.reason,
          source: "template",
          facts: limited.decision?.facts,
        });
        expect(fake.calls()).toBe(1);
        expect(await explainLogs(demo.faculty.id)).toHaveLength(
          before.faculty + 1,
        );

        // An approver's rejection is explained in the approver's words: no model call.
        const lab = await createOne(demo.club, CS_LAB);
        viewOf(
          await decide(demo.admin, lab.request.id, {
            decision: "reject",
            comment: "Lab closed",
          }),
        );
        const rejected = detailOf(await detail(demo.club, lab.request.id));
        expect(rejected.explanation).toMatchObject({
          source: "template",
          text: "Rejected by the Admin: Lab closed.",
        });
        expect(fake.calls()).toBe(1);
        expect(await explainLogs(demo.club.id)).toHaveLength(before.club);
      });

      it("keeps the export, validation and Spectra summary on dataset requests only", async () => {
        const live = await createOne(demo.club);
        const report = await validateCurrentSchedule(db);
        expect(report.hard_violation_count).toBe(0);
        expect(report.bookings?.priority_inversions).toEqual([]);
        const schedule = await exportSchedule(db);
        expect(schedule.fest_week.bookings.map((b) => b.request_id)).toEqual(
          datasetIds,
        );
        expect(
          schedule.fest_week.session_overrides.every((o) =>
            datasetIds.includes(o.displaced_by),
          ),
        ).toBe(true);
        expect(await buildScheduleProjection(db)).toStrictEqual(schedule);

        // Live decisions are stored alongside, for every request.
        const stored = await listBookingDecisions(db);
        expect(stored.map((d) => d.request_id)).toContain(live.request.id);

        // GET /api/spectra: non-admins see dataset decisions only; the summary is the validator's.
        const club = await json(
          await spectraRoute.GET(
            await request("/api/spectra", { user: demo.club }),
            undefined,
          ),
        );
        const clubState = SpectraStateSchema.parse(club.body.data);
        expect(clubState.decisions.map((d) => d.request_id)).toEqual(
          datasetIds,
        );
        expect(clubState.summary?.booking_score).toBe(
          report.bookings?.booking_score,
        );
        const admin = await json(
          await spectraRoute.GET(
            await request("/api/spectra", { user: demo.admin }),
            undefined,
          ),
        );
        const adminState = SpectraStateSchema.parse(admin.body.data);
        expect(adminState.decisions.map((d) => d.request_id)).toEqual([
          ...datasetIds,
          live.request.id,
        ]);
        expect(adminState.summary).toEqual(clubState.summary);

        const dash = await json(
          await dashboardRoute.GET(
            await request("/api/dashboard", { user: demo.admin }),
            undefined,
          ),
        );
        expect(
          DashboardSchema.parse(dash.body.data).bookings.booking_score,
        ).toBe(report.bookings?.booking_score);

        // A full re-run reports the same (dataset-only) totals.
        const rerun = await runSpectra(db, { actor: demo.admin.id });
        expect(rerun.booking_score).toBe(report.bookings?.booking_score);
        expect(rerun.decisions.length).toBe(stored.length);
      });

      it("answers 429 once the booking-write quota is used up", async () => {
        const view = await createOne(demo.club);
        const id = view.request.id;
        while (limits.bookingWriteUser.peek(demo.club.id).allowed) {
          limits.bookingWriteUser.hit(demo.club.id);
        }
        for (const response of [
          await submit(demo.club, draft()),
          await cancel(demo.club, id),
          await decide(demo.club, id, { decision: "approve" }),
        ]) {
          errorOf(response, 429, "RATE_LIMITED");
        }
        expect((await getBookingRequest(db, id))?.state).toBe("decided");
        // Reads are not limited.
        expect((await list(demo.club)).status).toBe(200);
      });

      it("waits briefly for a busy dataset lock instead of failing at once", async () => {
        const release = await acquireDatasetLock(db);
        setTimeout(() => void release(), 300);
        const started = Date.now();
        const view = await createOne(demo.club, {
          title: "Board games",
          attendance: 20,
          windows: [{ day: "TUE", from_period: 12, to_period: 13 }],
          room_types: ["classroom"],
          needs: [],
        });
        expect(Date.now() - started).toBeGreaterThanOrEqual(250);
        expect(view.request.state).toBe("decided");
        // The booking released the lock when it finished.
        const again = await acquireDatasetLock(db, { waitMs: 50 });
        await again();
      });

      it("answers 409 with a booking-specific message when the lock stays busy", async () => {
        const release = await acquireDatasetLock(db);
        try {
          const started = Date.now();
          const busy = errorOf(
            await submit(demo.club, draft()),
            409,
            "CONFLICT",
          );
          expect(busy.message).toBe(BUSY);
          expect(Date.now() - started).toBeGreaterThanOrEqual(2_900);
        } finally {
          await release();
        }
        expect(await listIds(demo.club, "")).toEqual([]);
      });
    });
  },
);
