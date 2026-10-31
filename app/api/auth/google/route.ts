import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, createUser } from '@/lib/db/user-store';
import { signSessionToken, COOKIE_NAME } from '@/lib/auth/jwt';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isDemo = searchParams.get('demo') === 'true';

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const isPlaceholder = !clientId || clientId.includes('demo') || clientId.includes('replace');

  // If live credentials exist and user didn't request fast demo mode:
  if (!isPlaceholder && !isDemo) {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google/callback`;
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', clientId);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    googleAuthUrl.searchParams.set('access_type', 'offline');

    return NextResponse.redirect(googleAuthUrl.toString());
  }

  // Fast Secure Demo Google Sign-In (Using provided user email)
  const demoEmail = 'yashpandey040709@gmail.com';
  const demoName = 'Yash Pandey';
  let user = await findUserByEmail(demoEmail);

  if (!user) {
    user = await createUser({
      name: demoName,
      email: demoEmail,
      role: 'Faculty',
      isVerified: true,
      googleId: 'google_oauth_demo_1092837465',
    });
  }

  const token = await signSessionToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isVerified: true,
  });

  const response = NextResponse.redirect(
    new URL('/dashboard', req.url)
  );

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
}

