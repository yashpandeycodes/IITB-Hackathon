import { SignupRequestSchema } from "@/lib/contracts/auth";
import { registerAccount } from "@/lib/auth/accounts";
import { legacyJson, parseFormBody, withLegacyHandler } from "@/lib/auth/http";

/**
 * Self-service sign-up, Club Representative only (Faculty, Admin and Department Coordinator →
 * 403). Body: the signup form (`fullName, email, role, password, confirmPassword,
 * agreedToTerms`). 200 `{ success, message, email, demoMode, demoOtp? }` + an httpOnly
 * pending-sign-up cookie that /verify-otp and /resend-otp require · 409 `EMAIL_TAKEN` (verified)
 * or `CONFLICT` (another browser's sign-up is pending) · 429 rate limits.
 */
export const POST = withLegacyHandler(async (request) => {
  const body = await parseFormBody(request, SignupRequestSchema);
  const { dispatch, pending } = await registerAccount(request, {
    name: body.fullName,
    email: body.email,
    role: body.role,
    password: body.password,
  });

  const response = legacyJson({
    ok: true,
    data: { email: body.email, ...dispatch },
    success: true,
    message:
      "A 6-digit verification code has been dispatched to your email address.",
    email: body.email,
    ...dispatch,
  });
  response.cookies.set(pending);
  return response;
});
