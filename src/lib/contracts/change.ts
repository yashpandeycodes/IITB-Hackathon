/**
 * Change requests: every disruption, unavailability notice, faculty request or manual edit becomes
 * a proposal that an admin approves (architecture §5.3, §7.3). `changes[]` uses the exact
 * starter-pack disruption format; `placements[]` pins sessions where the requester wants them
 * (manual placement, an assistant option). The rescheduler turns both into a minimal-move repair.
 */
import { z } from "zod";

import type { PathIssue } from "./api";
import { DisruptionChangeSchema } from "./disruption";
import { ChangeStatus, Day, Role, TeachingPeriod } from "./enums";
import { AssignmentSchema } from "./schedule";
import { SoftPenaltySummarySchema } from "./timetable";
import { Count, Id, Timestamp } from "./util";
import { RuleCode } from "./violation";

export const ChangeKind = z.enum([
  /** A change file (starter-pack format) loaded by an admin or a coordinator. */
  "disruption",
  /** A faculty member's own request: move one of their sessions, or an extra session. */
  "faculty_request",
  /** A manual placement by an admin or a coordinator (`POST /api/manual/place`). */
  "manual_edit",
  /** Faculty unavailability (self, or a coordinator for their department's faculty). */
  "unavailability",
]);
export type ChangeKind = z.infer<typeof ChangeKind>;

export const SlotRefSchema = z.strictObject({
  day: Day,
  start_period: TeachingPeriod,
  room_id: Id,
});
export type SlotRef = z.infer<typeof SlotRefSchema>;

/**
 * What happened to a session, compared with the base timetable. `room_only`, `time_only` and
 * `time_and_room` are moves (the validator's stability report counts them); `added` and
 * `removed` sessions are listed but never counted as moved.
 */
export const MoveKind = z.enum([
  "room_only",
  "time_only",
  "time_and_room",
  "added",
  "removed",
]);
export type MoveKind = z.infer<typeof MoveKind>;

/**
 * Why a session moved: `broken` (its old slot breaks a hard rule after the change), `evicted`
 * (moved to free a slot for another session, part of an ejection chain), `requested` (a
 * placement the requester asked for), `added` / `removed` (by an `add_session` /
 * `remove_session` change).
 */
export const MoveCause = z.enum([
  "broken",
  "evicted",
  "requested",
  "added",
  "removed",
]);
export type MoveCause = z.infer<typeof MoveCause>;

/** One session's change. `from` is null for an added session, `to` is null for a removed one. */
export const MoveDiffSchema = z.strictObject({
  session_id: Id,
  from: SlotRefSchema.nullable(),
  to: SlotRefSchema.nullable(),
  move: MoveKind,
  cause: MoveCause,
  /** Hard rules the old slot breaks after the change (`broken` only; empty otherwise). */
  rules: z.array(RuleCode),
  /** For `evicted`: the session whose placement needed this slot. */
  displaced_by: Id.nullable(),
  /** Plain sentence, e.g. "CR-102 closed MON–FRI P1–P9 (Water leak); same time in CR-104". */
  reason: z.string(),
});
export type MoveDiff = z.infer<typeof MoveDiffSchema>;

/** Why a session could not be placed, grouped by rule. Filled when a proposal is infeasible. */
export const ConflictEntrySchema = z.strictObject({
  session_id: Id,
  blocking: z.array(
    z.strictObject({
      rule: RuleCode,
      /** How many candidate start slots this rule ruled out. */
      count: Count,
      detail: z.string(),
    }),
  ),
  /**
   * Direct contradictions that no move can fix, e.g. "fixed_slot THU P6 vs F06 unavailable THU
   * P6–P9", "no room of type lab_phy seats 120".
   */
  contradictions: z.array(z.string()),
  /** One plain sentence naming the conflicting constraints. */
  summary: z.string(),
});
export type ConflictEntry = z.infer<typeof ConflictEntrySchema>;

