/**
 * The change-request API (`/api/changes`, `/api/changes/preview`, `/api/changes/:id`,
 * `…/approve`, `…/reject`, `/api/manual/place`) and the Phase-5 export files
 * (`/api/export?file=schedule|schedule_after|disruption`, `/api/validate?file=…`) end to end:
 * real guards (signed session cookies), a throwaway database.
 *
 * - "routes" runs on the tiny dataset with the fake rescheduler and the Phase-3 Spectra / exam
 *   fakes (status codes, roles, ids, body caps, rate limits, export headers).
 * - "sample disruption" runs the real engine on the bundled dataset: reset, file
 *   `data/sample_disruption.json`, approve, then export `schedule_after.json` (0 hard violations,
 *   with stability), `schedule.json` (still the baseline) and `disruption.json` (the sample's
 *   changes), and checks the pair with the official `validator.py` when Python is available.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
import sampleDisruption from "../../../data/sample_disruption.json";
import {
  ChangeApplyResultSchema,
  ChangePreviewSchema,
  ChangeRequestSchema,
  DisruptionSchema,
  PathIssueSchema,
  ScheduleAfterExportSchema,
  ScheduleExportSchema,
  ValidatorReportSchema,
  type ChangeRequest,
  type SessionUser,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { openTestDb } from "@/lib/db/repos/test-db";

const state = vi.hoisted(() => {
  process.env.AUTH_SECRET = "route-test-secret-0123456789-abcdefghijklmnop";
  process.env.JWT_SECRET = "";
  process.env.MONGODB_URI = "";
  process.env.GEMINI_API_KEY = "";
  return {
    db: undefined as Db | undefined,
    /** true: the fake rescheduler and Spectra / exam fakes; false: the real engine. */
    fake: true,
  };
});

vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: async () => {
    if (!state.db) throw new Error("test database not open");
    return state.db;
  },
}));

vi.mock("@/lib/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engine")>();
  const fakes = await import("./change-test-fixtures");
  const phase3 = await import("./test-fixtures");
  const either =
    <A extends unknown[], R>(fake: (...a: A) => R, real: (...a: A) => R) =>
    (...args: A): R =>
      state.fake ? fake(...args) : real(...args);
  return {
    ...actual,
    reschedule: either(fakes.fakeReschedule, actual.reschedule),
    validateChanges: either(fakes.fakeValidateChanges, actual.validateChanges),
    describeChanges: either(fakes.fakeDescribeChanges, actual.describeChanges),
    checkPlacement: either(fakes.fakeCheckPlacement, actual.checkPlacement),
    decideBookings: either(phase3.fakeDecideBookings, actual.decideBookings),
    scheduleExams: either(phase3.fakeScheduleExams, actual.scheduleExams),
  };
});

const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
const { insertSessionUsers } = await import("@/lib/auth/test-db");
const { limits, resetRateLimits } = await import("@/lib/auth/rate-limit");
const { COLLECTION_NAMES } = await import("@/lib/db/collections");
const { activateTimetableVersion, insertTimetableVersion } =
  await import("@/lib/db/repos/timetable-versions");
const { applyDisruption } = await import("@/lib/engine/disruption");
const { validateSchedule } = await import("@/lib/engine/validate");
const { importDataset } = await import("./dataset");
const { activateTimetable } = await import("./timetable");
const { generateExams } = await import("./exams");
const { resetDemo } = await import("./reset");
const fixtures = await import("./test-fixtures");
const changesRoute = await import("@/app/api/changes/route");
const previewRoute = await import("@/app/api/changes/preview/route");
const detailRoute = await import("@/app/api/changes/[id]/route");
const approveRoute = await import("@/app/api/changes/[id]/approve/route");
const rejectRoute = await import("@/app/api/changes/[id]/reject/route");
const manualRoute = await import("@/app/api/manual/place/route");
const exportRoute = await import("@/app/api/export/route");
const validateRoute = await import("@/app/api/validate/route");
const activateRoute =
  await import("@/app/api/timetable/versions/[id]/activate/route");

const testDb = await openTestDb("changes-routes.test");
state.db = testDb?.db;
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

beforeEach(() => {
  resetRateLimits();
});

