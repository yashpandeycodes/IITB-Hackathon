/**
 * The faculty AI assistant (`POST /api/assistant`, architecture §7.4). The LLM (or the offline
 * rule parser) only extracts an intent; code resolves the session from the user's own sessions,
 * the engine computes verified options, and the reply is phrased from those facts. Submitting an
 * option posts its `proposal` to `POST /api/changes`, which recomputes it from scratch.
 */
import { z } from "zod";

import { ExplanationSource } from "./booking";
import {
  ChangeProposalRequestSchema,
  ConflictEntrySchema,
  MoveDiffSchema,
} from "./change";
import { Day, SessionKind, TeachingPeriod } from "./enums";
import { ParseSource } from "./ai";
import { SessionFactsSchema } from "./explain";
import { Count, Id } from "./util";

export const AssistantIntentKind = z.enum([
  /** Move one of my sessions ("shift my Friday CS202 lecture to Thursday morning"). */
  "move_session",
  /** I can't teach at these times ("I'm away next Monday", "MON ko leave hai"). */
  "mark_unavailable",
  /** An extra session of a course I teach ("I need an extra CS202 tutorial"). */
  "add_session",
  /** Why is my session where it is ("why is CS202 at 8 AM?"). */
  "explain_session",
  /** Anything else (room bookings, approvals, rule-breaking asks): the reply says what it can do. */
  "unsupported",
]);
export type AssistantIntentKind = z.infer<typeof AssistantIntentKind>;

/**
 * What the LLM returns (structured output; also what the rule parser fills). Every field is
 * nullable or a list so the model never has to invent a value. Ids are hints only: code resolves
 * them against the user's own sessions and the dataset.
 */
export const AssistantIntentLLMSchema = z.strictObject({
  intent: AssistantIntentKind,
  /** Which existing session the user means (move / explain). */
  session: z.strictObject({
    course_id: z.string().max(40).nullable(),
    kind: SessionKind.nullable(),
    /** Where the session is now, as the user describes it. */
    day: Day.nullable(),
    start_period: TeachingPeriod.nullable(),
    /** An exact session id, if the user typed one. */
    session_id: z.string().max(60).nullable(),
  }),
  /** Where the user wants it (move / add), or when they are unavailable. Empty = any. */
  target: z.strictObject({
    days: z.array(Day).max(5),
    periods: z.array(TeachingPeriod).max(9),
    room_id: z.string().max(40).nullable(),
  }),
  /** add_session: the course and kind of the extra session. */
  new_session: z.strictObject({
    course_id: z.string().max(40).nullable(),
    kind: SessionKind.nullable(),
  }),
  /**
   * mark_unavailable by a coordinator or admin: the faculty member meant (an id like "F07" or a
   * name); null for "I" / "me". Code resolves it against the faculty the user may act for.
   */
  faculty_hint: z.string().max(80).nullable(),
  /** mark_unavailable / move: the user's reason, verbatim and short. */
  reason: z.string().max(200).nullable(),
});
export type AssistantIntentLLM = z.infer<typeof AssistantIntentLLMSchema>;

/** `POST /api/assistant`. */
export const AssistantRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(1000),
  /** Picks one of a previous reply's `candidates` when the session was ambiguous. */
  session_id: Id.max(60).optional(),
});
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

/** A session the reply refers to, with where it is in the active timetable. */
export const SessionRefSchema = z.strictObject({
  session_id: Id,
  course_id: Id,
  kind: SessionKind,
  day: Day.nullable(),
  start_period: TeachingPeriod.nullable(),
  room_id: Id.nullable(),
});
export type SessionRef = z.infer<typeof SessionRefSchema>;

/** One engine-verified option. Submit it by posting `proposal` to `POST /api/changes`. */
export const AssistantOptionSchema = z.strictObject({
  /** "opt-1", "opt-2", … in the order shown. */
  option_id: z.string().min(1),
  /** e.g. "Move CS202-L2 to THU P2 in LH-3 (no other class moves)". */
  label: z.string(),
  proposal: ChangeProposalRequestSchema,
  moved_count: Count,
  time_changed: Count,
  room_only_changed: Count,
  soft_delta: z.number().int(),
  diff: z.array(MoveDiffSchema),
});
export type AssistantOption = z.infer<typeof AssistantOptionSchema>;

/** `POST /api/assistant` (`data`). */
export const AssistantReplySchema = z.strictObject({
  intent: AssistantIntentKind,
  /** Who extracted the intent: the LLM, or the offline rule parser. */
  intent_source: ParseSource,
  text: z.string(),
  /** Who phrased `text`: the LLM (from facts only), or a template. */
  text_source: ExplanationSource,
  /** True when the options and conflicts were computed by the constraint engine. */
  verified: z.boolean(),
  /** The session the request was resolved to (move / explain), or null. */
  session: SessionRefSchema.nullable(),
  /** Several sessions matched: ask the user to pick one (re-send with `session_id`). */
  candidates: z.array(SessionRefSchema),
  options: z.array(AssistantOptionSchema).max(5),
  /** Why nothing fits (no option), from the engine. */
  conflicts: z.array(ConflictEntrySchema),
  /** A question when something essential is missing, else null. */
  follow_up: z.string().nullable(),
  /** What the assistant assumed ("'morning' read as P1–P5"). */
  assumptions: z.array(z.string()),
  /** explain_session: the engine's facts. */
  facts: SessionFactsSchema.nullable(),
  /** `ai_logs` id of this turn. */
  log_id: Id.nullable(),
});
export type AssistantReply = z.infer<typeof AssistantReplySchema>;
