import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/contracts/enums";
import type { SessionUser } from "@/lib/contracts/user";
import { proxy } from "@/proxy";
import {
  decideProxy,
  isCrossOrigin,
  needsSession,
  requestHosts,
  type ProxyRequest,
} from "./proxy-rules";
import { signSession } from "./session";
import { testSecret } from "./test-db";

const user = (role: Role): SessionUser => ({
  id: `u_${role}`,
  email: `${role}@cit.demo`,
  name: role,
  role,
  department: null,
  faculty_id: null,
  club: null,
});

const req = (
  pathname: string,
  extra: Partial<ProxyRequest> = {},
): ProxyRequest => ({
  method: "GET",
  pathname,
  origin: null,
  hosts: ["localhost:3000"],
  ...extra,
});

const as = (role: Role | null) => async () => (role ? user(role) : null);

describe("decideProxy: role pages", () => {
  it("sends anonymous visitors to /login with the page as redirect", async () => {
    expect(await decideProxy(req("/dashboard"), as(null))).toEqual({
      action: "redirect",
      pathname: "/login",
      query: { redirect: "/dashboard" },
    });
    expect(await decideProxy(req("/faculty/week"), as(null))).toMatchObject({
      query: { redirect: "/faculty/week" },
    });
  });

  it("sends the wrong role to /unauthorized with its display label", async () => {
    expect(await decideProxy(req("/admin"), as("faculty"))).toEqual({
      action: "redirect",
      pathname: "/unauthorized",
      query: { role: "Faculty", attemptedSector: "/admin" },
    });
    expect(
      await decideProxy(req("/club"), as("department_coordinator")),
    ).toMatchObject({
      query: { role: "Department Coordinator", attemptedSector: "/club" },
    });
  });

  it("applies the prototype's clearance matrix", async () => {
    const allowed: [string, Role][] = [
      ["/admin", "admin"],
      ["/coordinator", "admin"],
      ["/coordinator", "department_coordinator"],
      ["/faculty", "faculty"],
      ["/club/events", "club"],
      ["/dashboard", "club"],
    ];
    for (const [path, role] of allowed) {
      expect(await decideProxy(req(path), as(role))).toEqual({
        action: "next",
      });
    }
    for (const [path, role] of [
      ["/faculty", "club"],
      ["/coordinator", "faculty"],
    ] as [string, Role][]) {
      expect((await decideProxy(req(path), as(role))).action).toBe("redirect");
    }
  });

  it("gates the app-area pages for all four roles", async () => {
    for (const path of [
      "/timetable",
      "/rooms",
      "/bookings/new",
      "/spectra",
      "/approvals",
      "/changes/CR-0001",
      "/assistant",
      "/exams",
    ]) {
      expect(await decideProxy(req(path), as(null))).toEqual({
        action: "redirect",
        pathname: "/login",
        query: { redirect: path },
      });
      for (const role of [
        "admin",
        "department_coordinator",
        "faculty",
        "club",
      ] as Role[]) {
        expect(await decideProxy(req(path), as(role))).toEqual({
          action: "next",
        });
      }
    }
    expect(await decideProxy(req("/"), as(null))).toEqual({ action: "next" });
    expect(await decideProxy(req("/roomsx"), as(null))).toEqual({
      action: "next",
    });
  });

  it("bounces signed-in users from /login and /signup to /dashboard", async () => {
    for (const path of ["/login", "/signup"]) {
      expect(await decideProxy(req(path), as("club"))).toEqual({
        action: "redirect",
        pathname: "/dashboard",
        query: {},
      });
      expect(await decideProxy(req(path), as(null))).toEqual({
        action: "next",
      });
    }
  });

  it("doesn't gate static files or look up a session for them", async () => {
    const getSession = vi.fn(as(null));
    expect(await decideProxy(req("/dashboard/logo.png"), getSession)).toEqual({
      action: "next",
    });
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe("decideProxy: API", () => {
  it("requires a session outside /api/auth and /api/health", async () => {
    for (const path of [
      "/api/timetable",
      "/api/admin/reset",
      "/api/export/schedule.json",
      "/api/healthz",
      "/api/authx",
    ]) {
      expect(await decideProxy(req(path), as(null))).toEqual({
        action: "reject",
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Please sign in to continue.",
      });
      expect(await decideProxy(req(path), as("club"))).toEqual({
        action: "next",
      });
    }
  });

  it("leaves /api/auth/* and /api/health public without reading the session", async () => {
    const getSession = vi.fn(as(null));
    for (const path of ["/api/auth/login", "/api/auth/me", "/api/health"]) {
      expect(await decideProxy(req(path), getSession)).toEqual({
        action: "next",
      });
    }
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutating requests with 403, even on public routes", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const path of ["/api/auth/login", "/api/bookings"]) {
        expect(
          await decideProxy(
            req(path, { method, origin: "https://evil.example" }),
            as("admin"),
          ),
        ).toMatchObject({ action: "reject", status: 403, code: "FORBIDDEN" });
      }
    }
  });

  it("rejects mutations a browser marks Sec-Fetch-Site: cross-site", async () => {
    const post = (fetchSite: string) =>
      req("/api/auth/logout", { method: "POST", fetchSite });
    expect(await decideProxy(post("cross-site"), as(null))).toMatchObject({
      action: "reject",
      status: 403,
    });
    for (const site of ["same-origin", "same-site", "none"]) {
      expect(await decideProxy(post(site), as(null))).toEqual({
        action: "next",
      });
    }
    expect(
      await decideProxy(
        req("/api/auth/me", { fetchSite: "cross-site" }),
        as(null),
      ),
    ).toEqual({ action: "next" });
  });

  it("allows same-origin and Origin-less mutations, and cross-origin reads", async () => {
    const post = (origin: string | null) =>
      req("/api/auth/login", { method: "POST", origin });
    expect(await decideProxy(post("http://localhost:3000"), as(null))).toEqual({
      action: "next",
    });
    expect(await decideProxy(post(null), as(null))).toEqual({
      action: "next",
    });
    expect(
      await decideProxy(
        req("/api/auth/me", { origin: "https://evil.example" }),
        as(null),
      ),
    ).toEqual({ action: "next" });
  });
});

describe("isCrossOrigin", () => {
  it("compares the Origin host (with port) to the request hosts", () => {
    const hosts = ["localhost:3112", "cit.example.app"];
    expect(isCrossOrigin("http://localhost:3112", hosts)).toBe(false);
    expect(isCrossOrigin("https://cit.example.app", hosts)).toBe(false);
    expect(isCrossOrigin("http://localhost:3000", hosts)).toBe(true);
    expect(isCrossOrigin("https://cit.example.app.evil.io", hosts)).toBe(true);
    expect(isCrossOrigin("null", hosts)).toBe(true);
    expect(isCrossOrigin("garbage", hosts)).toBe(true);
    expect(isCrossOrigin(null, hosts)).toBe(false);
  });
});

describe("requestHosts", () => {
  const headers = new Headers({
    host: "LOCALHOST:3112",
    "x-forwarded-host": "evil.example, other.example",
  });

  it("ignores X-Forwarded-Host unless it is trusted (Vercel)", () => {
    expect(requestHosts(headers, false)).toEqual(["localhost:3112"]);
    expect(requestHosts(headers, true)).toEqual([
      "localhost:3112",
      "evil.example",
    ]);
  });

  it("so a forged X-Forwarded-Host can't make a foreign Origin look local", async () => {
    const decision = await decideProxy(
      {
        method: "POST",
        pathname: "/api/auth/login",
        origin: "https://evil.example",
        hosts: requestHosts(headers, false),
      },
      as(null),
    );
    expect(decision).toMatchObject({ action: "reject", status: 403 });
  });
});

describe("needsSession", () => {
  it("is false for public API routes, assets and unrelated pages", () => {
    expect(needsSession("/api/auth/login")).toBe(false);
    expect(needsSession("/api/health")).toBe(false);
    expect(needsSession("/admin/x.css")).toBe(false);
    expect(needsSession("/")).toBe(false);
    expect(needsSession("/api/rooms")).toBe(true);
    expect(needsSession("/coordinator")).toBe(true);
    expect(needsSession("/login")).toBe(true);
  });
});

describe("proxy()", () => {
  let facultyCookie = "";

  beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", testSecret());
    facultyCookie = `cit_nexus_session=${await signSession(user("faculty"))}`;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const call = (
    path: string,
    init: { method?: string; headers?: Record<string, string> } = {},
  ) =>
    proxy(
      new NextRequest(`http://localhost:3112${path}`, {
        method: init.method ?? "GET",
        headers: { host: "localhost:3112", ...init.headers },
      }),
    );

  it("redirects with the prototype's URLs", async () => {
    const anon = await call("/admin");
    expect(anon.status).toBe(307);
    expect(anon.headers.get("location")).toBe(
      "http://localhost:3112/login?redirect=%2Fadmin",
    );

    const wrongRole = await call("/admin", {
      headers: { cookie: facultyCookie },
    });
    expect(wrongRole.headers.get("location")).toBe(
      "http://localhost:3112/unauthorized?role=Faculty&attemptedSector=%2Fadmin",
    );

    const ok = await call("/faculty", { headers: { cookie: facultyCookie } });
    expect(ok.headers.get("x-middleware-next")).toBe("1");

    const appPage = await call("/timetable");
    expect(appPage.headers.get("location")).toBe(
      "http://localhost:3112/login?redirect=%2Ftimetable",
    );
  });

  it("answers API rejections with the error envelope", async () => {
    const anon = await call("/api/timetable");
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Please sign in to continue.",
      },
    });

    const csrf = await call("/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(csrf.status).toBe(403);
    expect((await csrf.json()).error.code).toBe("FORBIDDEN");

    const signedIn = await call("/api/timetable", {
      headers: { cookie: facultyCookie },
    });
    expect(signedIn.headers.get("x-middleware-next")).toBe("1");
  });
});
