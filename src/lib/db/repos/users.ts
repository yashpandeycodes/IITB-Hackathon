import "server-only";
import type { Db, IndexDescription } from "mongodb";
import type { Role } from "@/lib/contracts/enums";
import { UserSchema, type User } from "@/lib/contracts/user";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { isDuplicateKeyError, nowIso } from "./meta";

/**
 * `users` and `revoked_sessions` (architecture §5.3). A user's `_id` is its id (`u_admin`,
 * `u_<random>` for sign-ups) and is stored again as `id` so the doc is a superset of the `User`
 * contract. Credentials, OTP and sign-up state never leave this module except through `toUser`,
 * which strips them. No in-memory fallback: driver errors surface as `INTERNAL_ERROR`.
 */
export type UserDoc = User &
  BaseDoc & {
    password_hash: string | null;
    is_verified: boolean;
    otp_hash: string | null;
    otp_expires_at: string | null;
    otp_attempts: number;
    google_id: string | null;
    /** SHA-256 of the sign-up browser's nonce cookie; verification must present the nonce. */
    pending_nonce_hash: string | null;
    /** Unverified sign-ups are deleted by a TTL index at this time (BSON date). */
    unverified_expires_at: Date | null;
  };

/** A logged-out session's `jti`, kept until the token would have expired anyway. */
export type RevokedSessionDoc = {
  _id: string;
  expires_at: Date;
  created_at: string;
};

export const USER_INDEXES: IndexDescription[] = [
  { key: { email: 1 }, name: "email_unique", unique: true },
  {
    key: { unverified_expires_at: 1 },
    name: "unverified_ttl",
    expireAfterSeconds: 0,
    partialFilterExpression: { is_verified: false },
  },
];

export const REVOKED_SESSION_INDEXES: IndexDescription[] = [
  { key: { expires_at: 1 }, name: "expires_at_ttl", expireAfterSeconds: 0 },
];

const users = (db: Db) => db.collection<UserDoc>(COLLECTIONS.users);
const revoked = (db: Db) =>
  db.collection<RevokedSessionDoc>(COLLECTIONS.revoked_sessions);

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Idempotent; called by the seeder (and so by reset) and lazily before the first write. */
export async function ensureUserIndexes(db: Db): Promise<void> {
  await users(db).createIndexes(USER_INDEXES);
  await revoked(db).createIndexes(REVOKED_SESSION_INDEXES);
}

const ensured = new Map<string, Promise<void>>();

async function ensureOnce(db: Db): Promise<void> {
  let pending = ensured.get(db.databaseName);
  if (!pending) {
    pending = ensureUserIndexes(db).catch((err: unknown) => {
      ensured.delete(db.databaseName);
      throw err;
    });
    ensured.set(db.databaseName, pending);
  }
  await pending;
}

/** The public `User` contract for a stored doc (credentials and OTP state removed). */
export function toUser(doc: UserDoc): User {
  return UserSchema.parse({
    id: doc._id,
    email: doc.email,
    name: doc.name,
    role: doc.role,
    department: doc.department,
    faculty_id: doc.faculty_id,
    club: doc.club,
  });
}

export async function findUserByEmail(
  db: Db,
  email: string,
): Promise<UserDoc | null> {
  return users(db).findOne({ email: normaliseEmail(email) });
}

export async function findUserById(
  db: Db,
  id: string,
): Promise<UserDoc | null> {
  return users(db).findOne({ _id: id });
}

type OtpFields = Pick<UserDoc, "otp_hash" | "otp_expires_at">;

export type NewUser = Pick<
  UserDoc,
  "_id" | "email" | "name" | "role" | "department" | "faculty_id" | "club"
> &
  Partial<
    Pick<
      UserDoc,
      | "password_hash"
      | "is_verified"
      | "otp_hash"
      | "otp_expires_at"
      | "google_id"
      | "pending_nonce_hash"
      | "unverified_expires_at"
    >
  >;

/** Inserts a user. Returns null (nothing written) when the email is already registered. */
export async function insertUser(
  db: Db,
  user: NewUser,
): Promise<UserDoc | null> {
  await ensureOnce(db);
  const at = nowIso();
  const doc: UserDoc = {
    _id: user._id,
    id: user._id,
    email: normaliseEmail(user.email),
    name: user.name,
    role: user.role,
    department: user.department,
    faculty_id: user.faculty_id,
    club: user.club,
    password_hash: user.password_hash ?? null,
    is_verified: user.is_verified ?? false,
    otp_hash: user.otp_hash ?? null,
    otp_expires_at: user.otp_expires_at ?? null,
    otp_attempts: 0,
    google_id: user.google_id ?? null,
    pending_nonce_hash: user.pending_nonce_hash ?? null,
    unverified_expires_at: user.unverified_expires_at ?? null,
    created_at: at,
    updated_at: at,
  };
  try {
    await users(db).insertOne(doc);
    return doc;
  } catch (err) {
    if (isDuplicateKeyError(err, "email")) return null;
    throw err;
  }
}