/** Who and what a proposal touches (for filtering lists and notifying people). */
export const ChangeScopeSchema = z.strictObject({
  /** Sessions moved, added or removed. */
  session_ids: z.array(Id),
  faculty_ids: z.array(Id),
  group_ids: z.array(Id),
  room_ids: z.array(Id),
  /** Departments of the touched sessions' courses and of the touched faculty. */
  departments: z.array(z.string()),
});
export type ChangeScope = z.infer<typeof ChangeScopeSchema>;

export const RescheduleStopReason = z.enum(["complete", "nodes", "time"]);
export type RescheduleStopReason = z.infer<typeof RescheduleStopReason>;

/** How the rescheduler got there (shown as "found in 41 ms, 1 eviction"). */
export const RescheduleMetaSchema = z.strictObject({
  /** Sessions whose old slot broke a hard rule (plus added and pinned ones). */
  broken: Count,
  /** Sessions moved only to make room for another one. */
  evictions: Count,
  /** Deepest ejection chain used (0 = every broken session went straight to a free slot). */
  depth: Count,
  /** Search nodes expanded (deterministic budget). */
  nodes: Count,
  ms: Count,
  /** `complete`: the search finished; `nodes` / `time`: a budget ended it (best result kept). */
  stopped_by: RescheduleStopReason,
  /** e.g. "minimal-move repair (room, time, ejection ≤ 3)". */
  algorithm: z.string().min(1),
});
export type RescheduleMeta = z.infer<typeof RescheduleMetaSchema>;

/** Stability counts against the baseline `schedule.json` (the validator's stability report). */
export const BaselineStabilitySchema = z.strictObject({
  sessions_moved: Count,
  time_changed: Count,
  room_only_changed: Count,
});
export type BaselineStability = z.infer<typeof BaselineStabilitySchema>;

/**
 * The engine's answer for a set of changes and placements, before it is stored: what moves,
 * the counts the validator's stability report will show, and the conflicts when no fix exists.
 */
export const ChangeProposalSchema = z.strictObject({
  /** True when every session is placed with zero hard violations. */
  feasible: z.boolean(),
  /** One line built by code, e.g. "F07 unavailable MON · CR-102 closed MON–FRI · add CS202-T2". */
  title: z.string(),
  /** Non-blocking notes, e.g. "the file was written for dataset X". */
  warnings: z.array(z.string()),
  /** Moved, added and removed sessions, in dataset session order. */
  diff: z.array(MoveDiffSchema),
  /**
   * Moves against the active timetable this proposal is built on (validator semantics: sessions in
   * both timetables whose day, period or room differs). Equal to what `validator.py --baseline`
   * prints until a change has been applied; after that, see `baseline_stability`.
   */
  moved_count: Count,
  time_changed: Count,
  room_only_changed: Count,
  /** S1–S6 of the proposed timetable (null when infeasible). */
  soft_penalty: SoftPenaltySummarySchema.nullable(),
  /** Proposed total minus the base version's total; negative is better (0 when infeasible). */
  soft_delta: z.number().int(),
  /** Independent re-check of the proposed timetable (0 for every stored `pending` proposal). */
  hard_violation_count: Count,
  conflicts: z.array(ConflictEntrySchema),
  scope: ChangeScopeSchema,
  engine: RescheduleMetaSchema,
  /**
   * Moves against `schedule.json` (the baseline captured just before the first applied change):
   * what `validator.py --baseline schedule.json` will print for the `schedule_after.json` this
   * proposal would produce. Null before any change has been applied (then it equals the counts
   * above) and when infeasible.
   */
  baseline_stability: BaselineStabilitySchema.nullable().default(null),
});
export type ChangeProposal = z.infer<typeof ChangeProposalSchema>;

export const ChangeRequestSchema = z.strictObject({
  /** e.g. "CR-0001". */
  id: Id,
  kind: ChangeKind,
  requested_by: Id,
  /** The requester's role when they filed it (a later role change doesn't rewrite history). */
  requested_by_role: Role,
  changes: z.array(DisruptionChangeSchema),
  /** Sessions pinned exactly here (manual placement, assistant options). */
  placements: z.array(AssignmentSchema),
  /** The requester's own note, or the change file's `description`. */
  description: z.string().nullable(),
  /** Original text when the request came from the AI assistant. */
  nl_prompt: z.string().nullable(),
  /** The active timetable version the proposal was built on. */
  base_version: Id,
  /** Draft timetable version holding the proposal; null when infeasible. */
  proposed_version: Id.nullable(),
  status: ChangeStatus,
  ...ChangeProposalSchema.shape,
  /** The admin who approved it (set on `applied`). */
  approved_by: Id.nullable(),
  /** Who approved or rejected it (an admin, or the requester withdrawing it). */
  decided_by: Id.nullable(),
  decided_at: Timestamp.nullable(),
  /** The decider's comment, or why the system rejected it ("Superseded by CR-0004"). */
  comment: z.string().nullable(),
  created_at: Timestamp,
});
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;

