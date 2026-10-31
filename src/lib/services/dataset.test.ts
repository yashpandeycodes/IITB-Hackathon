import type { Db } from "mongodb";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getBundledDataset } from "@/lib/dataset";
import { COLLECTION_NAMES } from "@/lib/db/collections";
import { ensureIndexes } from "@/lib/db/indexes";
import { listAuditLog } from "@/lib/db/repos/audit-log";
import { getDatasetMeta, getDatasetRaw } from "@/lib/db/repos/datasets";
import {
  getBookingRequest,
  getRoom,
  listRoomUnavailability,
} from "@/lib/db/repos/reference";
import { getStoredSettings, saveSettings } from "@/lib/db/repos/settings";
import { openTestDb } from "@/lib/db/repos/test-db";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import {
  buildReferenceDocs,
  completePriorityOrder,
  getActiveDataset,
  getActiveDatasetId,
  getDatasetForExport,
  importDataset,
  validateDataset,
} from "./dataset";
import { seedTinyWorkingState, tinyDataset } from "./test-fixtures";

const testDb = await openTestDb("dataset.test");

afterAll(async () => {
  await testDb?.cleanup();
});

describe("dataset helpers", () => {
  it("reports invalid files as VALIDATION_ERROR with dotted paths", () => {
    const bad = structuredClone(tinyDataset()) as Record<string, unknown>;
    (bad.sessions as { duration: unknown }[])[1].duration = "long";
    delete bad.rooms;
    try {
      validateDataset(bad);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
      const details = (err as { details: { issues: { path: string }[] } })
        .details;
      const paths = details.issues.map((i) => i.path);
      expect(paths).toContain("rooms");
      expect(paths).toContain("sessions.1.duration");
    }
  });

  it("derives lab departments, request states and unique unavailability ids", () => {
    const dataset = validateDataset({
      ...tinyDataset(),
      room_unavailability: [
        { room_id: "CR-1", day: "THU", periods: [1, 2] },
        { room_id: "CR-1", day: "THU", periods: [1, 2] },
      ],
      cancellations: [{ request_id: "BR-03" }, { request_id: "BR-03" }],
    });
    const { docs, duplicate_cancellations } = buildReferenceDocs(dataset);
    expect(docs.rooms.map((r) => [r.id, r.department])).toEqual([
      ["AUD", null],
      ["LH-1", null],
      ["CR-1", null],
      ["CS-LAB", "CSE"],
    ]);
    expect(docs.booking_requests.map((r) => r.state)).toEqual([
      "submitted",
      "submitted",
      "cancelled",
    ]);
    expect(docs.booking_requests[0]).toMatchObject({
      source: "dataset",
      created_by: null,
    });
    const ids = docs.room_unavailability.map((u) => u._id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toMatch(/^CR-1:THU:[0-9a-f]{8}$/);
    expect(duplicate_cancellations).toEqual(["BR-03"]);
    expect(docs.cancellations).toHaveLength(1);
  });

  it("completes a partial priority order", () => {
    expect(completePriorityOrder(["club_event", "exam"])).toEqual([
      "club_event",
      "exam",
      "regular_session",
      "institute_event",
      "guest_lecture",
      "department_event",
    ]);
  });
});

describe.skipIf(!testDb)("dataset service (MongoDB)", () => {
  const db = testDb?.db as Db;

  beforeEach(async () => {
    for (const name of COLLECTION_NAMES) {
      await db.collection(name).deleteMany({});
    }
    await ensureIndexes(db);
  });

  it("falls back to the bundled dataset when nothing is imported", async () => {
    expect(await getActiveDataset(db)).toBe(getBundledDataset());
    expect(await getActiveDatasetId(db)).toBe("cit-public-v1");
  });

  it("imports the bundled dataset and reads it back unchanged", async () => {
    const report = await importDataset(db, getBundledDataset(), "bundled");
    expect(report).toMatchObject({
      dataset_id: "cit-public-v1",
      source: "bundled",
      counts: {
        rooms: 27,
        room_unavailability: 2,
        faculty: 40,
        student_groups: 14,
        courses: 62,
        sessions: 189,
        exams: 41,
        booking_requests: 25,
        cancellations: 1,
      },
      duplicate_cancellations: [],
    });
    const active = await getActiveDataset(db);
    expect(active).toEqual(getBundledDataset());
    expect(active.sessions.map((s) => s.id)).toEqual(
      getBundledDataset().sessions.map((s) => s.id),
    );
    expect(await getActiveDatasetId(db)).toBe("cit-public-v1");
    expect(await getRoom(db, "CS-LAB-1")).toMatchObject({ department: "CSE" });
    expect(await getBookingRequest(db, "BR-04")).toMatchObject({
      state: "cancelled",
    });
  });

  it("is idempotent: importing twice leaves the same data", async () => {
    const first = await importDataset(db, tinyDataset(), "upload");
    const snapshot = await getActiveDataset(db);
    const second = await importDataset(db, tinyDataset(), "upload");
    expect(second.counts).toEqual(first.counts);
    expect(await getActiveDataset(db)).toEqual(snapshot);
    expect(await db.collection("datasets").countDocuments()).toBe(1);
    expect(await db.collection("sessions").countDocuments()).toBe(3);
    expect(await listRoomUnavailability(db)).toHaveLength(1);
  });

  it("stores the original JSON and replaces a previous dataset", async () => {
    await importDataset(db, getBundledDataset(), "bundled");
    const input = tinyDataset();
    await importDataset(db, input, "upload", { actor: "u_admin" });
    expect(await getDatasetRaw(db)).toEqual({ raw: input, source: "upload" });
    expect(await getDatasetMeta(db)).toMatchObject({
      dataset_id: "tiny-v1",
      institute: "Tiny Institute",
      source: "upload",
    });
    expect(await db.collection("datasets").countDocuments()).toBe(1);
    expect(await db.collection("rooms").countDocuments()).toBe(4);
    const [entry] = await listAuditLog(db);
    expect(entry).toMatchObject({
      actor: "u_admin",
      action: "import",
      entity: "datasets",
      entity_id: "tiny-v1",
    });
  });

  it("clears derived working state and resets the priority order", async () => {
    await importDataset(db, tinyDataset(), "upload");
    await seedTinyWorkingState(db);
    await saveSettings(db, {
      team: "T",
      priority_order: completePriorityOrder(["club_event"]),
      llm_enabled: true,
      reference_date: "2027-02-08",
      solver_seed: 1,
    });
    const report = await importDataset(db, tinyDataset(), "upload");
    expect(report.cleared).toMatchObject({
      timetable_versions: 1,
      booking_decisions: 3,
      session_overrides: 1,
    });
    expect(await getActiveTimetableVersion(db)).toBeNull();
    expect((await getStoredSettings(db))?.priority_order).toEqual(
      getBundledDataset().priority_order,
    );
  });

  it("rejects dangling references with their paths", async () => {
    const bad = tinyDataset();
    bad.sessions[0].faculty_id = "F404";
    bad.booking_requests[1].mandatory_for_groups = ["G404"];
    const err = await importDataset(db, bad, "upload").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "VALIDATION_ERROR" });
    const { issues } = (err as { details: { issues: { path: string }[] } })
      .details;
    expect(issues.map((i) => i.path).sort()).toEqual([
      "booking_requests.1.mandatory_for_groups.0",
      "sessions.0.faculty_id",
    ]);
  });

  it("keeps app-submitted requests out of the export dataset", async () => {
    await importDataset(db, tinyDataset(), "upload");
    const at = "2027-02-05T10:00:00+05:30";
    await db.collection("booking_requests").insertOne({
      ...tinyDataset().booking_requests[0],
      _id: "REQ-1",
      id: "REQ-1",
      seq: 99,
      state: "submitted",
      source: "form",
      created_by: "u_club",
      created_at: at,
      updated_at: at,
    } as never);
    await db.collection("cancellations").insertOne({
      _id: "REQ-1",
      request_id: "REQ-1",
      seq: 99,
      origin: "manual",
      created_at: at,
      updated_at: at,
    } as never);

    const all = await getActiveDataset(db);
    expect(all.booking_requests.map((r) => r.id)).toEqual([
      "BR-01",
      "BR-02",
      "BR-03",
      "REQ-1",
    ]);
    expect(all.cancellations.map((c) => c.request_id)).toEqual([
      "BR-03",
      "REQ-1",
    ]);

    const exported = await getDatasetForExport(db);
    expect(exported.booking_requests.map((r) => r.id)).toEqual([
      "BR-01",
      "BR-02",
      "BR-03",
    ]);
    expect(exported.cancellations.map((c) => c.request_id)).toEqual(["BR-03"]);
    expect(await getActiveDataset(db, { origin: "dataset" })).toEqual(exported);
  });

  it("rejects an invalid upload without touching the stored data", async () => {
    await importDataset(db, tinyDataset(), "upload");
    await expect(
      importDataset(db, { dataset_id: "x" }, "upload"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await getActiveDatasetId(db)).toBe("tiny-v1");
  });
});
