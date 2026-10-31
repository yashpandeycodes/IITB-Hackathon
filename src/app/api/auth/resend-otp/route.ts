import { NextRequest, NextResponse } from 'next/server';
import { resendOtpSchema } from '@/lib/validation';
import { findUserByEmail, updateUserOtp } from '@/lib/db/user-store';
import { sendOtpEmail } from '@/lib/services/brevo-mail';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = resendOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    const { email } = parsed.data;
    const user = await findUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'No account registered with this email.' }, { status: 404 });
    }

    if (user.isVerified) {
      return NextResponse.json(
        { error: 'This account is already verified. Please proceed to sign in.' },
        { status: 400 }
      );
    }

    // Generate new OTP & 10 min expiry
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await updateUserOtp(email, newOtp, expiresAt);
    const result = await sendOtpEmail(email, user.name, newOtp);

    return NextResponse.json({
      success: true,
      message: 'A fresh 6-digit verification code has been dispatched.',
      demoMode: result.demoMode,
      demoOtp: result.demoOtp,
    });
  } catch (err) {
    console.error('[API /resend-otp] Server error:', err);
    return NextResponse.json({ error: 'Internal server error while resending OTP.' }, { status: 500 });
  }
}

