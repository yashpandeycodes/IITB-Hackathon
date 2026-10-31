import { ResendOtpRequestSchema } from "@/lib/contracts/auth";
import { resendAccountOtp } from "@/lib/auth/accounts";
import { legacyJson, parseFormBody, withLegacyHandler } from "@/lib/auth/http";

/**
 * Body `{ email }`, from the browser holding the pending-sign-up cookie.
 * 200 `{ ok, data: null, success, message }` (the code is only emailed) · 400 when there's no
 * pending sign-up for this email in this browser · 429 (5 codes per email per 10 minutes) ·
 * 503 `MAIL_UNAVAILABLE` (mail not configured, send failed or global cap).
 */
export const POST = withLegacyHandler(async (request) => {
  const { email } = await parseFormBody(request, ResendOtpRequestSchema);
  const { pending } = await resendAccountOtp(request, email);
  const response = legacyJson({
    ok: true,
    data: null,
    success: true,
    message:
      "A fresh 6-digit verification code has been dispatched to your email.",
  });
  response.cookies.set(pending);
  return response;
});
