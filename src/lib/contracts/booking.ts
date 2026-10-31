/**
 * Spectra-week booking records and drafts (architecture §5.3, backend §3.4, §5.2).
 */
import { z } from "zod";

import { BookingRequestSchema } from "./dataset";
import {
  Category,
  DecisionStatus,
  Day,
  Need,
  Period,
  RequestState,
  RoomType,
} from "./enums";
import {
  AssignmentSchema,
  BookingDecisionSchema,
  SessionOverrideSchema,
  type BookingDecision,
} from "./schedule";
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
  /** Rejected by the approver (Admin, or the lab's department coordinator); never auto. */
  "REJ_BY_APPROVER",
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

/**
 * The engine's structured facts behind a decision (explanations are phrased from these, never
 * invented). Stored on each decision and returned with it.
 */
export const BookingFactsSchema = z.strictObject({
  attendance: z.number().int(),
  duration: z.number().int(),
  series_id: z.string().nullable(),
  requested_room: z.string().nullable(),
  /** False when `requested_room` names no room in the dataset. */
  requested_room_known: z.boolean(),
  /** Closest room id when `requested_room` is unknown. */
  room_suggestion: z.string().nullable(),
  /** Needs the requested (or suggested) room lacks. */
  requested_room_missing: z.array(z.string()),
  /** Rooms that fit type, capacity, needs and event use. */
  candidate_rooms: z.array(z.string()),
  largest_room: z
    .strictObject({ room_id: z.string(), capacity: z.number().int() })
    .nullable(),
  /**
   * What stood in the way of better in-window slots. `session`/`booking` hold `room_id` in those
   * periods; `unavailable` is the room closed; `group` names a compulsory group (its `id`) that
   * has class then, and the sessions responsible follow as `session` entries with their own room.
   */
  blocked_by: z.array(
    z.strictObject({
      kind: z.enum(["booking", "session", "group", "unavailable"]),
      id: z.string(),
      room_id: z.string().optional(),
      day: z.string(),
      periods: z.array(z.number().int()),
    }),
  ),
  /** Sessions moved for Week 7 to make room (institute events only). */
  displaced: z.array(
    z.strictObject({
      session_id: z.string(),
      from: AssignmentSchema,
      to: AssignmentSchema,
    }),
  ),
  cancelled: z
    .strictObject({ by: z.string(), at: z.string(), note: z.string() })
    .optional(),
});
export type BookingFacts = z.infer<typeof BookingFactsSchema>;

/** Facts of a request an approver rejected (`REJ_BY_APPROVER`). */
export const ApproverRejectionFactsSchema = z.strictObject({
  /** "the Admin", "the CSE Department Coordinator", … (a role label, never a user id). */
  rejected_by: z.string(),
  rejected_at: Timestamp,
  comment: z.string(),
});
export type ApproverRejectionFacts = z.infer<
  typeof ApproverRejectionFactsSchema
>;

export const DecisionFactsSchema = z.union([
  BookingFactsSchema,
  ApproverRejectionFactsSchema,
]);
export type DecisionFacts = z.infer<typeof DecisionFactsSchema>;

/** Metadata every stored decision carries; shared by the stored and the view schemas. */
const decisionMeta = {
  reason_code: ReasonCode,
  effective_category: Category,
  /** True when the claimed category was lowered to the role's cap (`isCategoryCapped`). */
  category_capped: z.boolean(),
  /** True when the decision moves sessions for Week 7 (an institute event displacing classes). */
  requires_admin_approval: z.boolean(),
  /** True when the engine decided without an approver. */
  auto: z.boolean(),
  timetable_version: Id.nullable(),
  decided_at: Timestamp,
  /**
   * The engine's structured facts behind the decision (candidate rooms, what blocked the window,
   * moved sessions, …); explanations are phrased from these only. Absent on older records.
   */
  facts: DecisionFactsSchema.optional(),
};

/**
 * A decision as stored in `booking_decisions`: the export shape plus metadata.
 * Keeps the export checks (slot required unless rejected, reason required unless approved).
 */
