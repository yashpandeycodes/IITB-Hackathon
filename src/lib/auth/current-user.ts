import "server-only";
import type { User } from "@/lib/contracts/user";
import { getDb } from "@/lib/db/client";
import { findUserById, isSessionRevoked, toUser } from "@/lib/db/repos/users";
import type { SessionClaims } from "./session";

/**
 * The user named by **verified** session claims as currently stored, or null: no claims,
 * revoked `jti`, or the account is gone or unverified. Two indexed lookups, run in parallel.
 * Shared by `getCurrentUser` (Route Handlers, `./guards`) and `getSessionUser` (Server
 * Components, `./server-session`). Only pass claims from `readSessionClaims` /
 * `verifySessionClaims`: this function trusts them.
 */
export async function userForClaims(
  claims: SessionClaims | null,
): Promise<User | null> {
  if (!claims) return null;
  const db = await getDb();
  const [revoked, doc] = await Promise.all([
    isSessionRevoked(db, claims.jti),
    findUserById(db, claims.user.id),
  ]);
  if (revoked || !doc?.is_verified) return null;
  return toUser(doc);
}
