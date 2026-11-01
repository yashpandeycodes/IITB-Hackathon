/**
 * The Gemini adapter with the SDK mocked: request shape (structured output, temperature 0,
 * output-token cap, timeout, abort signal), empty and cut-off responses, and the schema reduction.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { BookingDraftLLMSchema } from "@/lib/contracts";

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn(),
  options: [] as unknown[],
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.generateContent };
    constructor(options: unknown) {
      sdk.options.push(options);
    }
  },
}));

const { createGeminiClient } = await import("./index");
const { MAX_OUTPUT_TOKENS, toGeminiSchema } = await import("./gemini");

beforeEach(() => {
  sdk.generateContent.mockReset();
  sdk.options.length = 0;
});

describe("createGeminiClient", () => {
  it("generateJson asks for JSON with the schema, temperature 0 and a timeout", async () => {
    sdk.generateContent.mockResolvedValue({ text: '{"ok":true}' });
    const client = createGeminiClient("test-key");
    const schema = z.toJSONSchema(BookingDraftLLMSchema);
    const caller = new AbortController();

    const text = await client.generateJson({
      model: "gemini-test",
      system: "SYSTEM",
      prompt: "PROMPT",
      jsonSchema: schema,
      timeoutMs: 1234,
      signal: caller.signal,
    });

    expect(text).toBe('{"ok":true}');
    expect(sdk.options).toEqual([{ apiKey: "test-key" }]);
    const [request] = sdk.generateContent.mock.calls[0];
    expect(request).toMatchObject({
      model: "gemini-test",
      contents: "PROMPT",
      config: {
        systemInstruction: "SYSTEM",
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        httpOptions: { timeout: 1234 },
      },
    });
    expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(request.config.responseJsonSchema).toEqual(toGeminiSchema(schema));
    caller.abort();
    expect(request.config.abortSignal.aborted).toBe(true);
  });

  it("generateText sends no JSON config", async () => {
    sdk.generateContent.mockResolvedValue({ text: "Plain answer." });
    const client = createGeminiClient("k");
    await expect(
      client.generateText({
        model: "m",
        system: "s",
        prompt: "p",
        timeoutMs: 500,
      }),
    ).resolves.toBe("Plain answer.");
    const [request] = sdk.generateContent.mock.calls[0];
    expect(request.config).not.toHaveProperty("responseMimeType");
    expect(request.config).not.toHaveProperty("responseJsonSchema");
    expect(request.config.temperature).toBe(0);
    expect(request.config.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it("throws on a reply cut off at the output-token limit", async () => {
    sdk.generateContent.mockResolvedValue({
      text: '{"title": "Half a dra',
      candidates: [{ finishReason: "MAX_TOKENS" }],
    });
    const client = createGeminiClient("k");
    await expect(
      client.generateText({
        model: "m",
        system: "s",
        prompt: "p",
        timeoutMs: 500,
      }),
    ).rejects.toThrow(/output-token limit/);
    sdk.generateContent.mockResolvedValue({
      text: "Fine.",
      candidates: [{ finishReason: "STOP" }],
    });
    await expect(
      client.generateText({
        model: "m",
        system: "s",
        prompt: "p",
        timeoutMs: 500,
      }),
    ).resolves.toBe("Fine.");
  });

  it("throws on an empty response", async () => {
    sdk.generateContent.mockResolvedValue({ text: "  " });
    const client = createGeminiClient("k");
    await expect(
      client.generateText({
        model: "m",
        system: "s",
        prompt: "p",
        timeoutMs: 500,
      }),
    ).rejects.toThrow(/empty response/);
  });
});

describe("toGeminiSchema", () => {
  it("keeps only supported keywords and turns exclusiveMinimum into minimum", () => {
    const reduced = toGeminiSchema(z.toJSONSchema(BookingDraftLLMSchema)) as {
      properties: Record<string, { anyOf?: Record<string, unknown>[] }>;
      required: string[];
      additionalProperties: boolean;
    };
    const text = JSON.stringify(reduced);
    expect(text).not.toContain("$schema");
    expect(text).not.toContain("maxLength");
    expect(text).not.toContain("exclusiveMinimum");
    expect(reduced.additionalProperties).toBe(false);
    expect(reduced.required).toContain("windows");
    const attendance = reduced.properties.attendance.anyOf?.find(
      (s) => s.type === "integer",
    );
    expect(attendance?.minimum).toBe(1);
  });

  it("turns const into a one-value enum, so no need is a bare string", () => {
    const reduced = toGeminiSchema(z.toJSONSchema(BookingDraftLLMSchema)) as {
      properties: {
        needs: { items: { anyOf?: Record<string, unknown>[] } & object };
      };
    };
    const items = reduced.properties.needs.items;
    const variants = items.anyOf ?? [items as Record<string, unknown>];
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      expect(variant).toHaveProperty("enum");
      expect(Array.isArray(variant.enum)).toBe(true);
    }
    const values = variants.flatMap((v) => v.enum as string[]);
    expect(values).toContain("accessible");
    expect(values).toContain("pa_system");
    expect(JSON.stringify(reduced)).not.toContain('"const"');
    expect(toGeminiSchema({ type: "string", const: "x" })).toEqual({
      type: "string",
      enum: ["x"],
    });
  });
});
