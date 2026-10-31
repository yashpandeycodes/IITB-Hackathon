/**
 * The AI layer (backend.md §5): plain-language booking parsing (Gemini with a rule-parser
 * fallback, plus deterministic post-processing) and explanation phrasing from engine facts.
 * No database, no engine, no env: the service passes the campus context and the LLM config.
 */
import "server-only";
import type { BookingDraftLLM } from "@/lib/contracts";

import { cacheKey, lruParseCache } from "./cache";
import { explainDecision } from "./explain";
import { geminiClient } from "./gemini";
import { rulesExtraction, runParse } from "./parse";
import { readPrompt } from "./prompts";
import type {
  Explanation,
  ExplanationInput,
  LlmClient,
  LlmConfig,
  ParseCache,
  ParseContext,
  ParseOptions,
  ParseOutcome,
} from "./types";

export type * from "./types";

/** Prompt file ids (`prompts/<id>.md`) and the default Gemini model. */
export {
  DEFAULT_GEMINI_MODEL,
  EXPLAIN_PROMPT_ID,
  PARSE_PROMPT_ID,
} from "./constants";

/**
 * Parses a plain-language request (English, Hinglish, basic Devanagari). With an LLM: structured
 * output, one repair retry on invalid JSON while `budgetMs` allows, then the rule parser as
 * fallback (`fallback_code` says why). Without: the rule parser. Either way the result goes
 * through the same deterministic post-processing.
 */
export async function parseBookingText(
  text: string,
  ctx: ParseContext,
  options: ParseOptions,
): Promise<ParseOutcome> {
  return runParse(text, ctx, options);
}

/** The offline rule parser (regex + lexicon, English, Hinglish, basic Devanagari). Pure. */
export function extractWithRules(
  text: string,
  ctx: ParseContext,
): BookingDraftLLM {
  return rulesExtraction(text, ctx);
}

/** Gemini via `@google/genai` (`responseMimeType: "application/json"` + `responseJsonSchema`). */
export function createGeminiClient(apiKey: string): LlmClient {
  return geminiClient(apiKey);
}

/** An in-memory LRU cache for parse outcomes (per server instance). */
export function createParseCache(maxEntries = 500): ParseCache {
  return lruParseCache(maxEntries);
}

/**
 * The parse cache key: `sha256` over the text, the reference date, the dataset id, the model
 * (or "rules") and the parse prompt id.
 */
export function parseCacheKey(input: {
  text: string;
  referenceDate: string;
  datasetId: string;
  model: string | null;
}): string {
  return cacheKey(input);
}

/** Loads `prompts/<id>.md` (cached). */
export function loadPrompt(id: string): string {
  return readPrompt(id);
}

/**
 * A 2–4 sentence explanation of a booking decision. With an LLM: phrased from the reason and
 * `facts` only, and accepted only when its length, numbers and verdict check out; otherwise
 * (and always for `REJ_BY_APPROVER` / `REJ_CANCELLED`, whose text is a person's own words, and
 * without an LLM) `reason`, the engine's template text. Never throws.
 */
export async function phraseExplanation(
  input: ExplanationInput,
  llm: LlmConfig,
): Promise<Explanation> {
  return explainDecision(input, llm);
}
