import "server-only";
import type { Db } from "mongodb";
import { DEMO_ACCOUNTS } from "@/config/demo-accounts";
import {
  ensureUserIndexes,
  findUserByEmail,
  upsertUserByEmail,
  type UserDoc,
} from "@/lib/db/repos/users";
import { DEMO_PASSWORDS } from "./demo-credentials";
import { hashPassword, verifyPassword } from "./password";

const IDENTITY_FIELDS = [
  "name",
  "role",
  "department",
  "faculty_id",
  "club",
] as const satisfies readonly (keyof UserDoc)[];

export function demoPasswordFor(email: string): string {
  const password = DEMO_PASSWORDS[email];
  if (!password) throw new Error(`No demo password for ${email}.`);
  return password;
}

/**
 * Upserts the four public demo accounts (verified, bcrypt cost 10). Idempotent: an account is
 * only written when an identity field differs, it isn't verified, or its password no longer
 * matches the documented one (only then is it re-hashed).
 */
export async function seedDemoUsers(
  db: Db,
): Promise<{ inserted: number; updated: number }> {
  await ensureUserIndexes(db);
  let inserted = 0;
  let updated = 0;

  for (const account of DEMO_ACCOUNTS) {
    const password = demoPasswordFor(account.email);
    const existing = await findUserByEmail(db, account.email);

    const identity = {
      name: account.name,
      role: account.role,
      department: account.department,
      faculty_id: account.faculty_id,
      club: account.club,
    };
    const changed: Partial<UserDoc> = {};
    for (const field of IDENTITY_FIELDS) {
      if (!existing || existing[field] !== identity[field]) {
        Object.assign(changed, { [field]: identity[field] });
      }
    }
    if (!existing?.is_verified) {
      changed.is_verified = true;
      changed.pending_nonce_hash = null;
      changed.unverified_expires_at = null;
    }
    if (!(await verifyPassword(password, existing?.password_hash))) {
      changed.password_hash = await hashPassword(password);
    }
    if (Object.keys(changed).length === 0) continue;

    const outcome = await upsertUserByEmail(
      db,
      { _id: account.id, email: account.email, ...identity },
      changed,
    );
    if (outcome === "inserted") inserted++;
    else updated++;
  }

  return { inserted, updated };
}
