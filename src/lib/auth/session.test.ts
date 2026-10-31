import { decodeJwt, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/contracts/user";
import { testSecret } from "./test-db";

const USER: SessionUser = {
  id: "u_coord_cse",
  email: "coord.cse@cit.demo",
  name: "CSE Coordinator",
  role: "department_coordinator",
  department: "CSE",
  faculty_id: null,
  club: null,
};

/** Fresh modules so the memoised env picks up the stubbed secret. */
async function load() {
  vi.resetModules();
  return {
    session: await import("./session"),
    jwt: await import("./jwt"),
  };
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", testSecret());
  vi.stubEnv("JWT_SECRET", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("session tokens", () => {
  it("round-trips exactly the SessionUser claims", async () => {
    const { session } = await load();
    const token = await session.signSession(USER);
    expect(await session.verifySession(token)).toEqual(USER);

    const claims = decodeJwt(token);
    expect(claims.exp! - claims.iat!).toBe(12 * 60 * 60);
    expect(Object.keys(claims).sort()).toEqual(
      [...Object.keys(USER), "iat", "exp", "jti"].sort(),
    );
  });

  it("gives every session its own jti and exposes it with the expiry", async () => {
    const { session } = await load();
    const a = await session.signSession(USER);
    const b = await session.signSession(USER);
    expect(decodeJwt(a).jti).not.toBe(decodeJwt(b).jti);

    const claims = await session.verifySessionClaims(a);
    expect(claims).toEqual({
      user: USER,
      jti: decodeJwt(a).jti,
      expiresAt: new Date(decodeJwt(a).exp! * 1000),
    });
  });

  it("requires exp, iat and jti and rejects tokens older than 12 hours", async () => {
    const { session } = await load();
    const key = session.getSessionKey();
    const sign = (build: (jwt: SignJWT) => SignJWT) =>
      build(new SignJWT({ ...USER }).setProtectedHeader({ alg: "HS256" })).sign(
        key,
      );

    const noJti = await sign((t) => t.setIssuedAt().setExpirationTime("1h"));
    const noIat = await sign((t) => t.setJti("j1").setExpirationTime("1h"));
    const noExp = await sign((t) => t.setJti("j2").setIssuedAt());
    const now = Math.floor(Date.now() / 1000);
    const tooOld = await sign((t) =>
      t
        .setJti("j3")
        .setIssuedAt(now - 13 * 60 * 60)
        .setExpirationTime(now + 60 * 60),
    );
    for (const token of [noJti, noIat, noExp, tooOld]) {
      expect(await session.verifySession(token)).toBeNull();
    }
    const fine = await sign((t) =>
      t.setJti("j4").setIssuedAt().setExpirationTime("1h"),
    );
    expect(await session.verifySession(fine)).toEqual(USER);
  });

  it("never signs fields outside the contract (e.g. a password hash)", async () => {
    const { session } = await load();
    const doc = { ...USER, password_hash: "$2b$10$abc", otp_hash: "x" };
    const claims = decodeJwt(await session.signSession(doc));
    expect(claims).not.toHaveProperty("password_hash");
    expect(claims).not.toHaveProperty("otp_hash");
  });

  it("expires after 12 hours", async () => {
    vi.useFakeTimers({ now: new Date("2027-02-08T09:00:00Z") });
    const { session } = await load();
    const token = await session.signSession(USER);

    vi.setSystemTime(new Date("2027-02-08T20:59:00Z"));
    expect(await session.verifySession(token)).toEqual(USER);
    vi.setSystemTime(new Date("2027-02-08T21:00:01Z"));
    expect(await session.verifySession(token)).toBeNull();
  });

  it("rejects tampered, foreign and unsigned tokens", async () => {
    const { session } = await load();
    const token = await session.signSession(USER);
    const [header, payload, signature] = token.split(".");

    const forged = Buffer.from(
      JSON.stringify({ ...decodeJwt(token), role: "admin" }),
    ).toString("base64url");
    expect(
      await session.verifySession(`${header}.${forged}.${signature}`),
    ).toBeNull();
    expect(
      await session.verifySession(`${header}.${payload}.${signature}x`),
    ).toBeNull();

    const foreign = await new SignJWT({ ...USER })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(testSecret()));
    expect(await session.verifySession(foreign)).toBeNull();

    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${payload}.`;
    expect(await session.verifySession(none)).toBeNull();
    expect(await session.verifySession("")).toBeNull();
    expect(await session.verifySession("not-a-jwt")).toBeNull();
  });

  it("rejects a validly signed token whose claims don't match the contract", async () => {
    const { session } = await load();
    const legacy = await new SignJWT({
      id: "usr_1",
      name: "Old",
      email: "old@cit.demo",
      role: "Faculty",
      isVerified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(session.getSessionKey());
    expect(await session.verifySession(legacy)).toBeNull();
  });
});

describe("secret handling (fail closed)", () => {
  it("refuses to sign and verifies nothing without a secret", async () => {
    const { session: withSecret } = await load();
    const token = await withSecret.signSession(USER);

    vi.stubEnv("AUTH_SECRET", "");
    const { session } = await load();
    await expect(session.signSession(USER)).rejects.toThrow(/AUTH_SECRET/);
    expect(await session.verifySession(token)).toBeNull();
  });

  it("rejects a JWT_SECRET shorter than 32 characters", async () => {
    vi.stubEnv("JWT_SECRET", "too-short");
    const { session } = await load();
    await expect(session.signSession(USER)).rejects.toThrow(/32/);
  });

  it("uses JWT_SECRET over AUTH_SECRET when set", async () => {
    vi.stubEnv("JWT_SECRET", testSecret());
    const { session: viaJwtSecret } = await load();
    const token = await viaJwtSecret.signSession(USER);
    expect(await viaJwtSecret.verifySession(token)).toEqual(USER);

    vi.stubEnv("JWT_SECRET", "");
    const { session: viaAuthSecret } = await load();
    expect(await viaAuthSecret.verifySession(token)).toBeNull();
  });
});

describe("cookies", () => {
  it("reads a repeated cookie like Next does: the last decodable value wins", async () => {
    const { session } = await load();
    const header = "cit_nexus_session=A; other=1; cit_nexus_session=B";
    expect(session.getCookieFromHeader(header, "cit_nexus_session")).toBe("B");
    expect(
      session.getCookieFromHeader(
        "cit_nexus_session=A; cit_nexus_session=%E0%A4%A",
        "cit_nexus_session",
      ),
    ).toBe("A");
    expect(
      session.getCookieFromHeader("x=1", "cit_nexus_session"),
    ).toBeUndefined();
  });

  it("createSession builds an httpOnly, Lax, path=/ cookie for 12 hours", async () => {
    const { session } = await load();
    const cookie = await session.createSession(USER);
    expect(cookie).toMatchObject({
      name: "cit_nexus_session",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 43_200,
    });
    expect(await session.verifySession(cookie.value)).toEqual(USER);
  });

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { session } = await load();
    expect((await session.createSession(USER)).secure).toBe(true);
    expect(session.clearSession().secure).toBe(true);
  });

  it("clearSession expires the cookie", async () => {
    const { session } = await load();
    expect(session.clearSession()).toMatchObject({
      name: "cit_nexus_session",
      value: "",
      maxAge: 0,
    });
  });

  it("readSession accepts a Request or a cookie store", async () => {
    const { session } = await load();
    const token = await session.signSession(USER);

    const request = new Request("http://localhost/api/x", {
      headers: { cookie: `theme=dark; cit_nexus_session=${token}; other=1` },
    });
    expect(await session.readSession(request)).toEqual(USER);
    expect(
      await session.readSession(new Request("http://localhost/api/x")),
    ).toBeNull();

    const store = new Map([["cit_nexus_session", { value: token }]]);
    expect(await session.readSession(store)).toEqual(USER);
  });
});

describe("jwt.ts compatibility facade", () => {
  it("exposes display-label roles to the role pages", async () => {
    const { session, jwt } = await load();
    expect(jwt.COOKIE_NAME).toBe("cit_nexus_session");
    const token = await session.signSession(USER);
    expect(await jwt.verifySessionToken(token)).toEqual({
      id: USER.id,
      name: USER.name,
      email: USER.email,
      role: "Department Coordinator",
      isVerified: true,
    });
    expect(await jwt.verifySessionToken("garbage")).toBeNull();
  });
});