// ------------------------------------------------------------------------------ helpers

async function request(
  url: string,
  options: { user?: SessionUser; method?: string; body?: unknown } = {},
): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (options.user) {
    headers.cookie = `${SESSION_COOKIE}=${await signSession(options.user)}`;
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${url}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
  });
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

type Result = { status: number; body: { data?: unknown; error?: unknown } };

function errorOf(response: Result, status: number, code: string) {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  const error = response.body.error as { code: string; message: string };
  expect(error.code).toBe(code);
  return error as { code: string; message: string; details?: unknown };
}

function dataOf<T>(
  response: Result,
  status: number,
  schema: { parse: (v: unknown) => T },
): T {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  return schema.parse(response.body.data);
}

const propose = async (user: SessionUser | undefined, body: unknown) =>
  json(
    await changesRoute.POST(
      await request("/api/changes", { user, method: "POST", body }),
      undefined,
    ),
  );
const preview = async (user: SessionUser | undefined, body: unknown) =>
  json(
    await previewRoute.POST(
      await request("/api/changes/preview", { user, method: "POST", body }),
      undefined,
    ),
  );
const list = async (user: SessionUser | undefined, query = "") =>
  json(
    await changesRoute.GET(
      await request(`/api/changes${query}`, { user }),
      undefined,
    ),
  );
const detail = async (user: SessionUser | undefined, id: string) =>
  json(
    await detailRoute.GET(
      await request(`/api/changes/${id}`, { user }),
      ctx(id),
    ),
  );
const approve = async (
  user: SessionUser | undefined,
  id: string,
  body: unknown = {},
) =>
  json(
    await approveRoute.POST(
      await request(`/api/changes/${id}/approve`, {
        user,
        method: "POST",
        body,
      }),
      ctx(id),
    ),
  );
const reject = async (
  user: SessionUser | undefined,
  id: string,
  body: unknown = {},
) =>
  json(
    await rejectRoute.POST(
      await request(`/api/changes/${id}/reject`, {
        user,
        method: "POST",
        body,
      }),
      ctx(id),
    ),
  );
const place = async (user: SessionUser | undefined, body: unknown) =>
  json(
    await manualRoute.POST(
      await request("/api/manual/place", { user, method: "POST", body }),
      undefined,
    ),
  );
const download = async (user: SessionUser | undefined, query: string) =>
  exportRoute.GET(await request(`/api/export${query}`, { user }), undefined);
const validate = async (user: SessionUser | undefined, query = "") =>
  json(
    await validateRoute.GET(
      await request(`/api/validate${query}`, { user }),
      undefined,
    ),
  );

const { USERS } = fixtures;
const ADMIN: SessionUser = USERS.admin;
const COORD: SessionUser = USERS.coordinator;
const FACULTY: SessionUser = USERS.faculty;
const CLUB: SessionUser = USERS.club;

const F1_MONDAY = {
  type: "faculty_unavailable",
  faculty_id: "F1",
  days: ["MON"],
  periods: [1],
};

async function freshTiny(): Promise<string> {
  for (const name of COLLECTION_NAMES) {
    await db.collection(name).deleteMany({});
  }
  await insertSessionUsers(db, [ADMIN, COORD, FACULTY, CLUB]);
  await importDataset(db, fixtures.phase3Dataset(), "upload");
  const version = await insertTimetableVersion(db, {
    dataset_id: "tiny-v1",
    status: "draft",
    source: "generate",
    parent_version: null,
    change_request_id: null,
    assignments: fixtures.TINY_ASSIGNMENTS,
    hard_violation_count: 0,
    soft_penalty: fixtures.ZERO_SOFT,
    solver_meta: null,
    created_by: ADMIN.id,
  });
  await activateTimetable(db, version.id, ADMIN.id);
  await generateExams(db, { actor: ADMIN.id });
  return version.id;
}

// --------------------------------------------------------------------------------- tests

