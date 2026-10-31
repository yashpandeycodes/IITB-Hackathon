/**
 * Phase-3 services (generate, activate, Spectra, exams, export, reset pipeline) against a
 * throwaway database, with the engine's search functions replaced by small fakes on the tiny
 * dataset (`test-fixtures.ts`). The checkers stay real, so validation and the export gate are
 * exercised for real. The same flows against the real engine live in `pipeline.test.ts`.
 */
import type { Db } from "mongodb";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/lib/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine")>()),
  solveSteps: vi.fn(),
  scheduleExams: vi.fn(),
  decideBookings: vi.fn(),
}));

import {
  ActivateTimetableResultSchema,
  ExamScheduleSchema,
  GenerateTimetableResultSchema,
  ScheduleExportSchema,
  SpectraRunResultSchema,
  type SolverProgress,
} from "@/lib/contracts";
import * as engine from "@/lib/engine";
import { COLLECTION_NAMES } from "@/lib/db/collections";
import { acquireDatasetLock } from "@/lib/db/locks";
import { listAuditLog } from "@/lib/db/repos/audit-log";
import {
  listBookingDecisions,
  replaceBookingDecisions,
  upsertBookingDecision,
} from "@/lib/db/repos/booking-decisions";
import { getExamSchedule } from "@/lib/db/repos/exam-schedules";
import { listSessionOverrides } from "@/lib/db/repos/session-overrides";
import { openTestDb } from "@/lib/db/repos/test-db";
import {
  getActiveTimetableVersion,
  getTimetableVersion,
  insertTimetableVersion,
} from "@/lib/db/repos/timetable-versions";
import { getServerEnv } from "@/lib/env";
import { importDataset } from "./dataset";
import { generateExams, getActiveExams } from "./exams";
import {
  buildScheduleProjection,
  exportSchedule,
  validateCurrentSchedule,
} from "./export";
import { resetDemo } from "./reset";
import { updateSettings } from "./settings";
import { runSpectra } from "./spectra";
import {
  TINY_ASSIGNMENTS,
  TINY_DECISIONS,
  ZERO_SOFT,
  fakeDecideBookings,
  fakeScheduleExams,
  fakeSolveSteps,
  phase3Dataset,
} from "./test-fixtures";
import {
  activateTimetable,
  generateTimetable,
  listTimetableVersionSummaries,
} from "./timetable";

const solveSteps = vi.mocked(engine.solveSteps);
const decideBookings = vi.mocked(engine.decideBookings);
const scheduleExams = vi.mocked(engine.scheduleExams);

const testDb = await openTestDb("engine-services.test");
const db = testDb?.db as Db;
const ADMIN = "u_admin";

afterAll(async () => {
  await testDb?.cleanup();
});

beforeEach(() => {
  vi.restoreAllMocks();
  solveSteps.mockReset().mockImplementation(fakeSolveSteps());
  decideBookings.mockReset().mockImplementation(fakeDecideBookings);
  scheduleExams.mockReset().mockImplementation(fakeScheduleExams);
});

/** An empty database with the Phase-3 tiny dataset loaded (or `dataset`). */
async function fresh(dataset: unknown = phase3Dataset()): Promise<void> {
  for (const name of COLLECTION_NAMES) {
    await db.collection(name).deleteMany({});
  }
  await importDataset(db, dataset, "upload");
}

const count = (name: string) => db.collection(name).countDocuments();

const draft = (overrides: Record<string, unknown> = {}) => ({
  dataset_id: "tiny-v1",
  status: "draft" as const,
  source: "manual" as const,
  parent_version: null,
  change_request_id: null,
  assignments: TINY_ASSIGNMENTS,
  hard_violation_count: 0,
  soft_penalty: ZERO_SOFT,
  solver_meta: null,
  created_by: ADMIN,
  ...overrides,
});

const silenceConsole = () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
};

