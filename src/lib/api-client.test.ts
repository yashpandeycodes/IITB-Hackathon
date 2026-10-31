import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type {
  GenerateTimetableResult,
  SolverProgress,
} from "@/lib/contracts/timetable";
import type { ValidatorReport } from "@/lib/contracts/violation";

import {
  ApiClientError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  canExport,
  EXPORT_SCHEDULE_URL,
  isApiClientError,
  postEventStream,
  streamTimetableGeneration,
} from "./api-client";

const Room = z.object({ id: z.string(), capacity: z.number() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

describe("apiGet", () => {
  it("returns parsed data from an ok envelope", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { id: "AUD", capacity: 500 } }),
    );

    const room = await apiGet("/api/rooms/AUD", Room);

    expect(room).toEqual({ id: "AUD", capacity: 500 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/rooms/AUD");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(init?.credentials).toBe("same-origin");
    const headers = new Headers(init?.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("applies schema transforms to data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: "42" }));
    const value = await apiGet("/api/x", z.string().transform(Number));
    expect(value).toBe(42);
  });

  it("forwards caller init such as an abort signal and extra headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: null }));
    const controller = new AbortController();

    await apiGet("/api/x", z.null(), {
      signal: controller.signal,
      headers: { "X-Test": "1" },
    });

    const init = fetchMock.mock.calls[0]![1];
    expect(init?.signal).toBe(controller.signal);
    expect(new Headers(init?.headers).get("X-Test")).toBe("1");
  });

  it("throws ApiClientError with the envelope error on ok:false", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Room ZZZ not found",
            details: { id: "ZZZ" },
          },
        },
        404,
      ),
    );

    const error = await catchError(apiGet("/api/rooms/ZZZ", Room));

    expect(isApiClientError(error)).toBe(true);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      name: "ApiClientError",
      code: "NOT_FOUND",
      message: "Room ZZZ not found",
      status: 404,
      details: { id: "ZZZ" },
    });
  });

  it("throws NETWORK_ERROR with status 0 when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await catchError(apiGet("/api/rooms", Room));

    expect(error).toMatchObject({ code: "NETWORK_ERROR", status: 0 });
    expect((error as ApiClientError).cause).toBeInstanceOf(TypeError);
  });

  it("rethrows a custom abort reason untouched (fetch rejects with the signal's reason)", async () => {
    const controller = new AbortController();
    const reason = new Error("navigated away");
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
      controller.abort(reason);
      return Promise.reject(init?.signal?.reason);
    });

    const error = await catchError(
      apiGet("/api/rooms", Room, { signal: controller.signal }),
    );

    expect(error).toBe(reason);
    expect(isApiClientError(error)).toBe(false);
  });

  it("rethrows aborts untouched", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    fetchMock.mockRejectedValue(abort);

    const error = await catchError(apiGet("/api/rooms", Room));

    expect(error).toBe(abort);
    expect(isApiClientError(error)).toBe(false);
  });

  it("throws BAD_RESPONSE when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>Gateway timeout</html>", {
        status: 504,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const error = await catchError(apiGet("/api/rooms", Room));

    expect(error).toMatchObject({ code: "BAD_RESPONSE", status: 504 });
  });

  it("throws BAD_RESPONSE when data does not match the schema", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { id: "AUD", capacity: "big" } }),
    );

    const error = await catchError(apiGet("/api/rooms/AUD", Room));

    expect(error).toMatchObject({ code: "BAD_RESPONSE", status: 200 });
    expect(Array.isArray((error as ApiClientError).details)).toBe(true);
  });

  it("throws BAD_RESPONSE when the envelope is missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "AUD", capacity: 500 }));

    const error = await catchError(apiGet("/api/rooms/AUD", Room));

    expect(error).toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("throws BAD_RESPONSE for an unknown error code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: { code: "TEAPOT", message: "short and stout" } },
        418,
      ),
    );

    const error = await catchError(apiGet("/api/x", Room));

    expect(error).toMatchObject({ code: "BAD_RESPONSE", status: 418 });
  });
});

