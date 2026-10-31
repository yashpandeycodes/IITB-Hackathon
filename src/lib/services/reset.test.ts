import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ResetReportSchema } from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { COLLECTION_NAMES } from "@/lib/db/collections";
import { listAuditLog } from "@/lib/db/repos/audit-log";
import { getStoredSettings } from "@/lib/db/repos/settings";
import { openTestDb } from "@/lib/db/repos/test-db";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { getActiveDatasetId, importDataset } from "./dataset";
import { postResetPipeline, resetDemo } from "./reset";
import { defaultSettings, getSettings, updateSettings } from "./settings";
import { seedTinyWorkingState, tinyDataset } from "./test-fixtures";

const testDb = await openTestDb("reset.test");

afterAll(async () => {
  await testDb?.cleanup();
});

async function counts(db: Db): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const name of COLLECTION_NAMES) {
    out[name] = await db.collection(name).countDocuments();
  }
  return out;
}

describe("defaultSettings", () => {
  it("takes the dataset order and the environment defaults", () => {
    const settings = defaultSettings(getBundledDataset().priority_order);
    expect(settings).toEqual({
      team: expect.any(String),
      priority_order: getBundledDataset().priority_order,
      llm_enabled: expect.any(Boolean),
      reference_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      solver_seed: expect.any(Number),
    });
  });

  it("has a no-op post-reset pipeline for now", async () => {
    await expect(
      postResetPipeline({
        db: {} as Db,
        dataset: getBundledDataset(),
        settings: defaultSettings(getBundledDataset().priority_order),
        actor: "system",
      }),
    ).resolves.toEqual({
      timetable_version: null,
      exam_schedule_id: null,
      decisions: 0,
    });
  });
});

describe.skipIf(!testDb)("resetDemo (MongoDB)", () => {
  const db = testDb?.db as Db;

  beforeAll(async () => {
    for (const name of COLLECTION_NAMES) {
      await db.collection(name).deleteMany({});
    }
  });

  it("loads the bundled dataset, users and settings on an empty database", async () => {
    const report = await resetDemo(db, { actor: "u_admin" });
    expect(ResetReportSchema.parse(report)).toEqual(report);
    expect(report).toMatchObject({
      timetable_version: null,
      exam_schedule_id: null,
      decisions: 0,
      dataset: { dataset_id: "cit-public-v1", source: "bundled" },
      users: { inserted: 4, updated: 0 },
    });
    expect(report.dataset.counts.sessions).toBe(189);
    expect(report.settings.priority_order).toEqual(
      getBundledDataset().priority_order,
    );
    expect(await getStoredSettings(db)).toEqual(report.settings);
    expect(await db.collection("users").countDocuments()).toBe(4);
    const [entry] = await listAuditLog(db);
    expect(entry).toMatchObject({ actor: "u_admin", action: "reset" });
  });

  it("is idempotent", async () => {
    const before = await counts(db);
    const report = await resetDemo(db);
    expect(report.users).toEqual({ inserted: 0, updated: 0 });
    const after = await counts(db);
    // Only the audit log grows (one entry per reset).
    expect({ ...after, audit_log: 0 }).toEqual({ ...before, audit_log: 0 });
    expect(after.audit_log).toBe(before.audit_log + 1);
  });

  it("wipes working state and settings edits", async () => {
    await seedTinyWorkingState(db);
    await updateSettings(db, { team: "Edited", llm_enabled: false }, "u_admin");
    const report = await resetDemo(db);
    expect(report.cleared).toMatchObject({
      timetable_versions: 1,
      booking_decisions: 3,
      session_overrides: 1,
      settings: 1,
    });
    expect(await getActiveTimetableVersion(db)).toBeNull();
    expect((await getSettings(db)).team).not.toBe("Edited");
  });

  it("restores the bundled dataset by default and the upload on request", async () => {
    await importDataset(db, tinyDataset(), "upload");
    const stored = await resetDemo(db, { from: "stored" });
    expect(stored.dataset).toMatchObject({
      dataset_id: "tiny-v1",
      source: "upload",
    });
    expect(await getActiveDatasetId(db)).toBe("tiny-v1");

    const bundled = await resetDemo(db);
    expect(bundled.dataset).toMatchObject({
      dataset_id: "cit-public-v1",
      source: "bundled",
    });
    expect(await getActiveDatasetId(db)).toBe("cit-public-v1");
  });

  it("validates a stored upload before deleting anything", async () => {
    await importDataset(db, tinyDataset(), "upload");
    await seedTinyWorkingState(db);
    await updateSettings(db, { team: "Keep me" }, "u_admin");
    // The stored copy no longer parses (e.g. written before reference checks existed).
    await db
      .collection("datasets")
      .updateOne({}, { $set: { "raw.sessions.0.faculty_id": "F404" } });
    const before = await counts(db);

    const err = await resetDemo(db, { from: "stored" }).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(
      (err as { details: { issues: { path: string }[] } }).details.issues,
    ).toEqual([
      { path: "sessions.0.faculty_id", message: 'Unknown faculty "F404"' },
    ]);
    expect(await counts(db)).toEqual(before);
    expect(await getActiveTimetableVersion(db)).not.toBeNull();
    expect((await getSettings(db)).team).toBe("Keep me");
    expect(await db.collection("locks").countDocuments()).toBe(0);
  });

  it("lets one of several concurrent resets or imports run; the rest get CONFLICT", async () => {
    const results = await Promise.allSettled([
      resetDemo(db),
      resetDemo(db),
      resetDemo(db),
      importDataset(db, tinyDataset(), "upload"),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.flatMap((r) =>
      r.status === "rejected" ? [r.reason] : [],
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    for (const reason of rejected) {
      expect(reason).toMatchObject({ code: "CONFLICT", status: 409 });
    }
    // The lock is released afterwards, so the next reset runs normally.
    await expect(resetDemo(db)).resolves.toMatchObject({
      dataset: { dataset_id: "cit-public-v1" },
    });
    expect(await db.collection("locks").countDocuments()).toBe(0);
  });

  it("takes over a lock whose holder never released it", async () => {
    await db.collection<{ _id: string }>("locks").insertOne({
      _id: "dataset",
      token: "crashed",
      acquired_at: new Date(0),
      expires_at: new Date(0),
    } as never);
    await expect(resetDemo(db)).resolves.toBeDefined();
  });
});

describe.skipIf(!testDb)("settings service (MongoDB)", () => {
  const db = testDb?.db as Db;

  it("returns defaults before anything is saved", async () => {
    await db.collection("settings").deleteMany({});
    const settings = await getSettings(db);
    expect(settings.priority_order).toHaveLength(6);
    expect(await getStoredSettings(db)).toBeNull();
  });

  it("applies a patch and audits it", async () => {
    const order = [...getBundledDataset().priority_order].reverse();
    const updated = await updateSettings(
      db,
      { priority_order: order, solver_seed: 9 },
      "u_admin",
    );
    expect(updated).toMatchObject({ priority_order: order, solver_seed: 9 });
    expect(await getSettings(db)).toEqual(updated);
    const [entry] = await listAuditLog(db, { entity: "settings" });
    expect(entry).toMatchObject({
      actor: "u_admin",
      action: "update",
      entity_id: "app",
      after: updated,
    });
  });
});
