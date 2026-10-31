import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDemoAccount } from "@/config/demo-accounts";
import type { Role } from "@/lib/contracts/enums";
import type { User } from "@/lib/contracts/user";
import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/db/repos/meta";
import * as users from "@/lib/db/repos/users";
import type { UserDoc } from "@/lib/db/repos/users";
import { getServerEnv } from "@/lib/env";
import { forbidden, internalError } from "@/lib/errors";
import { mailStatus, sendOtpEmail } from "@/lib/services/brevo-mail";
import { AuthError, clientIp, minutes, rateLimited } from "./http";
import {
  generateOtp,
  hashOtp,
  isOtpExpired,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  otpMatches,
} from "./otp";
import { hashPassword, verifyPassword } from "./password";
import { limits, type RateLimiter } from "./rate-limit";
import { ROLE_LABEL, SELF_SERVICE_ROLES } from "./roles";
import { demoPasswordFor, seedDemoUsers } from "./seed";
import {
  clearSession,
  createSession,
  httpOnlyCookie,
  readCookie,
  readSessionClaims,
  type SessionCookie,
} from "./session";

/**
 * Account flows behind /api/auth/* (routes call these; they never touch the users repo):
 * password and demo sign-in, Club Representative sign-up with an emailed OTP bound to the
 * sign-up browser, verification, resend and logout with session revocation.
 */

export const INVALID_CREDENTIALS = "Invalid institutional email or password.";
export const STAFF_SIGNUP_FORBIDDEN =
  "Admin and Department Coordinator accounts can't be created by sign-up. " +
  "Sign in with the demo accounts listed in the README.";
export const FACULTY_SIGNUP_FORBIDDEN =
  "Faculty accounts are set up by the Dean's office. Use a demo account.";
const NO_PENDING_CODE =
  "No active verification code for this email. Request a new code.";
const WRONG_BROWSER =
  "Finish verification in the browser where you signed up, or sign in again to get a new code.";
const EMAIL_TAKEN =
  "An account with this institutional email is already registered. Please sign in.";

/** httpOnly cookie binding a pending sign-up to the browser that chose its password. */
export const PENDING_COOKIE = "cit_pending_signup";
/** Unverified sign-ups (and their pending cookie) live for 24 hours. */
export const UNVERIFIED_TTL_MS = 24 * 60 * 60 * 1000;

/** The user shape the CIT Nexus forms and role pages know (display-label role). */
export function toLegacyUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: ROLE_LABEL[user.role],
  };
}

// ---- rate limits ---------------------------------------------------------------------------

function tooMany(message: string, retryAfterSeconds: number): AuthError {
  return rateLimited(
    `${message} Try again in ${minutes(retryAfterSeconds)}.`,
    retryAfterSeconds,
  );
}

/** Counts a request; throws 429 once the limit is passed. */
function hitLimit(limiter: RateLimiter, key: string, message: string): void {
  const result = limiter.hit(key);
  if (!result.allowed) throw tooMany(message, result.retryAfterSeconds);
}

/** Throws 429 if the limit is already used up, without counting this request. */
function checkLimit(limiter: RateLimiter, key: string, message: string): void {
  const result = limiter.peek(key);
  if (!result.allowed) throw tooMany(message, result.retryAfterSeconds);
}

/** One verification email against the per-address and the global hourly quota. */
function checkOtpMailQuota(email: string): void {
  hitLimit(
    limits.otpMailEmail,
    users.normaliseEmail(email),
    "Too many verification codes requested.",
  );
  const global = limits.otpMailGlobal.hit("all");
  if (!global.allowed) {
    throw new AuthError(
      "MAIL_UNAVAILABLE",
      "Verification emails are paused for a while. Please use a demo account.",
      { retry_after_seconds: global.retryAfterSeconds },
      { "Retry-After": String(global.retryAfterSeconds) },
    );
  }
}

// ---- pending sign-up nonce -----------------------------------------------------------------

function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

