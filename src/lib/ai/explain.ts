/**
 * Explanations phrased by the LLM from engine facts only. The output is accepted only when it is
 * a sensible length, every number in it appears in the reason or the facts, and it doesn't
 * contradict the decision's status; anything else (no LLM, an error, a timeout, an invented
 * number, a reversed verdict) returns the engine's template text. Decisions that carry a
 * person's free text (an approver's comment, a cancellation note) are never sent to the model.
 * Never throws.
 */
import type { DecisionStatus, ReasonCode } from "@/lib/contracts";

import { describeError, isTimeout, withTimeout } from "./call";
import { EXPLAIN_PROMPT_ID } from "./constants";
import { buildExplainPrompt, readPrompt } from "./prompts";
import type { Explanation, ExplanationInput, LlmConfig } from "./types";

const MIN_CHARS = 20;
const MAX_CHARS = 600;

/** Codes whose reason or facts hold a person's free text: always the template, no model call. */
export const TEMPLATE_ONLY_CODES: ReadonlySet<ReasonCode> = new Set([
  "REJ_BY_APPROVER",
  "REJ_CANCELLED",
]);

/** Numbers in `text`, normalised ("08" and "8" are the same number). */
export function numbersIn(text: string): Set<string> {
  return new Set(
    (text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))),
  );
}

/** The request itself as the subject ("your request", "the booking", "you", "it"). */
const SUBJECT = String.raw`(?:your\s+(?:request|booking|event|reservation|application|slot)|the\s+(?:request|booking|reservation)|this\s+(?:request|booking)|you|it)`;
const VERB = String.raw`(?:is|was|has\s+been|have\s+been|had\s+been|are|were|got|gets|will\s+be|'s|'re)`;
const ADVERB = String.raw`(?:\s+(?:now|successfully|fully|already|been))*`;

/** A negation shortly before a word ("could not be approved", "wasn't rejected"). */
export const NEGATION =
  /\b(?:not|never|cannot|no longer|unable to|without)\b|n't\b|\bnot\s+been\b/i;

/** The request stated as `words` ("your request has been approved", "you're booked"). */
function claim(words: string): RegExp {
  return new RegExp(
    String.raw`\b${SUBJECT}\s*${VERB}${ADVERB}\s+(?:${words})\b|\b(?:${words})\s+(?:exactly\s+)?as\s+requested\b|\bsuccessfully\s+(?:${words})\b`,
    "i",
  );
}

/** A word used without a negation in the same clause. */
export function plainUse(text: string, word: RegExp): string | null {
  for (const m of text.matchAll(word)) {
    const clause = text.slice(Math.max(0, m.index - 40), m.index);
    const tail = clause.split(/[.;:!?,]/).pop() ?? "";
    if (!NEGATION.test(tail)) return m[0];
  }
  return null;
}

type StatusRule = {
  /** Always a contradiction ("your request is approved" for a rejection). */
  claims: RegExp[];
  /** A contradiction unless negated in its clause. */
  words: RegExp;
};

const STATUS_RULES: Record<DecisionStatus, StatusRule> = {
  rejected: {
    claims: [
      claim("approved|confirmed|granted|booked|accepted"),
      /\byou(?:'re|\s+are)\s+(?:all\s+)?set\b/i,
    ],
    words: /\b(?:pre-?)?(?:approved|confirmed|granted)\b/gi,
  },
  approved: {
    claims: [claim("rejected|declined|denied|refused|turned\\s+down")],
    words: /\b(?:rejected|declined|denied)\b/gi,
  },
  alternative_offered: {
    claims: [
      claim("rejected|declined|denied|refused"),
      /\b(?:approved|confirmed|granted)\s+(?:exactly\s+)?as\s+requested\b/i,
      claim("approved|confirmed"),
    ],
    words: /\b(?:rejected|denied)\b/gi,
  },
};

/** Why `text` contradicts `status`, or null when it doesn't. */
export function statusContradiction(
  text: string,
  status: DecisionStatus,
): string | null {
  const rule = STATUS_RULES[status];
  if (!rule) return null;
  for (const re of rule.claims) {
    const m = re.exec(text);
    if (m && !NEGATION.test(m[0])) return `says "${m[0]}"`;
  }
  const word = plainUse(text, rule.words);
  return word ? `says "${word}"` : null;
}

/** Why the model's text can't be used, or null when it can. */
function rejectReason(text: string, input: ExplanationInput): string | null {
  if (text.length < MIN_CHARS) return `too short (${text.length} characters)`;
  if (text.length > MAX_CHARS) return `too long (${text.length} characters)`;
  const allowed = numbersIn(`${input.reason} ${JSON.stringify(input.facts)}`);
  for (const n of numbersIn(text))
    if (!allowed.has(n)) return `number ${n} is not in the reason or facts`;
  const contradiction = statusContradiction(text, input.status);
  return contradiction
    ? `contradicts status ${input.status}: ${contradiction}`
    : null;
}

/** Facts that carry an approver's or canceller's own words. */
function holdsFreeText(facts: Record<string, unknown>): boolean {
  return "comment" in facts || "cancelled" in facts;
}

export async function explainDecision(
  input: ExplanationInput,
  llm: LlmConfig,
): Promise<Explanation> {
  const started = performance.now();
  const elapsed = () => Math.max(0, Math.round(performance.now() - started));
  const template = (
    extra: Partial<
      Pick<Explanation, "model" | "raw_output" | "fallback_reason">
    > = {},
  ): Explanation => ({
    text: input.reason,
    source: "template",
    model: null,
    raw_output: null,
    fallback_reason: null,
    ...extra,
    latency_ms: elapsed(),
  });
  if (
    !llm ||
    TEMPLATE_ONLY_CODES.has(input.reason_code) ||
    holdsFreeText(input.facts)
  )
    return template();

  let raw: string | null = null;
  try {
    const system = readPrompt(EXPLAIN_PROMPT_ID);
    const prompt = buildExplainPrompt(input);
    const reply: unknown = await withTimeout(
      (signal) =>
        llm.client.generateText({
          model: llm.model,
          system,
          prompt,
          timeoutMs: llm.timeoutMs,
          signal,
        }),
      llm.timeoutMs,
    );
    raw = typeof reply === "string" ? reply : null;
    const text = raw?.trim() ?? "";
    const problem = raw === null ? "not text" : rejectReason(text, input);
    if (problem)
      return template({
        model: llm.model,
        raw_output: raw,
        fallback_reason: problem,
      });
    return {
      text,
      source: "llm",
      model: llm.model,
      raw_output: raw,
      latency_ms: elapsed(),
      fallback_reason: null,
    };
  } catch (err) {
    return template({
      model: llm.model,
      raw_output: raw,
      fallback_reason: isTimeout(err)
        ? "timeout"
        : `llm_error: ${describeError(err)}`,
    });
  }
}
