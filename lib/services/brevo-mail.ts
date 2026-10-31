/**
 * Brevo (Sendinblue) Transactional Mail Service
 * Sends secure 6-digit OTP codes for account verification.
 */

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  demoMode?: boolean;
  demoOtp?: string;
  error?: string;
}

export async function sendOtpEmail(
  recipientEmail: string,
  recipientName: string,
  otpCode: string
): Promise<SendOtpResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'yashpandey040709@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'CIT Nexus Security';

  const isDemoKey =
    !apiKey ||
    apiKey.includes('demo') ||
    apiKey.includes('replace') ||
    apiKey.length < 20;

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

  if (isDemoKey) {
    console.log('\n=============================================================');
    console.log(`[BREVO MAIL DEMO MODE] Recipient: ${recipientEmail} (${recipientName})`);
    console.log(`[BREVO MAIL DEMO MODE] OTP CODE: >>> ${otpCode} <<< (Expires in 10 mins)`);
    console.log('=============================================================\n');
    return {
      success: true,
      demoMode: true,
      demoOtp: otpCode,
      messageId: `demo_msg_${Date.now()}`,
    };
  }

  // Live Brevo REST API v3 Call
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn('[Brevo] Live API rejected request, logging demo OTP fallback:', errorData);
      console.log(`\n[FALLBACK OTP for ${recipientEmail}]: >>> ${otpCode} <<<\n`);
      return {
        success: true,
        demoMode: true,
        demoOtp: otpCode,
        error: errorData.message || 'Brevo API error',
      };
    }

    const data = await response.json();
    return {
      success: true,
      messageId: data.messageId,
    };
  } catch (err) {
    console.error('[Brevo] Exception while sending email:', err);
    console.log(`\n[FALLBACK OTP for ${recipientEmail}]: >>> ${otpCode} <<<\n`);
    return {
      success: true,
      demoMode: true,
      demoOtp: otpCode,
      error: (err as Error).message,
    };
  }
}

