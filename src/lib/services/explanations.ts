import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import {
  EXPLAIN_PROMPT_ID,
  phraseExplanation,
  type ExplanationInput,
} from "@/lib/ai";
import type {
  BookingExplanation,
  ReasonCode,
  SessionUser,
  StoredBookingDecision,
} from "@/lib/contracts";
import { limits } from "@/lib/auth/rate-limit";
import { appendAiLog } from "@/lib/db/repos/ai-logs";
import { getLlmConfig } from "./llm";

/**
 * Plain-language explanations of booking decisions (`GET /api/bookings/:id`), phrased from the
 * stored decision's facts: by Gemini when AI is on, else the engine's own text. Never fails: any
 * AI problem falls back to the template.
 *
 * - Cache: per server instance, keyed by what the text is phrased from (the decision's content
 *   and the model, not its `decided_at`, which every Spectra run renews), so repeated views of
 *   an unchanged decision make no new model call.
 * - Quota: `limits.aiExplainUser` model-phrased explanations per user; past it the template is
 *   shown with no model call.
 * - Every model call is logged to `ai_logs` (`feature: "explain"`).
 */

type CachedText = Pick<BookingExplanation, "text" | "source">;

const cache = new Map<string, CachedText>();
const CACHE_MAX = 500;

/** Bound on the `ai_logs` input (it is a small JSON object; this only guards odd ids). */
const LOG_INPUT_MAX = 500;

/**
 * Codes the AI layer always phrases from the template without asking the model (an approver's or
 * the requester's own words): they cost no quota.
 */
const TEMPLATE_ONLY: ReadonlySet<ReasonCode> = new Set([
  "REJ_BY_APPROVER",
  "REJ_CANCELLED",
]);

/** Forgets every cached explanation (tests). */
export function clearExplanationCache(): void {
  cache.clear();
}

/** Template text for a decision: the engine's reason, or a short line when it is empty. */
export function templateText(decision: StoredBookingDecision): string {
  if (decision.reason.trim()) return decision.reason;
  const slot =
    decision.room_id && decision.day
      ? `: ${decision.room_id} ${decision.day} P${decision.start_period}–P${decision.end_period}`
      : "";
  switch (decision.status) {
    case "approved":
      return `Approved${slot}.`;
    case "alternative_offered":
      return `An alternative is offered${slot}.`;
    case "rejected":
      return "The request was rejected.";
  }
}

/** sha256 of everything the explanation is phrased from, plus the model. */
function cacheKey(decision: StoredBookingDecision, model: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        request_id: decision.request_id,
        status: decision.status,
        reason_code: decision.reason_code,
        reason: decision.reason,
        slot: {
          room_id: decision.room_id ?? null,
          day: decision.day ?? null,
          start_period: decision.start_period ?? null,
          end_period: decision.end_period ?? null,
        },
        facts: decision.facts ?? null,
        model,
      }),
    )
    .digest("hex");
}

function remember(key: string, value: CachedText): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/**
 * The explanation `user` sees for `decision`. With AI off, over the user's quota, or on any AI
 * problem: the template text.
 */
export async function explainDecision(
  db: Db,
  user: SessionUser,
  decision: StoredBookingDecision,
): Promise<BookingExplanation> {
  const facts = decision.facts ?? null;
  const template: BookingExplanation = {
    text: templateText(decision),
    source: "template",
    facts,
  };
  try {
    const llm = await getLlmConfig(db, "smart");
    if (!llm) return template;

    const key = cacheKey(decision, llm.model);
    const hit = cache.get(key);
    if (hit) return { ...hit, facts };

    if (
      !TEMPLATE_ONLY.has(decision.reason_code) &&
      !limits.aiExplainUser.hit(user.id).allowed
    ) {
      return template;
    }

    const input: ExplanationInput = {
      status: decision.status,
      reason_code: decision.reason_code,
      reason: decision.reason,
      facts: { ...(facts ?? {}) },
    };
    const phrased = await phraseExplanation(input, llm);

    if (phrased.model !== null) {
      await appendAiLog(db, {
        feature: "explain",
        source: phrased.source,
        model: phrased.model,
        prompt_id: EXPLAIN_PROMPT_ID,
        input: JSON.stringify({
          request_id: decision.request_id,
          status: decision.status,
          reason_code: decision.reason_code,
        }).slice(0, LOG_INPUT_MAX),
        output_raw: phrased.raw_output,
        parsed_ok: phrased.source === "llm",
        repaired: false,
        cached: false,
        fallback_reason: phrased.fallback_reason,
        engine_verdict: decision.status,
        latency_ms: Math.max(0, Math.round(phrased.latency_ms)),
        user_id: user.id,
      }).catch((err: unknown) => {
        console.warn(
          "[explanations] could not log the model call:",
          err instanceof Error ? err.message : err,
        );
      });
    }

    if (phrased.source !== "llm" || !phrased.text.trim()) return template;
    remember(key, { text: phrased.text, source: "llm" });
    return { text: phrased.text, source: "llm", facts };
  } catch (err) {
    console.warn(
      "[explanations] fell back to the template:",
      err instanceof Error ? err.message : err,
    );
    return template;
  }
}
