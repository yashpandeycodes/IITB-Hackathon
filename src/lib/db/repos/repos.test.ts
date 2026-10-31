import type { Db } from "mongodb";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type {
  ChangeRequest,
  SoftPenaltySummary,
  StoredBookingDecision,
  StoredSessionOverride,
} from "@/lib/contracts";
import { COLLECTION_NAMES } from "../collections";
import { ensureIndexes, INDEXES } from "../indexes";
import { appendAuditLog, listAuditLog } from "./audit-log";
import {
  countBookingDecisionsByStatus,
  getBookingDecision,
  listBookingDecisions,
  listDecidedRequestIds,
  replaceBookingDecisions,
  upsertBookingDecision,
} from "./booking-decisions";
import {
  countChangeRequestsByStatus,
  getChangeRequest,
  insertChangeRequest,
  listChangeRequests,
  updateChangeRequest,
  type NewChangeRequest,
} from "./change-requests";
import {
  activateExamSchedule,
  getActiveExamSchedule,
  insertExamSchedule,
} from "./exam-schedules";
import { nowIso, stripMeta } from "./meta";
import {
  getRoom,
  listRooms,
  listSessions,
  replaceReferenceData,
  type ReferenceDocs,
} from "./reference";
import {
  countSessionOverrides,
  deleteSessionOverridesFor,
  listSessionOverrides,
  replaceSessionOverrides,
  upsertSessionOverride,
} from "./session-overrides";
import { getStoredSettings, saveSettings } from "./settings";
import { clearSpectraState } from "./spectra";
import { openTestDb } from "./test-db";
import {
  activateTimetableVersion,
  getActiveTimetableVersion,
  getTimetableVersion,
  insertTimetableVersion,
  listTimetableVersions,
  type NewTimetableVersion,
} from "./timetable-versions";

const testDb = await openTestDb("repos.test");

afterAll(async () => {
  await testDb?.cleanup();
});

const ZERO_SOFT: SoftPenaltySummary = {
  S1: 0,
  S2: 0,
  S3: 0,
  S4: 0,
  S5: 0,
  S6: 0,
  total: 0,
};

const draftVersion = (
  overrides: Partial<NewTimetableVersion> = {},
): NewTimetableVersion => ({
  dataset_id: "cit-public-v1",
  status: "draft",
  source: "generate",
  parent_version: null,
  change_request_id: null,
  assignments: [
    { session_id: "S1", day: "MON", start_period: 1, room_id: "R1" },
  ],
  hard_violation_count: 0,
  soft_penalty: ZERO_SOFT,
  solver_meta: { seed: 42, ms: 10, algorithm: "test" },
  created_by: "u_admin",
  ...overrides,
});

const decision = (
  request_id: string,
  status: StoredBookingDecision["status"],
): StoredBookingDecision => ({
  request_id,
  status,
  ...(status === "rejected"
    ? {}
    : { day: "THU", start_period: 10, end_period: 12, room_id: "AUD" }),
  reason: status === "approved" ? "" : "Because.",
  reason_code:
    status === "rejected" ? "REJ_OUTRANKED" : "APPROVED_AS_REQUESTED",
  effective_category: "club_event",
  category_capped: false,
  auto: true,
  decided_by: "engine",
  approved_by: null,
  timetable_version: "TT-0001",
  decided_at: "2027-02-05T10:02:00+05:30",
});

const override: StoredSessionOverride = {
  session_id: "S1",
  day: "THU",
  start_period: 2,
  room_id: "LH-1",
  displaced_by: "BR-07",
  approved_by: null,
  timetable_version: "TT-0001",
};

const changeRequest = (requested_by = "u_coord"): NewChangeRequest => ({
  kind: "disruption",
  requested_by,
  changes: [{ type: "remove_session", session_id: "S1" }],
  base_version: "TT-0001",
  proposed_version: null,
  status: "pending",
  diff: [],
  moved_count: 0,
  time_changed: 0,
  room_only_changed: 0,
  soft_delta: 0,
  hard_violation_count: 0,
  conflicts: [],
  nl_prompt: null,
  approved_by: null,
  decided_at: null,
  comment: null,
});

