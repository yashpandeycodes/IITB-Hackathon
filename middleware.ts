import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from './lib/auth/jwt';
import { UserRole } from './lib/db/models/user.model';

// RBAC Role Clearance Matrix according to frontend spec §4.1 & §4.2
const ROLE_PERMISSIONS: Record<string, UserRole[]> = {
  '/admin': ['Admin'],
  '/approvals': ['Admin', 'Department Coordinator'],
  '/changes': ['Admin', 'Department Coordinator', 'Faculty'],
  '/assistant': ['Admin', 'Department Coordinator', 'Faculty'],
  '/coordinator': ['Admin', 'Department Coordinator'],
  '/faculty': ['Admin', 'Faculty'],
  '/club': ['Admin', 'Club Representative'],
  '/dashboard': ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'],
  '/timetable': ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'],
  '/rooms': ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'],
  '/bookings': ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'],
  '/spectra': ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'],
  '/exams': ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Ignore static assets, next internal files, and public images
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/auth') || // Allow auth APIs through
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;

  // 1. If user is already authenticated, prevent them from visiting login/signup
  if (sessionUser && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // 2. Determine if requested path is a protected sector
  const matchedRoute = Object.keys(ROLE_PERMISSIONS).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (matchedRoute) {
    // Unauthenticated user attempting to access protected area
    if (!sessionUser) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Role-Based Access Control (RBAC) Check
    const allowedRoles = ROLE_PERMISSIONS[matchedRoute];
    const hasRoleClearance = allowedRoles.includes(sessionUser.role);

    if (!hasRoleClearance) {
      const unauthorizedUrl = new URL('/unauthorized', req.url);
      unauthorizedUrl.searchParams.set('role', sessionUser.role);
      unauthorizedUrl.searchParams.set('attemptedSector', pathname);
      return NextResponse.redirect(unauthorizedUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/coordinator/:path*',
    '/faculty/:path*',
    '/club/:path*',
    '/timetable/:path*',
    '/rooms/:path*',
    '/bookings/:path*',
    '/spectra/:path*',
    '/approvals/:path*',
    '/changes/:path*',
    '/assistant/:path*',
    '/exams/:path*',
    '/login',
    '/signup',
  ],
};
