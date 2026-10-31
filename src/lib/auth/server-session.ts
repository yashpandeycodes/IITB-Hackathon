import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { User } from "@/lib/contracts/user";
import { userForClaims } from "./current-user";
import { readSessionClaims } from "./session";

/**
 * Where to send a request whose session was rejected: `GET /api/auth/session-expired` clears the
 * cookie and redirects to `/login` (append `?redirect=<path>` to come back after signing in).
 */
export const SESSION_EXPIRED_PATH = "/api/auth/session-expired";

/**
 * The signed-in user for Server Components (layouts, pages), or null. Reads the session cookie
 * from the incoming request (`await cookies()`) and applies the same checks as the Route
 * Handler guards (`getCurrentUser`): a valid signature, a `jti` that has not been logged out,
 * and an account that still exists and is verified. The user is re-read, so the current role
 * applies, not the one in the token.
 *
 * Wrapped in React `cache`, so a layout and its page share one lookup per request. Reading
 * cookies makes the route dynamic. Like `getCurrentUser`, a database failure throws (the
 * nearest error boundary renders) rather than reading as signed out.
 *
 * ```tsx
 * // src/app/(app)/layout.tsx
 * import { redirect } from "next/navigation";
 * import { getSessionUser } from "@/lib/auth/server-session";
 *
 * export default async function AppLayout({ children }: { children: React.ReactNode }) {
 *   const user = await getSessionUser();
 *   // Not `/login`: the cookie may still carry a valid signature (revoked or deleted user),
 *   // and the proxy would bounce `/login` straight back here. This route clears it first.
 *   if (!user) redirect(SESSION_EXPIRED_PATH);
 *   return <Shell user={user}>{children}</Shell>;
 * }
 * ```
 *
 * Page gating only: Route Handlers must still call `requireUser` / `requireRole` themselves.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  return userForClaims(await readSessionClaims(await cookies()));
});
