import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { ErrorCode } from "@/lib/contracts/api";
import { parseJsonBody } from "@/lib/api/handler";
import { ApiError, isApiError } from "@/lib/errors";

/**
 * Response helpers for the account routes the CIT Nexus forms call. Those forms render
 * `data.error` as a string, so these routes answer errors as
 * `{ ok: false, error: string, code, details? }` instead of the standard envelope.
 */

/** An `ApiError` that may also carry response headers (e.g. `Retry-After`). */
export class AuthError extends ApiError {
  constructor(
    code: ErrorCode,
    message: string,
    details?: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(code, message, details);
    this.name = "AuthError";
  }
}

export function minutes(seconds: number): string {
  const n = Math.max(1, Math.ceil(seconds / 60));
  return n === 1 ? "1 minute" : `${n} minutes`;
}

/** 429 `RATE_LIMITED` with `Retry-After`. */
export function rateLimited(message: string, retryAfterSeconds: number) {
  return new AuthError(
    "RATE_LIMITED",
    message,
    { retry_after_seconds: retryAfterSeconds },
    { "Retry-After": String(retryAfterSeconds) },
  );
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function legacyJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function legacyError(err: ApiError) {
  const headers = err instanceof AuthError ? err.headers : {};
  return NextResponse.json(
    {
      ok: false,
      error: err.message,
      code: err.code,
      ...(err.details === undefined ? {} : { details: err.details }),
    },
    { status: err.status, headers: { ...NO_STORE, ...headers } },
  );
}

/** Like `withHandler`, but errors come back in the forms' `{ error: string }` shape. */
export function withLegacyHandler(
  fn: (request: NextRequest) => Promise<Response>,
): (request: NextRequest) => Promise<Response> {
  return async (request) => {
    try {
      return await fn(request);
    } catch (err) {
      unstable_rethrow(err);
      if (isApiError(err)) {
        if (err.status >= 500) {
          console.error(`[auth] ${err.code}: ${err.message}`);
        }
        return legacyError(err);
      }
      console.error("[auth] Unhandled error", err);
      return legacyError(
        new ApiError(
          "INTERNAL_ERROR",
          "Something went wrong. Please try again.",
        ),
      );
    }
  };
}

/**
 * Reads a size-limited JSON body and validates it. The first issue's message becomes the
 * error text, because the forms show a single line.
 */
export async function parseFormBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  const raw = await parseJsonBody(request, z.unknown(), { maxBytes: 16_384 });
  const result = await schema.safeParseAsync(raw);
  if (!result.success) {
    throw new AuthError(
      "VALIDATION_ERROR",
      result.error.issues[0]?.message ?? "The request is invalid.",
      z.flattenError(result.error),
    );
  }
  return result.data;
}

/**
 * Client address for rate-limit keys. `X-Forwarded-For` is only trusted on Vercel, whose edge
 * sets it; anywhere else a client could forge it, so every caller shares one local key.
 */
export function clientIp(request: Request): string {
  if (!process.env.VERCEL) return "local";
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}
