import "server-only";
import bcrypt from "bcryptjs";

export const BCRYPT_COST = 10;

/**
 * A cost-10 hash of a random string nobody knows. Comparing against it when the account is
 * missing (or has no password) keeps the response time the same as a real wrong password.
 */
const DUMMY_HASH =
  "$2b$10$6LGvA/hF7vxDfefWX8Kwn.Dsm7mDVSN9ssQpPPqo9AEEAmjC4tNtG";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Constant-work check: always runs one bcrypt compare, false when there is no hash. */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && matches;
}
