/**
 * Plain-language booking parse (`POST /api/bookings/parse`; backend.md §5, architecture §7.2):
 * text → AI layer (Gemini, or the offline rule parser) → a draft resolved against the campus →
 * the category from the requester's role cap → the problems a submission would be refused for →
 * a preview of what the engine would decide right now. Nothing is stored except one `ai_logs`
 * entry: submitting goes through `POST /api/bookings`.
 *
 * The preview equals a submission: the same draft checks and request building
 * (`booking-drafts.ts`) and the same engine run as Spectra (`spectra-engine.ts`: approver
 * rejections and cancelled live requests left out, the export safeguard applied).
 *
 * The LLM only extracts fields. The category comes from the session's role (a claim in the text
 * is reported, never used to raise priority) and the status comes from the engine.
 */
import "server-only";
import type { Db } from "mongodb";
import {
  PARSE_PROMPT_ID,
  createParseCache,
  parseBookingText,
  type LlmConfig,
  type ParseCache,
  type ParseContext,
  type ParseOutcome,
} from "@/lib/ai";
import {
  ParseBookingResultSchema,
  effectiveCategory,
  isCategoryCapped,
  roleCategoryCap,
  type Assignment,
  type BookingRequest,
  type BookingRequestRecord,
  type Category,
  type Dataset,
  type ParseBookingResult,
  type ParsedBookingDraft,
  type PriorityRules,
  type Room,
  type SessionUser,
} from "@/lib/contracts";
import { appendAiLog } from "@/lib/db/repos/ai-logs";
import { listBookingRequests } from "@/lib/db/repos/reference";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { missingNeeds } from "@/lib/engine";
import {
  NO_APPROVAL,
  approvalNeed,
  roomDepartments,
} from "./booking-approvals";
import {
  draftProblems,
  draftRequests,
  submissionTime,
  type DraftProblem,
} from "./booking-drafts";
import { getActiveDataset } from "./dataset";
import { getLlmConfig } from "./llm";
import { getSettings } from "./settings";
import { decideSpectra, engineInput } from "./spectra-engine";

export type ParseCategory = ParseBookingResult["category"];
export type ParseRequestedRoom = ParseBookingResult["requested_room"];
export type ParsePreview = NonNullable<ParseBookingResult["preview"]>;

/** Injection points for tests and scripts. */
export type ParseDeps = {
  /** The LLM to use; `null` = AI off. Default: {@link getLlmConfig}(db, "fast"). */
  llm?: LlmConfig;
  /** Parse cache; `null` disables it. Default: one LRU cache per server instance. */
  cache?: ParseCache | null;
};

/**
 * Id of the hypothetical request the preview decides (made unique against the dataset); the
 * other days of a series get `PREVIEW-2`, `PREVIEW-3`, ….
 */
export const PREVIEW_REQUEST_ID = "PREVIEW";

/** Request states a Spectra run decides (drafts never are). */
const RUN_STATES = [
  "submitted",
  "pending_approval",
  "decided",
  "cancelled",
] as const;

// Created on first use, so importing this module never runs AI-layer code.
let sharedCache: ParseCache | undefined;
function defaultCache(): ParseCache {
  sharedCache ??= createParseCache();
  return sharedCache;
}

// ------------------------------------------------------------------------------ pure helpers

/** What the parser may know about the campus: calendar, rooms and groups of `dataset`. */
export function buildParseContext(
  dataset: Dataset,
  referenceDate: string,
): ParseContext {
  const { calendar } = dataset;
  return {
    datasetId: dataset.dataset_id,
    calendar: {
      days: calendar.days,
      periods: calendar.periods.map(({ id, start, end, teaching }) => ({
        id,
        start,
        end,
        teaching,
      })),
      lunch: {
        after_period: calendar.lunch.after_period,
        start: calendar.lunch.start,
        end: calendar.lunch.end,
      },
    },
    rooms: dataset.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      type: room.type,
      capacity: room.capacity,
      features: room.features,
      accessible: room.accessible,
      allowed_uses: room.allowed_uses,
    })),
    groups: dataset.student_groups.map((group) => ({
      id: group.id,
      name: group.name,
      year: group.year,
      department: group.department,
      size: group.size,
    })),
    referenceDate,
  };
}

/**
 * The category a request from `role` is ranked by. A claim in the text ("institute level") is
 * reported as `claimed` (and `capped` when it is above the role's cap) but never changes the
 * category: requests always rank at the role's cap.
 */
