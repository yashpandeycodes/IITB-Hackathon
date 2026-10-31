import { NextRequest, NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validation';
import { findUserByEmail, checkPassword, updateUserOtp } from '@/lib/db/user-store';
import { signSessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { sendOtpEmail } from '@/lib/services/brevo-mail';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Invalid institutional email or password.' },
        { status: 401 }
      );
    }

    const passwordMatches = await checkPassword(password, user.password);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: 'Invalid institutional email or password.' },
        { status: 401 }
      );
    }

    // Check if account email is verified
    if (!user.isVerified) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await updateUserOtp(user.email, otp, expiresAt);
      const emailResult = await sendOtpEmail(user.email, user.name, otp);

      return NextResponse.json(
        {
          requiresOtp: true,
          message: 'Account email has not been verified. A fresh OTP has been sent.',
          email: user.email,
          demoMode: emailResult.demoMode,
          demoOtp: emailResult.demoOtp,
        },
        { status: 403 }
      );
    }

    // Success: sign JWT
    const token = await signSessionToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: true,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Signed in successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    console.error('[API /login] Server error:', err);
    return NextResponse.json({ error: 'Internal server error during login.' }, { status: 500 });
  }
}

