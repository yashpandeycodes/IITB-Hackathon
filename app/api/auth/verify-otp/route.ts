import { NextRequest, NextResponse } from 'next/server';
import { verifyOtpSchema } from '@/lib/validation';
import { verifyAndClearOtp } from '@/lib/db/user-store';
import { signSessionToken, COOKIE_NAME } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = verifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid OTP payload' },
        { status: 400 }
      );
    }

    const { email, otp } = parsed.data;
    const verification = await verifyAndClearOtp(email, otp);

    if (!verification.success || !verification.user) {
      return NextResponse.json(
        { error: verification.message || 'Verification failed.' },
        { status: 400 }
      );
    }

    const user = verification.user;

    // Issue signed JWT token
    const token = await signSessionToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: true,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Email verified successfully! Session established.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err) {
    console.error('[API /verify-otp] Server error:', err);
    return NextResponse.json(
      { error: 'Internal server error during verification.' },
      { status: 500 }
    );
  }
}

