/**
 * Audit trail. Every approve, reject, apply, reset and import writes one entry.
 */
import { z } from "zod";

import { Id, Timestamp } from "./util";

export const AuditLogEntrySchema = z.strictObject({
  id: Id,
  /** User id, or "engine" / "system". */
  actor: Id,
  /** e.g. "approve", "reject", "apply", "reset", "import". */
  action: z.string().min(1),
  /** Collection or concept acted on, e.g. "change_requests". */
  entity: z.string().min(1),
  entity_id: Id,
  at: Timestamp,
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
