import "server-only";
import type { Role } from "@/lib/contracts/enums";
import type { SessionUser, User } from "@/lib/contracts/user";
import { forbidden, unauthenticated } from "@/lib/errors";
import { clientIp, rateLimited } from "./http";
import { limits, type RateLimiter } from "./rate-limit";
import { userForClaims } from "./current-user";
import { readSessionClaims } from "./session";

/**
 * Route Handler guards. They throw `ApiError`s, which `withHandler` turns into the envelope.
 * The proxy only checks the token's signature; these also reject logged-out (revoked) tokens
 * and re-read the user, so a changed role applies at once and a deleted user is signed out.
 */

/**
 * The signed-in user as currently stored, or null: no/invalid token, revoked `jti`, or the
 * account is gone or unverified.
 */
export async function getCurrentUser(request: Request): Promise<User | null> {
  return userForClaims(await readSessionClaims(request));
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

export { assertNotSelf } from "./policy";

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

function enforce(
  pairs: readonly (readonly [RateLimiter, string])[],
  message: string,
): void {
  for (const [limiter, key] of pairs) {
    const result = limiter.hit(key);
    if (!result.allowed) throw rateLimited(message, result.retryAfterSeconds);
  }
}

/** One plain-language parse (`POST /api/bookings/parse`) per the per-user and per-IP limits. */
export function requireAiParseQuota(request: Request, user: SessionUser): void {
  enforce(
    [
      [limits.aiParseUser, user.id],
      [limits.aiParseIp, clientIp(request)],
    ],
    "Too many requests to the booking assistant. Try again in a few minutes.",
  );
}

/** One booking write (submit, cancel, approve or reject) per the per-user and per-IP limits. */
export function requireBookingWriteQuota(
  request: Request,
  user: SessionUser,
): void {
  enforce(
    [
      [limits.bookingWriteUser, user.id],
      [limits.bookingWriteIp, clientIp(request)],
    ],
    "Too many booking changes. Try again in a few minutes.",
  );
}

/** One change run (propose, preview, manual placement, approve, reject) per the per-user and per-IP limits. */
export function requireChangeRunQuota(
  request: Request,
  user: SessionUser,
): void {
  enforce(
    [
      [limits.changeRunUser, user.id],
      [limits.changeRunIp, clientIp(request)],
    ],
    "Too many timetable change requests. Try again in a few minutes.",
  );
}

/** One assistant turn (`POST /api/assistant`) per the per-user and per-IP limits. */
export function requireAssistantQuota(
  request: Request,
  user: SessionUser,
): void {
  enforce(
    [
      [limits.assistantUser, user.id],
      [limits.assistantIp, clientIp(request)],
    ],
    "Too many messages to the assistant. Try again in a few minutes.",
  );
}

/** One `POST /api/explain` per the per-user limit. */
export function requireExplainQuota(user: SessionUser): void {
  enforce(
    [[limits.explainUser, user.id]],
    "Too many explanation requests. Try again in a few minutes.",
  );
}
