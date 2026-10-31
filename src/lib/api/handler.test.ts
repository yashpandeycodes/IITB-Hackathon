import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, forbidden, hardConstraint, notFound } from "@/lib/errors";
import {
  MAX_JSON_BODY_BYTES,
  parseJsonBody,
  parseSearchParams,
  withHandler,
} from "./handler";
import { fail, ok } from "./response";

function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

const get = (url = "http://localhost/api/test") => new NextRequest(url);

const BodySchema = z.object({
  title: z.string().min(1),
  attendance: z.number().int().positive(),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("response envelopes", () => {
  it("ok() wraps data", async () => {
    const res = ok({ a: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { a: 1 } });
  });

  it("ok() honours a custom status", () => {
    expect(ok(null, { status: 201 }).status).toBe(201);
  });

  it("fail() uses the frozen status table and omits undefined details", async () => {
    const res = fail("STALE_VERSION", "Out of date");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: "STALE_VERSION", message: "Out of date" },
    });
  });
});

describe("withHandler", () => {
  it("passes successful responses through", async () => {
    const handler = withHandler(async () => ok({ hello: "world" }));
    const res = await handler(get(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { hello: "world" } });
  });

  it("forwards the route context", async () => {
    const handler = withHandler(
      async (_req, ctx: { params: Promise<{ id: string }> }) =>
        ok({ id: (await ctx.params).id }),
    );
    const res = await handler(get(), {
      params: Promise.resolve({ id: "BR-07" }),
    });
    expect(await res.json()).toEqual({ ok: true, data: { id: "BR-07" } });
  });

  it.each([
    [notFound("Booking BR-99 not found."), 404, "NOT_FOUND"],
    [forbidden(), 403, "FORBIDDEN"],
    [new ApiError("SELF_APPROVAL", "No"), 403, "SELF_APPROVAL"],
    [new ApiError("INFEASIBLE", "No fix"), 422, "INFEASIBLE"],
    [new ApiError("LLM_UNAVAILABLE", "Down"), 503, "LLM_UNAVAILABLE"],
  ])("maps ApiError %# to its code and status", async (error, status, code) => {
    const res = await withHandler(() => {
      throw error;
    })(get(), undefined);
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(code);
    expect(body.error.message).toBe(error.message);
  });

  it("includes ApiError details", async () => {
    const violations = [
      { rule: "H4", where: "timetable", detail: "Room clash", refs: {} },
    ];
    const res = await withHandler(() => {
      throw hardConstraint("Placement breaks hard rules.", violations);
    })(get(), undefined);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      error: {
        code: "HARD_CONSTRAINT",
        message: "Placement breaks hard rules.",
        details: violations,
      },
    });
  });

  it("treats a bare ZodError as a server fault and hides schema details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await withHandler(() => {
      BodySchema.parse({ title: "", attendance: "lots" });
      return ok(null);
    })(get(), undefined);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("attendance");
    expect(spy).toHaveBeenCalled();
  });

  it("maps unknown errors to INTERNAL_ERROR without leaking the message or stack", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await withHandler(() => {
      throw new Error("connection string mongodb://user:secret@host leaked");
    })(get(), undefined);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret");
    expect(text).not.toContain("handler.test");
    const body = JSON.parse(text);
    expect(body).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: expect.any(String) },
    });
    expect(spy).toHaveBeenCalled();
  });
});

describe("parseJsonBody", () => {
  it("returns parsed data for a valid body", async () => {
    const data = await parseJsonBody(
      post(JSON.stringify({ title: "Quiz", attendance: 80 })),
      BodySchema,
    );
    expect(data).toEqual({ title: "Quiz", attendance: 80 });
  });

  it("turns invalid JSON into a 400 VALIDATION_ERROR", async () => {
    const res = await withHandler(async (req) =>
      ok(await parseJsonBody(req, BodySchema)),
    )(post("{not json"), undefined);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/not valid JSON/);
  });

  it("rejects a non-JSON content type", async () => {
    await expect(
      parseJsonBody(
        post(JSON.stringify({ title: "Quiz", attendance: 80 }), {
          "content-type": "text/plain",
        }),
        BodySchema,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Content-Type must be application/json.",
    });
  });

  it("accepts a JSON content type with parameters", async () => {
    const data = await parseJsonBody(
      post(JSON.stringify({ title: "Quiz", attendance: 80 }), {
        "content-type": "application/json; charset=utf-8",
      }),
      BodySchema,
    );
    expect(data.attendance).toBe(80);
  });

  it("rejects an empty body", async () => {
    await expect(parseJsonBody(post(""), BodySchema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a schema-invalid body with field errors", async () => {
    const promise = parseJsonBody(
      post(JSON.stringify({ title: "Quiz" })),
      BodySchema,
    );
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      details: { fieldErrors: { attendance: expect.any(Array) } },
    });
  });

  it("rejects bodies over the size limit", async () => {
    const big = JSON.stringify({
      title: "x".repeat(MAX_JSON_BODY_BYTES),
      attendance: 1,
    });
    await expect(parseJsonBody(post(big), BodySchema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Request body is too large.",
    });
    await expect(
      parseJsonBody(
        post(JSON.stringify({ title: "Quiz", attendance: 1 })),
        BodySchema,
        { maxBytes: 10 },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("parseSearchParams", () => {
  const QuerySchema = z.object({
    day: z.enum(["MON", "TUE"]),
    from_period: z.coerce.number().int(),
    needs: z.union([z.string(), z.array(z.string())]).optional(),
  });

  it("coerces values and collects repeated keys into arrays", () => {
    const url = new URL(
      "http://localhost/api/rooms?day=MON&from_period=3&needs=stage&needs=ac",
    );
    expect(parseSearchParams(url, QuerySchema)).toEqual({
      day: "MON",
      from_period: 3,
      needs: ["stage", "ac"],
    });
  });

  it("accepts URLSearchParams and strings", () => {
    expect(
      parseSearchParams(
        new URLSearchParams("day=TUE&from_period=1"),
        QuerySchema,
      ),
    ).toEqual({
      day: "TUE",
      from_period: 1,
    });
    expect(
      parseSearchParams("/api/rooms?day=TUE&from_period=2", QuerySchema)
        .from_period,
    ).toBe(2);
  });

  it("throws VALIDATION_ERROR with details for bad params", () => {
    expect(() =>
      parseSearchParams(new URL("http://localhost/?day=SUN"), QuerySchema),
    ).toThrow(ApiError);
    try {
      parseSearchParams(new URL("http://localhost/?day=SUN"), QuerySchema);
    } catch (err) {
      expect(err).toMatchObject({
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: {
            day: expect.any(Array),
            from_period: expect.any(Array),
          },
        },
      });
    }
  });
});
