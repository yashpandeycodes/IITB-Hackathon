/**
 * Change requests end to end at the service level (propose, preview, list, approve = verify +
 * apply + activate, reject, supersede, manual placement, exports before and after), against a
 * throwaway database on the tiny dataset. The rescheduler is replaced by a small brute-force
 * fake (`change-test-fixtures.ts`) and Spectra / exams by the Phase-3 fakes; the checker,
 * `applyDisruption` and the validator port stay real, so the dataset writes, the re-checks and
 * the export gates are exercised for real. The same flow on the real engine and the bundled
 * dataset is in `changes-routes.test.ts`.
 */
import type { Db } from "mongodb";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine")>()),
  reschedule: vi.fn(),
  validateChanges: vi.fn(),
  describeChanges: vi.fn(),
  checkPlacement: vi.fn(),
  decideBookings: vi.fn(),
  scheduleExams: vi.fn(),
}));

import {
  ChangeApplyResultSchema,
  ChangePreviewSchema,
  ChangeRequestSchema,
  ScheduleAfterExportSchema,
  type ChangeProposalRequestInput,
  type ChangeRequest,
  type Dataset,
  type SessionUser,
} from "@/lib/contracts";
import * as engine from "@/lib/engine";
import { applyDisruption } from "@/lib/engine/disruption";
import { COLLECTION_NAMES } from "@/lib/db/collections";
import { listAuditLog } from "@/lib/db/repos/audit-log";
import { getBaseline } from "@/lib/db/repos/baselines";
import {
  getChangeRequest,
  insertChangeRequest,
} from "@/lib/db/repos/change-requests";
import { openTestDb } from "@/lib/db/repos/test-db";
import {
  activateTimetableVersion,
  getActiveTimetableVersion,
  getTimetableVersion,
  insertTimetableVersion,
  pruneInactiveTimetableVersions,
} from "@/lib/db/repos/timetable-versions";
import { isApiError } from "@/lib/errors";
import { approveChange } from "./change-apply";
import {
  fakeCheckPlacement,
  fakeDescribeChanges,
  fakeReschedule,
  fakeValidateChanges,
  proposal,
  tinyTutorial,
} from "./change-test-fixtures";
import { staleComment } from "./change-supersede";
import {
  CHANGE_ID,
  CHANGE_LIST_LIMIT,
  PENDING_CHANGE_LIMIT,
  getChange,
  listChanges,
  previewChange,
  proposeChange,
  rejectChange,
} from "./changes";
import { getActiveDataset, getImportedDataset, importDataset } from "./dataset";
import { generateExams } from "./exams";
import {
  BASELINE_NOT_EXPORTABLE,
  buildScheduleProjection,
  exportDisruption,
  exportSchedule,
  exportScheduleAfter,
  validateExportFile,
} from "./export";
import { placeManually } from "./manual";
import { runSpectra } from "./spectra";
import {
  TINY_ASSIGNMENTS,
  USERS,
  ZERO_SOFT,
  fakeDecideBookings,
  fakeScheduleExams,
  phase3Dataset,
} from "./test-fixtures";
import { activateTimetable } from "./timetable";

const reschedule = vi.mocked(engine.reschedule);
const decideBookings = vi.mocked(engine.decideBookings);

const testDb = await openTestDb("changes.test");
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

const ADMIN: SessionUser = USERS.admin;
const COORD: SessionUser = USERS.coordinator;
/** Faculty F1 (CSE): teaches C1-L1 and C1-P1. */
const FACULTY: SessionUser = USERS.faculty;
const CLUB: SessionUser = USERS.club;
/** A faculty account for F2 (ECE), who teaches C1-L2. */
const FACULTY_F2: SessionUser = {
  ...USERS.faculty,
  id: "u_faculty_f2",
  email: "f2@test.local",
  department: "ECE",
  faculty_id: "F2",
};
const ECE_COORD: SessionUser = {
  ...USERS.coordinator,
  id: "u_coord_ece",
  email: "coord.ece@test.local",
  department: "ECE",
};

beforeEach(() => {
  vi.restoreAllMocks();
  reschedule.mockReset().mockImplementation(fakeReschedule);
  vi.mocked(engine.validateChanges)
    .mockReset()
    .mockImplementation(fakeValidateChanges);
  vi.mocked(engine.describeChanges)
    .mockReset()
    .mockImplementation(fakeDescribeChanges);
  vi.mocked(engine.checkPlacement)
    .mockReset()
    .mockImplementation(fakeCheckPlacement);
  decideBookings.mockReset().mockImplementation(fakeDecideBookings);
  vi.mocked(engine.scheduleExams)
    .mockReset()
    .mockImplementation(fakeScheduleExams);
});

/** An empty database with the tiny dataset loaded, TINY_ASSIGNMENTS active and exams scheduled. */
async function fresh(): Promise<string> {
  for (const name of COLLECTION_NAMES) {
    await db.collection(name).deleteMany({});
  }
  await importDataset(db, phase3Dataset(), "upload");
  const version = await insertTimetableVersion(db, {
    dataset_id: "tiny-v1",
    status: "draft",
    source: "generate",
    parent_version: null,
    change_request_id: null,
    assignments: TINY_ASSIGNMENTS,
    hard_violation_count: 0,
    soft_penalty: ZERO_SOFT,
    solver_meta: null,
    created_by: ADMIN.id,
  });
  await activateTimetable(db, version.id, ADMIN.id);
  await generateExams(db, { actor: ADMIN.id });
  return version.id;
}

