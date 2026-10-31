import "server-only";

/**
 * Fixed-window, in-memory rate limiting. Per process only: on serverless each warm instance
 * keeps its own counters, which is enough to blunt password and OTP guessing for a demo.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (for `Retry-After`). */
  retryAfterSeconds: number;
};

export type RateLimiter = {
  /** Counts one request and reports whether it is within the limit. */
  hit(key: string, now?: number): RateLimitResult;
  /** Reports whether one more request would be allowed, without counting it. */
  peek(key: string, now?: number): RateLimitResult;
  reset(key: string): void;
};

type Bucket = { count: number; resetAt: number };

const globalForLimits = globalThis as typeof globalThis & {
  __citRateLimits?: Map<string, Map<string, Bucket>>;
};

function store(name: string): Map<string, Bucket> {
  globalForLimits.__citRateLimits ??= new Map();
  let buckets = globalForLimits.__citRateLimits.get(name);
  if (!buckets) {
    buckets = new Map();
    globalForLimits.__citRateLimits.set(name, buckets);
  }
  return buckets;
}

const MAX_KEYS = 10_000;

function prune(buckets: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still full of live keys: drop the oldest so memory stays bounded.
  for (const key of buckets.keys()) {
    if (buckets.size <= MAX_KEYS) break;
    buckets.delete(key);
  }
}

export function createRateLimiter(
  name: string,
  options: { limit: number; windowMs: number },
): RateLimiter {
  return {
    hit(key, now = Date.now()) {
      const buckets = store(name);
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        if (buckets.size >= MAX_KEYS) prune(buckets, now);
        bucket = { count: 0, resetAt: now + options.windowMs };
        buckets.set(key, bucket);
      }
      bucket.count++;
      return {
        allowed: bucket.count <= options.limit,
        remaining: Math.max(0, options.limit - bucket.count),
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - now) / 1000),
        ),
      };
    },
    peek(key, now = Date.now()) {
      const bucket = store(name).get(key);
      const live = bucket && bucket.resetAt > now ? bucket : undefined;
      const count = live?.count ?? 0;
      return {
        allowed: count < options.limit,
        remaining: Math.max(0, options.limit - count),
        retryAfterSeconds: live
          ? Math.max(1, Math.ceil((live.resetAt - now) / 1000))
          : 0,
      };
    },
    reset(key) {
      store(name).delete(key);
    },
  };
}

/** Forgets every counter (tests). */
export function resetRateLimits(): void {
  globalForLimits.__citRateLimits?.clear();
}

const TEN_MINUTES = 10 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const limiter = (name: string, limit: number, windowMs = TEN_MINUTES) =>
  createRateLimiter(name, { limit, windowMs });

/**
 * Every account-flow limit. "ip" keys come from `clientIp` (real addresses only on Vercel);
 * per-email limits hold regardless of IP so rotating addresses doesn't help.
 */
export const limits = {
  /** Failed password attempts per IP + email; reset by a successful sign-in. */
  loginIp: limiter("login-ip", 10),
  /** Failed password attempts per email from anywhere (shared demo logins don't count). */
  loginEmail: limiter("login-email", 20),
  signupIp: limiter("signup-ip", 10),
  signupEmail: limiter("signup-email", 5),
  verifyIp: limiter("verify-ip", 30),
  verifyEmail: limiter("verify-email", 10),
  resendIp: limiter("resend-ip", 10),
  /** Verification emails per address (sign-up, resend and unverified sign-in). */
  otpMailEmail: limiter("otp-mail-email", 5),
  /** Verification emails across all addresses, protecting the mail quota. */
  otpMailGlobal: limiter("otp-mail-global", 60, ONE_HOUR),
  demoLoginIp: limiter("demo-login-ip", 30),
  /**
   * Schedule runs (generate, activate, exams, Spectra) per admin and per IP. Each run stores
   * data and holds the dataset lock, and the demo admin is public.
   */
  scheduleRunUser: limiter("schedule-run-user", 30),
  scheduleRunIp: limiter("schedule-run-ip", 60),
  /** Plain-language parses per user and per IP (each may cost an LLM call). */
  aiParseUser: limiter("ai-parse-user", 30),
  aiParseIp: limiter("ai-parse-ip", 120),
  /** Booking submissions, cancellations and approval decisions per user and per IP. */
  bookingWriteUser: limiter("booking-write-user", 30),
  bookingWriteIp: limiter("booking-write-ip", 120),
  /**
   * Model-phrased booking explanations per user (`GET /api/bookings/:id` with AI on). Over the
   * limit the engine's own text is shown instead: the read never fails.
   */
  aiExplainUser: limiter("ai-explain-user", 30),
} as const;
