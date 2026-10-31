/**
 * `GET /api/auth/session-expired`: clears the session cookie and sends the browser to `/login`,
 * keeping only a safe same-site `redirect`.
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET } from "./session-expired/route";

async function hit(query: string) {
  return GET(
    new NextRequest(`http://localhost/api/auth/session-expired${query}`, {
      headers: { cookie: "cit_nexus_session=stale.token.value" },
    }),
    undefined,
  );
}

describe("GET /api/auth/session-expired", () => {
  it("clears the cookie and redirects to /login with the page to come back to", async () => {
    const response = await hit("?redirect=%2Ftimetable%2Fgroup%2FCSE-2");
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe(
      "/timetable/group/CSE-2",
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/cit_nexus_session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
  });

  it.each([
    "?redirect=https%3A%2F%2Fevil.example",
    "?redirect=%2F%2Fevil.example",
    "?redirect=%2Flogin",
    "",
  ])("drops an unsafe or missing redirect (%s)", async (query) => {
    const response = await hit(query);
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("http://localhost");
    expect(location.pathname).toBe("/login");
    expect(location.search).toBe("");
  });
});