/** Another draft of the same timetable (to activate in place of the base). */
function otherVersion(parent: string) {
  return insertTimetableVersion(db, {
    dataset_id: "tiny-v1",
    status: "draft",
    source: "generate",
    parent_version: parent,
    change_request_id: null,
    assignments: TINY_ASSIGNMENTS,
    hard_violation_count: 0,
    soft_penalty: ZERO_SOFT,
    solver_meta: null,
    created_by: ADMIN.id,
  });
}

type ChangeInput = NonNullable<ChangeProposalRequestInput["changes"]>[number];

/** F1 can't teach MON P1, which breaks C1-L1 (MON P1 CR-1). */
const F1_MONDAY = {
  type: "faculty_unavailable",
  faculty_id: "F1",
  days: ["MON"],
  periods: [1],
  reason: "Department meeting",
} satisfies ChangeInput;

/** Every change type at once (SAT is not a teaching day: the validator ignores it). */
const EVERY_TYPE: ChangeInput[] = [
  { ...F1_MONDAY, days: ["MON", "SAT"] },
  {
    type: "room_unavailable",
    room_id: "CR-1",
    days: ["MON", "WED"],
    periods: [2],
    reason: "Leak",
  },
  {
    type: "add_faculty",
    faculty: { id: "F3", name: "Dr. Three", department: "CSE" },
  },
  { type: "add_session", session: tinyTutorial("C1-T1", "F3") },
  { type: "remove_session", session_id: "C1-P1" },
];

const file = (
  changes: ChangeProposalRequestInput["changes"],
  extra: Partial<ChangeProposalRequestInput> = {},
) => proposal({ kind: "disruption", changes, ...extra });

async function expectApiError(
  promise: Promise<unknown>,
  code: string,
): Promise<{ message: string; details?: unknown }> {
  try {
    await promise;
  } catch (err) {
    if (!isApiError(err)) throw err;
    expect(err.code, err.message).toBe(code);
    return { message: err.message, details: err.details };
  }
  throw new Error(`expected ${code}`);
}

/** Every stored document of the collections an approval writes, for exact before/after checks. */
async function referenceSnapshot() {
  const out: Record<string, unknown[]> = {};
  for (const name of ["faculty", "sessions", "room_unavailability"]) {
    out[name] = await db
      .collection(name)
      .find({}, { sort: { _id: 1 } })
      .toArray();
  }
  return out;
}

const silenceConsole = () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
};

describe("CHANGE_ID", () => {
  it("accepts CR-NNNN ids and nothing else", () => {
    for (const id of ["CR-0001", "CR-123456"])
      expect(CHANGE_ID.test(id)).toBe(true);
    for (const id of ["CR-1", "CR-0001x", "cr-0001", "CR-1234567", "TT-0001"])
      expect(CHANGE_ID.test(id), id).toBe(false);
  });
});

