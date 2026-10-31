import "server-only";
import { cookies } from "next/headers";
import { readSession } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/contracts/user";

export { SESSION_EXPIRED_PATH, safeRedirectPath } from "@/config/routes";

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  return readSession(cookieStore);
}
