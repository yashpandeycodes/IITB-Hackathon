import "server-only";
import nodemailer from "nodemailer";
import { getServerEnv, parseMailbox } from "@/lib/env";

/**
 * Brevo transactional mail for sign-up OTP codes. Settings come from `getServerEnv()` at call
 * time. The `BREVO_API_KEY` prefix picks the transport:
 * - `xsmtpsib-…` → SMTP relay via nodemailer (`BREVO_SMTP_HOST`/`_PORT`, `BREVO_SMTP_LOGIN`
 *   required, 15 s timeouts);
 * - any other key (`xkeysib-…`) → the REST API.
 *
 * Without a key, development logs `[dev] OTP for <email>: <code>` to the server console (the
 * only place a code is ever logged); production reports the mail as unavailable. Other logs
 * carry status codes only: never the key, a code or an address.
 */

export type MailTransport = "smtp" | "rest" | "none";

/**
 * `ready`: a transport is fully configured · `dev-log`: no key outside production, codes go to
 * the console · `unavailable`: production without a key, or a key without its sender/login.
 */
export type MailStatus = "ready" | "dev-log" | "unavailable";

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const REST_TIMEOUT_MS = 8_000;
const SMTP_TIMEOUT_MS = 15_000;
const SUBJECT = "CIT Nexus: your verification code";
const NOT_CONFIGURED = "Email delivery isn't configured.";
const NOT_SENT = "The verification email could not be sent.";

/** Unset or obviously fake keys count as missing (placeholders are dropped by env parsing). */
function brevoApiKey(): string | undefined {
  const key = getServerEnv().BREVO_API_KEY;
  if (!key || /demo|replace|your/i.test(key) || key.length < 20) {
    return undefined;
  }
  return key;
}

export function mailTransport(): MailTransport {
  const key = brevoApiKey();
  if (!key) return "none";
  return key.startsWith("xsmtpsib-") ? "smtp" : "rest";
}

function sender(): { name: string; email: string } | null {
  const env = getServerEnv();
  const mailbox = env.BREVO_SENDER_EMAIL
    ? parseMailbox(env.BREVO_SENDER_EMAIL)
    : null;
  return mailbox
    ? { name: mailbox.name ?? env.BREVO_SENDER_NAME, email: mailbox.email }
    : null;
}

/** Why mail can't go out, or null when it can (or will be logged in development). */
function configurationProblem(transport: MailTransport): string | null {
  if (transport === "none") {
    return process.env.NODE_ENV === "production" ? "BREVO_API_KEY" : null;
  }
  if (!sender()) return "BREVO_SENDER_EMAIL";
  if (transport === "smtp" && !getServerEnv().BREVO_SMTP_LOGIN) {
    return "BREVO_SMTP_LOGIN";
  }
  return null;
}

export function mailStatus(): MailStatus {
  const transport = mailTransport();
  if (configurationProblem(transport)) return "unavailable";
  return transport === "none" ? "dev-log" : "ready";
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
      .container { max-width: 540px; margin: 0 auto; background-color: #0e0424; border: 2px solid #a855f7; border-radius: 20px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
      .header { text-align: center; margin-bottom: 24px; }
      .logo { font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; }
      .logo-nexus { color: #fbbf24; }
      .title { font-size: 20px; font-weight: 800; color: #ffffff; margin-bottom: 12px; }
      .text { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px; }
      .otp-box { background-color: #1a083a; border: 2px dashed #fbbf24; border-radius: 14px; padding: 18px; text-align: center; margin-bottom: 24px; }
      .otp-code { font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #fbbf24; font-family: Courier, monospace; }
      .footer { font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; margin-top: 24px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">CIT <span class="logo-nexus">NEXUS</span></div>
        <div style="font-size: 11px; font-family: monospace; color: #c084fc; letter-spacing: 2px;">SECURITY DISPATCH PROTOCOL</div>
      </div>
      <div class="title">Verify Your Institutional Account</div>
      <p class="text">
        Hello <strong>${escapeHtml(recipientName)}</strong>,<br><br>
        Use the following 6-digit one-time verification code (OTP) to complete your registration on the CIT Nexus campus operations platform.
      </p>
      <div class="otp-box"><div class="otp-code">${escapeHtml(otpCode)}</div></div>
      <p class="text" style="font-size: 13px;">
        This security code will expire in <strong>10 minutes</strong>. If you did not initiate this request, please disregard this email.
      </p>
      <div class="footer">
        Chilika Institute of Technology &bull; Automated Access Security Layer<br>
        Please do not reply to this email.
      </div>
    </div>
  </body>
</html>`;
}

function otpEmailText(recipientName: string, otpCode: string): string {
  return (
    `Hello ${recipientName},\n\nYour CIT Nexus verification code is ${otpCode}. ` +
    "It expires in 10 minutes. If you did not request it, ignore this email."
  );
}

type Message = {
  from: { name: string; email: string };
  to: { name: string; email: string };
  html: string;
  text: string;
};

async function sendViaSmtp(apiKey: string, message: Message) {
  const env = getServerEnv();
  const transporter = nodemailer.createTransport({
    host: env.BREVO_SMTP_HOST,
    port: env.BREVO_SMTP_PORT,
    secure: env.BREVO_SMTP_PORT === 465,
    auth: { user: env.BREVO_SMTP_LOGIN, pass: apiKey },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  try {
    // Address objects let nodemailer encode user-supplied names safely.
    const info = await transporter.sendMail({
      from: { name: message.from.name, address: message.from.email },
      to: { name: message.to.name, address: message.to.email },
      subject: SUBJECT,
      html: message.html,
      text: message.text,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const e = err as { code?: unknown; responseCode?: unknown; name?: unknown };
    const detail = [e.code, e.responseCode].filter(Boolean).join(" ");
    console.error(
      `[mail] Brevo SMTP send failed (${detail || String(e.name ?? "Error")}).`,
    );
    return { success: false, error: NOT_SENT };
  } finally {
    transporter.close();
  }
}

async function sendViaRest(apiKey: string, message: Message) {
  try {
    const response = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: message.from,
        to: [message.to],
        subject: SUBJECT,
        htmlContent: message.html,
        textContent: message.text,
      }),
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(
        `[mail] Brevo rejected the OTP email (HTTP ${response.status}).`,
      );
      return { success: false, error: NOT_SENT };
    }
    const data = (await response.json().catch(() => ({}))) as {
      messageId?: unknown;
    };
    return {
      success: true,
      messageId:
        typeof data.messageId === "string" ? data.messageId : undefined,
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    console.error(`[mail] Brevo request failed (${name}).`);
    return { success: false, error: NOT_SENT };
  }
}

export async function sendOtpEmail(
  recipientEmail: string,
  recipientName: string,
  otpCode: string,
): Promise<SendOtpResult> {
  const transport = mailTransport();
  const problem = configurationProblem(transport);
  if (problem) {
    console.error(`[mail] ${problem} is not set; OTP email not sent.`);
    return { success: false, error: NOT_CONFIGURED };
  }

  if (transport === "none") {
    // Development only (configurationProblem refuses production): the code goes to the console.
    console.info(`[dev] OTP for ${recipientEmail}: ${otpCode}`);
    return { success: true };
  }

  const message: Message = {
    from: sender()!,
    to: { name: recipientName, email: recipientEmail },
    html: otpEmailHtml(recipientName, otpCode),
    text: otpEmailText(recipientName, otpCode),
  };
  const apiKey = brevoApiKey()!;
  return transport === "smtp"
    ? sendViaSmtp(apiKey, message)
    : sendViaRest(apiKey, message);
}