describe.skipIf(!testDb)(
  "change requests (MongoDB, fake rescheduler)",
  { timeout: 60_000 },
  () => {
    describe("before a timetable exists", () => {
      it("needs an imported dataset, then an active timetable", async () => {
        for (const name of COLLECTION_NAMES) {
          await db.collection(name).deleteMany({});
        }
        const nothing = await expectApiError(
          proposeChange(db, ADMIN, file([F1_MONDAY])),
          "CONFLICT",
        );
        expect(nothing.message).toBe("Load or reset the dataset first.");
        await importDataset(db, phase3Dataset(), "upload");
        const noTimetable = await expectApiError(
          previewChange(db, ADMIN, file([F1_MONDAY])),
          "CONFLICT",
        );
        expect(noTimetable.message).toBe("Generate a timetable first.");
        expect(await db.collection("change_requests").countDocuments()).toBe(0);
      });
    });

    describe("proposing", () => {
      let base: string;
      beforeEach(async () => {
        base = await fresh();
      });

      it("stores a pending proposal with a draft version and touches nothing else", async () => {
        const before = await referenceSnapshot();
        const cr = await proposeChange(
          db,
          ADMIN,
          file([F1_MONDAY], {
            description: "Meeting",
            dataset: "cit-public-v1",
          }),
        );
        expect(ChangeRequestSchema.parse(cr)).toEqual(cr);
        expect(cr).toMatchObject({
          id: "CR-0001",
          kind: "disruption",
          status: "pending",
          feasible: true,
          requested_by: ADMIN.id,
          requested_by_role: "admin",
          description: "Meeting",
          base_version: base,
          title: "faculty_unavailable",
          moved_count: 1,
          hard_violation_count: 0,
          conflicts: [],
          approved_by: null,
          decided_by: null,
          warnings: [
            "This change file was written for dataset cit-public-v1; the loaded dataset is tiny-v1.",
          ],
          scope: {
            session_ids: ["C1-L1"],
            faculty_ids: ["F1"],
            group_ids: ["G1"],
            departments: ["CSE"],
          },
        });
        expect(cr.diff).toMatchObject([
          { session_id: "C1-L1", cause: "broken", from: { day: "MON" } },
        ]);

        const draft = await getTimetableVersion(db, cr.proposed_version ?? "");
        expect(draft).toMatchObject({
          status: "draft",
          source: "reschedule",
          parent_version: base,
          change_request_id: cr.id,
          hard_violation_count: 0,
          created_by: ADMIN.id,
          solver_meta: {
            seed: 0,
            ms: 3,
            algorithm: "fake repair",
            stopped_by: "converged",
          },
        });
        expect(draft?.soft_penalty).toEqual(cr.soft_penalty);
        expect(draft?.solver_meta?.iterations).toBe(cr.engine.nodes);

        // Proposing changes nothing in the data or the active timetable.
        expect(await referenceSnapshot()).toEqual(before);
        expect((await getActiveTimetableVersion(db))?.id).toBe(base);
        const audit = await listAuditLog(db, { entity_id: cr.id });
        expect(audit.map((a) => a.action)).toEqual(["propose"]);
      });

      it("previews without storing anything", async () => {
        const preview = await previewChange(db, FACULTY, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
        });
        expect(ChangePreviewSchema.parse(preview)).toEqual(preview);
        expect(preview).toMatchObject({ base_version: base, feasible: true });
        expect(await db.collection("change_requests").countDocuments()).toBe(0);
        expect(await db.collection("timetable_versions").countDocuments()).toBe(
          1,
        );
      });

      it("stores an infeasible proposal with its conflicts and no draft", async () => {
        const cr = await proposeChange(
          db,
          ADMIN,
          file([
            {
              type: "faculty_unavailable",
              faculty_id: "F1",
              days: ["MON", "TUE", "WED", "THU", "FRI"],
              periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            },
          ]),
        );
        expect(cr).toMatchObject({
          status: "infeasible",
          feasible: false,
          proposed_version: null,
          soft_penalty: null,
          soft_delta: 0,
        });
        expect(cr.conflicts.map((c) => c.session_id)).toEqual([
          "C1-L1",
          "C1-P1",
        ]);
        expect(cr.scope.session_ids).toEqual(["C1-L1", "C1-P1"]);
        expect(await db.collection("timetable_versions").countDocuments()).toBe(
          1,
        );
        const err = await expectApiError(
          approveChange(db, ADMIN, cr.id, {}),
          "CONFLICT",
        );
        expect(err.message).toMatch(/can't be approved/);
        expect((await rejectChange(db, ADMIN, cr.id, {})).status).toBe(
          "rejected",
        );
      });

      it("rejects unknown ids and changes that don't fit the kind, storing nothing", async () => {
        const unknown = await expectApiError(
          proposeChange(db, ADMIN, file([{ ...F1_MONDAY, faculty_id: "F99" }])),
          "VALIDATION_ERROR",
        );
        expect(unknown.details).toEqual([
          { path: "changes[0].faculty_id", message: "Unknown faculty F99." },
        ]);
        await expectApiError(
          proposeChange(db, ADMIN, {
            ...file([
              {
                type: "room_unavailable",
                room_id: "CR-1",
                days: ["MON"],
                periods: [1],
              },
            ]),
            kind: "unavailability",
          }),
          "VALIDATION_ERROR",
        );
        await expectApiError(
          proposeChange(
            db,
            ADMIN,
            proposal({
              kind: "manual_edit",
              placements: [{ ...TINY_ASSIGNMENTS[0] }],
            }),
          ),
          "VALIDATION_ERROR", // the session is already exactly there
        );
        expect(await db.collection("change_requests").countDocuments()).toBe(0);
        expect(reschedule).not.toHaveBeenCalled();
      });

      it("refuses changes whose result would no longer load as a dataset", async () => {
        // An added session of a course that doesn't exist (the fake validator misses it).
        const err = await expectApiError(
          proposeChange(
            db,
            ADMIN,
            file([
              {
                type: "add_session",
                session: { ...tinyTutorial(), course_id: "NOPE" },
              },
            ]),
          ),
          "VALIDATION_ERROR",
        );
        expect(err.message).toBe("The dataset file is invalid.");
        expect(await db.collection("change_requests").countDocuments()).toBe(0);
      });

      it("enforces who may file what (RBAC matrix)", async () => {
        const unavailability = (faculty_id: string) =>
          proposal({
            kind: "unavailability",
            changes: [{ ...F1_MONDAY, faculty_id }],
          });
        const closure = (room_id: string) =>
          file([
            { type: "room_unavailable", room_id, days: ["FRI"], periods: [9] },
          ]);

        // Club: nothing at all.
        await expectApiError(
          proposeChange(db, CLUB, unavailability("F1")),
          "FORBIDDEN",
        );
        // Faculty: their own unavailability only, never a change file.
        expect(
          (await proposeChange(db, FACULTY, unavailability("F1"))).status,
        ).toBe("pending");
        await expectApiError(
          proposeChange(db, FACULTY, unavailability("F2")),
          "FORBIDDEN",
        );
        await expectApiError(
          proposeChange(db, FACULTY, file([F1_MONDAY])),
          "FORBIDDEN",
        );
        await expectApiError(
          proposeChange(
            db,
            { ...FACULTY, id: "u_unlinked", faculty_id: null },
            unavailability("F1"),
          ),
          "FORBIDDEN",
        );
        // Coordinator: their department's faculty and labs only.
        expect(
          (await proposeChange(db, COORD, unavailability("F1"))).status,
        ).toBe("pending");
        await expectApiError(
          proposeChange(db, COORD, unavailability("F2")),
          "FORBIDDEN",
        );
        expect((await proposeChange(db, COORD, closure("CS-LAB"))).status).toBe(
          "pending",
        );
        const lh = await expectApiError(
          proposeChange(db, COORD, closure("LH-1")),
          "FORBIDDEN",
        );
        expect(lh.details).toEqual({
          issues: ["changes[0]: only an admin can close LH-1 (not a CSE lab)."],
        });
        await expectApiError(
          proposeChange(
            db,
            { ...COORD, id: "u_no_dept", department: null },
            unavailability("F1"),
          ),
          "FORBIDDEN",
        );
        await expectApiError(
          proposeChange(db, ECE_COORD, closure("CS-LAB")),
          "FORBIDDEN",
        );
        // Admin: anything.
        expect((await proposeChange(db, ADMIN, closure("LH-1"))).status).toBe(
          "pending",
        );
      });

      it(`caps a user at ${PENDING_CHANGE_LIMIT} open requests on the active timetable`, async () => {
        const unavailability = () => ({
          ...file([F1_MONDAY]),
          kind: "unavailability" as const,
        });
        const first = await proposeChange(db, FACULTY, unavailability());
        const { id: _id, created_at: _at, ...copy } = first;
        void _id;
        void _at;
        // Infeasible filings count too, so one can't be repeated without limit.
        for (let i = 1; i < PENDING_CHANGE_LIMIT; i++) {
          await insertChangeRequest(
            db,
            i % 2 === 0
              ? copy
              : { ...copy, status: "infeasible", proposed_version: null },
          );
        }
        const full = await expectApiError(
          proposeChange(db, FACULTY, unavailability()),
          "CONFLICT",
        );
        expect(full.message).toMatch(/pending or infeasible/);
        expect(full.details).toEqual({
          limit: PENDING_CHANGE_LIMIT,
          pending: PENDING_CHANGE_LIMIT,
        });
        // Someone else's requests don't count against this user.
        expect((await proposeChange(db, COORD, unavailability())).status).toBe(
          "pending",
        );
        // A withdrawn request frees a place.
        await rejectChange(db, FACULTY, first.id, {});
        await proposeChange(db, FACULTY, unavailability());
        await expectApiError(
          proposeChange(db, FACULTY, unavailability()),
          "CONFLICT",
        );
        // Requests built on an older timetable don't count.
        await db
          .collection("change_requests")
          .updateMany(
            { requested_by: FACULTY.id },
            { $set: { base_version: "TT-0999" } },
          );
        expect(
          (await proposeChange(db, FACULTY, unavailability())).base_version,
        ).toBe(base);
      });

      it("lists and shows only what each user may see", async () => {
        const mine = await proposeChange(db, FACULTY, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
        });
        const lab = await proposeChange(
          db,
          ADMIN,
          file([
            {
              type: "room_unavailable",
              room_id: "LH-1",
              days: ["THU"],
              periods: [3],
            },
          ]),
        );
        // The LH-1 closure moves C1-L2 (G1 + G2, taught by F2, a CSE course).
        expect(lab.scope).toMatchObject({
          session_ids: ["C1-L2"],
          faculty_ids: ["F2"],
          departments: ["CSE", "ECE"],
        });
        await rejectChange(db, ADMIN, lab.id, { comment: "Not now" });

        const ids = async (user: SessionUser, q = {}) =>
          (await listChanges(db, user, { scope: "all", ...q })).map(
            (c) => c.id,
          );
        expect(await ids(ADMIN)).toEqual([lab.id, mine.id]);
        expect(await ids(FACULTY)).toEqual([mine.id]);
        expect(await ids(FACULTY_F2)).toEqual([lab.id]);
        expect(await ids(COORD)).toEqual([lab.id, mine.id]);
        expect(await ids(ECE_COORD)).toEqual([lab.id]);
        expect(await ids(ADMIN, { scope: "mine" })).toEqual([lab.id]);
        expect(await ids(ADMIN, { scope: "pending" })).toEqual([mine.id]);
        expect(await ids(ADMIN, { status: "rejected" })).toEqual([lab.id]);
        expect(
          await ids(ADMIN, { scope: "pending", status: "rejected" }),
        ).toEqual([]);

        expect((await getChange(db, FACULTY, mine.id)).id).toBe(mine.id);
        await expectApiError(getChange(db, FACULTY_F2, mine.id), "NOT_FOUND");
        await expectApiError(getChange(db, ADMIN, "CR-0999"), "NOT_FOUND");
      });

      it(`filters visibility in the query, before the ${CHANGE_LIST_LIMIT}-item limit`, async () => {
        const mine = await proposeChange(db, FACULTY, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
        });
        // Newer requests the CSE coordinator and F1 may not see: ECE only, filed by someone else.
        const { id: _id, created_at: _at, ...copy } = mine;
        void _id;
        void _at;
        const hidden = {
          ...copy,
          requested_by: "u_someone_else",
          requested_by_role: "admin" as const,
          proposed_version: null,
          status: "rejected" as const,
          scope: { ...copy.scope, departments: ["ECE"], faculty_ids: ["F2"] },
        };
        for (let i = 0; i < CHANGE_LIST_LIMIT + 5; i++) {
          await insertChangeRequest(db, hidden);
        }
        const all = await listChanges(db, ADMIN, { scope: "all" });
        expect(all).toHaveLength(CHANGE_LIST_LIMIT);
        expect(all.map((c) => c.id)).not.toContain(mine.id); // the oldest
        for (const user of [FACULTY, COORD]) {
          expect(
            (await listChanges(db, user, { scope: "all" })).map((c) => c.id),
          ).toEqual([mine.id]);
        }
        expect(
          await listChanges(db, FACULTY_F2, { scope: "all" }),
        ).toHaveLength(CHANGE_LIST_LIMIT);
      });

      it("shows the assistant prompt only to the requester and admins", async () => {
        const cr = await proposeChange(db, FACULTY, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
          nl_prompt: "I have a clinic on Monday mornings",
        });
        expect(cr.nl_prompt).toBe("I have a clinic on Monday mornings");
        for (const user of [FACULTY, ADMIN]) {
          expect((await getChange(db, user, cr.id)).nl_prompt).toBe(
            cr.nl_prompt,
          );
          expect(
            (await listChanges(db, user, { scope: "all" }))[0].nl_prompt,
          ).toBe(cr.nl_prompt);
        }
        // The CSE coordinator may see the request (F1 is CSE), not the requester's words.
        expect(await getChange(db, COORD, cr.id)).toEqual({
          ...cr,
          nl_prompt: null,
        });
        expect(
          (await listChanges(db, COORD, { scope: "all" }))[0].nl_prompt,
        ).toBeNull();
      });
    });

    describe("approving", () => {
      let base: string;
      beforeEach(async () => {
        base = await fresh();
      });

      it("applies every change type: the stored dataset equals applyDisruption, in order", async () => {
        const before = (await getImportedDataset(db)) as Dataset;
        const scheduleBefore = await buildScheduleProjection(db);
        const cr = await proposeChange(db, ADMIN, file([...EVERY_TYPE]));
        expect(cr.status).toBe("pending");

        const result = await approveChange(db, ADMIN, cr.id, {
          comment: "Reviewed",
        });
        expect(ChangeApplyResultSchema.parse(result)).toEqual(result);
        expect(result).toMatchObject({
          version_id: cr.proposed_version,
          superseded: [],
          change: {
            id: cr.id,
            status: "applied",
            approved_by: ADMIN.id,
            decided_by: ADMIN.id,
            decided_at: expect.any(String),
            comment: "Reviewed",
          },
        });
        const active = await getActiveTimetableVersion(db);
        expect(active).toMatchObject({
          id: cr.proposed_version,
          status: "active",
        });
        expect((await getTimetableVersion(db, base))?.status).toBe(
          "superseded",
        );

        const expected = applyDisruption(before, { changes: cr.changes });
        expect(await getActiveDataset(db)).toEqual(expected);
        // SAT was dropped like the validator drops it; the records carry their provenance.
        expect(
          expected.faculty.find((f) => f.id === "F1")?.unavailable,
        ).toEqual([{ day: "MON", periods: [1], reason: "Department meeting" }]);
        expect(
          await db.collection("faculty").findOne({ _id: "F3" as never }),
        ).toMatchObject({ origin: "disruption", change_request_id: cr.id });
        expect(
          await db
            .collection("room_unavailability")
            .find({ change_request_id: cr.id })
            .toArray(),
        ).toHaveLength(2);
        expect(
          await db.collection("sessions").findOne({ _id: "C1-P1" as never }),
        ).toMatchObject({ removed: true, removed_by: cr.id });

        // Exports: schedule.json is the baseline, schedule_after.json the live timetable.
        const baseline = await getBaseline(db);
        expect(baseline).toMatchObject({
          version_id: base,
          change_request_id: cr.id,
          captured_by: ADMIN.id,
        });
        expect(await exportSchedule(db)).toEqual(scheduleBefore);
        const after = await exportScheduleAfter(db);
        expect(ScheduleAfterExportSchema.parse(after)).toEqual(after);
        expect(after.sessions).toEqual(active?.assignments);
        const report = await validateExportFile(db, "schedule_after");
        expect(report.hard_violation_count).toBe(0);
        expect(report.stability).toMatchObject({
          sessions_moved: cr.moved_count,
        });
        expect((await validateExportFile(db, "schedule")).stability).toBe(
          undefined,
        );
        expect(await exportDisruption(db)).toEqual({
          id: "applied-changes",
          dataset: "tiny-v1",
          description: `Changes applied in the app, in order: ${cr.id}.`,
          changes: cr.changes,
        });

        const actions = (await listAuditLog(db, { entity_id: cr.id }))
          .map((a) => a.action)
          .reverse();
        expect(actions).toEqual(["propose", "approve", "apply"]);
      });

      it("forgets the baseline and the requests when a dataset is imported", async () => {
        const cr = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        await approveChange(db, ADMIN, cr.id, {});
        expect(await getBaseline(db)).not.toBeNull();
        await importDataset(db, phase3Dataset(), "upload");
        expect(await getBaseline(db)).toBeNull();
        expect(await db.collection("change_requests").countDocuments()).toBe(0);
        await expectApiError(exportScheduleAfter(db), "CONFLICT");
      });

      it("refuses exports of the change files before anything is applied", async () => {
        await expectApiError(exportScheduleAfter(db), "CONFLICT");
        await expectApiError(exportDisruption(db), "CONFLICT");
        await expectApiError(
          validateExportFile(db, "schedule_after"),
          "CONFLICT",
        );
        expect(await exportSchedule(db)).toEqual(
          await buildScheduleProjection(db),
        );
      });

      it("chains changes: a removed session added back, the baseline kept from the first", async () => {
        const original = (await getImportedDataset(db)) as Dataset;
        const scheduleBefore = await buildScheduleProjection(db);
        const removal = await proposeChange(
          db,
          ADMIN,
          file([{ type: "remove_session", session_id: "C1-L1" }]),
        );
        await approveChange(db, ADMIN, removal.id, {});
        const readd = await proposeChange(
          db,
          COORD,
          file([{ type: "add_session", session: tinyTutorial("C1-L1") }]),
        );
        expect(readd.diff).toMatchObject([
          { session_id: "C1-L1", move: "added" },
        ]);
        await approveChange(db, ADMIN, readd.id, {});

        const expected = applyDisruption(
          applyDisruption(original, { changes: removal.changes }),
          { changes: readd.changes },
        );
        expect(await getActiveDataset(db)).toEqual(expected);
        expect(
          await db.collection("sessions").findOne({ _id: "C1-L1" as never }),
        ).toMatchObject({
          kind: "tutorial",
          removed: false,
          change_request_id: readd.id,
        });
        expect((await getBaseline(db))?.change_request_id).toBe(removal.id);
        expect(await exportSchedule(db)).toEqual(scheduleBefore);
        expect((await exportDisruption(db)).changes).toEqual([
          ...removal.changes,
          ...readd.changes,
        ]);
        expect(
          (await validateExportFile(db, "schedule_after")).hard_violation_count,
        ).toBe(0);
      });

      it("lets only admins approve, and never the requester under another role", async () => {
        const byCoord = await proposeChange(db, COORD, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
        });
        await expectApiError(
          approveChange(db, COORD, byCoord.id, {}),
          "FORBIDDEN",
        );
        await expectApiError(
          approveChange(db, FACULTY, byCoord.id, {}),
          "FORBIDDEN",
        );
        // Invisible to the club and to the ECE coordinator: as if it didn't exist.
        await expectApiError(
          approveChange(db, CLUB, byCoord.id, {}),
          "NOT_FOUND",
        );
        await expectApiError(
          approveChange(db, ECE_COORD, byCoord.id, {}),
          "NOT_FOUND",
        );
        // The coordinator later promoted to admin still can't approve their own request.
        await expectApiError(
          approveChange(db, { ...COORD, role: "admin" }, byCoord.id, {}),
          "SELF_APPROVAL",
        );
        expect((await getChangeRequest(db, byCoord.id))?.status).toBe(
          "pending",
        );
        // Another admin can.
        const other = { ...ADMIN, id: "u_admin_2", email: "a2@test.local" };
        expect(
          (await approveChange(db, other, byCoord.id, {})).change.approved_by,
        ).toBe(other.id);
      });

      it("lets an admin approve a change they filed as an admin", async () => {
        const own = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        const result = await approveChange(db, ADMIN, own.id, {});
        expect(result.change).toMatchObject({
          status: "applied",
          requested_by: ADMIN.id,
          approved_by: ADMIN.id,
        });
        await expectApiError(approveChange(db, ADMIN, own.id, {}), "CONFLICT");
      });

      it("supersedes the other pending proposals on the same timetable", async () => {
        const a = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        const b = await proposeChange(db, COORD, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
        });
        const c = await proposeChange(
          db,
          ADMIN,
          file([
            {
              type: "room_unavailable",
              room_id: "CS-LAB",
              days: ["TUE"],
              periods: [2],
            },
          ]),
        );
        const result = await approveChange(db, ADMIN, a.id, {});
        expect(result.superseded).toEqual([b.id, c.id]);
        for (const id of [b.id, c.id]) {
          const cr = (await getChangeRequest(db, id)) as ChangeRequest;
          expect(cr).toMatchObject({
            status: "rejected",
            decided_by: "system",
            comment: `Superseded by ${a.id}`,
          });
          expect(
            await getTimetableVersion(db, cr.proposed_version ?? ""),
          ).toBeNull();
          expect(
            (await listAuditLog(db, { entity_id: id })).map((e) => e.action),
          ).toEqual(["supersede", "propose"]);
        }
      });

      it("rejects the pending proposals when another timetable is activated directly", async () => {
        const cr = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        const stuck = await proposeChange(
          db,
          ADMIN,
          file([
            {
              type: "faculty_unavailable",
              faculty_id: "F1",
              days: ["MON", "TUE", "WED", "THU", "FRI"],
              periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            },
          ]),
        );
        expect(stuck.status).toBe("infeasible");
        const other = await otherVersion(base);
        await activateTimetable(db, other.id, ADMIN.id);

        expect(await getChangeRequest(db, cr.id)).toMatchObject({
          status: "rejected",
          decided_by: "system",
          comment: staleComment(other.id),
        });
        expect(staleComment(other.id)).toBe(
          `The timetable changed (${other.id} is active now); file it again.`,
        );
        expect(
          await getTimetableVersion(db, cr.proposed_version ?? ""),
        ).toBeNull();
        expect(
          (await listAuditLog(db, { entity_id: cr.id })).map((e) => e.action),
        ).toEqual(["supersede", "propose"]);
        // Infeasible requests stay as they are (the requester withdraws them).
        expect((await getChangeRequest(db, stuck.id))?.status).toBe(
          "infeasible",
        );
        const refused = await expectApiError(
          approveChange(db, ADMIN, cr.id, {}),
          "CONFLICT",
        );
        expect(refused.message).toBe(`${cr.id} is rejected, not pending.`);
        // Proposals on the new timetable are untouched by activating it again.
        const fresh = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        await activateTimetable(db, other.id, ADMIN.id);
        expect((await getChangeRequest(db, fresh.id))?.status).toBe("pending");
      });

      it("still answers STALE_VERSION when the base changed without that sweep", async () => {
        const cr = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        const other = await otherVersion(base);
        await activateTimetableVersion(db, other.id); // the repository: no sweep

        const stale = await expectApiError(
          approveChange(db, ADMIN, cr.id, {}),
          "STALE_VERSION",
        );
        const message = `The timetable changed since this proposal (${other.id} is active now); file it again.`;
        expect(stale.message).toBe(message);
        expect(await getChangeRequest(db, cr.id)).toMatchObject({
          status: "rejected",
          comment: message,
          decided_by: "system",
        });
        expect(
          await getTimetableVersion(db, cr.proposed_version ?? ""),
        ).toBeNull();
        expect(await getBaseline(db)).toBeNull();
      });

      it("refuses the first approval until schedule.json is exportable", async () => {
        const before = await referenceSnapshot();
        const cr = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        const expectRefused = async (code: string) => {
          const err = await expectApiError(
            approveChange(db, ADMIN, cr.id, {}),
            "CONFLICT",
          );
          expect(err.message).toBe(BASELINE_NOT_EXPORTABLE);
          expect(err.details).toMatchObject({ code });
          expect((await getChangeRequest(db, cr.id))?.status).toBe("pending");
          expect(await getBaseline(db)).toBeNull();
          expect(await referenceSnapshot()).toEqual(before);
          expect((await getActiveTimetableVersion(db))?.id).toBe(base);
        };

        // No exams: the validator reports every exam unscheduled (hard).
        await db.collection("exam_schedules").deleteMany({});
        await expectRefused("HARD_CONSTRAINT");
        // Exams back, but no Spectra decisions.
        await generateExams(db, { actor: ADMIN.id });
        await db.collection("booking_decisions").deleteMany({});
        await db.collection("session_overrides").deleteMany({});
        await expectRefused("CONFLICT");

        await runSpectra(db, { actor: ADMIN.id });
        expect((await approveChange(db, ADMIN, cr.id, {})).change.status).toBe(
          "applied",
        );
        // With the baseline captured, later approvals don't need the live file exportable.
        const next = await proposeChange(
          db,
          ADMIN,
          file([{ ...F1_MONDAY, days: ["TUE"], periods: [9] }]),
        );
        await db.collection("exam_schedules").deleteMany({});
        expect(
          (await approveChange(db, ADMIN, next.id, {})).change.status,
        ).toBe("applied");
      });

      it("keeps a proposal pending when it no longer holds against the data (HARD_CONSTRAINT)", async () => {
        const before = await referenceSnapshot();
        const cr = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        // Something outside the change put C1-L1's new slot out of use.
        const draft = await getTimetableVersion(db, cr.proposed_version ?? "");
        const moved = draft?.assignments.find((a) => a.session_id === "C1-L1");
        await db.collection("timetable_versions").updateOne(
          { _id: cr.proposed_version as never },
          {
            $set: {
              assignments: draft?.assignments.map((a) =>
                a.session_id === "C1-L1" ? { ...a, start_period: 1 } : a,
              ),
            },
          },
        );
        expect(moved?.day).toBe("MON");
        const err = await expectApiError(
          approveChange(db, ADMIN, cr.id, {}),
          "HARD_CONSTRAINT",
        );
        expect(err.message).toMatch(/breaks 1 hard rule.*stays pending/);
        expect(Array.isArray(err.details)).toBe(true);
        expect((await getChangeRequest(db, cr.id))?.status).toBe("pending");
        expect(await referenceSnapshot()).toEqual(before);
        expect(await getBaseline(db)).toBeNull();
        expect((await getActiveTimetableVersion(db))?.id).toBe(base);
      });

      it("rolls the dataset back exactly when activation fails", async () => {
        silenceConsole();
        const before = await referenceSnapshot();
        const datasetBefore = await getActiveDataset(db);
        const cr = await proposeChange(db, ADMIN, file([...EVERY_TYPE]));
        decideBookings.mockImplementationOnce(() => {
          throw new Error("simulated booking engine failure");
        });
        await expect(approveChange(db, ADMIN, cr.id, {})).rejects.toThrow(
          "simulated booking engine failure",
        );
        expect(await referenceSnapshot()).toEqual(before);
        expect(await getActiveDataset(db)).toEqual(datasetBefore);
        expect(await getBaseline(db)).toBeNull();
        expect((await getActiveTimetableVersion(db))?.id).toBe(base);
        expect((await getChangeRequest(db, cr.id))?.status).toBe("pending");

        // Nothing was lost: the same request applies cleanly afterwards.
        expect((await approveChange(db, ADMIN, cr.id, {})).change.status).toBe(
          "applied",
        );
      });

      it("refuses to activate a proposed version directly, and protects it from pruning", async () => {
        const cr = await proposeChange(db, ADMIN, file([F1_MONDAY]));
        const draftId = cr.proposed_version as string;
        const refused = await expectApiError(
          activateTimetable(db, draftId, ADMIN.id),
          "CONFLICT",
        );
        expect(refused.message).toBe(
          `Timetable ${draftId} was proposed by ${cr.id}. Approve ${cr.id} to apply this version.`,
        );
        await pruneInactiveTimetableVersions(db, 0);
        expect(await getTimetableVersion(db, draftId)).not.toBeNull();

        // Once applied (and later superseded), it still can't be re-activated by hand.
        await approveChange(db, ADMIN, cr.id, {});
        await expectApiError(
          activateTimetable(db, base, ADMIN.id),
          "HARD_CONSTRAINT", // the old timetable breaks F1's new unavailability
        );
      });
    });

    describe("rejecting", () => {
      beforeEach(async () => {
        await fresh();
      });

      it("lets the requester withdraw and an admin reject, deleting the draft", async () => {
        const mine = await proposeChange(db, FACULTY, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
        });
        await expectApiError(rejectChange(db, COORD, mine.id, {}), "FORBIDDEN");
        await expectApiError(
          rejectChange(db, FACULTY_F2, mine.id, {}),
          "NOT_FOUND",
        );
        const withdrawn = await rejectChange(db, FACULTY, mine.id, {});
        expect(withdrawn).toMatchObject({
          status: "rejected",
          decided_by: FACULTY.id,
          comment: "Withdrawn by the requester",
          approved_by: null,
        });
        expect(
          await getTimetableVersion(db, mine.proposed_version ?? ""),
        ).toBeNull();
        await expectApiError(
          rejectChange(db, FACULTY, mine.id, {}),
          "CONFLICT",
        );

        const theirs = await proposeChange(db, COORD, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
        });
        expect(
          await rejectChange(db, ADMIN, theirs.id, { comment: "Duplicate" }),
        ).toMatchObject({ decided_by: ADMIN.id, comment: "Duplicate" });
        const silent = await proposeChange(db, COORD, {
          ...file([F1_MONDAY]),
          kind: "unavailability",
        });
        expect(
          (await rejectChange(db, ADMIN, silent.id, {})).comment,
        ).toBeNull();
        expect(
          (await listAuditLog(db, { entity_id: silent.id }))[0].action,
        ).toBe("reject");
      });
    });

    describe("manual placement", () => {
      beforeEach(async () => {
        await fresh();
      });

      it("refuses a slot that breaks a hard rule, storing nothing", async () => {
        // C1-L1 at TUE P2 would clash with C1-P1 (G1 and F1 both busy).
        const err = await expectApiError(
          placeManually(db, COORD, {
            session_id: "C1-L1",
            day: "TUE",
            start_period: 2,
            room_id: "CR-1",
            repair: false,
          }),
          "HARD_CONSTRAINT",
        );
        expect((err.details as unknown[]).length).toBeGreaterThan(0);
        expect(err.message).toMatch(/can't go to TUE P2 in CR-1/);
        expect(await db.collection("change_requests").countDocuments()).toBe(0);
        expect(reschedule).not.toHaveBeenCalled();
      });

      it("proposes a free slot with no other move, and repairs on request", async () => {
        const cr = await placeManually(db, COORD, {
          session_id: "C1-L1",
          day: "WED",
          start_period: 4,
          room_id: "CR-1",
          repair: false,
          description: "Closer to lunch",
        });
        expect(cr).toMatchObject({
          kind: "manual_edit",
          status: "pending",
          requested_by_role: "department_coordinator",
          description: "Closer to lunch",
          placements: [
            {
              session_id: "C1-L1",
              day: "WED",
              start_period: 4,
              room_id: "CR-1",
            },
          ],
        });
        expect(reschedule.mock.calls[0][0].options).toEqual({ maxDepth: 0 });
        expect(
          (await getTimetableVersion(db, cr.proposed_version ?? ""))?.source,
        ).toBe("manual");

        // With repair, whatever is in the way moves (here: C1-P1 out of TUE P2).
        const repaired = await placeManually(db, COORD, {
          session_id: "C1-L1",
          day: "TUE",
          start_period: 2,
          room_id: "CR-1",
          repair: true,
        });
        expect(reschedule.mock.calls[1][0].options).toBeUndefined();
        expect(repaired.status).toBe("pending");
        expect(repaired.diff.map((d) => d.session_id)).toEqual([
          "C1-L1",
          "C1-P1",
        ]);

        // Faculty can't place manually; an ECE coordinator can't touch a CSE session.
        for (const user of [FACULTY, ECE_COORD]) {
          await expectApiError(
            placeManually(db, user, {
              session_id: "C1-L1",
              day: "WED",
              start_period: 5,
              room_id: "CR-1",
              repair: false,
            }),
            "FORBIDDEN",
          );
        }

        // Approving applies the placement as given.
        const applied = await approveChange(db, ADMIN, cr.id, {});
        expect(applied.superseded).toEqual([repaired.id]);
        expect(
          (await getActiveTimetableVersion(db))?.assignments.find(
            (a) => a.session_id === "C1-L1",
          ),
        ).toEqual({
          session_id: "C1-L1",
          day: "WED",
          start_period: 4,
          room_id: "CR-1",
        });
        // A placement changes the timetable, not the dataset: the change file is empty.
        expect((await exportDisruption(db)).changes).toEqual([]);
      });
    });
  },
);