describe.skipIf(!testDb)("generateTimetable (mocked solver)", () => {
  beforeAll(() => fresh());

  it("stores a draft version with the solver's metadata", async () => {
    const progress: SolverProgress[] = [];
    const result = await generateTimetable(db, {
      actor: ADMIN,
      seed: 7,
      onProgress: (p) => progress.push(p),
    });
    expect(GenerateTimetableResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      activated: false,
      spectra: null,
      version: {
        dataset_id: "tiny-v1",
        status: "draft",
        source: "generate",
        parent_version: null,
        change_request_id: null,
        assignments: TINY_ASSIGNMENTS,
        hard_violation_count: 0,
        created_by: ADMIN,
        solver_meta: {
          seed: 7,
          ms: 13,
          iterations: 1234,
          algorithm: "fake-solver",
        },
      },
    });
    const { total, ...rules } = result.version.soft_penalty;
    expect(Object.values(rules).reduce((a, b) => a + b, 0)).toBe(total);
    expect(progress.map((p) => p.phase)).toEqual(["construct", "anneal"]);
    expect(await getActiveTimetableVersion(db)).toBeNull();

    const [entry] = await listAuditLog(db, { entity: "timetable_versions" });
    expect(entry).toMatchObject({
      actor: ADMIN,
      action: "generate",
      entity_id: result.version.id,
      after: {
        seed: 7,
        soft_total: total,
        fest_cost: 3,
        iterations: 1234,
        ms: 13,
        stopped_by: "converged",
      },
    });
    expect(await count("locks")).toBe(0);
    const [summary] = await listTimetableVersionSummaries(db);
    expect(summary).toMatchObject({
      id: result.version.id,
      assignment_count: 3,
    });
    expect(summary).not.toHaveProperty("assignments");
  });

  it("forwards about one progress snapshot per 100 ms of solver time", async () => {
    const finish = fakeSolveSteps();
    const snapshot = (
      phase: SolverProgress["phase"],
      iteration: number,
      ms: number,
    ): SolverProgress => ({
      phase,
      iteration,
      hard: 0,
      soft: 1,
      fest: 0,
      best: 1,
      temperature: phase === "anneal" ? 1 : null,
      ms,
    });
    solveSteps.mockImplementationOnce(function* (instance, options) {
      yield snapshot("construct", 10, 0);
      for (let i = 1; i <= 50; i += 1)
        yield snapshot("anneal", i * 100, i * 10);
      yield snapshot("verify", 5100, 505);
      const rest = finish(instance, options);
      let step = rest.next();
      while (!step.done) step = rest.next();
      return step.value;
    });
    const progress: SolverProgress[] = [];
    await generateTimetable(db, {
      actor: ADMIN,
      onProgress: (p) => progress.push(p),
    });
    expect(progress.map((p) => [p.phase, p.ms])).toEqual([
      ["construct", 0],
      ["anneal", 10],
      ["anneal", 110],
      ["anneal", 210],
      ["anneal", 310],
      ["anneal", 410],
      ["verify", 505],
    ]);
  });

  it("takes the seed from the settings and the budget from the environment", async () => {
    await updateSettings(db, { solver_seed: 99 }, ADMIN);
    await generateTimetable(db, { actor: ADMIN });
    expect(solveSteps.mock.lastCall?.[1]).toEqual({
      seed: 99,
      timeBudgetMs: getServerEnv().SOLVER_TIME_BUDGET_MS,
    });
    await generateTimetable(db, {
      actor: ADMIN,
      seed: 3,
      budgetMs: 500,
      maxIterations: 10,
    });
    expect(solveSteps.mock.lastCall?.[1]).toEqual({
      seed: 3,
      timeBudgetMs: 500,
      maxIterations: 10,
    });
  });

  it("saves nothing when a session can't be placed", async () => {
    solveSteps.mockImplementation(fakeSolveSteps(TINY_ASSIGNMENTS.slice(0, 2)));
    const before = await count("timetable_versions");
    const err = await generateTimetable(db, {
      actor: ADMIN,
      activate: true,
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "INFEASIBLE",
      status: 422,
      details: {
        unplaced: ["C1-P1"],
        violations: [expect.objectContaining({ rule: "H1" })],
        issues: [],
      },
    });
    expect(await count("timetable_versions")).toBe(before);
    expect(await getActiveTimetableVersion(db)).toBeNull();
    expect(await count("locks")).toBe(0);
  });

  it("activates on request and re-runs Spectra for the new version", async () => {
    const first = await generateTimetable(db, { actor: ADMIN, activate: true });
    expect(first.activated).toBe(true);
    expect(first.version.status).toBe("active");
    expect(first.spectra).toEqual({
      timetable_version: first.version.id,
      approved: 2,
      alternatives: 0,
      rejected: 1,
      session_overrides: 1,
      booking_score: expect.any(Number),
      booking_score_max_if_all_approved: expect.any(Number),
      priority_inversions: [],
    });
    expect(decideBookings.mock.lastCall?.[1]).toEqual(
      first.version.assignments,
    );
    const decisions = await listBookingDecisions(db);
    expect(decisions.map((d) => d.timetable_version)).toEqual([
      first.version.id,
      first.version.id,
      first.version.id,
    ]);

    const second = await generateTimetable(db, {
      actor: ADMIN,
      activate: true,
    });
    expect(second.version.parent_version).toBe(first.version.id);
    expect((await getTimetableVersion(db, first.version.id))?.status).toBe(
      "superseded",
    );
    expect((await getActiveTimetableVersion(db))?.id).toBe(second.version.id);
    for (const d of await listBookingDecisions(db)) {
      expect(d.timetable_version).toBe(second.version.id);
    }
  });

  it("answers CONFLICT while another run holds the dataset lock", async () => {
    const release = await acquireDatasetLock(db);
    try {
      await expect(
        generateTimetable(db, { actor: ADMIN }),
      ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
      await expect(acquireDatasetLock(db)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    } finally {
      await release();
      await release(); // idempotent
    }
    expect(await count("locks")).toBe(0);
  });
});

describe.skipIf(!testDb)("activateTimetable (mocked engine)", () => {
  beforeAll(() => fresh());

  it("is NOT_FOUND for an unknown version", async () => {
    await expect(activateTimetable(db, "TT-9999", ADMIN)).rejects.toMatchObject(
      { code: "NOT_FOUND", status: 404 },
    );
  });

  it("refuses a version built for another dataset", async () => {
    const other = await insertTimetableVersion(
      db,
      draft({ dataset_id: "other-v1" }),
    );
    await expect(activateTimetable(db, other.id, ADMIN)).rejects.toMatchObject({
      code: "STALE_VERSION",
      status: 409,
    });
    expect(await getActiveTimetableVersion(db)).toBeNull();
  });

  it("re-checks the hard rules against the current data", async () => {
    const broken = await insertTimetableVersion(
      db,
      draft({ assignments: TINY_ASSIGNMENTS.slice(1) }),
    );
    const err = await activateTimetable(db, broken.id, ADMIN).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: "HARD_CONSTRAINT", status: 409 });
    expect((err as { details: unknown[] }).details).toContainEqual(
      expect.objectContaining({
        rule: "H1",
        detail: "Session C1-L1 is not scheduled",
      }),
    );
    expect((await getTimetableVersion(db, broken.id))?.status).toBe("draft");
    expect(decideBookings).not.toHaveBeenCalled();
  });

  it("activates a valid version and re-runs Spectra for it", async () => {
    const { version } = await generateTimetable(db, { actor: ADMIN });
    const result = await activateTimetable(db, version.id, ADMIN);
    expect(ActivateTimetableResultSchema.parse(result)).toEqual(result);
    expect(result.version).toMatchObject({ id: version.id, status: "active" });
    expect(result.spectra).toMatchObject({
      timetable_version: version.id,
      approved: 2,
      rejected: 1,
      session_overrides: 1,
    });
    expect((await listSessionOverrides(db))[0].timetable_version).toBe(
      version.id,
    );
    const [entry] = await listAuditLog(db, { entity: "timetable_versions" });
    expect(entry).toMatchObject({
      action: "activate",
      entity_id: version.id,
      before: { active_version: null },
      after: { active_version: version.id, spectra: result.spectra },
    });

    // Activating an older draft supersedes the current one.
    const older = await insertTimetableVersion(
      db,
      draft({ assignments: [...TINY_ASSIGNMENTS].reverse() }),
    );
    await activateTimetable(db, older.id, ADMIN);
    expect((await getTimetableVersion(db, version.id))?.status).toBe(
      "superseded",
    );
    for (const d of await listBookingDecisions(db)) {
      expect(d.timetable_version).toBe(older.id);
    }
  });

  it("keeps the previous version active when the booking engine fails", async () => {
    silenceConsole();
    const active = await getActiveTimetableVersion(db);
    const { version } = await generateTimetable(db, { actor: ADMIN });
    decideBookings.mockImplementation((instance, base) => ({
      ...fakeDecideBookings(instance, base),
      violations: [{ rule: "H13", where: "fest_week", detail: "broken" }],
    }));
    await expect(
      activateTimetable(db, version.id, ADMIN),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect((await getActiveTimetableVersion(db))?.id).toBe(active?.id);
    expect((await getTimetableVersion(db, version.id))?.status).toBe("draft");
  });
});