describe("apiPost / apiPatch / apiDelete", () => {
  it("POSTs a JSON body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { id: "BR-26", capacity: 120 } }, 201),
    );

    const body = { title: "Rehearsal", attendance: 100 };
    const result = await apiPost("/api/bookings", body, Room);

    expect(result).toEqual({ id: "BR-26", capacity: 120 });
    const init = fetchMock.mock.calls[0]![1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(body));
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("surfaces validation errors from a POST", async () => {
    const issues = [
      { path: ["attendance"], message: "Attendance must be a positive number" },
    ];
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid booking",
            details: issues,
          },
        },
        400,
      ),
    );

    const error = await catchError(apiPost("/api/bookings", {}, Room));

    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      details: issues,
    });
  });

  it("PATCHes a JSON body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { updated: true } }),
    );

    await apiPatch(
      "/api/settings",
      { llm_enabled: false },
      z.object({ updated: z.boolean() }),
    );

    const init = fetchMock.mock.calls[0]![1];
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ llm_enabled: false }));
  });

  it("sends DELETE without a body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: null }));

    const result = await apiDelete("/api/bookings/BR-26", z.null());

    expect(result).toBeNull();
    const init = fetchMock.mock.calls[0]![1];
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
  });
});

describe("Retry-After", () => {
  it("adds the Retry-After header to details on a plain request", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "RATE_LIMITED", message: "Too many runs." },
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "90" },
        },
      ),
    );

    const error = await catchError(apiGet("/api/x", z.null()));

    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      details: { retry_after_seconds: 90 },
    });
  });
});

// ------------------------------------------------------------------------------ event streams

const encoder = new TextEncoder();

const PROGRESS = [
  {
    phase: "construct",
    iteration: 183,
    hard: 0,
    soft: 4,
    fest: 0,
    best: 4,
    temperature: null,
    ms: 30,
  },
  {
    phase: "anneal",
    iteration: 5000,
    hard: 0,
    soft: 113,
    fest: 0,
    best: 4,
    temperature: 2.976424440835708,
    ms: 54,
  },
  {
    phase: "verify",
    iteration: 1583697,
    hard: 0,
    soft: 3,
    fest: 0,
    best: 3,
    temperature: null,
    ms: 2086,
  },
] satisfies SolverProgress[];

const RESULT = {
  version: {
    id: "TT-0003",
    dataset_id: "cit-public-v1",
    status: "active",
    source: "generate",
    parent_version: "TT-0002",
    change_request_id: null,
    assignments: [
      {
        session_id: "MA101-AB-L1",
        day: "WED",
        start_period: 5,
        room_id: "LH-1",
      },
    ],
    hard_violation_count: 0,
    soft_penalty: { S1: 0, S2: 0, S3: 0, S4: 3, S5: 0, S6: 0, total: 3 },
    solver_meta: {
      seed: 42,
      ms: 23,
      iterations: 183,
      algorithm: "greedy+repair+SA",
      stopped_by: "converged",
    },
    created_by: "u_admin",
    created_at: "2026-10-31T20:37:53+05:30",
  },
  activated: true,
  spectra: {
    timetable_version: "TT-0003",
    approved: 22,
    alternatives: 1,
    rejected: 2,
    session_overrides: 0,
    booking_score: 67,
    booking_score_max_if_all_approved: 70,
    priority_inversions: [],
  },
} satisfies GenerateTimetableResult;

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const SSE_HEADERS = { "Content-Type": "text/event-stream; charset=utf-8" };

/** A 200 event-stream response whose body yields `chunks` (strings UTF-8 encoded) in order. */
function streamResponse(
  chunks: (string | Uint8Array)[],
  onCancel?: (reason: unknown) => void,
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(
          typeof chunk === "string" ? encoder.encode(chunk) : chunk,
        );
      controller.close();
    },
    cancel: onCancel,
  });
  return new Response(body, { status: 200, headers: SSE_HEADERS });
}

/** `text` as UTF-8, cut into `size`-byte chunks (through lines and multi-byte characters). */
function byteChunks(text: string, size: number): Uint8Array[] {
  const bytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size)
    chunks.push(bytes.slice(i, i + size));
  return chunks;
}

/** Runs `postEventStream` and returns every `[event, data]` it dispatched. */
async function collect(response: Response): Promise<[string, unknown][]> {
  fetchMock.mockResolvedValueOnce(response);
  const events: [string, unknown][] = [];
  await postEventStream("/api/stream", undefined, {
    onEvent: (event, data) => events.push([event, data]),
  });
  return events;
}

