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
import { PARSE_PROMPT_ID } from "./constants";
import { postProcess } from "./postprocess";
import { buildParsePrompt, readPrompt } from "./prompts";
import { extractRaw } from "./rules";
import {
  generateStructured,
  validateJson,
  type StructuredAttempt,
  type Validation,
} from "./structured";
import type {
  LlmConfig,
  ParseContext,
  ParseOptions,
  ParseOutcome,
} from "./types";

export { MIN_REPAIR_MS, MIN_REPAIR_SHARE } from "./structured";

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

/** JSON text (optionally in a ```json fence) → a schema-valid extraction, or the error. */
export function validateExtraction(raw: string): Validation<BookingDraftLLM> {
  return validateJson(BookingDraftLLMSchema, raw);
}

/**
 * Structured output, then one repair retry if the output fails the schema, all within
 * `budgetMs` (default: the call timeout). The repair is skipped when too little of the budget
 * is left for it, and the caller's `signal` aborts either call.
 */
function extractWithLlm(
  text: string,
  ctx: ParseContext,
  llm: NonNullable<LlmConfig>,
  options: Pick<ParseOptions, "budgetMs" | "signal">,
): Promise<StructuredAttempt<BookingDraftLLM>> {
  return generateStructured({
    llm,
    system: () => readPrompt(PARSE_PROMPT_ID),
    prompt: () => buildParsePrompt(text, ctx),
    jsonSchema: parseJsonSchema(),
    validate: validateExtraction,
    budgetMs: options.budgetMs,
    signal: options.signal,
  });
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
      extraction = attempt.value;
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