describe.skipIf(!testDb)("runSpectra (mocked engine)", () => {
  beforeAll(() => fresh());

  it("is NOT_FOUND without an active timetable", async () => {
    const err = await runSpectra(db, { actor: ADMIN }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect((err as Error).message).toMatch(/generate one first/);
  });

  it("stores every decision with its engine metadata and no facts", async () => {
    const { version } = await generateTimetable(db, {
      actor: ADMIN,
      activate: true,
    });
    const result = await runSpectra(db, { actor: "u_admin2" });
    expect(SpectraRunResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      timetable_version: version.id,
      approved: 2,
      alternatives: 0,
      rejected: 1,
      session_overrides: 1,
      priority_inversions: [],
    });
    // Plain engine decisions have no approver; a decision that moves sessions is approved by
    // the admin whose run applied the moves.
    const meta = {
      auto: true,
      decided_by: "engine",
      approved_by: null,
      timetable_version: version.id,
      decided_at: expect.stringMatching(/\+05:30$/),
    };
    expect(result.decisions).toStrictEqual([
      {
        request_id: "BR-01",
        status: "approved",
        day: "THU",
        start_period: 10,
        end_period: 12,
        room_id: "AUD",
        reason: "",
        reason_code: "APPROVED_AS_REQUESTED",
        effective_category: "club_event",
        category_capped: false,
        requires_admin_approval: false,
        ...meta,
      },
      {
        request_id: "BR-02",
        status: "approved",
        day: "THU",
        start_period: 3,
        end_period: 3,
        room_id: "LH-1",
        reason: "C1-L2 moves to THU P5 for Week 7.",
        reason_code: "APPROVED_WITH_DISPLACEMENT",
        effective_category: "institute_event",
        category_capped: false,
        requires_admin_approval: true,
        ...meta,
        approved_by: "u_admin2",
      },
      {
        request_id: "BR-03",
        status: "rejected",
        reason: "The request was cancelled.",
        reason_code: "REJ_CANCELLED",
        effective_category: "club_event",
        category_capped: false,
        requires_admin_approval: false,
        ...meta,
      },
    ]);
    expect(result.overrides).toStrictEqual([
      {
        session_id: "C1-L2",
        day: "THU",
        start_period: 5,
        room_id: "LH-1",
        displaced_by: "BR-02",
        approved_by: "u_admin2",
        timetable_version: version.id,
      },
    ]);
    expect(await listBookingDecisions(db)).toEqual(result.decisions);
    expect(await listSessionOverrides(db)).toEqual(result.overrides);
    const [entry] = await listAuditLog(db, { entity: "booking_decisions" });
    const { decisions, overrides, ...summary } = result;
    void decisions;
    void overrides;
    expect(entry).toMatchObject({
      actor: "u_admin2",
      action: "spectra_run",
      entity_id: version.id,
      after: summary,
    });
  });

  it.each([
    [
      "hard violations",
      { violations: [{ rule: "B2", where: "fest_week", detail: "bad" }] },
    ],
    ["priority inversions", { inversions: ["BR-03"] }],
  ] as const)(
    "stores nothing when the engine's self-check reports %s",
    async (_label, fault) => {
      silenceConsole();
      const before = await listBookingDecisions(db);
      decideBookings.mockImplementation((instance, base) => {
        const result = fakeDecideBookings(instance, base);
        return {
          ...result,
          violations:
            "violations" in fault ? [...fault.violations] : result.violations,
          stats: {
            ...result.stats,
            priority_inversions:
              "inversions" in fault ? [...fault.inversions] : [],
          },
        };
      });
      await expect(runSpectra(db, { actor: ADMIN })).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        status: 500,
      });
      expect(await listBookingDecisions(db)).toEqual(before);
      expect(console.error).toHaveBeenCalled();
    },
  );
});

