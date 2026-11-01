/**
 * Explanations (`POST /api/explain`, backend.md §3.7): "why is this class at 8 AM?", "why was my
 * booking rejected?", "why did my session move?". The facts come from the engine
 * (`explainSession`), the stored booking decision or the stored change proposal. A session's
 * text is phrased from its facts only, by the model when AI is on (checked against the facts),
 * else the template; a booking's is the one stored with its decision. A change request's text is
 * always the template: its facts carry the requester's own words (change reasons, move reasons)
 * and its reader may be the admin deciding it, so no model ever sees them. AI problems never fail
 * the request.
 *
 * Visibility:
 * - `session`: any signed-in role (timetables are readable by every role); `404` for an unknown
 *   session.
 * - `booking`: exactly `GET /api/bookings/:id` (`getBookingDetail`): `404` when the user may not
 *   see it.
 * - `change`: `canSeeChange` (admins, the requester, the touched department's coordinator, the
 *   touched faculty); `404` otherwise, so ids can't be probed.
 *
 * Phrased session texts are cached per server instance by what they are phrased from (facts,
 * template, model); model calls count toward `limits.aiExplainUser` (past it, the template) and
 * each one is logged to `ai_logs` (`feature: "explain"`).
 */
import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import {
  EXPLAIN_SCHEDULE_PROMPT_ID,
  phraseScheduleExplanation,
  type LlmConfig,
} from "@/lib/ai";
import {
  ChangeFactsSchema,
  ExplainResultSchema,
  type ChangeFacts,
  type ChangeRequest,
  type ExplainRequest,
  type ExplainResult,
  type ExplanationSource,
  type SessionFacts,
  type SessionUser,
} from "@/lib/contracts";
import { limits } from "@/lib/auth/rate-limit";
import { appendAiLog } from "@/lib/db/repos/ai-logs";
import { getChangeRequest } from "@/lib/db/repos/change-requests";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { explainSession } from "@/lib/engine";
import { notFound } from "@/lib/errors";
import { BOOKING_ID, getBookingDetail } from "./bookings";
import { canSeeChange } from "./change-scope";
import { getActiveDataset } from "./dataset";
import { getLlmConfig } from "./llm";

/** Injection points for tests. */
export type ExplainDeps = {
  /** The phrasing model; `null` = templates only. Default: {@link getLlmConfig}(db, "smart"). */
  llm?: LlmConfig;
};

type Phrased = { text: string; source: ExplanationSource };

const cache = new Map<string, Phrased>();
const CACHE_MAX = 500;
/** Bound on the `ai_logs` input (a small JSON object). */
const LOG_INPUT_MAX = 500;

/** Forgets every cached explanation (tests). */
export function clearExplainCache(): void {
  cache.clear();
}

function remember(key: string, value: Phrased): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function cacheKey(
  facts: SessionFacts,
  template: string,
  model: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        prompt: EXPLAIN_SCHEDULE_PROMPT_ID,
        facts,
        template,
        model,
      }),
    )
    .digest("hex");
}

/**
 * The text for a session's `facts`: the model's (within the quota, from the cache when unchanged)
 * or the template. Never throws.
 */
async function phrase(
  db: Db,
  user: SessionUser,
  facts: SessionFacts,
  template: string,
  verdict: string,
  deps: ExplainDeps,
): Promise<Phrased> {
  const fallback: Phrased = { text: template, source: "template" };
  try {
    const llm =
      deps.llm !== undefined ? deps.llm : await getLlmConfig(db, "smart");
    if (!llm) return fallback;
    const key = cacheKey(facts, template, llm.model);
    const hit = cache.get(key);
    if (hit) return hit;
    if (!limits.aiExplainUser.hit(user.id).allowed) return fallback;

    const result = await phraseScheduleExplanation(facts, template, llm);
    if (result.model !== null) {
      await appendAiLog(db, {
        feature: "explain",
        source: result.source,
        model: result.model,
        prompt_id: EXPLAIN_SCHEDULE_PROMPT_ID,
        input: JSON.stringify({
          subject: "session",
          id: facts.session_id,
        }).slice(0, LOG_INPUT_MAX),
        output_raw: result.raw_output,
        parsed_ok: result.source === "llm",
        repaired: false,
        cached: false,
        fallback_reason: result.fallback_reason,
        engine_verdict: verdict,
        latency_ms: Math.max(0, Math.round(result.latency_ms)),
        user_id: user.id,
      }).catch((err: unknown) => {
        console.warn(
          "[explain] could not log the model call:",
          err instanceof Error ? err.message : err,
        );
      });
    }
    if (result.source !== "llm" || !result.text.trim()) return fallback;
    const phrased: Phrased = { text: result.text, source: "llm" };
    remember(key, phrased);
    return phrased;
  } catch (err) {
    console.warn(
      "[explain] fell back to the template:",
      err instanceof Error ? err.message : err,
    );
    return fallback;
  }
}

// ------------------------------------------------------------------------------- changes

const MOVES = new Set(["room_only", "time_only", "time_and_room"]);

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const STATUS_TEXT: Record<ChangeRequest["status"], string> = {
  proposing: "It is still being computed.",
  pending: "It is waiting for an admin's approval.",
  approved: "An admin approved it.",
  applied: "It has been applied to the timetable.",
  rejected: "It was rejected, so the timetable is unchanged.",
  infeasible: "Nothing was changed.",
};

