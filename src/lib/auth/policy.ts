import { selfApproval } from "@/lib/errors";

/**
 * Framework-free authorization rules shared by services and route guards. Imports nothing from
 * Next.js, the database or the session layer, so services can use it (architecture §3).
 */

/** `SELF_APPROVAL` (403) when someone tries to approve their own request. */
export function assertNotSelf(
  approverId: string,
  requesterId: string | null,
): void {
  if (requesterId !== null && approverId === requesterId) throw selfApproval();
}
