import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api";
import { logoutSession } from "@/lib/auth/accounts";
import { NO_STORE } from "@/lib/auth/http";

/**
 * Revokes this session's token (other browsers signed in to the same account are unaffected)
 * and clears the cookie. POST only.
 */
export const POST = withHandler(async (request) => {
  const cleared = await logoutSession(request);
  const response = NextResponse.json(
    {
      ok: true,
      data: null,
      success: true,
      message: "Logged out successfully.",
    },
    { headers: NO_STORE },
  );
  response.cookies.set(cleared);
  return response;
});
