/**
 * The parse pipeline (backend.md §5.5): Gemini structured output → (Zod fail) one repair retry,
 * time permitting → rule parser, then the same deterministic post-processing for whichever
 * extraction won. A fallback reports a code (`timeout`, `invalid_output`, `llm_error`) and a
 * detailed, key-redacted reason for the logs.
 */
import { z } from "zod";

import {
  BookingDraftLLMSchema,
  type BookingDraftLLM,
  type FallbackCode,
} from "@/lib/contracts";

import { cacheKey } from "./cache";
import {
  LlmAbortedError,
  describeError,
  isTimeout,
  redactSecrets,
  withTimeout,
} from "./call";
import { PARSE_PROMPT_ID } from "./constants";
import { postProcess } from "./postprocess";
import { buildParsePrompt, buildRepairPrompt, readPrompt } from "./prompts";
import { extractRaw } from "./rules";
import type {
  LlmConfig,
  ParseContext,
  ParseOptions,
  ParseOutcome,
} from "./types";

/** The rule extraction after post-processing (resolved ids, derived fields, chips). */
export function rulesExtraction(
  text: string,
  ctx: ParseContext,
): BookingDraftLLM {
  return postProcess(extractRaw(text, ctx), text, ctx, "rules").extraction;
}

let jsonSchema: unknown;
/** `z.toJSONSchema(BookingDraftLLMSchema)`, built once. */
export function parseJsonSchema(): unknown {
  jsonSchema ??= z.toJSONSchema(BookingDraftLLMSchema);
  return jsonSchema;
}

type Validation =
  { ok: true; value: BookingDraftLLM } | { ok: false; error: string };

/** JSON text (optionally in a ```json fence) → a schema-valid extraction, or the error. */
export function validateExtraction(raw: string): Validation {
  const body = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${describeError(err)}` };
  }
  const result = BookingDraftLLMSchema.safeParse(data);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: z.prettifyError(result.error).slice(0, 1200) };
}

type LlmAttempt =
  | { ok: true; extraction: BookingDraftLLM; raw: string; repaired: boolean }
  | { ok: false; code: FallbackCode; reason: string; raw: string | null };

/** The repair retry needs at least this long, and at least this share of the call timeout. */
export const MIN_REPAIR_MS = 1500;
export const MIN_REPAIR_SHARE = 0.25;

/** `code: detail`, API keys redacted, bounded (for `ai_logs`, never for the response). */
function fallbackReason(code: FallbackCode, detail: string): string {
  return redactSecrets(`${code}: ${detail}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function failure(err: unknown, raw: string | null): LlmAttempt {
  if (err instanceof LlmAbortedError)
    return {
      ok: false,
      code: "timeout",
      reason: fallbackReason("timeout", describeError(err)),
      raw,
    };
  const code: FallbackCode = isTimeout(err) ? "timeout" : "llm_error";
  return {
    ok: false,
    code,
    reason: fallbackReason(code, describeError(err)),
    raw,
  };
}

/**
 * Structured output, then one repair retry if the output fails the schema, all within
 * `budgetMs` (default: the call timeout). The repair is skipped when too little of the budget
 * is left for it, and the caller's `signal` aborts either call.
 */
async function extractWithLlm(
  text: string,
  ctx: ParseContext,
  llm: NonNullable<LlmConfig>,
  options: Pick<ParseOptions, "budgetMs" | "signal">,
): Promise<LlmAttempt> {
  const budget = Math.max(1, Math.floor(options.budgetMs ?? llm.timeoutMs));
  const started = performance.now();
  const left = () => Math.floor(budget - (performance.now() - started));
  let raw: string | null = null;
  try {
    const system = readPrompt(PARSE_PROMPT_ID);
    const prompt = buildParsePrompt(text, ctx);
    const call = (userPrompt: string, ms: number) =>
      withTimeout(
        (signal) =>
          llm.client.generateJson({
            model: llm.model,
            system,
            prompt: userPrompt,
            jsonSchema: parseJsonSchema(),
            timeoutMs: ms,
            signal,
          }),
        ms,
        options.signal,
      );

    raw = await call(prompt, Math.min(llm.timeoutMs, budget));
    const first = validateExtraction(raw);
    if (first.ok)
      return { ok: true, extraction: first.value, raw, repaired: false };

    const remaining = left();
    const needed = Math.max(MIN_REPAIR_MS, MIN_REPAIR_SHARE * llm.timeoutMs);
    if (remaining < needed)
      return {
        ok: false,
        code: "timeout",
        reason: fallbackReason(
          "timeout",
          `no time left for the repair retry (${Math.max(0, remaining)} of ${budget} ms left, ${Math.ceil(needed)} needed); first output: ${first.error.slice(0, 200)}`,
        ),
        raw,
      };
    raw = await call(
      buildRepairPrompt(prompt, raw, first.error),
      Math.min(llm.timeoutMs, remaining),
    );
    const second = validateExtraction(raw);
    if (second.ok)
      return { ok: true, extraction: second.value, raw, repaired: true };
    return {
      ok: false,
      code: "invalid_output",
      reason: fallbackReason(
        "invalid_output",
        `failed the schema twice: ${second.error.slice(0, 300)}`,
      ),
      raw,
    };
  } catch (err) {
    return failure(err, raw);
  }
}

export async function runParse(
  text: string,
  ctx: ParseContext,
  options: ParseOptions,
): Promise<ParseOutcome> {
  const started = performance.now();
  const elapsed = () => Math.max(0, Math.round(performance.now() - started));
  const { llm, cache } = options;
  const key =
    llm && cache
      ? cacheKey({
          text,
          referenceDate: ctx.referenceDate,
          datasetId: ctx.datasetId,
          model: llm.model,
        })
      : null;

  if (key && cache) {
    const hit = cache.get(key);
    if (hit) return { ...hit, cached: true, latency_ms: elapsed() };
  }

  let extraction: BookingDraftLLM | null = null;
  let fallbackCode: FallbackCode | null = null;
  let fallbackDetail: string | null = null;
  let repaired = false;
  let rawOutput: string | null = null;
  if (llm) {
    const attempt = await extractWithLlm(text, ctx, llm, options);
    rawOutput = attempt.raw;
    if (attempt.ok) {
      extraction = attempt.extraction;
      repaired = attempt.repaired;
    } else {
      fallbackCode = attempt.code;
      fallbackDetail = attempt.reason;
    }
  }

  const source = extraction ? "llm" : "rules";
  const input = extraction ?? extractRaw(text, ctx);
  const processed = postProcess(input, text, ctx, source);
  const outcome: ParseOutcome = {
    draft: processed.draft,
    extraction: input,
    source,
    // The model is named only when its extraction was used.
    model: llm && source === "llm" ? llm.model : null,
    fallback_code: fallbackCode,
    fallback_reason: fallbackDetail,
    repaired,
    raw_output: rawOutput,
    latency_ms: elapsed(),
    requested_room: processed.requested_room,
    claimed_category: processed.claimed_category,
    conditions: processed.conditions,
    confidence: processed.confidence,
    cached: false,
  };
  // Only successful LLM parses are cached: a fallback should retry the LLM next time.
  if (key && cache && source === "llm") cache.set(key, outcome);
  return outcome;
}