describe("postEventStream", () => {
  it("POSTs JSON with Accept: text/event-stream, same-origin, the signal and extra headers", async () => {
    fetchMock.mockResolvedValue(streamResponse([]));
    const controller = new AbortController();

    await postEventStream(
      "/api/timetable/generate",
      { seed: 7 },
      {
        onEvent: () => {},
        signal: controller.signal,
        headers: { Accept: "application/json", "X-Test": "1" },
      },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/timetable/generate");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ seed: 7 }));
    expect(init?.credentials).toBe("same-origin");
    expect(init?.signal).toBe(controller.signal);
    const headers = new Headers(init?.headers);
    expect(headers.get("Accept")).toBe("text/event-stream");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Test")).toBe("1");
  });

  it("parses the same frames for any chunking, including split multi-byte characters", async () => {
    const text =
      ": stream opened\n\n" +
      frame("progress", PROGRESS[0]) +
      'event: note\ndata: "Café – Spectra ✓"\n\n' +
      frame("progress", PROGRESS[1]) +
      frame("result", { done: true });
    const expected = [
      ["progress", PROGRESS[0]],
      ["note", "Café – Spectra ✓"],
      ["progress", PROGRESS[1]],
      ["result", { done: true }],
    ];

    for (const size of [1, 2, 3, 5, 7, 13, 64, text.length * 4]) {
      const events = await collect(streamResponse(byteChunks(text, size)));
      expect(events, `${size}-byte chunks`).toEqual(expected);
    }
  });

  it("accepts CRLF and CR line endings, also with a CRLF split across chunks", async () => {
    const events = await collect(
      streamResponse([
        "event: a\r",
        "\ndata: 1\r\n\r",
        "\n",
        "event: b\rdata: 2\r\r",
        "event: c\r\ndata: 3\r\n\r",
      ]),
    );

    expect(events).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("joins multi-line data and ignores comments, id, retry and unknown fields", async () => {
    const events = await collect(
      streamResponse([
        ": keep-alive\n\n",
        "id: 1\nretry: 1000\nevent: progress\nfoo: bar\n",
        ': a comment inside a frame\ndata: {"a":\ndata: [1,\ndata:2]}\n\n',
        "event: lonely\n\n", // no data: not dispatched
        'data:{"no":"event name"}\n\n',
      ]),
    );

    expect(events).toEqual([
      ["progress", { a: [1, 2] }],
      ["message", { no: "event name" }],
    ]);
  });

  it("drops an unfinished frame when the stream ends", async () => {
    const events = await collect(
      streamResponse(["event: a\ndata: 1\n\n", "event: b\ndata: 2\n"]),
    );

    expect(events).toEqual([["a", 1]]);
  });

  it("throws BAD_RESPONSE when a frame's data is not JSON, and cancels the stream", async () => {
    const onCancel = vi.fn();
    fetchMock.mockResolvedValue(
      streamResponse(
        ["event: progress\ndata: {oops\n\n", frame("result", {})],
        onCancel,
      ),
    );
    const onEvent = vi.fn();

    const error = await catchError(
      postEventStream("/api/stream", {}, { onEvent }),
    );

    expect(error).toMatchObject({ code: "BAD_RESPONSE", status: 200 });
    expect((error as ApiClientError).cause).toBeInstanceOf(SyntaxError);
    expect(onEvent).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("rethrows what onEvent throws", async () => {
    fetchMock.mockResolvedValue(streamResponse([frame("a", 1), frame("b", 2)]));
    const boom = new Error("boom");
    const onEvent = vi.fn(() => {
      throw boom;
    });

    const error = await catchError(
      postEventStream("/api/stream", {}, { onEvent }),
    );

    expect(error).toBe(boom);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("throws BAD_RESPONSE when a 200 answer is JSON instead of a stream", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: RESULT }));

    const error = await catchError(
      postEventStream("/api/stream", {}, { onEvent: () => {} }),
    );

    expect(error).toMatchObject({ code: "BAD_RESPONSE", status: 200 });
  });

  it("throws NETWORK_ERROR with status 0 when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await catchError(
      postEventStream("/api/stream", {}, { onEvent: () => {} }),
    );

    expect(error).toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  });

  it("throws NETWORK_ERROR when the connection drops mid-stream", async () => {
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) controller.error(new TypeError("network error"));
        else controller.enqueue(encoder.encode(frame("a", 1)));
        sent = true;
      },
    });
    fetchMock.mockResolvedValue(new Response(body, { headers: SSE_HEADERS }));
    const onEvent = vi.fn();

    const error = await catchError(
      postEventStream("/api/stream", {}, { onEvent }),
    );

    expect(onEvent).toHaveBeenCalledWith("a", 1);
    expect(error).toMatchObject({ code: "NETWORK_ERROR", status: 200 });
    expect((error as ApiClientError).cause).toBeInstanceOf(TypeError);
  });
});

