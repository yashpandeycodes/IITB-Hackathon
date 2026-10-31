/**
 * Spectra's approval and bump logic: the pure policy (`booking-approvals.ts`, re-exported by
 * `spectra.ts`) — who must approve a decision, whether a stored approval still covers it, which
 * earlier decisions a run bumped — and how a Spectra run applies it to stored approvals (real
 * engine, throwaway database).
 */
import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Assignment, StoredBookingDecision } from "@/lib/contracts";
import { COLLECTION_NAMES } from "@/lib/db/collections";
import {
  insertBookingRequests,
  setApproval,
} from "@/lib/db/repos/booking-requests";
import { getBookingRequest } from "@/lib/db/repos/reference";
import { openTestDb } from "@/lib/db/repos/test-db";
import {
  activateTimetableVersion,
  insertTimetableVersion,
} from "@/lib/db/repos/timetable-versions";
import { importDataset } from "./dataset";
import {
  approvalMatches,
  approvalNeed,
  bumpNotices,
  holdsSlot,
  roomDepartments,
  runSpectra,
  runSpectraUnlocked,
} from "./spectra";
import { TINY_ASSIGNMENTS, ZERO_SOFT, tinyDataset } from "./test-fixtures";

const AT = "2027-02-08T10:00:00+05:30";

const decision = (
  request_id: string,
  fields: Partial<StoredBookingDecision> = {},
): StoredBookingDecision => ({
  request_id,
  status: "approved",
  day: "THU",
  start_period: 10,
  end_period: 11,
  room_id: "SH-1",
  reason: "",
  reason_code: "APPROVED_AS_REQUESTED",
  effective_category: "club_event",
  category_capped: false,
  requires_admin_approval: false,
  auto: true,
  decided_by: "engine",
  approved_by: null,
  timetable_version: "TT-0001",
  decided_at: AT,
  ...fields,
});

const rejected = (request_id: string, reason_code = "REJ_OUTRANKED") =>
  ({
    request_id,
    status: "rejected",
    reason: "No.",
    reason_code,
    effective_category: "club_event",
    category_capped: false,
    requires_admin_approval: false,
    auto: true,
    decided_by: "engine",
    approved_by: null,
    timetable_version: "TT-0001",
    decided_at: AT,
  }) as StoredBookingDecision;

const departments = roomDepartments([
  { id: "SH-1", type: "seminar_hall" },
  { id: "CS-LAB-1", type: "lab_cs" },
  { id: "ELEC-LAB-1", type: "lab_elec" },
] as never);

describe("approvalNeed", () => {
  it("asks an admin for class moves, a coordinator for a department lab, nobody otherwise", () => {
    expect(approvalNeed(decision("R1"), departments)).toBeNull();
    expect(
      approvalNeed(decision("R1", { room_id: "CS-LAB-1" }), departments),
    ).toEqual({ approver_role: "department_coordinator", department: "CSE" });
    expect(
      approvalNeed(
        decision("R1", {
          room_id: "ELEC-LAB-1",
          status: "alternative_offered",
        }),
        departments,
      ),
    ).toEqual({ approver_role: "department_coordinator", department: "ECE" });
    // Class moves win over the lab rule.
    expect(
      approvalNeed(
        decision("R1", { room_id: "CS-LAB-1", requires_admin_approval: true }),
        departments,
      ),
    ).toEqual({ approver_role: "admin", department: null });
    expect(approvalNeed(rejected("R1"), departments)).toBeNull();
    expect(approvalNeed(null, departments)).toBeNull();
  });
});

