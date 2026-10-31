/**
 * Spectra-week booking records and drafts (architecture §5.3, backend §3.4, §5.2).
 */
import { z } from "zod";

import { BookingRequestSchema } from "./dataset";
import { Category, Day, Need, Period, RequestState, RoomType } from "./enums";
import { BookingDecisionSchema, SessionOverrideSchema } from "./schedule";
import { Id, Timestamp, type KnownFields } from "./util";
import { BookingStatsSchema } from "./violation";

/** Why a decision came out the way it did; rendered into `reason` from a template. */
export const ReasonCode = z.enum([
  "APPROVED_AS_REQUESTED",
  "ROOM_SWAPPED_IN_WINDOW",
  "APPROVED_WITH_DISPLACEMENT",
  "ALT_OUTSIDE_WINDOW",
  "REJ_CANCELLED",
  "REJ_NO_CAPACITY",
  "REJ_NO_ROOM_WITH_NEEDS",
  "REJ_OUTRANKED",
  "REJ_MANDATORY_GROUP_BUSY",
  "REJ_INVALID_TIME",
  "REJ_ROOM_UNKNOWN",
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

/**
 * A decision as stored in `booking_decisions`: the export shape plus metadata.
 * Keeps the export checks (slot required unless rejected, reason required unless approved).
 */
export const StoredBookingDecisionSchema = BookingDecisionSchema.safeExtend({
  reason_code: ReasonCode,
  effective_category: Category,
  /** True when the claimed category was lowered to the role's cap. */
  category_capped: z.boolean(),
  /** True when the decision moves sessions for Week 7 (an institute event displacing classes). */
  requires_admin_approval: z.boolean(),
  /** True when the engine decided without an approver. */
  auto: z.boolean(),
  /** "engine" or the deciding user's id. */
  decided_by: Id,
  /**
   * Null for plain engine decisions. For a decision that moves sessions
   * (`requires_admin_approval`), the admin whose Spectra run or activation approved the moves.
   */
  approved_by: Id.nullable(),
  timetable_version: Id.nullable(),
  decided_at: Timestamp,
}).strict();
export type StoredBookingDecision = z.infer<typeof StoredBookingDecisionSchema>;

/**
 * A Week-7-only session move as stored in `session_overrides` (`_id` = `session_id`): the export
 * shape plus the approver and the timetable version it was computed against. Readers only use
 * overrides (and decisions) whose `timetable_version` is the active version.
 */
export const StoredSessionOverrideSchema = SessionOverrideSchema.extend({
  approved_by: Id.nullable(),
  timetable_version: Id,
}).strict();
export type StoredSessionOverride = z.infer<typeof StoredSessionOverrideSchema>;

/**
 * Totals of one Spectra run (`POST /api/spectra/run`, activation): the validator's booking stats
 * (same field names as `ValidatorReport.bookings`) plus the timetable version they belong to.
 */
export const SpectraRunSummarySchema = BookingStatsSchema.extend({
  /** The active timetable version the decisions were computed against. */
  timetable_version: Id,
}).strict();
export type SpectraRunSummary = z.infer<typeof SpectraRunSummarySchema>;

/** `POST /api/spectra/run`: the summary plus every stored decision (dataset order) and Week-7 override. */
export const SpectraRunResultSchema = SpectraRunSummarySchema.extend({
  decisions: z.array(StoredBookingDecisionSchema),
  overrides: z.array(StoredSessionOverrideSchema),
}).strict();
export type SpectraRunResult = z.infer<typeof SpectraRunResultSchema>;

export const BookingSource = z.enum(["dataset", "nl", "form"]);
export type BookingSource = z.infer<typeof BookingSource>;

/** Provenance of a request drafted by the plain-language parser. */
export const AiMetaSchema = z.strictObject({
  model: z.string().min(1),
  prompt_id: z.string().min(1),
  assumptions: z.array(z.string()),
  follow_up: z.string().nullable(),
  log_id: Id,
});
export type AiMeta = z.infer<typeof AiMetaSchema>;

/**
 * A request as stored in `booking_requests`. Stays loose like `BookingRequest`, because
 * dataset-origin requests keep any unknown keys from the imported file.
 */
export const BookingRequestRecordSchema = BookingRequestSchema.extend({
  state: RequestState,
  source: BookingSource,
  /** Null for requests that came from the dataset. */
  created_by: Id.nullable(),
  ai_meta: AiMetaSchema.optional(),
});
export type BookingRequestRecord = KnownFields<
  z.infer<typeof BookingRequestRecordSchema>
>;

/** A window in a draft. Unlike imported windows, drafts must stay inside P1–P13. */
export const DraftWindowSchema = z
  .strictObject({
    day: Day,
    from_period: Period,
    to_period: Period,
  })
  .refine((window) => window.to_period >= window.from_period, {
    path: ["to_period"],
    message: "to_period must not be before from_period",
  });
export type DraftWindow = z.infer<typeof DraftWindowSchema>;

/**
 * The editable booking draft shared by the form and the plain-language parser.
 * Category is not part of it: it always comes from the requester's role.
 */
export const BookingDraftSchema = z.strictObject({
  title: z.string().min(1).max(200),
  attendance: z.number().int().positive(),
  duration_periods: z.number().int().min(1).max(13),
  windows: z.array(DraftWindowSchema).min(1),
  room_types: z.array(RoomType).min(1),
  needs: z.array(Need),
  requested_room: Id.nullable(),
  mandatory_for_groups: z.array(Id),
  /** Extra days to repeat on; each becomes a request sharing a `series_id`. */
  repeat_days: z.array(Day),
  /** Assumptions the parser made, shown as chips for the user to confirm. */
  assumptions: z.array(z.string()),
  /** A question to ask before the draft can be submitted. */
  follow_up: z.string().nullable(),
});
export type BookingDraft = z.infer<typeof BookingDraftSchema>;
