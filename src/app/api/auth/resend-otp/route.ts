import { ResendOtpRequestSchema } from "@/lib/contracts/auth";
import { resendAccountOtp } from "@/lib/auth/accounts";
import { legacyJson, parseFormBody, withLegacyHandler } from "@/lib/auth/http";

/**
 * Body `{ email }`, from the browser holding the pending-sign-up cookie.
 * 200 `{ success, message, demoMode, demoOtp? }` · 400 when there's no pending sign-up for this
 * email in this browser · 429 (5 codes per email per 10 minutes) · 503 global mail cap.
 */
export const POST = withLegacyHandler(async (request) => {
  const { email } = await parseFormBody(request, ResendOtpRequestSchema);
  const { dispatch, pending } = await resendAccountOtp(request, email);
  const response = legacyJson({
    ok: true,
    data: dispatch,
    success: true,
    message: "A fresh 6-digit verification code has been dispatched.",
    ...dispatch,
  });
  response.cookies.set(pending);
  return response;
});