/**
 * The template explanation of a change request, from its stored proposal: what moves (and how),
 * the soft-penalty change, up to three moves with their reasons, and the status; or, when no
 * valid fix exists, the conflicts. Pure.
 */
export function changeSummary(
  cr: Pick<
    ChangeRequest,
    | "id"
    | "status"
    | "title"
    | "moved_count"
    | "time_changed"
    | "room_only_changed"
    | "soft_delta"
    | "diff"
    | "conflicts"
  >,
): string {
  const head = cr.title ? `${cr.id} (${cr.title})` : cr.id;
  if (cr.status === "infeasible" || cr.conflicts.length > 0) {
    const why = cr.conflicts
      .slice(0, 2)
      .map((c) => c.summary.trim())
      .filter(Boolean)
      .join(" ");
    const more =
      cr.conflicts.length > 2
        ? ` ${count(cr.conflicts.length - 2, "more session")} can't be placed either.`
        : "";
    return `${head} has no valid fix: ${why || "some sessions can't be placed."}${more} ${STATUS_TEXT[cr.status]}`.trim();
  }
  const added = cr.diff.filter((d) => d.move === "added").length;
  const removed = cr.diff.filter((d) => d.move === "removed").length;
  const parts: string[] = [];
  parts.push(
    cr.moved_count === 0
      ? "no session moves"
      : `${count(cr.moved_count, "session")} ${cr.moved_count === 1 ? "moves" : "move"} (${cr.time_changed} change time, ${cr.room_only_changed} change room only)`,
  );
  if (added > 0) parts.push(`${count(added, "session")} added`);
  if (removed > 0) parts.push(`${count(removed, "session")} removed`);
  const soft =
    cr.soft_delta === 0
      ? "The soft penalty is unchanged."
      : cr.soft_delta > 0
        ? `The soft penalty rises by ${cr.soft_delta}.`
        : `The soft penalty falls by ${-cr.soft_delta}.`;
  const examples = cr.diff
    .filter((d) => MOVES.has(d.move) || d.move === "added")
    .slice(0, 3)
    .map((d) => `${d.session_id}: ${d.reason.trim()}`.replace(/\.?$/, "."))
    .join(" ");
  return [
    `${head}: ${parts.join(", ")}.`,
    soft,
    examples,
    STATUS_TEXT[cr.status],
  ]
    .filter(Boolean)
    .join(" ");
}

/** The facts an explanation of `cr` is phrased from. */
export function changeFacts(cr: ChangeRequest): ChangeFacts {
  return ChangeFactsSchema.parse({
    change_id: cr.id,
    status: cr.status,
    title: cr.title,
    moved_count: cr.moved_count,
    time_changed: cr.time_changed,
    room_only_changed: cr.room_only_changed,
    soft_delta: cr.soft_delta,
    diff: cr.diff,
    conflicts: cr.conflicts,
    summary: changeSummary(cr),
  });
}

// ------------------------------------------------------------------------------- service

/**
 * Why a session, booking or change request is the way it is, for `user`. The result's `facts`
 * match its `subject` (`ExplainResultSchema`): `SessionFacts`, the booking decision's
 * `DecisionFacts` (`{}` before a decision, or for a decision stored without facts), or
 * `ChangeFacts`.
 */
export async function explainSubject(
  db: Db,
  user: SessionUser,
  request: ExplainRequest,
  deps: ExplainDeps = {},
): Promise<ExplainResult> {
  const { subject, id } = request;

  if (subject === "booking") {
    if (!BOOKING_ID.test(id))
      throw notFound("No booking request with that id.");
    const detail = await getBookingDetail(db, user, id);
    const explanation = detail.explanation;
    return ExplainResultSchema.parse({
      subject,
      id: detail.request.id,
      text:
        explanation?.text ??
        "No decision yet: the engine decides this request when a timetable is active.",
      source: explanation?.source ?? "template",
      facts: explanation?.facts ?? {},
    });
  }

  if (subject === "change") {
    const cr = await getChangeRequest(db, id);
    if (!cr || !canSeeChange(user, cr))
      throw notFound("No change request with that id.");
    const facts = changeFacts(cr);
    // Always the template: requester-written text must not be rephrased for the approver.
    return ExplainResultSchema.parse({
      subject,
      id: cr.id,
      text: facts.summary,
      source: "template",
      facts,
    });
  }

  const [dataset, version] = await Promise.all([
    getActiveDataset(db),
    getActiveTimetableVersion(db),
  ]);
  if (!dataset.sessions.some((s) => s.id === id))
    throw notFound("No session with that id.");
  const facts = explainSession({
    dataset,
    assignments: version?.assignments ?? [],
    session_id: id,
    version_id: version?.id ?? null,
  });
  if (!facts) throw notFound("No session with that id.");
  const text = await phrase(
    db,
    user,
    facts,
    facts.summary,
    facts.placed ? "placed" : "unplaced",
    deps,
  );
  return ExplainResultSchema.parse({
    subject,
    id: facts.session_id,
    ...text,
    facts,
  });
}
