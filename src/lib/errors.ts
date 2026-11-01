import { ERROR_HTTP_STATUS, type ErrorCode } from "@/lib/contracts/api";

/**
 * A failure that maps 1:1 onto the API error envelope (docs/architecture.md §4.5).
 * Framework-free so services can throw it; `withHandler` turns it into the response.
 * `message` is shown to users, so keep it free of internals.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_HTTP_STATUS[code];
    this.details = details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export const validationError = (
  message = "The request is invalid.",
  details?: unknown,
) => new ApiError("VALIDATION_ERROR", message, details);

export const unauthenticated = (message = "Please sign in to continue.") =>
  new ApiError("UNAUTHENTICATED", message);

export const forbidden = (
  message = "You don't have permission to do that.",
  details?: unknown,
) => new ApiError("FORBIDDEN", message, details);

export const selfApproval = (message = "You can't approve your own request.") =>
  new ApiError("SELF_APPROVAL", message);

/** `details` should be the engine's `Violation[]`. */
export const hardConstraint = (message: string, details?: unknown) =>
  new ApiError("HARD_CONSTRAINT", message, details);

/**
 * `409 CONFLICT`: the request can't be done in the current state (no dataset loaded, already
 * decided, the lock is busy, …). `details` says what is in the way, when useful.
 */
export const conflict = (message: string, details?: unknown) =>
  new ApiError("CONFLICT", message, details);

/** `details` should be the conflict report. */
export const infeasible = (message: string, details?: unknown) =>
  new ApiError("INFEASIBLE", message, details);

export const notFound = (message = "Not found.", details?: unknown) =>
  new ApiError("NOT_FOUND", message, details);

export const staleVersion = (
  message = "This proposal was built on a timetable that is no longer active.",
  details?: unknown,
) => new ApiError("STALE_VERSION", message, details);

export const llmUnavailable = (
  message = "The AI assistant is unavailable right now. Use the manual form instead.",
  details?: unknown,
) => new ApiError("LLM_UNAVAILABLE", message, details);

export const internalError = (
  message = "Something went wrong. Please try again.",
) => new ApiError("INTERNAL_ERROR", message);