export function categoryFor(
  rules: PriorityRules,
  role: string,
  claimed: Category | null,
): ParseCategory {
  const cap = roleCategoryCap(rules, role);
  // A submitted booking always ranks at the role's cap (drafts carry no category), so the
  // preview does too: a claim never changes priority, in either direction. `capped` tells the
  // user their claim was above what the role allows.
  return {
    claimed,
    effective: effectiveCategory(rules, { role, requested_category: cap }),
    capped:
      claimed !== null &&
      isCategoryCapped(rules, { role, requested_category: claimed }),
  };
}

const NEED_LABELS: Record<string, string> = {
  accessible: "wheelchair access",
  pa_system: "a PA system",
  projector: "a projector",
  stage: "a stage",
  computers: "computers",
  ac: "air conditioning",
  power_benches: "power benches",
};

/** Needs `room` does not cover (the engine's check; it reads only `needs`). */
function lacking(room: Room, needs: readonly string[]): string[] {
  return missingNeeds({ needs: [...needs] } as BookingRequest, room);
}

function needsText(needs: readonly string[]): string {
  const labels = needs.map((need) => NEED_LABELS[need] ?? need);
  return labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}

/**
 * A room that covers every need and seats everyone, for when the named room does not: same room
 * type first, then the draft's other room types; the smallest that fits, then dataset order.
 */
function alternativeRoom(
  named: Room,
  draft: ParsedBookingDraft,
  rooms: readonly Room[],
): string | null {
  const types = [
    named.type,
    ...draft.room_types.filter((t) => t !== named.type),
  ];
  for (const type of types) {
    const fits = rooms
      .filter(
        (room) =>
          room.id !== named.id &&
          room.type === type &&
          room.allowed_uses.includes("event") &&
          room.capacity >= (draft.attendance ?? 0) &&
          lacking(room, draft.needs).length === 0,
      )
      .sort((a, b) => a.capacity - b.capacity);
    if (fits.length > 0) return fits[0].id;
  }
  return null;
}

/**
 * The requested room from the parse. When the named room lacks something the text asks for
 * ("SH-2 … wheelchair accessible") and the parser left no note, a note names what is missing and
 * a room that has it (also offered as `suggestion` when the parser had none).
 */
export function requestedRoomFor(
  outcome: Pick<ParseOutcome, "requested_room" | "draft">,
  rooms: readonly Room[],
): ParseRequestedRoom {
  const base: ParseRequestedRoom = { ...outcome.requested_room };
  if (base.note !== null || base.room_id === null) return base;
  const room = rooms.find((r) => r.id === base.room_id);
  if (!room) return base;
  const missing = lacking(room, outcome.draft.needs);
  if (missing.length === 0) return base;
  const suggestion =
    base.suggestion ?? alternativeRoom(room, outcome.draft, rooms);
  const lacks = `${room.id} (${room.name}) has no ${needsText(missing)}.`;
  return {
    ...base,
    suggestion,
    note: suggestion
      ? `${lacks} ${suggestion} has everything you asked for.`
      : lacks,
  };
}

/** `base`, or `base-2`, `base-3`, … : the first id not in `taken`. Adds it to `taken`. */
function freshId(taken: Set<string>, base: string): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * The requests `draft` would become if submitted now (a series when it repeats), with
 * placeholder ids unique against `dataset`. Null while the draft is incomplete.
 */
function previewRequests(
  dataset: Dataset,
  draft: ParsedBookingDraft,
  user: SessionUser,
  submittedAt: string,
): BookingRequest[] | null {
  if (
    draft.missing.length > 0 ||
    draft.title === null ||
    draft.attendance === null ||
    draft.duration_periods === null
  ) {
    return null;
  }
  const requests = draftRequests(dataset, user, {
    ...draft,
    title: draft.title,
    attendance: draft.attendance,
    duration_periods: draft.duration_periods,
  });
  const taken = new Set(dataset.booking_requests.map((r) => r.id));
  const first = freshId(taken, PREVIEW_REQUEST_ID);
  const ids = [first, ...requests.slice(1).map(() => freshId(taken, first))];
  const series = requests.length > 1 ? `SER-${first}` : null;
  return requests.map((request, i) => ({
    ...request,
    id: ids[i],
    submitted_at: submittedAt,
    series_id: series,
  }));
}

/**
 * What a Spectra run would decide for `draft` against `assignments` if it were submitted now,
 * with every stored request (`records`: those in a run's states) as it stands, and who would
 * have to approve it. Null while the draft is incomplete. A series is decided whole; the preview
 * reports its first day.
 */
