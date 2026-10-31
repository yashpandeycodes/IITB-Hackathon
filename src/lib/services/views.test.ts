import type { Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DashboardSchema,
  RoomAvailabilitySchema,
  TimetableCheckResultSchema,
  TimetableViewSchema,
  type RoomAvailabilityQuery,
} from "@/lib/contracts";
import { COLLECTION_NAMES } from "@/lib/db/collections";
import { upsertBookingDecision } from "@/lib/db/repos/booking-decisions";
import { insertChangeRequest } from "@/lib/db/repos/change-requests";
import {
  activateTimetableVersion,
  insertTimetableVersion,
} from "@/lib/db/repos/timetable-versions";
import { openTestDb } from "@/lib/db/repos/test-db";
import { getDashboard } from "./dashboard";
import { importDataset } from "./dataset";
import { getRoomAvailability } from "./rooms";
import {
  seedTinyWorkingState,
  TINY_DECISIONS,
  tinyDataset,
  USERS,
} from "./test-fixtures";
import {
  checkTimetableWhatIf,
  getTimetableView,
  requesterMatchesFaculty,
} from "./timetable-view";

const testDb = await openTestDb("views.test");

afterAll(async () => {
  await testDb?.cleanup();
});

async function wipe(db: Db) {
  for (const name of COLLECTION_NAMES) {
    await db.collection(name).deleteMany({});
  }
}

const cellsOf = (view: Awaited<ReturnType<typeof getTimetableView>>) =>
  view.cells.map(
    (c) => `${c.session_id}@${c.day}P${c.start_period}:${c.room_id}`,
  );

describe("requesterMatchesFaculty", () => {
  const f12 = { id: "F12", name: "Dr. Amit Behera" };

  it("matches the id suffix or the plain name", () => {
    expect(requesterMatchesFaculty("Dr. Amit Behera (F12)", f12)).toBe(true);
    expect(requesterMatchesFaculty("Prof. A. Behera ( f12 )", f12)).toBe(true);
    expect(requesterMatchesFaculty("dr. amit  behera", f12)).toBe(true);
    expect(requesterMatchesFaculty("Dr. Amit Behera (CSE)", f12)).toBe(true);
  });

  it("rejects other people and empty values", () => {
    expect(requesterMatchesFaculty("Dr. Someone (F13)", f12)).toBe(false);
    expect(requesterMatchesFaculty("Office of the Dean", f12)).toBe(false);
    expect(requesterMatchesFaculty("", f12)).toBe(false);
    expect(requesterMatchesFaculty(null, f12)).toBe(false);
    expect(requesterMatchesFaculty("Anyone", { id: "F12", name: "" })).toBe(
      false,
    );
  });
});

