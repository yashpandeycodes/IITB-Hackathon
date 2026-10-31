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

/** The lock every dataset-wide rewrite (reset, import, generation, Spectra run) takes. */
export const DATASET_LOCK = "dataset";

/**
 * Just above Vercel's 60 s route cap (`maxDuration`): a holder killed by the platform frees the
 * lock 15 s later. Runs stay well inside it (reset ≈ 1 s, solver capped at 30 s of work).
 */
const DEFAULT_TTL_MS = 75_000;

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

/** `CONFLICT` (409) for dataset-wide work that overlaps another run. */
export const datasetBusy = (cause?: unknown) =>
  new ApiError(
    "CONFLICT",
    "Another reset, import or schedule run is in progress. Try again in a moment.",
    undefined,
    cause === undefined ? undefined : { cause },
  );

/**
 * Takes the dataset lock and returns its release function, for work that outlives one call (a
 * streamed generation). `CONFLICT` (409) at once when the lock is held. The release function is
 * idempotent and never throws (a failed release is logged; the lock then expires on its TTL).
 */
export async function acquireDatasetLock(db: Db): Promise<() => Promise<void>> {
  const token = await acquireLock(db, DATASET_LOCK);
  if (token === null) throw datasetBusy();
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await releaseLock(db, DATASET_LOCK, token).catch((err: unknown) => {
      console.error("[locks] failed to release the dataset lock", err);
    });
  };
}

/**
 * Runs `fn` while holding the dataset lock. A concurrent caller gets `CONFLICT` at once, and a
 * duplicate-key error that still slips through (another writer outside the lock) becomes
 * `CONFLICT` too rather than a 500.
 */
export async function withDatasetLock<T>(
  db: Db,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireDatasetLock(db);
  try {
    return await fn();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw datasetBusy(err);
    throw err;
  } finally {
    await release();
  }
}
