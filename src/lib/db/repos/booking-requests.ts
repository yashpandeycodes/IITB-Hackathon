import "server-only";
import type { AnyBulkWriteOperation, Db, UpdateFilter } from "mongodb";
import {
  BookingRequestRecordSchema,
  type BookingRequestRecord,
  type RequestState,
} from "@/lib/contracts";
import { COLLECTIONS } from "../collections";
import { insertWithSequentialId, nowIso, omit, stripMeta } from "./meta";
import type { BookingRequestDoc, CancellationDoc } from "./reference";

/**
 * Writes for booking requests submitted in the app (`source: "nl" | "form"`, architecture §5.2).
 * Reads live in `reference.ts` (`listBookingRequests`, `getBookingRequest`), shared with the
 * dataset-origin requests. Live documents carry `origin: "manual"` and a `seq` above any file
 * position, so reads keep returning dataset requests first and live requests in submission order.
 */

/** Id prefix of live requests (`REQ-0001`); dataset requests keep their own ids. */
export const LIVE_REQUEST_PREFIX = "REQ";

/** Live `seq` values start here (no imported file has a million requests). */
const LIVE_SEQ_BASE = 1_000_000;

/** A live request before it has an id; `series_id` is assigned on insert. */
export type NewBookingRequest = Omit<BookingRequestRecord, "id" | "series_id">;

const requests = (db: Db) =>
  db.collection<BookingRequestDoc>(COLLECTIONS.booking_requests);
const cancellations = (db: Db) =>
  db.collection<CancellationDoc>(COLLECTIONS.cancellations);

function liveSeq(id: string): number {
  const n = Number(/-(\d+)$/.exec(id)?.[1] ?? 0);
  return LIVE_SEQ_BASE + n;
}

function toRecord(doc: BookingRequestDoc): BookingRequestRecord {
  return BookingRequestRecordSchema.parse(
    omit(stripMeta(doc), ["seq"]),
  ) as BookingRequestRecord;
}

/**
 * Inserts live requests under sequential `REQ-` ids, in order. More than one record makes a
 * series: every request gets `series_id` `SER-<first id>`. Returns the stored records; on a
 * failure part-way, the ones already inserted are removed again.
 */
export async function insertBookingRequests(
  db: Db,
  records: readonly NewBookingRequest[],
): Promise<BookingRequestRecord[]> {
  const inserted: BookingRequestRecord[] = [];
  let seriesId: string | null = null;
  for (const record of records) {
    const at = nowIso();
    const series = seriesId;
    const build = (id: string): BookingRequestDoc => {
      const parsed = BookingRequestRecordSchema.parse({
        ...record,
        id,
        series_id: records.length > 1 ? (series ?? `SER-${id}`) : null,
      });
      return {
        ...parsed,
        _id: id,
        seq: liveSeq(id),
        origin: "manual",
        created_at: at,
        updated_at: at,
      } as BookingRequestDoc;
    };
    let id: string;
    try {
      id = await insertWithSequentialId(
        db,
        COLLECTIONS.booking_requests,
        LIVE_REQUEST_PREFIX,
        build,
      );
    } catch (err) {
      // All or nothing: don't leave half a series behind.
      await deleteBookingRequests(
        db,
        inserted.map((r) => r.id),
      ).catch(() => undefined);
      throw err;
    }
    const stored = toRecord(build(id));
    seriesId ??= stored.series_id ?? null;
    inserted.push(stored);
  }
  return inserted;
}

/** Removes live requests by id (used to undo a submission that could not be accepted). */
export async function deleteBookingRequests(
  db: Db,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await requests(db).deleteMany({
    _id: { $in: [...ids] },
    origin: "manual",
  });
  return result.deletedCount;
}

/** One request's new state, optionally dropping an approval that no longer matches. */
export type RequestStateUpdate = {
  id: string;
  state: RequestState;
  /** Remove `approval` (it was given for a slot the request no longer has). */
  clear_approval: boolean;
};

