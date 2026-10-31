import "server-only";
import type { SessionUser } from "@/lib/contracts/user";
import { ROLE_LABEL, type UserRole } from "./roles";
import { SESSION_COOKIE, verifySession } from "./session";

/**
 * Compatibility facade for the CIT Nexus role pages, which read display-label roles.
 * Signature check only (like the proxy); Route Handlers use `./guards` instead.
 */

export type { UserRole };

export const COOKIE_NAME = SESSION_COOKIE;

export interface UserPayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
}

function toUserPayload(user: SessionUser): UserPayload {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: ROLE_LABEL[user.role],
    // Only verified accounts are ever issued a session.
    isVerified: true,
  };
}

export async function verifySessionToken(
  token: string,
): Promise<UserPayload | null> {
  const user = await verifySession(token);
  return user ? toUserPayload(user) : null;
}
