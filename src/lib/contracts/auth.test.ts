import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AUTH_LIMITS,
  DemoLoginRequestSchema,
  LoginRequestSchema,
  ResendOtpRequestSchema,
  ROLE_LABEL,
  RoleLabel,
  roleFromInput,
  SignupRequestSchema,
  VerifyOtpRequestSchema,
} from "./index";
import { Role } from "./enums";

const firstIssue = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? null : result.error.issues[0]?.message;
};

const STRONG = "Str0ng!Pass";
const signup = (overrides: Record<string, unknown> = {}) => ({
  fullName: "  Drama Club Lead ",
  email: " Lead@Example.ORG ",
  role: "Club Representative",
  password: STRONG,
  confirmPassword: STRONG,
  agreedToTerms: true,
  ...overrides,
});

describe("role labels", () => {
  it("label every Role exactly once", () => {
    expect(Object.keys(ROLE_LABEL).sort()).toEqual([...Role.options].sort());
    expect(Object.values(ROLE_LABEL).sort()).toEqual(
      [...RoleLabel.options].sort(),
    );
  });

  it("resolve values and labels, nothing else", () => {
    expect(roleFromInput("club")).toBe("club");
    expect(roleFromInput("Club Representative")).toBe("club");
    expect(roleFromInput("Department Coordinator")).toBe(
      "department_coordinator",
    );
    expect(roleFromInput("dean")).toBeNull();
    expect(roleFromInput("constructor")).toBeNull();
  });
});

describe("LoginRequestSchema", () => {
  it("normalises the email and ignores unknown keys", () => {
    expect(
      LoginRequestSchema.parse({
        email: " Admin@CIT.demo ",
        password: "x",
        remember: true,
      }),
    ).toEqual({ email: "admin@cit.demo", password: "x" });
  });

  it("applies the shared limits", () => {
    const email = `${"a".repeat(AUTH_LIMITS.emailMax - 9)}@cit.demo`;
    expect(LoginRequestSchema.safeParse({ email, password: "x" }).success).toBe(
      true,
    );
    expect(
      firstIssue(LoginRequestSchema, { email: `a${email}`, password: "x" }),
    ).toBe("Email address is too long");
    expect(
      firstIssue(LoginRequestSchema, { email: "a@cit.demo", password: "" }),
    ).toBe("Password is required");
    expect(
      firstIssue(LoginRequestSchema, {
        email: "a@cit.demo",
        password: "x".repeat(AUTH_LIMITS.passwordMax + 1),
      }),
    ).toBe("Password is too long");
  });
});

describe("SignupRequestSchema", () => {
  it("parses the CIT Nexus form and resolves the role label", () => {
    expect(SignupRequestSchema.parse(signup())).toMatchObject({
      fullName: "Drama Club Lead",
      email: "lead@example.org",
      role: "club",
    });
  });

  it("parses staff roles too, so the route can refuse them with 403", () => {
    expect(SignupRequestSchema.parse(signup({ role: "Admin" })).role).toBe(
      "admin",
    );
    expect(firstIssue(SignupRequestSchema, signup({ role: "Dean" }))).toBe(
      "Please select a valid institutional role",
    );
  });

  it("enforces password strength, length, match and terms", () => {
    const pw = (password: string) =>
      firstIssue(
        SignupRequestSchema,
        signup({ password, confirmPassword: password }),
      );
    expect(pw("Sh0rt!")).toMatch(/at least 8/);
    expect(pw("alllower1!")).toMatch(/uppercase/);
    expect(pw(`Aa1!${"x".repeat(AUTH_LIMITS.passwordMax - 3)}`)).toMatch(
      /must not exceed 128/,
    );
    expect(
      firstIssue(SignupRequestSchema, signup({ confirmPassword: "Other!1aa" })),
    ).toBe("Passwords do not match");
    expect(
      firstIssue(SignupRequestSchema, signup({ agreedToTerms: false })),
    ).toBe("You must acknowledge the platform terms");
    expect(firstIssue(SignupRequestSchema, signup({ fullName: "A" }))).toMatch(
      /at least 2/,
    );
  });
});

describe("other auth requests", () => {
  it("demo login takes a role value or label", () => {
    expect(DemoLoginRequestSchema.parse({ role: "Faculty" })).toEqual({
      role: "faculty",
    });
    expect(DemoLoginRequestSchema.safeParse({ role: "root" }).success).toBe(
      false,
    );
  });

  it("verify-otp needs exactly six digits; resend needs an email", () => {
    expect(
      VerifyOtpRequestSchema.parse({ email: "a@cit.demo", otp: " 012345 " }),
    ).toEqual({ email: "a@cit.demo", otp: "012345" });
    expect(
      firstIssue(VerifyOtpRequestSchema, {
        email: "a@cit.demo",
        otp: "12345a",
      }),
    ).toBe("Verification code must be exactly 6 digits");
    expect(ResendOtpRequestSchema.safeParse({ email: "nope" }).success).toBe(
      false,
    );
  });
});
