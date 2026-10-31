/**
 * AI layer contracts (backend.md §5): what the LLM (or the offline rule parser) may extract from
 * a plain-language booking request, the parse API, and the `ai_logs` record. The LLM never
 * decides validity, status or priority: `claimed_category` is informational only, and the
 * engine decides every request.
 */
import { z } from "zod";

import {
  BookingApprovalSchema,
  DecisionSlotSchema,
  ReasonCode,
} from "./booking";
import { Category, Day, Need, Period, RoomType } from "./enums";
import { Count, Id, Timestamp } from "./util";

/** A window as extracted from text (periods from the calendar's clock times; may be unresolved). */
export const ExtractedWindowSchema = z.strictObject({
  day: Day,
  from_period: z.number().int().min(1).max(13),
  to_period: z.number().int().min(1).max(13),
});
export type ExtractedWindow = z.infer<typeof ExtractedWindowSchema>;

/**
 * The structured output asked of the LLM (`responseJsonSchema` = `z.toJSONSchema(...)`), and the
 * shape the rule parser produces. Unknowns are null / empty, never guessed.
 */
export const BookingDraftLLMSchema = z.strictObject({
  title: z.string().max(200).nullable(),
  attendance: z.number().int().positive().nullable(),
  duration_periods: z.number().int().min(1).max(13).nullable(),
  windows: z.array(ExtractedWindowSchema),
  room_types: z.array(RoomType),
  needs: z.array(Need),
  /** The room as written ("LHC-5", "audi"); code resolves it, the LLM never invents an id. */
  requested_room_text: z.string().max(100).nullable(),
  /** Group ids or phrases ("ECE-3", "mechanical third years"); code resolves them. */
  mandatory_for_groups: z.array(z.string().max(100)),
  /** "every Monday and Wednesday" → extra days (becomes a series). */
  repeat_days: z.array(Day),
  /** What the requester claims ("institute level"); informational only, never used for priority. */
  claimed_category: Category.nullable(),
  /** Conditional wishes kept as text ("SH-1 if free, otherwise any hall with a projector"). */
  conditions: z.array(z.string().max(300)),
  assumptions: z.array(z.string().max(300)),
  follow_up: z.string().max(300).nullable(),
  confidence: z.number().min(0).max(1),
});
export type BookingDraftLLM = z.infer<typeof BookingDraftLLMSchema>;

/** `POST /api/bookings/parse` body. */
export const ParseBookingRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(2000),
});
export type ParseBookingRequest = z.infer<typeof ParseBookingRequestSchema>;

/**
 * A draft that may still be incomplete: the user fills the gaps in the form before submitting a
 * `BookingDraft`. `missing` lists the fields still needed.
 */
export const ParsedBookingDraftSchema = z.strictObject({
  title: z.string().max(200).nullable(),
  attendance: z.number().int().positive().nullable(),
  duration_periods: z.number().int().min(1).max(13).nullable(),
  windows: z.array(
    z.strictObject({ day: Day, from_period: Period, to_period: Period }),
  ),
  room_types: z.array(RoomType),
  needs: z.array(Need),
  /** A room id that exists, or null. */
  requested_room: Id.nullable(),
  /** Group ids that exist. */
  mandatory_for_groups: z.array(Id),
  repeat_days: z.array(Day),
  assumptions: z.array(z.string()),
  follow_up: z.string().nullable(),
  missing: z.array(
    z.enum([
      "title",
      "attendance",
      "duration_periods",
      "windows",
      "room_types",
    ]),
  ),
});
export type ParsedBookingDraft = z.infer<typeof ParsedBookingDraftSchema>;

export const ParseSource = z.enum(["llm", "rules"]);
export type ParseSource = z.infer<typeof ParseSource>;

/**
 * Why the rule parser answered although AI is on: the call timed out, the model's output failed
 * the schema twice, or the API failed (details stay in `ai_logs`, never in the response).
 */
export const FallbackCode = z.enum(["timeout", "invalid_output", "llm_error"]);
export type FallbackCode = z.infer<typeof FallbackCode>;

/** `POST /api/bookings/parse` (`data`): an editable draft plus what the engine would decide. */
export const ParseBookingResultSchema = z.strictObject({
  draft: ParsedBookingDraftSchema,
  /** Who extracted the fields: Gemini, or the offline rule parser (AI off, unavailable, or failed). */
  source: ParseSource,
  model: z.string().nullable(),
  /** Whether the LLM is switched on (env + settings + key) at all. */
  ai_enabled: z.boolean(),
  /** Why the rule parser was used although AI is on; null otherwise. */
  fallback_reason: FallbackCode.nullable(),
  /** Category from the requester's role cap; the claim in the text never raises it. */
  category: z.strictObject({
    claimed: Category.nullable(),
    effective: Category,
    capped: z.boolean(),
  }),
  requested_room: z.strictObject({
    text: z.string().nullable(),
    room_id: Id.nullable(),
    suggestion: Id.nullable(),
    note: z.string().nullable(),
  }),
  conditions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  /**
   * Why submitting this draft as it is would be refused (`400`), with the same field names and
   * messages as `POST /api/bookings`; the preview is null while any remain.
   */
  problems: z.array(z.strictObject({ field: z.string(), message: z.string() })),
  /**
   * What the engine would decide for this draft right now (nothing is stored), including who
   * would have to approve it; null while the draft is incomplete or has `problems`.
   */
  preview: DecisionSlotSchema.extend({
    reason_code: ReasonCode,
    reason: z.string(),
    approval: BookingApprovalSchema,
  })
    .strict()
    .nullable(),
  /** `ai_logs` id of this parse (pass it with the submitted booking). */
  log_id: Id,
});
export type ParseBookingResult = z.infer<typeof ParseBookingResultSchema>;

export const AiFeature = z.enum(["parse_booking", "assistant", "explain"]);
export type AiFeature = z.infer<typeof AiFeature>;

/** One AI call (or rule-parser fallback) as stored in `ai_logs`. */
export const AiLogEntrySchema = z.strictObject({
  id: Id,
  feature: AiFeature,
  /** `llm`: the model's output was used; `rules` / `template`: the offline fallback was. */
  source: z.enum(["llm", "rules", "template"]),
  model: z.string().nullable(),
  prompt_id: z.string().min(1),
  /** The user's text (bounded by the request schema). */
  input: z.string(),
  /** The LLM's raw text output (null for the rule parser and for templates). */
  output_raw: z.string().nullable(),
  parsed_ok: z.boolean(),
  repaired: z.boolean(),
  /** Served from the per-instance cache: no model call was made for this entry. */
  cached: z.boolean().default(false),
  /** Why the fallback was used, in detail (server-side only; API keys redacted). */
  fallback_reason: z.string().nullable(),
  /**
   * `parse_booking`: the processed draft's assumptions and follow-up, which a submitted booking's
   * provenance copies (never the client's copy).
   */
  assumptions: z.array(z.string()).default([]),
  follow_up: z.string().nullable().default(null),
  /** e.g. the engine preview's status, or null. */
  engine_verdict: z.string().nullable(),
  latency_ms: Count,
  user_id: Id,
  at: Timestamp,
});
export type AiLogEntry = z.infer<typeof AiLogEntrySchema>;
