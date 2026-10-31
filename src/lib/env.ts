import "server-only";
import { z } from "zod";

/**
 * Server environment. Read lazily (never at import time) so `next build` works without env,
 * and validated with Zod. Error messages name the variable but never echo its value.
 */

const boolFlag = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z.enum(["true", "false", "1", "0"], {
      error: 'Expected "true" or "false"',
    }),
  )
  .transform((v) => v === "true" || v === "1");

const positiveMs = z.coerce.number().int().min(1).max(600_000);

const EnvSchema = z.object({
  // Database. The URI is optional here and enforced at use time by requireMongoUri().
  MONGODB_URI: z.string().trim().min(1).optional(),
  MONGODB_DB: z.string().trim().min(1).default("cit_dev"),
  // Auth. Optional here; requireSessionSecret() enforces presence where sessions are signed.
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters")
    .optional(),
  /** Optional session-signing override; AUTH_SECRET is used when unset. */
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters")
    .optional(),
  /** One-click sign-in for the four public demo accounts (the judges need it on the deployment). */
  DEMO_LOGIN_ENABLED: boolFlag.default(true),
  // Account sign-up mail (Brevo). The key prefix picks the transport: `xsmtpsib-` → SMTP relay
  // (needs BREVO_SMTP_LOGIN or its alias BREVO_SMTP_USER), anything else (`xkeysib-`) → REST API. No key: codes are only
  // logged to the server console in development; production answers MAIL_UNAVAILABLE.
  BREVO_API_KEY: z.string().trim().min(1).optional(),
  /** `noreply@example.org` or `CIT Nexus <noreply@example.org>`; must be a Brevo-verified sender. */
  BREVO_SENDER_EMAIL: z
    .string()
    .trim()
    .refine(
      (value) => parseMailbox(value) !== null,
      'BREVO_SENDER_EMAIL must be an email address or "Name <email>"',
    )
    .optional(),
  BREVO_SENDER_NAME: z.string().trim().min(1).default("CIT Nexus"),
  BREVO_SMTP_HOST: z.string().trim().min(1).default("smtp-relay.brevo.com"),
  BREVO_SMTP_PORT: z.coerce
    .number()
    .int()
    .min(1, "BREVO_SMTP_PORT must be a TCP port")
    .max(65_535, "BREVO_SMTP_PORT must be a TCP port")
    .default(587),
  /** The SMTP login Brevo shows next to the `xsmtpsib-` key (required for SMTP). */
  BREVO_SMTP_LOGIN: z.string().trim().min(1).optional(),
  /** Accepted alias for BREVO_SMTP_LOGIN (the name used in the team's env files). */
  BREVO_SMTP_USER: z.string().trim().min(1).optional(),
  // Google sign-in (not wired yet: no callback route).
  GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z
    .url("NEXT_PUBLIC_APP_URL must be an absolute URL")
    .optional(),
  // AI (Gemini)
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  GEMINI_MODEL_FAST: z.string().trim().min(1).optional(),
  GEMINI_MODEL_SMART: z.string().trim().min(1).optional(),
  LLM_ENABLED: boolFlag.default(true),
  LLM_TIMEOUT_MS: positiveMs.default(8000),
  // Solver
  SOLVER_TIME_BUDGET_MS: positiveMs.default(8000),
  SOLVER_SEED: z.coerce.number().int().min(0).max(0xffff_ffff).default(42),
  // App
  TEAM_NAME: z.string().trim().min(1).default("CIT Crunch Week"),
  /** The "today" that "today/tomorrow/kal" resolves against (Monday of fest week by default). */
  APP_REFERENCE_DATE: z.iso
    .date("APP_REFERENCE_DATE must be an ISO date (YYYY-MM-DD)")
    .default("2027-02-08"),
});

export type ServerEnv = z.output<typeof EnvSchema>;

const MailboxAddress = z.email();

/**
 * `"a@b.org"` or `"Name <a@b.org>"` (name optionally quoted) → `{ name, email }`; null when the
 * address is not a valid email. Shared by env validation and the mail service.
 */