describe.skipIf(!testDb)("exam schedules (mocked scheduler)", () => {
  beforeAll(() => fresh());

  it("has no active schedule before the first run", async () => {
    expect(await getActiveExams(db)).toBeNull();
  });

  it("stores and activates each run, superseding the previous one", async () => {
    const first = await generateExams(db, { actor: ADMIN });
    expect(ExamScheduleSchema.parse(first)).toEqual(first);
    expect(first).toMatchObject({
      dataset_id: "tiny-v1",
      status: "active",
      exams: [{ exam_id: "EX1", day: "MON", session: "AM", rooms: ["AUD"] }],
      penalty: 0,
      solver_meta: {
        seed: 0,
        ms: expect.any(Number),
        iterations: 7,
        algorithm: "dsatur+bfd",
      },
      created_by: ADMIN,
    });
    expect(await getActiveExams(db)).toEqual(first);
    const second = await generateExams(db, { actor: ADMIN });
    expect((await getExamSchedule(db, first.id))?.status).toBe("superseded");
    expect((await getActiveExams(db))?.id).toBe(second.id);
    const [entry] = await listAuditLog(db, { entity: "exam_schedules" });
    expect(entry).toMatchObject({ action: "generate", entity_id: second.id });
  });

  it("saves nothing when an exam can't be placed", async () => {
    scheduleExams.mockImplementation((instance) => ({
      ...fakeScheduleExams(instance),
      exams: [],
      unplaced: ["EX1"],
    }));
    const before = await count("exam_schedules");
    await expect(generateExams(db, { actor: ADMIN })).rejects.toMatchObject({
      code: "INFEASIBLE",
      status: 422,
      details: { unplaced: ["EX1"] },
    });
    expect(await count("exam_schedules")).toBe(before);
  });
});

