import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { findUserById } from '@/lib/db/user-store';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    // Double check with DB
    const freshUser = await findUserById(payload.id);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: payload.id,
        name: freshUser?.name || payload.name,
        email: payload.email,
        role: freshUser?.role || payload.role,
        isVerified: true,
      },
    });
  } catch (err) {
    console.error('[API /me] Server error:', err);
    return NextResponse.json({ authenticated: false, user: null }, { status: 500 });
  }
}