// ------------------------------------------------------------------------- request bounds

/**
 * Size and hygiene limits for what a requester sends inside `changes[]` and `placements[]`.
 * Change entries are loose objects (the starter-pack format keeps unknown keys), so without
 * these a request could store and echo back huge or oddly keyed values. Real change files sit
 * far below every limit: ids are a dozen characters, a change lists at most 5 days and 9
 * periods, and the deepest list (`add_faculty.faculty.preferences[].days`) sits at level 5,
 * counting the change itself as level 1.
 */
export const REQUEST_LIMITS = {
  /** Longest id (`faculty_id`, `room_id`, `session_id`, `id`, `course_id`, `groups[]`). */
  idChars: 64,
  /** Longest other string (a reason, a name, a room type). */
  textChars: 500,
  /** Longest field name. */
  keyChars: 64,
  /** Entries in a `days` list, and the length of one day name. */
  days: 14,
  dayChars: 10,
  /** Entries in a `periods` list. */
  periods: 13,
  /** Entries in any other list inside a change. */
  arrayItems: 64,
  /** Fields in one object. */
  objectKeys: 40,
  /** Nesting levels inside one change or placement (the entry itself is level 1). */
  depth: 6,
  /** Entries in `changes[]` and `placements[]`. */
  changes: 200,
  placements: 20,
  /** Problems listed before the rest are summed up in one line. */
  issues: 20,
} as const;

/** Fields whose values are ids; `groups` is a list of ids. */
const ID_FIELDS = new Set([
  "id",
  "faculty_id",
  "room_id",
  "session_id",
  "course_id",
]);
/** Field names the stored records use for their own bookkeeping (and `__proto__`). */
const RESERVED_FIELDS = new Set([
  "__proto__",
  "_id",
  "seq",
  "origin",
  "change_request_id",
  "removed_by",
  "created_at",
  "updated_at",
]);

/** A broken limit: where (as path segments) and what, e.g. "at most 13 entries (got 14)". */
type BoundsProblem = { path: (string | number)[]; message: string };

/** `changes[0].session.groups[2]`; an odd field name is quoted (`session["$where"]`) and shortened. */
function pathText(path: readonly (string | number)[]): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(part) && part.length <= 40)
      out += out === "" ? part : `.${part}`;
    else
      out += `[${JSON.stringify(part.length > 40 ? `${part.slice(0, 39)}…` : part)}]`;
  }
  return out;
}

/** Why a field name is refused, or null. */
function keyProblem(key: string): string | null {
  if (key.length > REQUEST_LIMITS.keyChars)
    return `field names can be at most ${REQUEST_LIMITS.keyChars} characters`;
  if (key.startsWith("$") || key.includes(".") || key.includes("\u0000"))
    return 'field names can\'t start with "$" or contain "." or a NUL character';
  if (RESERVED_FIELDS.has(key)) return `"${key}" is a reserved field name`;
  return null;
}

/**
 * Every limit of {@link REQUEST_LIMITS} that `raw` (a request body as sent) breaks, at most
 * `issues` of them plus one closing line (empty path) counting the rest. Only `changes[]` and
 * `placements[]` are walked; the other fields have their own limits. An oversized container is
 * reported once and not entered, so the walk never goes deeper than `depth` levels. Pure.
 */
