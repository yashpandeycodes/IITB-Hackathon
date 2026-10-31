import {
  GenerateTimetableRequestSchema,
  type ApiErr,
  type ApiErrorBody,
  type GenerateTimetableResult,
  type SolverProgress,
} from "@/lib/contracts";
import { ok, parseJsonBody, toErrorResponse, withHandler } from "@/lib/api";
import { requireRole, requireScheduleRunQuota } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import {
  beginTimetableGeneration,
  generateTimetable,
} from "@/lib/services/timetable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

const encoder = new TextEncoder();

function frame(event: "progress" | "result" | "error", data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** The same `{code, message, details?}` the JSON envelope would carry (never a stack trace). */
async function errorBody(err: unknown): Promise<ApiErrorBody> {
  const body = (await toErrorResponse(err).json()) as ApiErr;
  return body.error;
}

/**
 * Streams one generation run: `progress` frames while it runs, then one `result` or `error`.
 * If the client goes away, frames stop but the run finishes and releases the lock.
 */
function streamRun(
  request: Request,
  run: (
    onProgress: (progress: SolverProgress) => void,
  ) => Promise<GenerateTimetableResult>,
): Response {
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const stop = () => {
        open = false;
      };
      const send = (event: Parameters<typeof frame>[0], data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(frame(event, data));
        } catch {
          stop();
        }
      };
      if (request.signal.aborted) stop();
      else request.signal.addEventListener("abort", stop, { once: true });
      void (async () => {
        try {
          const result = await run((progress) => send("progress", progress));
          send("result", result);
        } catch (err) {
          send("error", await errorBody(err));
        } finally {
          request.signal.removeEventListener("abort", stop);
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {
              // Already closed or errored by the consumer.
            }
          }
        }
      })();
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * Admin: generate a timetable for the loaded dataset. Optional body
 * `{ seed?, time_budget_ms?, activate? }`. Returns `GenerateTimetableResult` (a draft version
 * unless `activate`, which also re-runs Spectra decisions). `422 INFEASIBLE` when not every
 * session can be placed, `409 CONFLICT` while a reset, import or another run holds the lock,
 * `429 RATE_LIMITED` after too many runs.
 *
 * With `Accept: text/event-stream` the lock is taken first (a busy lock is the plain `409`
 * envelope), then the response streams `event: progress` (`SolverProgress`) frames and ends
 * with one `event: result` (`GenerateTimetableResult`) or `event: error` (`{code, message,
 * details?}`).
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(request, "admin");
  // Any body is validated (a body without a JSON content type is a 400, never silently ignored).
  const length = request.headers.get("content-length");
  const hasBody =
    (length !== null && length !== "0") ||
    request.headers.has("transfer-encoding") ||
    (length === null && request.headers.has("content-type"));
  const body = hasBody
    ? await parseJsonBody(request, GenerateTimetableRequestSchema, {
        maxBytes: 1_024,
      })
    : GenerateTimetableRequestSchema.parse({});
  requireScheduleRunQuota(request, user);
  const options = {
    seed: body.seed,
    budgetMs: body.time_budget_ms,
    activate: body.activate,
    actor: user.id,
  };
  const db = await getDb();

  const accept = request.headers.get("accept") ?? "";
  if (!accept.toLowerCase().includes("text/event-stream")) {
    return ok(await generateTimetable(db, options));
  }
  const run = await beginTimetableGeneration(db, options);
  return streamRun(request, run);
});
