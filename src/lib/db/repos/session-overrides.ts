import "server-only";
import type { Db, Filter } from "mongodb";
import {
  StoredSessionOverrideSchema,
  type StoredSessionOverride,
} from "@/lib/contracts";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { nowIso, replaceKeepingCreatedAt, stripMeta } from "./meta";

/** `session_overrides`: Week-7-only session moves, `_id` = `session_id`. */
export type SessionOverrideDoc = StoredSessionOverride & BaseDoc;

const collection = (db: Db) =>
  db.collection<SessionOverrideDoc>(COLLECTIONS.session_overrides);

function toOverride(doc: SessionOverrideDoc): StoredSessionOverride {
  return StoredSessionOverrideSchema.parse(stripMeta(doc));
}

function toDoc(
  override: StoredSessionOverride,
  at: string,
): SessionOverrideDoc {
  const parsed = StoredSessionOverrideSchema.parse(override);
  return { ...parsed, _id: parsed.session_id, created_at: at, updated_at: at };
}

export type SessionOverrideFilter = {
  displaced_by?: string;
  /** Only overrides computed for this timetable version (null matches none). */
  timetable_version?: string | null;
};

function overrideQuery(
  filter: SessionOverrideFilter,
): Filter<SessionOverrideDoc> {
  const query: Filter<SessionOverrideDoc> = {};
  if (filter.displaced_by !== undefined) {
    query.displaced_by = filter.displaced_by;
  }
  if (filter.timetable_version !== undefined) {
    // The field is required, so a null version selects nothing.
    query.timetable_version = filter.timetable_version ?? { $in: [] };
  }
  return query;
}

/** Overrides in session-id order, optionally filtered. */
export async function listSessionOverrides(
  db: Db,
  filter: SessionOverrideFilter = {},
): Promise<StoredSessionOverride[]> {
  const docs = await collection(db)
    .find(overrideQuery(filter), { sort: { _id: 1 } })
    .toArray();
  return docs.map(toOverride);
}

export function countSessionOverrides(
  db: Db,
  filter: SessionOverrideFilter = {},
): Promise<number> {
  return collection(db).countDocuments(overrideQuery(filter));
}

/** Inserts or replaces the override for its session. */
export async function upsertSessionOverride(
  db: Db,
  override: StoredSessionOverride,
): Promise<StoredSessionOverride> {
  const doc = toDoc(override, nowIso());
  await replaceKeepingCreatedAt(collection(db), doc);
  return stripMeta(doc);
}

/**
 * Replaces every override (a full Spectra run): upserts each one by `_id`, then deletes the
 * ones not in `overrides`. Never deletes first, so a concurrent reader never sees the
 * collection empty mid-run. Returns how many were written.
 */
export async function replaceSessionOverrides(
  db: Db,
  overrides: readonly StoredSessionOverride[],
): Promise<number> {
  const at = nowIso();
  const docs = overrides.map((override) => toDoc(override, at));
  await collection(db).bulkWrite(
    [
      ...docs.map((replacement) => ({
        replaceOne: {
          filter: { _id: replacement._id },
          replacement,
          upsert: true,
        },
      })),
      { deleteMany: { filter: { _id: { $nin: docs.map((d) => d._id) } } } },
    ],
    { ordered: true },
  );
  return docs.length;
}

/** Removes the overrides a booking caused (e.g. when it is cancelled). Returns how many. */
export async function deleteSessionOverridesFor(
  db: Db,
  requestId: string,
): Promise<number> {
  const result = await collection(db).deleteMany({ displaced_by: requestId });
  return result.deletedCount;
}