describe.skipIf(!testDb)("schedule export (mocked engine)", () => {
  // Requests in reverse id order, so dataset order and id order differ.
  const reordered = () => {
    const dataset = phase3Dataset();
    return {
      ...dataset,
      booking_requests: [...dataset.booking_requests].reverse(),
    };
  };

  it("is empty without an active timetable and the gate blocks it", async () => {
    await fresh(reordered());
    await replaceBookingDecisions(db, TINY_DECISIONS);
    const schedule = await buildScheduleProjection(db);
    expect(schedule).toMatchObject({
      dataset_id: "tiny-v1",
      sessions: [],
      fest_week: { bookings: [], session_overrides: [] },
      exams: [],
    });
    const err = await exportSchedule(db).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "HARD_CONSTRAINT", status: 409 });
    expect((err as Error).message).toMatch(/^The schedule has \d+ hard/);
  });

  it("projects stored state onto the export shape in dataset order", async () => {
    await fresh(reordered());
    await updateSettings(db, { team: "Team Fake" }, ADMIN);
    // The solver hands back sessions out of dataset order.
    solveSteps.mockImplementation(
      fakeSolveSteps([...TINY_ASSIGNMENTS].reverse()),
    );
    const { version } = await generateTimetable(db, {
      actor: ADMIN,
      activate: true,
    });
    await generateExams(db, { actor: ADMIN });
    // A decision for a request the dataset doesn't know (e.g. a live request) stays out.
    await upsertBookingDecision(db, {
      ...TINY_DECISIONS[0],
      request_id: "BR-99",
      timetable_version: version.id,
    });

    const schedule = await buildScheduleProjection(db);
    expect(schedule).toStrictEqual({
      team: "Team Fake",
      dataset_id: "tiny-v1",
      sessions: TINY_ASSIGNMENTS,
      fest_week: {
        bookings: [
          {
            request_id: "BR-03",
            status: "rejected",
            reason: "The request was cancelled.",
          },
          {
            request_id: "BR-02",
            status: "approved",
            day: "THU",
            start_period: 3,
            end_period: 3,
            room_id: "LH-1",
            reason: "C1-L2 moves to THU P5 for Week 7.",
          },
          {
            request_id: "BR-01",
            status: "approved",
            day: "THU",
            start_period: 10,
            end_period: 12,
            room_id: "AUD",
            reason: "",
          },
        ],
        session_overrides: [
          {
            session_id: "C1-L2",
            day: "THU",
            start_period: 5,
            room_id: "LH-1",
            displaced_by: "BR-02",
          },
        ],
      },
      exams: [{ exam_id: "EX1", day: "MON", session: "AM", rooms: ["AUD"] }],
    });
  });

  it("validates the projection with the validator port", async () => {
    const report = await validateCurrentSchedule(db);
    expect(report).toMatchObject({
      dataset_id: "tiny-v1",
      schedule_dataset_id: "tiny-v1",
      team: "Team Fake",
      hard_violation_count: 0,
      exam_soft_penalty: 0,
      bookings: {
        approved: 2,
        alternatives: 0,
        rejected: 1,
        session_overrides: 1,
        priority_inversions: [],
      },
    });
  });

  it("exports a schedule that parses as schedule.json", async () => {
    const schedule = await exportSchedule(db);
    expect(ScheduleExportSchema.parse(schedule)).toStrictEqual(schedule);
    expect(schedule).toStrictEqual(await buildScheduleProjection(db));
  });

  it("refuses to export when a stored decision breaks a hard rule", async () => {
    // CS-LAB seats 40 and is not an event room: BR-01 (300 people) can't be held there.
    await db
      .collection("booking_decisions")
      .updateOne({ _id: "BR-01" as never }, { $set: { room_id: "CS-LAB" } });
    try {
      const report = await validateCurrentSchedule(db);
      expect(report.hard_violation_count).toBeGreaterThan(0);
      const err = await exportSchedule(db).catch((e: unknown) => e);
      expect(err).toMatchObject({
        code: "HARD_CONSTRAINT",
        status: 409,
        details: report.hard_violations,
      });
      expect(report.hard_violations).toContainEqual(
        expect.objectContaining({ where: "fest_week" }),
      );
    } finally {
      await db
        .collection("booking_decisions")
        .updateOne({ _id: "BR-01" as never }, { $set: { room_id: "AUD" } });
    }
    await expect(exportSchedule(db)).resolves.toBeDefined();
  });

  it("refuses to export while a dataset request has no decision for the active timetable", async () => {
    // BR-03 (cancelled, rejected) can go missing without any hard violation: the validator
    // only warns, but the file would be incomplete.
    const stored = await db
      .collection("booking_decisions")
      .findOne({ _id: "BR-03" as never });
    await db
      .collection("booking_decisions")
      .deleteOne({ _id: "BR-03" as never });
    try {
      expect((await validateCurrentSchedule(db)).hard_violation_count).toBe(0);
      await expect(exportSchedule(db)).rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
        details: { missing: ["BR-03"] },
      });
    } finally {
      if (stored) await db.collection("booking_decisions").insertOne(stored);
    }
    await expect(exportSchedule(db)).resolves.toBeDefined();
  });
});