export function parseMailbox(
  raw: string,
): { name: string | null; email: string } | null {
  const value = raw.trim();
  const angle = /^(?:"?([^"<>]*?)"?\s*)?<([^<>\s]+)>$/.exec(value);
  const email = angle ? angle[2] : value;
  if (!MailboxAddress.safeParse(email).success) return null;
  const name = angle?.[1]?.trim() || null;
  return { name, email };
}
export type EnvKey = keyof typeof EnvSchema.shape;

const ENV_KEYS = Object.keys(EnvSchema.shape) as EnvKey[];

export class EnvValidationError extends Error {
  constructor(readonly issues: { key: string; message: string }[]) {
    super(
      `Invalid server environment:\n${issues.map((i) => `  - ${i.key}: ${i.message}`).join("\n")}\n` +
        "Check .env.local against .env.example.",
    );
    this.name = "EnvValidationError";
  }
}

/** Empty strings and `<placeholder>` values (as in .env.example) count as unset. */
function normalise(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || /^<.*>$/.test(trimmed)) return undefined;
  return value;
}

/** Pure parser: picks only known keys from `source`, applies defaults, throws EnvValidationError. */
export function parseEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const picked: Partial<Record<EnvKey, string>> = {};
  for (const key of ENV_KEYS) {
    const value = normalise(source[key]);
    if (value !== undefined) picked[key] = value;
  }
  const result = EnvSchema.safeParse(picked);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => ({
        key: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    );
  }

  const deployed =
    source.NODE_ENV === "production" || source.VERCEL !== undefined;
  const deployIssues: { key: string; message: string }[] = [];
  if (source.VERCEL !== undefined && picked.MONGODB_DB === undefined) {
    deployIssues.push({
      key: "MONGODB_DB",
      message: "Must be set explicitly on deployed environments",
    });
  }
  for (const key of ["AUTH_SECRET", "JWT_SECRET"] as const) {
    const secret = result.data[key];
    if (deployed && secret && isWeakSecret(secret)) {
      deployIssues.push({
        key,
        message:
          "Looks like a placeholder; use a random value (openssl rand -base64 32)",
      });
    }
  }
  if (deployIssues.length > 0) throw new EnvValidationError(deployIssues);
  return {
    ...result.data,
    BREVO_SMTP_LOGIN:
      result.data.BREVO_SMTP_LOGIN ?? result.data.BREVO_SMTP_USER,
  };
}

/** Placeholder-looking or low-variety secrets, e.g. the CI dummy value or "aaaa…". */
function isWeakSecret(secret: string): boolean {
  return (
    /placeholder|changeme|example|dummy|secret/i.test(secret) ||
    new Set(secret).size < 10
  );
}

let cached: ServerEnv | undefined;

/** Memoised, validated view of `process.env`. Only call from server code at request/run time. */
export function getServerEnv(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Returns the session-signing secret or throws a clear configuration error. */
export function requireAuthSecret(env: ServerEnv = getServerEnv()): string {
  if (!env.AUTH_SECRET) {
    throw new Error(
      "AUTH_SECRET is not set. Add a random string of at least 32 characters to .env.local " +
        "(for example: openssl rand -base64 32).",
    );
  }
  return env.AUTH_SECRET;
}

/**
 * The session-signing secret: `JWT_SECRET` when set, else `AUTH_SECRET`. Both are validated
 * above (32+ chars, no placeholder in production); there is no fallback, so it fails closed.
 */
export function requireSessionSecret(env: ServerEnv = getServerEnv()): string {
  return env.JWT_SECRET ?? requireAuthSecret(env);
}

/** Returns the MongoDB connection string or throws a clear configuration error. */
export function requireMongoUri(env: ServerEnv = getServerEnv()): string {
  if (!env.MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not set. Add it to .env.local (local default: "mongodb://127.0.0.1:27017").',
    );
  }
  return env.MONGODB_URI;
}
