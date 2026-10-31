import type { Role } from "@/lib/contracts/enums";
import {
  ROLE_LABEL,
  RoleLabel,
  roleFromInput,
  SELF_SERVICE_ROLES,
} from "@/lib/contracts/auth";

/**
 * Display labels used by the CIT Nexus login/signup UI and role pages, re-exported from the
 * auth contract (the single source). The stored and signed role is always the contracts
 * `Role`; labels exist only at the UI boundary. Client-safe: no server-only imports.
 */
export type UserRole = RoleLabel;

export { ROLE_LABEL, SELF_SERVICE_ROLES };

export const USER_ROLE_LABELS: readonly UserRole[] = RoleLabel.options;

/** `"Faculty"` → `"faculty"`. Unknown labels return null. */
export function roleFromLabel(label: string): Role | null {
  return RoleLabel.safeParse(label).success ? roleFromInput(label) : null;
}
