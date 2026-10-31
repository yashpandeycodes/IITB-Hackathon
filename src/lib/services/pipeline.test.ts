/**
 * End-to-end Phase-3 flow on the bundled dataset with the real engine (no mocks): reset →
 * generate + activate → Spectra → exams → export, gated by the validator port. The mocked
 * versions of these flows (fast, engine-independent) are in `engine-services.test.ts`. Also:
 * a default reset reproduces the committed `exports/schedule.json` byte for byte, and live
 * bookings can never leave that file inconsistent (the export safeguard).
 */
import { readFileSync } from "node:fs";
import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CreateBookingRequestSchema,
  ExamScheduleSchema,
  ScheduleExportSchema,
  SpectraRunResultSchema,
  type CreateBookingRequest,
  type SessionUser,
  type SolverProgress,
} from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { listBookingDecisions } from "@/lib/db/repos/booking-decisions";
import { getBookingRequest } from "@/lib/db/repos/reference";
import { listSessionOverrides } from "@/lib/db/repos/session-overrides";
import { openTestDb } from "@/lib/db/repos/test-db";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { findUserByEmail, toUser } from "@/lib/db/repos/users";
import { cancelBooking, createBooking } from "./bookings";
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
/** A second database for the default (committed-export) reset. */
const committedDb = testDb ? await openTestDb("pipeline.test.committed") : null;

afterAll(async () => {
  await testDb?.cleanup();
  await committedDb?.cleanup();
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
        // The engine's facts are stored with every decision (explanations use them).
        expect(d.facts).toEqual(expect.any(Object));
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

/** `schedule.json` as `npm run export` writes it. */
const serialise = (schedule: unknown) =>
  JSON.stringify(schedule, null, 2) + "\n";

describe.skipIf(!committedDb)(
  "Week-7 export safeguard on the committed timetable (real engine)",
  { timeout: 60_000 },
  () => {
    const cdb = committedDb?.db as Db;
    let admin: SessionUser;
    let baseline = "";

    const draft = (fields: Partial<CreateBookingRequest>) =>
      CreateBookingRequestSchema.parse({
        title: "x",
        attendance: 1,
        duration_periods: 1,
        windows: [{ day: "THU", from_period: 8, to_period: 8 }],
        room_types: ["classroom"],
        needs: [],
        requested_room: null,
        mandatory_for_groups: [],
        repeat_days: [],
        assumptions: [],
        follow_up: null,
        ...fields,
      });

    /** `GET /api/validate`'s hard violations and the export, as text (or the error code). */
    async function exportState() {
      const report = await validateCurrentSchedule(cdb);
      const text = await exportSchedule(cdb).then(serialise, (err: unknown) =>
        String((err as { code?: string }).code ?? err),
      );
      return { hard: report.hard_violations, text };
    }

    beforeAll(async () => {
      // The default settings and budget, exactly as `npm run export` and the demo reset run.
      await resetDemo(cdb, { actor: "u_admin" });
      admin = toUser((await findUserByEmail(cdb, "admin@cit.demo"))!);
    }, 60_000);

    it("reproduces the committed exports/schedule.json byte for byte", async () => {
      const { hard, text } = await exportState();
      expect(hard).toEqual([]);
      baseline = text;
      expect(text).toBe(readFileSync("exports/schedule.json", "utf8"));
    });

    it("keeps schedule.json valid when a cancellation frees a live class move's room (QA R1)", async () => {
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      // ME-2 has ME204-L3 in CR-105 on THU P8 in the committed week.
      const version = (await getActiveTimetableVersion(cdb))!;
      expect(
        version.assignments.find((a) => a.session_id === "ME204-L3"),
      ).toMatchObject({ day: "THU", start_period: 8, room_id: "CR-105" });

      // X asks for CR-105 at THU P8 and is given another classroom.
      const x = await createBooking(
        cdb,
        admin,
        draft({ title: "Press briefing", requested_room: "CR-105" }),
      );
      const xId = x.bookings[0].request.id;
      expect(x.bookings[0].decision?.room_id).not.toBe("CR-105");

      // L is compulsory for ME-2 at THU P8 in any room.
      const l = await createBooking(
        cdb,
        admin,
        draft({
          title: "ME-2 townhall",
          room_types: [
            "classroom",
            "lecture_hall",
            "seminar_hall",
            "auditorium",
            "outdoor",
          ],
          mandatory_for_groups: ["ME-2"],
        }),
      );
      const lId = l.bookings[0].request.id;
      expect((await exportState()).hard).toEqual([]);

      // Cancelling X frees its classroom; without the safeguard L's move of ME204-L3 would let
      // BR-08 into CR-105, where schedule.json still shows ME204-L3.
      const cancelled = await cancelBooking(cdb, admin, xId);
      expect(cancelled.request.state).toBe("cancelled");
      const after = await exportState();
      expect(after.hard).toEqual([]);
      expect(after.text).toBe(baseline);

      // L no longer moves classes; X has no decision at all and stays cancelled.
      const decisions = await listBookingDecisions(cdb, {
        timetable_version: version.id,
      });
      expect(decisions.some((d) => d.request_id === xId)).toBe(false);
      expect((await getBookingRequest(cdb, xId))?.state).toBe("cancelled");
      const townhall = decisions.find((d) => d.request_id === lId);
      expect(townhall?.requires_admin_approval).toBe(false);
      expect(
        (await listSessionOverrides(cdb)).filter((o) => o.displaced_by === lId),
      ).toEqual([]);

      // An admin's re-run decides the same way.
      await runSpectra(cdb, { actor: admin.id });
      expect(await exportState()).toEqual(after);
    });
  },
);