/** Applies state changes (one bulk write). Returns how many requests changed. */
export async function setRequestStates(
  db: Db,
  updates: readonly RequestStateUpdate[],
): Promise<number> {
  if (updates.length === 0) return 0;
  const at = nowIso();
  const ops: AnyBulkWriteOperation<BookingRequestDoc>[] = updates.map((u) => ({
    updateOne: {
      filter: { _id: u.id },
      update: {
        $set: { state: u.state, updated_at: at },
        ...(u.clear_approval ? { $unset: { approval: "" } } : {}),
      },
    },
  }));
  const result = await requests(db).bulkWrite(ops, { ordered: false });
  return result.modifiedCount;
}

export type RequestApproval = NonNullable<BookingRequestRecord["approval"]>;
export type RequestRejection = NonNullable<BookingRequestRecord["rejection"]>;

/** Records an approver's acceptance of the request's current slot. */
export async function setApproval(
  db: Db,
  id: string,
  approval: RequestApproval,
): Promise<void> {
  const parsed = BookingRequestRecordSchema.shape.approval.parse(approval);
  await requests(db).updateOne(
    { _id: id },
    { $set: { approval: parsed, updated_at: nowIso() } },
  );
}

/** Records an approver's rejection (and drops any approval): the engine never places it again. */
export async function setRejection(
  db: Db,
  id: string,
  rejection: RequestRejection,
): Promise<void> {
  const parsed = BookingRequestRecordSchema.shape.rejection.parse(rejection);
  await requests(db).updateOne(
    { _id: id },
    {
      $set: { rejection: parsed, updated_at: nowIso() },
      $unset: { approval: "" },
    },
  );
}

/**
 * Cancels a request: state `cancelled` (any approval is dropped: it was for a slot the request
 * gives up), plus a `cancellations` row (`_id` = request id) recording who cancelled it and
 * when. Idempotent (the row is upserted).
 */
export async function cancelRequest(
  db: Db,
  id: string,
  entry: { by: string; note?: string; at?: string },
): Promise<void> {
  const at = entry.at ?? nowIso();
  await requests(db).updateOne(
    { _id: id },
    { $set: { state: "cancelled", updated_at: at }, $unset: { approval: "" } },
  );
  const existing = await cancellations(db).findOne(
    { _id: id },
    { projection: { created_at: 1 } },
  );
  const doc: CancellationDoc = {
    _id: id,
    request_id: id,
    cancelled_at: at,
    by: entry.by,
    ...(entry.note ? { note: entry.note } : {}),
    seq: liveSeq(id),
    origin: "manual",
    created_at: existing?.created_at ?? at,
    updated_at: at,
  };
  await cancellations(db).replaceOne({ _id: id }, doc, { upsert: true });
}

/** What a booking write changes on a request, as it was before (for {@link restoreRequest}). */
export type RequestSnapshot = Pick<
  BookingRequestRecord,
  "state" | "approval" | "rejection"
>;

/**
 * Puts a request's `state`, `approval` and `rejection` back as they were in `snapshot` (an
 * absent approval or rejection is removed). Undoes a cancellation or an approver's decision
 * whose follow-up Spectra run failed.
 */
export async function restoreRequest(
  db: Db,
  id: string,
  snapshot: RequestSnapshot,
): Promise<void> {
  const set: Record<string, unknown> = {
    state: snapshot.state,
    updated_at: nowIso(),
  };
  const unset: Record<string, ""> = {};
  if (snapshot.approval) {
    set.approval = BookingRequestRecordSchema.shape.approval.parse(
      snapshot.approval,
    );
  } else {
    unset.approval = "";
  }
  if (snapshot.rejection) {
    set.rejection = BookingRequestRecordSchema.shape.rejection.parse(
      snapshot.rejection,
    );
  } else {
    unset.rejection = "";
  }
  await requests(db).updateOne({ _id: id }, {
    $set: set,
    $unset: unset,
  } as UpdateFilter<BookingRequestDoc>);
}

/** Removes a live request's `cancellations` row (undoing {@link cancelRequest}). */
export async function deleteCancellation(db: Db, id: string): Promise<void> {
  await cancellations(db).deleteOne({ _id: id, origin: "manual" });
}
