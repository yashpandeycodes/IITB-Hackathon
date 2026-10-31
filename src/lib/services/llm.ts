import "server-only";
import type { Db } from "mongodb";
import {
  createGeminiClient,
  DEFAULT_GEMINI_MODEL,
  type LlmClient,
  type LlmConfig,
} from "@/lib/ai";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { getSettings } from "./settings";

/**
 * Whether the LLM is used, and how. On only when all three agree: the `LLM_ENABLED` env switch,
 * the admin's `settings.llm_enabled` toggle, and a `GEMINI_API_KEY`. Otherwise `null`: callers
 * fall back to the rule parser and template text, which always work.
 */
export type LlmPurpose = "fast" | "smart";

let cached: { key: string; client: LlmClient } | null = null;

function clientFor(apiKey: string): LlmClient {
  if (cached?.key !== apiKey) {
    cached = { key: apiKey, client: createGeminiClient(apiKey) };
  }
  return cached.client;
}

/**
 * The LLM config the environment allows for `purpose` (parsing: fast; explanations: smart),
 * ignoring the admin's settings toggle; null when `LLM_ENABLED` is off or no key is set. Also
 * used by `scripts/ai-eval.ts`, so the model default and timeout live in one place.
 */
export function llmConfigFromEnv(
  env: Pick<
    ServerEnv,
    | "LLM_ENABLED"
    | "GEMINI_API_KEY"
    | "GEMINI_MODEL_FAST"
    | "GEMINI_MODEL_SMART"
    | "LLM_TIMEOUT_MS"
  >,
  purpose: LlmPurpose = "fast",
): LlmConfig {
  if (!env.LLM_ENABLED || !env.GEMINI_API_KEY) return null;
  const model =
    (purpose === "smart" ? env.GEMINI_MODEL_SMART : env.GEMINI_MODEL_FAST) ??
    DEFAULT_GEMINI_MODEL;
  return {
    client: clientFor(env.GEMINI_API_KEY),
    model,
    timeoutMs: env.LLM_TIMEOUT_MS,
  };
}

/** The LLM config for `purpose`, or null when AI is off (env, settings toggle or key). */
export async function getLlmConfig(
  db: Db,
  purpose: LlmPurpose = "fast",
): Promise<LlmConfig> {
  const config = llmConfigFromEnv(getServerEnv(), purpose);
  if (!config) return null;
  const settings = await getSettings(db);
  return settings.llm_enabled ? config : null;
}
