/**
 * Request bodies of the /api/auth/* routes: the one set of rules and limits the server
 * enforces. Client forms should validate with these same schemas (`safeParse` and show the
 * first issue). Response shapes are documented on each route.
 */
import { z } from "zod";

import { Role } from "./enums";

/** Display labels the CIT Nexus forms and role pages use for each `Role`. */
export const RoleLabel = z.enum([
  "Admin",
  "Department Coordinator",
  "Faculty",
  "Club Representative",
]);
export type RoleLabel = z.infer<typeof RoleLabel>;

export const ROLE_LABEL: Readonly<Record<Role, RoleLabel>> = {
  admin: "Admin",
  department_coordinator: "Department Coordinator",
  faculty: "Faculty",
  club: "Club Representative",
};

/** `"club"` or `"Club Representative"` → `"club"`; anything else → null. */
export function roleFromInput(value: string): Role | null {
  const role = Role.safeParse(value);
  if (role.success) return role.data;
  const label = RoleLabel.safeParse(value);
  if (!label.success) return null;
  const entry = Object.entries(ROLE_LABEL).find(([, l]) => l === label.data);
  return entry ? (entry[0] as Role) : null;
}

/**
 * Roles `/signup` creates. Others parse (so the API can answer a clear 403) but are refused:
 * staff are provisioned, and a faculty login must be linked to its `faculty_id`.
 */
export const SELF_SERVICE_ROLES: readonly Role[] = ["club"];

export const AUTH_LIMITS = {
  emailMax: 254,
  passwordMax: 128,
  signupPasswordMin: 8,
  nameMin: 2,
  nameMax: 80,
  roleMax: 64,
} as const;

/** Trimmed, lower-cased, at most 254 characters. */
export const AuthEmail = z
  .string({ error: "Please enter a valid email address" })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email("Please enter a valid email address")
      .max(AUTH_LIMITS.emailMax, "Email address is too long"),
  );

/** A role value (`"club"`) or label (`"Club Representative"`), resolved to a `Role`. */
function roleInput(message: string) {
  return z
    .string({ error: message })
    .max(AUTH_LIMITS.roleMax, message)
    .transform((value, ctx) => {
      const role = roleFromInput(value);
      if (role) return role;
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    });
}

/** Sign-up password strength; sign-in only checks presence and length. */
export const NewPassword = z
  .string({ error: "Password is required" })
  .min(
    AUTH_LIMITS.signupPasswordMin,
    `Password must be at least ${AUTH_LIMITS.signupPasswordMin} characters long`,
  )
  .max(
    AUTH_LIMITS.passwordMax,
    `Password must not exceed ${AUTH_LIMITS.passwordMax} characters`,
  )
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter (A-Z)")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter (a-z)")
  .regex(/[0-9]/, "Password must contain at least one digit (0-9)")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character (!@#$%^&*...)",
  );

/** `POST /api/auth/login`. Unknown keys are ignored. */
export const LoginRequestSchema = z.object({
  email: AuthEmail,
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required")
    .max(AUTH_LIMITS.passwordMax, "Password is too long"),
});
export type LoginRequest = z.input<typeof LoginRequestSchema>;

/** `POST /api/auth/demo-login`: one of the four demo roles, by value or label. */
export const DemoLoginRequestSchema = z.object({
  role: roleInput("Choose one of the four demo roles"),
});
export type DemoLoginRequest = z.input<typeof DemoLoginRequestSchema>;

/**
 * `POST /api/auth/signup` (the CIT Nexus signup form). `role` accepts any role value or label;
 * only `SELF_SERVICE_ROLES` are created, the rest get 403 from the route.
 */
export const SignupRequestSchema = z
  .object({
    fullName: z
      .string({ error: "Full name is required" })
      .trim()
      .min(
        AUTH_LIMITS.nameMin,
        `Full name must be at least ${AUTH_LIMITS.nameMin} characters`,
      )
      .max(
        AUTH_LIMITS.nameMax,
        `Full name cannot exceed ${AUTH_LIMITS.nameMax} characters`,
      ),
    email: AuthEmail,
    role: roleInput("Please select a valid institutional role"),
    password: NewPassword,
    confirmPassword: z.string({ error: "Please confirm your password" }),
    agreedToTerms: z.literal(true, {
      error: "You must acknowledge the platform terms",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type SignupRequest = z.input<typeof SignupRequestSchema>;

/** `POST /api/auth/verify-otp`. */
export const VerifyOtpRequestSchema = z.object({
  email: AuthEmail,
  otp: z
    .string({ error: "Verification code is required" })
    .trim()
    .regex(/^\d{6}$/, "Verification code must be exactly 6 digits"),
});
export type VerifyOtpRequest = z.input<typeof VerifyOtpRequestSchema>;

/** `POST /api/auth/resend-otp`. */
export const ResendOtpRequestSchema = z.object({ email: AuthEmail });
export type ResendOtpRequest = z.input<typeof ResendOtpRequestSchema>;
