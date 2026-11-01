/**
 * Approval failures and recovery (`change-apply.ts`, `activateTimetableUnlocked`): a failure is
 * injected at each write of the apply step (a dataset write midway, the switch of the active
 * version, the Spectra save, the audit entries), and the end state must be consistent either way:
 * fully applied (the request `applied`, its version the only active one, the stored dataset with
 * its changes, Spectra decided for that version) or fully rolled back (the request `pending`, the
 * previous version the only active one, the dataset, Spectra state and baseline exactly as before).
 * Also: change writes while another run holds the dataset lock. Same setup as `changes.test.ts`
 * (tiny dataset, fake rescheduler, Phase-3 Spectra / exam fakes); the repositories are the real
 * ones behind pass-through mocks.
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
vi.mock("@/lib/db/repos/audit-log", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/db/repos/audit-log")>();
  return { ...actual, appendAuditLog: vi.fn(actual.appendAuditLog) };
});
vi.mock("@/lib/db/repos/timetable-versions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/db/repos/timetable-versions")>();
  return {
    ...actual,
    activateTimetableVersion: vi.fn(actual.activateTimetableVersion),
  };
});
vi.mock("@/lib/db/repos/reference", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/db/repos/reference")>();
  return { ...actual, markSessionsRemoved: vi.fn(actual.markSessionsRemoved) };
});
vi.mock("./spectra", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./spectra")>();
  return { ...actual, saveSpectraUnlocked: vi.fn(actual.saveSpectraUnlocked) };
});

import type {
  ChangeProposalRequestInput,
  ChangeRequest,
  Dataset,
  SessionUser,
} from "@/lib/contracts";
import * as engine from "@/lib/engine";
import { applyDisruption } from "@/lib/engine/disruption";
import { COLLECTION_NAMES } from "@/lib/db/collections";
import { acquireDatasetLock } from "@/lib/db/locks";
import * as audit from "@/lib/db/repos/audit-log";
import { getBaseline } from "@/lib/db/repos/baselines";
import {
  listBookingDecisions,
  replaceBookingDecisions,
} from "@/lib/db/repos/booking-decisions";
import { getChangeRequest } from "@/lib/db/repos/change-requests";
import * as reference from "@/lib/db/repos/reference";
import {
  listSessionOverrides,
  replaceSessionOverrides,
} from "@/lib/db/repos/session-overrides";
import { openTestDb } from "@/lib/db/repos/test-db";
import * as versions from "@/lib/db/repos/timetable-versions";
import { isApiError } from "@/lib/errors";
import { applyChangesToDataset, approveChange } from "./change-apply";
import {
  fakeCheckPlacement,
  fakeDescribeChanges,
  fakeReschedule,
  fakeValidateChanges,
  proposal,
  tinyTutorial,
} from "./change-test-fixtures";
import { CHANGE_LOCK, proposeChange, rejectChange } from "./changes";
import { getActiveDataset, importDataset } from "./dataset";
import { generateExams } from "./exams";
import * as spectra from "./spectra";
import {
  TINY_ASSIGNMENTS,
  USERS,
  ZERO_SOFT,
  fakeDecideBookings,
  fakeScheduleExams,
  phase3Dataset,
} from "./test-fixtures";
import { activateTimetable, activateTimetableUnlocked } from "./timetable";

const actual = {
  audit: await vi.importActual<typeof import("@/lib/db/repos/audit-log")>(
    "@/lib/db/repos/audit-log",
  ),
  versions: await vi.importActual<
    typeof import("@/lib/db/repos/timetable-versions")
  >("@/lib/db/repos/timetable-versions"),
  reference: await vi.importActual<typeof import("@/lib/db/repos/reference")>(
    "@/lib/db/repos/reference",
  ),
  spectra: await vi.importActual<typeof import("./spectra")>("./spectra"),
};
const appendAuditLog = vi.mocked(audit.appendAuditLog);
const activateTimetableVersion = vi.mocked(versions.activateTimetableVersion);
const markSessionsRemoved = vi.mocked(reference.markSessionsRemoved);
const saveSpectraUnlocked = vi.mocked(spectra.saveSpectraUnlocked);

const testDb = await openTestDb("change-apply.test");
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

const ADMIN: SessionUser = USERS.admin;
const COORD: SessionUser = USERS.coordinator;

beforeEach(() => {
  vi.restoreAllMocks(); // console spies
  vi.mocked(engine.reschedule).mockReset().mockImplementation(fakeReschedule);
  vi.mocked(engine.validateChanges)
    .mockReset()
    .mockImplementation(fakeValidateChanges);
  vi.mocked(engine.describeChanges)
    .mockReset()
    .mockImplementation(fakeDescribeChanges);
  vi.mocked(engine.checkPlacement)
    .mockReset()
    .mockImplementation(fakeCheckPlacement);
  vi.mocked(engine.decideBookings)
    .mockReset()
    .mockImplementation(fakeDecideBookings);
  vi.mocked(engine.scheduleExams)
    .mockReset()
    .mockImplementation(fakeScheduleExams);
  appendAuditLog.mockReset().mockImplementation(actual.audit.appendAuditLog);
  activateTimetableVersion
    .mockReset()
    .mockImplementation(actual.versions.activateTimetableVersion);
  markSessionsRemoved
    .mockReset()
    .mockImplementation(actual.reference.markSessionsRemoved);
  saveSpectraUnlocked
    .mockReset()
    .mockImplementation(actual.spectra.saveSpectraUnlocked);
});

const silenceConsole = () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
};

/** An empty database with the tiny dataset loaded, TINY_ASSIGNMENTS active and exams scheduled. */
async function fresh(): Promise<string> {
  for (const name of COLLECTION_NAMES) {
    await db.collection(name).deleteMany({});
  }
  await importDataset(db, phase3Dataset(), "upload");
  const version = await versions.insertTimetableVersion(db, {
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

type ChangeInput = NonNullable<ChangeProposalRequestInput["changes"]>[number];

const F1_MONDAY = {
  type: "faculty_unavailable",
  faculty_id: "F1",
  days: ["MON"],
  periods: [1],
} satisfies ChangeInput;

/** Every change type at once, in the order `applyChangesToDataset` writes them. */
const EVERY_TYPE: ChangeInput[] = [
  F1_MONDAY,
  {
    type: "add_faculty",
    faculty: { id: "F3", name: "Dr. Three", department: "CSE" },
  },
  {
    type: "room_unavailable",
    room_id: "CR-1",
    days: ["WED"],
    periods: [2],
  },
  { type: "remove_session", session_id: "C1-P1" },
  { type: "add_session", session: tinyTutorial("C1-T1", "F3") },
];

/** Everything an approval may write, for exact before/after comparisons. */
async function storedState() {
  const reference: Record<string, unknown[]> = {};
  for (const name of ["faculty", "sessions", "room_unavailability"]) {
    reference[name] = await db
      .collection(name)
      .find({}, { sort: { _id: 1 } })
      .toArray();
  }
  const requests = await db
    .collection("booking_requests")
    .find({}, { sort: { _id: 1 }, projection: { state: 1, approval: 1 } })
    .toArray();
  return {
    reference,
    dataset: await getActiveDataset(db),
    decisions: await listBookingDecisions(db),
    overrides: await listSessionOverrides(db),
    requests,
  };
}
type StoredState = Awaited<ReturnType<typeof storedState>>;

async function activeIds(): Promise<string[]> {
  return (
    await db
      .collection("timetable_versions")
      .find({ status: "active" }, { projection: { _id: 1 } })
      .toArray()
  ).map((doc) => String(doc._id));
}

/** Rolled back: exactly as `before`, `base` the only active version, the request still pending. */
async function expectRolledBack(
  before: StoredState,
  base: string,
  cr: ChangeRequest,
) {
  const now = await storedState();
  expect(now.reference).toEqual(before.reference);
  expect(now.dataset).toEqual(before.dataset);
  expect(now.decisions).toEqual(before.decisions);
  expect(now.overrides).toEqual(before.overrides);
  expect(now.requests).toEqual(before.requests);
  expect(await activeIds()).toEqual([base]);
  expect((await getChangeRequest(db, cr.id))?.status).toBe("pending");
  expect(await getBaseline(db)).toBeNull();
}

/** Applied: the request's version the only active one, the dataset changed, Spectra decided for it. */
async function expectApplied(before: StoredState, cr: ChangeRequest) {
  const live = cr.proposed_version as string;
  expect(await activeIds()).toEqual([live]);
  expect(await getActiveDataset(db)).toEqual(
    applyDisruption(before.dataset as Dataset, { changes: cr.changes }),
  );
  const decisions = await listBookingDecisions(db);
  expect(decisions.length).toBe(before.decisions.length);
  expect(new Set(decisions.map((d) => d.timetable_version))).toEqual(
    new Set([live]),
  );
  expect(await getChangeRequest(db, cr.id)).toMatchObject({
    status: "applied",
    approved_by: ADMIN.id,
  });
  const doc = await db
    .collection("change_requests")
    .findOne({ _id: cr.id as never });
  expect(doc?.applied_seq).toBe(1);
  expect((await getBaseline(db))?.change_request_id).toBe(cr.id);
}

/** A rejecting stand-in for an async repository or service function. */
const fail = (what: string) => async () => {
  throw new Error(`simulated ${what} failure`);
};

describe.skipIf(!testDb)(
  "approval failures (MongoDB, fake rescheduler)",
  { timeout: 60_000 },
  () => {
    let base: string;
    let before: StoredState;
    let cr: ChangeRequest;
    /** Another pending proposal on the same base (superseded only by a finished approval). */
    let other: ChangeRequest;
    beforeEach(async () => {
      base = await fresh();
      before = await storedState();
      cr = await proposeChange(
        db,
        ADMIN,
        proposal({ kind: "disruption", changes: EVERY_TYPE }),
      );
      other = await proposeChange(
        db,
        COORD,
        proposal({ kind: "unavailability", changes: [F1_MONDAY] }),
      );
      expect([cr.status, other.status]).toEqual(["pending", "pending"]);
      // Count only the approval's own calls.
      for (const mock of [
        appendAuditLog,
        activateTimetableVersion,
        markSessionsRemoved,
        saveSpectraUnlocked,
      ]) {
        mock.mockClear();
      }
    });

    const expectOtherPending = async () =>
      expect((await getChangeRequest(db, other.id))?.status).toBe("pending");
    const approveAgain = async () =>
      expect((await approveChange(db, ADMIN, cr.id, {})).change.status).toBe(
        "applied",
      );

    it("rolls the dataset back exactly when a write fails midway (after the faculty writes)", async () => {
      silenceConsole();
      markSessionsRemoved.mockImplementationOnce(fail("session write"));
      await expect(approveChange(db, ADMIN, cr.id, {})).rejects.toThrow(
        "simulated session write failure",
      );
      expect(markSessionsRemoved).toHaveBeenCalledTimes(1);
      expect(activateTimetableVersion).not.toHaveBeenCalled();
      await expectRolledBack(before, base, cr);
      await expectOtherPending();
      await approveAgain();
    });

    it("rolls back when the switch fails between superseding the old version and activating the new one", async () => {
      silenceConsole();
      activateTimetableVersion.mockImplementationOnce(async (database) => {
        await database
          .collection("timetable_versions")
          .updateMany({ status: "active" }, { $set: { status: "superseded" } });
        throw new Error("simulated failure after superseding");
      });
      await expect(approveChange(db, ADMIN, cr.id, {})).rejects.toThrow(
        "simulated failure after superseding",
      );
      await expectRolledBack(before, base, cr);
      await expectOtherPending();
      await approveAgain();
    });

    it("re-activates the previous version itself when the activation couldn't put it back", async () => {
      silenceConsole();
      activateTimetableVersion
        .mockImplementationOnce(async (database) => {
          await database
            .collection("timetable_versions")
            .updateMany(
              { status: "active" },
              { $set: { status: "superseded" } },
            );
          throw new Error("simulated failure after superseding");
        })
        .mockImplementationOnce(fail("restore"));
      await expect(approveChange(db, ADMIN, cr.id, {})).rejects.toThrow(
        "simulated failure after superseding",
      );
      expect(activateTimetableVersion.mock.calls.map((c) => c[1])).toEqual([
        cr.proposed_version,
        base, // the activation's own restore (failed)
        base, // the approval's
      ]);
      await expectRolledBack(before, base, cr);
      await approveAgain();
    });

    it("puts the previous Spectra decisions back when saving the new ones fails midway", async () => {
      silenceConsole();
      saveSpectraUnlocked.mockImplementationOnce(async (database, plan) => {
        await replaceBookingDecisions(database, plan.decisions);
        await replaceSessionOverrides(database, plan.overrides);
        throw new Error("simulated Spectra save failure");
      });
      await expect(approveChange(db, ADMIN, cr.id, {})).rejects.toThrow(
        "simulated Spectra save failure",
      );
      // The half-saved decisions were for the proposed version; the previous ones are back.
      await expectRolledBack(before, base, cr);
      await expectOtherPending();
      await approveAgain();
    });

    it("finishes the approval when the Spectra save fails and the previous version can't be restored", async () => {
      silenceConsole();
      saveSpectraUnlocked.mockImplementationOnce(async (database, plan) => {
        await replaceBookingDecisions(database, plan.decisions);
        throw new Error("simulated Spectra save failure");
      });
      activateTimetableVersion
        .mockImplementationOnce(actual.versions.activateTimetableVersion)
        .mockImplementationOnce(fail("restore"));
      const result = await approveChange(db, ADMIN, cr.id, {});
      expect(result).toMatchObject({
        version_id: cr.proposed_version,
        superseded: [other.id],
        change: { status: "applied" },
      });
      // Spectra was decided again for the live version.
      await expectApplied(before, cr);
      expect((await getChangeRequest(db, other.id))?.status).toBe("rejected");
    });

    it("finishes the approval when only the audit entries after the switch fail", async () => {
      silenceConsole();
      appendAuditLog.mockImplementation((database, entry) =>
        ["activate", "approve", "apply", "supersede"].includes(entry.action)
          ? Promise.reject(new Error("simulated audit failure"))
          : actual.audit.appendAuditLog(database, entry),
      );
      const result = await approveChange(db, ADMIN, cr.id, {});
      expect(result).toMatchObject({
        version_id: cr.proposed_version,
        superseded: [other.id],
        change: { status: "applied" },
      });
      await expectApplied(before, cr);
      expect(await getChangeRequest(db, other.id)).toMatchObject({
        status: "rejected",
        comment: `Superseded by ${cr.id}`,
      });
    });

    it("records an approval whose proposal went live but was never marked applied", async () => {
      silenceConsole();
      // As if an earlier approval stopped right after activating (before marking the request).
      await applyChangesToDataset(
        db,
        before.dataset as Dataset,
        cr.changes,
        cr.id,
      );
      await activateTimetableUnlocked(db, cr.proposed_version as string, "x", {
        changeRequestId: cr.id,
      });
      expect((await getChangeRequest(db, cr.id))?.status).toBe("pending");
      const result = await approveChange(db, ADMIN, cr.id, {});
      expect(result).toMatchObject({
        version_id: cr.proposed_version,
        superseded: [other.id],
        change: { status: "applied" },
      });
      expect(await activeIds()).toEqual([cr.proposed_version]);
    });

    it("keeps a direct activation consistent: a failed switch restores the previous version, a failed audit doesn't fail it", async () => {
      silenceConsole();
      const draft = await versions.insertTimetableVersion(db, {
        dataset_id: "tiny-v1",
        status: "draft",
        source: "generate",
        parent_version: base,
        change_request_id: null,
        assignments: TINY_ASSIGNMENTS,
        hard_violation_count: 0,
        soft_penalty: ZERO_SOFT,
        solver_meta: null,
        created_by: ADMIN.id,
      });
      saveSpectraUnlocked.mockImplementationOnce(async (database, plan) => {
        await replaceBookingDecisions(database, plan.decisions);
        throw new Error("simulated Spectra save failure");
      });
      await expect(activateTimetable(db, draft.id, ADMIN.id)).rejects.toThrow(
        "simulated Spectra save failure",
      );
      expect(await activeIds()).toEqual([base]);
      expect(await listBookingDecisions(db)).toEqual(before.decisions);
      await expectOtherPending(); // nothing was activated, so nothing went stale

      appendAuditLog.mockImplementation((database, entry) =>
        entry.action === "activate"
          ? Promise.reject(new Error("simulated audit failure"))
          : actual.audit.appendAuditLog(database, entry),
      );
      const activated = await activateTimetable(db, draft.id, ADMIN.id);
      expect(activated.version.status).toBe("active");
      expect(await activeIds()).toEqual([draft.id]);
      expect((await getChangeRequest(db, other.id))?.status).toBe("rejected");
    });
  },
);

describe.skipIf(!testDb)(
  "change writes under a held dataset lock",
  { timeout: 60_000 },
  () => {
    it("answers 409 CONFLICT to propose, approve and reject while the lock is held", async () => {
      await fresh();
      const cr = await proposeChange(
        db,
        ADMIN,
        proposal({ kind: "disruption", changes: [F1_MONDAY] }),
      );
      const release = await acquireDatasetLock(db);
      let results: PromiseSettledResult<unknown>[];
      try {
        results = await Promise.allSettled([
          proposeChange(
            db,
            ADMIN,
            proposal({ kind: "disruption", changes: [F1_MONDAY] }),
          ),
          approveChange(db, ADMIN, cr.id, {}),
          rejectChange(db, ADMIN, cr.id, {}),
        ]);
      } finally {
        await release();
      }
      for (const result of results) {
        expect(result.status).toBe("rejected");
        const reason = (result as PromiseRejectedResult).reason as unknown;
        expect(isApiError(reason) && reason.code).toBe("CONFLICT");
        expect((reason as Error).message).toBe(CHANGE_LOCK.busyMessage);
      }
      expect((await getChangeRequest(db, cr.id))?.status).toBe("pending");
      expect(await db.collection("change_requests").countDocuments()).toBe(1);
      // Free again: the same approval goes through.
      expect((await approveChange(db, ADMIN, cr.id, {})).change.status).toBe(
        "applied",
      );
    });
  },
);
