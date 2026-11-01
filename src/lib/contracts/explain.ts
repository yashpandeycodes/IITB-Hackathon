/**
 * Explanations (`POST /api/explain`, architecture §6; backend.md §3.7): "why is this class at
 * 8 AM?", "why was this booking rejected?", "why did my session move?". The engine computes the
 * facts; text is phrased from those facts only (by the LLM when on, else a template).
 */
import { z } from "zod";

import { DecisionFactsSchema, ExplanationSource } from "./booking";
import { ConflictEntrySchema, MoveDiffSchema } from "./change";
import {
  ChangeStatus,
  Day,
  Period,
  SessionKind,
  TeachingPeriod,
} from "./enums";
import { Count, Id } from "./util";
import { RuleCode } from "./violation";

export const ExplainSubject = z.enum(["session", "booking", "change"]);
export type ExplainSubject = z.infer<typeof ExplainSubject>;

/** `POST /api/explain`. */
export const ExplainRequestSchema = z.strictObject({
  subject: ExplainSubject,
  /** A session id, a booking request id (`BR-07`, `REQ-0003`) or a change request id (`CR-0001`). */
  id: Id.max(100),
});
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

/** A rule and how many candidate slots it ruled out. */
export const RuleTallySchema = z.strictObject({
  rule: RuleCode,
  count: Count,
  /** e.g. "CSE-2 already has a class", "F06 unavailable". */
  detail: z.string(),
});
export type RuleTally = z.infer<typeof RuleTallySchema>;

/** One soft rule this session costs at its slot. */
export const SoftCostSchema = z.strictObject({
  rule: RuleCode,
  points: Count,
  detail: z.string(),
});
export type SoftCost = z.infer<typeof SoftCostSchema>;

/** A slot the session could move to on its own (nothing else moves). */
export const SlotAlternativeSchema = z.strictObject({
  day: Day,
  start_period: TeachingPeriod,
  room_id: Id,
  /** Change in the timetable's total soft penalty if it moved there; negative is better. */
  soft_delta: z.number().int(),
});
export type SlotAlternative = z.infer<typeof SlotAlternativeSchema>;

/**
 * Why a session is where it is, from the engine (`explainSession`). Every number a phrased
 * explanation may use is in here.
 */
export const SessionFactsSchema = z.strictObject({
  session_id: Id,
  course_id: Id,
  course_name: z.string().nullable(),
  kind: SessionKind,
  groups: z.array(Id),
  faculty_id: Id,
  faculty_name: z.string().nullable(),
  size: Count,
  duration: z.number().int().min(1),
  /** True when the dataset pins it (`fixed_slot`): it can't be anywhere else. */
  fixed_slot: z.boolean(),
  basket_slot: z.string().nullable(),
  /** The timetable version explained (null before any timetable exists). */
  version_id: Id.nullable(),
  /** Where it is; null when it isn't placed in that version. */
  placed: z
    .strictObject({
      day: Day,
      start_period: TeachingPeriod,
      end_period: Period,
      room_id: Id,
      /** Clock times, e.g. "08:00–09:00". */
      time: z.string(),
    })
    .nullable(),
  /** Why this room. */
  room: z
    .strictObject({
      room_id: Id,
      room_name: z.string(),
      type: z.string(),
      capacity: Count,
      /** Session size as a whole percentage of capacity. */
      fill_percent: Count,
      /** Rooms whose type, capacity and accessibility suit the session. */
      suitable_rooms: Count,
      /** Smaller suitable rooms that are occupied at this time. */
      smaller_suitable_busy: z.array(Id),
      note: z.string(),
    })
    .nullable(),
  /** Soft points this session itself costs where it is (empty when none). */
  soft_costs: z.array(SoftCostSchema),
  /** Every other start slot in the week, as the engine sees it with everything else fixed. */
  alternatives: z.strictObject({
    /** Other start slots considered. */
    considered: Count,
    /** Slots where it would fit without moving anything. */
    free: Count,
    /** Free slots that would lower the total soft penalty. */
    better: Count,
    /** Why the rest are blocked (largest count first). */
    blocked: z.array(RuleTallySchema),
    /** Up to 3 best free slots (lowest soft delta first). */
    best: z.array(SlotAlternativeSchema).max(3),
  }),
  /** Template explanation built from the facts above. */
  summary: z.string(),
});
export type SessionFacts = z.infer<typeof SessionFactsSchema>;

/** Why a change request's sessions moved (or why no fix exists), from the stored proposal. */
export const ChangeFactsSchema = z.strictObject({
  change_id: Id,
  status: ChangeStatus,
  title: z.string(),
  moved_count: Count,
  time_changed: Count,
  room_only_changed: Count,
  soft_delta: z.number().int(),
  diff: z.array(MoveDiffSchema),
  conflicts: z.array(ConflictEntrySchema),
  summary: z.string(),
});
export type ChangeFacts = z.infer<typeof ChangeFactsSchema>;

/** What every explanation carries besides its subject and facts. */
const explainCommon = {
  /** The session, booking request or change request explained (as stored). */
  id: Id,
  text: z.string(),
  source: ExplanationSource,
};

/**
 * A booking's facts: those stored with its decision (`DecisionFacts`), or an empty object while
 * it has no decision yet or its decision was stored without facts.
 */
export const BookingExplainFactsSchema = z.union([
  DecisionFactsSchema,
  z.strictObject({}),
]);
export type BookingExplainFacts = z.infer<typeof BookingExplainFactsSchema>;

/**
 * `POST /api/explain` (`data`), by `subject`: a session's facts (`SessionFacts`, from the
 * engine), a booking's (`BookingExplainFacts`, stored with its decision) or a change request's
 * (`ChangeFacts`, from its stored proposal).
 */
export const ExplainResultSchema = z.discriminatedUnion("subject", [
  z.strictObject({
    subject: z.literal("session"),
    ...explainCommon,
    facts: SessionFactsSchema,
  }),
  z.strictObject({
    subject: z.literal("booking"),
    ...explainCommon,
    facts: BookingExplainFactsSchema,
  }),
  z.strictObject({
    subject: z.literal("change"),
    ...explainCommon,
    facts: ChangeFactsSchema,
  }),
]);
export type ExplainResult = z.infer<typeof ExplainResultSchema>;
