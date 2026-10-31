/**
 * Kept only because `src/lib/validation.ts` (frontend) imports `UserRole` from here.
 * Users are stored through `@/lib/db/repos/users`; there is no Mongoose model.
 */
export type { UserRole } from "@/lib/auth/roles";
