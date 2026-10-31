import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EnvValidationError,
  parseEnv,
  requireAuthSecret,
  requireMongoUri,
  requireSessionSecret,
} from "./env";

const SECRET_32 = "s".repeat(32);

describe("parseEnv", () => {
  it("applies defaults when nothing is set", () => {
    const env = parseEnv({});
    expect(env).toEqual({
      MONGODB_DB: "cit_dev",
      LLM_ENABLED: true,
      LLM_TIMEOUT_MS: 8000,
      SOLVER_TIME_BUDGET_MS: 8000,
      SOLVER_SEED: 42,
      TEAM_NAME: "CIT Crunch Week",
      APP_REFERENCE_DATE: "2027-02-08",
      DEMO_LOGIN_ENABLED: true,
      BREVO_SENDER_NAME: "CIT Nexus",
    });
    expect(env.MONGODB_URI).toBeUndefined();
    expect(env.AUTH_SECRET).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it("parses booleans and numbers from strings", () => {
    expect(parseEnv({ LLM_ENABLED: "false" }).LLM_ENABLED).toBe(false);
    expect(parseEnv({ LLM_ENABLED: " FALSE " }).LLM_ENABLED).toBe(false);
    expect(parseEnv({ LLM_ENABLED: "0" }).LLM_ENABLED).toBe(false);
    expect(parseEnv({ LLM_ENABLED: "true" }).LLM_ENABLED).toBe(true);
    expect(parseEnv({ LLM_ENABLED: "1" }).LLM_ENABLED).toBe(true);

    const env = parseEnv({
      LLM_TIMEOUT_MS: "5000",
      SOLVER_TIME_BUDGET_MS: "3000",
      SOLVER_SEED: "7",
    });
    expect(env.LLM_TIMEOUT_MS).toBe(5000);
    expect(env.SOLVER_TIME_BUDGET_MS).toBe(3000);
    expect(env.SOLVER_SEED).toBe(7);
  });

  it("rejects malformed booleans, numbers and dates", () => {
    expect(() => parseEnv({ LLM_ENABLED: "maybe" })).toThrow(/LLM_ENABLED/);
    expect(() => parseEnv({ LLM_TIMEOUT_MS: "soon" })).toThrow(
      /LLM_TIMEOUT_MS/,
    );
    expect(() => parseEnv({ SOLVER_SEED: "-1" })).toThrow(/SOLVER_SEED/);
    expect(() => parseEnv({ APP_REFERENCE_DATE: "08/02/2027" })).toThrow(
      /APP_REFERENCE_DATE/,
    );
  });

  it("rejects a short AUTH_SECRET without echoing it", () => {
    const secret = "too-short-secret-value";
    let error: unknown;
    try {
      parseEnv({ AUTH_SECRET: secret });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as Error).message).toMatch(
      /AUTH_SECRET must be at least 32 characters/,
    );
    expect((error as Error).message).not.toContain(secret);
  });

  it("accepts a 32+ character AUTH_SECRET", () => {
    expect(parseEnv({ AUTH_SECRET: SECRET_32 }).AUTH_SECRET).toBe(SECRET_32);
  });

  it("treats empty and <placeholder> values as unset", () => {
    const env = parseEnv({
      AUTH_SECRET: "<32+ random chars>",
      GEMINI_API_KEY: "",
      MONGODB_DB: "   ",
      TEAM_NAME: "<Team name>",
    });
    expect(env.AUTH_SECRET).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.MONGODB_DB).toBe("cit_dev");
    expect(env.TEAM_NAME).toBe("CIT Crunch Week");
  });

  it("ignores unrelated variables", () => {
    const env = parseEnv({
      PATH: "/usr/bin",
      MONGODB_URI: "mongodb://127.0.0.1:27017",
    });
    expect(env).not.toHaveProperty("PATH");
    expect(env.MONGODB_URI).toBe("mongodb://127.0.0.1:27017");
  });
});