describe.skipIf(!testDb)("timetable view (MongoDB)", () => {
  const db = testDb?.db as Db;

  beforeAll(async () => {
    await wipe(db);
    await importDataset(db, tinyDataset(), "upload");
  });

  it("is empty, not an error, before a timetable exists", async () => {
    const view = await getTimetableView(db, {
      view: "group",
      id: "G1",
      week: "spectra",
    });
    expect(view).toMatchObject({ version_id: null, cells: [] });
  });

  it("throws NOT_FOUND for an unknown id", async () => {
    for (const view of ["group", "faculty", "room"] as const) {
      await expect(
        getTimetableView(db, { view, id: "NOPE", week: "regular" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  describe("with an active timetable", () => {
    beforeAll(async () => {
      await seedTinyWorkingState(db);
    });

    it("shows a group's regular week in day/period order", async () => {
      const view = await getTimetableView(db, {
        view: "group",
        id: "G1",
        week: "regular",
      });
      expect(TimetableViewSchema.parse(view)).toEqual(view);
      expect(view.version_id).toBe("TT-0001");
      expect(cellsOf(view)).toEqual([
        "C1-L1@MONP1:CR-1",
        "C1-P1@TUEP1:CS-LAB",
        "C1-L2@THUP3:LH-1",
      ]);
      expect(view.cells.every((c) => c.override === null)).toBe(true);
      expect(view.bookings).toEqual([]);
      expect(view.cells[1]).toMatchObject({
        kind: "lab",
        duration: 2,
        faculty_id: "F1",
        groups: ["G1"],
      });
    });

    it("applies Week-7 overrides and adds the group's mandatory bookings", async () => {
      const view = await getTimetableView(db, {
        view: "group",
        id: "G1",
        week: "spectra",
      });
      expect(cellsOf(view)).toContain("C1-L2@THUP5:LH-1");
      expect(
        view.cells.find((c) => c.session_id === "C1-L2")?.override,
      ).toEqual({ displaced_by: "BR-02" });
      expect(view.bookings).toEqual([
        {
          request_id: "BR-02",
          title: "Guest talk",
          room_id: "LH-1",
          day: "THU",
          start_period: 3,
          end_period: 3,
          status: "approved",
          effective_category: "guest_lecture",
        },
      ]);
    });

    it("filters by faculty and by room", async () => {
      const faculty = await getTimetableView(db, {
        view: "faculty",
        id: "F1",
        week: "spectra",
      });
      expect(faculty.cells.map((c) => c.session_id)).toEqual([
        "C1-L1",
        "C1-P1",
      ]);
      // BR-02 was requested by "Dr. O. One (F1)": matched on the id suffix.
      expect(faculty.bookings.map((b) => b.request_id)).toEqual(["BR-02"]);

      const aud = await getTimetableView(db, {
        view: "room",
        id: "AUD",
        week: "spectra",
      });
      expect(aud.cells).toEqual([]);
      expect(aud.bookings.map((b) => b.request_id)).toEqual(["BR-01"]);

      const lh = await getTimetableView(db, {
        view: "room",
        id: "LH-1",
        week: "regular",
      });
      expect(cellsOf(lh)).toEqual(["C1-L2@THUP3:LH-1"]);
    });
  });
});

describe.skipIf(!testDb)("room availability (MongoDB)", () => {
  const db = testDb?.db as Db;
  const query = (q: Partial<RoomAvailabilityQuery>): RoomAvailabilityQuery => ({
    day: "THU",
    from_period: 1,
    to_period: 3,
    use: "event",
    ...q,
  });

  beforeAll(async () => {
    await wipe(db);
    await importDataset(db, tinyDataset(), "upload");
    await seedTinyWorkingState(db);
  });

  it("lists only rooms allowed for the use (events by default)", async () => {
    const ids = async (q: Partial<RoomAvailabilityQuery>) =>
      (await getRoomAvailability(db, query(q))).map((r) => r.room_id).sort();
    expect(await ids({})).toEqual(["AUD", "LH-1"]);
    expect(await ids({ use: "lab" })).toEqual(["CS-LAB"]);
    expect(await ids({ use: "tutorial" })).toEqual(["CR-1", "LH-1"]);
  });

  it("reports unavailability, Week-7 sessions and bookings", async () => {
    const result = await getRoomAvailability(db, query({ use: "lecture" }));
    for (const row of result)
      expect(RoomAvailabilitySchema.parse(row)).toEqual(row);
    const byRoom = Object.fromEntries(result.map((r) => [r.room_id, r]));
    expect(byRoom["CR-1"]).toEqual({
      room_id: "CR-1",
      free: false,
      busy_with: [{ kind: "unavailable", id: "CR-1", label: "Painting" }],
    });
    // C1-L2 moved out of THU P3 for BR-02, which now holds LH-1.
    expect(byRoom["LH-1"]).toEqual({
      room_id: "LH-1",
      free: false,
      busy_with: [{ kind: "booking", id: "BR-02", label: "Guest talk" }],
    });
    expect(byRoom.AUD.free).toBe(true);
    // Free rooms first, smallest first.
    expect(result.map((r) => r.room_id)).toEqual(["AUD", "CR-1", "LH-1"]);
  });

  it("sees moved sessions at their Week-7 slot", async () => {
    const [lh] = await getRoomAvailability(
      db,
      query({ from_period: 4, to_period: 5, types: ["lecture_hall"] }),
    );
    expect(lh).toEqual({
      room_id: "LH-1",
      free: false,
      busy_with: [
        {
          kind: "session",
          id: "C1-L2",
          label: "C1 lecture · G1, G2 (moved for BR-02)",
        },
      ],
    });
  });

  it("covers multi-period sessions and evening bookings", async () => {
    const lab = await getRoomAvailability(
      db,
      query({
        day: "TUE",
        from_period: 2,
        to_period: 2,
        types: ["lab_cs"],
        use: "lab",
      }),
    );
    expect(lab[0].busy_with).toEqual([
      { kind: "session", id: "C1-P1", label: "C1 lab · G1" },
    ]);
    const evening = await getRoomAvailability(
      db,
      query({ from_period: 12, to_period: 13, needs: ["stage"] }),
    );
    expect(evening).toEqual([
      {
        room_id: "AUD",
        free: false,
        busy_with: [{ kind: "booking", id: "BR-01", label: "Annual play" }],
      },
    ]);
  });

  it("ignores rejected decisions and decisions for cancelled requests", async () => {
    // BR-03 is rejected; even a stray approval must not hold a room once it is cancelled.
    const friday = query({
      day: "FRI",
      from_period: 10,
      to_period: 10,
      use: "lab",
    });
    expect(
      (await getRoomAvailability(db, friday)).map((r) => [r.room_id, r.free]),
    ).toEqual([["CS-LAB", true]]);
    await upsertBookingDecision(db, {
      ...TINY_DECISIONS[0],
      request_id: "BR-03",
      day: "FRI",
      room_id: "CS-LAB",
    });
    expect(
      (await getRoomAvailability(db, friday)).map((r) => [r.room_id, r.free]),
    ).toEqual([["CS-LAB", true]]);
  });

  it("filters by capacity, type, needs and access", async () => {
    const ids = async (q: Partial<RoomAvailabilityQuery>) =>
      (await getRoomAvailability(db, query(q))).map((r) => r.room_id).sort();
    expect(await ids({ min_capacity: 100 })).toEqual(["AUD", "LH-1"]);
    expect(await ids({ needs: ["stage", "pa_system"] })).toEqual(["AUD"]);
    expect(await ids({ needs: ["accessible"], use: "lecture" })).toEqual([
      "AUD",
      "LH-1",
    ]);
    expect(
      await ids({ accessible: true, types: ["classroom"], use: "lecture" }),
    ).toEqual([]);
    expect(
      await ids({ types: ["classroom", "lab_cs"], use: "lecture" }),
    ).toEqual(["CR-1"]);
  });
});

describe.skipIf(!testDb)("Spectra state of another version (MongoDB)", () => {
  const db = testDb?.db as Db;

  beforeAll(async () => {
    await wipe(db);
    await importDataset(db, tinyDataset(), "upload");
    const first = await seedTinyWorkingState(db);
    // A newer timetable becomes active; TT-0001's decisions and overrides are now stale.
    const next = await insertTimetableVersion(db, {
      dataset_id: "tiny-v1",
      status: "draft",
      source: "generate",
      parent_version: first,
      change_request_id: null,
      assignments: [
        { session_id: "C1-L1", day: "MON", start_period: 1, room_id: "CR-1" },
        { session_id: "C1-P1", day: "TUE", start_period: 2, room_id: "CS-LAB" },
        { session_id: "C1-L2", day: "THU", start_period: 3, room_id: "LH-1" },
      ],
      hard_violation_count: 0,
      soft_penalty: { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, total: 0 },
      solver_meta: null,
      created_by: "u_admin",
    });
    await activateTimetableVersion(db, next.id);
  });

  it("is ignored by the timetable view", async () => {
    const view = await getTimetableView(db, {
      view: "group",
      id: "G1",
      week: "spectra",
    });
    expect(view.version_id).toBe("TT-0002");
    expect(cellsOf(view)).toContain("C1-L2@THUP3:LH-1");
    expect(view.cells.every((c) => c.override === null)).toBe(true);
    expect(view.bookings).toEqual([]);
  });

  it("is ignored by room availability", async () => {
    const rows = await getRoomAvailability(db, {
      day: "THU",
      from_period: 10,
      to_period: 12,
      use: "event",
    });
    expect(rows.every((r) => r.free)).toBe(true);
  });

  it("is ignored by the dashboard", async () => {
    const { bookings } = await getDashboard(db, USERS.admin);
    expect(bookings).toEqual({
      requests_total: 3,
      cancelled: 1,
      undecided: 2,
      by_status: { approved: 0, alternative_offered: 0, rejected: 0 },
      session_overrides: 0,
      booking_score: null,
      booking_score_max_if_all_approved: null,
    });
  });
});

describe.skipIf(!testDb)("dashboard (MongoDB)", () => {
  const db = testDb?.db as Db;

  beforeEach(async () => {
    await wipe(db);
  });

  it("returns zeros and nulls on an empty database", async () => {
    const dashboard = await getDashboard(db, USERS.admin);
    expect(DashboardSchema.parse(dashboard)).toEqual(dashboard);
    expect(dashboard).toMatchObject({
      role: "admin",
      dataset_id: "cit-public-v1",
      timetable: {
        version_id: null,
        sessions_total: 0,
        sessions_scheduled: 0,
        hard_violation_count: null,
        soft_penalty: null,
      },
      exams: { schedule_id: null, exams_total: 0, penalty: null },
      pending_approvals: { total: 0 },
      utilisation: { rooms: [], overall: 0 },
    });
  });

  it("summarises the active timetable, bookings and utilisation", async () => {
    await importDataset(db, tinyDataset(), "upload");
    await seedTinyWorkingState(db);
    const dashboard = await getDashboard(db, USERS.admin);
    expect(DashboardSchema.parse(dashboard)).toEqual(dashboard);
    expect(dashboard).toMatchObject({
      dataset_id: "tiny-v1",
      timetable: {
        version_id: "TT-0001",
        sessions_total: 3,
        sessions_scheduled: 3,
        hard_violation_count: 0,
        soft_penalty: { S2: 4, total: 4 },
      },
      exams: { exams_total: 1, exams_scheduled: 0 },
      bookings: {
        requests_total: 3,
        cancelled: 1,
        undecided: 0,
        by_status: { approved: 2, alternative_offered: 0, rejected: 1 },
        session_overrides: 1,
      },
    });
    const { utilisation } = dashboard;
    expect(utilisation.days).toEqual(["MON", "TUE", "WED", "THU", "FRI"]);
    expect(utilisation.periods).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const lab = utilisation.rooms.find((r) => r.room_id === "CS-LAB");
    expect(lab?.busy[1].slice(0, 3)).toEqual([1, 1, 0]);
    expect(lab?.fraction).toBeCloseTo(2 / 45, 4);
    // 4 busy room-periods (CR-1 ×1, LH-1 ×1, CS-LAB ×2) over 4 rooms × 45.
    expect(utilisation.overall).toBeCloseTo(4 / 180, 4);
  });

  it("is role-aware about approvals and the user's own items", async () => {
    await importDataset(db, tinyDataset(), "upload");
    await db.collection("booking_requests").insertOne({
      ...tinyDataset().booking_requests[2],
      _id: "REQ-1",
      id: "REQ-1",
      seq: 99,
      state: "pending_approval",
      source: "form",
      created_by: "u_club",
      created_at: "2027-02-05T10:00:00+05:30",
      updated_at: "2027-02-05T10:00:00+05:30",
    } as never);
    await insertChangeRequest(db, {
      kind: "faculty_request",
      requested_by: "u_faculty",
      changes: [{ type: "remove_session", session_id: "C1-L1" }],
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

    const admin = await getDashboard(db, USERS.admin);
    expect(admin.pending_approvals).toEqual({
      booking_requests: 1,
      change_requests: 1,
      total: 2,
    });

    // REQ-1 asks for a CS lab, so the CSE coordinator may approve it.
    const coord = await getDashboard(db, USERS.coordinator);
    expect(coord.pending_approvals).toEqual({
      booking_requests: 1,
      change_requests: 0,
      total: 1,
    });

    const club = await getDashboard(db, USERS.club);
    expect(club.pending_approvals.total).toBe(0);
    // REQ-1 (created by u_club) and BR-01 (requested by "Drama Club").
    expect(club.mine).toMatchObject({
      booking_requests: 2,
      booking_requests_open: 2,
      sessions_total: null,
    });

    const faculty = await getDashboard(db, USERS.faculty);
    expect(faculty.mine).toMatchObject({
      booking_requests: 1,
      change_requests: 1,
      change_requests_pending: 1,
      sessions_total: 2,
      sessions_scheduled: 0,
    });
  });
});

describe.skipIf(!testDb)("what-if timetable check (MongoDB)", () => {
  const db = testDb?.db as Db;

  beforeAll(async () => {
    await wipe(db);
    await importDataset(db, tinyDataset(), "upload");
  });

  it("checks the given assignments alone when nothing is active", async () => {
    const result = await checkTimetableWhatIf(db, {
      assignments: [
        { session_id: "C1-L1", day: "MON", start_period: 1, room_id: "CR-1" },
      ],
    });
    expect(TimetableCheckResultSchema.parse(result)).toEqual(result);
    expect(result.soft_delta).toBeNull();
    const unscheduled = result.violations.filter((v) =>
      v.detail.endsWith("is not scheduled"),
    );
    expect(unscheduled.map((v) => v.detail).sort()).toEqual([
      "Session C1-L2 is not scheduled",
      "Session C1-P1 is not scheduled",
    ]);
  });

  it("overlays the assignments on the active timetable", async () => {
    await seedTinyWorkingState(db);
    // The fixture's lab starts at P1, which breaks the lab-start rule (H9).
    const labStart = (r: { violations: { rule: string; detail: string }[] }) =>
      r.violations.filter((v) => v.rule === "H9" && v.detail.includes("C1-P1"));
    const current = await checkTimetableWhatIf(db, { assignments: [] });
    expect(current.soft_delta).toBe(0);
    expect(labStart(current)).toHaveLength(1);
    expect(
      current.violations.some((v) => v.detail.includes("not scheduled")),
    ).toBe(false);

    const fixed = await checkTimetableWhatIf(db, {
      assignments: [
        { session_id: "C1-P1", day: "TUE", start_period: 2, room_id: "CS-LAB" },
      ],
    });
    expect(labStart(fixed)).toEqual([]);
    expect(fixed.soft_delta).toBe(
      fixed.soft_penalty.total - current.soft_penalty.total,
    );
    expect(fixed.soft_penalty.total).toBe(
      fixed.soft_penalty.S1 +
        fixed.soft_penalty.S2 +
        fixed.soft_penalty.S3 +
        fixed.soft_penalty.S4 +
        fixed.soft_penalty.S5 +
        fixed.soft_penalty.S6,
    );

    // Moving C1-L1 onto the lab's room and slot clashes with it.
    const clash = await checkTimetableWhatIf(db, {
      assignments: [
        { session_id: "C1-P1", day: "TUE", start_period: 2, room_id: "CS-LAB" },
        { session_id: "C1-L1", day: "TUE", start_period: 2, room_id: "CS-LAB" },
      ],
    });
    expect(clash.violations.length).toBeGreaterThan(fixed.violations.length);
    expect(clash.violations.some((v) => v.detail.includes("C1-L1"))).toBe(true);
  });
});
