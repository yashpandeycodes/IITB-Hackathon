import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { SessionUserSchema, type SessionUser } from "@/lib/contracts/user";
import { requireSessionSecret } from "@/lib/env";

/**
 * Session core: an HS256 JWT whose claims are the `SessionUser` contract plus iat/exp and a
 * random `jti`, carried in an httpOnly cookie. Signature checks only (no DB), so the proxy can
 * call it on every request; `guards.ts` adds the revocation and fresh-user checks.
 */

/** Kept from the CIT Nexus prototype so existing cookies and pages keep the same name. */
export const SESSION_COOKIE = "cit_nexus_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Real tokens are well under 1 KB; anything far larger is not ours. */
const MAX_TOKEN_LENGTH = 4096;

export type SessionCookie = {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

/** A verified token: the user claims plus the id and expiry needed to revoke it. */
export type SessionClaims = {
  user: SessionUser;
  jti: string;
  expiresAt: Date;
};

type CookieReader = { get(name: string): { value: string } | undefined };

/**
 * `JWT_SECRET` when set, else `AUTH_SECRET`; `src/lib/env.ts` enforces 32+ characters and
 * rejects placeholders in production. No fallback, so a missing secret fails closed.
 */
export function getSessionKey(): Uint8Array {
  return new TextEncoder().encode(requireSessionSecret());
}

/** Signs a session token. Throws if the secret is missing or too short. */
export async function signSession(user: SessionUser): Promise<string> {
  // Parsing strips anything that isn't a session claim (e.g. a stored password hash).
  const claims = SessionUserSchema.parse(user);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionKey());
}

let reportedKeyError = false;

/**
 * Claims of a valid, unexpired HS256 token that carries exp, iat and jti and is at most 12 h
 * old, otherwise null. A missing or invalid secret also yields null (fail closed) and is logged
 * once without the value.
 */
export async function verifySessionClaims(
  token: string | null | undefined,
): Promise<SessionClaims | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  let key: Uint8Array;
  try {
    key = getSessionKey();
  } catch (err) {
    if (!reportedKeyError) {
      reportedKeyError = true;
      console.error(
        `[auth] Sessions are disabled: ${err instanceof Error ? err.message : "invalid secret"}`,
      );
    }
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat", "jti"],
      maxTokenAge: `${SESSION_TTL_SECONDS}s`,
    });
    const user = SessionUserSchema.safeParse(payload);
    if (!user.success || typeof payload.jti !== "string" || !payload.jti) {
      return null;
    }
    return {
      user: user.data,
      jti: payload.jti,
      expiresAt: new Date(payload.exp! * 1000),
    };
  } catch {
    return null;
  }
}

/** The session user of a valid token, otherwise null (signature and claims only). */
export async function verifySession(
  token: string | null | undefined,
): Promise<SessionUser | null> {
  return (await verifySessionClaims(token))?.user ?? null;
}

/**
 * Reads one cookie from a raw `Cookie` header, the way Next's cookie parser (used by the proxy
 * and `cookies()`) does: when the name repeats, the last value wins, and a value that isn't
 * valid URI encoding is skipped. Route Handlers and Server Components then see the same session.
 */
export function getCookieFromHeader(
  header: string | null,
  name: string,
): string | undefined {
  if (!header) return undefined;
  let value: string | undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      value = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      // Not valid URI encoding: ignored, as Next does.
    }
  }
  return value;
}

/** A cookie from a request or a cookie store (`await cookies()`, `request.cookies`). */
export function readCookie(
  source: Request | CookieReader,
  name: string,
): string | undefined {
  return "get" in source && typeof source.get === "function"
    ? source.get(name)?.value
    : getCookieFromHeader((source as Request).headers.get("cookie"), name);
}

/** Verified claims of the request's session cookie, or null. */
export async function readSessionClaims(
  source: Request | CookieReader,
): Promise<SessionClaims | null> {
  return verifySessionClaims(readCookie(source, SESSION_COOKIE));
}

/**
 * Session user from a request (Route Handlers, proxy) or a cookie store.
 * Signature only: use `requireUser` in Route Handlers and `getSessionUser()`
 * (`./server-session`) in Server Components for revocation and the current role.
 */
export async function readSession(
  source: Request | CookieReader,
): Promise<SessionUser | null> {
  return (await readSessionClaims(source))?.user ?? null;
}

/** An httpOnly, SameSite=Lax cookie (Secure in production). */
export function httpOnlyCookie(
  name: string,
  value: string,
  maxAge: number,
  path = "/",
): SessionCookie {
  return {
    name,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path,
    maxAge,
  };
}

function sessionCookie(value: string, maxAge: number): SessionCookie {
  return httpOnlyCookie(SESSION_COOKIE, value, maxAge);
}

/** Signs a session for `user`; pass the result to `response.cookies.set(...)`. */
export async function createSession(user: SessionUser): Promise<SessionCookie> {
  return sessionCookie(await signSession(user), SESSION_TTL_SECONDS);
}

/** An expired, empty session cookie; pass it to `response.cookies.set(...)` to sign out. */
export function clearSession(): SessionCookie {
  return sessionCookie("", 0);
}
