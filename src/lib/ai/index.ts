/**
 * The AI layer (backend.md §5): plain-language booking parsing (Gemini with a rule-parser
 * fallback, plus deterministic post-processing), the assistant's intent extraction (the same
 * pattern), and text phrased from engine facts (booking decisions, assistant replies, session
 * explanations). No database, no engine, no env: the service passes the campus
 * context and the LLM config.
 */
import "server-only";
import type {
  AssistantIntentKind,
  AssistantIntentLLM,
  BookingDraftLLM,
  SessionFacts,
} from "@/lib/contracts";

import { extractIntent as runIntent } from "./assistant";
import { extractIntentWithRules, readSignals } from "./assistant-rules";
import { cacheKey, lruParseCache } from "./cache";
import { explainDecision } from "./explain";
import { geminiClient } from "./gemini";
import { rulesExtraction, runParse } from "./parse";
import {
  phraseAssistantReply as phraseReply,
  phraseScheduleExplanation as phraseSchedule,
} from "./phrase";
import { readPrompt } from "./prompts";
import type {
  AssistantContext,
  AssistantReplyFacts,
  Explanation,
  ExplanationInput,
  ExtractIntentOptions,
  IntentOutcome,
  IntentSignals,
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
  ASSISTANT_INTENT_PROMPT_ID,
  ASSISTANT_REPLY_PROMPT_ID,
  DEFAULT_GEMINI_MODEL,
  EXPLAIN_PROMPT_ID,
  EXPLAIN_SCHEDULE_PROMPT_ID,
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

/**
 * What an assistant message asks for. With an LLM: structured output
 * (`AssistantIntentLLMSchema`), one repair retry while `budgetMs` allows, then the rule parser
 * as fallback (`fallback_code` says why). Without: the rule parser. Either way the intent is
 * tidied by code and the signals (rule-bypass asks, evening times, fallback windows) are read
 * from the message itself. Ids in the intent are hints only. Never throws.
 */
export function extractIntent(
  message: string,
  ctx: AssistantContext,
  options: ExtractIntentOptions,
): Promise<IntentOutcome> {
  return runIntent(message, ctx, options);
}

/** The assistant's offline rule parser (English, Hinglish, basic Devanagari). Pure. */
export function extractAssistantIntentWithRules(
  message: string,
  ctx: AssistantContext,
): {
  intent: AssistantIntentLLM;
  assumptions: string[];
  signals: IntentSignals;
} {
  return extractIntentWithRules(message, ctx);
}

/** The signals code reads from `message` for an intent of `kind`. Pure. */
export function readIntentSignals(
  message: string,
  ctx: AssistantContext,
  kind: AssistantIntentKind,
): IntentSignals {
  return readSignals(message, ctx, kind);
}

/**
 * The assistant's reply phrased from `facts` only (`assistant_reply.v1`): accepted when its
 * length, numbers and weekdays check out and it claims nothing the facts don't say (no option
 * when there is none, nothing "moved" or "approved"); otherwise `template`. Never throws.
 */
export function phraseAssistantReply(
  facts: AssistantReplyFacts,
  template: string,
  llm: LlmConfig,
  options: { signal?: AbortSignal } = {},
): Promise<Explanation> {
  return phraseReply(facts, template, llm, options);
}

/**
 * Why a session is where it is, phrased from its facts only (`explain_schedule.v1`), with the
 * same checks (a fixed slot is never invented, an unplaced session never called placed);
 * otherwise `template`. Never throws.
 */
export function phraseScheduleExplanation(
  facts: SessionFacts,
  template: string,
  llm: LlmConfig,
  options: { signal?: AbortSignal } = {},
): Promise<Explanation> {
  return phraseSchedule(facts, template, llm, options);
}