describe.skipIf(!testDb)(
  "change routes (MongoDB, fake rescheduler)",
  { timeout: 60_000 },
  () => {
    beforeAll(() => {
      state.fake = true;
    });
    beforeEach(async () => {
      await freshTiny();
    });

    it("requires a session everywhere and keeps clubs out", async () => {
      const id = "CR-0001";
      for (const res of [
        await list(undefined),
        await detail(undefined, id),
        await propose(undefined, { kind: "disruption", changes: [F1_MONDAY] }),
        await preview(undefined, { kind: "disruption", changes: [F1_MONDAY] }),
        await approve(undefined, id),
        await reject(undefined, id),
        await place(undefined, {}),
        await validate(undefined),
      ]) {
        errorOf(res, 401, "UNAUTHENTICATED");
      }
      errorOf(await list(CLUB), 403, "FORBIDDEN");
      errorOf(await detail(CLUB, id), 403, "FORBIDDEN");
      errorOf(
        await propose(CLUB, { kind: "unavailability", changes: [F1_MONDAY] }),
        403,
        "FORBIDDEN",
      );
      errorOf(
        await place(CLUB, {
          session_id: "C1-L1",
          day: "WED",
          start_period: 4,
          room_id: "CR-1",
        }),
        403,
        "FORBIDDEN",
      );
      errorOf(
        await place(FACULTY, {
          session_id: "C1-L1",
          day: "WED",
          start_period: 4,
          room_id: "CR-1",
        }),
        403,
        "FORBIDDEN",
      );
      const exportRes = await download(COORD, "?file=schedule");
      expect(exportRes.status).toBe(403);
      errorOf(await validate(FACULTY), 403, "FORBIDDEN");
    });

    it("checks the role before reading the body: a club gets 403 even for a bad body", async () => {
      for (const body of ["not json", { kind: "nope" }, {}]) {
        errorOf(await propose(CLUB, body), 403, "FORBIDDEN");
        errorOf(await preview(CLUB, body), 403, "FORBIDDEN");
        errorOf(await place(CLUB, body), 403, "FORBIDDEN");
        errorOf(await place(FACULTY, body), 403, "FORBIDDEN");
      }
      // The same bad body from an allowed role is a 400.
      errorOf(await propose(FACULTY, "not json"), 400, "VALIDATION_ERROR");
      errorOf(
        await preview(FACULTY, { kind: "nope" }),
        400,
        "VALIDATION_ERROR",
      );
      errorOf(await place(COORD, {}), 400, "VALIDATION_ERROR");
    });

    it("answers 404 for malformed or unknown ids without echoing them", async () => {
      for (const id of ["CR-1", "x<script>", "TT-0001", "CR-0001x"]) {
        const res = await detail(ADMIN, id);
        const error = errorOf(res, 404, "NOT_FOUND");
        expect(error.message).not.toContain(id);
        errorOf(await approve(ADMIN, id), 404, "NOT_FOUND");
        errorOf(await reject(ADMIN, id), 404, "NOT_FOUND");
      }
      errorOf(await detail(ADMIN, "CR-0042"), 404, "NOT_FOUND");
    });

    it("validates bodies and caps their size", async () => {
      const empty = errorOf(
        await propose(ADMIN, { kind: "disruption", changes: [] }),
        400,
        "VALIDATION_ERROR",
      );
      expect(empty.details).toMatchObject({
        fieldErrors: { changes: ["Give at least one change or placement."] },
      });
      errorOf(await propose(ADMIN, "not json"), 400, "VALIDATION_ERROR");
      const unknown = errorOf(
        await propose(ADMIN, {
          kind: "disruption",
          changes: [{ ...F1_MONDAY, faculty_id: "F99" }],
        }),
        400,
        "VALIDATION_ERROR",
      );
      expect(unknown.details).toEqual([
        { path: "changes[0].faculty_id", message: "Unknown faculty F99." },
      ]);
      // A size limit inside `changes` / `placements`: the same PathIssue shape, path at the field.
      const tooLong = {
        kind: "disruption",
        changes: [{ ...F1_MONDAY, faculty_id: "F".repeat(65) }],
        placements: [
          {
            session_id: "C1-L1",
            day: "WED",
            start_period: 4,
            room_id: "CR-1",
            note: "n".repeat(501),
          },
        ],
      };
      for (const res of [
        await propose(ADMIN, tooLong),
        await preview(ADMIN, tooLong),
      ]) {
        const bounds = errorOf(res, 400, "VALIDATION_ERROR");
        expect(bounds.details).toEqual([
          {
            path: "changes[0].faculty_id",
            message: "An id can be at most 64 characters.",
          },
          {
            path: "placements[0].note",
            message: "Text can be at most 500 characters.",
          },
        ]);
        for (const issue of bounds.details as unknown[])
          PathIssueSchema.parse(issue);
      }
      // A body that doesn't fit the kind: PathIssues too.
      const shape = errorOf(
        await propose(ADMIN, {
          kind: "unavailability",
          changes: [
            {
              type: "room_unavailable",
              room_id: "CR-1",
              days: ["MON"],
              periods: [1],
            },
          ],
        }),
        400,
        "VALIDATION_ERROR",
      );
      expect(shape.details).toEqual([
        {
          path: "changes[0].type",
          message:
            "A unavailability request can't carry a room_unavailable change.",
        },
      ]);
      errorOf(
        await approve(ADMIN, "CR-0001", { comment: "x".repeat(5_000) }),
        400,
        "VALIDATION_ERROR",
      );
      errorOf(
        await place(ADMIN, {
          session_id: "C1-L1",
          day: "WED",
          start_period: 4,
          room_id: "CR-1",
          description: "x".repeat(5_000),
        }),
        400,
        "VALIDATION_ERROR",
      );
      errorOf(await list(ADMIN, "?scope=everyone"), 400, "VALIDATION_ERROR");
    });

    it("proposes (201), previews (200), lists, shows, approves and rejects", async () => {
      const shown = dataOf(
        await preview(FACULTY, {
          kind: "unavailability",
          changes: [F1_MONDAY],
        }),
        200,
        ChangePreviewSchema,
      );
      expect(shown.feasible).toBe(true);

      const created = await propose(FACULTY, {
        kind: "unavailability",
        changes: [F1_MONDAY],
        description: "  Clinic  ",
      });
      const cr = dataOf(created, 201, ChangeRequestSchema);
      expect(cr).toMatchObject({
        status: "pending",
        requested_by: FACULTY.id,
        requested_by_role: "faculty",
        description: "Clinic",
      });

      const mine = dataOf(
        await list(FACULTY, "?scope=mine"),
        200,
        ChangeRequestSchema.array(),
      );
      expect(mine.map((c) => c.id)).toEqual([cr.id]);
      expect(
        dataOf(await detail(COORD, cr.id), 200, ChangeRequestSchema).id,
      ).toBe(cr.id);

      // Faculty and coordinators never approve; the admin does.
      errorOf(await approve(FACULTY, cr.id), 403, "FORBIDDEN");
      errorOf(await approve(COORD, cr.id), 403, "FORBIDDEN");
      const applied = dataOf(
        await approve(ADMIN, cr.id, { comment: "OK" }),
        200,
        ChangeApplyResultSchema,
      );
      expect(applied.change).toMatchObject({
        status: "applied",
        comment: "OK",
      });
      errorOf(await approve(ADMIN, cr.id), 409, "CONFLICT");
      errorOf(await reject(ADMIN, cr.id), 409, "CONFLICT");

      const again = dataOf(
        await propose(COORD, {
          kind: "unavailability",
          changes: [{ ...F1_MONDAY, days: ["TUE"], periods: [9] }],
        }),
        201,
        ChangeRequestSchema,
      );
      const withdrawn = dataOf(
        await reject(COORD, again.id),
        200,
        ChangeRequestSchema,
      );
      expect(withdrawn.comment).toBe("Withdrawn by the requester");
    });

    it("blocks self-approval by a requester whose role changed", async () => {
      const cr = dataOf(
        await propose(COORD, { kind: "unavailability", changes: [F1_MONDAY] }),
        201,
        ChangeRequestSchema,
      );
      await db
        .collection("users")
        .updateOne({ _id: COORD.id as never }, { $set: { role: "admin" } });
      errorOf(
        await approve({ ...COORD, role: "admin" }, cr.id),
        403,
        "SELF_APPROVAL",
      );
    });

    it("rejects pending proposals when another timetable is activated, and answers 409 STALE_VERSION for a stale base", async () => {
      const draft = () =>
        insertTimetableVersion(db, {
          dataset_id: "tiny-v1",
          status: "draft",
          source: "generate",
          parent_version: null,
          change_request_id: null,
          assignments: fixtures.TINY_ASSIGNMENTS,
          hard_violation_count: 0,
          soft_penalty: fixtures.ZERO_SOFT,
          solver_meta: null,
          created_by: ADMIN.id,
        });
      const cr = dataOf(
        await propose(ADMIN, { kind: "disruption", changes: [F1_MONDAY] }),
        201,
        ChangeRequestSchema,
      );
      const other = await draft();
      const activated = await activateRoute.POST(
        await request(`/api/timetable/versions/${other.id}/activate`, {
          user: ADMIN,
          method: "POST",
        }),
        ctx(other.id),
      );
      expect(activated.status).toBe(200);
      expect(
        dataOf(await detail(ADMIN, cr.id), 200, ChangeRequestSchema),
      ).toMatchObject({
        status: "rejected",
        decided_by: "system",
        comment: `The timetable changed (${other.id} is active now); file it again.`,
      });
      errorOf(await approve(ADMIN, cr.id), 409, "CONFLICT");

      // A base that changed without the sweep (written behind the service's back) is still caught.
      const late = dataOf(
        await propose(ADMIN, { kind: "disruption", changes: [F1_MONDAY] }),
        201,
        ChangeRequestSchema,
      );
      await activateTimetableVersion(db, (await draft()).id);
      errorOf(await approve(ADMIN, late.id), 409, "STALE_VERSION");
      expect(
        dataOf(await detail(ADMIN, late.id), 200, ChangeRequestSchema).status,
      ).toBe("rejected");
    });

    it("places manually: 409 with the violations for a busy slot, 201 for a free one", async () => {
      const busy = errorOf(
        await place(COORD, {
          session_id: "C1-L1",
          day: "TUE",
          start_period: 2,
          room_id: "CR-1",
        }),
        409,
        "HARD_CONSTRAINT",
      );
      expect(Array.isArray(busy.details)).toBe(true);
      const cr = dataOf(
        await place(COORD, {
          session_id: "C1-L1",
          day: "WED",
          start_period: 4,
          room_id: "CR-1",
        }),
        201,
        ChangeRequestSchema,
      );
      expect(cr).toMatchObject({ kind: "manual_edit", status: "pending" });

      // Its draft can only be applied by approving the request.
      const refused = errorOf(
        await json(
          await activateRoute.POST(
            await request(
              `/api/timetable/versions/${cr.proposed_version}/activate`,
              { user: ADMIN, method: "POST" },
            ),
            ctx(cr.proposed_version as string),
          ),
        ),
        409,
        "CONFLICT",
      );
      expect(refused.message).toBe(
        `Timetable ${cr.proposed_version} was proposed by ${cr.id}. Approve ${cr.id} to apply this version.`,
      );
    });

    it("serves each export file with its name, and 409s before any change", async () => {
      const before = await download(ADMIN, "?file=schedule");
      expect(before.status).toBe(200);
      expect(before.headers.get("content-disposition")).toBe(
        'attachment; filename="schedule.json"',
      );
      const baseline = ScheduleExportSchema.parse(await before.json());
      for (const file of ["schedule_after", "disruption"]) {
        const res = await download(ADMIN, `?file=${file}`);
        expect(res.status).toBe(409);
        expect(
          ((await res.json()) as { error: { code: string } }).error.code,
        ).toBe("CONFLICT");
      }
      errorOf(await validate(ADMIN, "?file=schedule_after"), 409, "CONFLICT");
      errorOf(
        await validate(ADMIN, "?file=disruption"),
        400,
        "VALIDATION_ERROR",
      );
      const bogus = await download(ADMIN, "?file=exams");
      expect(bogus.status).toBe(400);

      const cr = dataOf(
        await propose(ADMIN, { kind: "disruption", changes: [F1_MONDAY] }),
        201,
        ChangeRequestSchema,
      );
      dataOf(await approve(ADMIN, cr.id), 200, ChangeApplyResultSchema);

      const schedule = await download(ADMIN, "?file=schedule");
      expect(ScheduleExportSchema.parse(await schedule.json())).toEqual(
        baseline,
      );
      const after = await download(ADMIN, "?file=schedule_after");
      expect(after.status).toBe(200);
      expect(after.headers.get("content-disposition")).toBe(
        'attachment; filename="schedule_after.json"',
      );
      expect(after.headers.get("cache-control")).toBe("no-store");
      const afterBody = ScheduleAfterExportSchema.parse(await after.json());
      expect(afterBody.sessions).not.toEqual(baseline.sessions);
      const changeFile = await download(ADMIN, "?file=disruption");
      expect(changeFile.headers.get("content-disposition")).toBe(
        'attachment; filename="disruption.json"',
      );
      expect(DisruptionSchema.parse(await changeFile.json()).changes).toEqual(
        cr.changes,
      );
      const report = dataOf(
        await validate(ADMIN, "?file=schedule_after"),
        200,
        ValidatorReportSchema,
      );
      expect(report.hard_violation_count).toBe(0);
      expect(report.stability?.sessions_moved).toBe(cr.moved_count);
    });

    it("rate-limits change runs per user", async () => {
      let last: Result | undefined;
      for (let i = 0; i < 31; i++) last = await reject(FACULTY, "CR-0999");
      errorOf(last as Result, 429, "RATE_LIMITED");
    });

    it("refuses a non-admin approval before counting it against the quota", async () => {
      for (let i = 0; i < 31; i++) {
        errorOf(await approve(FACULTY, "CR-0001"), 403, "FORBIDDEN");
      }
      dataOf(
        await propose(FACULTY, {
          kind: "unavailability",
          changes: [F1_MONDAY],
        }),
        201,
        ChangeRequestSchema,
      );
    });

    it("refuses a club's rejection before counting it against the quota", async () => {
      for (let i = 0; i < 31; i++) {
        errorOf(await reject(CLUB, "CR-0001"), 403, "FORBIDDEN");
        errorOf(await reject(CLUB, "x<script>"), 403, "FORBIDDEN");
      }
      expect(limits.changeRunUser.peek(CLUB.id).remaining).toBe(30);
    });
  },
);

