import { randomBytes } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import type { SessionUser } from "@/lib/contracts/user";
import { nowIso } from "@/lib/db/repos/meta";
import type { UserDoc } from "@/lib/db/repos/users";

/**
 * Test-only helpers for suites that need MongoDB. Each suite gets its own throwaway database
 * (`cit_test_auth_<random>`) on `TEST_MONGODB_URI` (default local) and drops it afterwards.
 * CI runs a MongoDB service; suites skip only when nothing answers a ping (e.g. a laptop
 * without `npm run db:start`). Never falls back to `MONGODB_URI`, so tests can't touch dev data.
 */

export const TEST_MONGO_URI =
  process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017";

export function throwawayDbName(): string {
  return `cit_test_auth_${randomBytes(4).toString("hex")}`;
}

/** Random, high-variety secret so env validation never flags it as a placeholder. */
export function testSecret(): string {
  return randomBytes(32).toString("base64url");
}

export async function mongoAvailable(): Promise<boolean> {
  const client = new MongoClient(TEST_MONGO_URI, {
    serverSelectionTimeoutMS: 1_500,
  });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

/**
 * Stores verified, password-less accounts for session fixtures, so `requireUser` (which
 * re-reads the user) accepts cookies signed for them. Upserts by `_id`.
 */
export async function insertSessionUsers(
  db: Db,
  sessionUsers: readonly SessionUser[],
): Promise<void> {
  const at = nowIso();
  for (const user of sessionUsers) {
    const doc: UserDoc = {
      ...user,
      _id: user.id,
      password_hash: null,
      is_verified: true,
      otp_hash: null,
      otp_expires_at: null,
      otp_attempts: 0,
      google_id: null,
      pending_nonce_hash: null,
      unverified_expires_at: null,
      created_at: at,
      updated_at: at,
    };
    await db
      .collection<UserDoc>("users")
      .replaceOne({ _id: user.id }, doc, { upsert: true });
  }
}