function boundsProblems(raw: unknown): BoundsProblem[] {
  const L = REQUEST_LIMITS;
  const issues: BoundsProblem[] = [];
  let more = 0;
  const report = (path: (string | number)[], message: string) => {
    if (issues.length < L.issues) issues.push({ path, message });
    else more++;
  };

  /** `field` is the name the value sits under (an array's items inherit the array's name). */
  const visit = (
    value: unknown,
    path: (string | number)[],
    depth: number,
    field: string | null,
    inList: boolean,
  ): void => {
    if (typeof value === "string") {
      const isId =
        field !== null && (inList ? field === "groups" : ID_FIELDS.has(field));
      const isDay = inList ? field === "days" : field === "day";
      if (isId && value.length > L.idChars)
        report(path, `an id can be at most ${L.idChars} characters`);
      else if (isDay && value.length > L.dayChars)
        report(path, `a day can be at most ${L.dayChars} characters`);
      else if (value.length > L.textChars)
        report(path, `text can be at most ${L.textChars} characters`);
      return;
    }
    if (value === null || typeof value !== "object") return;
    if (depth > L.depth) {
      report(path, `nested more than ${L.depth} levels deep`);
      return;
    }
    if (Array.isArray(value)) {
      const max =
        field === "days"
          ? L.days
          : field === "periods"
            ? L.periods
            : L.arrayItems;
      if (value.length > max) {
        report(path, `at most ${max} entries (got ${value.length})`);
        return;
      }
      value.forEach((item, i) =>
        visit(item, [...path, i], depth + 1, field, true),
      );
      return;
    }
    const keys = Object.keys(value);
    if (keys.length > L.objectKeys) {
      report(path, `at most ${L.objectKeys} fields (got ${keys.length})`);
      return;
    }
    for (const key of keys) {
      const problem = keyProblem(key);
      if (problem) report([...path, key], problem);
      else
        visit(
          (value as Record<string, unknown>)[key],
          [...path, key],
          depth + 1,
          key,
          false,
        );
    }
  };

  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const body = raw as Record<string, unknown>;
    for (const [key, max] of [
      ["changes", L.changes],
      ["placements", L.placements],
    ] as const) {
      const list = body[key];
      if (!Array.isArray(list)) continue;
      if (list.length > max) {
        report([key], `at most ${max} entries (got ${list.length})`);
        continue;
      }
      list.forEach((entry, i) => visit(entry, [key, i], 1, null, false));
    }
  }
  if (more > 0)
    issues.push({
      path: [],
      message: `… and ${more} more ${more === 1 ? "problem" : "problems"} like these`,
    });
  return issues;
}

/**
 * The limits of {@link REQUEST_LIMITS} that `raw` (a request body as sent) breaks, as the
 * `details` of the `400 VALIDATION_ERROR` that `POST /api/changes` and `/preview` answer with:
 * `path` like `changes[0].session.groups[2]` (an odd field name is quoted, `session["$where"]`),
 * `message` a sentence such as "An id can be at most 64 characters.". At most
 * `REQUEST_LIMITS.issues` of them, then one with an empty path counting the rest. Pure.
 */
export function changeRequestBoundsIssues(raw: unknown): PathIssue[] {
  return boundsProblems(raw).map(({ path, message }) => ({
    path: pathText(path),
    message: `${message.charAt(0).toUpperCase()}${message.slice(1)}.`,
  }));
}

/** The body itself, once {@link boundsProblems} found nothing. */
const ChangeProposalRequestBodySchema = z
  .strictObject({
    /** Defaults to `disruption`, so a starter-pack change file can be posted as it is. */
    kind: ChangeKind.default("disruption"),
    /** The change file's own `id` (informational; the request gets its own `CR-…` id). */
    id: z.string().max(200).optional(),
    changes: z
      .array(DisruptionChangeSchema)
      .max(REQUEST_LIMITS.changes)
      .default([]),
    placements: z
      .array(AssignmentSchema.strict())
      .max(REQUEST_LIMITS.placements)
      .default([]),
    description: z.string().trim().max(1000).optional(),
    /** The change file's `dataset` label; a mismatch with the loaded dataset is a warning. */
    dataset: z.string().max(200).optional(),
    /** The assistant message this option came from (informational). */
    nl_prompt: z.string().trim().max(2000).optional(),
  })
  .refine((r) => r.changes.length > 0 || r.placements.length > 0, {
    message: "Give at least one change or placement.",
    path: ["changes"],
  });