/** Deterministic and quick: a fixed iteration budget, the wall clock only as a backstop. */
const FAST = { solverMaxIterations: 200_000, solverBudgetMs: 20_000 };

/** Runs `validator.py` (if Python is available) on the pair, as the judges will. */
function officialValidator(
  schedule: string,
  after: string,
): { hard: number; output: string } | null {
  const python = process.env.PYTHON ?? "python3";
  if (spawnSync(python, ["--version"]).status !== 0) return null;
  const dir = mkdtempSync(path.join(tmpdir(), "cit-changes-"));
  try {
    const schedulePath = path.join(dir, "schedule.json");
    const afterPath = path.join(dir, "schedule_after.json");
    const reportPath = path.join(dir, "report.json");
    writeFileSync(schedulePath, schedule);
    writeFileSync(afterPath, after);
    const result = spawnSync(
      python,
      [
        "-I",
        path.resolve("CrunchWeek_StarterPack/validator.py"),
        "--data",
        path.resolve("data/cit_public.json"),
        "--schedule",
        afterPath,
        "--disruption",
        path.resolve("data/sample_disruption.json"),
        "--baseline",
        schedulePath,
        "--json",
        reportPath,
        "--quiet",
      ],
      { encoding: "utf8" },
    );
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      hard_violation_count: number;
    };
    return { hard: report.hard_violation_count, output: result.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!testDb)(
  "sample disruption (MongoDB, real engine, bundled dataset)",
  { timeout: 180_000 },
  () => {
    let admin: SessionUser;

    beforeAll(async () => {
      state.fake = false;
      for (const name of COLLECTION_NAMES) {
        await db.collection(name).deleteMany({});
      }
      await resetDemo(db, { ...FAST, actor: "u_admin" });
      const doc = await db
        .collection("users")
        .findOne({ email: "admin@cit.demo" });
      admin = {
        id: String(doc?._id),
        email: "admin@cit.demo",
        name: String(doc?.name),
        role: "admin",
        department: null,
        faculty_id: null,
        club: null,
      };
    });
    afterAll(() => {
      state.fake = true;
    });

    it("applies data/sample_disruption.json and exports a valid schedule_after.json", async () => {
      const before = await download(admin, "?file=schedule");
      expect(before.status).toBe(200);
      const scheduleText = await before.text();
      const baseline = ScheduleExportSchema.parse(JSON.parse(scheduleText));

      const file = DisruptionSchema.parse(sampleDisruption);
      // The starter-pack file exactly as shipped: no `kind`, its own `id`.
      const proposed = await propose(admin, sampleDisruption);
      const cr: ChangeRequest = dataOf(proposed, 201, ChangeRequestSchema);
      expect(cr.status, JSON.stringify(cr.conflicts)).toBe("pending");
      // Nothing applied yet: the counts above already are the validator's.
      expect(cr.baseline_stability).toBeNull();
      expect(cr.warnings).not.toContainEqual(
        expect.stringContaining("was written for dataset"),
      );
      expect(
        cr.diff.some((d) => d.session_id === "CS202-T2" && d.move === "added"),
      ).toBe(true);
      expect(cr.hard_violation_count).toBe(0);

      const applied = dataOf(
        await approve(admin, cr.id, { comment: "Sample disruption" }),
        200,
        ChangeApplyResultSchema,
      );
      expect(applied.version_id).toBe(cr.proposed_version);

      const afterRes = await download(admin, "?file=schedule_after");
      expect(afterRes.status).toBe(200);
      const afterText = await afterRes.text();
      const after = ScheduleAfterExportSchema.parse(JSON.parse(afterText));
      const changed = applyDisruption(getBundledDataset(), file);
      const port = validateSchedule(changed, after, baseline);
      expect(
        port.hard_violation_count,
        JSON.stringify(port.hard_violations),
      ).toBe(0);
      expect(port.stability).toMatchObject({
        sessions_moved: cr.moved_count,
        time_changed: cr.time_changed,
        room_only_changed: cr.room_only_changed,
      });

      const report = dataOf(
        await validate(admin, "?file=schedule_after"),
        200,
        ValidatorReportSchema,
      );
      expect(report.hard_violation_count).toBe(0);
      expect(report.stability).toEqual(port.stability);

      // schedule.json is still the timetable the change started from.
      const still = await download(admin, "?file=schedule");
      expect(await still.text()).toBe(scheduleText);
      // disruption.json is the sample's changes.
      const changeFile = await download(admin, "?file=disruption");
      expect(DisruptionSchema.parse(await changeFile.json()).changes).toEqual(
        file.changes,
      );

      const official = officialValidator(scheduleText, afterText);
      if (official) {
        expect(official.hard, official.output).toBe(0);
      }
    });

    it("counts a second change's moves against schedule.json, as the validator will", async () => {
      const baseline = ScheduleExportSchema.parse(
        await (await download(admin, "?file=schedule")).json(),
      );
      // F06 teaches CS202-L2 at FRI P4 in the baseline: that session has to move.
      const second = [
        {
          type: "faculty_unavailable" as const,
          faculty_id: "F06",
          days: ["FRI"],
          periods: [4],
          reason: "Department meeting",
        },
      ];
      const cr: ChangeRequest = dataOf(
        await propose(admin, { kind: "disruption", changes: second }),
        201,
        ChangeRequestSchema,
      );
      expect(cr.status, JSON.stringify(cr.conflicts)).toBe("pending");
      expect(cr.baseline_stability).not.toBeNull();
      dataOf(await approve(admin, cr.id, {}), 200, ChangeApplyResultSchema);

      const after = ScheduleAfterExportSchema.parse(
        await (await download(admin, "?file=schedule_after")).json(),
      );
      const changes = [
        ...DisruptionSchema.parse(sampleDisruption).changes,
        ...second,
      ];
      const changed = applyDisruption(getBundledDataset(), { changes });
      const port = validateSchedule(changed, after, baseline);
      expect(port.hard_violation_count).toBe(0);
      expect(port.stability).toMatchObject(cr.baseline_stability ?? {});
      // The applied-changes file reproduces the stored data for the validator.
      const changeFile = await download(admin, "?file=disruption");
      expect(DisruptionSchema.parse(await changeFile.json()).changes).toEqual(
        changes,
      );
    });
  },
);
