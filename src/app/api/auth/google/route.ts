import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Google sign-in is not available yet, so this always sends the browser back to the login
 * page with `?error=google_unavailable` (302), whatever `GOOGLE_CLIENT_ID` says.
 *
 * Before enabling it, build `/api/auth/google/callback` with: a random `state` stored in an
 * httpOnly cookie and checked on return (CSRF), PKCE (`code_challenge` S256 + verifier
 * cookie), server-side code exchange and ID-token verification, and account linking that
 * never grants a staff role.
 */
export function GET(request: Request) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", "google_unavailable");
  return NextResponse.redirect(url, 302);
}
