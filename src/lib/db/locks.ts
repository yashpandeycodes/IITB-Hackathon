import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { ApiError } from "@/lib/errors";
import { COLLECTIONS } from "./collections";
import { isDuplicateKeyError } from "./repos/meta";

/**
 * Single-flight locks across processes: one `locks` document per lock name (`_id`), held
 * until released or until `expires_at` passes (so a crashed holder can't block forever).
 */

type LockDoc = {
  _id: string;
  token: string;
  acquired_at: Date;
  expires_at: Date;
};

/** The lock every dataset-wide rewrite (reset, import) takes. */
export const DATASET_LOCK = "dataset";

/** Generous: a reset takes under a second locally and Vercel caps routes at 60 s. */
const DEFAULT_TTL_MS = 120_000;

const collection = (db: Db) => db.collection<LockDoc>(COLLECTIONS.locks);

/** Takes `name` if it is free or expired. Returns the holder token, or null when held. */
export async function acquireLock(
  db: Db,
  name: string,
  ttlMs = DEFAULT_TTL_MS,
): Promise<string | null> {
  const now = new Date();
  const token = randomUUID();
  try {
    // Matches only a free (expired) lock; otherwise the upsert collides on `_id`.
    await collection(db).findOneAndUpdate(
      { _id: name, expires_at: { $lte: now } },
      {
        $set: {
          token,
          acquired_at: now,
          expires_at: new Date(now.getTime() + ttlMs),
        },
      },
      { upsert: true },
    );
    return token;
  } catch (err) {
    if (isDuplicateKeyError(err)) return null;
    throw err;
  }
}

/** Releases `name` if `token` still holds it. */
export async function releaseLock(
  db: Db,
  name: string,
  token: string,
): Promise<void> {
  await collection(db).deleteOne({ _id: name, token });
}

/** `CONFLICT` (409) for a dataset rewrite that overlaps another one. */
export const datasetBusy = (cause?: unknown) =>
  new ApiError(
    "CONFLICT",
    "A reset or import is already running. Try again in a moment.",
    undefined,
    cause === undefined ? undefined : { cause },
  );

/**
 * Runs `fn` while holding the dataset lock. A concurrent caller gets `CONFLICT` at once, and a
 * duplicate-key error that still slips through (another writer outside the lock) becomes
 * `CONFLICT` too rather than a 500.
 */
export async function withDatasetLock<T>(
  db: Db,
  fn: () => Promise<T>,
): Promise<T> {
  const token = await acquireLock(db, DATASET_LOCK);
  if (token === null) throw datasetBusy();
  try {
    return await fn();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw datasetBusy(err);
    throw err;
  } finally {
    await releaseLock(db, DATASET_LOCK, token).catch((err: unknown) => {
      console.error("[locks] failed to release the dataset lock", err);
    });
  }
}
