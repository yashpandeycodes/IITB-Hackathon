import { LoginRequestSchema } from "@/lib/contracts/auth";
import { passwordLogin, toLegacyUser } from "@/lib/auth/accounts";
import { legacyJson, parseFormBody, withLegacyHandler } from "@/lib/auth/http";

const UNVERIFIED =
  "Account email has not been verified. A fresh OTP has been sent.";

/**
 * Email + password sign-in. Body `{ email, password }`.
 * 200 `{ ok, data: User, success, message, user }` + session cookie ·
 * 403 `{ requiresOtp: true, email, demoMode, demoOtp? }` + pending-sign-up cookie for an
 * unverified sign-up (a new code is sent) · 401 generic failure · 429 after 10 failures per
 * IP + email or 20 per email in 10 minutes.
 */
export const POST = withLegacyHandler(async (request) => {
  const { email, password } = await parseFormBody(request, LoginRequestSchema);
  const result = await passwordLogin(request, email, password);

  if (result.kind === "needs_otp") {
    const response = legacyJson(
      {
        ok: false,
        code: "FORBIDDEN",
        error: UNVERIFIED,
        requiresOtp: true,
        message: UNVERIFIED,
        email: result.email,
        ...result.dispatch,
      },
      403,
    );
    response.cookies.set(result.pending);
    return response;
  }

  const response = legacyJson({
    ok: true,
    data: result.user,
    success: true,
    message: "Signed in successfully.",
    user: toLegacyUser(result.user),
  });
  response.cookies.set(result.session);
  return response;
});
