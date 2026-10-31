import type { Role } from "@/lib/contracts/enums";
import type { SessionUser } from "@/lib/contracts/user";
import { ROLE_LABEL } from "./roles";

/**
 * What `src/proxy.ts` does with a request, as a pure function so it can be unit-tested.
 * No DB access: the session is the verified JWT only.
 */

const ALL_ROLES: readonly Role[] = [
  "admin",
  "department_coordinator",
  "faculty",
  "club",
];

/** Pages and who may open them; a prefix also covers its sub-paths. */
export const PAGE_ACCESS: Readonly<Record<string, readonly Role[]>> = {
  // CIT Nexus role pages
  "/admin": ["admin"],
  "/coordinator": ["admin", "department_coordinator"],
  "/faculty": ["admin", "faculty"],
  "/club": ["admin", "club"],
  "/dashboard": ALL_ROLES,
  // Signed-in app area; each screen still limits actions by role through the API.
  "/timetable": ALL_ROLES,
  "/rooms": ALL_ROLES,
  "/bookings": ALL_ROLES,
  "/spectra": ALL_ROLES,
  "/approvals": ALL_ROLES,
  "/changes": ALL_ROLES,
  "/assistant": ALL_ROLES,
  "/exams": ALL_ROLES,
};

/** API prefixes reachable without a session (they do their own checks). */
export const PUBLIC_API_PREFIXES = ["/api/auth", "/api/health"] as const;

const AUTH_PAGES = new Set(["/login", "/signup"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ProxyRequest = {
  method: string;
  pathname: string;
  /** The `Origin` header, or null when absent. */
  origin: string | null;
  /** The `Sec-Fetch-Site` header, or null when absent (older browsers, curl). */
  fetchSite?: string | null;
  /** Hosts this request was addressed to (see `requestHosts`), lower-case with port. */
  hosts: readonly string[];
};

export type ProxyDecision =
  | { action: "next" }
  | { action: "redirect"; pathname: string; query: Record<string, string> }
  | {
      action: "reject";
      status: 401 | 403;
      code: "UNAUTHENTICATED" | "FORBIDDEN";
      message: string;
    };

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isApiPath(pathname: string): boolean {
  return underPrefix(pathname, "/api");
}

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => underPrefix(pathname, prefix));
}

/** The protected page prefix `pathname` falls under, if any. */
export function matchPagePrefix(pathname: string): string | undefined {
  return Object.keys(PAGE_ACCESS).find((prefix) =>
    underPrefix(pathname, prefix),
  );
}

/** Static files and Next internals are never gated (same skip list as the old middleware). */
function isAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  );
}

/** An `Origin` that is present and names a different host than the request (CSRF guard). */
export function isCrossOrigin(
  origin: string | null,
  hosts: readonly string[],
): boolean {
  if (origin === null) return false;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return true; // "null" (sandboxed frames, privacy redirects) or garbage
  }
  return !host || !hosts.includes(host);
}

/**
 * The hosts a request was addressed to: `Host`, plus the first `X-Forwarded-Host` only when
 * `trustForwardedHost` (on Vercel, whose edge sets it); elsewhere a client could forge it.
 */
export function requestHosts(
  headers: Headers,
  trustForwardedHost: boolean,
): string[] {
  const forwarded = trustForwardedHost
    ? headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    : undefined;
  return [headers.get("host"), forwarded]
    .filter((host): host is string => Boolean(host))
    .map((host) => host.toLowerCase());
}

/** Whether `decideProxy` will need the session for this request. */
export function needsSession(pathname: string): boolean {
  if (isApiPath(pathname)) return !isPublicApiPath(pathname);
  if (isAssetPath(pathname)) return false;
  return AUTH_PAGES.has(pathname) || matchPagePrefix(pathname) !== undefined;
}

export async function decideProxy(
  request: ProxyRequest,
  getSession: () => Promise<SessionUser | null>,
): Promise<ProxyDecision> {
  const { method, pathname } = request;

  if (isApiPath(pathname)) {
    if (
      MUTATING_METHODS.has(method.toUpperCase()) &&
      (request.fetchSite?.toLowerCase() === "cross-site" ||
        isCrossOrigin(request.origin, request.hosts))
    ) {
      return {
        action: "reject",
        status: 403,
        code: "FORBIDDEN",
        message: "Cross-origin requests are not allowed.",
      };
    }
    if (isPublicApiPath(pathname) || (await getSession())) {
      return { action: "next" };
    }
    return {
      action: "reject",
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Please sign in to continue.",
    };
  }

  if (!needsSession(pathname)) return { action: "next" };
  const session = await getSession();

  if (AUTH_PAGES.has(pathname)) {
    return session
      ? { action: "redirect", pathname: "/dashboard", query: {} }
      : { action: "next" };
  }

  const prefix = matchPagePrefix(pathname);
  if (!prefix) return { action: "next" };
  if (!session) {
    return {
      action: "redirect",
      pathname: "/login",
      query: { redirect: pathname },
    };
  }
  if (!PAGE_ACCESS[prefix].includes(session.role)) {
    return {
      action: "redirect",
      pathname: "/unauthorized",
      query: { role: ROLE_LABEL[session.role], attemptedSector: pathname },
    };
  }
  return { action: "next" };
}
