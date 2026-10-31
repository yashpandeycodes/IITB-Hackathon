/**
 * Typed fetch wrapper for the UI (docs/frontend.md §9). Client-safe: imports only
 * the API contract. Every route returns the `{ ok, data | error }` envelope from
 * `@/lib/contracts/api`; this module validates it and either returns `data`
 * (parsed with the caller's schema) or throws an `ApiClientError`.
 */
import type { z } from "zod";

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