describe("meta helpers", () => {
  it("formats timestamps in IST", () => {
    expect(nowIso(new Date("2027-02-05T04:30:00Z"))).toBe(
      "2027-02-05T10:00:00+05:30",
    );
  });

  it("strips Mongo-only metadata, keeping requested keys", () => {
    const doc = {
      _id: "x",
      id: "x",
      created_at: "a",
      updated_at: "b",
      origin: "dataset" as const,
    };
    expect(stripMeta(doc)).toEqual({ id: "x" });
    expect(stripMeta(doc, ["created_at"])).toEqual({
      id: "x",
      created_at: "a",
    });
  });
});

describe.skipIf(!testDb)("repositories (MongoDB)", () => {
  const db = testDb?.db as Db;

  beforeEach(async () => {
    for (const name of COLLECTION_NAMES)
      await db.collection(name).deleteMany({});
    await ensureIndexes(db);
  });

  it("ensureIndexes is idempotent and covers the architecture indexes", async () => {
    await ensureIndexes(db);
    const versionIndexes = await db
      .collection("timetable_versions")
      .listIndexes()
      .toArray();
    const active = versionIndexes.find((i) => i.name === "one_active_version");
    expect(active).toMatchObject({
      unique: true,
      partialFilterExpression: { status: "active" },
    });
    for (const [name, specs] of Object.entries(INDEXES)) {
      const names = (await db.collection(name).listIndexes().toArray()).map(
        (i) => i.name,
      );
      for (const spec of specs ?? []) expect(names).toContain(spec.name);
    }
  });

  it("creates the indexes lazily before a versioned write", async () => {
    const fresh = await openTestDb("repos.test (lazy indexes)");
    try {
      const freshDb = fresh?.db as Db;
      await insertTimetableVersion(freshDb, draftVersion());
      const names = (
        await freshDb.collection("timetable_versions").listIndexes().toArray()
      ).map((i) => i.name);
      expect(names).toContain("one_active_version");
    } finally {
      await fresh?.cleanup();
    }
  });

  it("round-trips reference data in file order without metadata", async () => {
    const at = nowIso();
    const meta = (id: string, seq: number) => ({
      _id: id,
      seq,
      origin: "dataset" as const,
      created_at: at,
      updated_at: at,
    });
    const docs: ReferenceDocs = {
      rooms: [
        {
          id: "Z-ROOM",
          name: "Zed",
          building: "B",
          type: "lab_cs",
          capacity: 30,
          features: ["computers"],
          accessible: true,
          allowed_uses: ["lab"],
          department: "CSE",
          ...meta("Z-ROOM", 0),
        },
        {
          id: "A-ROOM",
          name: "Ay",
          building: "B",
          type: "classroom",
          capacity: 60,
          features: [],
          accessible: false,
          allowed_uses: ["lecture"],
          department: null,
          ...meta("A-ROOM", 1),
        },
      ],
      room_unavailability: [],
      faculty: [],
      student_groups: [],
      courses: [],
      sessions: [
        {
          id: "S1",
          course_id: "C1",
          kind: "lecture",
          groups: ["G1"],
          faculty_id: "F1",
          size: 30,
          duration: 1,
          room_types: ["classroom"],
          needs_accessible: false,
          basket_slot: null,
          fixed_slot: null,
          removed: true,
          ...meta("S1", 0),
        },
      ],
      exams: [],
      booking_requests: [],
      cancellations: [],
    };
    const counts = await replaceReferenceData(db, docs);
    expect(counts.rooms).toBe(2);

    const rooms = await listRooms(db);
    expect(rooms.map((r) => r.id)).toEqual(["Z-ROOM", "A-ROOM"]);
    expect(rooms[0]).not.toHaveProperty("_id");
    expect(rooms[0]).not.toHaveProperty("seq");
    expect(rooms[0]).not.toHaveProperty("origin");
    expect(await getRoom(db, "A-ROOM")).toMatchObject({ department: null });
    expect(await getRoom(db, "nope")).toBeNull();

    expect(await listSessions(db)).toEqual([]);
    expect(await listSessions(db, { includeRemoved: true })).toHaveLength(1);

    // Replacing again leaves exactly the new set.
    await replaceReferenceData(db, { ...docs, rooms: docs.rooms.slice(1) });
    expect((await listRooms(db)).map((r) => r.id)).toEqual(["A-ROOM"]);
  });

  it("stores timetable versions with sequential ids and one active version", async () => {
    const v1 = await insertTimetableVersion(db, draftVersion());
    const v2 = await insertTimetableVersion(db, draftVersion());
    expect([v1.id, v2.id]).toEqual(["TT-0001", "TT-0002"]);
    expect(v1.created_at).toMatch(/\+05:30$/);
    expect(await getTimetableVersion(db, "TT-0001")).toEqual(v1);
    expect(await getActiveTimetableVersion(db)).toBeNull();

    await activateTimetableVersion(db, v1.id);
    expect((await getActiveTimetableVersion(db))?.id).toBe("TT-0001");
    await activateTimetableVersion(db, v2.id);
    expect((await getActiveTimetableVersion(db))?.id).toBe("TT-0002");
    expect((await getTimetableVersion(db, v1.id))?.status).toBe("superseded");

    // The partial unique index forbids a second active version.
    await expect(
      insertTimetableVersion(db, draftVersion({ status: "active" })),
    ).rejects.toMatchObject({ code: 11000 });

    const listed = await listTimetableVersions(db);
    expect(listed.map((v) => v.id)).toEqual(["TT-0002", "TT-0001"]);
    expect(listed[0]).toMatchObject({ assignment_count: 1 });
    expect(listed[0]).not.toHaveProperty("assignments");

    await expect(activateTimetableVersion(db, "TT-9999")).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
  });

  it("stores exam schedules with an active pointer", async () => {
    const s1 = await insertExamSchedule(db, {
      dataset_id: "cit-public-v1",
      status: "draft",
      exams: [{ exam_id: "E1", day: "SAT", session: "AM", rooms: ["AUD"] }],
      penalty: 5,
      solver_meta: { seed: 42, ms: 12, algorithm: "test" },
      created_by: "engine",
    });
    expect(s1.id).toBe("EXS-0001");
    await activateExamSchedule(db, s1.id);
    expect(await getActiveExamSchedule(db)).toMatchObject({
      id: "EXS-0001",
      status: "active",
      penalty: 5,
    });
  });

  it("upserts, replaces and counts booking decisions", async () => {
    await upsertBookingDecision(db, decision("BR-01", "approved"));
    await upsertBookingDecision(db, decision("BR-01", "rejected"));
    expect(await getBookingDecision(db, "BR-01")).toEqual(
      decision("BR-01", "rejected"),
    );
    await replaceBookingDecisions(db, [
      decision("BR-02", "approved"),
      decision("BR-03", "alternative_offered"),
      decision("BR-04", "rejected"),
    ]);
    expect(await getBookingDecision(db, "BR-01")).toBeNull();
    expect(await countBookingDecisionsByStatus(db)).toEqual({
      approved: 1,
      alternative_offered: 1,
      rejected: 1,
    });
    const held = await listBookingDecisions(db, {
      status: ["approved", "alternative_offered"],
    });
    expect(held.map((d) => d.request_id)).toEqual(["BR-02", "BR-03"]);
  });

  it("keys decisions and overrides by timetable version", async () => {
    await replaceBookingDecisions(db, [
      decision("BR-01", "approved"),
      { ...decision("BR-02", "rejected"), timetable_version: "TT-0002" },
    ]);
    await replaceSessionOverrides(db, [
      { ...override, timetable_version: "TT-0001" },
      { ...override, session_id: "S2", timetable_version: "TT-0002" },
    ]);
    const v1 = { timetable_version: "TT-0001" };
    expect(
      (await listBookingDecisions(db, v1)).map((d) => d.request_id),
    ).toEqual(["BR-01"]);
    expect(await countBookingDecisionsByStatus(db, v1)).toEqual({
      approved: 1,
      alternative_offered: 0,
      rejected: 0,
    });
    expect(await listDecidedRequestIds(db, v1)).toEqual(["BR-01"]);
    expect(
      (await listSessionOverrides(db, v1)).map((o) => o.session_id),
    ).toEqual(["S1"]);
    expect(await countSessionOverrides(db, { timetable_version: null })).toBe(
      0,
    );

    expect(await clearSpectraState(db, "TT-0002")).toEqual({
      booking_decisions: 1,
      session_overrides: 1,
    });
    expect(await countSessionOverrides(db)).toBe(1);
    expect(await clearSpectraState(db)).toEqual({
      booking_decisions: 1,
      session_overrides: 1,
    });
    expect(await listBookingDecisions(db)).toEqual([]);
  });

  it("upserts, replaces and deletes session overrides", async () => {
    await upsertSessionOverride(db, override);
    await upsertSessionOverride(db, { ...override, start_period: 3 });
    expect(await listSessionOverrides(db)).toEqual([
      { ...override, start_period: 3 },
    ]);
    await replaceSessionOverrides(db, [
      override,
      { ...override, session_id: "S2", displaced_by: "BR-08" },
    ]);
    expect(await deleteSessionOverridesFor(db, "BR-07")).toBe(1);
    expect((await listSessionOverrides(db)).map((o) => o.session_id)).toEqual([
      "S2",
    ]);
  });

  it("stores change requests and guards status transitions", async () => {
    const cr = await insertChangeRequest(db, changeRequest());
    expect(cr.id).toBe("CR-0001");
    expect(await getChangeRequest(db, cr.id)).toEqual(cr);

    const approved = await updateChangeRequest(
      db,
      cr.id,
      { status: "approved", approved_by: "u_admin" },
      { expectStatus: "pending" },
    );
    expect(approved?.status).toBe("approved");
    // A second transition from "pending" no longer applies.
    expect(
      await updateChangeRequest(
        db,
        cr.id,
        { status: "rejected" } satisfies Partial<ChangeRequest>,
        { expectStatus: "pending" },
      ),
    ).toBeNull();

    await insertChangeRequest(db, changeRequest("u_faculty"));
    expect(await countChangeRequestsByStatus(db)).toMatchObject({
      pending: 1,
      approved: 1,
    });
    expect(
      (await listChangeRequests(db, { requested_by: "u_faculty" })).length,
    ).toBe(1);
  });

  it("saves the settings singleton", async () => {
    expect(await getStoredSettings(db)).toBeNull();
    const settings = {
      team: "Team",
      priority_order: [
        "exam",
        "regular_session",
        "institute_event",
        "guest_lecture",
        "department_event",
        "club_event",
      ] as const,
      llm_enabled: false,
      reference_date: "2027-02-08",
      solver_seed: 7,
    };
    await saveSettings(db, {
      ...settings,
      priority_order: [...settings.priority_order],
    });
    await saveSettings(db, {
      ...settings,
      priority_order: [...settings.priority_order],
      team: "Renamed",
    });
    expect(await getStoredSettings(db)).toMatchObject({ team: "Renamed" });
    expect(await db.collection("settings").countDocuments()).toBe(1);
  });

  it("appends audit entries newest first", async () => {
    await appendAuditLog(db, {
      actor: "u_admin",
      action: "reset",
      entity: "datasets",
      entity_id: "cit-public-v1",
    });
    const second = await appendAuditLog(db, {
      actor: "u_admin",
      action: "import",
      entity: "datasets",
      entity_id: "cit-public-v1",
      after: { rooms: 27 },
      before: undefined,
    });
    expect(second.id).toMatch(/^AL-[0-9a-f]{24}$/);
    const entries = await listAuditLog(db);
    expect(entries.map((e) => e.action)).toEqual(["import", "reset"]);
    expect(entries[0]).not.toHaveProperty("before");
  });
});
