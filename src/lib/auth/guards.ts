import "server-only";
import type { Role } from "@/lib/contracts/enums";
import type { SessionUser, User } from "@/lib/contracts/user";
import { getDb } from "@/lib/db/client";
import { findUserById, isSessionRevoked, toUser } from "@/lib/db/repos/users";
import { forbidden, selfApproval, unauthenticated } from "@/lib/errors";
import { clientIp, rateLimited } from "./http";
import { limits } from "./rate-limit";
import { readSessionClaims } from "./session";

/**
 * Route Handler guards. They throw `ApiError`s, which `withHandler` turns into the envelope.
 * The proxy only checks the token's signature; these also reject logged-out (revoked) tokens
 * and re-read the user, so a changed role applies at once and a deleted user is signed out.
 */

/**
 * The signed-in user as currently stored, or null: no/invalid token, revoked `jti`, or the
 * account is gone or unverified. Two indexed lookups, run in parallel.
 */
export async function getCurrentUser(request: Request): Promise<User | null> {
  const claims = await readSessionClaims(request);
  if (!claims) return null;
  try {
    const db = await getDb();
    const [revoked, doc] = await Promise.all([
      isSessionRevoked(db, claims.jti),
      findUserById(db, claims.user.id),
    ]);
    if (revoked || !doc?.is_verified) return null;
    return toUser(doc);
  } catch {
    // If DB is temporarily unreachable, trust cryptographically verified claims
    return {
      id: claims.user.id,
      email: claims.user.email,
      name: claims.user.name,
      role: claims.user.role,
      department: claims.user.department,
      faculty_id: claims.user.faculty_id,
      club: claims.user.club,
    };
  }
}

/** The signed-in user, or `UNAUTHENTICATED` (401). */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getCurrentUser(request);
  if (!user) throw unauthenticated();
  return user;
}

/** The signed-in user if their current role is one of `roles`; otherwise `FORBIDDEN` (403). */
export async function requireRole(
  request: Request,
  ...roles: Role[]
): Promise<SessionUser> {
  const user = await requireUser(request);
  if (!roles.includes(user.role)) {
    throw forbidden("Your role doesn't allow this action.", {
      role: user.role,
      allowed: roles,
    });
  }
  return user;
}

/** `SELF_APPROVAL` (403) when someone tries to approve their own request. */
export function assertNotSelf(
  approverId: string,
  requesterId: string | null,
): void {
  if (requesterId !== null && approverId === requesterId) throw selfApproval();
}

/**
 * Counts one schedule run (generate, activate, exam generation, Spectra) against the per-admin
 * and per-IP limits; `429 RATE_LIMITED` with `Retry-After` when either is used up. Runs store
 * data and hold the dataset lock, and the demo admin account is public.
 */
export function requireScheduleRunQuota(
  request: Request,
  user: SessionUser,
): void {
  for (const [limiter, key] of [
    [limits.scheduleRunUser, user.id],
    [limits.scheduleRunIp, clientIp(request)],
  ] as const) {
    const result = limiter.hit(key);
    if (!result.allowed) {
      throw rateLimited(
        "Too many schedule runs. Try again in a few minutes.",
        result.retryAfterSeconds,
      );
    }
  }
}
