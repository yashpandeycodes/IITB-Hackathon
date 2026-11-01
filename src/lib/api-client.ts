/**
 * Typed fetch wrapper for the UI (docs/frontend.md §9). Client-safe: imports only
 * the API contracts and zod. Every route returns the `{ ok, data | error }` envelope from
 * `@/lib/contracts/api`; this module validates it and either returns `data`
 * (parsed with the caller's schema) or throws an `ApiClientError`.
 *
 * Also here: `postEventStream` / `streamTimetableGeneration` for the live solver progress
 * stream (`POST /api/timetable/generate` with `Accept: text/event-stream`); typed helpers for
 * change requests (`listChanges`, `getChange`, `proposeChange`, `previewChange`,
 * `approveChange`, `rejectChange`, `placeManually`), the assistant (`askAssistant`) and
 * explanations (`explain`); and `EXPORT_SCHEDULE_URL` / `EXPORT_SCHEDULE_AFTER_URL` /
 * `EXPORT_DISRUPTION_URL` / `canExport` for the export downloads.
 */
import { z } from "zod";

import {
  ApiErrorBody,
  ERROR_HTTP_STATUS,
  apiResponseSchema,
  type ApiResponse,
  type ErrorCode,
} from "@/lib/contracts/api";
import {
  AssistantReplySchema,
  type AssistantReply,
  type AssistantRequest,
} from "@/lib/contracts/assistant";
import {
  ChangeApplyResultSchema,
  ChangePreviewSchema,
  ChangeRequestSchema,
  type ChangeApplyResult,
  type ChangeDecisionRequest,
  type ChangeListQuery,
  type ChangePreview,
  type ChangeProposalRequestInput,
  type ChangeRequest,
  type ManualPlacementRequestSchema,
} from "@/lib/contracts/change";
import {
  ExplainResultSchema,
  type ExplainRequest,
  type ExplainResult,
} from "@/lib/contracts/explain";
import type { ValidateQuery } from "@/lib/contracts/schedule";
import {
  GenerateTimetableResultSchema,
  SolverProgressSchema,
  type GenerateTimetableRequestSchema,
  type GenerateTimetableResult,
  type SolverProgress,
} from "@/lib/contracts/timetable";
import {
  ValidatorReportSchema,
  type ValidatorReport,
} from "@/lib/contracts/violation";

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

/** Rejects with the signal's reason (what `fetch` itself rejects with) once it has aborted. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw (
    signal.reason ??
    new DOMException("The operation was aborted.", "AbortError")
  );
}

/** `fetch`, with transport failures turned into `NETWORK_ERROR`. Aborts are rethrown untouched. */
async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch (error) {
    // Cancellation (e.g. TanStack Query aborting a stale request) is not a failure. `fetch`
    // rejects with the signal's reason, which may be any value, not only an `AbortError`.
    if (init.signal?.aborted) throw init.signal.reason ?? error;
    if (isAbortError(error)) throw error;
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      message: "Can't reach the server. Check your connection and try again.",
      status: 0,
      cause: error,
    });
  }
}

/** `Retry-After` as seconds (it may be a number of seconds or an HTTP date). */
function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * Adds `retry_after_seconds` from the `Retry-After` header to object (or missing) `details`.
 * A value the server already put in `details` wins.
 */
function withRetryAfter(details: unknown, response: Response): unknown {
  const seconds = retryAfterSeconds(response);
  if (seconds === undefined) return details;
  if (details === undefined) return { retry_after_seconds: seconds };
  if (
    typeof details === "object" &&
    details !== null &&
    !Array.isArray(details)
  )
    return { retry_after_seconds: seconds, ...details };
  return details;
}

