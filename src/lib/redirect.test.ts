import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/timetable", "/timetable"],
    [
      "/timetable/group/CSE-2?week=spectra#mon",
      "/timetable/group/CSE-2?week=spectra#mon",
    ],
    ["/admin", "/admin"],
  ])("keeps the same-site path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/login",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/\r\nSet-Cookie:x",
    "timetable",
    "",
    "/login",
    "/login?redirect=/admin",
    "/signup",
    "/api/export?file=schedule",
    "/\u0000x",
  ])("falls back for %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it("falls back for non-strings and very long values", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(["/admin"])).toBe("/dashboard");
    expect(safeRedirectPath(`/${"a".repeat(3000)}`)).toBe("/dashboard");
    expect(safeRedirectPath("//x", "")).toBe("");
  });
});
