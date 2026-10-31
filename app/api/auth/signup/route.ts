import { NextRequest, NextResponse } from 'next/server';
import { signupSchema } from '@/lib/validation';
import { findUserByEmail, createUser, updateUserOtp } from '@/lib/db/user-store';
import { sendOtpEmail } from '@/lib/services/brevo-mail';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    // Validate with Zod
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstIssue.message, details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { fullName, email, role, password } = parsed.data;
    const existingUser = await findUserByEmail(email);

    if (existingUser && existingUser.isVerified) {
      return NextResponse.json(
        { error: 'An account with this institutional email is already registered. Please sign in.' },
        { status: 409 }
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existingUser && !existingUser.isVerified) {
      // Update existing unverified user with new password & OTP
      await updateUserOtp(email, otp, otpExpiresAt);
    } else {
      // Create new user record
      await createUser({
        name: fullName,
        email,
        password,
        role,
        isVerified: false,
        otp,
        otpExpiresAt,
      });
    }

    // Dispatch OTP email via Brevo to the mentioned email
    await sendOtpEmail(email, fullName, otp);

    return NextResponse.json({
      success: true,
      message: 'A 6-digit verification code has been dispatched to your email address.',
      email,
    });
  } catch (err: any) {
    console.error('[API /signup] Server error:', err);
    return NextResponse.json(
      { error: err?.message || 'Database error while processing signup.' },
      { status: 500 }
    );
  }
}