/** Reads and validates the JSON envelope; returns `data` or throws `ApiClientError`. */
async function readEnvelope<T extends z.ZodType>(
  response: Response,
  dataSchema: T,
): Promise<z.output<T>> {
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
      details: withRetryAfter(envelope.error.details, response),
    });
  }
  return envelope.data;
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

  const response = await send(path, {
    credentials: "same-origin",
    ...init,
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  return readEnvelope(response, dataSchema);
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

// ------------------------------------------------------------------------- server-sent events

type SseFrame = { event: string; data: string };

const LF = 0x0a;
const CR = 0x0d;

/**
 * Largest event (pending line plus collected `data:`) the parser holds: far above a real
 * generate `result` (tens of KB), so only a broken stream hits it (`BAD_RESPONSE`).
 */
const MAX_SSE_FRAME_CHARS = 8 * 1024 * 1024;

/**
 * Incremental `text/event-stream` parser (the WHATWG rules `EventSource` uses, minus `id` and
 * `retry`). Lines may end in LF, CRLF or CR, even when a CRLF is split across chunks. A frame is
 * dispatched at its closing blank line; a frame without `data:` lines is dropped, and so is an
 * unfinished frame when the stream ends.
 */
function createSseParser(onFrame: (frame: SseFrame) => void) {
  /**
   * The unfinished line, as the chunk pieces it arrived in: joined once when its line end comes,
   * so a long line costs linear time (appending to one string and reading it back would make the
   * engine copy the whole buffer for every chunk).
   */
  let pending: string[] = [];
  let pendingChars = 0;
  /** The previous chunk ended in CR: an LF starting the next one is the rest of that CRLF. */
  let skipLF = false;
  let event = "";
  let data: string[] = [];
  let dataChars = 0;

  function line(text: string): void {
    if (text === "") {
      if (data.length > 0)
        onFrame({ event: event || "message", data: data.join("\n") });
      event = "";
      data = [];
      dataChars = 0;
      return;
    }
    if (text.startsWith(":")) return; // comment / keep-alive
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") {
      data.push(value);
      dataChars += value.length;
    }
    // `id`, `retry` and unknown fields are ignored.
  }

  return {
    push(text: string): void {
      if (text.length === 0) return;
      let start = 0;
      let i = 0;
      if (skipLF) {
        skipLF = false;
        if (text.charCodeAt(0) === LF) start = i = 1;
      }
      for (; i < text.length; i++) {
        const char = text.charCodeAt(i);
        if (char !== LF && char !== CR) continue;
        const piece = text.slice(start, i);
        let full = piece;
        if (pending.length > 0) {
          pending.push(piece);
          full = pending.join("");
          pending = [];
          pendingChars = 0;
        }
        line(full);
        if (char === CR) {
          // A CR ends the line; a following LF belongs to it, even in the next chunk.
          if (i + 1 < text.length) {
            if (text.charCodeAt(i + 1) === LF) i++;
          } else {
            skipLF = true;
          }
        }
        start = i + 1;
      }
      if (start < text.length) {
        pending.push(text.slice(start));
        pendingChars += text.length - start;
      }
      if (pendingChars + dataChars > MAX_SSE_FRAME_CHARS) {
        throw new ApiClientError({
          code: "BAD_RESPONSE",
          message: "The server sent an event larger than the client accepts.",
          status: 200,
        });
      }
    },
    end(): void {
      // An unfinished line (no line end) is dropped, like an unfinished frame.
      pending = [];
      pendingChars = 0;
      skipLF = false;
    },
  };
}

function isEventStream(response: Response): boolean {
  const type = response.headers.get("Content-Type") ?? "";
  return type.split(";")[0].trim().toLowerCase() === "text/event-stream";
}

export type PostEventStreamOptions = {
  /**
   * Called once per complete frame, in order. `event` is the frame's `event:` name
   * (`"message"` when it has none); `data` is its `data:` lines joined with `\n` and
   * JSON-parsed. Throwing here stops reading, cancels the stream and rejects
   * `postEventStream` with what you threw.
   */
  onEvent: (event: string, data: unknown) => void;
  /** Aborting cancels the request or the stream; the promise rejects with the abort reason. */
  signal?: AbortSignal;
  /** Extra headers. `Accept` is always `text/event-stream`. */
  headers?: HeadersInit;
};

/**
 * POSTs a JSON body and reads the `text/event-stream` response (`EventSource` can't POST).
 * Resolves when the server closes the stream. Prefer `streamTimetableGeneration` for the
 * timetable generator; this is the generic building block.
 *
 * Rejects with:
 * - `ApiClientError` from the JSON envelope when the server answers before streaming starts
 *   (non-2xx, or not an event stream): e.g. `401`, `403`, `409 CONFLICT`, `429 RATE_LIMITED`
 *   (`details.retry_after_seconds`, also taken from `Retry-After`), `400 VALIDATION_ERROR`.
 * - `ApiClientError` `NETWORK_ERROR` when the server can't be reached (`status` 0) or the
 *   connection drops mid-stream (`status` = the stream's HTTP status).
 * - `ApiClientError` `BAD_RESPONSE` when a frame's `data` is not JSON.
 * - the abort reason (an `AbortError` `DOMException` for a plain `controller.abort()`) when
 *   `signal` aborts. This is not an `ApiClientError`; don't show it as a failure.
 *
 * @example
 * await postEventStream("/api/timetable/generate", { seed: 7 }, {
 *   onEvent: (event, data) => console.log(event, data),
 *   signal: controller.signal,
 * });
 */
export async function postEventStream(
  path: string,
  body: unknown,
  options: PostEventStreamOptions,
): Promise<void> {
  const { onEvent, signal } = options;
  const headers = new Headers(options.headers);
  headers.set("Accept", "text/event-stream");
  const hasBody = body !== undefined;
  if (hasBody && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  const response = await send(path, {
    credentials: "same-origin",
    method: "POST",
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok || !isEventStream(response)) {
    // Errors before the stream opens are plain JSON envelopes; this throws for those.
    await readEnvelope(response, z.unknown());
    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message: `The server answered without an event stream (HTTP ${response.status}); the request may still have completed, so check its result (e.g. the versions list) before retrying.`,
      status: response.status,
    });
  }
  if (response.body === null) {
    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message: `The server sent an empty event stream (HTTP ${response.status}).`,
      status: response.status,
    });
  }

  const parser = createSseParser(({ event, data }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      throw new ApiClientError({
        code: "BAD_RESPONSE",
        message: `The server sent an unreadable "${event}" event.`,
        status: response.status,
        cause: error,
      });
    }
    onEvent(event, parsed);
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // A browser already errors the body when `signal` aborts; this also covers bodies that don't.
  const onAbort = () => {
    reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  let finished = false;
  try {
    for (;;) {
      throwIfAborted(signal);
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        throwIfAborted(signal);
        if (isAbortError(error)) throw error;
        throw new ApiClientError({
          code: "NETWORK_ERROR",
          message:
            "Lost the connection to the server while receiving updates. Check your connection and try again.",
          status: response.status,
          cause: error,
        });
      }
      throwIfAborted(signal); // a cancelled read resolves as `done`
      if (chunk.done) break;
      parser.push(decoder.decode(chunk.value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
    finished = true;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!finished) reader.cancel().catch(() => undefined);
  }
}

// ------------------------------------------------------------------------ timetable generation

const GENERATE_PATH = "/api/timetable/generate";

/** Body for `POST /api/timetable/generate` as the caller writes it (`activate` may be omitted). */
export type GenerateTimetableInput = z.input<
  typeof GenerateTimetableRequestSchema
>;

/** Validates one event's `data`; a mismatch is `BAD_RESPONSE` with the Zod issues in `details`. */
function parseEvent<T extends z.ZodType>(
  schema: T,
  event: string,
  data: unknown,
): z.output<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message: `The server sent an unexpected "${event}" event.`,
      status: 200,
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

/**
 * Runs the timetable generator (admin only) with live progress. Calls `onProgress` with each
 * `SolverProgress` (about every 100 ms of solver time, plus the first frame of each phase and
 * the final `verify`), then resolves with the `GenerateTimetableResult`.
 *
 * `body` is the normal generate body: `{ seed?, time_budget_ms?, activate? }` (pass `{}` for
 * the defaults; `activate: true` makes the new version live and re-runs Spectra decisions).
 *
 * Rejects with `ApiClientError`:
 * - before streaming: `409 CONFLICT` (a reset, import or other run holds the dataset lock),
 *   `429 RATE_LIMITED` (`details.retry_after_seconds`), `401` / `403`, `400 VALIDATION_ERROR`;
 * - from the stream's `error` event, with its `code` / `message` / `details` and the HTTP status
 *   that code has everywhere else (the response itself was a 200 stream), so one handler covers
 *   both: e.g. `INFEASIBLE` 422 (`details.unplaced`, `violations`), `HARD_CONSTRAINT` 409
 *   (activation re-check), `INTERNAL_ERROR` 500. Branching on `code` is the most robust;
 * - `BAD_RESPONSE` if a frame doesn't match the contract or the stream ends without a result;
 * - `NETWORK_ERROR` if the connection drops. The run still finishes and is saved on the
 *   server, so refetch `GET /api/timetable/versions` instead of re-running straight away.
 *
 * Aborting `signal` rejects with the abort reason (not an `ApiClientError`). It only stops
 * listening: the server finishes and saves the run anyway.
 *
 * @example
 * const result = await streamTimetableGeneration(
 *   { seed: 42, activate: true },
 *   (p) => setProgress(p), // { phase, iteration, hard, soft, fest, best, temperature, ms }
 *   { signal: controller.signal },
 * );
 * console.log(result.version.id, result.version.soft_penalty.total, result.spectra);
 */
export async function streamTimetableGeneration(
  body: GenerateTimetableInput,
  onProgress: (progress: SolverProgress) => void,
  options: { signal?: AbortSignal } = {},
): Promise<GenerateTimetableResult> {
  let result: GenerateTimetableResult | undefined;
  await postEventStream(GENERATE_PATH, body, {
    signal: options.signal,
    onEvent(event, data) {
      if (event === "progress") {
        onProgress(parseEvent(SolverProgressSchema, event, data));
      } else if (event === "result") {
        result = parseEvent(GenerateTimetableResultSchema, event, data);
      } else if (event === "error") {
        const error = parseEvent(ApiErrorBody, event, data);
        throw new ApiClientError({
          code: error.code,
          message: error.message,
          status: ERROR_HTTP_STATUS[error.code],
          details: error.details,
        });
      }
      // Other event names are ignored, so the server can add new ones.
    },
  });
  if (result === undefined) {
    throw new ApiClientError({
      code: "BAD_RESPONSE",
      message:
        "The timetable run ended without a result. Check the versions list before trying again.",
      status: 200,
    });
  }
  return result;
}

// --------------------------------------------------------------------------- change requests

/** `encodeURIComponent` for one path segment (ids never contain a slash, but stay safe). */
const segment = (id: string) => encodeURIComponent(id);

/**
 * Change requests the user may see, newest first (`GET /api/changes`; admin, coordinator,
 * faculty; a club gets `403`). `scope`: `all` (default), `mine` or `pending`; `status` narrows it
 * (`pending`, `infeasible`, `applied` or `rejected`, the statuses a stored request can have).
 */
export function listChanges(
  query: Partial<ChangeListQuery> = {},
  init?: ApiRequestInit,
): Promise<ChangeRequest[]> {
  const params = new URLSearchParams();
  if (query.scope) params.set("scope", query.scope);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiGet(
    `/api/changes${qs ? `?${qs}` : ""}`,
    z.array(ChangeRequestSchema),
    init,
  );
}

/** One change request (`GET /api/changes/:id`); `404` when unknown or not visible to the user. */
export function getChange(
  id: string,
  init?: ApiRequestInit,
): Promise<ChangeRequest> {
  return apiGet(`/api/changes/${segment(id)}`, ChangeRequestSchema, init);
}

/**
 * Files a change (`POST /api/changes`) → the stored `ChangeRequest`: `pending` (with `diff`,
 * stability counts and a draft version) or `infeasible` (with `conflicts`). A starter-pack change
 * file (`{id?, dataset?, description?, changes}`) can be sent exactly as it is: `kind` defaults to
 * `disruption`. Forms and the assistant send `kind` (and `placements`) explicitly, e.g.
 * `{ kind: "unavailability", changes: [...] }` or an option's `proposal`. Errors: `400
 * VALIDATION_ERROR` (`details` = `PathIssue[]` (`{path, message}`) for a size limit broken
 * inside `changes` / `placements`, unknown ids or changes that don't fit the kind; Zod's
 * `{formErrors, fieldErrors}` for a malformed body), `403` (outside the user's scope,
 * `details.issues`), `409 CONFLICT` (no dataset or timetable yet, too many pending, busy), `429`.
 *
 * @example
 * const file = JSON.parse(await upload.text()); // a starter-pack change file
 * const cr = await proposeChange(file);
 * if (cr.status === "infeasible") showConflicts(cr.conflicts);
 */
export function proposeChange(
  body: ChangeProposalRequestInput,
  init?: ApiRequestInit,
): Promise<ChangeRequest> {
  return apiPost("/api/changes", body, ChangeRequestSchema, init);
}

/** The proposal for `body` without storing anything (`POST /api/changes/preview`). */
export function previewChange(
  body: ChangeProposalRequestInput,
  init?: ApiRequestInit,
): Promise<ChangePreview> {
  return apiPost("/api/changes/preview", body, ChangePreviewSchema, init);
}

/**
 * Admin: approve and apply a pending change (`POST /api/changes/:id/approve`) → the applied
 * request, the version now active and the proposals it superseded. Errors: `403` /
 * `403 SELF_APPROVAL` (the admin's own request, unless a `disruption` or `manual_edit` they
 * filed as an admin), `409 STALE_VERSION` (another timetable became active; the request is now
 * rejected), `409 HARD_CONSTRAINT` (no longer valid; still pending), `409 CONFLICT`, `429`.
 */
export function approveChange(
  id: string,
  body: ChangeDecisionRequest = {},
  init?: ApiRequestInit,
): Promise<ChangeApplyResult> {
  return apiPost(
    `/api/changes/${segment(id)}/approve`,
    body,
    ChangeApplyResultSchema,
    init,
  );
}

/**
 * An admin rejects, or the requester withdraws, a pending or infeasible change (a club gets
 * `403` before any rate limit is counted).
 */
export function rejectChange(
  id: string,
  body: ChangeDecisionRequest = {},
  init?: ApiRequestInit,
): Promise<ChangeRequest> {
  return apiPost(
    `/api/changes/${segment(id)}/reject`,
    body,
    ChangeRequestSchema,
    init,
  );
}

/** Body of `POST /api/manual/place` as the caller writes it (`repair` may be omitted). */
export type ManualPlacementInput = z.input<typeof ManualPlacementRequestSchema>;

/**
 * Admin or coordinator (own department): pin one session at a slot (`POST /api/manual/place`)
 * → a `manual_edit` `ChangeRequest` waiting for approval. Without `repair` the slot must be free:
 * `409 HARD_CONSTRAINT` (`details` = the violations) otherwise; with `repair: true` whatever is
 * in the way moves.
 */
export function placeManually(
  body: ManualPlacementInput,
  init?: ApiRequestInit,
): Promise<ChangeRequest> {
  return apiPost("/api/manual/place", body, ChangeRequestSchema, init);
}

// -------------------------------------------------------------- assistant and explanations

/**
 * One assistant turn (`POST /api/assistant`; faculty, coordinator, admin) → `AssistantReply`:
 * text, engine-verified `options` (submit one with `proposeChange(option.proposal)`),
 * `candidates` to pick from (re-send with `session_id`), or `conflicts`.
 */
export function askAssistant(
  body: AssistantRequest,
  init?: ApiRequestInit,
): Promise<AssistantReply> {
  return apiPost("/api/assistant", body, AssistantReplySchema, init);
}

/**
 * Why a session is where it is, why a booking got its decision, or why a change moved what it
 * did. `facts` is typed by `subject`: `SessionFacts`, the booking's `DecisionFacts` (or `{}`
 * before a decision), or `ChangeFacts`; narrow on `result.subject` to read them.
 */
export function explain(
  body: ExplainRequest,
  init?: ApiRequestInit,
): Promise<ExplainResult> {
  return apiPost("/api/explain", body, ExplainResultSchema, init);
}

// ----------------------------------------------------------------------------------- export

/**
 * Download link for the official `schedule.json` (`GET /api/export?file=schedule`, admin only).
 * The response is the file itself, not an envelope. Once a change request has been applied it
 * is the timetable as it was just before the first one (the validator's `--baseline`).
 *
 * Use it as a plain `<a href download>`, and enable it only when `canExport()` says `ok`: a
 * download link can't see the `409` the server sends instead of a file (`HARD_CONSTRAINT` for
 * hard violations, `CONFLICT` when Spectra decisions are missing; `POST /api/spectra/run`
 * fixes the latter).
 *
 * @example
 * const { data } = useQuery({ queryKey: ["validate"], queryFn: ({ signal }) => canExport({ signal }) });
 * <a href={EXPORT_SCHEDULE_URL} download aria-disabled={!data?.ok}
 *    onClick={(e) => { if (!data?.ok) e.preventDefault(); }}>Download schedule.json</a>
 */
export const EXPORT_SCHEDULE_URL = "/api/export?file=schedule";

/**
 * Download link for `schedule_after.json`: the timetable after the applied changes (admin
 * only). Enable it when `canExport("schedule_after")` says `ok`; before any change is applied
 * that call rejects with `409 CONFLICT`, like the download.
 */
export const EXPORT_SCHEDULE_AFTER_URL = "/api/export?file=schedule_after";

/**
 * Download link for `disruption.json`: every applied change, in apply order, as one change file
 * (admin only). Enable it when `canExport("disruption")` says `ok`.
 */
export const EXPORT_DISRUPTION_URL = "/api/export?file=disruption";

/** The validator's warning for a request with no stored decision (`validator.py` wording). */
const MISSING_DECISION_WARNING = "No decision for ";

/** {@link canExport} for a schedule file. */
export type ScheduleExportCheck = {
  ok: boolean;
  missing_decisions: string[];
  report: ValidatorReport;
};

/** {@link canExport} for `disruption.json`: ok once a change request has been applied. */
export type DisruptionExportCheck = {
  ok: boolean;
  /**
   * The applied change requests, oldest decision first (by `decided_at`, then id). That is
   * usually, not necessarily, the order they were applied in; `disruption.json` itself lists
   * the changes in apply order.
   */
  change_ids: string[];
};

/**
 * Asks the server whether an export file can be downloaded right now, with the same rules as
 * the export itself (admin only). Errors are thrown as `ApiClientError`, as with `apiGet`.
 *
 * - `"schedule"` (default) and `"schedule_after"`: the validator report (`GET /api/validate`)
 *   on what the export would serve; `ok` with no hard violation and a decision for every
 *   Spectra request. `missing_decisions` lists the request ids without one (the export's
 *   `409 CONFLICT` reports the same in `details.missing`); `report` is the full
 *   `ValidatorReport` (`hard_violations`, `soft_total`, `bookings`, `stability` for
 *   `schedule_after`, …). For `"schedule_after"` before any change is applied, the call rejects
 *   with `409 CONFLICT`.
 * - `"disruption"`: `ok` once at least one change request has been applied (`change_ids`, the
 *   applied requests by decision time; the file itself is in apply order).
 *
 * @example
 * const { ok, report } = await canExport();
 * if (!ok) toast.error(`${report.hard_violation_count} hard violations block the export`);
 * const after = await canExport("schedule_after");
 * console.log(after.report.stability?.sessions_moved);
 */
export function canExport(init?: ApiRequestInit): Promise<ScheduleExportCheck>;
export function canExport(
  file: ValidateQuery["file"],
  init?: ApiRequestInit,
): Promise<ScheduleExportCheck>;
export function canExport(
  file: "disruption",
  init?: ApiRequestInit,
): Promise<DisruptionExportCheck>;
export async function canExport(
  fileOrInit?: ValidateQuery["file"] | "disruption" | ApiRequestInit,
  maybeInit?: ApiRequestInit,
): Promise<ScheduleExportCheck | DisruptionExportCheck> {
  const file = typeof fileOrInit === "string" ? fileOrInit : "schedule";
  const init = typeof fileOrInit === "string" ? maybeInit : fileOrInit;
  if (file === "disruption") {
    const applied = await listChanges({ status: "applied" }, init);
    // The list is newest first; sort by decision time. (The API doesn't expose the apply order,
    // which only the export itself uses.)
    const ids = applied
      .slice()
      .sort(
        (a, b) =>
          (a.decided_at ?? "").localeCompare(b.decided_at ?? "") ||
          a.id.localeCompare(b.id),
      )
      .map((cr) => cr.id);
    return { ok: ids.length > 0, change_ids: ids };
  }
  const path =
    file === "schedule" ? "/api/validate" : `/api/validate?file=${file}`;
  const report = await apiGet(path, ValidatorReportSchema, init);
  const missing = report.warnings
    .filter((w) => w.startsWith(MISSING_DECISION_WARNING))
    .map((w) => w.slice(MISSING_DECISION_WARNING.length));
  return {
    ok: report.hard_violation_count === 0 && missing.length === 0,
    missing_decisions: missing,
    report,
  };
}