export function previewDecision(
  dataset: Dataset,
  records: readonly BookingRequestRecord[],
  assignments: readonly Assignment[],
  draft: ParsedBookingDraft,
  user: SessionUser,
  submittedAt: string = submissionTime(dataset),
): ParsePreview | null {
  const requests = previewRequests(dataset, draft, user, submittedAt);
  if (!requests) return null;
  const input = engineInput(
    {
      ...dataset,
      booking_requests: [...dataset.booking_requests, ...requests],
    },
    records,
    { live: requests.map((r) => r.id) },
  );
  const decision = decideSpectra(input, assignments).result.decisions.find(
    (d) => d.request_id === requests[0].id,
  );
  if (!decision) return null;
  const need = approvalNeed(decision, roomDepartments(dataset.rooms));
  return {
    status: decision.status,
    reason_code: decision.reason_code,
    reason: decision.reason,
    ...(decision.room_id !== undefined && { room_id: decision.room_id }),
    ...(decision.day !== undefined && { day: decision.day }),
    ...(decision.start_period !== undefined && {
      start_period: decision.start_period,
    }),
    ...(decision.end_period !== undefined && {
      end_period: decision.end_period,
    }),
    approval: need ? { needed: true, ...need } : NO_APPROVAL,
  };
}

// --------------------------------------------------------------------------------- service

async function previewFor(
  db: Db,
  dataset: Dataset,
  draft: ParsedBookingDraft,
  user: SessionUser,
): Promise<ParsePreview | null> {
  if (draft.missing.length > 0) return null;
  const [version, records] = await Promise.all([
    getActiveTimetableVersion(db),
    listBookingRequests(db, { state: [...RUN_STATES] }),
  ]);
  if (!version) return null;
  try {
    return previewDecision(
      dataset,
      records,
      version.assignments,
      draft,
      user,
      submissionTime(dataset),
    );
  } catch (err) {
    // The preview is advisory: a failure must not cost the user their parsed draft.
    console.error("[booking-parse] preview failed", err);
    return null;
  }
}

/**
 * Parses `text` for `user` into an editable draft plus the engine's verdict on it, and logs the
 * parse to `ai_logs` (its id is `log_id`). Works with AI off: the rule parser then does it all.
 */
export async function parseBookingRequest(
  db: Db,
  user: SessionUser,
  text: string,
  deps: ParseDeps = {},
): Promise<ParseBookingResult> {
  const [dataset, settings, llm] = await Promise.all([
    getActiveDataset(db),
    getSettings(db),
    deps.llm !== undefined ? deps.llm : getLlmConfig(db, "fast"),
  ]);
  const cache =
    deps.cache === undefined ? defaultCache() : (deps.cache ?? undefined);

  const outcome = await parseBookingText(
    text,
    buildParseContext(dataset, settings.reference_date),
    { llm, cache },
  );
  const category = categoryFor(dataset, user.role, outcome.claimed_category);
  const requested_room = requestedRoomFor(outcome, dataset.rooms);
  // The same checks as `POST /api/bookings`: a draft it would refuse gets no preview.
  const problems: DraftProblem[] = draftProblems(
    dataset,
    user,
    outcome.draft,
  ).problems;
  const preview =
    problems.length > 0
      ? null
      : await previewFor(db, dataset, outcome.draft, user);

  const log = await appendAiLog(db, {
    feature: "parse_booking",
    source: outcome.source,
    model: outcome.model,
    prompt_id: PARSE_PROMPT_ID,
    input: text,
    output_raw: outcome.raw_output,
    // False when an LLM was configured but gave no valid extraction (the rule parser filled in).
    parsed_ok: outcome.fallback_code === null,
    repaired: outcome.repaired,
    cached: outcome.cached,
    // The detailed reason stays here; the response carries only the code.
    fallback_reason: outcome.fallback_reason,
    // What a submission's provenance copies (never the client's copy of the draft).
    assumptions: outcome.draft.assumptions,
    follow_up: outcome.draft.follow_up,
    engine_verdict: preview?.status ?? null,
    latency_ms: Math.max(0, Math.round(outcome.latency_ms)),
    user_id: user.id,
  });

  return ParseBookingResultSchema.parse({
    draft: outcome.draft,
    source: outcome.source,
    model: outcome.model,
    ai_enabled: llm !== null,
    fallback_reason: outcome.fallback_code,
    category,
    requested_room,
    conditions: outcome.conditions,
    confidence: outcome.confidence,
    problems,
    preview,
    log_id: log.id,
  });
}
