/**
 * Validates a post-login `redirect` target (client-safe; the login form and the server both use
 * it). Only same-site paths pass: a single leading `/`, no scheme or host (`//evil.example`,
 * `/\evil.example`, `https:`, `javascript:`), no control characters, and never back to the
 * auth pages or the API. Anything else becomes `fallback`.
 */
const BLOCKED_PREFIXES = ["/login", "/signup", "/api/"];

export function safeRedirectPath(
  value: unknown,
  fallback = "/dashboard",
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  const base = "http://same-origin.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  const blocked = BLOCKED_PREFIXES.some(
    (prefix) =>
      url.pathname === prefix.replace(/\/$/, "") ||
      url.pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
  return blocked ? fallback : path;
}
