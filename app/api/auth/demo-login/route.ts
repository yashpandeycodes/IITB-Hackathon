import { NextRequest, NextResponse } from 'next/server';
import { DEMO_USERS } from '@/lib/dataset/cit-data';
import { signSessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { UserRole } from '@/lib/db/models/user.model';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const role = (body.role || 'Admin') as UserRole;

    const matchedUser = DEMO_USERS.find((u) => u.role === role) || DEMO_USERS[0];

    const token = await signSessionToken({
      id: `demo-${matchedUser.role.toLowerCase().replace(/\s+/g, '-')}`,
      name: matchedUser.name,
      email: matchedUser.email,
      role: matchedUser.role as UserRole,
      isVerified: true,
    });

    const response = NextResponse.json({
      success: true,
      message: `Signed in as ${matchedUser.role} (${matchedUser.name})`,
      user: {
        name: matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role,
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
    console.error('[API /demo-login] Error:', err);
    return NextResponse.json({ error: 'Failed to authenticate demo user' }, { status: 500 });
  }
}

