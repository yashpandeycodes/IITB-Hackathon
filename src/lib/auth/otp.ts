import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getSessionKey } from "./session";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** A uniformly random 6-digit code (CSPRNG). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Keyed hash of a code, bound to the user, so a leaked users collection can't be brute-forced
 * offline without the server secret.
 */
export function hashOtp(userId: string, otp: string): string {
  return createHmac("sha256", getSessionKey())
    .update(`otp:${userId}:${otp}`)
    .digest("hex");
}

export function otpMatches(
  userId: string,
  otp: string,
  storedHash: string,
): boolean {
  const actual = Buffer.from(hashOtp(userId, otp), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isOtpExpired(
  expiresAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) || at <= now;
}