/**
 * `POST /api/changes` and `POST /api/changes/preview`. A starter-pack change file
 * (`{id?, dataset?, description?, changes}`) is accepted exactly as it is: `kind` defaults to
 * `disruption`. Forms and the assistant send `kind` (and `placements`) explicitly. At least one
 * change or placement is required.
 *
 * The body is first checked against {@link REQUEST_LIMITS} as sent (each problem's path points
 * at the field, and its message starts with the path, e.g. "changes[0].reason: text can be at
 * most 500 characters."), and only a body within them is parsed, so an oversized one gets a
 * short list of problems back. The routes run {@link changeRequestBoundsIssues} first and answer
 * with its `PathIssue[]`. Stored change requests are parsed with `DisruptionChangeSchema` itself.
 */
export const ChangeProposalRequestSchema = z
  .unknown()
  .superRefine((raw, ctx) => {
    for (const { path, message } of boundsProblems(raw))
      ctx.addIssue({
        code: "custom",
        path,
        message:
          path.length > 0 ? `${pathText(path)}: ${message}.` : `${message}.`,
      });
  })
  .pipe(ChangeProposalRequestBodySchema);
export type ChangeProposalRequest = z.infer<typeof ChangeProposalRequestSchema>;
export type ChangeProposalRequestInput = z.input<
  typeof ChangeProposalRequestBodySchema
>;

/** `POST /api/changes/preview` (`data`): the proposal without storing anything. */
export const ChangePreviewSchema = ChangeProposalSchema.extend({
  /** The active version it was computed against (a preview needs one: `409` without it). */
  base_version: Id,
}).strict();
export type ChangePreview = z.infer<typeof ChangePreviewSchema>;

/** An id sent in a request: at most {@link REQUEST_LIMITS}`.idChars` characters. */
const RequestId = Id.max(REQUEST_LIMITS.idChars);

/** `POST /api/manual/place`: pin one session at this slot. */
export const ManualPlacementRequestSchema = z.strictObject({
  session_id: RequestId,
  day: Day,
  start_period: TeachingPeriod,
  room_id: RequestId,
  /**
   * false (default): the slot must be free as it stands, else `409 HARD_CONSTRAINT` with the
   * violations and nothing is stored. true: blockers are moved (fewest moves) and the proposal is
   * stored as `pending` or `infeasible`.
   */
  repair: z.boolean().default(false),
  description: z.string().trim().max(1000).optional(),
});
export type ManualPlacementRequest = z.infer<
  typeof ManualPlacementRequestSchema
>;

/** `POST /api/changes/:id/approve` and `/reject`. */
export const ChangeDecisionRequestSchema = z.strictObject({
  comment: z.string().trim().max(1000).optional(),
});
export type ChangeDecisionRequest = z.infer<typeof ChangeDecisionRequestSchema>;

/**
 * The statuses a stored change request can have: `pending` (waiting for approval),
 * `infeasible` (no fix exists), `applied` and `rejected`. (`proposing` and `approved` are never
 * stored: a proposal is computed before it is stored, and an approval applies it at once.)
 */
export const StoredChangeStatus = ChangeStatus.extract([
  "pending",
  "infeasible",
  "applied",
  "rejected",
]);
export type StoredChangeStatus = z.infer<typeof StoredChangeStatus>;

/** `GET /api/changes` query. `mine`: filed by me; `all`: everything I may see (default). */
export const ChangeListQuerySchema = z.object({
  scope: z.enum(["all", "mine", "pending"]).default("all"),
  status: StoredChangeStatus.optional(),
});
export type ChangeListQuery = z.infer<typeof ChangeListQuerySchema>;

/** `POST /api/changes/:id/approve` (`data`): the applied request and the new active version. */
export const ChangeApplyResultSchema = z.strictObject({
  change: ChangeRequestSchema,
  /** The version that became active. */
  version_id: Id,
  /** Pending proposals built on the old version, now rejected as superseded. */
  superseded: z.array(Id),
});
export type ChangeApplyResult = z.infer<typeof ChangeApplyResultSchema>;
