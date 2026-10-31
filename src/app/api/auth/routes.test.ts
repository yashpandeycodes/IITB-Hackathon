import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeMongoClient, getDb } from "@/lib/db/client";
import type { UserDoc } from "@/lib/db/repos/users";
import { limits, resetRateLimits } from "@/lib/auth/rate-limit";
import { seedDemoUsers } from "@/lib/auth/seed";
import { verifySession } from "@/lib/auth/session";
import {
  mongoAvailable,
  TEST_MONGO_URI,
  testSecret,
  throwawayDbName,
} from "@/lib/auth/test-db";
import { POST as demoLogin } from "./demo-login/route";
import { GET as google } from "./google/route";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as me } from "./me/route";
import { POST as resendOtp } from "./resend-otp/route";
import { POST as signup } from "./signup/route";
import { POST as verifyOtp } from "./verify-otp/route";

/** Codes "sent" by the mocked mail service; responses never contain them. */
const mail = vi.hoisted(() => ({
  status: "ready" as "ready" | "dev-log" | "unavailable",
  sent: [] as { email: string; name: string; code: string }[],
}));

vi.mock("@/lib/services/brevo-mail", () => ({
  mailStatus: () => mail.status,
  sendOtpEmail: async (email: string, name: string, code: string) => {
    mail.sent.push({ email, name, code });
    return { success: true, messageId: `<test-${mail.sent.length}>` };
  },
}));

/** The latest code emailed to `email`. */
function lastCode(email: string): string {
  const entry = mail.sent.findLast((m) => m.email === email);
  expect(entry).toBeDefined();
  return entry!.code;
}

/** No response body may carry the code (or the old demo fields). */
async function expectNoCode(res: Response, email: string) {
  const text = await res.clone().text();
  expect(text).not.toContain(lastCode(email));
  expect(text).not.toMatch(/demoOtp|demoMode/);
}

const available = await mongoAvailable();

type Json = Record<string, unknown> & {
  error?: unknown;
  data?: Record<string, unknown>;
};

/** A browser: remembers the cookies responses set and sends them back. */
class Browser {
  private jar = new Map<string, string>();

  constructor(private ip = "203.0.113.1") {}

  absorb(res: Response): Response {
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (expired || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return res;
  }

  cookie(name: string): string | undefined {
    return this.jar.get(name);
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    return {
      "x-forwarded-for": this.ip,
      ...(cookie ? { cookie } : {}),
      ...extra,
    };
  }

  post(path: string, body: unknown) {
    return new NextRequest(`http://localhost:3112/api/auth/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: this.headers({ "content-type": "application/json" }),
    });
  }

  get(path: string) {
    return new NextRequest(`http://localhost:3112/api/auth/${path}`, {
      headers: this.headers(),
    });
  }
}

const json = async (res: Response) => (await res.json()) as Json;

const STRONG = "Str0ng!Pass";

function signupBody(email: string, role: string, password = STRONG) {
  return {
    fullName: "Test Person",
    email,
    role,
    password,
    confirmPassword: password,
    agreedToTerms: true,
  };
}

