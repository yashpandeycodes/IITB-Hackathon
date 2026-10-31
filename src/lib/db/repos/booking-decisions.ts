import "server-only";
import type { Db, Filter } from "mongodb";
import {
  StoredBookingDecisionSchema,
  type Day,
  type DecisionStatus,
  type StoredBookingDecision,
} from "@/lib/contracts";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { nowIso, replaceKeepingCreatedAt, stripMeta } from "./meta";

/** `booking_decisions`: one per request, `_id` = `request_id` (architecture §5.3). */
export type BookingDecisionDoc = StoredBookingDecision & BaseDoc;

const collection = (db: Db) =>
  db.collection<BookingDecisionDoc>(COLLECTIONS.booking_decisions);

function toDecision(doc: BookingDecisionDoc): StoredBookingDecision {
  return StoredBookingDecisionSchema.parse(stripMeta(doc));
}

function toDoc(
  decision: StoredBookingDecision,
  at: string,
): BookingDecisionDoc {
  const parsed = StoredBookingDecisionSchema.parse(decision);
  return { ...parsed, _id: parsed.request_id, created_at: at, updated_at: at };
}

export type BookingDecisionFilter = {
  status?: DecisionStatus | DecisionStatus[];
  room_id?: string;
  day?: Day;
  /** Only decisions made against this timetable version (null: decisions without one). */
  timetable_version?: string | null;
};

function decisionQuery(
  filter: BookingDecisionFilter,
): Filter<BookingDecisionDoc> {
  const query: Filter<BookingDecisionDoc> = {};
  if (filter.status !== undefined) {
    query.status = Array.isArray(filter.status)
      ? { $in: filter.status }
      : filter.status;
  }
  if (filter.room_id !== undefined) query.room_id = filter.room_id;
  if (filter.day !== undefined) query.day = filter.day;
  if (filter.timetable_version !== undefined) {
    query.timetable_version = filter.timetable_version;
  }
  return query;
}

/** Decisions in request-id order, optionally filtered. */
export async function listBookingDecisions(
  db: Db,
  filter: BookingDecisionFilter = {},
): Promise<StoredBookingDecision[]> {
  const docs = await collection(db)
    .find(decisionQuery(filter), { sort: { _id: 1 } })
    .toArray();
  return docs.map(toDecision);
}

/** Request ids that have a decision, optionally for one timetable version. */
export async function listDecidedRequestIds(
  db: Db,
  filter: Pick<BookingDecisionFilter, "timetable_version"> = {},
): Promise<string[]> {
  return collection(db).distinct("_id", decisionQuery(filter));
}

export async function getBookingDecision(
  db: Db,
  requestId: string,
): Promise<StoredBookingDecision | null> {
  const doc = await collection(db).findOne({ _id: requestId });
  return doc ? toDecision(doc) : null;
}

/** Inserts or replaces the decision for its request, keeping the original `created_at`. */
export async function upsertBookingDecision(
  db: Db,
  decision: StoredBookingDecision,
): Promise<StoredBookingDecision> {
  const doc = toDoc(decision, nowIso());
  await replaceKeepingCreatedAt(collection(db), doc);
  return stripMeta(doc);
}

/** Replaces every decision (a full Spectra run). */
export async function replaceBookingDecisions(
  db: Db,
  decisions: readonly StoredBookingDecision[],
): Promise<number> {
  const at = nowIso();
  const docs = decisions.map((decision) => toDoc(decision, at));
  const result = await collection(db).bulkWrite(
    [
      { deleteMany: { filter: {} } },
      ...docs.map((document) => ({ insertOne: { document } })),
    ],
    { ordered: true },
  );
  return result.insertedCount;
}

/** Decisions per status (every status present, zero when absent). */
export async function countBookingDecisionsByStatus(
  db: Db,
  filter: Pick<BookingDecisionFilter, "timetable_version"> = {},
): Promise<Record<DecisionStatus, number>> {
  const counts: Record<DecisionStatus, number> = {
    approved: 0,
    rejected: 0,
    alternative_offered: 0,
  };
  const rows = await collection(db)
    .aggregate<{
      _id: DecisionStatus;
      n: number;
    }>([
      { $match: decisionQuery(filter) },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ])
    .toArray();
  for (const row of rows) {
    if (Object.hasOwn(counts, row._id)) counts[row._id] = row.n;
  }
  return counts;
}