/**
 * Replaces a pending (unverified) sign-up, but only if its OTP and nonce are still what the
 * caller read (compare-and-swap), so a concurrent sign-up or verification can't be clobbered.
 * The caller decides whether replacing is allowed at all.
 */
export async function replacePendingSignup(
  db: Db,
  id: string,
  expected: Pick<UserDoc, "otp_hash" | "pending_nonce_hash">,
  update: OtpFields & {
    name: string;
    role: Role;
    password_hash: string;
    pending_nonce_hash: string;
    unverified_expires_at: Date;
  },
): Promise<boolean> {
  const result = await users(db).updateOne(
    {
      _id: id,
      is_verified: false,
      otp_hash: expected.otp_hash,
      pending_nonce_hash: expected.pending_nonce_hash,
    },
    { $set: { ...update, otp_attempts: 0, updated_at: nowIso() } },
  );
  return result.matchedCount === 1;
}

/**
 * Stores a fresh OTP for an unverified account and resets its attempt counter; a new
 * `pending_nonce_hash` rebinds verification to the caller's browser.
 */
export async function setOtp(
  db: Db,
  id: string,
  otp: OtpFields & { pending_nonce_hash?: string },
): Promise<boolean> {
  const result = await users(db).updateOne(
    { _id: id, is_verified: false },
    { $set: { ...otp, otp_attempts: 0, updated_at: nowIso() } },
  );
  return result.matchedCount === 1;
}

/**
 * Atomically spends one OTP attempt for an unverified account with an active code whose nonce
 * matches. Returns the updated doc, or null (no active code, wrong nonce, attempts used up).
 */
export async function consumeOtpAttempt(
  db: Db,
  email: string,
  nonceHash: string,
  maxAttempts: number,
): Promise<UserDoc | null> {
  return users(db).findOneAndUpdate(
    {
      email: normaliseEmail(email),
      is_verified: false,
      otp_hash: { $ne: null },
      pending_nonce_hash: nonceHash,
      otp_attempts: { $lt: maxAttempts },
    },
    { $inc: { otp_attempts: 1 } },
    { returnDocument: "after" },
  );
}

/** Marks the account verified if `otpHash` is still its active code (single use). */
export async function markVerified(
  db: Db,
  id: string,
  otpHash: string,
): Promise<boolean> {
  const result = await users(db).updateOne(
    { _id: id, is_verified: false, otp_hash: otpHash },
    {
      $set: {
        is_verified: true,
        otp_hash: null,
        otp_expires_at: null,
        otp_attempts: 0,
        pending_nonce_hash: null,
        unverified_expires_at: null,
        updated_at: nowIso(),
      },
    },
  );
  return result.modifiedCount === 1;
}

/** Invalidates the active OTP (expired or out of attempts). */
export async function clearOtp(db: Db, id: string): Promise<void> {
  await users(db).updateOne(
    { _id: id },
    { $set: { otp_hash: null, otp_expires_at: null, updated_at: nowIso() } },
  );
}

/**
 * Upserts a user by email (used by the demo seeder). `set` is applied either way; `_id`,
 * `id`, OTP/sign-up state and `created_at` are only written on insert, since `_id` can't
 * change. Callers decide whether anything changed (this always bumps `updated_at`).
 */
export async function upsertUserByEmail(
  db: Db,
  user: NewUser,
  set: Partial<
    Pick<
      UserDoc,
      | "name"
      | "role"
      | "department"
      | "faculty_id"
      | "club"
      | "password_hash"
      | "is_verified"
      | "pending_nonce_hash"
      | "unverified_expires_at"
    >
  >,
): Promise<"inserted" | "updated"> {
  await ensureOnce(db);
  const at = nowIso();
  const onInsert: Partial<UserDoc> = {
    _id: user._id,
    id: user._id,
    otp_hash: null,
    otp_expires_at: null,
    otp_attempts: 0,
    google_id: null,
    pending_nonce_hash: null,
    unverified_expires_at: null,
    created_at: at,
  };
  // A field may appear in only one operator.
  for (const key of Object.keys(set)) delete onInsert[key as keyof UserDoc];
  const result = await users(db).updateOne(
    { email: normaliseEmail(user.email) },
    { $set: { ...set, updated_at: at }, $setOnInsert: onInsert },
    { upsert: true },
  );
  return result.upsertedCount > 0 ? "inserted" : "updated";
}

/** Records a logged-out session; the TTL index drops it once the token has expired. */
export async function revokeSession(
  db: Db,
  jti: string,
  expiresAt: Date,
): Promise<void> {
  await ensureOnce(db);
  await revoked(db).updateOne(
    { _id: jti },
    { $setOnInsert: { expires_at: expiresAt, created_at: nowIso() } },
    { upsert: true },
  );
}

export async function isSessionRevoked(db: Db, jti: string): Promise<boolean> {
  const doc = await revoked(db).findOne(
    { _id: jti },
    { projection: { _id: 1 } },
  );
  return doc !== null;
}