describe("streamTimetableGeneration", () => {
  const fullStream =
    PROGRESS.map((p) => frame("progress", p)).join("") +
    frame("result", RESULT);

  it("posts to /api/timetable/generate, reports progress in order and returns the result", async () => {
    fetchMock.mockResolvedValue(streamResponse(byteChunks(fullStream, 37)));
    const onProgress = vi.fn();

    const result = await streamTimetableGeneration(
      { seed: 42, activate: true },
      onProgress,
    );

    expect(result).toEqual(RESULT);
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual(PROGRESS);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/timetable/generate");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ seed: 42, activate: true }));
    expect(new Headers(init?.headers).get("Accept")).toBe("text/event-stream");
  });

  it("ignores unknown event names", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([frame("heartbeat", { t: 1 }), frame("result", RESULT)]),
    );

    await expect(streamTimetableGeneration({}, () => {})).resolves.toEqual(
      RESULT,
    );
  });

  it.each([
    {
      errorBody: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
      status: 500,
    },
    {
      errorBody: {
        code: "INFEASIBLE",
        message: "No valid timetable exists for this data.",
        details: { unplaced: ["CS201-A-L1"], unplaced_total: 1 },
      },
      status: 422,
    },
  ])(
    "throws ApiClientError $errorBody.code (status $status) from an error event",
    async ({ errorBody, status }) => {
      fetchMock.mockResolvedValue(
        streamResponse([
          frame("progress", PROGRESS[0]),
          frame("error", errorBody),
        ]),
      );
      const onProgress = vi.fn();

      const error = await catchError(streamTimetableGeneration({}, onProgress));

      expect(error).toBeInstanceOf(ApiClientError);
      // The code's usual HTTP status, so one handler covers streamed and JSON errors.
      expect(error).toMatchObject({ ...errorBody, status });
      expect(onProgress).toHaveBeenCalledTimes(1);
    },
  );

  it("parses a 1 MB frame sent in 1 KB chunks without rescanning (linear time)", async () => {
    const big = "x".repeat(1024 * 1024);
    const text = `event: result\ndata: ${JSON.stringify({ ...RESULT, pad: big })}\n\n`;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 1024)
      chunks.push(text.slice(i, i + 1024));
    fetchMock.mockResolvedValue(streamResponse(chunks));
    const events: string[] = [];

    const started = performance.now();
    await postEventStream(
      "/api/x",
      {},
      { onEvent: (event) => events.push(event) },
    );

    expect(events).toEqual(["result"]);
    // Quadratic rescanning took ~1.5 s here; linear parsing is a few ms. Generous for slow CI.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("throws BAD_RESPONSE instead of buffering an endless event", async () => {
    const huge = `data: ${"x".repeat(9 * 1024 * 1024)}`; // no line end, never dispatched
    fetchMock.mockResolvedValue(streamResponse([huge]));

    const error = await catchError(streamTimetableGeneration({}, () => {}));

    expect(error).toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("throws BAD_RESPONSE when the stream ends without a result", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(PROGRESS.map((p) => frame("progress", p))),
    );
    const onProgress = vi.fn();

    const error = await catchError(streamTimetableGeneration({}, onProgress));

    expect(error).toMatchObject({ code: "BAD_RESPONSE", status: 200 });
    expect(onProgress).toHaveBeenCalledTimes(3);
  });

  it("throws CONFLICT (409) from the JSON envelope sent before streaming", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          error: {
            code: "CONFLICT",
            message: "Another schedule run is in progress.",
          },
        },
        409,
      ),
    );
    const onProgress = vi.fn();

    const error = await catchError(streamTimetableGeneration({}, onProgress));

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "Another schedule run is in progress.",
    });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("puts Retry-After into details for a 429", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many schedule runs.",
            details: { scope: "user" },
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "120",
          },
        },
      ),
    );

    const error = await catchError(streamTimetableGeneration({}, () => {}));

    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      details: { scope: "user", retry_after_seconds: 120 },
    });
  });

  it("keeps the server's retry_after_seconds and reads an HTTP-date Retry-After", async () => {
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("Sat, 31 Oct 2026 10:00:00 GMT"));
    try {
      const rateLimited = (details?: unknown) =>
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "RATE_LIMITED", message: "Slow down.", details },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "Sat, 31 Oct 2026 10:01:30 GMT",
            },
          },
        );
      fetchMock
        .mockResolvedValueOnce(rateLimited())
        .mockResolvedValueOnce(rateLimited({ retry_after_seconds: 88 }));

      const fromDate = await catchError(
        streamTimetableGeneration({}, () => {}),
      );
      const fromServer = await catchError(
        streamTimetableGeneration({}, () => {}),
      );

      expect(fromDate).toMatchObject({ details: { retry_after_seconds: 90 } });
      expect(fromServer).toMatchObject({
        details: { retry_after_seconds: 88 },
      });
    } finally {
      now.mockRestore();
    }
  });

  it("throws BAD_RESPONSE for a malformed progress frame and stops reading", async () => {
    const onCancel = vi.fn();
    fetchMock.mockResolvedValue(
      streamResponse(
        [
          frame("progress", PROGRESS[0]),
          frame("progress", { ...PROGRESS[1], phase: "warp" }),
          frame("result", RESULT),
        ],
        onCancel,
      ),
    );
    const onProgress = vi.fn();

    const error = await catchError(streamTimetableGeneration({}, onProgress));

    expect(error).toMatchObject({ code: "BAD_RESPONSE", status: 200 });
    expect(Array.isArray((error as ApiClientError).details)).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalled();
  });

  it("throws BAD_RESPONSE for a malformed result or an unknown error code", async () => {
    fetchMock
      .mockResolvedValueOnce(
        streamResponse([frame("result", { ...RESULT, activated: "yes" })]),
      )
      .mockResolvedValueOnce(
        streamResponse([frame("error", { code: "TEAPOT", message: "hi" })]),
      );

    const badResult = await catchError(streamTimetableGeneration({}, () => {}));
    const badError = await catchError(streamTimetableGeneration({}, () => {}));

    expect(badResult).toMatchObject({ code: "BAD_RESPONSE" });
    expect(badError).toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("rejects with the abort reason when aborted mid-stream, and cancels the stream", async () => {
    const onCancel = vi.fn();
    // Sends one progress frame, then stays open (a long annealing run).
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frame("progress", PROGRESS[0])));
      },
      cancel: onCancel,
    });
    fetchMock.mockResolvedValue(new Response(body, { headers: SSE_HEADERS }));
    const controller = new AbortController();
    const onProgress = vi.fn(() => {
      setTimeout(() => controller.abort(), 0);
    });

    const error = await catchError(
      streamTimetableGeneration({}, onProgress, { signal: controller.signal }),
    );

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(isApiClientError(error)).toBe(false);
    expect(onCancel).toHaveBeenCalled();
  });

  it("rejects straight away with an already-aborted signal", async () => {
    fetchMock.mockResolvedValue(streamResponse([fullStream]));
    const controller = new AbortController();
    controller.abort();
    const onProgress = vi.fn();

    const error = await catchError(
      streamTimetableGeneration({}, onProgress, { signal: controller.signal }),
    );

    expect(error).toMatchObject({ name: "AbortError" });
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("export helpers", () => {
  const report = (violations: number): ValidatorReport => ({
    dataset_id: "cit-public-v1",
    schedule_dataset_id: "cit-public-v1",
    team: "CIT Crunch Week",
    soft_penalties: { S1: 0, S2: 0, S3: 0, S4: 3, S5: 0, S6: 0 },
    soft_total: 3,
    hard_violations: Array.from({ length: violations }, () => ({
      rule: "H4",
      where: "timetable" as const,
      detail: "LH-1 is double-booked on WED P5",
    })),
    hard_violation_count: violations,
    hard_by_rule: violations > 0 ? { H4: violations } : {},
    warnings: [],
  });

  it("points EXPORT_SCHEDULE_URL at the schedule download", () => {
    expect(EXPORT_SCHEDULE_URL).toBe("/api/export?file=schedule");
  });

  it("canExport is ok when the validator finds no hard violation", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: report(0) }));

    const { ok, report: got } = await canExport();

    expect(ok).toBe(true);
    expect(got).toEqual(report(0));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/validate");
    expect(init?.method).toBe("GET");
  });

  it("canExport is not ok when there are hard violations", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: report(2) }));

    const { ok, report: got } = await canExport();

    expect(ok).toBe(false);
    expect(got.hard_violation_count).toBe(2);
  });

  it("canExport is not ok when a Spectra request has no decision (the export would 409)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { ...report(0), warnings: ["No decision for BR-03"] },
      }),
    );

    const result = await canExport();

    expect(result.ok).toBe(false);
    expect(result.missing_decisions).toEqual(["BR-03"]);
  });
});
