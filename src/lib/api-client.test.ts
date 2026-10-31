import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  ApiClientError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  isApiClientError,
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
