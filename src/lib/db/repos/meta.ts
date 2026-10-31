import "server-only";
import { MongoServerError, type Collection, type Db } from "mongodb";
import type { Origin } from "@/lib/contracts";
import type { BaseDoc, CollectionName } from "../collections";

const IST_OFFSET_MS = 330 * 60_000;

/** Current time as an ISO-8601 string in IST, e.g. `"2027-02-05T10:00:00+05:30"` (§4.2). */
export function nowIso(date: Date = new Date()): string {
  return (
    new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 19) +
    "+05:30"
  );
}

/** A shallow copy of `obj` without `keys`. */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> {
  const out = { ...obj } as Record<PropertyKey, unknown>;
  for (const key of keys) delete out[key];
  return out as Omit<T, K>;
}

type MetaKey = keyof BaseDoc;
const META_KEYS: readonly MetaKey[] = [
  "_id",
  "created_at",
  "updated_at",
  "origin",
];

/**
 * Drops the Mongo-only metadata (`_id`, `created_at`, `updated_at`, `origin`) so the result
 * is the contract DTO. Pass `keep` for metadata that is also a contract field (e.g. the
 * `created_at` of a timetable version).
 */
export function stripMeta<T extends object>(
  doc: T,
  keep: readonly MetaKey[] = [],
): Omit<T, MetaKey> {
  const drop = META_KEYS.filter((key) => !keep.includes(key));
  return omit(doc as T & BaseDoc, drop) as Omit<T, MetaKey>;
}

/** Adds `_id` and timestamps (and `origin` when given) to a contract object. */
export function withMeta<T extends object>(
  entity: T,
  id: string,
  options: { origin?: Origin; at?: string } = {},
): T & BaseDoc {
  const at = options.at ?? nowIso();
  return {
    ...entity,
    _id: id,
    created_at: at,
    updated_at: at,
    ...(options.origin ? { origin: options.origin } : {}),
  };
}

/**
 * Replaces the document with `doc._id` (inserting it when missing) and keeps the stored
 * `created_at`. A replace, not a `$set`, so optional fields absent from `doc` are removed.
 */
export async function replaceKeepingCreatedAt<D extends BaseDoc>(
  collection: Collection<D>,
  doc: D,
): Promise<void> {
  const raw = collection as unknown as Collection<BaseDoc>;
  const existing = await raw.findOne(
    { _id: doc._id },
    { projection: { created_at: 1 } },
  );
  await raw.replaceOne(
    { _id: doc._id },
    { ...doc, created_at: existing?.created_at ?? doc.created_at },
    { upsert: true },
  );
}

/** True for an E11000 duplicate-key error, optionally only when `field` is part of the clashing key. */
export function isDuplicateKeyError(err: unknown, field?: string): boolean {
  if (!(err instanceof MongoServerError) || err.code !== 11000) return false;
  if (field === undefined) return true;
  const keyPattern: unknown = err.keyPattern;
  return (
    typeof keyPattern === "object" && keyPattern !== null && field in keyPattern
  );
}

/**
 * Next prefixed, zero-padded id for a collection (`"TT-0007"`, `"CR-0003"`), one above the
 * highest existing one. Pair with {@link insertWithSequentialId} to survive concurrent inserts.
 */
export async function nextSequentialId(
  collection: Collection<BaseDoc>,
  prefix: string,
  width = 4,
): Promise<string> {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const ids = await collection
    .find({ _id: { $regex: pattern } }, { projection: { _id: 1 } })
    .toArray();
  let max = 0;
  for (const { _id } of ids) {
    const n = Number(pattern.exec(_id)?.[1] ?? 0);
    if (n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

/**
 * Inserts a document under the next sequential id, retrying when a concurrent writer took the
 * same id first. Returns the id that was used.
 */
export async function insertWithSequentialId<D extends BaseDoc>(
  db: Db,
  name: CollectionName,
  prefix: string,
  build: (id: string) => D,
  attempts = 5,
): Promise<string> {
  const collection = db.collection<BaseDoc>(name);
  for (let attempt = 1; ; attempt++) {
    const id = await nextSequentialId(collection, prefix);
    try {
      await db.collection<D>(name).insertOne(
        // The driver's OptionalUnlessRequiredId type can't see through the generic `D`.
        build(id) as Parameters<Collection<D>["insertOne"]>[0],
      );
      return id;
    } catch (err) {
      if (!isDuplicateKeyError(err, "_id") || attempt >= attempts) throw err;
    }
  }
}
