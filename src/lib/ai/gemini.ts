/**
 * Gemini through `@google/genai`: structured JSON output (`responseMimeType` +
 * `responseJsonSchema`) and plain text, temperature 0, bounded by a timeout and an output-token
 * cap. The API key stays inside the SDK client; nothing here logs it.
 */
import { GoogleGenAI } from "@google/genai";

import type { LlmClient } from "./types";

/**
 * Most tokens one call may generate. Every answer we ask for is short (a JSON draft or intent, a
 * few sentences of text), but on thinking models the thinking can count toward this cap too, so
 * it leaves plenty of room; it only stops a runaway answer. A reply cut off by it is an error.
 */
export const MAX_OUTPUT_TOKENS = 8192;

type Request = {
  model: string;
  system: string;
  prompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

/** JSON Schema keywords Gemini's `responseJsonSchema` supports (see `GenerateContentConfig`). */
const SUPPORTED_KEYWORDS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);
const SCHEMA_MAPS = new Set(["properties", "$defs"]);
const SUB_SCHEMAS = new Set([
  "items",
  "prefixItems",
  "anyOf",
  "oneOf",
  "additionalProperties",
]);

/**
 * The schema reduced to the keywords Gemini supports (`$schema`, `maxLength`, … dropped;
 * `exclusiveMinimum` becomes `minimum`; `const: v` becomes `enum: [v]`, so a literal such as
 * the `"accessible"` need keeps its value instead of turning into any string). Zod still
 * validates the full contract afterwards.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (!SUPPORTED_KEYWORDS.has(key)) continue;
    if (SCHEMA_MAPS.has(key) && value && typeof value === "object")
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, sub]) => [name, toGeminiSchema(sub)]),
      );
    else out[key] = SUB_SCHEMAS.has(key) ? toGeminiSchema(value) : value;
  }
  if ("const" in src && out.enum === undefined) out.enum = [src.const];
  const integer = src.type === "integer";
  if (typeof src.exclusiveMinimum === "number" && out.minimum === undefined)
    out.minimum = integer
      ? Math.floor(src.exclusiveMinimum) + 1
      : src.exclusiveMinimum;
  if (typeof src.exclusiveMaximum === "number" && out.maximum === undefined)
    out.maximum = integer
      ? Math.ceil(src.exclusiveMaximum) - 1
      : src.exclusiveMaximum;
  return out;
}

/** The caller's signal (if any) combined with a timeout. */
function abortSignalFor(request: Request): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, request.timeoutMs));
  return request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
}

export function geminiClient(apiKey: string): LlmClient {
  const ai = new GoogleGenAI({ apiKey });

  async function generate(
    request: Request,
    json: { schema: unknown } | null,
  ): Promise<string> {
    const response = await ai.models.generateContent({
      model: request.model,
      contents: request.prompt,
      config: {
        systemInstruction: request.system,
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: abortSignalFor(request),
        httpOptions: { timeout: request.timeoutMs },
        ...(json && {
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(json.schema),
        }),
      },
    });
    // Compared as a string, so the SDK's enum isn't needed here.
    if (String(response.candidates?.[0]?.finishReason) === "MAX_TOKENS")
      throw new Error("Gemini stopped at the output-token limit");
    const text = response.text;
    if (!text?.trim()) throw new Error("Gemini returned an empty response");
    return text;
  }

  return {
    generateJson: ({ jsonSchema, ...request }) =>
      generate(request, { schema: jsonSchema }),
    generateText: (request) => generate(request, null),
  };
}
