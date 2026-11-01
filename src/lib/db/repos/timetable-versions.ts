import "server-only";
import type { Db } from "mongodb";
import {
  TimetableVersionSchema,
  type TimetableVersion,
  type TimetableVersionStatus,
  type TimetableVersionSummary,
} from "@/lib/contracts";
import { notFound } from "@/lib/errors";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { ensureIndexesOnce } from "../indexes";
import { insertWithSequentialId, nowIso, stripMeta } from "./meta";

/**
 * `timetable_versions` (architecture §5.3): one doc per generated or approved timetable,
 * assignments embedded. A partial unique index keeps at most one `active` version.
 */
export type TimetableVersionDoc = TimetableVersion & BaseDoc;

const collection = (db: Db) =>
  db.collection<TimetableVersionDoc>(COLLECTIONS.timetable_versions);

function toVersion(doc: TimetableVersionDoc): TimetableVersion {
  return TimetableVersionSchema.parse(stripMeta(doc, ["created_at"]));
}

export async function getActiveTimetableVersion(
  db: Db,
): Promise<TimetableVersion | null> {
  const doc = await collection(db).findOne({ status: "active" });
  return doc ? toVersion(doc) : null;
}

export async function getTimetableVersion(
  db: Db,
  id: string,
): Promise<TimetableVersion | null> {
  const doc = await collection(db).findOne({ _id: id });
  return doc ? toVersion(doc) : null;
}

/** Newest first, without assignments. */
export async function listTimetableVersions(
  db: Db,
  filter: { status?: TimetableVersionStatus; limit?: number } = {},
): Promise<TimetableVersionSummary[]> {
  const docs = await collection(db)
    .find(filter.status ? { status: filter.status } : {}, {
      sort: { _id: -1 },
      limit: filter.limit ?? 50,
    })
    .toArray();
  return docs.map((doc) => {
    const { assignments, ...rest } = toVersion(doc);
    return { ...rest, assignment_count: assignments.length };
  });
}

export type NewTimetableVersion = Omit<TimetableVersion, "id" | "created_at">;

/** Stores a new version under the next `TT-NNNN` id. Use `status: "draft"` and activate separately. */
export async function insertTimetableVersion(
  db: Db,
  version: NewTimetableVersion,
): Promise<TimetableVersion> {
  await ensureIndexesOnce(db);
  const at = nowIso();
  const build = (id: string) =>
    TimetableVersionSchema.parse({ ...version, id, created_at: at });
  const id = await insertWithSequentialId<TimetableVersionDoc>(
    db,
    COLLECTIONS.timetable_versions,
    "TT",
    (id) => ({ ...build(id), _id: id, updated_at: at }),
  );
  return build(id);
}

/**
 * Makes `id` the active version and supersedes the previous one. Not transactional (local
 * Mongo is standalone); the partial unique index guarantees there is never a second active.
 */
export async function activateTimetableVersion(
  db: Db,
  id: string,
): Promise<TimetableVersion> {
  await ensureIndexesOnce(db);
  const target = await collection(db).findOne({ _id: id });
  if (!target) throw notFound(`Timetable version ${id} not found.`);
  if (target.status !== "active") {
    const at = nowIso();
    await collection(db).updateMany(
      { status: "active", _id: { $ne: id } },
      { $set: { status: "superseded", updated_at: at } },
    );
    await collection(db).updateOne(
      { _id: id },
      { $set: { status: "active", updated_at: at } },
    );
  }
  const updated = await getTimetableVersion(db, id);
  if (!updated) throw notFound(`Timetable version ${id} not found.`);
  return updated;
}

/**
 * Drafts and superseded versions kept for history; older ones are deleted after each schedule
 * run and each stored change proposal (the drafts of pending change requests are always kept on
 * top). The usual `keep` for {@link pruneInactiveTimetableVersions}.
 */
export const KEEP_INACTIVE_VERSIONS = 20;

/**
 * Deletes all but the newest `keep` non-active versions (the active one is always kept), so
 * repeated runs can't grow the collection without bound. The draft of a `pending` change request
 * is never deleted (nor counted against `keep`): approving the request activates it. Returns how
 * many were deleted.
 */
export async function pruneInactiveTimetableVersions(
  db: Db,
  keep: number,
): Promise<number> {
  const pending = await db
    .collection<{ _id: string; proposed_version: string | null }>(
      COLLECTIONS.change_requests,
    )
    .find(
      { status: "pending", proposed_version: { $type: "string" } },
      { projection: { proposed_version: 1 } },
    )
    .toArray();
  const protectedIds = pending.flatMap((cr) =>
    cr.proposed_version ? [cr.proposed_version] : [],
  );
  // Newest first by creation time (ids sort as text, so TT-10000 would precede TT-9999).
  const keepIds = await collection(db)
    .find(
      { status: { $ne: "active" }, _id: { $nin: protectedIds } },
      { projection: { _id: 1 } },
    )
    .sort({ created_at: -1, _id: -1 })
    .limit(keep)
    .map((doc) => doc._id)
    .toArray();
  const result = await collection(db).deleteMany({
    status: { $ne: "active" },
    _id: { $nin: [...keepIds, ...protectedIds] },
  });
  return result.deletedCount;
}

/** Deletes version `id` if it is still a draft (a rejected or superseded proposal). */
export async function deleteDraftTimetableVersion(
  db: Db,
  id: string,
): Promise<boolean> {
  const result = await collection(db).deleteOne({ _id: id, status: "draft" });
  return result.deletedCount === 1;
}