function sameHash(a: string, b: string | null): boolean {
  if (!b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function newPendingNonce() {
  const nonce = randomBytes(32).toString("base64url");
  return { nonce, hash: hashNonce(nonce) };
}

function pendingCookie(nonce: string): SessionCookie {
  return httpOnlyCookie(
    PENDING_COOKIE,
    nonce,
    UNVERIFIED_TTL_MS / 1000,
    "/api/auth",
  );
}

/** Expires the pending sign-up cookie (after a successful verification). */
export function clearPendingCookie(): SessionCookie {
  return httpOnlyCookie(PENDING_COOKIE, "", 0, "/api/auth");
}

/** Hash of the request's pending-sign-up nonce, if it sent one. */
function requestNonceHash(request: Request): string | null {
  const nonce = readCookie(request, PENDING_COOKIE);
  return nonce && nonce.length <= 128 ? hashNonce(nonce) : null;
}

// ---- OTP delivery --------------------------------------------------------------------------

/** Production without a mail key, or a key without its sender/SMTP login → 503. */
function assertMailAvailable(): void {
  if (mailStatus() === "unavailable") {
    throw new AuthError(
      "MAIL_UNAVAILABLE",
      "Email verification isn't available right now. Please use a demo account.",
    );
  }
}

function newOtp(userId: string) {
  const otp = generateOtp();
  return {
    otp,
    otp_hash: hashOtp(userId, otp),
    otp_expires_at: nowIso(new Date(Date.now() + OTP_TTL_MS)),
  };
}

/** Emails the code; it never appears in a response (development logs it server-side). */
async function deliverOtp(
  email: string,
  name: string,
  otp: string,
): Promise<void> {
  const result = await sendOtpEmail(email, name, otp);
  if (!result.success) {
    throw new AuthError(
      "MAIL_UNAVAILABLE",
      "We couldn't send the verification email. Try again in a minute.",
    );
  }
}

/** Replaces the OTP (and optionally the nonce) of an unverified account and emails it. */
async function issueOtp(
  user: UserDoc,
  pendingNonceHash?: string,
): Promise<void> {
  assertMailAvailable();
  checkOtpMailQuota(user.email);
  const { otp, ...fields } = newOtp(user._id);
  await users.setOtp(await getDb(), user._id, {
    ...fields,
    ...(pendingNonceHash ? { pending_nonce_hash: pendingNonceHash } : {}),
  });
  await deliverOtp(user.email, user.name, otp);
}

// ---- sign-in -------------------------------------------------------------------------------

/** One generic failure for unknown email, wrong password and password-less accounts. */
async function authenticate(email: string, password: string): Promise<UserDoc> {
  const doc = await users.findUserByEmail(await getDb(), email);
  const matches = await verifyPassword(password, doc?.password_hash);
  if (!doc || !matches) {
    throw new AuthError("UNAUTHENTICATED", INVALID_CREDENTIALS);
  }
  return doc;
}

export type PasswordLoginResult =
  | { kind: "signed_in"; user: User; session: SessionCookie }
  | { kind: "needs_otp"; email: string; pending: SessionCookie };

/**
 * Email + password sign-in. Failed attempts count per IP + email (10 / 10 min) and per email
 * from anywhere (20 / 10 min). An unverified sign-up gets a fresh code bound to this browser
 * (knowing the password is what proves it is the sign-up's owner).
 */
export async function passwordLogin(
  request: Request,
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  const ipKey = `${clientIp(request)}|${email}`;
  const message = "Too many sign-in attempts.";
  checkLimit(limits.loginIp, ipKey, message);
  checkLimit(limits.loginEmail, email, message);

  let doc: UserDoc;
  try {
    doc = await authenticate(email, password);
  } catch (err) {
    limits.loginIp.hit(ipKey);
    limits.loginEmail.hit(email);
    throw err;
  }
  limits.loginIp.reset(ipKey);

  if (!doc.is_verified) {
    const { nonce, hash } = newPendingNonce();
    await issueOtp(doc, hash);
    return {
      kind: "needs_otp",
      email: doc.email,
      pending: pendingCookie(nonce),
    };
  }
  const user = users.toUser(doc);
  return { kind: "signed_in", user, session: await createSession(user) };
}

/**
 * One-click sign-in for the four demo accounts (30 per IP per 10 minutes). Re-seeds them first
 * if they are missing or stale. Off when `DEMO_LOGIN_ENABLED=false`.
 */
export async function demoAccountLogin(
  request: Request,
  role: Role,
): Promise<{ user: User; session: SessionCookie }> {
  if (!getServerEnv().DEMO_LOGIN_ENABLED) {
    throw forbidden("Demo sign-in is turned off on this deployment.");
  }
  hitLimit(limits.demoLoginIp, clientIp(request), "Too many demo sign-ins.");

  const account = getDemoAccount(role);
  try {
    const db = await getDb();
    const password = demoPasswordFor(account.email);
    let doc = await users.findUserByEmail(db, account.email);
    if (
      !doc?.is_verified ||
      !(await verifyPassword(password, doc.password_hash))
    ) {
      await seedDemoUsers(db);
      doc = await users.findUserByEmail(db, account.email);
    }
    if (doc) {
      const user = users.toUser(doc);
      return { user, session: await createSession(user) };
    }
  } catch (err) {
    console.warn(
      "[auth] Database unreachable during demo login. Using demo account fallback:",
      err instanceof Error ? err.message : err,
    );
    const fallbackUser: User = {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      department: account.department,
      faculty_id: account.faculty_id,
      club: account.club,
    };
    return { user: fallbackUser, session: await createSession(fallbackUser) };
  }
  throw internalError("The demo account could not be prepared.");
}

/** Revokes the request's session (best effort) and returns the cookie that clears it. */
export async function logoutSession(request: Request): Promise<SessionCookie> {
  const claims = await readSessionClaims(request);
  if (claims) {
    try {
      await users.revokeSession(await getDb(), claims.jti, claims.expiresAt);
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      console.error(`[auth] Could not record the logout (${name}).`);
    }
  }
  return clearSession();
}

// ---- sign-up -------------------------------------------------------------------------------

export type SignupInput = {
  name: string;
  email: string;
  role: Role;
  password: string;
};

/**
 * Creates (or, from the same browser or after its code expired, replaces) an unverified Club
 * Representative account and emails its OTP. Staff and faculty accounts are never self-service.
 *
 * Takeover guard: while a code is active, only the browser holding the sign-up's nonce may
 * replace the password; anyone else gets 409. The nonce is re-issued on every (re)registration,
 * and verification requires it, so a stranger who re-submits can never verify a password they
 * chose for someone else's mailbox, nor plant one the owner later verifies.
 */
export async function registerAccount(
  request: Request,
  input: SignupInput,
): Promise<{ pending: SessionCookie }> {
  hitLimit(limits.signupIp, clientIp(request), "Too many sign-up attempts.");
  hitLimit(limits.signupEmail, input.email, "Too many sign-up attempts.");

  if (!SELF_SERVICE_ROLES.includes(input.role)) {
    throw forbidden(
      input.role === "faculty"
        ? FACULTY_SIGNUP_FORBIDDEN
        : STAFF_SIGNUP_FORBIDDEN,
    );
  }
  assertMailAvailable();

  const db = await getDb();
  const existing = await users.findUserByEmail(db, input.email);
  if (existing?.is_verified) throw new AuthError("EMAIL_TAKEN", EMAIL_TAKEN);
  if (existing) {
    const codeActive =
      existing.otp_hash !== null && !isOtpExpired(existing.otp_expires_at);
    const nonceHash = requestNonceHash(request);
    const sameBrowser =
      nonceHash !== null && sameHash(nonceHash, existing.pending_nonce_hash);
    if (codeActive && !sameBrowser) {
      const wait = Math.ceil(
        (Date.parse(existing.otp_expires_at!) - Date.now()) / 1000,
      );
      throw new AuthError(
        "CONFLICT",
        "A sign-up for this email is already waiting for verification. Enter the emailed code " +
          `in the browser you signed up in, or try again in ${minutes(wait)}.`,
      );
    }
  }
  checkOtpMailQuota(input.email);

  const password_hash = await hashPassword(input.password);
  const id = existing?._id ?? `u_${randomBytes(6).toString("hex")}`;
  const { otp, ...otpFields } = newOtp(id);
  const { nonce, hash } = newPendingNonce();
  const pendingFields = {
    pending_nonce_hash: hash,
    unverified_expires_at: new Date(Date.now() + UNVERIFIED_TTL_MS),
  };

  const stored = existing
    ? await users.replacePendingSignup(
        db,
        id,
        {
          otp_hash: existing.otp_hash,
          pending_nonce_hash: existing.pending_nonce_hash ?? null,
        },
        {
          name: input.name,
          role: input.role,
          password_hash,
          ...otpFields,
          ...pendingFields,
        },
      )
    : (await users.insertUser(db, {
        _id: id,
        email: input.email,
        name: input.name,
        role: input.role,
        department: null,
        faculty_id: null,
        club: null,
        password_hash,
        is_verified: false,
        ...otpFields,
        ...pendingFields,
      })) !== null;
  // Lost a race with a concurrent sign-up or verification for the same email.
  if (!stored) {
    throw new AuthError(
      "CONFLICT",
      "This email's sign-up changed in the meantime. Please try again.",
    );
  }

  await deliverOtp(input.email, input.name, otp);
  return { pending: pendingCookie(nonce) };
}

/**
 * Checks a code (5 attempts per code, 10-minute expiry) from the browser holding the
 * sign-up's nonce, marks the account verified and signs it in. Every check spends an attempt
 * atomically, so parallel guesses can't exceed the limit; a missing or wrong nonce spends none.
 */
export async function verifyAccountOtp(
  request: Request,
  email: string,
  otp: string,
): Promise<{ user: User; session: SessionCookie }> {
  const message = "Too many verification attempts.";
  hitLimit(limits.verifyIp, clientIp(request), message);
  hitLimit(limits.verifyEmail, email, message);

  const nonceHash = requestNonceHash(request);
  if (!nonceHash) throw new AuthError("VALIDATION_ERROR", WRONG_BROWSER);

  const db = await getDb();
  const doc = await users.consumeOtpAttempt(
    db,
    email,
    nonceHash,
    OTP_MAX_ATTEMPTS,
  );
  if (!doc?.otp_hash) {
    const current = await users.findUserByEmail(db, email);
    if (current && !current.is_verified && current.otp_hash) {
      if (!sameHash(nonceHash, current.pending_nonce_hash)) {
        throw new AuthError("VALIDATION_ERROR", WRONG_BROWSER);
      }
      await users.clearOtp(db, current._id);
      throw new AuthError(
        "RATE_LIMITED",
        "Too many incorrect codes. Request a new code.",
      );
    }
    throw new AuthError("VALIDATION_ERROR", NO_PENDING_CODE);
  }

  if (isOtpExpired(doc.otp_expires_at)) {
    await users.clearOtp(db, doc._id);
    throw new AuthError(
      "VALIDATION_ERROR",
      "This code has expired. Request a new code.",
    );
  }

  if (!otpMatches(doc._id, otp, doc.otp_hash)) {
    const left = OTP_MAX_ATTEMPTS - doc.otp_attempts;
    if (left <= 0) {
      await users.clearOtp(db, doc._id);
      throw new AuthError(
        "VALIDATION_ERROR",
        "Incorrect code. No attempts left; request a new code.",
      );
    }
    throw new AuthError(
      "VALIDATION_ERROR",
      `Incorrect code. ${left} ${left === 1 ? "attempt" : "attempts"} left.`,
    );
  }

  if (!(await users.markVerified(db, doc._id, doc.otp_hash))) {
    throw new AuthError("VALIDATION_ERROR", NO_PENDING_CODE);
  }
  const user = users.toUser(doc);
  return { user, session: await createSession(user) };
}

/** Sends a fresh code to an unverified account, from the browser holding its nonce. */
export async function resendAccountOtp(
  request: Request,
  email: string,
): Promise<{ pending: SessionCookie }> {
  hitLimit(limits.resendIp, clientIp(request), "Too many code requests.");

  const nonce = readCookie(request, PENDING_COOKIE);
  const doc = await users.findUserByEmail(await getDb(), email);
  if (
    !nonce ||
    !doc ||
    doc.is_verified ||
    !sameHash(hashNonce(nonce), doc.pending_nonce_hash)
  ) {
    throw new AuthError(
      "VALIDATION_ERROR",
      "No pending verification for this email in this browser. Sign up or sign in again.",
    );
  }
  await issueOtp(doc);
  return { pending: pendingCookie(nonce) };
}