describe("auth and mail settings", () => {
  it("rejects a short JWT_SECRET without echoing it", () => {
    let error: unknown;
    try {
      parseEnv({ JWT_SECRET: "short-jwt-value" });
    } catch (err) {
      error = err;
    }
    expect((error as Error).message).toMatch(
      /JWT_SECRET must be at least 32 characters/,
    );
    expect((error as Error).message).not.toContain("short-jwt-value");
  });

  it("parses DEMO_LOGIN_ENABLED and the Brevo/Google settings", () => {
    const env = parseEnv({
      DEMO_LOGIN_ENABLED: "false",
      BREVO_API_KEY: " xkeysib-abc ",
      BREVO_SENDER_EMAIL: "noreply@cit.example.org",
      BREVO_SENDER_NAME: "CIT",
      GOOGLE_CLIENT_ID: "1234.apps.googleusercontent.com",
      NEXT_PUBLIC_APP_URL: "https://cit.example.org",
    });
    expect(env).toMatchObject({
      DEMO_LOGIN_ENABLED: false,
      BREVO_API_KEY: "xkeysib-abc",
      BREVO_SENDER_EMAIL: "noreply@cit.example.org",
      BREVO_SENDER_NAME: "CIT",
      GOOGLE_CLIENT_ID: "1234.apps.googleusercontent.com",
      NEXT_PUBLIC_APP_URL: "https://cit.example.org",
    });
  });

  it("treats the .env.example placeholders as unset", () => {
    const env = parseEnv({
      JWT_SECRET: "",
      BREVO_API_KEY: "<your Brevo API key>",
      BREVO_SENDER_EMAIL: "<sender@example.org>",
      GOOGLE_CLIENT_ID: "<your Google OAuth client id>",
    });
    expect(env.JWT_SECRET).toBeUndefined();
    expect(env.BREVO_API_KEY).toBeUndefined();
    expect(env.BREVO_SENDER_EMAIL).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("rejects a malformed sender email, app URL or flag", () => {
    expect(() => parseEnv({ BREVO_SENDER_EMAIL: "nobody" })).toThrow(
      /BREVO_SENDER_EMAIL/,
    );
    expect(() => parseEnv({ NEXT_PUBLIC_APP_URL: "cit.example" })).toThrow(
      /NEXT_PUBLIC_APP_URL/,
    );
    expect(() => parseEnv({ DEMO_LOGIN_ENABLED: "sometimes" })).toThrow(
      /DEMO_LOGIN_ENABLED/,
    );
  });
});

describe("require helpers", () => {
  it("requireAuthSecret throws a clear error when unset and returns it when set", () => {
    expect(() => requireAuthSecret(parseEnv({}))).toThrow(
      /AUTH_SECRET is not set/,
    );
    expect(requireAuthSecret(parseEnv({ AUTH_SECRET: SECRET_32 }))).toBe(
      SECRET_32,
    );
  });

  it("requireSessionSecret prefers JWT_SECRET and falls back to AUTH_SECRET", () => {
    const other = "j".repeat(16) + "k".repeat(16);
    expect(requireSessionSecret(parseEnv({ AUTH_SECRET: SECRET_32 }))).toBe(
      SECRET_32,
    );
    expect(
      requireSessionSecret(
        parseEnv({ AUTH_SECRET: SECRET_32, JWT_SECRET: other }),
      ),
    ).toBe(other);
    expect(() => requireSessionSecret(parseEnv({ JWT_SECRET: "" }))).toThrow(
      /AUTH_SECRET is not set/,
    );
  });

  it("requireMongoUri throws a clear error when unset", () => {
    expect(() => requireMongoUri(parseEnv({}))).toThrow(
      /MONGODB_URI is not set/,
    );
    expect(requireMongoUri(parseEnv({ MONGODB_URI: "mongodb://db" }))).toBe(
      "mongodb://db",
    );
  });
});

describe("getServerEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reads process.env lazily and memoises the result", async () => {
    vi.resetModules();
    vi.stubEnv("MONGODB_DB", "cit_test");
    vi.stubEnv("LLM_ENABLED", "false");
    const { getServerEnv } = await import("./env");

    const first = getServerEnv();
    expect(first.MONGODB_DB).toBe("cit_test");
    expect(first.LLM_ENABLED).toBe(false);

    vi.stubEnv("MONGODB_DB", "changed");
    expect(getServerEnv()).toBe(first);
  });
});

describe("deployment checks", () => {
  const STRONG = "q7Lm2Xv9Rk4Tz8Wp1Hn6Jc3Bf5Gd0Sa-Ye_Ui";

  it("rejects a placeholder-looking AUTH_SECRET in production", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        AUTH_SECRET: "ci-placeholder-secret-not-used-at-runtime-000",
      }),
    ).toThrow(/AUTH_SECRET: Looks like a placeholder/);
  });

  it("rejects a placeholder-looking JWT_SECRET in production", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        AUTH_SECRET: STRONG,
        JWT_SECRET: "changeme-changeme-changeme-changeme-00",
      }),
    ).toThrow(/JWT_SECRET: Looks like a placeholder/);
  });

  it("allows the same value in development", () => {
    expect(
      parseEnv({ AUTH_SECRET: "ci-placeholder-secret-not-used-at-runtime-000" })
        .AUTH_SECRET,
    ).toBeDefined();
  });

  it("accepts a random AUTH_SECRET in production", () => {
    expect(
      parseEnv({ NODE_ENV: "production", AUTH_SECRET: STRONG }).AUTH_SECRET,
    ).toBe(STRONG);
  });

  it("requires MONGODB_DB on Vercel", () => {
    expect(() => parseEnv({ VERCEL: "1", AUTH_SECRET: STRONG })).toThrow(
      /MONGODB_DB: Must be set explicitly/,
    );
    expect(
      parseEnv({ VERCEL: "1", AUTH_SECRET: STRONG, MONGODB_DB: "cit_prod" })
        .MONGODB_DB,
    ).toBe("cit_prod");
  });
});
