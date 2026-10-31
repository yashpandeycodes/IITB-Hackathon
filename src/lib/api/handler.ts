import { unstable_rethrow } from "next/navigation";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ApiErr } from "@/lib/contracts/api";
import { ApiError, validationError } from "@/lib/errors";
import { fail } from "./response";

/** Default cap for JSON request bodies. Larger uploads (e.g. dataset import) pass `maxBytes`. */
export const MAX_JSON_BODY_BYTES = 1_000_000;

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Maps any thrown value onto the error envelope. Unknown errors are logged, never exposed. */
export function toErrorResponse(err: unknown): NextResponse<ApiErr> {
  if (err instanceof ApiError) {
    if (err.status >= 500)
      console.error(`[api] ${err.code}: ${err.message}`, err.cause ?? "");
    // Errors such as 429 may carry response headers (e.g. `Retry-After`).
    const { headers } = err as { headers?: Record<string, string> };
    return fail(
      err.code,
      err.message,
      err.details,
      headers ? { headers } : undefined,
    );
  }
  if (err instanceof z.core.$ZodError) {
    // Client input is parsed by parseJsonBody/parseSearchParams and arrives as an ApiError.
    // A bare ZodError is a server-side contract failure (stored data, exports, LLM output).
    console.error(
      "[api] Server-side schema validation failed",
      z.prettifyError(err),
    );
    return fail("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE);
  }
  console.error("[api] Unhandled error", err);
  return fail("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE);
}

/**
 * Wraps a Route Handler so every failure becomes an `ApiErr` envelope.
 * For dynamic routes, type the context as `{ params: Promise<{ id: string }> }` (Next's
 * `RouteContext` global only exists after `next dev` / `next build`, and CI typechecks first).
 */
export function withHandler<C = unknown>(
  fn: (request: NextRequest, context: C) => Response | Promise<Response>,
): (request: NextRequest, context: C) => Promise<Response> {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (err) {
      // Let Next.js control-flow errors (redirect(), notFound(), dynamic bailouts) through.
      unstable_rethrow(err);
      return toErrorResponse(err);
    }
  };
}

async function readBodyText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const tooLarge = () =>
    validationError("Request body is too large.", { max_bytes: maxBytes });

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Reads, size-limits, JSON-parses and validates a request body.
 * Throws `VALIDATION_ERROR` for a non-JSON content type and for oversize, empty, malformed
 * or schema-invalid bodies.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  options: { maxBytes?: number } = {},
): Promise<z.output<S>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType.trim())) {
    throw validationError("Content-Type must be application/json.");
  }
  const text = await readBodyText(
    request,
    options.maxBytes ?? MAX_JSON_BODY_BYTES,
  );
  if (text.trim() === "")
    throw validationError("Request body must be a JSON value.");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw validationError("Request body is not valid JSON.");
  }

  const result = await schema.safeParseAsync(raw);
  if (!result.success) {
    throw validationError(
      "The request body is invalid.",
      z.flattenError(result.error),
    );
  }
  return result.data;
}

/**
 * Validates query parameters. A key that appears once becomes a string; a repeated key
 * (`?needs=stage&needs=ac`) becomes a string array. Use `z.coerce` for numbers.
 */
export function parseSearchParams<S extends z.ZodType>(
  source: URL | URLSearchParams | string,
  schema: S,
): z.output<S> {
  const params =
    source instanceof URLSearchParams
      ? source
      : source instanceof URL
        ? source.searchParams
        : new URL(source, "http://localhost").searchParams;

  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length === 1 ? values[0] : values;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw validationError(
      "The query parameters are invalid.",
      z.flattenError(result.error),
    );
  }
  return result.data;
}
