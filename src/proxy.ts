import { NextResponse, type NextRequest } from "next/server";
import { fail } from "@/lib/api/response";
import { decideProxy, requestHosts } from "@/lib/auth/proxy-rules";
import { readSession } from "@/lib/auth/session";

/**
 * Auth gate (Next.js 16 `proxy`, formerly `middleware`). Rules live in `proxy-rules.ts`:
 * page redirects by role, a session for every `/api` route except `/api/auth/*` and
 * `/api/health`, and same-origin-only mutating API calls. Signature check only (no DB);
 * Route Handlers re-check with `requireUser`/`requireRole` (revocation, current role).
 */
export async function proxy(request: NextRequest) {
  const decision = await decideProxy(
    {
      method: request.method,
      pathname: request.nextUrl.pathname,
      origin: request.headers.get("origin"),
      fetchSite: request.headers.get("sec-fetch-site"),
      hosts: requestHosts(request.headers, Boolean(process.env.VERCEL)),
    },
    () => readSession(request.cookies),
  );

  switch (decision.action) {
    case "next":
      return NextResponse.next();
    case "redirect": {
      const url = new URL(decision.pathname, request.url);
      for (const [key, value] of Object.entries(decision.query)) {
        url.searchParams.set(key, value);
      }
      return NextResponse.redirect(url);
    }
    case "reject":
      return fail(decision.code, decision.message, undefined, {
        headers: { "Cache-Control": "no-store" },
      });
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/coordinator/:path*",
    "/faculty/:path*",
    "/club/:path*",
    "/timetable/:path*",
    "/rooms/:path*",
    "/bookings/:path*",
    "/spectra/:path*",
    "/approvals/:path*",
    "/changes/:path*",
    "/assistant/:path*",
    "/exams/:path*",
    "/login",
    "/signup",
    "/api/:path*",
  ],
};
