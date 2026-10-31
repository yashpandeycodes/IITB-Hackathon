import { VerifyOtpRequestSchema } from "@/lib/contracts/auth";
import {
  clearPendingCookie,
  toLegacyUser,
  verifyAccountOtp,
} from "@/lib/auth/accounts";
import { legacyJson, parseFormBody, withLegacyHandler } from "@/lib/auth/http";

/**
 * Body `{ email, otp }`, sent from the browser holding the pending-sign-up cookie.
 * 200 `{ ok, data: User, success, message, user }` + session cookie · 400 wrong/expired code
 * or wrong browser · 429 rate limits or 5 wrong codes.
 */
export const POST = withLegacyHandler(async (request) => {
  const { email, otp } = await parseFormBody(request, VerifyOtpRequestSchema);
  const { user, session } = await verifyAccountOtp(request, email, otp);
  const response = legacyJson({
    ok: true,
    data: user,
    success: true,
    message: "Email verified successfully! Session established.",
    user: toLegacyUser(user),
  });
  response.cookies.set(session);
  response.cookies.set(clearPendingCookie());
  return response;
});