describe.skipIf(!available)("auth routes (throwaway DB)", () => {
  beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", testSecret());
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("MONGODB_URI", TEST_MONGO_URI);
    vi.stubEnv("MONGODB_DB", throwawayDbName());
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("VERCEL", undefined);
    await seedDemoUsers(await getDb());
  });

  afterAll(async () => {
    await (await getDb()).dropDatabase();
    await closeMongoClient();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    resetRateLimits();
    mail.status = "ready";
    mail.sent.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("VERCEL", undefined);
  });

  const users = async () => (await getDb()).collection<UserDoc>("users");

  /** Signs up a club account from `browser`; returns the emailed code. */
  async function pendingClub(
    browser: Browser,
    email: string,
    password = STRONG,
  ) {
    const res = browser.absorb(
      await signup(
        browser.post(
          "signup",
          signupBody(email, "Club Representative", password),
        ),
      ),
    );
    expect(res.status).toBe(200);
    await expectNoCode(res, email);
    return lastCode(email);
  }

  describe("POST /api/auth/login", () => {
    it("signs in and sets an httpOnly, Lax, 12 h session cookie", async () => {
      const b = new Browser();
      const res = b.absorb(
        await login(
          b.post("login", { email: " Admin@CIT.demo ", password: "Admin@123" }),
        ),
      );
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({
        ok: true,
        success: true,
        data: { id: "u_admin", role: "admin", email: "admin@cit.demo" },
        user: { id: "u_admin", role: "Admin", name: "Dean's Office" },
      });
      const setCookie = res.headers.getSetCookie().join("\n");
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=lax/i);
      expect(setCookie).toMatch(/Path=\//);
      expect(setCookie).toMatch(/Max-Age=43200/);
      expect((await verifySession(b.cookie("cit_nexus_session")))?.role).toBe(
        "admin",
      );
    });

    it("answers unknown emails and wrong passwords with one generic 401", async () => {
      const b = new Browser();
      for (const body of [
        { email: "admin@cit.demo", password: "nope" },
        { email: "ghost@cit.demo", password: "Admin@123" },
      ]) {
        const res = await login(b.post("login", body));
        expect(res.status).toBe(401);
        expect(await json(res)).toMatchObject({
          ok: false,
          error: "Invalid institutional email or password.",
          code: "UNAUTHENTICATED",
        });
        expect(res.headers.getSetCookie()).toEqual([]);
      }
    });

    it("rejects malformed input with a single-line error", async () => {
      const b = new Browser();
      const res = await login(b.post("login", { email: "x", password: "" }));
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe(
        "Please enter a valid email address",
      );
    });

    it("ignores X-Forwarded-For off Vercel: rotating it doesn't reset the limit", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await login(
          new Browser(`10.0.0.${i}`).post("login", {
            email: "club@cit.demo",
            password: "wrong",
          }),
        );
        expect(res.status).toBe(401);
      }
      const blocked = await login(
        new Browser("10.9.9.9").post("login", {
          email: "club@cit.demo",
          password: "Club@123",
        }),
      );
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
      expect(await json(blocked)).toMatchObject({ code: "RATE_LIMITED" });
    });

    it("on Vercel limits per IP + email (10) and per email from any IP (20)", async () => {
      vi.stubEnv("VERCEL", "1");
      const attempt = (ip: string, password = "wrong") =>
        login(
          new Browser(ip).post("login", { email: "club@cit.demo", password }),
        );
      for (let i = 0; i < 10; i++) {
        expect((await attempt("10.0.0.1")).status).toBe(401);
      }
      expect((await attempt("10.0.0.1", "Club@123")).status).toBe(429);
      expect((await attempt("10.0.0.2", "Club@123")).status).toBe(200);

      for (let i = 0; i < 10; i++) {
        expect((await attempt(`10.1.0.${i}`)).status).toBe(401);
      }
      expect((await attempt("10.2.0.1", "Club@123")).status).toBe(429);
    });

    it("doesn't count successful sign-ins (judges share demo accounts)", async () => {
      for (let i = 0; i < 25; i++) {
        const res = await login(
          new Browser().post("login", {
            email: "admin@cit.demo",
            password: "Admin@123",
          }),
        );
        expect(res.status).toBe(200);
      }
    });
  });

  describe("POST /api/auth/demo-login", () => {
    it.each([
      ["admin", "admin@cit.demo"],
      ["department_coordinator", "coord.cse@cit.demo"],
      ["faculty", "faculty@cit.demo"],
      ["club", "club@cit.demo"],
    ])("signs in as %s and /me returns it", async (role, email) => {
      const b = new Browser();
      const res = b.absorb(await demoLogin(b.post("demo-login", { role }), {}));
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({
        ok: true,
        data: { role, email },
      });

      const meRes = await me(b.get("me"), {});
      expect(meRes.status).toBe(200);
      expect(await json(meRes)).toMatchObject({
        ok: true,
        data: { role, email },
        authenticated: true,
        user: { email, isVerified: true },
      });
    });

    it("accepts display labels and rejects unknown roles", async () => {
      const b = new Browser();
      const label = await demoLogin(
        b.post("demo-login", { role: "Faculty" }),
        {},
      );
      expect((await json(label)).data).toMatchObject({ role: "faculty" });
      const bad = await demoLogin(b.post("demo-login", { role: "dean" }), {});
      expect(bad.status).toBe(400);
      expect(await json(bad)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    });

    it("re-seeds a missing demo account on demand", async () => {
      await (await users()).deleteOne({ _id: "u_club_dramatics" });
      const b = new Browser();
      const res = await demoLogin(b.post("demo-login", { role: "club" }), {});
      expect(res.status).toBe(200);
      expect(
        await (await users()).countDocuments({ email: "club@cit.demo" }),
      ).toBe(1);
    });

    it("allows 30 per IP per 10 minutes", async () => {
      const b = new Browser();
      for (let i = 0; i < 30; i++) {
        expect(
          (await demoLogin(b.post("demo-login", { role: "club" }), {})).status,
        ).toBe(200);
      }
      const blocked = await demoLogin(
        b.post("demo-login", { role: "club" }),
        {},
      );
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
      expect(await json(blocked)).toMatchObject({
        ok: false,
        error: { code: "RATE_LIMITED" },
      });
    });

    it("is refused when DEMO_LOGIN_ENABLED=false", async () => {
      vi.stubEnv("DEMO_LOGIN_ENABLED", "false");
      vi.resetModules();
      try {
        const route = await import("./demo-login/route");
        const b = new Browser();
        const res = await route.POST(
          b.post("demo-login", { role: "admin" }),
          {},
        );
        expect(res.status).toBe(403);
        expect(await json(res)).toMatchObject({ error: { code: "FORBIDDEN" } });
      } finally {
        vi.stubEnv("DEMO_LOGIN_ENABLED", "true");
      }
    });
  });

  describe("GET /api/auth/me and POST /api/auth/logout", () => {
    it("401s without a cookie or with a forged one", async () => {
      const anon = new Browser();
      const forged = new NextRequest("http://localhost:3112/api/auth/me", {
        headers: { cookie: "cit_nexus_session=eyJhbGciOiJIUzI1NiJ9.e30.x" },
      });
      for (const req of [anon.get("me"), forged]) {
        const res = await me(req, {});
        expect(res.status).toBe(401);
        expect(await json(res)).toMatchObject({
          ok: false,
          error: { code: "UNAUTHENTICATED" },
          authenticated: false,
          user: null,
        });
      }
    });

    it("logout revokes only that session; other judges on the same account stay signed in", async () => {
      const judgeA = new Browser("198.51.100.1");
      const judgeB = new Browser("198.51.100.2");
      for (const judge of [judgeA, judgeB]) {
        judge.absorb(
          await demoLogin(judge.post("demo-login", { role: "admin" }), {}),
        );
      }
      const stolenToken = judgeA.cookie("cit_nexus_session")!;

      const out = judgeA.absorb(await logout(judgeA.post("logout", {}), {}));
      expect(out.status).toBe(200);
      expect(await json(out)).toMatchObject({ ok: true, success: true });
      expect(out.headers.getSetCookie().join("\n")).toMatch(
        /cit_nexus_session=;.*Max-Age=0/i,
      );
      expect(judgeA.cookie("cit_nexus_session")).toBeUndefined();

      const replay = await me(
        new NextRequest("http://localhost:3112/api/auth/me", {
          headers: { cookie: `cit_nexus_session=${stolenToken}` },
        }),
        {},
      );
      expect(replay.status).toBe(401);
      expect((await me(judgeB.get("me"), {})).status).toBe(200);

      const revoked = await (
        await getDb()
      )
        .collection("revoked_sessions")
        .find()
        .toArray();
      expect(revoked).toHaveLength(1);
      expect(revoked[0].expires_at).toBeInstanceOf(Date);
    });

    it("signs out a session whose account was deleted", async () => {
      const b = new Browser();
      const email = "gone@cit.demo";
      const otp = await pendingClub(b, email);
      b.absorb(await verifyOtp(b.post("verify-otp", { email, otp })));
      expect((await me(b.get("me"), {})).status).toBe(200);
      await (await users()).deleteOne({ email });
      expect((await me(b.get("me"), {})).status).toBe(401);
    });
  });

  describe("POST /api/auth/signup", () => {
    it.each([
      ["Admin", /Admin and Department Coordinator/],
      ["Department Coordinator", /Admin and Department Coordinator/],
      ["department_coordinator", /Admin and Department Coordinator/],
      ["Faculty", /Faculty accounts are set up by the Dean's office/],
      ["faculty", /Faculty accounts are set up by the Dean's office/],
    ])("refuses to create %s accounts (403)", async (role, message) => {
      const b = new Browser();
      const res = await signup(
        b.post("signup", signupBody("boss@cit.demo", role)),
      );
      expect(res.status).toBe(403);
      expect(await json(res)).toMatchObject({
        code: "FORBIDDEN",
        error: expect.stringMatching(message),
      });
      expect(
        await (await users()).countDocuments({ email: "boss@cit.demo" }),
      ).toBe(0);
    });

    it("rejects an email that is already registered (409 EMAIL_TAKEN)", async () => {
      const b = new Browser();
      const res = await signup(
        b.post("signup", signupBody("club@cit.demo", "Club Representative")),
      );
      expect(res.status).toBe(409);
      expect(await json(res)).toMatchObject({ code: "EMAIL_TAKEN" });
    });

    it("validates the form server-side", async () => {
      const b = new Browser();
      const weak = await signup(
        b.post(
          "signup",
          signupBody("w@cit.demo", "Club Representative", "weak"),
        ),
      );
      expect(weak.status).toBe(400);
      const terms = await signup(
        b.post("signup", {
          ...signupBody("t@cit.demo", "Club Representative"),
          agreedToTerms: false,
        }),
      );
      expect((await json(terms)).error).toBe(
        "You must acknowledge the platform terms",
      );
    });

    it("creates a pending club account bound to the browser, then verifies it", async () => {
      const b = new Browser();
      const email = "new.club@cit.demo";
      const res = b.absorb(
        await signup(
          b.post("signup", signupBody(email, "Club Representative")),
        ),
      );
      expect(res.status).toBe(200);
      await expectNoCode(res, email);
      expect(await json(res)).toEqual({
        ok: true,
        data: { email },
        success: true,
        message:
          "A 6-digit verification code has been dispatched to your email address.",
        email,
      });
      const code = lastCode(email);
      expect(code).toMatch(/^\d{6}$/);
      expect(mail.sent.at(-1)?.name).toBe("Test Person");
      expect(res.headers.getSetCookie().join("\n")).toMatch(
        /cit_pending_signup=[^;]+;.*Path=\/api\/auth;.*HttpOnly;.*SameSite=lax/i,
      );

      const doc = (await (await users()).findOne({ email }))!;
      expect(doc._id).toMatch(/^u_[0-9a-f]{12}$/);
      expect(doc).toMatchObject({ role: "club", is_verified: false });
      expect(doc.pending_nonce_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(doc.pending_nonce_hash).not.toBe(b.cookie("cit_pending_signup"));
      const ttl = doc.unverified_expires_at!.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(23 * 3600_000);
      expect(ttl).toBeLessThanOrEqual(24 * 3600_000);

      const wrongCode = code === "000000" ? "111111" : "000000";
      const wrong = await verifyOtp(
        b.post("verify-otp", { email, otp: wrongCode }),
      );
      expect(wrong.status).toBe(400);
      expect((await json(wrong)).error).toBe(
        "Incorrect code. 4 attempts left.",
      );

      const ok = b.absorb(
        await verifyOtp(b.post("verify-otp", { email, otp: code })),
      );
      expect(ok.status).toBe(200);
      expect(await json(ok)).toMatchObject({
        success: true,
        user: { email, role: "Club Representative" },
      });
      expect(b.cookie("cit_pending_signup")).toBeUndefined();
      expect((await verifySession(b.cookie("cit_nexus_session")))?.role).toBe(
        "club",
      );
      expect(await (await users()).findOne({ email })).toMatchObject({
        is_verified: true,
        pending_nonce_hash: null,
        unverified_expires_at: null,
      });
      expect(
        (await login(new Browser().post("login", { email, password: STRONG })))
          .status,
      ).toBe(200);
    });

    it("signing in to an unverified account rebinds verification to that browser", async () => {
      const first = new Browser();
      const email = "later@cit.demo";
      await pendingClub(first, email);

      const second = new Browser();
      const early = second.absorb(
        await login(second.post("login", { email, password: STRONG })),
      );
      expect(early.status).toBe(403);
      await expectNoCode(early, email);
      expect(await json(early)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
        requiresOtp: true,
        email,
        error: expect.stringMatching(/not been verified/),
      });
      expect(second.cookie("cit_pending_signup")).toBeDefined();

      const ok = await verifyOtp(
        second.post("verify-otp", { email, otp: lastCode(email) }),
      );
      expect(ok.status).toBe(200);
    });

    it("answers MAIL_UNAVAILABLE and creates nothing when mail can't be sent", async () => {
      mail.status = "unavailable";
      const b = new Browser();
      const res = await signup(
        b.post("signup", signupBody("prod@cit.demo", "Club Representative")),
      );
      expect(res.status).toBe(503);
      expect(await json(res)).toEqual({
        ok: false,
        code: "MAIL_UNAVAILABLE",
        error: expect.stringMatching(/use a demo account/),
      });
      expect(mail.sent).toEqual([]);
      expect(
        await (await users()).countDocuments({ email: "prod@cit.demo" }),
      ).toBe(0);
    });

    it("caps verification emails globally (60 per hour) with MAIL_UNAVAILABLE", async () => {
      for (let i = 0; i < 60; i++) limits.otpMailGlobal.hit("all");
      const b = new Browser();
      const res = await signup(
        b.post("signup", signupBody("capped@cit.demo", "Club Representative")),
      );
      expect(res.status).toBe(503);
      expect(await json(res)).toMatchObject({ code: "MAIL_UNAVAILABLE" });
      expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    });
  });

  describe("pre-verification takeover (auditor regression)", () => {
    it("an attacker re-submitting the victim's pending sign-up can't take the account", async () => {
      const email = "victim@cit.demo";
      const victim = new Browser("192.0.2.10");
      const attacker = new Browser("192.0.2.66");

      const victimOtp = await pendingClub(victim, email, "Victim!Pass1");

      const hijack = attacker.absorb(
        await signup(
          attacker.post(
            "signup",
            signupBody(email, "Club Representative", "Attack!Pass1"),
          ),
        ),
      );
      expect(hijack.status).toBe(409);
      expect(await json(hijack)).toMatchObject({ code: "CONFLICT" });
      expect(hijack.headers.getSetCookie()).toEqual([]);

      // Without the victim's browser nonce the attacker can neither verify nor resend.
      expect(
        (
          await verifyOtp(
            attacker.post("verify-otp", { email, otp: victimOtp }),
          )
        ).status,
      ).toBe(400);
      expect(
        (await resendOtp(attacker.post("resend-otp", { email }))).status,
      ).toBe(400);

      const verified = await verifyOtp(
        victim.post("verify-otp", { email, otp: victimOtp }),
      );
      expect(verified.status).toBe(200);

      const attackerLogin = await login(
        attacker.post("login", { email, password: "Attack!Pass1" }),
      );
      expect(attackerLogin.status).toBe(401);
      const victimLogin = await login(
        new Browser().post("login", { email, password: "Victim!Pass1" }),
      );
      expect(victimLogin.status).toBe(200);
    });

    it("an attacker who signs up first can't get the owner to verify the attacker's password", async () => {
      const email = "owner@cit.demo";
      const attacker = new Browser("192.0.2.66");
      const owner = new Browser("192.0.2.20");
      await pendingClub(attacker, email, "Attack!Pass1");

      const blocked = await signup(
        owner.post(
          "signup",
          signupBody(email, "Club Representative", "Owner!Pass1"),
        ),
      );
      expect(blocked.status).toBe(409);

      // Once the attacker's code expires the owner's sign-up replaces it.
      await (
        await users()
      ).updateOne(
        { email },
        { $set: { otp_expires_at: "2020-01-01T00:00:00+05:30" } },
      );
      const ownerOtp = await pendingClub(owner, email, "Owner!Pass1");
      expect(
        (await verifyOtp(attacker.post("verify-otp", { email, otp: ownerOtp })))
          .status,
      ).toBe(400);
      expect(
        (await verifyOtp(owner.post("verify-otp", { email, otp: ownerOtp })))
          .status,
      ).toBe(200);
      expect(
        (
          await login(
            new Browser().post("login", { email, password: "Attack!Pass1" }),
          )
        ).status,
      ).toBe(401);
    });

    it("the same browser may re-submit (e.g. to fix its password) while the code is active", async () => {
      const b = new Browser();
      const email = "redo@cit.demo";
      await pendingClub(b, email, "First!Pass1");
      const otp = await pendingClub(b, email, "Second!Pass1");
      expect(
        (await verifyOtp(b.post("verify-otp", { email, otp }))).status,
      ).toBe(200);
      expect(
        (
          await login(
            new Browser().post("login", { email, password: "Second!Pass1" }),
          )
        ).status,
      ).toBe(200);
    });
  });

  describe("OTP expiry, attempts and resend", () => {
    it("rejects an expired code and invalidates it", async () => {
      const b = new Browser();
      const email = "expired@cit.demo";
      const otp = await pendingClub(b, email);
      await (
        await users()
      ).updateOne(
        { email },
        { $set: { otp_expires_at: "2020-01-01T00:00:00+05:30" } },
      );
      const res = await verifyOtp(b.post("verify-otp", { email, otp }));
      expect(res.status).toBe(400);
      expect((await json(res)).error).toMatch(/expired/);
      expect((await (await users()).findOne({ email }))!.otp_hash).toBeNull();
    });

    it("allows 5 attempts per code", async () => {
      const b = new Browser();
      const email = "guesser@cit.demo";
      const otp = await pendingClub(b, email);
      const wrong = otp === "999999" ? "999998" : "999999";
      for (let i = 1; i <= 5; i++) {
        const res = await verifyOtp(
          b.post("verify-otp", { email, otp: wrong }),
        );
        expect(res.status).toBe(400);
        if (i === 5)
          expect((await json(res)).error).toMatch(/No attempts left/);
      }
      const late = await verifyOtp(b.post("verify-otp", { email, otp }));
      expect(late.status).toBe(400);
      expect((await json(late)).error).toMatch(/No active verification code/);
    });

    it("rate-limits verify-otp per email", async () => {
      const b = new Browser();
      const email = "flood@cit.demo";
      await pendingClub(b, email);
      for (let i = 0; i < 10; i++) {
        await verifyOtp(b.post("verify-otp", { email, otp: "123456" }));
      }
      const res = await verifyOtp(
        b.post("verify-otp", { email, otp: "123456" }),
      );
      expect(res.status).toBe(429);
    });

    it("resend replaces the code and is limited to 5 emails per address", async () => {
      const b = new Browser();
      const email = "resend@cit.demo";
      const first = await pendingClub(b, email);

      const res = b.absorb(await resendOtp(b.post("resend-otp", { email })));
      expect(res.status).toBe(200);
      await expectNoCode(res, email);
      expect(await json(res)).toMatchObject({ ok: true, success: true });
      const fresh = lastCode(email);
      expect(fresh).toMatch(/^\d{6}$/);
      if (first !== fresh) {
        const stale = await verifyOtp(
          b.post("verify-otp", { email, otp: first }),
        );
        expect(stale.status).toBe(400);
      }
      for (let i = 0; i < 3; i++) {
        expect((await resendOtp(b.post("resend-otp", { email }))).status).toBe(
          200,
        );
      }
      expect((await resendOtp(b.post("resend-otp", { email }))).status).toBe(
        429,
      );

      const unknown = await resendOtp(
        b.post("resend-otp", { email: "nobody@cit.demo" }),
      );
      expect(unknown.status).toBe(400);
    });
  });

  describe("unverified-account expiry", () => {
    it("has a partial TTL index on unverified_expires_at", async () => {
      const indexes = await (await users()).indexes();
      expect(indexes).toContainEqual(
        expect.objectContaining({
          name: "unverified_ttl",
          expireAfterSeconds: 0,
          partialFilterExpression: { is_verified: false },
        }),
      );
    });
  });

  describe("GET /api/auth/google", () => {
    it("redirects to /login?error=google_unavailable (302) without setting a session", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "1234.apps.googleusercontent.com");
      const res = google(
        new NextRequest("http://localhost:3112/api/auth/google?demo=true"),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3112/login?error=google_unavailable",
      );
      expect(res.headers.getSetCookie()).toEqual([]);
    });
  });
});
