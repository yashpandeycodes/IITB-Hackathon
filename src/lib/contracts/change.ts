/**
 * Change requests: every disruption, faculty request or manual edit becomes a proposal that an
 * admin approves (architecture §5.3). `changes[]` uses the exact starter-pack disruption format.
 */
import { z } from "zod";

import { DisruptionChangeSchema } from "./disruption";
import { ChangeStatus, Day, TeachingPeriod } from "./enums";
import { Count, Id, Timestamp } from "./util";
import { RuleCode } from "./violation";

export const ChangeKind = z.enum([
  "disruption",
  "faculty_request",
  "manual_edit",
  "unavailability",
]);
export type ChangeKind = z.infer<typeof ChangeKind>;

export const SlotRefSchema = z.strictObject({
  day: Day,
  start_period: TeachingPeriod,
  room_id: Id,
});
export type SlotRef = z.infer<typeof SlotRefSchema>;

/** One session's move. `from` is null for an added session, `to` is null for a removed one. */
export const MoveDiffSchema = z.strictObject({
  session_id: Id,
  from: SlotRefSchema.nullable(),
  to: SlotRefSchema.nullable(),
  reason: z.string(),
});
export type MoveDiff = z.infer<typeof MoveDiffSchema>;

/** Why a session could not be placed, grouped by rule. Filled when a proposal is infeasible. */
export const ConflictEntrySchema = z.strictObject({
  session_id: Id,
  blocking: z.array(
    z.strictObject({
      rule: RuleCode,
      /** How many candidate slots this rule ruled out. */
      count: Count,
      detail: z.string(),
    }),
  ),
  summary: z.string(),
});
export type ConflictEntry = z.infer<typeof ConflictEntrySchema>;

export const ChangeRequestSchema = z.strictObject({
  /** e.g. "CR-0001". */
  id: Id,
  kind: ChangeKind,
  requested_by: Id,
  changes: z.array(DisruptionChangeSchema),
  /** The active timetable version the proposal was built on. */
  base_version: Id,
  /** Draft timetable version holding the proposal; null while proposing or when infeasible. */
  proposed_version: Id.nullable(),
  status: ChangeStatus,
  diff: z.array(MoveDiffSchema),
  moved_count: Count,
  time_changed: Count,
  room_only_changed: Count,
  /** Change in total soft penalty; negative is better. */
  soft_delta: z.number().int(),
  hard_violation_count: Count,
  conflicts: z.array(ConflictEntrySchema),
  /** Original text when the request came from the AI assistant. */
  nl_prompt: z.string().nullable(),
  approved_by: Id.nullable(),
  decided_at: Timestamp.nullable(),
  comment: z.string().nullable(),
  created_at: Timestamp,
});
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;

/** `POST /api/changes`. */
export const ChangeProposalRequestSchema = z.strictObject({
  kind: ChangeKind,
  changes: z.array(DisruptionChangeSchema).min(1),
});
export type ChangeProposalRequest = z.infer<typeof ChangeProposalRequestSchema>;

/** `POST /api/changes/:id/approve` and `/reject`. */
export const ChangeDecisionRequestSchema = z.strictObject({
  comment: z.string().max(1000).optional(),
});
export type ChangeDecisionRequest = z.infer<typeof ChangeDecisionRequestSchema>;
