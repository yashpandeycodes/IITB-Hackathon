/**
 * API envelope and error codes — frozen contract shared by Route Handlers and the UI client.
 * See docs/architecture.md §4.5.
 */
import { z } from "zod";

export const ErrorCode = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "SELF_APPROVAL",
  "HARD_CONSTRAINT",
  "INFEASIBLE",
  "NOT_FOUND",
  "STALE_VERSION",
  "LLM_UNAVAILABLE",
  "INTERNAL_ERROR",
  "RATE_LIMITED",
  "EMAIL_TAKEN",
  "MAIL_UNAVAILABLE",
  "CONFLICT",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  SELF_APPROVAL: 403,
  NOT_FOUND: 404,
  HARD_CONSTRAINT: 409,
  STALE_VERSION: 409,
  INFEASIBLE: 422,
  INTERNAL_ERROR: 500,
  LLM_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  EMAIL_TAKEN: 409,
  MAIL_UNAVAILABLE: 503,
  CONFLICT: 409,
};

/**
 * One problem with a field of a request or an uploaded file, as `400 VALIDATION_ERROR` `details`
 * list them. `path` says where: `changes[0].faculty_id` and `placements[1].room_id` for a change
 * request, `sessions.12.faculty_id` for a dataset file, "" for the body as a whole. `message`
 * says what is wrong.
 */
export const PathIssueSchema = z.strictObject({
  path: z.string(),
  message: z.string(),
});
export type PathIssue = z.infer<typeof PathIssueSchema>;

export const ApiErrorBody = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: ApiErrorBody };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

/** Build a Zod schema for an envelope whose `data` matches `data`. */
export function apiResponseSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ApiErrorBody }),
  ]);
}
