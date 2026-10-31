export const SESSION_EXPIRED_PATH = "/login?error=session_expired";

/**
 * Validates that a redirect path is safe (internal relative path) to prevent open-redirect vulnerabilities.
 */
export function safeRedirectPath(
  target: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!target || typeof target !== "string") return fallback;
  // Must start with exactly one slash, not a protocol or double-slash (//)
  if (!target.startsWith("/")) return fallback;
  if (target.startsWith("//")) return fallback;
  return target;
}

