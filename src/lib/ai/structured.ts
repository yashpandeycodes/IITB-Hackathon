/**
 * One structured-output extraction with a bounded repair: the model's JSON is checked against a
 * Zod schema, and an output that fails gets one repair retry (the validation error and the
 * previous output appended to the prompt) while the time budget allows. Shared by the booking
 * parser and the assistant's intent extraction. Every failure comes back as a fallback code
 * (`timeout`, `invalid_output`, `llm_error`) plus a detailed, key-redacted reason for the logs;
 * nothing here throws.
 */
import { z } from "zod";

import type { FallbackCode } from "@/lib/contracts";

import {
  LlmAbortedError,
  describeError,
  isTimeout,
  redactSecrets,
  withTimeout,
} from "./call";
import { buildRepairPrompt } from "./prompts";
import type { LlmConfig } from "./types";

/** The repair retry needs at least this long, and at least this share of the call timeout. */
export const MIN_REPAIR_MS = 1500;
export const MIN_REPAIR_SHARE = 0.25;

export type Validation<T> =
  { ok: true; value: T } | { ok: false; error: string };

/** JSON text (optionally in a ```json fence) → a value of `schema`, or the error. */
export function validateJson<S extends z.ZodType>(
  schema: S,
  raw: string,
): Validation<z.output<S>> {
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
  const result = schema.safeParse(data);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: z.prettifyError(result.error).slice(0, 1200) };
}

export type StructuredAttempt<T> =
  | { ok: true; value: T; raw: string; repaired: boolean }
  | { ok: false; code: FallbackCode; reason: string; raw: string | null };

/** `code: detail`, API keys redacted, bounded (for `ai_logs`, never for the response). */
export function fallbackReason(code: FallbackCode, detail: string): string {
  return redactSecrets(`${code}: ${detail}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function failure<T>(err: unknown, raw: string | null): StructuredAttempt<T> {
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
 * Structured output, then one repair retry if the output fails `validate`, all within
 * `budgetMs` (default: the call timeout). The repair is skipped when too little of the budget
 * is left for it, and the caller's `signal` aborts either call.
 */
export async function generateStructured<T>(input: {
  llm: NonNullable<LlmConfig>;
  /** Build the system and user prompts (reading a prompt file may throw: an `llm_error`). */
  system: () => string;
  prompt: () => string;
  jsonSchema: unknown;
  validate: (raw: string) => Validation<T>;
  budgetMs?: number;
  signal?: AbortSignal;
}): Promise<StructuredAttempt<T>> {
  const { llm } = input;
  const budget = Math.max(1, Math.floor(input.budgetMs ?? llm.timeoutMs));
  const started = performance.now();
  const left = () => Math.floor(budget - (performance.now() - started));
  let raw: string | null = null;
  try {
    const system = input.system();
    const prompt = input.prompt();
    const call = (userPrompt: string, ms: number) =>
      withTimeout(
        (signal) =>
          llm.client.generateJson({
            model: llm.model,
            system,
            prompt: userPrompt,
            jsonSchema: input.jsonSchema,
            timeoutMs: ms,
            signal,
          }),
        ms,
        input.signal,
      );

    raw = await call(prompt, Math.min(llm.timeoutMs, budget));
    const first = input.validate(raw);
    if (first.ok) return { ok: true, value: first.value, raw, repaired: false };

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
    const second = input.validate(raw);
    if (second.ok)
      return { ok: true, value: second.value, raw, repaired: true };
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