describe("approvalMatches / holdsSlot", () => {
  const approval = {
    approved_by: "u_coord_cse",
    approver_role: "department_coordinator" as const,
    approved_at: AT,
    room_id: "CS-LAB-1",
    day: "THU" as const,
    start_period: 10,
    end_period: 11,
  };
  const labNeed = approvalNeed(
    decision("R1", { room_id: "CS-LAB-1" }),
    departments,
  );
  const movesNeed = { approver_role: "admin" as const, department: null };

  it("only matches the exact slot", () => {
    const lab = decision("R1", { room_id: "CS-LAB-1" });
    expect(holdsSlot(lab)).toBe(true);
    expect(holdsSlot(rejected("R1"))).toBe(false);
    expect(approvalMatches(approval, lab, labNeed)).toBe(true);
    expect(approvalMatches(approval, { ...lab, end_period: 12 }, labNeed)).toBe(
      false,
    );
    expect(
      approvalMatches(approval, { ...lab, room_id: "CS-LAB-2" }, labNeed),
    ).toBe(false);
    expect(approvalMatches(undefined, lab, labNeed)).toBe(false);
    expect(approvalMatches(approval, rejected("R1"), null)).toBe(false);
    // With no need only the slot is compared.
    expect(approvalMatches(approval, lab, null)).toBe(true);
  });

  it("never lets a coordinator's approval cover class moves", () => {
    const moves = decision("R1", {
      room_id: "CS-LAB-1",
      requires_admin_approval: true,
    });
    expect(approvalNeed(moves, departments)).toEqual(movesNeed);
    expect(approvalMatches(approval, moves, movesNeed)).toBe(false);
    // Older records without a role count as a coordinator's.
    const legacy = { ...approval, approver_role: undefined };
    expect(approvalMatches(legacy, moves, movesNeed)).toBe(false);
    expect(approvalMatches(legacy, moves, labNeed)).toBe(true);
    // An admin's approval covers both kinds.
    const admin = {
      ...approval,
      approved_by: "u_admin",
      approver_role: "admin" as const,
    };
    expect(approvalMatches(admin, moves, movesNeed)).toBe(true);
    expect(approvalMatches(admin, moves, labNeed)).toBe(true);
  });
});

describe("bumpNotices", () => {
  const previous = [
    decision("BR-06"),
    decision("BR-07", { room_id: "AUD" }),
    decision("BR-08", { status: "alternative_offered", room_id: "LH-1" }),
    decision("BR-09"),
    decision("REQ-0001", { room_id: "CR-101" }),
  ];

  it("lists decisions that got worse or moved, never the new requests or withdrawals", () => {
    const next = [
      // moved, same status
      decision("BR-06", {
        room_id: "LH-1",
        reason_code: "ROOM_SWAPPED_IN_WINDOW",
      }),
      // unchanged
      decision("BR-07", { room_id: "AUD" }),
      // alternative → rejected
      rejected("BR-08"),
      // cancelled: not a bump
      rejected("BR-09", "REJ_CANCELLED"),
      // approver rejection: not a bump
      rejected("REQ-0001", "REJ_BY_APPROVER"),
      // the new request
      decision("REQ-0002"),
    ];
    expect(bumpNotices(previous, next, ["REQ-0002"])).toEqual([
      {
        request_id: "BR-06",
        before: {
          status: "approved",
          room_id: "SH-1",
          day: "THU",
          start_period: 10,
          end_period: 11,
        },
        after: {
          status: "approved",
          room_id: "LH-1",
          day: "THU",
          start_period: 10,
          end_period: 11,
        },
        by: ["REQ-0002"],
      },
      {
        request_id: "BR-08",
        before: {
          status: "alternative_offered",
          room_id: "LH-1",
          day: "THU",
          start_period: 10,
          end_period: 11,
        },
        after: { status: "rejected" },
        by: ["REQ-0002"],
      },
    ]);
  });

  it("never reports a decision whose status improved, even in another slot", () => {
    const next = [
      // alternative (LH-1) → approved in SH-1: better, not a bump
      decision("BR-08", { room_id: "SH-1" }),
      // rejected → approved anywhere: better
      decision("BR-10", { room_id: "AUD" }),
    ];
    expect(
      bumpNotices([...previous, rejected("BR-10")], next, ["REQ-0009"]),
    ).toEqual([]);
  });

  it("reports approved → alternative even in the same room", () => {
    const next = [decision("BR-06", { status: "alternative_offered" })];
    expect(bumpNotices(previous, next, ["REQ-0009"])).toEqual([
      expect.objectContaining({
        request_id: "BR-06",
        after: expect.objectContaining({ status: "alternative_offered" }),
      }),
    ]);
    expect(bumpNotices([], next, ["REQ-0009"])).toEqual([]);
  });
});

// ------------------------------------------------------------------- stored approvals (DB)

const testDb = await openTestDb("spectra-approvals.test");

afterAll(async () => {
  await testDb?.cleanup();
});

