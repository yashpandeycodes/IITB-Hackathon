/**
 * Typed fetch wrapper for the UI (docs/frontend.md §9). Client-safe: imports only
 * the API contract. Every route returns the `{ ok, data | error }` envelope from
 * `@/lib/contracts/api`; this module validates it and either returns `data`
 * (parsed with the caller's schema) or throws an `ApiClientError`.
 */
import { z } from "zod";

import {
  apiResponseSchema,
  type ApiResponse,
  type ErrorCode,
} from "@/lib/contracts/api";

export type ApiClientErrorCode = ErrorCode | "NETWORK_ERROR" | "BAD_RESPONSE";

export class ApiClientError extends Error {
  readonly code: ApiClientErrorCode;
  /** HTTP status; `0` when the request never reached the server. */
  readonly status: number;
  readonly details?: unknown;

  constructor(args: {
    code: ApiClientErrorCode;
    message: string;
    status: number;
    details?: unknown;
    cause?: unknown;
  }) {
    super(
      args.message,
      args.cause === undefined ? undefined : { cause: args.cause },
    );
    this.name = "ApiClientError";
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** `fetch` options minus what the helpers set themselves. */
export type ApiRequestInit = Omit<RequestInit, "method" | "body">;

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function request<T extends z.ZodType>(
  method: Method,
  path: string,
  dataSchema: T,
  body: unknown,
  init: ApiRequestInit | undefined,
): Promise<z.output<T>> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const hasBody = body !== undefined;
  if (hasBody && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // Cancellation (e.g. TanStack Query aborting a stale request) is not a failure.
    if (isAbortError(error)) throw error;
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      message: "Can't reach the server. Check your connection and try again.",
      status: 0,
      cause: error,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message: `The server sent an unreadable response (HTTP ${response.status}).`,
      status: response.status,
      cause: error,
    });
  }

  const parsed = apiResponseSchema(dataSchema).safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message: `The server sent an unexpected response (HTTP ${response.status}).`,
      status: response.status,
      details: parsed.error.issues,
    });
  }

  // The generic union doesn't narrow on `ok`; the contract type says the same thing.
  const envelope = parsed.data as ApiResponse<z.output<T>>;
  if (!envelope.ok) {
    throw new ApiClientError({
      code: envelope.error.code,
      message: envelope.error.message,
      status: response.status,
      details: envelope.error.details,
    });
  }
  return envelope.data;
}

export function apiGet<T extends z.ZodType>(
  path: string,
  dataSchema: T,
  init?: ApiRequestInit,
): Promise<z.output<T>> {
  return request("GET", path, dataSchema, undefined, init);
}

export function apiPost<T extends z.ZodType>(
  path: string,
  body: unknown,
  dataSchema: T,
  init?: ApiRequestInit,
): Promise<z.output<T>> {
  return request("POST", path, dataSchema, body, init);
}

export function apiPatch<T extends z.ZodType>(
  path: string,
  body: unknown,
  dataSchema: T,
  init?: ApiRequestInit,
): Promise<z.output<T>> {
  return request("PATCH", path, dataSchema, body, init);
}

export function apiDelete<T extends z.ZodType>(
  path: string,
  dataSchema: T,
  init?: ApiRequestInit,
): Promise<z.output<T>> {
  return request("DELETE", path, dataSchema, undefined, init);
}


import {
  GenerateTimetableResultSchema,
  SolverProgressSchema,
  type GenerateTimetableRequest,
  type GenerateTimetableResult,
  type SolverProgress,
} from "@/lib/contracts";

export async function streamTimetableGeneration(
  body: GenerateTimetableRequest,
  onProgress?: (progress: SolverProgress) => void,
  init?: { signal?: AbortSignal },
): Promise<GenerateTimetableResult> {
  let response: Response;
  try {
    response = await fetch("/api/timetable/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      credentials: "same-origin",
      body: JSON.stringify(body),
      signal: init?.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      message: "Can't reach the server. Check your connection and try again.",
      status: 0,
      cause: error,
    });
  }

  if (!response.ok) {
    let errorJson: unknown;
    try {
      errorJson = await response.json();
    } catch {
      throw new ApiClientError({
        code: "BAD_RESPONSE",
        message: `The server sent an unreadable response (HTTP ${response.status}).`,
        status: response.status,
      });
    }

    const parsed = apiResponseSchema(z.unknown()).safeParse(errorJson);
    if (parsed.success && !parsed.data.ok) {
      throw new ApiClientError({
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        status: response.status,
        details: parsed.data.error.details,
      });
    }

    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message: `Failed to generate timetable (HTTP ${response.status}).`,
      status: response.status,
    });
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message: "No readable response stream received.",
      status: response.status,
    });
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: GenerateTimetableResult | undefined;
  let streamError: ApiClientError | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;
        let eventType = "message";
        let dataText = "";

        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataText = line.slice(5).trim();
          }
        }

        if (!dataText) continue;

        let payload: unknown;
        try {
          payload = JSON.parse(dataText);
        } catch {
          continue;
        }

        if (eventType === "progress") {
          const parsedProgress = SolverProgressSchema.safeParse(payload);
          if (parsedProgress.success && onProgress) {
            onProgress(parsedProgress.data);
          }
        } else if (eventType === "result") {
          const parsedResult = GenerateTimetableResultSchema.safeParse(payload);
          if (parsedResult.success) {
            finalResult = parsedResult.data;
          } else {
            finalResult = payload as GenerateTimetableResult;
          }
        } else if (eventType === "error") {
          const errPayload = payload as {
            code?: ApiClientErrorCode;
            message?: string;
            details?: unknown;
          };
          streamError = new ApiClientError({
            code: errPayload.code ?? "BAD_RESPONSE",
            message: errPayload.message ?? "Generation failed",
            status: 400,
            details: errPayload.details,
          });
        }
      }
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw error;
  }

  if (streamError) {
    throw streamError;
  }

  if (!finalResult) {
    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message: "The generation stream ended without returning a result.",
      status: response.status,
    });
  }

  return finalResult;
}
