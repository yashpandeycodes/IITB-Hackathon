import type { Db } from "mongodb";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getBundledDataset } from "@/lib/dataset";
import { COLLECTION_NAMES } from "../collections";
import {
  cancelRequest,
  deleteBookingRequests,
  deleteCancellation,
  insertBookingRequests,
  restoreRequest,
  setApproval,
  setRejection,
  setRequestStates,
  type NewBookingRequest,
} from "./booking-requests";
import {
  getBookingRequest,
  listBookingRequests,
  listCancellations,
} from "./reference";
import { openTestDb } from "./test-db";

const testDb = await openTestDb("booking-requests.test");
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

const AT = "2027-02-08T10:00:00+05:30";

const live = (title: string): NewBookingRequest => ({
  submitted_at: AT,
  requester: "Dramatics Society",
  role: "club",
  department: null,
  requested_category: "club_event",
  title,
  attendance: 40,
  duration_periods: 2,
  windows: [{ day: "MON", from_period: 10, to_period: 11 }],
  room_types: ["seminar_hall"],
  needs: [],
  requested_room: null,
  mandatory_for_groups: [],
  state: "submitted",
  source: "form",
  created_by: "u_club",
});

const APPROVAL = {
  approved_by: "u_coord_cse",
  approved_at: AT,
  room_id: "CS-LAB-1",
  day: "MON" as const,
  start_period: 10,
  end_period: 11,
};

describe.skipIf(!testDb)("booking-requests repo (MongoDB)", () => {
  beforeEach(async () => {
    for (const name of COLLECTION_NAMES) {
      await db.collection(name).deleteMany({});
    }
    // One dataset-origin request so live ones must sort after it.
    const [first] = getBundledDataset().booking_requests;
    await db.collection("booking_requests").insertOne({
      ...first,
      _id: first.id,
      seq: 0,
      origin: "dataset",
      state: "submitted",
      source: "dataset",
      created_by: null,
      created_at: AT,
      updated_at: AT,
    } as never);
  });

  it("inserts sequential REQ ids after the dataset requests, a single one without a series", async () => {
    const [one] = await insertBookingRequests(db, [live("Solo")]);
    expect(one).toMatchObject({ id: "REQ-0001", series_id: null });
    const series = await insertBookingRequests(db, [
      live("Day 1"),
      live("Day 2"),
      live("Day 3"),
    ]);
    expect(series.map((r) => [r.id, r.series_id])).toEqual([
      ["REQ-0002", "SER-REQ-0002"],
      ["REQ-0003", "SER-REQ-0002"],
      ["REQ-0004", "SER-REQ-0002"],
    ]);
    const all = await listBookingRequests(db);
    expect(all.map((r) => r.id)).toEqual([
      "BR-01",
      "REQ-0001",
      "REQ-0002",
      "REQ-0003",
      "REQ-0004",
    ]);
    // Stored without Mongo metadata, as the contract record.
    expect(await getBookingRequest(db, "REQ-0001")).toEqual(one);
    expect(one).not.toHaveProperty("seq");
  });

  it("updates states and drops stale approvals in one bulk write", async () => {
    const [a, b] = await insertBookingRequests(db, [live("A"), live("B")]);
    await setApproval(db, a.id, APPROVAL);
    expect((await getBookingRequest(db, a.id))?.approval).toEqual(APPROVAL);
    const changed = await setRequestStates(db, [
      { id: a.id, state: "pending_approval", clear_approval: true },
      { id: b.id, state: "decided", clear_approval: false },
    ]);
    expect(changed).toBe(2);
    const after = await getBookingRequest(db, a.id);
    expect(after?.state).toBe("pending_approval");
    expect(after).not.toHaveProperty("approval");
    expect((await getBookingRequest(db, b.id))?.state).toBe("decided");
    expect(await setRequestStates(db, [])).toBe(0);
  });

  it("records a rejection and clears any approval", async () => {
    const [a] = await insertBookingRequests(db, [live("A")]);
    await setApproval(db, a.id, APPROVAL);
    await setRejection(db, a.id, {
      rejected_by: "u_admin",
      rejected_at: AT,
      comment: "No",
    });
    const record = await getBookingRequest(db, a.id);
    expect(record?.rejection).toEqual({
      rejected_by: "u_admin",
      rejected_at: AT,
      comment: "No",
    });
    expect(record).not.toHaveProperty("approval");
  });

  it("restores state, approval and rejection exactly as they were", async () => {
    const [a] = await insertBookingRequests(db, [live("A")]);
    await setRequestStates(db, [
      { id: a.id, state: "pending_approval", clear_approval: false },
    ]);
    const before = await getBookingRequest(db, a.id);
    // An approval that is then undone: back to no approval, same state.
    await setApproval(db, a.id, APPROVAL);
    await restoreRequest(db, a.id, {
      state: before!.state,
      approval: before!.approval,
      rejection: before!.rejection,
    });
    expect(await getBookingRequest(db, a.id)).toEqual(before);

    // A rejection that is then undone puts the earlier approval back.
    await setApproval(db, a.id, APPROVAL);
    await setRejection(db, a.id, {
      rejected_by: "u_admin",
      rejected_at: AT,
      comment: "No",
    });
    await restoreRequest(db, a.id, {
      state: "pending_approval",
      approval: APPROVAL,
      rejection: undefined,
    });
    const restored = await getBookingRequest(db, a.id);
    expect(restored?.approval).toEqual(APPROVAL);
    expect(restored).not.toHaveProperty("rejection");
    expect(restored?.state).toBe("pending_approval");
  });

  it("cancels idempotently with one cancellations row the engine reads", async () => {
    const [a] = await insertBookingRequests(db, [live("A")]);
    await cancelRequest(db, a.id, { by: "Dramatics Society", at: AT });
    await cancelRequest(db, a.id, { by: "Dramatics Society", note: "Again" });
    expect((await getBookingRequest(db, a.id))?.state).toBe("cancelled");
    const rows = await listCancellations(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      request_id: a.id,
      by: "Dramatics Society",
      note: "Again",
    });
  });

  it("drops the approval on cancel, and can remove a live cancellation row again", async () => {
    const [a] = await insertBookingRequests(db, [live("A")]);
    await setApproval(db, a.id, APPROVAL);
    await cancelRequest(db, a.id, { by: "Dramatics Society", at: AT });
    expect(await getBookingRequest(db, a.id)).not.toHaveProperty("approval");

    // Dataset cancellation rows are the imported file's: never removed here.
    await db.collection("cancellations").insertOne({
      _id: "BR-01",
      request_id: "BR-01",
      cancelled_at: AT,
      by: "file",
      seq: 0,
      origin: "dataset",
      created_at: AT,
      updated_at: AT,
    } as never);
    await deleteCancellation(db, a.id);
    await deleteCancellation(db, "BR-01");
    expect((await listCancellations(db)).map((c) => c.request_id)).toEqual([
      "BR-01",
    ]);
  });

  it("deletes only live requests", async () => {
    const [a] = await insertBookingRequests(db, [live("A")]);
    expect(await deleteBookingRequests(db, [a.id, "BR-01"])).toBe(1);
    expect((await listBookingRequests(db)).map((r) => r.id)).toEqual(["BR-01"]);
    expect(await deleteBookingRequests(db, [])).toBe(0);
  });
});