describe.skipIf(!testDb)(
  "Spectra runs and stored approvals (MongoDB, real engine)",
  () => {
    const db = testDb?.db as Db;
    let requestId = "";

    /** The tiny dataset with its CS lab open for events (so a booking can be placed there). */
    const labDataset = () => {
      const dataset = tinyDataset();
      return {
        ...dataset,
        rooms: dataset.rooms.map((room) =>
          room.id === "CS-LAB"
            ? { ...room, allowed_uses: [...room.allowed_uses, "event"] }
            : room,
        ),
      };
    };

    async function activate(assignments: Assignment[]): Promise<string> {
      const version = await insertTimetableVersion(db, {
        dataset_id: "tiny-v1",
        status: "draft",
        source: "manual",
        parent_version: null,
        change_request_id: null,
        assignments,
        hard_violation_count: 0,
        soft_penalty: ZERO_SOFT,
        solver_meta: null,
        created_by: "u_admin",
      });
      await activateTimetableVersion(db, version.id);
      return version.id;
    }

    beforeAll(async () => {
      for (const name of COLLECTION_NAMES) {
        await db.collection(name).deleteMany({});
      }
      await importDataset(db, labDataset(), "upload");
      // The regular week has C1-P1 on TUE, so CS-LAB is free on WED P2–P3.
      await activate(TINY_ASSIGNMENTS);
      // An admin's live booking of the CS lab: it needs the CSE coordinator, not class moves.
      const [record] = await insertBookingRequests(db, [
        {
          submitted_at: "2027-02-02T10:00:00+05:30",
          requester: "Dean's Office",
          role: "admin",
          department: null,
          requested_category: "institute_event",
          title: "Hackathon briefing",
          attendance: 30,
          duration_periods: 2,
          windows: [{ day: "WED", from_period: 2, to_period: 3 }],
          room_types: ["lab_cs"],
          needs: [],
          requested_room: "CS-LAB",
          mandatory_for_groups: [],
          state: "submitted",
          source: "form",
          created_by: "u_admin",
        },
      ]);
      requestId = record.id;
    });

    const decisionOf = (result: { decisions: StoredBookingDecision[] }) =>
      result.decisions.find((d) => d.request_id === requestId)!;

    it("waits for the CSE coordinator, then records their approval of the lab", async () => {
      const first = await runSpectra(db, { actor: "u_admin" });
      expect(decisionOf(first)).toMatchObject({
        status: "approved",
        room_id: "CS-LAB",
        day: "WED",
        start_period: 2,
        end_period: 3,
        requires_admin_approval: false,
        auto: false,
        approved_by: null,
      });
      expect((await getBookingRequest(db, requestId))?.state).toBe(
        "pending_approval",
      );

      await setApproval(db, requestId, {
        approved_by: "u_coord_cse",
        approver_role: "department_coordinator",
        approved_at: "2027-02-03T10:00:00+05:30",
        room_id: "CS-LAB",
        day: "WED",
        start_period: 2,
        end_period: 3,
      });
      // The coordinator's decision re-runs Spectra without admin standing.
      const second = await runSpectraUnlocked(db, {
        actor: "u_coord_cse",
        carryApprovals: true,
      });
      expect(decisionOf(second)).toMatchObject({
        approved_by: "u_coord_cse",
        requires_admin_approval: false,
      });
      expect((await getBookingRequest(db, requestId))?.state).toBe("decided");
    });

    it("asks an admin again once the same slot moves a class, without crediting the coordinator", async () => {
      // A new regular week puts C1-P1 in CS-LAB on WED P2–P3: the booking now displaces it.
      await activate(
        TINY_ASSIGNMENTS.map((a) =>
          a.session_id === "C1-P1" ? { ...a, day: "WED" as const } : a,
        ),
      );
      const run = await runSpectra(db, { actor: "u_admin" });
      const decision = decisionOf(run);
      expect(decision).toMatchObject({
        status: "approved",
        room_id: "CS-LAB",
        day: "WED",
        start_period: 2,
        reason_code: "APPROVED_WITH_DISPLACEMENT",
        requires_admin_approval: true,
        auto: false,
        approved_by: null,
      });
      // Same slot, but a coordinator can't approve class moves: back to pending, approval dropped.
      const record = await getBookingRequest(db, requestId);
      expect(record?.state).toBe("pending_approval");
      expect(record?.approval).toBeUndefined();
      const moves = run.overrides.filter((o) => o.displaced_by === requestId);
      expect(moves.map((o) => o.session_id)).toEqual(["C1-P1"]);
      // Not even the admin whose run applied it approves a live request's class move.
      for (const o of moves) expect(o.approved_by).toBeNull();
    });
  },
);
