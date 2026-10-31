import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api";
import { toLegacyUser } from "@/lib/auth/accounts";
import { getCurrentUser } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { clearSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function signedOut() {
  const response = NextResponse.json(
    {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Please sign in to continue.",
      },
      authenticated: false,
      user: null,
    },
    { status: 401, headers: NO_STORE },
  );
  response.cookies.set(clearSession());
  return response;
}

/**
 * The signed-in user as stored now (revoked sessions and deleted accounts → 401).
 * 200 `{ ok: true, data: User, authenticated: true, user: { id, name, email, role: label,
 * isVerified } }` · 401 envelope (also `authenticated: false, user: null`).
 */
export const GET = withHandler(async (request) => {
  const user = await getCurrentUser(request);
  if (!user) return signedOut();
  return NextResponse.json(
    {
      ok: true,
      data: user,
      authenticated: true,
      user: { ...toLegacyUser(user), isVerified: true },
    },
    { headers: NO_STORE },
  );
});
