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

/**
 * `change_requests` (architecture §5.3): `_id` = `id` = `CR-NNNN`. `applied_seq` is Mongo-only:
 * the order in which applied requests were applied (1, 2, …), so the exported change file lists
 * them in that order.
 */
export type ChangeRequestDoc = ChangeRequest &
  BaseDoc & { applied_seq?: number };

const collection = (db: Db) =>
  db.collection<ChangeRequestDoc>(COLLECTIONS.change_requests);

function toChangeRequest(doc: ChangeRequestDoc): ChangeRequest {
  return ChangeRequestSchema.parse(
    omit(stripMeta(doc, ["created_at"]), ["applied_seq"]),
  );
}

/**
 * Who a non-admin viewer is, for {@link ChangeRequestFilter.visible_to}: their own requests, and
 * those whose scope names their department (coordinators) or their faculty id (faculty). A null
 * or absent department / faculty id matches nothing.
 */
export type ChangeViewer = {
  requested_by: string;
  department?: string | null;
  faculty_id?: string | null;
};

export type ChangeRequestFilter = {
  status?: ChangeStatus | ChangeStatus[];
  requested_by?: string;
  /** Only requests built on this timetable version. */
  base_version?: string;
  /** Only requests built on any other version than this one. */
  not_base_version?: string;
  /** Only requests this viewer may see (see {@link ChangeViewer}); absent for admins. */
  visible_to?: ChangeViewer;
};

function query(filter: ChangeRequestFilter): Filter<ChangeRequestDoc> {
  const q: Filter<ChangeRequestDoc> = {};
  if (filter.status !== undefined) {
    q.status = Array.isArray(filter.status)
      ? { $in: filter.status }
      : filter.status;
  }
  if (filter.requested_by !== undefined) q.requested_by = filter.requested_by;
  if (filter.base_version !== undefined) {
    q.base_version = filter.base_version;
  } else if (filter.not_base_version !== undefined) {
    q.base_version = { $ne: filter.not_base_version };
  }
  if (filter.visible_to !== undefined) {
    const viewer = filter.visible_to;
    const visible: Filter<ChangeRequestDoc>[] = [
      { requested_by: viewer.requested_by },
    ];
    if (viewer.department) {
      visible.push({ "scope.departments": viewer.department });
    }
    if (viewer.faculty_id) {
      visible.push({ "scope.faculty_ids": viewer.faculty_id });
    }
    q.$or = visible;
  }
  return q;
}

/** Newest first, optionally filtered (at most `limit`, default 200). */
export async function listChangeRequests(
  db: Db,
  filter: ChangeRequestFilter & { limit?: number } = {},
): Promise<ChangeRequest[]> {
  const docs = await collection(db)
    .find(query(filter), {
      sort: { created_at: -1, _id: -1 },
      limit: filter.limit ?? 200,
    })
    .toArray();
  return docs.map(toChangeRequest);
}

export function countChangeRequests(
  db: Db,
  filter: ChangeRequestFilter = {},
): Promise<number> {
  return collection(db).countDocuments(query(filter));
}

/** Just enough of a change request to close it (see {@link listChangeRequestRefs}). */
export type ChangeRequestRef = Pick<ChangeRequest, "id" | "proposed_version">;

/**
 * The ids and draft versions of every matching request, oldest first, without loading the
 * documents (a projection): what rejecting a batch of stale or superseded proposals needs.
 */
export async function listChangeRequestRefs(
  db: Db,
  filter: ChangeRequestFilter,
): Promise<ChangeRequestRef[]> {
  const docs = await collection(db)
    .find(query(filter), {
      projection: { _id: 1, proposed_version: 1 },
      sort: { created_at: 1, _id: 1 },
    })
    .toArray();
  return docs.map((doc) => ({
    id: doc._id,
    proposed_version: doc.proposed_version ?? null,
  }));
}

/** Every applied request, in the order they were applied. */
export async function listAppliedChangeRequests(
  db: Db,
): Promise<ChangeRequest[]> {
  const docs = await collection(db)
    .find({ status: "applied" }, { sort: { applied_seq: 1, _id: 1 } })
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
 * only happens while the request is still in that status (null when it has moved on). With
 * `markApplied`, the request also gets the next apply position (see {@link ChangeRequestDoc}).
 */
export async function updateChangeRequest(
  db: Db,
  id: string,
  patch: Partial<Omit<ChangeRequest, "id" | "created_at">>,
  options: { expectStatus?: ChangeStatus; markApplied?: boolean } = {},
): Promise<ChangeRequest | null> {
  const current = await getChangeRequest(db, id);
  if (!current) throw notFound(`Change request ${id} not found.`);
  const next = ChangeRequestSchema.parse({ ...current, ...patch, id });
  const filter: Filter<ChangeRequestDoc> = { _id: id };
  if (options.expectStatus) filter.status = options.expectStatus;
  const fields: Partial<ChangeRequestDoc> = omit(next, ["id", "created_at"]);
  if (options.markApplied) fields.applied_seq = await nextAppliedSeq(db);
  const doc = await collection(db).findOneAndUpdate(
    filter,
    { $set: { ...fields, updated_at: nowIso() } },
    { returnDocument: "after" },
  );
  return doc ? toChangeRequest(doc) : null;
}

/**
 * Rejects request `id` while it is still in `expectStatus`, with who decided, when and why, in
 * one targeted update (no read). Returns false when the request had already moved on (or is gone).
 */
export async function markChangeRequestRejected(
  db: Db,
  id: string,
  decision: {
    expectStatus: ChangeStatus;
    decided_by: string;
    decided_at: string;
    comment: string | null;
  },
): Promise<boolean> {
  const result = await collection(db).updateOne(
    { _id: id, status: decision.expectStatus },
    {
      $set: {
        status: "rejected",
        decided_by: decision.decided_by,
        decided_at: decision.decided_at,
        comment: decision.comment,
        updated_at: nowIso(),
      },
    },
  );
  return result.matchedCount === 1;
}

async function nextAppliedSeq(db: Db): Promise<number> {
  const last = await collection(db).findOne(
    { applied_seq: { $exists: true } },
    { sort: { applied_seq: -1 }, projection: { applied_seq: 1 } },
  );
  return (last?.applied_seq ?? 0) + 1;
}

/** Deletes one change request (undoing a proposal whose draft could not be stored). */
export async function deleteChangeRequest(db: Db, id: string): Promise<void> {
  await collection(db).deleteOne({ _id: id });
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
