import "server-only";
import type { Db } from "mongodb";
import {
  TimetableVersionSchema,
  type TimetableVersion,
  type TimetableVersionStatus,
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

/** A version without its assignments, for listings. */
export type TimetableVersionSummary = Omit<TimetableVersion, "assignments"> & {
  assignment_count: number;
};

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
