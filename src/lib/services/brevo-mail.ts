import "server-only";
import { getServerEnv } from "@/lib/env";

/**
 * Brevo transactional mail for sign-up OTP codes. Settings come from `getServerEnv()` at call
 * time (never at import). Logs carry status
 * codes only: never the API key, the code or the recipient's address.
 *
 * Without a usable `BREVO_API_KEY`, development returns the code as `demoOtp` so the flow can
 * be tested locally; production refuses (`success: false`), so a code is never echoed there.
 */

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  demoMode?: boolean;
  demoOtp?: string;
  error?: string;
}

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 8_000;

/** Unset, `<placeholder>` (both dropped by env parsing) or obviously fake keys count as missing. */
function brevoApiKey(): string | undefined {
  const key = getServerEnv().BREVO_API_KEY;
  if (!key || /demo|replace|your/i.test(key)) return undefined;
  return key.length >= 20 ? key : undefined;
}

export function isMailConfigured(): boolean {
  return brevoApiKey() !== undefined;
}

/** Dev convenience only: no key and not production. */
export function isDemoMailMode(): boolean {
  return !isMailConfigured() && process.env.NODE_ENV !== "production";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function otpEmailHtml(recipientName: string, otpCode: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #04010a; color: #ffffff; padding: 24px; margin: 0; }
      .container { max-width: 540px; margin: 0 auto; background-color: #0e0424; border: 2px solid #a855f7; border-radius: 20px; padding: 32px; }
      .logo { text-align: center; font-size: 24px; font-weight: 900; margin-bottom: 24px; }
      .logo-nexus { color: #fbbf24; }
      .title { font-size: 20px; font-weight: 800; margin-bottom: 12px; }
      .text { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px; }
      .otp-box { background-color: #1a083a; border: 2px dashed #fbbf24; border-radius: 14px; padding: 18px; text-align: center; margin-bottom: 24px; }
      .otp-code { font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #fbbf24; font-family: Courier, monospace; }
      .footer { font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; margin-top: 24px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo">CIT <span class="logo-nexus">NEXUS</span></div>
      <div class="title">Verify your institutional account</div>
      <p class="text">Hello <strong>${escapeHtml(recipientName)}</strong>,<br><br>
        Use this 6-digit code to finish creating your CIT Nexus account.</p>
      <div class="otp-box"><div class="otp-code">${escapeHtml(otpCode)}</div></div>
      <p class="text" style="font-size: 13px;">The code expires in <strong>10 minutes</strong>. If you didn't request it, ignore this email.</p>
      <div class="footer">Chilika Institute of Technology<br>Please do not reply to this email.</div>
    </div>
  </body>
</html>`;
}

export async function sendOtpEmail(
  recipientEmail: string,
  recipientName: string,
  otpCode: string,
): Promise<SendOtpResult> {
  const apiKey = brevoApiKey();
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("[mail] BREVO_API_KEY is not set; OTP email not sent.");
      return { success: false, error: "Email delivery isn't configured." };
    }
    console.info(
      "[mail] BREVO_API_KEY is not set; dev mode returns the OTP in the response.",
    );
    return { success: true, demoMode: true, demoOtp: otpCode };
  }

  const { BREVO_SENDER_EMAIL: senderEmail, BREVO_SENDER_NAME: senderName } =
    getServerEnv();
  if (!senderEmail) {
    console.error("[mail] BREVO_SENDER_EMAIL is not set; OTP email not sent.");
    return { success: false, error: "Email delivery isn't configured." };
  }

  try {
    const response = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: recipientName }],
        subject: "CIT Nexus: your verification code",
        htmlContent: otpEmailHtml(recipientName, otpCode),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        `[mail] Brevo rejected the OTP email (HTTP ${response.status}).`,
      );
      return {
        success: false,
        error: "The verification email could not be sent.",
      };
    }
    const data = (await response.json().catch(() => ({}))) as {
      messageId?: unknown;
    };
    return {
      success: true,
      demoMode: false,
      messageId:
        typeof data.messageId === "string" ? data.messageId : undefined,
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    console.error(`[mail] Brevo request failed (${name}).`);
    return {
      success: false,
      error: "The verification email could not be sent.",
    };
  }
}
