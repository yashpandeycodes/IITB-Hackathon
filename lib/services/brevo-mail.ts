/**
 * Brevo (Sendinblue) Transactional Mail Service
 * Sends secure 6-digit OTP codes for account verification.
 * Supports both Brevo SMTP Relay (xsmtpsib-*) and Brevo REST API (xkeysib-*).
 */

import nodemailer from 'nodemailer';

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function parseSender(rawEmail?: string, rawName?: string): { name: string; email: string } {
  let email = (rawEmail || 'aryansinha1908@gmail.com').trim();
  let name = (rawName || 'CIT Nexus Security').replace(/^["']|["']$/g, '').trim();

  // Handle format like: "CIT <aryansinha1908@gmail.com>"
  const match = email.match(/^(?:(.*?)<)?([^<>]+)>?$/);
  if (match) {
    if (match[1] && match[1].trim()) {
      name = match[1].trim().replace(/^["']|["']$/g, '');
    }
    email = match[2].trim();
  }

  return { name, email };
}

export async function sendOtpEmail(
  recipientEmail: string,
  recipientName: string,
  otpCode: string
): Promise<SendOtpResult> {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const sender = parseSender(process.env.BREVO_SENDER_EMAIL, process.env.BREVO_SENDER_NAME);

  // Always log secure dispatch log to the server console for audit and testing
  console.log('\n=============================================================');
  console.log(`[CIT NEXUS SECURITY DISPATCH] Recipient: ${recipientEmail} (${recipientName})`);
  console.log(`[CIT NEXUS SECURITY DISPATCH] 6-Digit OTP Code: >>> ${otpCode} <<< (Expires in 10 mins)`);
  console.log('=============================================================\n');

  // Rich HTML Email Template with CIT Nexus Theme
  const htmlContent = `
    <!DOCTYPE html>
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
            Hello <strong>${recipientName}</strong>,<br><br>
            Use the following 6-digit one-time verification code (OTP) to complete your registration on the CIT Nexus campus operations platform.
          </p>
          <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
          </div>
          <p class="text" style="font-size: 13px;">
            This security code will expire in <strong>10 minutes</strong>. If you did not initiate this request, please disregard this email.
          </p>
          <div class="footer">
            Chilika Institute of Technology • Automated Access Security Layer<br>
            Please do not reply to this email.
          </div>
        </div>
      </body>
    </html>
  `;

  if (!apiKey || apiKey.includes('demo') || apiKey.includes('replace')) {
    console.warn('[Brevo] No active Brevo key provided in .env');
    return {
      success: true,
      messageId: `local_dev_${Date.now()}`,
    };
  }

  // Detect SMTP configurations (supports both standard BREVO_* and the user-defined Login/SMTP_Server fields)
  const smtpHost =
    process.env.BREVO_SMTP_HOST ||
    process.env.SMTP_Server ||
    process.env.SMTP_SERVER ||
    'smtp-relay.brevo.com';

  const smtpPort =
    Number(process.env.BREVO_SMTP_PORT || process.env.Port || process.env.PORT) ||
    587;

  const smtpUser =
    process.env.BREVO_SMTP_USER ||
    process.env.Login ||
    process.env.LOGIN ||
    process.env.BREVO_SMTP_LOGIN ||
    sender.email;

  // METHOD 1: Brevo SMTP Relay (Active when key starts with xsmtpsib- or explicitly configured)
  if (apiKey.startsWith('xsmtpsib-') || process.env.BREVO_USE_SMTP === 'true' || process.env.Login) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        auth: {
          user: smtpUser,
          pass: apiKey,
        },
      });

      const info = await transporter.sendMail({
        from: `"${sender.name}" <${sender.email}>`,
        to: `"${recipientName}" <${recipientEmail}>`,
        subject: `CIT Nexus: Your Verification Code is ${otpCode}`,
        html: htmlContent,
      });

      console.log(`[Brevo SMTP] Successfully dispatched OTP email to ${recipientEmail}. MessageId: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (smtpErr) {
      console.error('[Brevo SMTP] SMTP dispatch error:', (smtpErr as Error).message);
      if (apiKey.startsWith('xsmtpsib-')) {
        return {
          success: false,
          error: (smtpErr as Error).message,
        };
      }
    }
  }

  // METHOD 2: Brevo v3 REST API (Active when key starts with xkeysib-*)
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(4000),
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: sender.name,
          email: sender.email,
        },
        to: [
          {
            email: recipientEmail,
            name: recipientName,
          },
        ],
        subject: `CIT Nexus: Your Verification Code is ${otpCode}`,
        htmlContent: htmlContent,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[Brevo API] Successfully dispatched OTP email to ${recipientEmail}. MessageId: ${data.messageId}`);
      return {
        success: true,
        messageId: data.messageId,
      };
    }

    const errorData = await response.json().catch(() => ({}));
    console.warn('[Brevo API] API response rejected:', errorData);
    return {
      success: false,
      error: errorData.message || 'Brevo API error',
    };
  } catch (apiErr) {
    console.error('[Brevo API] Exception while sending email:', (apiErr as Error).message);
    return {
      success: false,
      error: (apiErr as Error).message,
    };
  }
}