export const StoredBookingDecisionSchema = BookingDecisionSchema.safeExtend({
  ...decisionMeta,
  /** "engine" or the deciding user's id. */
  decided_by: Id,
  /**
   * Null for plain engine decisions. For a decision that moves sessions
   * (`requires_admin_approval`), the admin whose Spectra run or activation approved the moves.
   */
  approved_by: Id.nullable(),
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

/**
 * A stored decision as `GET /api/spectra` shows it. `decided_by` and `approved_by` (user ids)
 * are included for admins only.
 */
export const SpectraDecisionViewSchema = BookingDecisionSchema.safeExtend({
  ...decisionMeta,
  decided_by: Id.optional(),
  approved_by: Id.nullable().optional(),
}).strict();
export type SpectraDecisionView = z.infer<typeof SpectraDecisionViewSchema>;

/** The non-admin decision view: no user ids at all (strict, so a leaked key fails loudly). */
export const SpectraPublicDecisionViewSchema =
  BookingDecisionSchema.safeExtend(decisionMeta).strict();

/** A Week-7 session move as `GET /api/spectra` shows it (`approved_by` for admins only). */
export const SpectraOverrideViewSchema = SessionOverrideSchema.extend({
  timetable_version: Id,
  approved_by: Id.nullable().optional(),
}).strict();
export type SpectraOverrideView = z.infer<typeof SpectraOverrideViewSchema>;

/** The non-admin override view: no approver (strict). */
export const SpectraPublicOverrideViewSchema = SessionOverrideSchema.extend({
  timetable_version: Id,
}).strict();

/**
 * The `schedule.json` shape of a stored (or viewed) decision: rejections carry no slot, metadata
 * is dropped. Pure; shared by the export and the Spectra summary.
 */
export function toExportDecision(decision: BookingDecision): BookingDecision {
  const { request_id, status, reason } = decision;
  if (status === "rejected") return { request_id, status, reason };
  const { day, start_period, end_period, room_id } = decision;
  return { request_id, status, day, start_period, end_period, room_id, reason };
}

/**
 * `GET /api/spectra` (`data`): the active timetable's stored Spectra decisions (dataset order),
 * Week-7 overrides and their validator stats. Everything null/empty before a timetable is active
 * or before Spectra has run for it.
 */
export const SpectraStateSchema = z.strictObject({
  timetable_version: Id.nullable(),
  summary: SpectraRunSummarySchema.nullable(),
  decisions: z.array(SpectraDecisionViewSchema),
  overrides: z.array(SpectraOverrideViewSchema),
});
export type SpectraState = z.infer<typeof SpectraStateSchema>;

export const BookingSource = z.enum(["dataset", "nl", "form"]);
export type BookingSource = z.infer<typeof BookingSource>;

/** Provenance of a request drafted by the plain-language parser. */
export const AiMetaSchema = z.strictObject({
  /** Who drafted it: Gemini, or the offline rule parser (absent on older records). */
  source: z.enum(["llm", "rules"]).optional(),
  /** The Gemini model id, or "rules" for the rule parser. */
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
  /**
   * Set when an approver accepted the engine's proposal for this exact slot. A later Spectra run
   * that moves the booking elsewhere needs a new approval (the request goes back to
   * `pending_approval`).
   */
  approval: z
    .strictObject({
      approved_by: Id,
      /**
       * The approver's standing: an admin approval covers both kinds of need, a coordinator's
       * only a department lab (absent on older records: treated as a coordinator's).
       */
      approver_role: z.enum(["admin", "department_coordinator"]).optional(),
      approved_at: Timestamp,
      room_id: Id,
      day: Day,
      start_period: Period,
      end_period: Period,
    })
    .optional(),
  /** Set when an approver rejected the request; the engine then never gives it a room. */
  rejection: z
    .strictObject({
      rejected_by: Id,
      rejected_at: Timestamp,
      comment: z.string(),
    })
    .optional(),
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
  windows: z.array(DraftWindowSchema).min(1).max(20),
  room_types: z.array(RoomType).min(1).max(10),
  needs: z.array(Need).max(10),
  requested_room: Id.nullable(),
  /**
   * Groups the event is compulsory for. Admins may name any group, faculty and coordinators only
   * their own department's; clubs none.
   */
  mandatory_for_groups: z.array(Id).max(40),
  /** Extra days to repeat on; each becomes a request sharing a `series_id`. */
  repeat_days: z.array(Day).max(7),
  /**
   * Assumptions the parser made, shown as chips for the user to confirm. Informational: a stored
   * request's AI provenance takes them from the parse log, never from this body.
   */
  assumptions: z.array(z.string().max(300)).max(16),
  /** A question to ask before the draft can be submitted. */
  follow_up: z.string().max(300).nullable(),
});
export type BookingDraft = z.infer<typeof BookingDraftSchema>;

// ------------------------------------------------------------------------------ bookings API

/** `POST /api/bookings` body: a complete draft plus where it came from. */
export const CreateBookingRequestSchema = BookingDraftSchema.extend({
  source: z.enum(["nl", "form"]).default("form"),
  /** The `ai_logs` id of the parse that produced the draft, if any. */
  ai_log_id: Id.nullable().default(null),
}).strict();
export type CreateBookingRequest = z.infer<typeof CreateBookingRequestSchema>;

/** Who must still approve a booking, if anyone. */
export const BookingApprovalSchema = z.strictObject({
  needed: z.boolean(),
  /** `admin` when classes move for Week 7; `department_coordinator` for a department lab. */
  approver_role: z.enum(["admin", "department_coordinator"]).nullable(),
  /** The lab's department when a coordinator approves. */
  department: z.string().nullable(),
});
export type BookingApproval = z.infer<typeof BookingApprovalSchema>;

/** A request with its current decision (for the active timetable) and approval status. */
export const BookingViewSchema = z.strictObject({
  request: BookingRequestRecordSchema,
  decision: SpectraDecisionViewSchema.nullable(),
  approval: BookingApprovalSchema,
});
export type BookingView = z.infer<typeof BookingViewSchema>;

export const DecisionSlotSchema = z.strictObject({
  status: DecisionStatus,
  room_id: Id.optional(),
  day: Day.optional(),
  start_period: Period.optional(),
  end_period: Period.optional(),
});

/** An earlier decision that got worse or moved because new requests outranked it. */
export const BumpNoticeSchema = z.strictObject({
  request_id: Id,
  before: DecisionSlotSchema,
  after: DecisionSlotSchema,
  /** The newly submitted request(s) that took priority. */
  by: z.array(Id),
});
export type BumpNotice = z.infer<typeof BumpNoticeSchema>;

/** `POST /api/bookings` (`data`): the created request(s) (one per series day) with decisions. */
export const CreateBookingResultSchema = z.strictObject({
  bookings: z.array(BookingViewSchema),
  bumped: z.array(BumpNoticeSchema),
  /** Totals of the Spectra run that decided them (null without an active timetable). */
  spectra: SpectraRunSummarySchema.nullable(),
});
export type CreateBookingResult = z.infer<typeof CreateBookingResultSchema>;

/**
 * `GET /api/bookings` query. `mine` (default): the user's own requests. `all`: admin only.
 * `approvals`: requests this user may approve now (admin: class moves and labs; coordinator:
 * their department's labs), never their own.
 */
export const BookingListQuerySchema = z.object({
  scope: z.enum(["mine", "all", "approvals"]).default("mine"),
  state: RequestState.optional(),
});
export type BookingListQuery = z.infer<typeof BookingListQuerySchema>;

/** `POST /api/bookings/:id/decide` body (approver only, never the requester). */
export const BookingDecideRequestSchema = z.strictObject({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(500).optional(),
});
export type BookingDecideRequest = z.infer<typeof BookingDecideRequestSchema>;

/** A plain-language explanation phrased from the decision's facts only. */
/** `template`: built by code; `llm`: Gemini rephrased the same facts. */
export const ExplanationSource = z.enum(["template", "llm"]);
export type ExplanationSource = z.infer<typeof ExplanationSource>;

export const BookingExplanationSchema = z.strictObject({
  text: z.string(),
  source: ExplanationSource,
  /** The facts it was phrased from (null for older decisions stored without them). */
  facts: DecisionFactsSchema.nullable(),
});
export type BookingExplanation = z.infer<typeof BookingExplanationSchema>;

/** `GET /api/bookings/:id` (`data`). */
export const BookingDetailSchema = BookingViewSchema.extend({
  explanation: BookingExplanationSchema.nullable(),
}).strict();
export type BookingDetail = z.infer<typeof BookingDetailSchema>;
