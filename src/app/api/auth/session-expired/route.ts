import { NextResponse, type NextRequest } from "next/server";
import { withHandler } from "@/lib/api";
import { NO_STORE } from "@/lib/auth/http";
import { clearSession } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/redirect";

export const dynamic = "force-dynamic";

/**
 * Public. Clears the session cookie and redirects (303) to `/login`, keeping a safe
 * `?redirect=<path>`. For pages whose session was rejected although its cookie still has a
 * valid signature (revoked token, deleted or unverified account): sending those straight to
 * `/login` would loop, because the proxy bounces a signed cookie away from `/login`. Only
 * clears this browser's cookie, so it is harmless if triggered from elsewhere.
 */
export const GET = withHandler(async (request: NextRequest) => {
  const raw = request.nextUrl.searchParams.get("redirect");
  const target = safeRedirectPath(raw, "");
  const login = new URL("/login", request.url);
  if (target) login.searchParams.set("redirect", target);
  const response = NextResponse.redirect(login, {
    status: 303,
    headers: NO_STORE,
  });
  response.cookies.set(clearSession());
  return response;
});
