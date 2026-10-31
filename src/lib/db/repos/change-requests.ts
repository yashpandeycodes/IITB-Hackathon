import "server-only";
import type { Db, Filter } from "mongodb";
import {
  ChangeRequestSchema,
  type ChangeRequest,
  type ChangeStatus,
} from "@/lib/contracts";
import { notFound } from "@/lib/errors";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { insertWithSequentialId, nowIso, omit, stripMeta } from "./meta";

/** `change_requests` (architecture §5.3): `_id` = `id` = `CR-NNNN`. */
export type ChangeRequestDoc = ChangeRequest & BaseDoc;

const collection = (db: Db) =>
  db.collection<ChangeRequestDoc>(COLLECTIONS.change_requests);

function toChangeRequest(doc: ChangeRequestDoc): ChangeRequest {
  return ChangeRequestSchema.parse(stripMeta(doc, ["created_at"]));
}

/** Newest first, optionally filtered. */
export async function listChangeRequests(
  db: Db,
  filter: {
    status?: ChangeStatus | ChangeStatus[];
    requested_by?: string;
    limit?: number;
  } = {},
): Promise<ChangeRequest[]> {
  const query: Filter<ChangeRequestDoc> = {};
  if (filter.status !== undefined) {
    query.status = Array.isArray(filter.status)
      ? { $in: filter.status }
      : filter.status;
  }
  if (filter.requested_by !== undefined) {
    query.requested_by = filter.requested_by;
  }
  const docs = await collection(db)
    .find(query, { sort: { _id: -1 }, limit: filter.limit ?? 200 })
    .toArray();
  return docs.map(toChangeRequest);
}

export async function getChangeRequest(
  db: Db,
  id: string,
): Promise<ChangeRequest | null> {
  const doc = await collection(db).findOne({ _id: id });
  return doc ? toChangeRequest(doc) : null;
}

export type NewChangeRequest = Omit<ChangeRequest, "id" | "created_at">;

/** Stores a new change request under the next `CR-NNNN` id. */
export async function insertChangeRequest(
  db: Db,
  request: NewChangeRequest,
): Promise<ChangeRequest> {
  const at = nowIso();
  const build = (id: string) =>
    ChangeRequestSchema.parse({ ...request, id, created_at: at });
  const id = await insertWithSequentialId<ChangeRequestDoc>(
    db,
    COLLECTIONS.change_requests,
    "CR",
    (id) => ({ ...build(id), _id: id, updated_at: at }),
  );
  return build(id);
}

/**
 * Applies `patch` to a change request and returns the result. With `expectStatus`, the update
 * only happens while the request is still in that status (null when it has moved on).
 */
export async function updateChangeRequest(
  db: Db,
  id: string,
  patch: Partial<Omit<ChangeRequest, "id" | "created_at">>,
  options: { expectStatus?: ChangeStatus } = {},
): Promise<ChangeRequest | null> {
  const current = await getChangeRequest(db, id);
  if (!current) throw notFound(`Change request ${id} not found.`);
  const next = ChangeRequestSchema.parse({ ...current, ...patch, id });
  const filter: Filter<ChangeRequestDoc> = { _id: id };
  if (options.expectStatus) filter.status = options.expectStatus;
  const fields = omit(next, ["id", "created_at"]);
  const doc = await collection(db).findOneAndUpdate(
    filter,
    { $set: { ...fields, updated_at: nowIso() } },
    { returnDocument: "after" },
  );
  return doc ? toChangeRequest(doc) : null;
}

/** Change requests per status (every status present, zero when absent). */
export async function countChangeRequestsByStatus(
  db: Db,
  filter: { requested_by?: string; not_requested_by?: string } = {},
): Promise<Record<ChangeStatus, number>> {
  const counts: Record<ChangeStatus, number> = {
    proposing: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    infeasible: 0,
    applied: 0,
  };
  const match: Filter<ChangeRequestDoc> = {};
  if (filter.requested_by !== undefined) {
    match.requested_by = filter.requested_by;
  } else if (filter.not_requested_by !== undefined) {
    match.requested_by = { $ne: filter.not_requested_by };
  }
  const rows = await collection(db)
    .aggregate<{
      _id: ChangeStatus;
      n: number;
    }>([{ $match: match }, { $group: { _id: "$status", n: { $sum: 1 } } }])
    .toArray();
  for (const row of rows) {
    if (Object.hasOwn(counts, row._id)) counts[row._id] = row.n;
  }
  return counts;
}
