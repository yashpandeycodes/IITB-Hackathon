/**
 * End-to-end Phase-3 flow on the bundled dataset with the real engine (no mocks): reset →
 * generate + activate → Spectra → exams → export, gated by the validator port. The mocked
 * versions of these flows (fast, engine-independent) are in `engine-services.test.ts`.
 */
import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ExamScheduleSchema,
  ScheduleExportSchema,
  SpectraRunResultSchema,
  type SolverProgress,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { listBookingDecisions } from "@/lib/db/repos/booking-decisions";
import { openTestDb } from "@/lib/db/repos/test-db";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { getActiveExams } from "./exams";
import {
  buildScheduleProjection,
  exportSchedule,
  validateCurrentSchedule,
} from "./export";
import { resetDemo, type ResetOptions } from "./reset";
import { runSpectra } from "./spectra";
import { activateTimetable, generateTimetable } from "./timetable";

const testDb = await openTestDb("pipeline.test");
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

/** Deterministic and quick: a fixed iteration budget, the wall clock only as a backstop. */
const FAST: ResetOptions = {
  solverMaxIterations: 200_000,
  solverBudgetMs: 20_000,
};
const bundled = getBundledDataset();

describe.skipIf(!testDb)(
  "Phase-3 pipeline on the bundled dataset (real engine)",
  { timeout: 60_000 },
  () => {
    beforeAll(async () => {
      const report = await resetDemo(db, { ...FAST, actor: "u_admin" });
      expect(report.timetable_version).not.toBeNull();
    }, 60_000);

    it("leaves an active, fully placed timetable with no hard violation", async () => {
      const version = await getActiveTimetableVersion(db);
      expect(version).toMatchObject({
        dataset_id: bundled.dataset_id,
        status: "active",
        source: "generate",
        hard_violation_count: 0,
        solver_meta: { algorithm: "greedy+repair+SA" },
      });
      expect(version?.assignments).toHaveLength(bundled.sessions.length);
    });

    it("decides every Spectra request without a priority inversion", async () => {
      const version = await getActiveTimetableVersion(db);
      const decisions = await listBookingDecisions(db);
      expect(decisions).toHaveLength(bundled.booking_requests.length);
      for (const d of decisions) {
        expect(d.timetable_version).toBe(version?.id);
        expect(d).not.toHaveProperty("facts");
      }
      // Cancelled requests are rejected, never approved or offered an alternative.
      const cancelled = new Set(bundled.cancellations.map((c) => c.request_id));
      for (const d of decisions.filter((x) => cancelled.has(x.request_id))) {
        expect(d.status).toBe("rejected");
      }
    });

    it("schedules every exam", async () => {
      const schedule = await getActiveExams(db);
      expect(ExamScheduleSchema.parse(schedule)).toEqual(schedule);
      expect(schedule?.exams).toHaveLength(bundled.exams.length);
    });

    it("exports schedule.json with 0 hard violations", async () => {
      const report = await validateCurrentSchedule(db);
      expect(report.hard_violations).toEqual([]);
      expect(report).toMatchObject({
        dataset_id: bundled.dataset_id,
        schedule_dataset_id: bundled.dataset_id,
        hard_violation_count: 0,
        bookings: { priority_inversions: [] },
      });
      expect(report.exam_soft_penalty).toEqual(expect.any(Number));

      const schedule = await exportSchedule(db);
      expect(ScheduleExportSchema.parse(schedule)).toStrictEqual(schedule);
      expect(schedule).toStrictEqual(await buildScheduleProjection(db));
      expect(schedule.sessions.map((a) => a.session_id)).toEqual(
        bundled.sessions.map((s) => s.id),
      );
      expect(schedule.fest_week.bookings.map((b) => b.request_id)).toEqual(
        bundled.booking_requests.map((r) => r.id),
      );
      expect(schedule.exams).toHaveLength(bundled.exams.length);
      console.info(
        `[pipeline.test] soft ${report.soft_total}, booking ${report.bookings?.booking_score}/${report.bookings?.booking_score_max_if_all_approved}, exam penalty ${report.exam_soft_penalty}`,
      );
    });

    it("generates another draft with progress and activates it, re-running Spectra", async () => {
      const before = await getActiveTimetableVersion(db);
      const progress: SolverProgress[] = [];
      const draft = await generateTimetable(db, {
        actor: "u_admin",
        seed: 7,
        maxIterations: FAST.solverMaxIterations,
        budgetMs: FAST.solverBudgetMs,
        onProgress: (p) => progress.push(p),
      });
      expect(draft).toMatchObject({
        activated: false,
        spectra: null,
        version: { status: "draft", parent_version: before?.id },
      });
      expect(progress.length).toBeGreaterThan(0);
      expect(progress.at(-1)?.phase).toBe("verify");
      expect((await getActiveTimetableVersion(db))?.id).toBe(before?.id);

      const activated = await activateTimetable(
        db,
        draft.version.id,
        "u_admin",
      );
      expect(activated.version.status).toBe("active");
      expect(activated.spectra.timetable_version).toBe(draft.version.id);
      expect(activated.spectra.priority_inversions).toEqual([]);
      const rerun = await runSpectra(db, { actor: "u_admin" });
      expect(SpectraRunResultSchema.parse(rerun)).toEqual(rerun);
      expect(rerun.booking_score).toBe(activated.spectra.booking_score);

      const report = await validateCurrentSchedule(db);
      expect(report.hard_violations).toEqual([]);
    });
  },
);
