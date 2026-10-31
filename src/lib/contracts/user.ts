/**
 * Users and session claims. Password hashes are DB-only and never appear in a contract.
 * Auth request bodies live in `./auth`.
 */
import { z } from "zod";

import { Role } from "./enums";
import { Id } from "./util";

const userFields = {
  id: Id,
  email: z.email(),
  name: z.string().min(1),
  role: Role,
  /** Department code for coordinators and faculty, e.g. "CSE". */
  department: z.string().min(1).nullable(),
  /** Links a faculty login to its `faculty[]` entry. */
  faculty_id: Id.nullable(),
  /** Club name for club logins. */
  club: z.string().min(1).nullable(),
};

/** A user as returned by the API. Strict, so a stored doc with `password_hash` never parses. */
export const UserSchema = z.strictObject(userFields);
export type User = z.infer<typeof UserSchema>;

/** Claims carried in the session JWT. Registered claims (`iat`, `exp`, …) are stripped on parse. */
export const SessionUserSchema = z.object(userFields);
export type SessionUser = z.infer<typeof SessionUserSchema>;
