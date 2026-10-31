/**
 * Typed fetch wrapper for the UI (docs/frontend.md §9). Client-safe: imports only
 * the API contracts and zod. Every route returns the `{ ok, data | error }` envelope from
 * `@/lib/contracts/api`; this module validates it and either returns `data`
 * (parsed with the caller's schema) or throws an `ApiClientError`.
 *
 * Also here: `postEventStream` / `streamTimetableGeneration` for the live solver progress
 * stream (`POST /api/timetable/generate` with `Accept: text/event-stream`), and
 * `EXPORT_SCHEDULE_URL` / `canExport` for the `schedule.json` download.
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
  let buffer = "";
  /** How much of `buffer` is known to hold no line end, so a long line isn't rescanned per chunk. */
  let scanned = 0;
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
      buffer += text;
      let start = 0;
      for (let i = scanned; i < buffer.length; i++) {
        const char = buffer.charCodeAt(i);
        if (char !== LF && char !== CR) continue;
        // A CR at the very end may be the first half of a CRLF: wait for the next chunk.
        if (char === CR && i === buffer.length - 1) break;
        line(buffer.slice(start, i));
        if (char === CR && buffer.charCodeAt(i + 1) === LF) i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      // A trailing CR is re-examined next time (it may be the first half of a CRLF).
      scanned = buffer.endsWith("\r") ? buffer.length - 1 : buffer.length;
      if (buffer.length + dataChars > MAX_SSE_FRAME_CHARS) {
        throw new ApiClientError({
          code: "BAD_RESPONSE",
          message: "The server sent an event larger than the client accepts.",
          status: 200,
        });
      }
    },
    end(): void {
      if (buffer.endsWith("\r")) line(buffer.slice(0, -1));
      buffer = "";
      scanned = 0;
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

// ----------------------------------------------------------------------------------- export

/**
 * Download link for the official `schedule.json` (`GET /api/export?file=schedule`, admin only).
 * The response is the file itself, not an envelope.
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

/** The validator's warning for a request with no stored decision (`validator.py` wording). */
const MISSING_DECISION_WARNING = "No decision for ";

/**
 * Asks the validator (`GET /api/validate`, admin only) whether the current schedule can be
 * exported, with the same rules as the export itself: no hard violation and a decision for
 * every Spectra request. `missing_decisions` lists the request ids without one (the same ids the
 * export's `409 CONFLICT` reports in `details.missing`);
 * `report` is the full `ValidatorReport` (`hard_violations`, `soft_total`, `bookings`,
 * `warnings`, …) to show why not. Errors are thrown as `ApiClientError`, as with `apiGet`.
 *
 * @example
 * const { ok, report } = await canExport();
 * if (!ok) toast.error(`${report.hard_violation_count} hard violations block the export`);
 */
export async function canExport(init?: ApiRequestInit): Promise<{
  ok: boolean;
  missing_decisions: string[];
  report: ValidatorReport;
}> {
  const report = await apiGet("/api/validate", ValidatorReportSchema, init);
  const missing = report.warnings
    .filter((w) => w.startsWith(MISSING_DECISION_WARNING))
    .map((w) => w.slice(MISSING_DECISION_WARNING.length));
  return {
    ok: report.hard_violation_count === 0 && missing.length === 0,
    missing_decisions: missing,
    report,
  };
}