describe.skipIf(!testDb)("version history retention (mocked solver)", () => {
  beforeAll(() => fresh());

  it("keeps the newest 20 inactive versions and always the active one", async () => {
    const { version: active } = await generateTimetable(db, {
      actor: ADMIN,
      activate: true,
    });
    for (let i = 0; i < 22; i += 1) {
      await generateTimetable(db, { actor: ADMIN });
    }
    expect(await count("timetable_versions")).toBe(21);
    expect((await getActiveTimetableVersion(db))?.id).toBe(active.id);
    const inactive = await db
      .collection("timetable_versions")
      .find({ status: { $ne: "active" } })
      .toArray();
    // The two oldest drafts were deleted; the newest (TT-0023) is still there.
    expect(inactive.map((d) => d._id)).not.toContain("TT-0002");
    expect(inactive.map((d) => d._id)).toContain("TT-0023");
  });
});

describe.skipIf(!testDb)("reset pipeline (mocked engine)", () => {
  beforeAll(() => fresh());

  it("generates, activates, decides and schedules exams inside the reset", async () => {
    const report = await resetDemo(db, {
      from: "stored",
      actor: ADMIN,
      solverBudgetMs: 900,
      solverMaxIterations: 50,
    });
    expect(report).toMatchObject({
      dataset: { dataset_id: "tiny-v1" },
      timetable_version: expect.stringMatching(/^TT-\d{4}$/),
      exam_schedule_id: expect.stringMatching(/^EXS-\d{4}$/),
      decisions: 3,
    });
    expect(solveSteps.mock.lastCall?.[1]).toEqual({
      seed: report.settings.solver_seed,
      timeBudgetMs: 900,
      maxIterations: 50,
    });
    expect((await getActiveTimetableVersion(db))?.id).toBe(
      report.timetable_version,
    );
    expect((await getActiveExams(db))?.id).toBe(report.exam_schedule_id);
    expect(await count("booking_decisions")).toBe(3);
    expect(await count("locks")).toBe(0);
  });

  it("carries on without a timetable when generation is infeasible", async () => {
    silenceConsole();
    solveSteps.mockImplementation(fakeSolveSteps([]));
    const report = await resetDemo(db, { from: "stored" });
    expect(report).toMatchObject({
      timetable_version: null,
      exam_schedule_id: expect.stringMatching(/^EXS-/),
      decisions: 0,
    });
    expect(await getActiveTimetableVersion(db)).toBeNull();
    expect(await count("booking_decisions")).toBe(0);
  });

  it("carries on without exams when they are infeasible", async () => {
    silenceConsole();
    scheduleExams.mockImplementation((instance) => ({
      ...fakeScheduleExams(instance),
      unplaced: ["EX1"],
    }));
    const report = await resetDemo(db, { from: "stored" });
    expect(report).toMatchObject({
      timetable_version: expect.stringMatching(/^TT-/),
      exam_schedule_id: null,
      decisions: 3,
    });
  });

  it("keeps the draft and carries on when the booking engine refuses the activation", async () => {
    silenceConsole();
    decideBookings.mockImplementation((instance, base) => ({
      ...fakeDecideBookings(instance, base),
      violations: [{ rule: "H13", where: "fest_week", detail: "broken" }],
    }));
    const report = await resetDemo(db, { from: "stored" });
    expect(report).toMatchObject({
      timetable_version: null,
      exam_schedule_id: expect.stringMatching(/^EXS-/),
      decisions: 0,
    });
    expect(await getActiveTimetableVersion(db)).toBeNull();
    const [draft] = await listTimetableVersionSummaries(db);
    expect(draft).toMatchObject({ status: "draft", source: "generate" });
    expect(await count("booking_decisions")).toBe(0);
    expect(await count("locks")).toBe(0);
  });

  it("fails the reset on any other engine error and releases the lock", async () => {
    solveSteps.mockImplementation(() => {
      throw new Error("solver crashed");
    });
    await expect(resetDemo(db, { from: "stored" })).rejects.toThrow(
      "solver crashed",
    );
    expect(await count("locks")).toBe(0);
  });
});
